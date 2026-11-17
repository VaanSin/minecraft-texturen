// Prueft die Textur-KI ohne Browser: Verstehen von Beispielsaetzen + Malen.  node --no-warnings tools/ki-test.mjs
import { parsePrompt, render, playerPreview, paletteFromImage, pixelate } from '../public/ki.js';
import { ZipReader } from '../lib/zip.mjs';
import { decodePng } from '../lib/png.mjs';
import { defaultRoots, scanProfiles, findJar } from '../lib/launchers.mjs';
import os from 'node:os';

const roots = defaultRoots(os.tmpdir());
const versions = [...new Set(scanProfiles(roots).map((p) => p.version))].filter((v) => findJar(roots, v) && /^2\d\./.test(v)).sort((a, b) => a.localeCompare(b, 'de', { numeric: true }));
if (!versions.length) { console.log('Keine Minecraft-26.x-Version gefunden - Test übersprungen.'); process.exit(0); }
const z = new ZipReader(findJar(roots, versions.pop()));
const avail = new Set(z.names().filter((n) => n.startsWith('assets/minecraft/textures/') && n.endsWith('.png')).map((n) => n.slice(26)));
const img = (p) => { const d = decodePng(z.read('assets/minecraft/textures/' + p)); return { w: d.width, h: d.height, data: new Uint8ClampedArray(d.data) }; };
let fehler = 0;
const ok = (was, bed, extra = '') => { console.log((bed ? '  ok     ' : '  FEHLER ') + was + (extra ? '  ' + extra : '')); if (!bed) fehler++; };

const cases = [
  ['Spiderman Rüstung was eine Kupfer Rüstung sein soll', 'Spider-Man', (t) => t.includes('entity/equipment/humanoid/copper.png') && t.includes('item/copper_boots.png')],
  ['Iron Man Rüstung', 'Iron Man', (t) => t.includes('entity/equipment/humanoid/iron.png')],
  ['blaues Feuer Schwert', 'Feuer in blau', (t) => t.length === 1 && t[0].endsWith('_sword.png')],
  ['goldene spitzhacke mit sternen', 'Original mit Muster', (t) => t[0] === 'item/golden_pickaxe.png'],
  ['Lava Stein', 'Lava', (t) => t[0] === 'block/stone.png'],
  ['Galaxie Hotbar', 'Galaxie', (t) => t.includes('gui/sprites/hud/hotbar.png')],
  ['Creeper Helm aus Diamant', 'Creeper', (t) => t.length === 2 && t.includes('item/diamond_helmet.png')],
  ['Werkzeuge aus Eisen im Ninja-Stil', 'Ninja', (t) => t.length === 5],
];
for (const [text, styleName, check] of cases) {
  const p = parsePrompt(text, avail, null);
  ok(`„${text}“ -> ${p.style?.name} / ${p.targetName}`, p.style?.name === styleName && check(p.targets), JSON.stringify(p.targets.slice(0, 3)));
  const src = new Map(p.targets.map((x) => [x, img(x)]));
  const res = render(p, src, new Set(), { seed: 1 });
  const changed = res.every((r) => { const o = src.get(r.path).data; return r.data.length === o.length && r.data.some((v, i) => v !== o[i]); });
  ok('   gemalt und verändert', res.length === p.targets.length && changed);
}
// Spieler-Vorschau und Bild-Werkzeuge
const p = parsePrompt('Batman Rüstung', avail, null);
const res = render(p, new Map(p.targets.map((x) => [x, img(x)])), new Set(), { seed: 2 });
const pv = playerPreview(img('entity/player/wide/steve.png'), res.find((r) => /humanoid\//.test(r.path)), res.find((r) => /leggings\//.test(r.path)));
ok('Spieler-Vorschau 36x32 gefüllt', pv.w === 36 && pv.h === 32 && pv.data.filter((v, i) => i % 4 === 3 && v).length > 500);
const pic = { width: 40, height: 40, data: new Uint8ClampedArray(40 * 40 * 4) };
for (let i = 0; i < pic.data.length; i += 4) { const y = Math.floor(i / 4 / 40); pic.data.set(y < 20 ? [210, 30, 40, 255] : [30, 60, 150, 255], i); }
const pal = paletteFromImage(pic);
ok('Bildfarben gefunden (rot + blau)', pal.length >= 2 && pal.some((c) => c.color[0] > 180) && pal.some((c) => c.color[2] > 120));
const px = pixelate(pic, 8, 8, pal.map((c) => c.color));
ok('Bild auf 8x8 verkleinert', px.w === 8 && px.data[3] === 255 && px.data[(7 * 8) * 4 + 2] > 100);
z.close();
console.log(fehler ? `${fehler} Fehler` : 'Alles in Ordnung.');
process.exit(fehler ? 1 : 0);
