// KI aus Textur-Teilen: Leiste erkennen, Bewegung aus dem Text, Schleife ohne Sprung, Rand bleibt.
//   node tools/teile-test.mjs [--bild ordner]   (--bild: Vorschau-PNGs mit allen Einzelbildern schreiben)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { analyzePiece, rampFrom, pieceMotionFromText, pieceDrafts, pieceAnimation, PIECE_MOTIONS } from '../public/teile.js';
import { ZipReader } from '../lib/zip.mjs';
import { decodePng, encodePng } from '../lib/png.mjs';

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok     ' : '  FEHLER ') + m); if (!c) fails++; };

// 6-Pixel-Leiste von Rot nach Orange
const strip = { w: 6, h: 1, data: new Uint8ClampedArray(rampFrom([255, 0, 0], [255, 165, 0], 6).flat()) };
const a = analyzePiece(strip, 'leiste');
ok(a.kind === 'ramp' && a.colors.length === 6, 'Leiste 6×1 = Farbverlauf mit 6 Farben');
ok(a.colors[0][1] === 0 && a.colors[5][1] === 165, 'Reihenfolge Rot → Orange bleibt');
const tall = analyzePiece({ w: 1, h: 4, data: new Uint8ClampedArray([0, 0, 255, 255, 0, 0, 255, 255, 0, 255, 0, 255, 255, 255, 255, 255]) });
ok(tall.kind === 'ramp' && tall.colors.length === 3, 'senkrechte Leiste, doppelte Farbe zusammengefasst');
const dot = new Uint8ClampedArray(5 * 5 * 4); dot.set([255, 255, 255, 255], (2 * 5 + 2) * 4); dot.set([255, 255, 0, 255], (1 * 5 + 2) * 4);
const sp = analyzePiece({ w: 5, h: 5, data: dot });
ok(sp.kind === 'sprite' && sp.w === 1 && sp.h === 2, 'kleines Motiv wird zugeschnitten');

for (const [t, want] of [['Die Enderperle soll wirbeln', 'swirl'], ['XP-Leiste mit Lauflicht', 'cycle'], ['Schwert soll flackern wie Feuer', 'flicker'], ['Totem glitzert', 'sparkle'], ['leuchtet und pulsiert', 'pulse'], ['Blasen steigen auf', 'rise'], ['Glanz läuft drüber', 'shimmer'], ['einfach so', null]]) {
  ok(pieceMotionFromText(t) === want, `„${t}“ → ${want}`);
}

// Zieltextur: echte Enderperle, sonst ein Kreis
let base;
const jar = path.join(os.homedir(), 'curseforge', 'minecraft', 'Install', 'versions', '26.2', '26.2.jar');
if (fs.existsSync(jar)) { const z = new ZipReader(jar); const im = decodePng(z.read('assets/minecraft/textures/item/ender_pearl.png')); base = { w: im.width, h: im.height, data: new Uint8ClampedArray(im.data) }; }
else {
  base = { w: 16, h: 16, data: new Uint8ClampedArray(16 * 16 * 4) };
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (Math.hypot(x - 7.5, y - 7.5) < 6) base.data.set([20, 90, 80, 255], (y * 16 + x) * 4);
}
const edgeIdx = [];
for (let y = 0; y < base.h; y++) for (let x = 0; x < base.w; x++) {
  const o = (X, Y) => X >= 0 && Y >= 0 && X < base.w && Y < base.h && base.data[(Y * base.w + X) * 4 + 3] >= 30;
  if (o(x, y) && (!o(x - 1, y) || !o(x + 1, y) || !o(x, y - 1) || !o(x, y + 1))) edgeIdx.push((y * base.w + x) * 4);
}

const out = process.argv.includes('--bild') ? process.argv[process.argv.indexOf('--bild') + 1] : null;
if (out) fs.mkdirSync(out, { recursive: true });
for (const m of PIECE_MOTIONS) {
  const drafts = pieceDrafts({ base, pieces: [a], motion: m.id });
  ok(drafts.length === 3 && drafts.every((d) => d.frames.length === m.frames && d.changes), `${m.name}: 3 Entwürfe, ${m.frames} Bilder, bewegt sich`);
  const f = drafts[0].frames;
  ok(f.every((fr) => fr.every((v, i) => (i % 4 === 3 ? v === base.data[i] : true))), `${m.name}: Durchsichtigkeit bleibt wie im Original`);
  if (m.id !== 'sparkle' && m.id !== 'rise') ok(edgeIdx.every((i) => f.every((fr) => fr[i] === base.data[i] && fr[i + 1] === base.data[i + 1])), `${m.name}: Umriss bleibt (Entwurf 1)`);
  // Schleife: Unterschied letztes→erstes Bild nicht viel groesser als zwischen Nachbarbildern
  const diff = (p, q) => p.reduce((s, v, i) => s + Math.abs(v - q[i]), 0);
  const step = diff(f[0], f[1]), wrap = diff(f[f.length - 1], f[0]);
  ok(wrap <= step * 2.5 + 2000, `${m.name}: Schleife ohne großen Sprung (${wrap} vs. ${step})`);
  if (m.id === 'swirl' || m.id === 'cycle') {
    const reds = f[3].filter((v, i) => i % 4 === 0 && f[3][i + 3] >= 30 && v > 200).length;
    ok(reds > 10, `${m.name}: nutzt die Leisten-Farben (${reds} rote Pixel)`);
  }
  if (out) {
    // alle drei Entwuerfe nebeneinander, Bilder untereinander, 4× vergroessert
    const S = 4, W = base.w * 3 + 2, H = base.h * f.length;
    const img = new Uint8ClampedArray(W * S * H * S * 4);
    drafts.forEach((d, di) => d.frames.forEach((fr, k) => {
      for (let y = 0; y < base.h; y++) for (let x = 0; x < base.w; x++) {
        const src = (y * base.w + x) * 4;
        for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) {
          const X = (di * (base.w + 1) + x) * S + xx, Y = (k * base.h + y) * S + yy;
          img.set(fr.subarray(src, src + 4), (Y * W * S + X) * 4);
        }
      }
    }));
    fs.writeFileSync(path.join(out, `teile-${m.id}.png`), encodePng({ width: W * S, height: H * S, data: img }));
  }
}
const fr = pieceAnimation({ base, ramp: null, sprite: sp, motion: 'sparkle', frames: 8 });
ok(fr.length === 8, 'Ohne Leiste: Farben aus der Textur, Motiv funkelt');
console.log(fails ? `\n${fails} Fehler` : '\nAlles in Ordnung.');
process.exit(fails ? 1 : 0);
