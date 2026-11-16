// Baut /thema fuer alle Loader und Versionen (CurseForge, Modrinth App, Lunar Client, normaler Launcher).
//   node tools/baue-alle.mjs
// Ergebnis: build/themenwechsel-1.0.0-<loader>-<version>.jar und eine Kopie in ../editor/mod-dateien
// (von dort installiert der Texturen-Editor die passende Datei automatisch ins gewaehlte Profil).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve as resolveNames } from './namen.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CF = path.join(os.homedir(), 'curseforge', 'minecraft');
const INSTALL = path.join(CF, 'Install');
const LIB = path.join(INSTALL, 'libraries');
const JDK = path.join(INSTALL, 'runtime', 'java-runtime-epsilon', 'windows-x64', 'java-runtime-epsilon', 'bin');
const VERSION = '1.0.0';
const BESCHREIBUNG = 'Wechselt mit /thema zwischen eigenen Texturen-Themen (Ressourcenpakete Thema-<Name>), z. B. /thema lilanacht oder /thema normal.';

const TARGETS = [
  { id: 'neoforge-1.21.1', mc: '1.21.1', names: 'mojmap', loader: 'neoforge', loaderJson: 'neoforge-21.1.250', release: 21, loaderMin: '21.1.0', range: '[1.21.1,1.21.2)' },
  { id: 'neoforge-1.21.8', mc: '1.21.8', names: 'mojmap', loader: 'neoforge', loaderJson: 'neoforge-21.8.54', release: 21, loaderMin: '21.8.0', range: '[1.21.8,1.21.9)' },
  { id: 'forge-1.20.1', mc: '1.20.1', names: 'srg', loader: 'forge', loaderJson: 'forge-47.4.0', release: 17, loaderMajor: 47, range: '[1.20.1,1.20.2)', packFormat: 15 },
  { id: 'forge-1.19.2', mc: '1.19.2', names: 'srg', loader: 'forge', loaderJson: 'forge-43.5.0', release: 17, loaderMajor: 43, range: '[1.19.2,1.19.3)', packFormat: 9 },
  { id: 'fabric-1.20.1', mc: '1.20.1', names: 'intermediary', loader: 'fabric', loaderJson: 'fabric-loader-0.18.4-1.20.1', release: 17, instance: 'trains' },
  // Ab 26.1 ist Minecraft unobfuskiert: der normale Quelltext (src/main/java) mit Hutkrempe, je Version gegen deren Jar gebaut
  { id: 'fabric-26.1.2', mc: '26.1.2', modern: true, range: '26.1.x' },
  { id: 'fabric-26.2', mc: '26.2', modern: true, range: '26.2.x' },
  { id: 'fabric-26.3', mc: '26.3', modern: true, range: '26.3.x' },
];

// Wo Minecraft-Versionen und Bibliotheken liegen koennen (CurseForge, normaler Launcher, Modrinth App)
const APPDATA = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const ROOTS = [
  { versions: path.join(INSTALL, 'versions'), libs: LIB },
  { versions: path.join(APPDATA, '.minecraft', 'versions'), libs: path.join(APPDATA, '.minecraft', 'libraries') },
  { versions: path.join(APPDATA, 'ModrinthApp', 'meta', 'versions'), libs: path.join(APPDATA, 'ModrinthApp', 'meta', 'libraries') },
];
// Ordner mit mods, in denen eine Fabric API liegen kann
const MOD_FOLDERS = [
  ...dirsIn(path.join(CF, 'Instances')).map((d) => path.join(d, 'mods')),
  ...dirsIn(path.join(APPDATA, 'ModrinthApp', 'profiles')).map((d) => path.join(d, 'mods')),
  ...dirsIn(path.join(os.homedir(), '.lunarclient', 'profiles')).map((d) => path.join(d, 'mods')),
];
function dirsIn(d) { return fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => path.join(d, e.name)) : []; }

/** Minecraft-Jar + Bibliotheken einer Version, egal welcher Launcher sie geladen hat. */
function modernMinecraft(mc) {
  for (const r of ROOTS) {
    const names = fs.existsSync(r.versions) ? fs.readdirSync(r.versions).filter((n) => n === mc || n.startsWith(mc + '-')) : [];
    for (const n of names.sort((a, b) => a.length - b.length)) {
      const jar = path.join(r.versions, n, n + '.jar'), js = path.join(r.versions, n, n + '.json');
      if (!fs.existsSync(jar) || !fs.existsSync(js)) continue;
      const libs = [];
      for (const l of JSON.parse(fs.readFileSync(js, 'utf8')).libraries || []) {
        const p = l.downloads?.artifact?.path ? path.join(r.libs, l.downloads.artifact.path) : null;
        if (p && fs.existsSync(p)) libs.push(p);
      }
      const loader = findJar(path.join(r.libs, 'net', 'fabricmc', 'fabric-loader'), /^fabric-loader-.*\.jar$/) || findJar(path.join(LIB, 'net', 'fabricmc', 'fabric-loader'), /^fabric-loader-.*\.jar$/);
      return { jar, libs, loader };
    }
  }
  return null;
}

/** Fabric API fuer genau diese Version - sonst die naechstliegende 26er (nur zum Kompilieren). */
function fabricApiFor(mc) {
  const all = MOD_FOLDERS.filter((d) => fs.existsSync(d)).flatMap((d) => fs.readdirSync(d).filter((f) => /^fabric-api-.*\+26[.\d]*\.jar$/.test(f)).map((f) => path.join(d, f)));
  const exact = all.find((f) => path.basename(f).endsWith('+' + mc + '.jar'));
  if (exact) return { file: exact, exact: true };
  const near = all.sort().reverse()[0];
  return near ? { file: near, exact: false } : null;
}

function buildModern(t) {
  console.log(`\n== ${t.id}`);
  const work = path.join(os.tmpdir(), 'themenwechsel-' + t.id);
  fs.rmSync(work, { recursive: true, force: true });
  const classes = path.join(work, 'classes');
  fs.mkdirSync(classes, { recursive: true });
  const mc = modernMinecraft(t.mc);
  if (!mc) throw new Error(`Minecraft ${t.mc} fehlt - einmal in einem Launcher starten`);
  if (!mc.loader) throw new Error('Fabric Loader fehlt');
  const api = fabricApiFor(t.mc);
  if (!api) throw new Error('Keine Fabric API fuer 26.x gefunden');
  console.log(`   Minecraft: ${mc.jar}\n   Fabric API: ${path.basename(api.file)}${api.exact ? '' : ' (naechstliegende, nur zum Kompilieren)'}`);
  const cp = [mc.jar, mc.loader, ...mc.libs, ...unzipJars(api.file, path.join(work, 'fapi'))];
  const srcRoot = path.join(ROOT, 'src', 'main', 'java');
  const files = [];
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith('.java')) files.push(p); } })(srcRoot);
  fs.writeFileSync(path.join(work, 'quellen.txt'), files.map((f) => `"${f.replace(/\\/g, '/')}"`).join('\n'));
  fs.writeFileSync(path.join(work, 'cp.txt'), `-cp "${cp.map((p) => p.replace(/\\/g, '/')).join(';')}"`);
  execFileSync(path.join(JDK, 'javac.exe'), ['-nowarn', '-proc:none', '-encoding', 'UTF-8', '--release', '25', '-d', classes, '@' + path.join(work, 'cp.txt'), '@' + path.join(work, 'quellen.txt')], { stdio: 'inherit' });
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'main', 'resources', 'fabric.mod.json'), 'utf8'));
  meta.version = VERSION;
  meta.depends = { ...meta.depends, fabricloader: '>=0.18.0', minecraft: t.range };
  fs.writeFileSync(path.join(classes, 'fabric.mod.json'), JSON.stringify(meta, null, 2));
  for (const e of fs.readdirSync(path.join(ROOT, 'src', 'main', 'resources'))) if (e !== 'fabric.mod.json') fs.cpSync(path.join(ROOT, 'src', 'main', 'resources', e), path.join(classes, e), { recursive: true });
  return classes;
}

const only = process.argv[2];

function mavenPath(name) {
  const [g, a, v, c] = name.split(':');
  const [ver, ext = 'jar'] = v.split('@');
  return path.join(LIB, ...g.split('.'), a, ver, `${a}-${ver}${c ? '-' + c.split('@')[0] : ''}.${c?.includes('@') ? c.split('@')[1] : ext}`);
}

function libsOf(versionName) {
  const f = path.join(INSTALL, 'versions', versionName, versionName + '.json');
  if (!fs.existsSync(f)) return [];
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  const out = [];
  for (const l of j.libraries || []) {
    const p = l.downloads?.artifact?.path ? path.join(LIB, l.downloads.artifact.path) : l.name ? mavenPath(l.name) : null;
    if (p && fs.existsSync(p)) out.push(p);
  }
  if (j.inheritsFrom) out.push(...libsOf(j.inheritsFrom));
  return out;
}

function findJar(dir, re) {
  if (!fs.existsSync(dir)) return null;
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) { const r = findJar(p, re); if (r) return r; }
    else if (re.test(d.name)) return p;
  }
  return null;
}

function unzipJars(zipFile, into) {
  // eingebettete Jars (Fabric API) auspacken - mit PowerShell, um keine Abhaengigkeit zu brauchen
  fs.mkdirSync(into, { recursive: true });
  execFileSync('powershell', ['-NoProfile', '-Command', `Add-Type -AssemblyName System.IO.Compression.FileSystem; $z=[System.IO.Compression.ZipFile]::OpenRead('${zipFile}'); foreach($e in $z.Entries){ if($e.FullName -like 'META-INF/jars/*.jar'){ [System.IO.Compression.ZipFileExtensions]::ExtractToFile($e, (Join-Path '${into}' ($e.FullName -replace '.*/','')), $true) } }; $z.Dispose()`]);
  return fs.readdirSync(into).filter((f) => f.endsWith('.jar')).map((f) => path.join(into, f));
}

function fill(text, names, update) {
  // //#if UPDATE ... //#else ... //#endif
  text = text.replace(/\/\/#if UPDATE\n([\s\S]*?)\/\/#else\n([\s\S]*?)\/\/#endif\n/g, (_, a, b) => (update ? a : b));
  return text.replace(/\$\{([A-Za-z]+)(?:\.([A-Za-z]+))?\}/g, (m, cls, mem) => {
    const v = mem ? names.members[cls + '.' + mem] : names.classes[cls];
    if (!v) throw new Error('Name fehlt: ' + m);
    return v;
  });
}

function build(t) {
  if (t.modern) return pack(t, buildModern(t));
  console.log(`\n== ${t.id}`);
  const work = path.join(os.tmpdir(), 'themenwechsel-' + t.id);
  fs.rmSync(work, { recursive: true, force: true });
  const src = path.join(work, 'src', 'de', 'mctexturen', 'themenwechsel');
  const classes = path.join(work, 'classes');
  fs.mkdirSync(src, { recursive: true });
  fs.mkdirSync(classes, { recursive: true });

  const names = resolveNames(t.mc, t.names);
  const update = !!names.members['Options.updateResourcePacks'];
  console.log(`   Namen (${t.names}): getInstance=${names.members['Minecraft.getInstance']}, Umschalten über ${update ? 'updateResourcePacks' : 'Ersatzweg (Optionen + Neuladen)'}`);

  // Quellen: gemeinsame Logik + erzeugte Teile
  fs.copyFileSync(path.join(ROOT, 'src', 'main', 'java', 'de', 'mctexturen', 'themenwechsel', 'Themen.java'), path.join(src, 'Themen.java'));
  fs.copyFileSync(path.join(ROOT, 'multi', 'Befehl.java'), path.join(src, 'Befehl.java'));
  fs.writeFileSync(path.join(src, 'Spiel.java'), fill(fs.readFileSync(path.join(ROOT, 'multi', 'Spiel.java.vorlage'), 'utf8').replace(/\r\n/g, '\n'), names, update));
  const glue = { neoforge: 'neoforge/ThemenwechselNeo', forge: 'forge/ThemenwechselForge', fabric: 'fabric/ThemenwechselFabric' }[t.loader];
  fs.writeFileSync(path.join(src, path.basename(glue) + '.java'), fill(fs.readFileSync(path.join(ROOT, 'multi', glue + '.java.vorlage'), 'utf8').replace(/\r\n/g, '\n'), names, update));

  // Klassenpfad
  const cp = [];
  if (t.loader === 'fabric') {
    const inst = path.join(CF, 'Instances', t.instance);
    const mcJar = findJar(path.join(inst, '.fabric', 'remappedJars'), /^client-intermediary\.jar$/);
    if (!mcJar) throw new Error(`Minecraft ${t.mc} (intermediary) fehlt - Profil "${t.instance}" einmal starten`);
    cp.push(mcJar);
    const api = fs.readdirSync(path.join(inst, 'mods')).find((f) => /^fabric-api-.*\.jar$/.test(f));
    if (!api) throw new Error('Fabric API fehlt im Profil ' + t.instance);
    cp.push(...unzipJars(path.join(inst, 'mods', api), path.join(work, 'fapi')));
  } else {
    const mcJar = findJar(path.join(LIB, 'net', 'minecraft', 'client'), new RegExp(`^client-${t.mc.replace(/\./g, '\\.')}-\\d+\\.\\d+-srg\\.jar$`));
    if (!mcJar) throw new Error(`Minecraft ${t.mc} (${t.names}) fehlt`);
    cp.push(mcJar);
    if (t.loader === 'neoforge') {
      const v = t.loaderJson.replace('neoforge-', '');
      cp.push(path.join(LIB, 'net', 'neoforged', 'neoforge', v, `neoforge-${v}-universal.jar`));
    } else {
      const v = `${t.mc}-${t.loaderJson.replace('forge-', '')}`;
      cp.push(path.join(LIB, 'net', 'minecraftforge', 'forge', v, `forge-${v}-universal.jar`));
      // @Mod und FMLEnvironment stecken in den FML-Bibliotheken, die nicht in der Versionsdatei stehen
      for (const a of ['javafmllanguage', 'fmlcore', 'fmlloader']) cp.push(path.join(LIB, 'net', 'minecraftforge', a, v, `${a}-${v}.jar`));
    }
  }
  cp.push(...libsOf(t.loaderJson), ...libsOf(t.mc));
  const missing = cp.filter((p) => !fs.existsSync(p));
  if (missing.length) throw new Error('Fehlt: ' + missing.join(', '));

  // Kompilieren
  const files = fs.readdirSync(src).map((f) => path.join(src, f));
  fs.writeFileSync(path.join(work, 'quellen.txt'), files.map((f) => `"${f.replace(/\\/g, '/')}"`).join('\n'));
  fs.writeFileSync(path.join(work, 'cp.txt'), `-cp "${cp.map((p) => p.replace(/\\/g, '/')).join(';')}"`);
  execFileSync(path.join(JDK, 'javac.exe'), ['-nowarn', '-proc:none', '-encoding', 'UTF-8', '--release', String(t.release), '-d', classes, '@' + path.join(work, 'cp.txt'), '@' + path.join(work, 'quellen.txt')], { stdio: 'inherit' });

  // Beschreibungsdateien
  if (t.loader === 'neoforge') {
    fs.mkdirSync(path.join(classes, 'META-INF'), { recursive: true });
    fs.writeFileSync(path.join(classes, 'META-INF', 'neoforge.mods.toml'), `modLoader = "javafml"
loaderVersion = "[1,)"
license = "MIT"

[[mods]]
modId = "themenwechsel"
version = "${VERSION}"
displayName = "Themenwechsel"
authors = "Minecraft Texturen"
description = '''${BESCHREIBUNG}'''

[[dependencies.themenwechsel]]
modId = "neoforge"
type = "required"
versionRange = "[${t.loaderMin},)"
ordering = "NONE"
side = "CLIENT"

[[dependencies.themenwechsel]]
modId = "minecraft"
type = "required"
versionRange = "${t.range}"
ordering = "NONE"
side = "CLIENT"
`);
  } else if (t.loader === 'forge') {
    fs.mkdirSync(path.join(classes, 'META-INF'), { recursive: true });
    fs.writeFileSync(path.join(classes, 'META-INF', 'mods.toml'), `modLoader = "javafml"
loaderVersion = "[${t.loaderMajor},)"
license = "MIT"

[[mods]]
modId = "themenwechsel"
version = "${VERSION}"
displayName = "Themenwechsel"
authors = "Minecraft Texturen"
description = '''${BESCHREIBUNG}'''
displayTest = "IGNORE_ALL_VERSION"

[[dependencies.themenwechsel]]
modId = "forge"
mandatory = true
versionRange = "[${t.loaderMajor},)"
ordering = "NONE"
side = "CLIENT"

[[dependencies.themenwechsel]]
modId = "minecraft"
mandatory = true
versionRange = "${t.range}"
ordering = "NONE"
side = "CLIENT"
`);
    fs.writeFileSync(path.join(classes, 'pack.mcmeta'), JSON.stringify({ pack: { description: 'Themenwechsel', pack_format: t.packFormat } }, null, 2));
  } else {
    fs.writeFileSync(path.join(classes, 'fabric.mod.json'), JSON.stringify({
      schemaVersion: 1, id: 'themenwechsel', version: VERSION, name: 'Themenwechsel', description: BESCHREIBUNG,
      authors: ['Minecraft Texturen'], license: 'MIT', environment: 'client',
      entrypoints: { client: ['de.mctexturen.themenwechsel.ThemenwechselFabric'] },
      depends: { fabricloader: '>=0.14.0', minecraft: '~' + t.mc, java: '>=' + t.release, 'fabric-command-api-v2': '*' },
    }, null, 2));
  }

  pack(t, classes);
}

function pack(t, classes) {
  const out = path.join(ROOT, 'build', `themenwechsel-${VERSION}-${t.id}.jar`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.rmSync(out, { force: true });
  execFileSync(path.join(JDK, 'jar.exe'), ['--create', '--file', out, '-C', classes, '.']);
  const copy = path.join(ROOT, '..', 'editor', 'mod-dateien');
  fs.mkdirSync(copy, { recursive: true });
  fs.copyFileSync(out, path.join(copy, path.basename(out)));
  console.log(`   fertig: ${path.basename(out)} (${fs.statSync(out).size} Bytes)`);
}

let fehler = 0;
for (const t of TARGETS) {
  if (only && !t.id.includes(only)) continue;
  try { build(t); } catch (e) { fehler++; console.error(`   FEHLER: ${e.message}`); }
}
process.exit(fehler ? 1 : 0);
