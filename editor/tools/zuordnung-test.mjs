// Zeigt, welches Modell jede Entity-Textur bekommt: node tools/zuordnung-test.mjs
import os from 'node:os';
import fs from 'node:fs';
import { ZipReader } from '../lib/zip.mjs';
import { defaultRoots, scanProfiles, findJar } from '../lib/launchers.mjs';
import { decodePng } from '../lib/png.mjs';
import { guessModels } from '../public/modelmatch.js';
const models = JSON.parse(fs.readFileSync(new URL('../public/models.json', import.meta.url), 'utf8')).models;
// neueste gefundene Minecraft-Version (oder: node tools/zuordnung-test.mjs <filter> mit MCT_VERSION=26.2)
const roots = defaultRoots(os.tmpdir());
const versions = [...new Set(scanProfiles(roots).map((p) => p.version))].filter((v) => findJar(roots, v)).sort((a, b) => a.localeCompare(b, 'de', { numeric: true }));
const z = new ZipReader(findJar(roots, process.env.MCT_VERSION || versions.pop()));
const rels = z.names().filter((n) => n.startsWith('assets/minecraft/textures/entity/') && n.endsWith('.png')).map((n) => n.slice(26));
let withModel = 0;
const lines = [];
for (const rel of rels) {
  const img = decodePng(z.read('assets/minecraft/textures/' + rel));
  const m = guessModels(rel, models, img.width, img.height);
  if (m) withModel++;
  lines.push(`${rel.padEnd(58)} ${m ? m.map((k) => k.replace('minecraft:', '')).join(' + ') : '-'}`);
}
const filter = process.argv[2];
console.log(lines.filter((l) => !filter || l.includes(filter)).join('\n'));
console.log(`${withModel} von ${rels.length} Entity-Texturen haben ein 3D-Modell`);
