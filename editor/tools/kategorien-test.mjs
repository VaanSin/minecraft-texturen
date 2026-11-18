// Prueft die Unterkategorien mit echten Pfaden (Liste aus einem Jar oder einem laufenden Testserver).
//   node tools/kategorien-test.mjs [liste.json]   (ohne Datei: 26.2-Jar aus CurseForge)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { groupsFor, enchantGroups, variantInfo } from '../public/kategorien.js';
import { ZipReader } from '../lib/zip.mjs';

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok     ' : '  FEHLER ') + m); if (!c) fails++; };
let list;
if (process.argv[2]) list = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).textures;
else {
  const jar = path.join(os.homedir(), 'curseforge', 'minecraft', 'Install', 'versions', '26.2', '26.2.jar');
  if (!fs.existsSync(jar)) { console.log('kein Jar'); process.exit(0); }
  const z = new ZipReader(jar);
  list = z.names().filter((n) => n.startsWith('assets/minecraft/textures/') && n.endsWith('.png')).map((n) => n.slice(26));
}
const cat = (re) => list.filter((p) => re.test(p));
const where = (groups, p) => groups.find((g) => g.paths.includes(p))?.id;

const blocks = groupsFor('block', cat(/^blocks?\//));
const B = (n) => where(blocks, 'block/' + n + '.png');
console.log('Blöcke:', blocks.map((g) => `${g.name} ${g.paths.length}`).join(' · '));
for (const [n, want] of [['diamond_ore', 'erze'], ['deepslate_iron_ore', 'erze'], ['oak_log', 'holz'], ['oak_planks', 'holz'], ['oak_leaves', 'pflanzen'], ['stone', 'stein'], ['stone_bricks', 'stein'],
  ['sandstone', 'stein'], ['sand', 'erde'], ['dirt', 'erde'], ['grass_block_top', 'erde'], ['short_grass', 'pflanzen'], ['white_wool', 'farben'], ['red_stained_glass', 'farben'],
  ['redstone_lamp', 'technik'], ['piston_top', 'technik'], ['furnace_front', 'technik'], ['netherrack', 'nether'], ['soul_sand', 'nether'], ['end_stone', 'end'], ['purpur_block', 'end'],
  ['water_still', 'fluessig'], ['lava_flow', 'fluessig'], ['fire_0', 'fluessig'], ['brain_coral', 'meer'], ['fire_coral', 'meer'], ['torch', 'deko'], ['lantern', 'deko'], ['pumpkin_side', 'pflanzen'],
  ['melon_stem', 'pflanzen'], ['crimson_stem', 'holz'], ['copper_block', 'erze'], ['glowstone', 'nether'], ['ice', 'erde'], ['cobblestone', 'stein'], ['redstone_ore', 'erze']]) {
  if (list.includes('block/' + n + '.png')) ok(B(n) === want, `${n} → ${want} (${B(n)})`);
}
ok(blocks.find((g) => g.id === 'deko').paths.length < 200, 'Deko ist keine Restekiste');

const items = groupsFor('item', cat(/^items?\//));
const I = (n) => where(items, 'item/' + n + '.png');
console.log('Items:', items.map((g) => `${g.name} ${g.paths.length}`).join(' · '));
for (const [n, want] of [['diamond_sword', 'waffen'], ['bow', 'waffen'], ['diamond_pickaxe', 'werkzeuge'], ['iron_axe', 'werkzeuge'], ['diamond_helmet', 'ruestung'], ['leather_boots', 'ruestung'],
  ['apple', 'essen'], ['golden_apple', 'essen'], ['cooked_beef', 'essen'], ['potion', 'traenke'], ['iron_ingot', 'rohstoffe'], ['diamond', 'rohstoffe'], ['zombie_spawn_egg', 'eier'],
  ['music_disc_cat', 'musik'], ['enchanted_book', 'buecher'], ['oak_door', 'bloecke'], ['water_bucket', 'werkzeuge'], ['rabbit_foot', 'rohstoffe'], ['cooked_rabbit', 'essen']]) {
  if (list.includes('item/' + n + '.png')) ok(I(n) === want, `${n} → ${want} (${I(n)})`);
}

const mobs = groupsFor('mob', cat(/^entity\/(?!equipment\/)/));
console.log('Mobs:', mobs.map((g) => `${g.name} ${g.paths.length}`).join(' · '));
const M = (p) => where(mobs, p);
for (const [p, want] of [['entity/zombie/zombie.png', 'feinde'], ['entity/creeper/creeper.png', 'feinde'], ['entity/cow/cow.png', 'tiere'], ['entity/wither/wither.png', 'bosse'], ['entity/villager/villager.png', 'dorf'], ['entity/chest/normal.png', 'objekte'], ['entity/fish/cod.png', 'wasser']]) {
  if (list.includes(p)) ok(M(p) === want, `${p} → ${want} (${M(p)})`);
}
const gui = groupsFor('gui', cat(/^gui\//));
console.log('GUI:', gui.map((g) => `${g.name} ${g.paths.length}`).join(' · '));
ok(gui.some((g) => g.name.startsWith('HUD')), 'GUI hat HUD-Gruppe');
ok(gui.length <= 30, `GUI: höchstens 30 Gruppen (${gui.length})`);
const parts = groupsFor('particle', cat(/^particle\//));
console.log('Partikel:', parts.map((g) => `${g.name} ${g.paths.length}`).join(' · '));
ok(groupsFor('effect', cat(/^mob_effect\//)) === null, 'Effekte bleiben ohne Gruppen');
ok(groupsFor('block', ['block/stone.png']) === null, 'wenige Texturen: keine Gruppen');

const eg = enchantGroups(['diamond_sword', 'iron_sword', 'bow', 'diamond_helmet', 'enchanted_book', 'shears'], [{ item: 'diamond_sword', rel: 'item/verzaubert/diamond_sword-sharpness.png' }]);
ok(eg[0].id === 'schwerter' && eg[0].paths.join() === 'item/iron_sword.png,item/diamond_sword.png,item/verzaubert/diamond_sword-sharpness.png', 'Verzaubert: Variante steht hinter ihrem Item, Eisen vor Diamant');
ok(variantInfo('item/verzaubert/bow-flame-power.png')?.enchants.join() === 'flame,power', 'Variante lesen');
console.log(fails ? `\n${fails} Fehler` : '\nAlles in Ordnung.');
process.exit(fails ? 1 : 0);
