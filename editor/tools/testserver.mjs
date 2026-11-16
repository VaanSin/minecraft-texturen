// Startet den Editor gegen KOPIEN der Profile von CurseForge, Modrinth, Lunar und Minecraft Launcher
// (fuer Tests, nichts Echtes wird veraendert).
// node tools/testserver.mjs [--neu]   (--neu: Testkopie frisch anlegen)
//
// Angelegt werden alle CurseForge-Profile (nur minecraftinstance.json + leere Ordner, Fabric API als Platzhalter),
// dazu Kopien der Modrinth-Datenbank, der Lunar-Profile und der Launcher-Profilliste. Original-Jars werden nur gelesen.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const home = os.homedir();
const realBase = path.join(home, 'curseforge', 'minecraft', 'Instances');
const base = path.join(os.tmpdir(), 'mct-test');
const instances = path.join(base, 'Instances');
if (process.argv.includes('--neu') && fs.existsSync(base)) fs.rmSync(base, { recursive: true, force: true });

function fakeProfile(name) {
  const dst = path.join(instances, name);
  if (fs.existsSync(path.join(dst, 'minecraftinstance.json'))) return;
  const meta = JSON.parse(fs.readFileSync(path.join(realBase, name, 'minecraftinstance.json'), 'utf8'));
  fs.mkdirSync(path.join(dst, 'resourcepacks'), { recursive: true });
  fs.mkdirSync(path.join(dst, 'mods'), { recursive: true });
  fs.copyFileSync(path.join(realBase, name, 'minecraftinstance.json'), path.join(dst, 'minecraftinstance.json'));
  if (/fabric/i.test(meta.baseModLoader?.name || '')) fs.writeFileSync(path.join(dst, 'mods', 'fabric-api-test.jar'), ''); // nur Platzhalter
  console.log('Testprofil angelegt:', name);
}
for (const name of fs.existsSync(realBase) ? fs.readdirSync(realBase) : []) {
  if (fs.existsSync(path.join(realBase, name, 'minecraftinstance.json'))) fakeProfile(name);
}
fs.mkdirSync(path.join(base, 'desktop', 'assets', 'minecraft', 'textures'), { recursive: true });

// Modrinth App: Datenbank kopieren (nur gelesen), Profile als leere Ordner
const appdata = process.env.APPDATA;
const realMr = path.join(appdata, 'ModrinthApp'), mr = path.join(base, 'ModrinthApp');
if (fs.existsSync(path.join(realMr, 'app.db')) && !fs.existsSync(path.join(mr, 'app.db'))) {
  fs.mkdirSync(path.join(mr, 'profiles'), { recursive: true });
  for (const f of ['app.db', 'app.db-wal', 'app.db-shm']) if (fs.existsSync(path.join(realMr, f))) fs.copyFileSync(path.join(realMr, f), path.join(mr, f));
  for (const p of fs.readdirSync(path.join(realMr, 'profiles'))) {
    fs.mkdirSync(path.join(mr, 'profiles', p, 'resourcepacks'), { recursive: true });
    fs.mkdirSync(path.join(mr, 'profiles', p, 'mods'), { recursive: true });
    if (fs.existsSync(path.join(realMr, 'profiles', p, 'options.txt'))) fs.copyFileSync(path.join(realMr, 'profiles', p, 'options.txt'), path.join(mr, 'profiles', p, 'options.txt'));
  }
  console.log('Test-Modrinth angelegt');
}
// Lunar Client: Profil mit Version 26.3 und Fabric-API-Platzhalter
const lunar = path.join(base, 'lunarclient');
const realLunar = path.join(home, '.lunarclient', 'profiles');
if (fs.existsSync(realLunar) && !fs.existsSync(path.join(lunar, 'profiles'))) {
  for (const p of fs.readdirSync(realLunar)) {
    const d = path.join(lunar, 'profiles', p);
    for (const v of fs.existsSync(path.join(realLunar, p, 'game-versions')) ? fs.readdirSync(path.join(realLunar, p, 'game-versions')) : []) fs.mkdirSync(path.join(d, 'game-versions', v), { recursive: true });
    fs.mkdirSync(path.join(d, 'resourcepacks'), { recursive: true });
    fs.mkdirSync(path.join(d, 'mods'), { recursive: true });
    fs.writeFileSync(path.join(d, 'mods', 'fabric-api-test.jar'), '');
    if (fs.existsSync(path.join(realLunar, p, 'options.txt'))) fs.copyFileSync(path.join(realLunar, p, 'options.txt'), path.join(d, 'options.txt'));
  }
  console.log('Test-Lunar angelegt');
}
// Minecraft Launcher: Profilliste + Versionsliste, Jars werden aus dem echten Ordner nur gelesen
const realMc = path.join(appdata, '.minecraft'), mc = path.join(base, 'minecraft');
if (fs.existsSync(path.join(realMc, 'launcher_profiles.json')) && !fs.existsSync(path.join(mc, 'launcher_profiles.json'))) {
  fs.mkdirSync(path.join(mc, 'versions'), { recursive: true });
  fs.copyFileSync(path.join(realMc, 'launcher_profiles.json'), path.join(mc, 'launcher_profiles.json'));
  if (fs.existsSync(path.join(realMc, 'versions', 'version_manifest_v2.json'))) fs.copyFileSync(path.join(realMc, 'versions', 'version_manifest_v2.json'), path.join(mc, 'versions', 'version_manifest_v2.json'));
  if (fs.existsSync(path.join(realMc, 'options.txt'))) fs.copyFileSync(path.join(realMc, 'options.txt'), path.join(mc, 'options.txt'));
  fs.mkdirSync(path.join(mc, 'resourcepacks'), { recursive: true });
  console.log('Test-Minecraft-Launcher angelegt');
}

process.env.MCT_PORT ||= '47812'; // eigener Port, damit ein offenes echtes Programm nicht stoert
process.env.MCT_INSTANCES = instances;
process.env.MCT_DATA = path.join(base, 'data');
process.env.MCT_DESKTOP = path.join(base, 'desktop', 'assets');
process.env.MCT_INSTALL = path.join(home, 'curseforge', 'minecraft', 'Install'); // Original-Jars nur lesen
process.env.MCT_MODRINTH = mr;
process.env.MCT_LUNAR = lunar;
process.env.MCT_MINECRAFT = mc;
process.env.MCT_JARS = path.join(realMc, 'versions'); // echte Minecraft-Launcher-Jars nur lesen
// Online-Konto gegen einen Supabase-Nachbau (kein Internet noetig)
if (!process.env.MCT_KONTO_URL) {
  await import('./supabase-mock.mjs');
  process.env.MCT_KONTO_URL = 'http://127.0.0.1:47899';
  process.env.MCT_KONTO_KEY = 'sb_publishable_test';
}
await import('../server.mjs');
