// Profile aus CurseForge, Modrinth App, Lunar Client und dem normalen Minecraft Launcher finden -
// und zu jeder Minecraft-Version die Original-Jar (fuer die Originalbilder).
// Fehlt die Jar ueberall, kann sie direkt von Mojang geladen werden (wie es jeder Launcher tut).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

export const LAUNCHER_NAMES = { curseforge: 'CurseForge', modrinth: 'Modrinth', lunar: 'Lunar Client', minecraft: 'Minecraft Launcher' };

/** Wo die Launcher ihre Daten haben. Umgebungsvariablen nur fuer Tests mit Kopien. */
export function defaultRoots(dataDir, env = process.env) {
  const home = os.homedir();
  const appdata = env.APPDATA || path.join(home, 'AppData', 'Roaming');
  const cf = env.MCT_INSTANCES || path.join(home, 'curseforge', 'minecraft', 'Instances');
  return {
    curseforge: cf,
    curseforgeInstall: env.MCT_INSTALL || path.join(path.dirname(cf), 'Install'),
    modrinth: env.MCT_MODRINTH || path.join(appdata, 'ModrinthApp'),
    lunar: env.MCT_LUNAR || path.join(home, '.lunarclient'),
    minecraft: env.MCT_MINECRAFT || path.join(appdata, '.minecraft'),
    // weitere Ordner mit versions\<v>\<v>.jar (nur lesen) - fuer Tests
    jarDirs: (env.MCT_JARS || '').split(path.delimiter).filter(Boolean),
    downloads: path.join(dataDir, 'versions'),
  };
}

export function loaderOf(raw) {
  const s = String(raw || '').toLowerCase();
  if (s.includes('neoforge')) return 'NeoForge';
  if (s.includes('forge')) return 'Forge';
  if (s.includes('quilt')) return 'Quilt';
  if (s.includes('fabric')) return 'Fabric';
  return 'Vanilla';
}

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const dirs = (d) => { try { return fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); } catch { return []; } };

// ---------- CurseForge ----------
function curseforge(roots) {
  return dirs(roots.curseforge).flatMap((name) => {
    const dir = path.join(roots.curseforge, name);
    const meta = readJson(path.join(dir, 'minecraftinstance.json'));
    if (!meta) return [];
    return [{ launcher: 'curseforge', name, dir, version: meta.gameVersion || '?', loader: loaderOf(meta.baseModLoader?.name) }];
  });
}

// ---------- Modrinth App ----------
let sqlite;
function openDb(file) {
  try {
    sqlite ??= createRequire(import.meta.url)('node:sqlite');
    return new sqlite.DatabaseSync(file, { readOnly: true });
  } catch { return null; }
}
function modrinth(roots) {
  const base = roots.modrinth, profilesDir = path.join(base, 'profiles');
  if (!fs.existsSync(profilesDir)) return [];
  let rows = [];
  const db = fs.existsSync(path.join(base, 'app.db')) ? openDb(path.join(base, 'app.db')) : null;
  if (db) {
    try {
      const tables = new Set(db.prepare("select name from sqlite_master where type='table'").all().map((r) => r.name));
      if (tables.has('instances') && tables.has('instance_content_sets')) {
        // neues Schema: Version und Loader stehen im angewendeten Inhalts-Set
        rows = db.prepare('select i.path as path, i.name as name, s.game_version as version, s.loader as loader from instances i left join instance_content_sets s on s.id = i.applied_content_set_id').all();
      } else if (tables.has('profiles')) {
        rows = db.prepare('select path, name, game_version as version, mod_loader as loader from profiles').all();
      }
    } catch { rows = []; }
    try { db.close(); } catch { /* egal */ }
  }
  if (!rows.length) {
    // sehr alte Modrinth-App: profile.json in jedem Profil
    rows = dirs(profilesDir).map((p) => {
      const j = readJson(path.join(profilesDir, p, 'profile.json'));
      return j ? { path: p, name: j.metadata?.name || p, version: j.metadata?.game_version, loader: j.metadata?.loader } : null;
    }).filter(Boolean);
  }
  return rows.filter((r) => r.path && fs.existsSync(path.join(profilesDir, r.path))).map((r) => ({
    launcher: 'modrinth', name: r.name || r.path, dir: path.join(profilesDir, r.path), version: r.version || '?', loader: loaderOf(r.loader),
  }));
}

// ---------- Lunar Client ----------
const newer = (a, b) => {
  const pa = a.split(/[.-]/).map((x) => parseInt(x, 10) || 0), pb = b.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
};
function lunar(roots) {
  const profilesDir = path.join(roots.lunar, 'profiles');
  return dirs(profilesDir).flatMap((name) => {
    const dir = path.join(profilesDir, name);
    // zuletzt gespielte Version = juengster Ordner in game-versions
    const gv = path.join(dir, 'game-versions');
    const versions = dirs(gv).filter((v) => /^\d/.test(v)).map((v) => ({ v, t: fs.statSync(path.join(gv, v)).mtimeMs })).sort((a, b) => b.t - a.t);
    if (!versions.length) return [];
    const version = versions[0].v;
    // Lunar laedt Fabric-Mods ab 1.20 aus dem mods-Ordner des Profils
    const loader = newer(version, '1.20') >= 0 ? 'Fabric' : 'Vanilla';
    return [{ launcher: 'lunar', name: name.charAt(0).toUpperCase() + name.slice(1), dir, version, loader }];
  });
}

// ---------- Minecraft Launcher ----------
function minecraft(roots) {
  const base = roots.minecraft;
  const lp = readJson(path.join(base, 'launcher_profiles.json'));
  if (!lp?.profiles) return [];
  const manifest = readJson(path.join(base, 'versions', 'version_manifest_v2.json'));
  const byDir = new Map();
  for (const p of Object.values(lp.profiles)) {
    const dir = p.gameDir ? path.resolve(p.gameDir) : base;
    const prev = byDir.get(dir);
    if (!prev || String(p.lastUsed || '') > String(prev.lastUsed || '')) byDir.set(dir, p);
  }
  const out = [];
  for (const [dir, p] of byDir) {
    let id = p.lastVersionId || 'latest-release';
    if (id === 'latest-release') id = manifest?.latest?.release || newestRelease(base);
    else if (id === 'latest-snapshot') id = manifest?.latest?.snapshot || newestRelease(base);
    if (!id) continue;
    // Mod-Loader-Versionen erben von der Minecraft-Version
    const vj = readJson(path.join(base, 'versions', id, id + '.json'));
    const version = vj?.inheritsFrom || id;
    out.push({ launcher: 'minecraft', name: dir === base ? 'Minecraft Launcher' : (p.name || path.basename(dir)), dir, version, loader: loaderOf(id) });
  }
  return out;
}
function newestRelease(base) {
  return dirs(path.join(base, 'versions')).filter((v) => /^\d+\.\d+(\.\d+)?$/.test(v) && fs.existsSync(path.join(base, 'versions', v, v + '.jar'))).sort(newer).pop() || null;
}

// ---------- alle zusammen ----------
let cache = { at: 0, key: '', list: [] };
/** Alle Profile aller Launcher (kurz zwischengespeichert). */
export function scanProfiles(roots) {
  const key = JSON.stringify(roots);
  if (cache.key === key && Date.now() - cache.at < 2000) return cache.list;
  const list = [];
  for (const [launcher, fn] of Object.entries({ curseforge, modrinth, lunar, minecraft })) {
    try { list.push(...fn(roots)); } catch (e) { console.warn(`${LAUNCHER_NAMES[launcher]}: ${e.message}`); }
  }
  for (const p of list) {
    p.id = p.launcher + ':' + p.name;
    p.launcherName = LAUNCHER_NAMES[p.launcher];
  }
  cache = { at: Date.now(), key, list };
  return list;
}

/** Profil zu einem Ordner (auch wenn es in keinem Launcher mehr steht). */
export function profileByDir(roots, dir) {
  const want = path.resolve(dir).toLowerCase();
  return scanProfiles(roots).find((p) => path.resolve(p.dir).toLowerCase() === want) || null;
}

/** Original-Jar einer Minecraft-Version, egal welcher Launcher sie geladen hat. */
export function findJar(roots, version) {
  if (!version || version === '?') return null;
  const cands = [
    path.join(roots.curseforgeInstall, 'versions', version, version + '.jar'),
    path.join(roots.minecraft, 'versions', version, version + '.jar'),
    ...roots.jarDirs.map((d) => path.join(d, version, version + '.jar')),
    path.join(roots.downloads, version + '.jar'),
  ];
  // Modrinth: meta/versions/<version>-<loaderversion>/<...>.jar
  const mr = path.join(roots.modrinth, 'meta', 'versions');
  for (const d of dirs(mr)) if (d === version || d.startsWith(version + '-')) cands.push(path.join(mr, d, d + '.jar'));
  return cands.find((f) => fs.existsSync(f) && fs.statSync(f).size > 1_000_000) || null;
}

// ---------- von Mojang laden ----------
const MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}
/** Laedt die Original-Jar einer Version von Mojang (gleiche Quelle wie der offizielle Launcher), prueft die Pruefsumme. */
export async function downloadJar(roots, version) {
  const manifest = await getJson(MANIFEST);
  const entry = manifest.versions.find((v) => v.id === version);
  if (!entry) throw new Error(`Minecraft ${version} gibt es bei Mojang nicht`);
  const client = (await getJson(entry.url)).downloads?.client;
  if (!client?.url) throw new Error(`Für ${version} gibt es keine Spieldatei`);
  const r = await fetch(client.url);
  if (!r.ok) throw new Error(`Download fehlgeschlagen (${r.status})`);
  const buf = Buffer.from(await r.arrayBuffer());
  const sha1 = crypto.createHash('sha1').update(buf).digest('hex');
  if (client.sha1 && sha1 !== client.sha1) throw new Error('Download beschädigt (Prüfsumme falsch) – bitte nochmal versuchen');
  fs.mkdirSync(roots.downloads, { recursive: true });
  const file = path.join(roots.downloads, version + '.jar');
  fs.writeFileSync(file + '.part', buf);
  fs.renameSync(file + '.part', file);
  return { file, size: buf.length };
}
