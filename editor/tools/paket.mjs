// Baut das fertige Windows-Paket fuer GitHub-Releases:  node tools/paket.mjs
//   release/MinecraftTexturen-<version>-Windows.zip   (Programm + eigenes Node + Startprogramm)
//   release/themenwechsel-*.jar                        (die /thema-Mod einzeln, fuer Leute ohne Programm)
// Vorlagen (editor/vorlagen) kommen NICHT mit - jeder macht seine eigenen Themen.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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

Online-Konto (optional): oben "Konto" -> Registrieren mit Benutzername + Passwort.
  Dann sind deine Themen auf jedem PC da, und du kannst Themen von anderen finden.

Deine Themen liegen im Profil unter resourcepacks\\Thema-<Name>.
Einstellungen: %APPDATA%\\MinecraftTexturen
`.replace(/\n/g, '\r\n'));

// Zip (mit Windows-Bordmitteln)
const zip = path.join(OUT, `MinecraftTexturen-${VERSION}-Windows.zip`);
execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${STAGE}' -DestinationPath '${zip}' -CompressionLevel Optimal`], { stdio: 'inherit' });

// Mods einzeln
for (const f of fs.readdirSync(path.join(EDITOR, 'mod-dateien')).filter((x) => x.endsWith('.jar'))) fs.copyFileSync(path.join(EDITOR, 'mod-dateien', f), path.join(OUT, f));

console.log(`Fertig: ${zip} (${(fs.statSync(zip).size / 1e6).toFixed(1)} MB)`);
for (const f of fs.readdirSync(OUT)) console.log('  ' + f);
