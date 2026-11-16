// Erzeugt das Programm-Symbol (public/icon.png, icon.ico) als Pixel-Art: node tools/icon.mjs
import fs from 'node:fs';
import { encodePng } from '../lib/png.mjs';

const N = 16; // Entwurf in 16x16, danach hochskaliert
const P = { '.': null, k: [20, 14, 40], w: [255, 255, 255], y: [255, 225, 77], o: [255, 154, 60], p: [255, 79, 216], v: [143, 107, 255], c: [60, 200, 255], g: [92, 255, 122], d: [47, 130, 22], l: [79, 255, 35], b: [120, 72, 40], s: [200, 200, 220] };
// Ein bunter Pixel-Block mit Pinsel
const ART = [
  '..kkkkkkkkkkkk..',
  '.kppppooooyyyyk.',
  'kppppooooyyyyggk',
  'kppppooooyyyyggk',
  'kvvvvwwppyyggggk',
  'kvvvvwwppyyggggk',
  'kvvvvccccggggddk',
  'kvvvvccccggggddk',
  'kccccccccllllddk',
  'kccccccccllllddk',
  'kccccvvvvllllddk',
  'kccccvvvvllll.kk',
  '.kccccvvvvll.ksk',
  '..kkkkkkkkk.kssk',
  '...........kbbk.',
  '..........kbbk..',
];

function render(size) {
  const data = new Uint8Array(size * size * 4);
  const f = size / N;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const ch = ART[Math.floor(y / f)][Math.floor(x / f)];
    const c = P[ch];
    if (!c) continue;
    const i = (y * size + x) * 4;
    // leichter Glanz oben links
    const shine = (x + y) / (2 * size) < 0.25 && ch !== 'k' ? 30 : 0;
    data[i] = Math.min(255, c[0] + shine); data[i + 1] = Math.min(255, c[1] + shine); data[i + 2] = Math.min(255, c[2] + shine); data[i + 3] = 255;
  }
  return encodePng({ width: size, height: size, data });
}

fs.writeFileSync(new URL('../public/icon.png', import.meta.url), render(128));
// ICO mit PNG-Inhalt (ab Windows Vista erlaubt)
const sizes = [16, 32, 48, 256];
const pngs = sizes.map(render);
const head = Buffer.alloc(6 + 16 * sizes.length);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
let off = head.length;
sizes.forEach((s, i) => {
  const e = 6 + i * 16;
  head[e] = s === 256 ? 0 : s; head[e + 1] = s === 256 ? 0 : s; head[e + 2] = 0; head[e + 3] = 0;
  head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(pngs[i].length, e + 8); head.writeUInt32LE(off, e + 12);
  off += pngs[i].length;
});
fs.writeFileSync(new URL('../public/icon.ico', import.meta.url), Buffer.concat([head, ...pngs]));
console.log('icon.png und icon.ico geschrieben');
