// Prueft die Textur-KI ohne Browser: Verstehen von Beispielsaetzen + Malen.  node --no-warnings tools/ki-test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parsePrompt, render, playerPreview, paletteFromImage, pixelate, drafts, foreground, selectDrafts, draftDistance, generateSkinDrafts } from '../public/ki.js';
import { skinFaces, blankSkin, launcherSkin, skinFront, changeSkinModel, expandLegacySkin } from '../public/skin.js';
import { toSheet, sheetLayouts, framesFromSheet, visibleBounds } from '../public/animation.js';
import { wantsParticleWizard, parseMotionPrompt, motionDrafts } from '../public/motion.js';
import { ZipReader } from '../lib/zip.mjs';
import { decodePng } from '../lib/png.mjs';
import { defaultRoots, scanProfiles, findJar } from '../lib/launchers.mjs';
import os from 'node:os';

// Die Partikel- und Animations-KI braucht keine Dateien aus dem Minecraft-Profil.
{
  const prompt = 'Rauchpartikel: blaue Streifen drehen sich gegen den Uhrzeigersinn, 16 Bilder, 3 Ticks in 32x32';
  const plan = parseMotionPrompt(prompt);
  assert.ok(wantsParticleWizard(prompt));
  assert.ok(wantsParticleWizard('Partikelanimation mit Wirbeln'));
  assert.equal(parseMotionPrompt('Dreh das Bild').explicitEffect, true);
  assert.deepEqual([plan.shape, plan.effect, plan.dir, plan.size, plan.frames, plan.ticks], ['stripes', 'rotate', 'left', 32, 16, 3]);
  assert.ok(plan.palette.every(([r, g, b]) => b > r && b > g));
  const config = { plan, effect: plan.effect, dir: plan.dir, size: plan.size, images: plan.frames, ticks: plan.ticks };
  const generated = motionDrafts(config);
  const signature = (data) => Buffer.from(data).toString('base64');
  assert.equal(new Set(generated.map((d) => signature(d.frames[0]))).size, 3);
  for (const draft of generated) {
    assert.equal(draft.frames.length, 16);
    assert.ok(draft.changes);
    assert.ok(draft.frames.every((f) => visibleBounds(f, 32, 32)));
    assert.ok(new Set(draft.frames.map(signature)).size >= 8);
  }
  const data = new Uint8ClampedArray(15 * 11 * 4);
  for (let x = 4; x < 10; x++) data.set(x === 9 ? [55, 80, 255, 255] : [210, 50, 100, 200], (5 * 15 + x) * 4);
  const source = { name: 'Eigener Streifen', w: 15, h: 11, data };
  const [left] = motionDrafts({ ...config, source });
  const [right] = motionDrafts({ ...config, source, dir: 'right' });
  assert.deepEqual(left.frames[0], data);
  assert.equal(left.frames[0].length, 15 * 11 * 4);
  assert.notDeepEqual(left.frames[4], right.frames[4]);
  assert.ok(left.frames.every((f) => visibleBounds(f, 15, 11)));
  assert.throws(() => motionDrafts({ ...config, source: { ...source, data: new Uint8ClampedArray(data.length) } }), /keine sichtbaren Pixel/);
  console.log('  ok     Partikel-Entwürfe, Rotationsrichtung und unverändertes Startbild');
}

// Skins funktionieren auch ohne installierte Minecraft-Version.
const { models } = JSON.parse(fs.readFileSync(new URL('../public/models.json', import.meta.url), 'utf8'));
for (const model of ['classic', 'slim']) {
  const key = model === 'slim' ? 'minecraft:player_slim#main' : 'minecraft:player#main';
  const rect = (a) => {
    const u = [3, 8, 13, 18].map((i) => Math.round(a[i] * 64));
    const v = [4, 9, 14, 19].map((i) => Math.round(a[i] * 64));
    return [Math.min(...u), Math.min(...v), Math.max(...u) - Math.min(...u), Math.max(...v) - Math.min(...v)].join(',');
  };
  const expected = Object.values(models[key].root.c).flatMap((group) => [
    ...group.q, ...Object.values(group.c).flatMap((g) => g.q),
  ]).map(rect).sort();
  const faces = skinFaces(model);
  assert.deepEqual(faces.map((f) => [f.x, f.y, f.w, f.h].join(',')).sort(), expected);
  const d = blankSkin(model);
  assert.equal(d.length, 64 * 64 * 4);
  const alphaAt = (x, y) => d[(y * 64 + x) * 4 + 3];
  for (const f of faces) assert.equal(alphaAt(f.x, f.y), f.layer ? 0 : 255);
  const plan = parsePrompt('blauer Hoodie mit Stern', new Set());
  plan.animate = 'pulse';
  const variations = generateSkinDrafts(plan, model);
  assert.equal(variations.length, 3);
  assert.equal(new Set(variations.map((draft) => Buffer.from(skinFront(draft.data, model).data).toString('base64'))).size, 3);
  for (const draft of variations) {
    assert.deepEqual(draft.data, launcherSkin(draft.data, model));
    assert.equal(draft.animation.frames.length, 10);
  }
}
assert.deepEqual(changeSkinModel(blankSkin('classic'), 'classic', 'slim'), blankSkin('slim'));
assert.deepEqual(expandLegacySkin(blankSkin('classic').slice(0, 64 * 32 * 4)), blankSkin('classic'));
console.log('  ok     Java-Skins: UV-Koordinaten, PNG-Basis, Modelle und KI-Animation');

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
  for (const prompt of ['blaues Feuer Schwert', 'Lava Stein', 'Spiderman Rüstung als Kupferrüstung', 'Pixelbild von einem Drachen']) {
    const plan = parsePrompt(prompt, avail, null);
    const entries = await drafts(plan, new Map(plan.targets.map((x) => [x, img(x)])), new Set(), { seed: 1 }, 6);
    const best = selectDrafts(entries);
    ok(`Drei sichtbar unterschiedliche Textur-Entwürfe für „${prompt}“`, best.length === 3
      && best.every((a, i) => best.slice(i + 1).every((b) => draftDistance(a, b) >= 0.045)));
    assert.equal(selectDrafts([entries[0], entries[0], entries[0]]).length, 1);
  }
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
