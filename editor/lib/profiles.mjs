// Profile aller Launcher: pruefen was geht, Themen-Mod (/thema) automatisch installieren,
// Thema ohne Mod einschalten (options.txt).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { scanProfiles, profileByDir, findJar } from './launchers.mjs';
import { javaCommandLines } from './system.mjs';

/** Themen-Ordner: neu "Thema-<Name>", die ersten hiessen "Border-<Name>" */
export const THEME_PREFIXES = ['Thema-', 'Border-'];
export const isThemeFolder = (n) => THEME_PREFIXES.some((p) => n.startsWith(p) && n.length > p.length);
const isThemePack = (e) => /^(file\/)?(Thema|Border)-./.test(e);

/** Passende /thema-Datei fuer Loader + Version, z. B. themenwechsel-1.0.0-neoforge-1.21.1.jar */
export function modJarFor(loader, version, modDirs) {
  const all = modDirs.filter((d) => fs.existsSync(d)).flatMap((d) => fs.readdirSync(d).filter((f) => /^themenwechsel-.*\.jar$/.test(f)).map((f) => path.join(d, f)));
  const l = loader.toLowerCase();
  const exact = all.filter((f) => f.endsWith(`-${l}-${version}.jar`)).sort().reverse()[0];
  if (exact) return exact;
  // Ab 26.1 (ohne Verschleierung) passt die Datei fuer die ganze Reihe, z. B. 26.1.2 auch fuer 26.1.1
  const m = /^(2\d\.\d+)/.exec(version);
  if (l === 'fabric' && m) return all.filter((f) => new RegExp(`-fabric-${m[1].replace('.', '\\.')}(\\.\\d+)?\\.jar$`).test(f)).sort().reverse()[0] || null;
  return null;
}

function themesIn(dir) {
  const packs = path.join(dir, 'resourcepacks');
  if (!fs.existsSync(packs)) return [];
  return fs.readdirSync(packs, { withFileTypes: true }).filter((d) => d.isDirectory() && isThemeFolder(d.name) && fs.existsSync(path.join(packs, d.name, 'pack.mcmeta'))).map((d) => d.name);
}

/** Alles Wissenswerte zu einem Profil (p aus scanProfiles). */
export function profileInfo(p, modDirs, roots) {
  const jar = findJar(roots, p.version);
  const fits = !!jar;
  const mods = path.join(p.dir, 'mods');
  const modFiles = fs.existsSync(mods) ? fs.readdirSync(mods) : [];
  const modJar = fits && p.loader !== 'Vanilla' ? modJarFor(p.loader, p.version, modDirs) : null;
  const canCommand = !!modJar;
  let why = '';
  if (!fits) why = `Originalbilder für Minecraft ${p.version} fehlen – einmal in ${p.launcherName} starten oder hier laden`;
  else if (!canCommand) why = p.loader === 'Vanilla'
    ? `Ohne Mod-Loader gibt es kein /thema – im Thema-Menü „Im Spiel einschalten“ nutzen`
    : `/thema gibt es für ${p.loader} ${p.version} nicht – im Thema-Menü „Im Spiel einschalten“ nutzen`;
  return {
    id: p.id, name: p.name, launcher: p.launcher, launcherName: p.launcherName, dir: p.dir, version: p.version, loader: p.loader,
    jar, fits, canDownload: !fits && /^\d/.test(p.version), canCommand, why, themes: themesIn(p.dir), modJar,
    fabricApi: modFiles.some((f) => /^fabric-api-.*\.jar$/i.test(f)),
    needsFabricApi: p.loader === 'Fabric',
    mod: canCommand ? modState(mods, modFiles, modJar) : 'geht nicht',
  };
}

/** Profil-Info zu einem Ordner (fuer das gerade offene Profil). */
export function infoForDir(dir, modDirs, roots) {
  const p = profileByDir(roots, dir);
  return p ? profileInfo(p, modDirs, roots) : null;
}

export function listProfiles(roots, modDirs) {
  return scanProfiles(roots).map((p) => profileInfo(p, modDirs, roots))
    .sort((a, b) => (b.fits - a.fits) || a.launcherName.localeCompare(b.launcherName, 'de') || a.name.localeCompare(b.name, 'de'));
}

const hash = (f) => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');

function modState(mods, modFiles, modJar) {
  const have = modFiles.filter((f) => /^themenwechsel-.*\.jar$/i.test(f));
  if (!have.length) return 'fehlt';
  return have.length === 1 && have[0] === path.basename(modJar) && hash(path.join(mods, have[0])) === hash(modJar) ? 'da' : 'alt';
}

/** Legt die passende Themen-Mod ins Profil (oder ersetzt eine alte/falsche Version). */
export function ensureMod(dir, modDirs, roots) {
  const info = infoForDir(dir, modDirs, roots);
  if (!info) return { state: 'geht nicht', why: 'Profil nicht gefunden' };
  if (!info.canCommand) return { state: 'geht nicht', why: info.why, fabricApi: info.fabricApi };
  if (info.mod === 'da') return { state: 'da', fabricApi: info.fabricApi, needsFabricApi: info.needsFabricApi };
  const mods = path.join(dir, 'mods');
  fs.mkdirSync(mods, { recursive: true });
  try {
    for (const f of fs.readdirSync(mods)) if (/^themenwechsel-.*\.jar$/i.test(f) && f !== path.basename(info.modJar)) fs.rmSync(path.join(mods, f));
    fs.copyFileSync(info.modJar, path.join(mods, path.basename(info.modJar)));
    return { state: 'installiert', file: path.basename(info.modJar), fabricApi: info.fabricApi, needsFabricApi: info.needsFabricApi };
  } catch (e) {
    // Unter Windows ist die Datei gesperrt, solange Minecraft laeuft
    return { state: 'gesperrt', why: 'Minecraft läuft gerade – die Mod wird beim nächsten Speichern installiert.', fabricApi: info.fabricApi, error: e.message };
  }
}

/** Laeuft gerade ein Minecraft mit diesem Profil-Ordner? */
export function isRunning(dir) {
  const needle = path.resolve(dir).toLowerCase();
  return javaCommandLines().some((l) => l.toLowerCase().includes(needle));
}

/**
 * Thema ohne Mod einschalten: options.txt des Profils anpassen (wirkt beim naechsten Start).
 * folder = "Thema-Wald" oder null fuer "normal". Ab 1.13 heissen Pakete "file/<Ordner>", davor nur "<Ordner>".
 */
export function activateInOptions(dir, version, folder) {
  const file = path.join(dir, 'options.txt');
  const old = /^1\.([0-9]|1[0-2])(\.|$)/.test(version);
  const id = folder ? (old ? folder : 'file/' + folder) : null;
  let lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split(/\r?\n/) : [];
  const parse = (key) => {
    const l = lines.find((x) => x.startsWith(key + ':'));
    try { return l ? JSON.parse(l.slice(key.length + 1)) : []; } catch { return []; }
  };
  const set = (key, list) => {
    const val = key + ':' + JSON.stringify(list);
    const i = lines.findIndex((x) => x.startsWith(key + ':'));
    if (i >= 0) lines[i] = val; else lines.splice(lines.length && lines[lines.length - 1] === '' ? lines.length - 1 : lines.length, 0, val);
  };
  const packs = parse('resourcePacks').filter((e) => !isThemePack(e));
  if (id) packs.push(id);
  set('resourcePacks', packs);
  if (lines.some((x) => x.startsWith('incompatibleResourcePacks:'))) set('incompatibleResourcePacks', parse('incompatibleResourcePacks').filter((e) => !isThemePack(e)));
  if (!lines.length || lines[lines.length - 1] !== '') lines.push('');
  fs.writeFileSync(file, lines.join('\n'), 'utf8');
  return { resourcePacks: packs };
}

/** Welches Thema steht in options.txt? (Ordnername oder null) */
export function activeInOptions(dir) {
  const file = path.join(dir, 'options.txt');
  if (!fs.existsSync(file)) return null;
  const l = fs.readFileSync(file, 'utf8').split(/\r?\n/).find((x) => x.startsWith('resourcePacks:'));
  try { return (JSON.parse(l.slice('resourcePacks:'.length)).filter(isThemePack).pop() || '').replace(/^file\//, '') || null; } catch { return null; }
}
