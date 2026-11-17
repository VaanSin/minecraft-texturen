// Minecraft Texturen - lokaler Server fuer den Texturen-Editor.
// Start:  node server.mjs            (nur Server, http://127.0.0.1:47811)
//         node server.mjs --app      (Server + eigenes Programmfenster; beendet sich, wenn das Fenster zu ist)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Store, textureInJar, EXTRA } from './lib/store.mjs';
import { decodePng, encodePng } from './lib/png.mjs';
import { listProfiles, infoForDir, ensureMod, isRunning, activateInOptions, activeInOptions } from './lib/profiles.mjs';
import { defaultRoots, scanProfiles, profileByDir, findJar, downloadJar } from './lib/launchers.mjs';
import { Konto } from './lib/konto.mjs';
import { writeZip } from './lib/zip.mjs';
import { dataDir, openFolder, startWindow, IS_WIN } from './lib/system.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(HERE, 'public');
const PORT = Number(process.env.MCT_PORT || 47811);
const APP_MODE = process.argv.includes('--app');
const HOME = os.homedir();
// MCT_DATA / MCT_INSTANCE / MCT_INSTANCES / MCT_INSTALL / MCT_MODRINTH / MCT_LUNAR / MCT_MINECRAFT / MCT_JARS / MCT_DESKTOP:
// nur fuer Tests mit Kopien statt der echten Profile
const DATA_DIR = dataDir();

// ---------- Einstellungen ----------
const DEFAULTS = {
  instanceDir: '',        // zuletzt benutztes Profil (Ordner)
  showWarnings: true,
  showGrid: true,
  autoRotate: true,
  askProfile: true,
  lastTheme: '',
  // Optional: Aenderungen eines Themas zusaetzlich in einen Arbeitsordner kopieren (z. B. Desktopassets)
  mirrorDesktop: false,
  desktopAssets: '',
  mirrorTheme: '',
  mirrorProfile: '',
};
function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'einstellungen.json'), 'utf8')) }; }
  catch { return { ...DEFAULTS }; }
}
let settings = loadSettings();
if (process.env.MCT_INSTANCE) settings.instanceDir = process.env.MCT_INSTANCE;
if (process.env.MCT_DESKTOP) settings.desktopAssets = process.env.MCT_DESKTOP;
function saveSettings() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, 'einstellungen.json'), JSON.stringify(settings, null, 2), 'utf8');
}

const ROOTS = defaultRoots(DATA_DIR);
// Online-Konto (Supabase); Zugangsdaten des Projekts in konto.json
const konto = new Konto({ configFile: path.join(HERE, 'konto.json'), dataDir: DATA_DIR });
const imageCache = new Map();
// Mitgelieferte /thema-Dateien, je Loader und Version eine (themenwechsel-1.0.0-<loader>-<version>.jar)
const MOD_DIRS = [path.join(HERE, 'mod-dateien'), path.join(HERE, '..', 'mod', 'build')];

let version, jar, store = null, currentName = '';
/** Profil oeffnen: Originale aus dem Minecraft-Jar dieser Version, Themen aus dessen resourcepacks. */
function openProfile(dir) {
  const p = profileByDir(ROOTS, dir);
  if (!p) throw new Error('Profil nicht gefunden: ' + dir);
  const found = findJar(ROOTS, p.version);
  if (!found) throw new Error(`Originalbilder für Minecraft ${p.version} fehlen – einmal in ${p.launcherName} starten`);
  version = p.version;
  jar = found;
  store = new Store({ instanceDir: p.dir, jarPath: jar, version, desktopAssets: settings.desktopAssets, dataDir: DATA_DIR });
  store.settings = () => settings;
  settings.instanceDir = p.dir;
  currentName = p.name;
  const mod = ensureMod(p.dir, MOD_DIRS, ROOTS);
  console.log(`Profil ${p.name} (${p.launcherName}, Minecraft ${version}): ${store.vanillaList.length} Original-Texturen, Themen: ${store.themes().map((t) => t.name).join(', ') || '-'}, /thema: ${mod.state}`);
  return mod;
}
let lastMod = null;
try { if (settings.instanceDir) lastMod = openProfile(settings.instanceDir); }
catch (e) { console.warn(e.message); }
if (!store) {
  // gespeichertes Profil geht nicht (mehr) - das zuletzt geaenderte passende nehmen
  const first = listProfiles(ROOTS, MOD_DIRS).filter((p) => p.fits)
    .sort((a, b) => mtime(path.join(b.dir, 'options.txt')) - mtime(path.join(a.dir, 'options.txt')))[0];
  if (first) lastMod = openProfile(first.dir);
  else console.warn('Kein Profil mit Minecraft-Originalbildern gefunden - im Programm ein Profil wählen.');
}
function mtime(f) { try { return fs.statSync(f).mtimeMs; } catch { return 0; } }
function countVorlagen() {
  const dir = path.join(HERE, 'vorlagen');
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((id) => fs.existsSync(path.join(dir, id, 'vorlage.json'))).length : 0;
}
/** Diese Routen gehen auch ohne offenes Profil */
const WITHOUT_PROFILE = new Set(['/api/info', '/api/profiles', '/api/ping', '/api/profile', '/api/fetch-minecraft', '/api/settings']);

// ---------- Hilfen ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

function send(res, code, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', ...extra });
  res.end(body);
}
const json = (res, obj, code = 200) => send(res, code, JSON.stringify(obj));

function readBody(req) {
  return new Promise((resolve, reject) => {
    const parts = [];
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size > 96 * 1024 * 1024) { reject(new Error('Zu gross')); req.destroy(); } else parts.push(c); });
    req.on('end', () => { try { resolve(parts.length ? JSON.parse(Buffer.concat(parts).toString('utf8')) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

const thumbCache = new Map();
function thumbnail(theme, rel) {
  const eff = store.effectiveBytes(theme, rel);
  if (!eff) return null;
  const key = theme + '|' + rel + '|' + eff.source + '|' + eff.bytes.length;
  if (thumbCache.has(key)) return thumbCache.get(key);
  let out = eff.bytes;
  try {
    const img = decodePng(eff.bytes);
    // Animierte Streifen: nur das erste Bild zeigen
    if (img.height > img.width && img.height % img.width === 0) {
      out = encodePng({ width: img.width, height: img.width, data: img.data.subarray(0, img.width * img.width * 4) });
    }
  } catch { /* Original ausliefern */ }
  if (thumbCache.size > 6000) thumbCache.clear();
  thumbCache.set(key, out);
  return out;
}

let lastPing = Date.now();

// ---------- Routen ----------
async function handle(req, res) {
  const url = new URL(req.url, 'http://127.0.0.1');
  const p = decodeURIComponent(url.pathname);
  const q = (k) => url.searchParams.get(k);
  if (!store && /^\/(api|tex|thumb|vorlagen)\//.test(p) &&!WITHOUT_PROFILE.has(p) && !p.startsWith('/api/konto')) throw new Error('Bitte zuerst ein Minecraft-Profil wählen.');

  if (p === '/api/profiles') {
    // ?path=...&path=... : pruefen, ob es diese Texturen in der Version des Profils gibt
    const rels = url.searchParams.getAll('path');
    const profiles = listProfiles(ROOTS, MOD_DIRS).map(({ dir, modJar, jar: other, ...rest }) => {
      rest.current = !!store && path.resolve(dir).toLowerCase() === path.resolve(settings.instanceDir).toLowerCase();
      if (rels.length && rest.fits && store) {
        let missing = 0, differs = 0;
        for (const rel of rels) {
          const t = textureInJar(other, rel), here = textureInJar(jar, rel);
          if (!t.exists) missing++;
          else if (here.exists && t.w * here.h !== t.h * here.w) differs++;
        }
        rest.total = rels.length; rest.missing = missing;
        rest.texture = missing === rels.length ? 'fehlt' : missing ? 'teilweise' : differs ? 'anders' : 'ok';
      }
      return rest;
    });
    const cur = profiles.find((x) => x.current);
    return json(res, { current: cur ? cur.id : null, profiles });
  }
  if (p === '/api/info') {
    if (!store) return json(res, { setup: true, settings, appMode: APP_MODE });
    const { dir, modJar, jar: _j, ...profile } = infoForDir(settings.instanceDir, MOD_DIRS, ROOTS) || { name: path.basename(settings.instanceDir), version, loader: '?' };
    profile.activeInOptions = activeInOptions(settings.instanceDir);
    return json(res, {
      profile, mod: lastMod, pack: store.pack,
      version, jar, instanceDir: settings.instanceDir, packsDir: store.packsDir,
      desktopAssets: fs.existsSync(settings.desktopAssets) ? settings.desktopAssets : null,
      themes: store.themes().map(({ key, folder, name, count }) => ({ key, folder, name, count })),
      settings, canUndoBatch: !!store.lastBatch?.undo?.length, appMode: APP_MODE,
      vorlagen: countVorlagen(),
    });
  }
  if (p === '/api/konto') return json(res, konto.status());
  if (p === '/api/konto/meine') return json(res, await konto.mine());
  if (p === '/api/konto/entdecken') return json(res, await konto.discover({ search: q('suche') || '', version: q('version') || '', sort: q('sort') || '' }));
  if (p.startsWith('/api/konto/bild/')) {
    const [owner, id] = p.slice('/api/konto/bild/'.length).replace(/\.png$/, '').split('/');
    const k = owner + '/' + id;
    if (!imageCache.has(k)) {
      try { imageCache.set(k, await konto.image(owner, id)); } catch { imageCache.set(k, null); }
      if (imageCache.size > 500) imageCache.delete(imageCache.keys().next().value);
    }
    const img = imageCache.get(k);
    return img ? send(res, 200, img, 'image/png', { 'Cache-Control': 'max-age=300' }) : send(res, 404, 'kein Bild', 'text/plain');
  }
  if (p === '/api/vorlagen') {
    // Fertige Designs (vorlagen/<id>/vorlage.json): Name, Beschreibung, wie viele Texturen in diese Version passen
    const dir = path.join(HERE, 'vorlagen');
    const list = fs.existsSync(dir) ? fs.readdirSync(dir).filter((id) => fs.existsSync(path.join(dir, id, 'vorlage.json'))).map((id) => {
      const v = JSON.parse(fs.readFileSync(path.join(dir, id, 'vorlage.json'), 'utf8'));
      const rels = Object.keys(v.texturen || {});
      return { id, name: v.name, icon: v.icon, beschreibung: v.beschreibung, total: rels.length, passt: rels.filter((r) => store.vanillaSet.has(r) || EXTRA.test(r)).length };
    }) : [];
    return json(res, list);
  }
  if (p === '/api/vorlage') {
    const id = String(q('id') || '').replace(/[^a-z0-9_-]/gi, '');
    const dir = path.join(HERE, 'vorlagen', id);
    const v = JSON.parse(fs.readFileSync(path.join(dir, 'vorlage.json'), 'utf8'));
    const textures = [];
    for (const [rel, file] of Object.entries(v.texturen || {})) {
      if (!store.vanillaSet.has(rel) && !EXTRA.test(rel)) continue; // gibt es in dieser Minecraft-Version nicht
      const img = decodePng(fs.readFileSync(path.join(dir, file)));
      textures.push({ path: rel, w: img.width, h: img.height, data: Buffer.from(img.data).toString('base64'), extra: EXTRA.test(rel) });
    }
    return json(res, { name: v.name, textures });
  }
  if (p.startsWith('/vorlagen/')) {
    const f = path.join(HERE, p);
    if (!f.startsWith(path.join(HERE, 'vorlagen')) || !f.endsWith('.png') || !fs.existsSync(f)) return send(res, 404, 'nicht gefunden', 'text/plain');
    return send(res, 200, fs.readFileSync(f), 'image/png');
  }
  if (p === '/api/list') return json(res, store.list(q('theme')));
  if (p === '/api/pixels') return json(res, store.pixels(q('theme'), q('path')));
  if (p.startsWith('/tex/') || p.startsWith('/thumb/')) {
    const [, kind, theme, ...rest] = p.split('/');
    const rel = rest.join('/');
    const bytes = kind === 'thumb' ? thumbnail(theme, rel) : store.effectiveBytes(theme, rel)?.bytes;
    return bytes ? send(res, 200, bytes, 'image/png', { 'Cache-Control': 'no-cache' }) : send(res, 404, 'nicht gefunden', 'text/plain');
  }
  if (req.method === 'POST') {
    const b = await readBody(req);
    if (p === '/api/ping') { lastPing = Date.now(); return json(res, { ok: true }); }
    if (p === '/api/save') {
      const data = new Uint8Array(Buffer.from(b.data, 'base64'));
      if (data.length !== b.w * b.h * 4) throw new Error('Bilddaten passen nicht zur Größe');
      const r = store.save(b.theme, b.path, { width: b.w, height: b.h, data });
      lastMod = ensureMod(settings.instanceDir, MOD_DIRS, ROOTS); // /thema gleich mitinstallieren
      return json(res, { ok: true, ...r, profile: currentName, mod: lastMod });
    }
    if (p === '/api/profile') {
      // Profil wechseln; das aktuelle Thema auf Wunsch mitnehmen (Kopie) oder leer anlegen
      const target = scanProfiles(ROOTS).find((x) => x.id === b.id);
      if (!target) throw new Error('Profil nicht gefunden');
      const info = infoForDir(target.dir, MOD_DIRS, ROOTS);
      if (!info?.fits) throw new Error(info?.why || 'Profil geht nicht');
      const fromTheme = store && b.theme && b.theme !== 'normal' ? store.themes().find((t) => t.key === b.theme) || null : null;
      const fromName = fromTheme?.name;
      const fromStore = store;
      lastMod = openProfile(target.dir);
      let theme = 'normal', copied = null;
      if (fromTheme) {
        if (store.themes().some((t) => t.folder === fromTheme.folder)) theme = b.theme;
        else if (b.bring === 'copy') { copied = store.importTheme(fromTheme.dir, fromStore, fromName); theme = copied.key; }
        else if (b.bring === 'empty') theme = store.createTheme(fromName, 'normal').key;
      }
      thumbCache.clear();
      saveSettings();
      return json(res, { ok: true, theme, mod: lastMod, copied, version });
    }
    // ---------- Online-Konto ----------
    if (p === '/api/konto/registrieren') return json(res, await konto.register(b.username, b.password));
    if (p === '/api/konto/anmelden') return json(res, await konto.login(b.username, b.password));
    if (p === '/api/konto/abmelden') return json(res, await konto.logout());
    if (p === '/api/konto/passwort') return json(res, await konto.changePassword(b.password));
    if (p === '/api/konto/sichtbar') return json(res, await konto.setPublic(b.id, b.public));
    if (p === '/api/konto/loeschen') return json(res, await konto.remove(b.id));
    if (p === '/api/konto/hochladen') {
      if (!store) throw new Error('Bitte zuerst ein Minecraft-Profil wählen.');
      const ex = store.exportTheme(b.theme);
      const zip = writeZip(ex.entries);
      const row = await konto.upload({ name: ex.name, description: b.description || '', mcVersion: version, isPublic: !!b.public, textureCount: ex.count, zip, png: ex.png });
      imageCache.clear();
      return json(res, { ok: true, row, size: zip.length, count: ex.count });
    }
    if (p === '/api/konto/holen') {
      if (!store) throw new Error('Bitte zuerst ein Minecraft-Profil wählen.');
      const { row, zip } = await konto.download(String(b.id || ''));
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const file = path.join(DATA_DIR, 'download-' + process.pid + '.zip');
      fs.writeFileSync(file, zip);
      try {
        const r = store.installTheme(file, { name: row.name, mcVersion: row.mc_version }, { replace: !!b.replace, trashDir: path.join(DATA_DIR, 'papierkorb') });
        thumbCache.clear();
        return json(res, { ok: true, theme: r.key, name: row.name, copied: r.copied, skipped: r.skipped, from: row.mc_version, version });
      } finally { fs.rmSync(file, { force: true }); }
    }
    if (p === '/api/fetch-minecraft') {
      // Originalbilder einer Version von Mojang laden (fuer Profile, deren Launcher die Datei nicht offen ablegt, z. B. Lunar)
      const v = String(b.version || '');
      if (!/^[\w.-]{2,40}$/.test(v) || !scanProfiles(ROOTS).some((x) => x.version === v)) throw new Error('Unbekannte Version');
      if (findJar(ROOTS, v)) return json(res, { ok: true, already: true });
      const r = await downloadJar(ROOTS, v);
      return json(res, { ok: true, size: r.size });
    }
    if (p === '/api/activate') {
      // Thema ohne /thema einschalten: options.txt des Profils (wirkt beim naechsten Start)
      if (isRunning(settings.instanceDir)) throw new Error(`Minecraft läuft gerade mit „${path.basename(settings.instanceDir)}“. Im Spiel /thema benutzen oder das Spiel erst schließen.`);
      const t = b.theme && b.theme !== 'normal' ? store.theme(b.theme) : null;
      const r = activateInOptions(settings.instanceDir, version, t ? t.folder : null);
      return json(res, { ok: true, ...r, active: t ? t.folder : null });
    }
    if (p === '/api/revert') { store.revert(b.theme, b.path); return json(res, { ok: true }); }
    if (p === '/api/theme') { const t = store.createTheme(b.name, b.copyFrom); return json(res, { ok: true, theme: { key: t.key, name: t.name, folder: t.folder } }); }
    if (p === '/api/find-color') return json(res, store.findColor(b.theme, b.from, b.tol || 0, b.scope || ''));
    if (p === '/api/replace-color') return json(res, store.replaceColor(b.theme, b.from, b.to, b.tol || 0, b.scope || ''));
    if (p === '/api/undo-batch') return json(res, store.undoBatch());
    if (p === '/api/settings') {
      for (const k of ['showWarnings', 'mirrorDesktop', 'showGrid', 'autoRotate', 'askProfile', 'lastTheme', 'mirrorTheme', 'desktopAssets']) if (k in b) settings[k] = b[k];
      if (store) store.desktopAssets = settings.desktopAssets;
      saveSettings();
      return json(res, { ok: true, settings });
    }
    if (p === '/api/open-folder') {
      const t = store.theme(b.theme);
      openFolder(t ? t.dir : store.packsDir);
      return json(res, { ok: true });
    }
  }
  // statische Dateien
  let file = path.join(PUBLIC, p === '/' ? 'index.html' : p);
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, 'nicht gefunden', 'text/plain');
  return send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream', { 'Cache-Control': 'no-cache' });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => { console.warn(req.url, e.message); json(res, { error: e.message, code: e.code }, 400); });
});

// ---------- Programmfenster ----------
// Windows: Edge/Chrome als eigenes Fenster; Mac/Linux: Chrome/Edge/Brave als App-Fenster, sonst der Standardbrowser.
function openWindow(exitWhenClosed) {
  const url = `http://127.0.0.1:${PORT}/`;
  const profile = IS_WIN ? path.join(process.env.LOCALAPPDATA || DATA_DIR, 'MinecraftTexturen', 'fenster') : path.join(DATA_DIR, 'fenster');
  const child = startWindow(url, profile, !exitWhenClosed);
  if (!child) return;
  if (!exitWhenClosed) { child.unref(); return; }
  child.on('exit', () => {
    // Fenster zu: kurz warten (Neuladen), dann beenden, wenn sich niemand mehr meldet.
    setTimeout(() => { if (Date.now() - lastPing > 4000) process.exit(0); }, 6000);
  });
}

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE' && APP_MODE) { openWindow(false); setTimeout(() => process.exit(0), 1500); return; }
  console.error(e.message);
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Bereit: http://127.0.0.1:${PORT}/`);
  if (APP_MODE) {
    openWindow(true);
    // Beenden, wenn sich kein Fenster mehr meldet: 5 Minuten (Hintergrund-Tabs melden sich seltener;
    // auf dem Mac bleibt der Browser nach dem Schliessen des Fensters oft offen) - vor der ersten Meldung 15 Minuten.
    const started = Date.now();
    setInterval(() => {
      const idle = Date.now() - lastPing;
      if (idle > 15 * 60 * 1000 || (lastPing > started && idle > 5 * 60 * 1000)) process.exit(0);
    }, 30 * 1000);
  }
});
