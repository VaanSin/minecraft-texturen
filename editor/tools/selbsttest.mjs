// Selbsttest der Server-Bausteine: node tools/selbsttest.mjs
// Liest die Original-Jar eines gefundenen Profils und arbeitet nur in einem Temp-Ordner.
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { Store } from '../lib/store.mjs';
import { decodePng, encodePng } from '../lib/png.mjs';
import { defaultRoots, scanProfiles, findJar } from '../lib/launchers.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mct-selbsttest-'));
const roots = defaultRoots(path.join(tmp, 'data'));
let fehler = 0;
const ok = (was, bed) => { console.log((bed ? '  ok     ' : '  FEHLER ') + was); if (!bed) fehler++; };

const profiles = scanProfiles(roots);
console.log(`  ${profiles.length} Profile: ${[...new Set(profiles.map((p) => p.launcherName))].join(', ') || '-'}`);
const withJar = profiles.map((p) => ({ p, jar: findJar(roots, p.version) })).filter((x) => x.jar)
  .sort((a, b) => b.p.version.localeCompare(a.p.version, 'de', { numeric: true }));
if (!withJar.length) { console.log('Kein Profil mit Minecraft-Jar gefunden - Test übersprungen.'); process.exit(0); }
const { p, jar } = withJar[0];
console.log(`  Minecraft ${p.version} aus ${jar}`);

const inst = path.join(tmp, 'profil');
fs.mkdirSync(path.join(inst, 'resourcepacks'), { recursive: true });
const store = new Store({ instanceDir: inst, jarPath: jar, version: p.version, dataDir: path.join(tmp, 'data') });

let t0 = Date.now(), bad = [], roundtripBad = 0;
for (const rel of store.vanillaList) {
  try {
    const img = decodePng(store.vanillaBytes(rel));
    const back = decodePng(encodePng(img));
    if (back.width !== img.width || back.height !== img.height || Buffer.compare(Buffer.from(back.data), Buffer.from(img.data)) !== 0) roundtripBad++;
  } catch (e) { bad.push(rel + ': ' + e.message); }
}
console.log(`  ${store.vanillaList.length} Texturen in ${Date.now() - t0} ms, Paketformat ${JSON.stringify(store.pack)}`);
ok('alle Originale dekodierbar' + (bad.length ? ' – ' + bad.slice(0, 3).join(' | ') : ''), bad.length === 0);
ok('Kodieren+Dekodieren verlustfrei', roundtripBad === 0);

// Neues Thema mit Leerzeichen und Umlaut
const t = store.createTheme('Grüne Wiese', 'normal');
ok(`Thema angelegt: ${t.folder} (${t.key}, „${t.name}“)`, t.folder === 'Thema-Gruene Wiese' && t.key === 'gruenewiese' && t.name === 'Grüne Wiese');
ok('pack.mcmeta vorhanden', fs.existsSync(path.join(t.dir, 'pack.mcmeta')));

// Speichern: fast unsichtbares Pixel muss exakt bleiben
const rel = store.vanillaSet.has('item/diamond.png') ? 'item/diamond.png' : store.vanillaList.find((r) => r.startsWith('item/'));
const img = store.vanillaImage(rel);
const data = new Uint8Array(img.data);
data.set([0xd9, 0xff, 0xeb, 255], (1 * img.width + 1) * 4);
data.set([0x2f, 0x82, 0x16, 2], 0);
store.save(t.key, rel, { width: img.width, height: img.height, data });
const px = store.pixels(t.key, rel);
const d = Buffer.from(px.data, 'base64');
const i = (1 * px.w + 1) * 4;
ok(`gespeichertes Pixel (1,1) = #${[d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`, d[i] === 0xd9 && d[i + 1] === 0xff && d[i + 2] === 0xeb && d[i + 3] === 255);
ok('fast unsichtbares Pixel exakt (#2F8216 a2)', d[0] === 0x2f && d[1] === 0x82 && d[2] === 0x16 && d[3] === 2);
ok('Liste kennt die Änderung', store.list(t.key).changed.includes(rel));

// Animierte Textur: mcmeta wird mitgeliefert
const anim = store.vanillaList.find((r) => r.startsWith('block/') && store.pixels('normal', r).mcmeta?.animation);
if (anim) ok(`Animation mitgeliefert (${anim})`, !!store.pixels('normal', anim).mcmeta?.animation);

t0 = Date.now();
const f = store.findColor(t.key, [0x2f, 0x82, 0x16], 0, '');
ok(`Farbsuche #2F8216: ${f.count} Texturen, ${f.pixels} Pixel, ${Date.now() - t0} ms`, f.count >= 1);
store.revert(t.key, rel);
ok('Zurücksetzen entfernt die Änderung', !store.list(t.key).changed.includes(rel));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(fehler ? `${fehler} Fehler` : 'Alles in Ordnung.');
process.exit(fehler ? 1 : 0);
