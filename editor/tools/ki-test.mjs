// Prueft die Textur-KI ohne Browser: Verstehen von Beispielsaetzen + Malen.  node --no-warnings tools/ki-test.mjs
import { parsePrompt, render, playerPreview, paletteFromImage, pixelate, drafts, foreground } from '../public/ki.js';
import { toSheet, sheetLayouts, framesFromSheet } from '../public/animation.js';
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
// Neue Faehigkeiten: XP-Kugeln, Brennen (Animation), Motive, Pixelbild, Tippfehler, Entwuerfe
{
  const xp = parsePrompt('XP Kugeln im Galaxie Stil', avail, null);
  ok('XP-Kugeln erkannt', xp.targets.some((p) => /experience_orb/.test(p)) && xp.style?.name === 'Galaxie');
  const burn = parsePrompt('brennendes Diamantschwerd', avail, null);
  ok('Tippfehler im Wortteil + Brennen', burn.animate === 'burn' && burn.targets[0] === 'item/diamond_sword.png' && burn.fixes.length === 1, burn.fixes.join(','));
  const rb = render(burn, new Map([[burn.targets[0], img(burn.targets[0])]]), new Set(), { seed: 1 })[0];
  ok('Brennendes Schwert: 12 Bilder + Takt', rb.h === 16 * 12 && rb.frameH === 16 && rb.anim?.frametime === 2);
  // Flammen erscheinen ausserhalb des Schwerts (vorher durchsichtige Pixel)
  const o = img('item/diamond_sword.png').data;
  let flames = 0; for (let i = 0; i < o.length; i += 4) if (!o[i + 3] && rb.data[i + 3]) flames++;
  ok('Flammen um das Schwert herum', flames > 3, `${flames} Pixel`);
  const mot = parsePrompt('Diamantschwerter mit Totenkopf', avail, null);
  ok('Motiv „mit Totenkopf“ erkannt', mot.motif === 'totenkopf' && mot.targets[0] === 'item/diamond_sword.png');
  const pic = parsePrompt('Pixelbild von einem Drachen', avail, null);
  const rp = render(pic, new Map(pic.targets.map((x) => [x, img(x)])), new Set(), { seed: 1 })[0];
  ok('Pixelbild: Gemälde voll bemalt', pic.picture && pic.motif === 'drache' && rp.data.every((v, i) => i % 4 !== 3 || v === 255));
  const ds = await drafts(parsePrompt('Spiderman Rüstung als Kupferrüstung', avail, null), new Map(parsePrompt('Spiderman Rüstung als Kupferrüstung', avail, null).targets.map((x) => [x, img(x)])), new Set(), { seed: 1 }, 6);
  ok('6 Entwürfe, nach Punkten sortiert', ds.length === 6 && ds.every((d, i) => i === 0 || ds[i - 1].score >= d.score), ds.map((d) => Math.round(d.score * 100)).join(','));
}
// Aufloesung und Sprite-Sheets
{
  const p32 = parsePrompt('brennendes Schwert in 32x32', avail, null);
  const r32 = render(p32, new Map(p32.targets.map((x) => [x, img(x)])), new Set(), { seed: 1 })[0];
  ok('„32x32“: Schwert in 32×32, 12 Bilder', p32.size === 32 && r32.w === 32 && r32.frameH === 32 && r32.h === 32 * 12);
  const hd = parsePrompt('Spiderman Rüstung als Kupferrüstung in HD', avail, null);
  const rhd = render(hd, new Map(hd.targets.map((x) => [x, img(x)])), new Set(), { seed: 1 });
  ok('„HD“: Rüstung 128×64, Symbole 32×32', hd.scale === 2 && rhd.find((r) => /humanoid\//.test(r.path)).w === 128 && rhd.find((r) => /helmet/.test(r.path)).w === 32);
  const gui = parsePrompt('Galaxie Hotbar 4x', avail, null);
  ok('GUI bleibt in Originalgröße', render(gui, new Map(gui.targets.map((x) => [x, img(x)])), new Set(), { seed: 1 })[0].w === 182);
  const frames = [0, 1, 2, 3, 4].map((k) => new Uint8ClampedArray(16 * 16 * 4).fill(k * 40 + 10));
  const sh = toSheet(frames, 16, 16);
  const lay = sheetLayouts(sh.w, sh.h, 16, 16)[0];
  const back = framesFromSheet({ width: sh.w, height: sh.h, data: sh.data }, lay);
  ok('Sprite-Sheet hin und zurück (5 Bilder)', back.length === 5 && back.every((f, k) => f[0] === k * 40 + 10), `${sh.w}×${sh.h}, Raster ${lay.cols}×${lay.rows}`);
}
// Bild mit Hintergrund freistellen: weisser Rand weg, Motiv zugeschnitten
{
  const W = 60, pic = { width: W, height: W, data: new Uint8ClampedArray(W * W * 4) };
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) pic.data.set(x >= 20 && x < 40 && y >= 15 && y < 45 ? (y < 30 ? [210, 30, 40, 255] : [30, 60, 150, 255]) : [250, 250, 250, 255], (y * W + x) * 4);
  const fg = foreground(pic);
  ok('Hintergrund erkannt', fg[0] === 0 && fg[30 * W + 30] === 1);
  const pal = paletteFromImage(pic);
  ok('Palette ohne Hintergrund-Weiß', pal.every((c) => !(c.color[0] > 240 && c.color[1] > 240)));
  const px = pixelate(pic, 16, 16, pal.map((c) => c.color), { outline: true });
  const cnt = (f) => { let n = 0; for (let i = 0; i < px.data.length; i += 4) if (f(i)) n++; return n; };
  ok('Motiv füllt die Höhe (zugeschnitten)', px.data[(0 * 16 + 8) * 4 + 3] === 255 && px.data[(15 * 16 + 8) * 4 + 3] === 255);
  ok('Kontur außen herum (dunkler als das Motiv)', cnt((i) => px.data[i + 3] && (0.299 * px.data[i] + 0.587 * px.data[i + 1] + 0.114 * px.data[i + 2]) < 50) > 0);
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
