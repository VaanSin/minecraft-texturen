// Verzauberte Items: Versionen, Dateien, eigene Item-Dateien, Zuruecksetzen. Nutzt ein Minecraft-Jar nur lesend
// und ein Thema in %TEMP%.   node tools/verzaubert-test.mjs [pfad/zum/26.2.jar]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../lib/store.mjs';
import { versionLevel, variantPath, parseVariant, normEnchants } from '../lib/verzaubert.mjs';

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok     ' : '  FEHLER ') + m); if (!c) fails++; };

console.log('Versionen');
for (const [v, want] of [['26.2', 'voll'], ['26.1.2', 'voll'], ['1.21.5', 'voll'], ['1.21.11', 'voll'], ['1.21.4', 'alle'], ['1.21.1', null], ['1.20.1', null], ['25w14a', 'voll'], ['24w45a', 'alle'], ['24w10a', null]]) ok(versionLevel(v) === want, `${v} → ${want}`);
ok(variantPath('diamond_sword', ['sharpness', 'fire_aspect']) === 'item/verzaubert/diamond_sword-fire_aspect-sharpness.png', 'Pfad sortiert die Verzauberungen');
ok(normEnchants(['alle', 'sharpness']).join() === 'alle', '"alle" steht allein');
ok(parseVariant('item/verzaubert/bow-flame.png')?.enchants.join() === 'flame', 'Pfad wird erkannt');
ok(parseVariant('item/diamond_sword.png') === null, 'normales Item ist keine Variante');

const jar = process.argv[2] || path.join(os.homedir(), 'curseforge', 'minecraft', 'Install', 'versions', '26.2', '26.2.jar');
if (!fs.existsSync(jar)) { console.log('  (kein 26.2-Jar gefunden – Rest übersprungen)'); process.exit(fails ? 1 : 0); }
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mct-verzaubert-'));
const inst = path.join(base, 'profil');
fs.mkdirSync(path.join(inst, 'resourcepacks'), { recursive: true });
const store = new Store({ instanceDir: inst, jarPath: jar, version: '26.2', dataDir: path.join(base, 'data') });
const t = store.createTheme('Zauber');
const items = path.join(t.dir, 'assets', 'minecraft', 'items');
const read = (p) => JSON.parse(fs.readFileSync(path.join(t.dir, ...p.split('/')), 'utf8'));
const has = (p) => fs.existsSync(path.join(t.dir, ...p.split('/')));
const img = (w = 16, h = 16, c = [255, 0, 0, 255]) => ({ width: w, height: h, data: new Uint8Array(w * h * 4).map((_, i) => c[i % 4]) });

console.log('Tabelle aus dem Jar');
const info = store.enchantInfo();
ok(info.level === 'voll', 'Stufe voll');
ok(info.items.diamond_sword?.includes('sharpness') && info.items.diamond_sword.includes('fire_aspect'), 'Schwert: Schärfe, Verbrennung');
ok(!info.items.diamond_sword.includes('protection'), 'Schwert: kein Schutz');
ok(info.items.diamond_helmet?.includes('respiration') && !info.items.diamond_boots.includes('respiration'), 'Atmung nur am Helm');
ok(info.items.bow?.includes('flame') && info.items.diamond_spear?.includes('lunge'), 'Bogen: Flamme · Speer: Ausfallschritt');
ok(info.items.enchanted_book?.length > 40, 'Buch: alle Verzauberungen');

console.log('Speichern');
store.save('zauber', 'item/verzaubert/diamond_sword-sharpness.png', img());
store.save('zauber', 'item/verzaubert/diamond_sword-fire_aspect-sharpness.png', img(16, 16, [255, 128, 0, 255]));
store.save('zauber', 'item/verzaubert/diamond_sword-alle.png', img(16, 16, [0, 0, 255, 255]));
let def = read('assets/minecraft/items/diamond_sword.json').model;
ok(def.type === 'minecraft:condition' && def.property === 'minecraft:component' && def.predicate === 'minecraft:enchantments', 'Bedingung minecraft:component / enchantments');
ok(def.value.length === 2 && def.value.map((v) => v.enchantments).join() === 'minecraft:fire_aspect,minecraft:sharpness', 'zuerst die Kombination aus zwei');
ok(def.on_false.value?.length === 1 && def.on_false.value[0].enchantments === 'minecraft:sharpness', 'dann Schärfe allein');
ok(def.on_false.on_false.property === 'minecraft:has_component' && def.on_false.on_false.component === 'minecraft:enchantments', 'dann irgendeine Verzauberung');
ok(def.on_false.on_false.on_false.model === 'minecraft:item/diamond_sword', 'sonst das normale Schwert');
const m1 = read('assets/minecraft/models/item/verzaubert/diamond_sword-sharpness.json');
ok(m1.parent === 'minecraft:item/handheld' && m1.textures.layer0 === 'minecraft:item/verzaubert/diamond_sword-sharpness', 'Modell: wie das Original, eigenes Bild');
ok(def.on_true.model === 'minecraft:item/verzaubert/diamond_sword-fire_aspect-sharpness', 'Kombi zeigt aufs Kombi-Modell');
let threw = false;
try { store.save('zauber', 'item/verzaubert/diamond_sword-protection.png', img()); } catch { threw = true; }
ok(threw, 'Schutz auf dem Schwert wird abgelehnt');

store.save('zauber', 'item/verzaubert/bow-flame.png', img());
const bow = read('assets/minecraft/items/bow.json').model;
const bowTrue = JSON.stringify(bow.on_true);
ok(bowTrue.includes('item/verzaubert/bow-flame') && bowTrue.includes('minecraft:item/bow_pulling_1'), 'Bogen: Ruhebild getauscht, Spann-Animation bleibt');

store.save('zauber', 'item/verzaubert/diamond_helmet-protection.png', img());
const helm = JSON.stringify(read('assets/minecraft/items/diamond_helmet.json').model.on_true);
const trimModels = (helm.match(/item\/verzaubert\/diamond_helmet_[a-z]+_trim-protection/g) || []).length;
ok(trimModels >= 5, `Helm mit Besatz: ${trimModels} Besatz-Modelle bekommen das Bild`);
const trim = fs.readdirSync(path.join(t.dir, 'assets/minecraft/models/item/verzaubert')).find((f) => f.includes('_trim-'));
ok(trim && read('assets/minecraft/models/item/verzaubert/' + trim).textures.layer1?.includes('trims/'), 'Besatz-Ebene bleibt erhalten');

store.save('zauber', 'item/verzaubert/enchanted_book-mending.png', img());
const book = read('assets/minecraft/items/enchanted_book.json').model;
ok(book.predicate === 'minecraft:stored_enchantments', 'Buch prüft gespeicherte Verzauberungen');

console.log('Eigene Item-Datei des Themas');
const ownDef = { model: { type: 'minecraft:model', model: 'minecraft:item/mein_schwert' } };
fs.mkdirSync(items, { recursive: true });
fs.writeFileSync(path.join(items, 'iron_sword.json'), JSON.stringify(ownDef));
const px = store.pixels('zauber', 'item/verzaubert/iron_sword-alle.png');
ok(px.source === 'basis' && px.w === 16, 'neues Bild startet mit dem normalen Item');
store.save('zauber', 'item/verzaubert/iron_sword-alle.png', img());
ok(read('assets/minecraft/items/iron_sword.json').model.on_false.model === 'minecraft:item/mein_schwert', 'eigene Datei ist die Grundlage');
store.revert('zauber', 'item/verzaubert/iron_sword-alle.png');
ok(JSON.stringify(read('assets/minecraft/items/iron_sword.json')) === JSON.stringify(ownDef), 'nach dem Entfernen wieder genau die eigene Datei');

console.log('Zurücksetzen');
for (const v of store.variants('zauber')) store.revert('zauber', v.rel);
ok(!has('assets/minecraft/items/diamond_sword.json') && !has('assets/minecraft/items/bow.json'), 'Item-Dateien weg');
ok(!has('assets/minecraft/models/item/verzaubert'), 'Modell-Ordner weg');
ok(!has('mct-verzaubert.json'), 'Liste weg');
ok(has('assets/minecraft/items/iron_sword.json'), 'eigene Datei bleibt');

console.log('Alte Version');
const old = new Store({ instanceDir: inst, jarPath: jar, version: '1.21.1', dataDir: path.join(base, 'data') });
threw = false;
try { old.save('zauber', 'item/verzaubert/diamond_sword-sharpness.png', img()); } catch (e) { threw = /1\.21\.4/.test(e.message); }
ok(threw, '1.21.1: verständliche Meldung');

fs.rmSync(base, { recursive: true, force: true });
console.log(fails ? `\n${fails} Fehler` : '\nAlles in Ordnung.');
process.exit(fails ? 1 : 0);
