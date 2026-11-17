// Prueft den Zip-Schreiber gegen den eigenen Leser und gegen Windows (.NET):  node tools/zip-test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeZip, ZipReader } from '../lib/zip.mjs';

const f = path.join(os.tmpdir(), 'mct-zip-test.zip');
const big = crypto.randomBytes(300000), text = Buffer.from('hallo '.repeat(5000));
fs.writeFileSync(f, writeZip([{ name: 'a/text.txt', data: text }, { name: 'zufall.bin', data: big }, { name: 'bin/start', data: Buffer.from('#!/bin/bash\necho hi\n'), mode: 0o755 }, { name: 'ü.txt', data: Buffer.from('ä') }]));
let fehler = 0;
const ok = (was, bed) => { console.log((bed ? '  ok     ' : '  FEHLER ') + was); if (!bed) fehler++; };
const z = new ZipReader(f);
ok('Text (gepackt) zurück', z.read('a/text.txt').equals(text) && z.entries.get('a/text.txt').method === 8);
ok('Zufall (ungepackt) zurück', z.read('zufall.bin').equals(big));
ok('Umlaut im Namen', z.read('ü.txt').toString() === 'ä');
z.close();
const b = fs.readFileSync(f);
let eocd = b.length - 22; while (b.readUInt32LE(eocd) !== 0x06054b50) eocd--;
let p = b.readUInt32LE(eocd + 16), mode = null;
for (let i = 0; i < 4; i++) { const nl = b.readUInt16LE(p + 28); if (b.toString('utf8', p + 46, p + 46 + nl) === 'bin/start') mode = (b.readUInt32LE(p + 38) >>> 16) & 0o777; p += 46 + nl + b.readUInt16LE(p + 30) + b.readUInt16LE(p + 32); }
ok('Unix-Rechte 755 gespeichert', mode === 0o755);
if (process.platform === 'win32') {
  const out = execFileSync('powershell', ['-NoProfile', '-Command', `Add-Type -AssemblyName System.IO.Compression.FileSystem; $z=[IO.Compression.ZipFile]::OpenRead('${f}'); ($z.Entries | % { $_.FullName + '=' + $_.Length }) -join ';'; $z.Dispose()`], { encoding: 'utf8' }).trim();
  ok('Windows liest alle Einträge: ' + out, out.split(';').length === 4 && out.includes('a/text.txt=30000'));
}
fs.rmSync(f);
console.log(fehler ? `${fehler} Fehler` : 'Alles in Ordnung.');
process.exit(fehler ? 1 : 0);
