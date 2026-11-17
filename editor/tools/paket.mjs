// Baut die fertigen Pakete fuer GitHub-Releases:  node tools/paket.mjs
//   release/MinecraftTexturen-<version>-Windows.zip   (Programm + eigenes Node + Startprogramm)
//   release/MinecraftTexturen-<version>-Mac.zip       (Minecraft Texturen.app mit Node fuer Apple-Chip und Intel)
//   release/themenwechsel-*.jar                        (die /thema-Mod einzeln, fuer Leute ohne Programm)
// Vorlagen (editor/vorlagen) kommen NICHT mit - jeder macht seine eigenen Themen.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { writeZip } from '../lib/zip.mjs';
import { decodePng, encodePng } from '../lib/png.mjs';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.dirname(EDITOR);
const VERSION = JSON.parse(fs.readFileSync(path.join(EDITOR, 'package.json'), 'utf8')).version;
const OUT = path.join(ROOT, 'release');
const STAGE = path.join(OUT, 'Minecraft Texturen');
const CSC = path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(STAGE, 'app'), { recursive: true });
const app = path.join(STAGE, 'app');

// Programmdateien
for (const f of ['server.mjs', 'package.json']) fs.copyFileSync(path.join(EDITOR, f), path.join(app, f));
// Zugang zum Online-Speicher (oeffentliche Werte); ohne die Datei gibt es im Programm keine Konten
if (fs.existsSync(path.join(EDITOR, 'konto.json'))) fs.copyFileSync(path.join(EDITOR, 'konto.json'), path.join(app, 'konto.json'));
else console.warn('ACHTUNG: editor/konto.json fehlt - das Paket hat keine Online-Konten.');
for (const d of ['lib', 'public', 'mod-dateien']) fs.cpSync(path.join(EDITOR, d), path.join(app, d), { recursive: true });
if (fs.readdirSync(path.join(app, 'mod-dateien')).filter((f) => f.endsWith('.jar')).length < 5) throw new Error('mod-dateien unvollständig - erst mod/tools/baue-alle.mjs laufen lassen');

// eigenes Node (das, mit dem dieses Skript laeuft), damit niemand etwas installieren muss
fs.mkdirSync(path.join(app, 'node'), { recursive: true });
fs.copyFileSync(process.execPath, path.join(app, 'node', 'node.exe'));
fs.writeFileSync(path.join(app, 'node', 'LIZENZ.txt'), `node.exe ist Node.js ${process.version} (https://nodejs.org), MIT-Lizenz.\nCopyright Node.js contributors. All rights reserved.\n`);

// Startprogramm mit Symbol
execFileSync(CSC, ['/nologo', '/target:winexe', '/optimize+', `/win32icon:${path.join(EDITOR, 'public', 'icon.ico')}`, '/reference:System.Windows.Forms.dll',
  `/out:${path.join(STAGE, 'Minecraft Texturen.exe')}`, path.join(EDITOR, 'tools', 'Starter.cs')], { stdio: 'inherit' });

// Texte
fs.copyFileSync(path.join(ROOT, 'LICENSE'), path.join(STAGE, 'LIZENZ.txt'));
fs.writeFileSync(path.join(STAGE, 'LIES MICH.txt'), `Minecraft Texturen ${VERSION}
================================

Starten:  "Minecraft Texturen.exe" doppelklicken.
          (Windows fragt beim ersten Mal evtl. "Unbekannter Herausgeber" -> "Weitere Informationen" -> "Trotzdem ausführen".)

Das Programm findet deine Minecraft-Profile von selbst:
  CurseForge, Modrinth App, Lunar Client und den normalen Minecraft Launcher.

So geht's:
  1. Oben ein Thema anlegen ("Thema" -> "Neues Thema").
  2. Links eine Textur wählen und malen.
  3. "Speichern" -> Profil wählen. Fertig.
  Im Spiel: /thema <name> zum Wechseln, /thema normal für die Originale.
  (Den Befehl /thema installiert das Programm automatisch, wo es geht. Für Fabric braucht man die Fabric API.)

Eigener Java-Skin:
  1. Oben "Skins" wählen und selbst malen, ein PNG öffnen oder "Mit KI erstellen" wählen.
  2. Mit "Vorlage" kannst du ein eigenes Bild halbtransparent zum Abpausen auflegen.
  3. "Skin-PNG" exportieren. Im Minecraft Launcher unter Java Edition -> Skins -> Neuer Skin
     das gleiche Modell (Classic oder Slim) wählen und die PNG-Datei importieren.
  Animationen kannst du im Editor abspielen und als Sprite-Sheet exportieren.

Online-Konto (optional): oben "Konto" -> Registrieren mit Benutzername + Passwort.
  Dann sind deine Themen auf jedem PC da, und du kannst Themen von anderen finden.

Deine Themen liegen im Profil unter resourcepacks\\Thema-<Name>.
Einstellungen: %APPDATA%\\MinecraftTexturen
`.replace(/\n/g, '\r\n'));

// ZIP-Einträge mit plattformunabhängigen Pfaden sammeln.
function addTree(entries, dir, prefix, skip = () => false) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip(e.name)) continue;
    const p = path.join(dir, e.name), name = prefix + e.name;
    if (e.isDirectory()) addTree(entries, p, name + '/', skip);
    else entries.push({ name, data: fs.readFileSync(p) });
  }
}

const zip = path.join(OUT, `MinecraftTexturen-${VERSION}-Windows.zip`);
const windowsEntries = [];
addTree(windowsEntries, STAGE, 'Minecraft Texturen/');
fs.writeFileSync(zip, writeZip(windowsEntries));

// ---------- Mac: "Minecraft Texturen.app" mit Node fuer Apple-Chip (arm64) und Intel (x64) ----------
// Node fuer macOS kommt von nodejs.org (gleiche Version wie hier, Pruefsumme aus SHASUMS256.txt) und wird zwischengespeichert.
const NODE_CACHE = path.join(ROOT, '.cache', 'node');
const TAR = path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'tar.exe'); // Windows-tar (Git-tar versteht C:\ nicht)
async function macNode(arch) {
  const name = `node-${process.version}-darwin-${arch}`;
  const dir = path.join(NODE_CACHE, name);
  if (fs.existsSync(path.join(dir, 'bin', 'node'))) return dir;
  fs.mkdirSync(NODE_CACHE, { recursive: true });
  const base = `https://nodejs.org/dist/${process.version}/`;
  const sums = await (await fetch(base + 'SHASUMS256.txt')).text();
  const want = sums.split('\n').find((l) => l.trim().endsWith(' ' + name + '.tar.gz'))?.split(/\s+/)[0];
  if (!want) throw new Error('Keine Prüfsumme für ' + name);
  const r = await fetch(base + name + '.tar.gz');
  if (!r.ok) throw new Error(`Download ${name}: ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (crypto.createHash('sha256').update(buf).digest('hex') !== want) throw new Error('Prüfsumme falsch: ' + name);
  const tgz = path.join(NODE_CACHE, name + '.tar.gz');
  fs.writeFileSync(tgz, buf);
  execFileSync(TAR, ['-xzf', tgz, '-C', NODE_CACHE, `${name}/bin/node`, `${name}/LICENSE`]);
  fs.rmSync(tgz);
  return dir;
}

/** .icns aus dem Programmsymbol (128 px Pixel-Art, scharf vergroessert auf 256/512) */
function macIcon() {
  const src = decodePng(fs.readFileSync(path.join(EDITOR, 'public', 'icon.png')));
  const scale = (n) => {
    const f = n / src.width, data = new Uint8Array(n * n * 4);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const s = ((Math.floor(y / f) * src.width) + Math.floor(x / f)) * 4;
      data.set(src.data.subarray(s, s + 4), (y * n + x) * 4);
    }
    return Buffer.from(encodePng({ width: n, height: n, data }));
  };
  const parts = [['ic07', fs.readFileSync(path.join(EDITOR, 'public', 'icon.png'))], ['ic08', scale(256)], ['ic09', scale(512)]].map(([t, b]) => {
    const h = Buffer.alloc(8); h.write(t, 0, 'ascii'); h.writeUInt32BE(b.length + 8, 4); return Buffer.concat([h, b]);
  });
  const body = Buffer.concat(parts), head = Buffer.alloc(8);
  head.write('icns', 0, 'ascii'); head.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([head, body]);
}

const MAC_ROOT = 'Minecraft Texturen/';
const APP = MAC_ROOT + 'Minecraft Texturen.app/Contents/';
const macEntries = [];
addTree(macEntries, app, APP + 'Resources/app/', (n) => n === 'node'); // gleiche Programmdateien wie Windows, ohne node.exe
for (const arch of ['arm64', 'x64']) {
  const dir = await macNode(arch);
  macEntries.push({ name: `${APP}Resources/node/${arch}/node`, data: fs.readFileSync(path.join(dir, 'bin', 'node')), mode: 0o755 });
  if (arch === 'arm64') macEntries.push({ name: `${APP}Resources/node/LICENSE`, data: fs.readFileSync(path.join(dir, 'LICENSE')) });
}
macEntries.push({ name: `${APP}Resources/icon.icns`, data: macIcon() });
macEntries.push({ name: `${APP}MacOS/Minecraft Texturen`, mode: 0o755, data: Buffer.from(`#!/bin/bash
# Startet den kleinen Server; er oeffnet das Programmfenster (Chrome/Edge/Brave als App-Fenster, sonst den Standardbrowser)
# und beendet sich, wenn das Fenster zu ist.
RES="$(cd "$(dirname "$0")/../Resources" && pwd)"
case "$(uname -m)" in
  arm64) NODE="$RES/node/arm64/node" ;;
  *)     NODE="$RES/node/x64/node" ;;
esac
mkdir -p "$HOME/Library/Logs"
cd "$RES/app" || exit 1
exec "$NODE" --no-warnings server.mjs --app >> "$HOME/Library/Logs/MinecraftTexturen.log" 2>&1
`) });
macEntries.push({ name: `${APP}Info.plist`, data: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Minecraft Texturen</string>
  <key>CFBundleDisplayName</key><string>Minecraft Texturen</string>
  <key>CFBundleIdentifier</key><string>de.mctexturen.app</string>
  <key>CFBundleVersion</key><string>${VERSION}</string>
  <key>CFBundleShortVersionString</key><string>${VERSION}</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>Minecraft Texturen</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>LSMinimumSystemVersion</key><string>13.5</string>
  <key>LSUIElement</key><true/>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
`) });
macEntries.push({ name: MAC_ROOT + 'LIZENZ.txt', data: fs.readFileSync(path.join(ROOT, 'LICENSE')) });
macEntries.push({ name: MAC_ROOT + 'LIES MICH.txt', data: Buffer.from(`Minecraft Texturen ${VERSION} für Mac (macOS 13.5 oder neuer, Apple-Chip und Intel)
=================================================================

Starten:
  1. "Minecraft Texturen.app" in den Ordner "Programme" ziehen (geht auch ohne).
  2. Doppelklicken. Das Programmfenster öffnet sich in Chrome, Edge oder Brave
     (falls vorhanden) - sonst im normalen Browser (z. B. Safari).

Beim ersten Start meldet macOS: "Minecraft Texturen kann nicht geöffnet werden",
weil das Programm nicht bei Apple registriert ist. So geht's trotzdem:
  - Systemeinstellungen -> Datenschutz & Sicherheit -> ganz unten bei
    "Minecraft Texturen wurde blockiert" auf "Dennoch öffnen" klicken.
  - Ältere macOS-Versionen: Rechtsklick auf die App -> "Öffnen" -> "Öffnen".
  - Oder im Terminal:  xattr -dr com.apple.quarantine "/Applications/Minecraft Texturen.app"

Das Programm findet deine Minecraft-Profile von selbst:
  CurseForge (~/Documents/curseforge), Modrinth App, Lunar Client und den Minecraft Launcher.

So geht's:
  1. Oben ein Thema anlegen ("Thema" -> "Neues Thema").
  2. Links eine Textur wählen und malen.
  3. "Speichern" -> Profil wählen. Fertig.
  Im Spiel: /thema <name> zum Wechseln, /thema normal für die Originale.

Das Programm beendet sich von selbst ein paar Minuten nachdem das Fenster zu ist.
Einstellungen: ~/Library/Application Support/MinecraftTexturen
Protokoll bei Problemen: ~/Library/Logs/MinecraftTexturen.log
`) });
const macZip = path.join(OUT, `MinecraftTexturen-${VERSION}-Mac.zip`);
fs.writeFileSync(macZip, writeZip(macEntries));

// Mods einzeln
for (const f of fs.readdirSync(path.join(EDITOR, 'mod-dateien')).filter((x) => x.endsWith('.jar'))) fs.copyFileSync(path.join(EDITOR, 'mod-dateien', f), path.join(OUT, f));

console.log(`Fertig: ${zip} (${(fs.statSync(zip).size / 1e6).toFixed(1)} MB)`);
console.log(`Fertig: ${macZip} (${(fs.statSync(macZip).size / 1e6).toFixed(1)} MB)`);
for (const f of fs.readdirSync(OUT)) console.log('  ' + f);
