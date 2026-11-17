// Minimaler Zip-Leser fuer das Minecraft-Jar (Methoden "stored" und "deflate") und ein kleiner Zip-Schreiber fuer Themen.
import fs from 'node:fs';
import zlib from 'node:zlib';

export class ZipReader {
  constructor(file) {
    this.file = file;
    this.fd = fs.openSync(file, 'r');
    this.entries = new Map();
    this.#readCentralDirectory();
  }

  #readCentralDirectory() {
    const size = fs.fstatSync(this.fd).size;
    const tailLen = Math.min(size, 65557 + 20);
    const tail = Buffer.alloc(tailLen);
    fs.readSync(this.fd, tail, 0, tailLen, size - tailLen);
    let eocd = -1;
    for (let i = tailLen - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Kein gueltiges Zip/Jar: ' + this.file);
    let count = tail.readUInt16LE(eocd + 10);
    let cdSize = tail.readUInt32LE(eocd + 12);
    let cdOffset = tail.readUInt32LE(eocd + 16);
    // Zip64 (sehr viele Eintraege)
    if (count === 0xffff || cdOffset === 0xffffffff) {
      const loc = eocd - 20;
      if (loc >= 0 && tail.readUInt32LE(loc) === 0x07064b50) {
        const z64off = Number(tail.readBigUInt64LE(loc + 8));
        const z = Buffer.alloc(56);
        fs.readSync(this.fd, z, 0, 56, z64off);
        count = Number(z.readBigUInt64LE(32));
        cdSize = Number(z.readBigUInt64LE(40));
        cdOffset = Number(z.readBigUInt64LE(48));
      }
    }
    const cd = Buffer.alloc(cdSize);
    fs.readSync(this.fd, cd, 0, cdSize, cdOffset);
    let p = 0;
    for (let i = 0; i < count && p + 46 <= cd.length; i++) {
      if (cd.readUInt32LE(p) !== 0x02014b50) break;
      const method = cd.readUInt16LE(p + 10);
      const compSize = cd.readUInt32LE(p + 20);
      const size = cd.readUInt32LE(p + 24);
      const nameLen = cd.readUInt16LE(p + 28);
      const extraLen = cd.readUInt16LE(p + 30);
      const commentLen = cd.readUInt16LE(p + 32);
      const localOffset = cd.readUInt32LE(p + 42);
      const name = cd.toString('utf8', p + 46, p + 46 + nameLen);
      this.entries.set(name, { method, compSize, size, localOffset });
      p += 46 + nameLen + extraLen + commentLen;
    }
  }

  has(name) { return this.entries.has(name); }

  read(name) {
    const e = this.entries.get(name);
    if (!e) return null;
    const lh = Buffer.alloc(30);
    fs.readSync(this.fd, lh, 0, 30, e.localOffset);
    const start = e.localOffset + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
    const data = Buffer.alloc(e.compSize);
    fs.readSync(this.fd, data, 0, e.compSize, start);
    if (e.method === 0) return data;
    if (e.method === 8) return zlib.inflateRawSync(data);
    throw new Error('Unbekannte Zip-Methode ' + e.method + ' bei ' + name);
  }

  names() { return [...this.entries.keys()]; }

  /** Datei wieder freigeben (sonst bleibt sie unter Windows gesperrt). */
  close() { try { fs.closeSync(this.fd); } catch { /* schon zu */ } }

  /** Wie read(), aber mit Groessengrenze (fuer Zips aus dem Internet). */
  readLimited(name, max) {
    const e = this.entries.get(name);
    if (!e) return null;
    if (e.size > max || e.compSize > max) throw new Error('Datei zu gross: ' + name);
    const lh = Buffer.alloc(30);
    fs.readSync(this.fd, lh, 0, 30, e.localOffset);
    const start = e.localOffset + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
    const data = Buffer.alloc(e.compSize);
    fs.readSync(this.fd, data, 0, e.compSize, start);
    if (e.method === 0) return data;
    if (e.method === 8) return zlib.inflateRawSync(data, { maxOutputLength: max });
    throw new Error('Unbekannte Zip-Methode ' + e.method + ' bei ' + name);
  }
}

/** Zip aus [{ name, data, mode? }] bauen (deflate). mode = Unix-Rechte, z. B. 0o755 fuer ausfuehrbare Dateien (Mac/Linux). */
export function writeZip(entries) {
  const parts = [], central = [];
  let offset = 0;
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const { name, data, mode } of entries) {
    const raw = Buffer.from(data);
    const comp = zlib.deflateRawSync(raw, { level: 9 });
    const useComp = comp.length < raw.length;
    const body = useComp ? comp : raw;
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = zlib.crc32(raw) >>> 0;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(useComp ? 8 : 0, 8);
    lh.writeUInt16LE(time, 10); lh.writeUInt16LE(date, 12); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28);
    parts.push(lh, nameBuf, body);
    const ch = Buffer.alloc(46);
    // Version 4: "erstellt unter Unix" (3), damit Mac/Linux die Rechte uebernehmen
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(mode ? (3 << 8) | 20 : 20, 4);
    ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(useComp ? 8 : 0, 10);
    ch.writeUInt16LE(time, 12); ch.writeUInt16LE(date, 14); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nameBuf.length, 28);
    if (mode) ch.writeUInt32LE(((0o100000 | mode) << 16) >>> 0, 38); // reguläre Datei + Rechte
    ch.writeUInt32LE(offset, 42);
    central.push(ch, nameBuf);
    offset += 30 + nameBuf.length + body.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}
