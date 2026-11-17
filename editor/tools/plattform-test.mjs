// Prueft die Mac-Ordner der Launcher auf einem beliebigen PC: legt einen Schein-Benutzerordner mit
// Mac-Struktur an und startet die Profilsuche im Mac-Modus.   node tools/plattform-test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mct-machome-'));
const sup = path.join(home, 'Library', 'Application Support');
const mk = (...p) => { const d = path.join(...p); fs.mkdirSync(d, { recursive: true }); return d; };
// CurseForge (Mac: ~/Documents/curseforge)
const cf = mk(home, 'Documents', 'curseforge', 'minecraft', 'Instances', 'Mein Fabric');
fs.writeFileSync(path.join(cf, 'minecraftinstance.json'), JSON.stringify({ gameVersion: '26.2', baseModLoader: { name: 'fabric-0.19.3-26.2' } }));
// Minecraft Launcher (Mac: ~/Library/Application Support/minecraft)
const mc = mk(sup, 'minecraft', 'versions');
fs.writeFileSync(path.join(sup, 'minecraft', 'launcher_profiles.json'), JSON.stringify({ profiles: { a: { type: 'latest-release', lastVersionId: 'latest-release', lastUsed: '2026-11-01T00:00:00Z' } } }));
fs.writeFileSync(path.join(mc, 'version_manifest_v2.json'), JSON.stringify({ latest: { release: '26.3', snapshot: '26.4-snapshot-8' } }));
// Modrinth (alte App-Struktur mit profile.json, ohne Datenbank)
const mr = mk(sup, 'com.modrinth.theseus', 'profiles', 'Mod Spass');
fs.writeFileSync(path.join(mr, 'profile.json'), JSON.stringify({ path: 'Mod Spass', metadata: { name: 'Mod Spass', game_version: '1.21.1', loader: 'neoforge' } }));
// Lunar
mk(home, '.lunarclient', 'profiles', 'pvp', 'game-versions', '26.3');

process.env.USERPROFILE = home; process.env.HOME = home;
delete process.env.APPDATA; delete process.env.LOCALAPPDATA;
process.env.MCT_PLATFORM = 'darwin';
process.env.MCT_JARS = process.argv[2] || '';
const { defaultRoots, scanProfiles, findJar } = await import('../lib/launchers.mjs');
const { dataDir, PLATFORM } = await import('../lib/system.mjs');
const roots = defaultRoots(dataDir());
let fehler = 0;
const ok = (was, bed, extra = '') => { console.log((bed ? '  ok     ' : '  FEHLER ') + was + (extra ? '  ' + extra : '')); if (!bed) fehler++; };
const rel = (p) => path.relative(home, p).split(path.sep).join('/');
ok('Plattform simuliert', PLATFORM === 'darwin');
ok('Datenordner', rel(dataDir()) === 'Library/Application Support/MinecraftTexturen', rel(dataDir()));
ok('CurseForge-Ordner', rel(roots.curseforge) === 'Documents/curseforge/minecraft/Instances', rel(roots.curseforge));
ok('CurseForge-Install', rel(path.resolve(roots.curseforgeInstall)) === 'Documents/curseforge/minecraft/Install', rel(path.resolve(roots.curseforgeInstall)));
ok('Modrinth (alter Name)', rel(roots.modrinth) === 'Library/Application Support/com.modrinth.theseus', rel(roots.modrinth));
ok('Minecraft Launcher', rel(roots.minecraft) === 'Library/Application Support/minecraft', rel(roots.minecraft));
ok('Lunar', rel(roots.lunar) === '.lunarclient', rel(roots.lunar));
const list = scanProfiles(roots).map((p) => `${p.launcherName}|${p.name}|${p.version}|${p.loader}`).sort();
console.log('  gefunden: ' + list.join('  /  '));
ok('alle vier Launcher gefunden', list.length === 4 && ['CurseForge|Mein Fabric|26.2|Fabric', 'Lunar Client|Pvp|26.3|Fabric', 'Minecraft Launcher|Minecraft Launcher|26.3|Vanilla', 'Modrinth|Mod Spass|1.21.1|NeoForge'].every((x) => list.includes(x)));
if (process.argv[2]) ok('Jar für 26.3 über zusätzlichen Ordner', !!findJar(roots, '26.3'));
fs.rmSync(home, { recursive: true, force: true });
console.log(fehler ? `${fehler} Fehler` : 'Alles in Ordnung.');
process.exit(fehler ? 1 : 0);
