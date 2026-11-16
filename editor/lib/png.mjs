// PNG lesen und schreiben ohne Fremdbibliotheken.
// Ergebnis ist immer RGBA mit 8 Bit pro Kanal - exakt, ohne Farbmanagement oder
// Vormultiplikation (wichtig, damit fast unsichtbare Pixel ihre Farbe behalten).
import zlib from 'node:zlib';

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function decodePng(buf) {
  if (!buf || buf.length < 8 || !buf.subarray(0, 8).equals(SIG)) throw new Error('Keine PNG-Datei');
  let p = 8, width = 0, height = 0, depth = 0, ctype = 0, interlace = 0;
  let palette = null, trns = null;
  const idat = [];
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('latin1', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      depth = data[8]; ctype = data[9]; interlace = data[12];
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  if (!channels) throw new Error('Unbekannter PNG-Farbtyp ' + ctype);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = new Uint8Array(width * height * 4);
  const bitsPP = channels * depth;
  const bpp = Math.max(1, bitsPP >> 3);

  const passes = interlace
    ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]]
    : [[0, 0, 1, 1]];
  let off = 0;
  for (const [x0, y0, dx, dy] of passes) {
    const pw = Math.ceil((width - x0) / dx), ph = Math.ceil((height - y0) / dy);
    if (pw <= 0 || ph <= 0) continue;
    const stride = Math.ceil((pw * bitsPP) / 8);
    let prev = new Uint8Array(stride);
    for (let row = 0; row < ph; row++) {
      const f = raw[off++];
      const line = new Uint8Array(raw.subarray(off, off + stride));
      off += stride;
      unfilter(f, line, prev, bpp);
      const y = y0 + row * dy;
      for (let i = 0; i < pw; i++) {
        const x = x0 + i * dx;
        writePixel(out, (y * width + x) * 4, line, i, ctype, depth, channels, palette, trns);
      }
      prev = line;
    }
  }
  return { width, height, data: out };
}

function unfilter(f, line, prev, bpp) {
  const n = line.length;
  switch (f) {
    case 0: break;
    case 1: for (let i = bpp; i < n; i++) line[i] = (line[i] + line[i - bpp]) & 255; break;
    case 2: for (let i = 0; i < n; i++) line[i] = (line[i] + prev[i]) & 255; break;
    case 3: for (let i = 0; i < n; i++) line[i] = (line[i] + (((i >= bpp ? line[i - bpp] : 0) + prev[i]) >> 1)) & 255; break;
    case 4:
      for (let i = 0; i < n; i++) {
        const a = i >= bpp ? line[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        line[i] = (line[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
      break;
    default: throw new Error('Unbekannter PNG-Filter ' + f);
  }
}

function sample(line, index, depth) {
  if (depth === 8) return line[index];
  if (depth === 16) return line[index * 2];
  const perByte = 8 / depth;
  const byte = line[Math.floor(index / perByte)];
  const shift = 8 - depth * ((index % perByte) + 1);
  return (byte >> shift) & ((1 << depth) - 1);
}

function writePixel(out, o, line, i, ctype, depth, channels, palette, trns) {
  const scale = depth < 8 ? 255 / ((1 << depth) - 1) : 1;
  if (ctype === 3) {
    const idx = sample(line, i, depth);
    out[o] = palette[idx * 3]; out[o + 1] = palette[idx * 3 + 1]; out[o + 2] = palette[idx * 3 + 2];
    out[o + 3] = trns && idx < trns.length ? trns[idx] : 255;
    return;
  }
  const s = (c) => sample(line, i * channels + c, depth);
  if (ctype === 0) {
    const raw = s(0), g = Math.round(raw * scale);
    out[o] = out[o + 1] = out[o + 2] = g;
    let a = 255;
    if (trns && trns.length >= 2) {
      const t = trns.readUInt16BE(0);
      const cmp = depth === 16 ? (line[(i) * 2] << 8) | line[i * 2 + 1] : raw;
      if (cmp === t) a = 0;
    }
    out[o + 3] = a;
  } else if (ctype === 2) {
    out[o] = s(0); out[o + 1] = s(1); out[o + 2] = s(2);
    let a = 255;
    if (trns && trns.length >= 6) {
      const k = depth === 16 ? 256 : 1;
      if (trns.readUInt16BE(0) === out[o] * k && trns.readUInt16BE(2) === out[o + 1] * k && trns.readUInt16BE(4) === out[o + 2] * k) a = 0;
    }
    out[o + 3] = a;
  } else if (ctype === 4) {
    out[o] = out[o + 1] = out[o + 2] = s(0); out[o + 3] = s(1);
  } else {
    out[o] = s(0); out[o + 1] = s(1); out[o + 2] = s(2); out[o + 3] = s(3);
  }
}

export function encodePng({ width, height, data }) {
  const stride = width * 4;
  const rows = [];
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const line = data.subarray(y * stride, (y + 1) * stride);
    // Pro Zeile den Filter mit der kleinsten Summe nehmen (ueblicher Kniff fuer kleine Dateien).
    let best = null, bestSum = Infinity;
    for (let f = 0; f <= 4; f++) {
      const enc = new Uint8Array(stride + 1);
      enc[0] = f;
      let sum = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= 4 ? line[i - 4] : 0, b = prev[i], c = i >= 4 ? prev[i - 4] : 0;
        let pred = 0;
        if (f === 1) pred = a; else if (f === 2) pred = b; else if (f === 3) pred = (a + b) >> 1;
        else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
        const v = (line[i] - pred) & 255;
        enc[i + 1] = v;
        sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) { bestSum = sum; best = enc; }
    }
    rows.push(best);
    prev = line;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idat = zlib.deflateSync(Buffer.concat(rows), { level: 9 });
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}
