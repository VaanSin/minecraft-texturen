// Testet den ersten Start ohne passendes Profil: nur ein Lunar-Profil mit Minecraft 1.21.4,
// dessen Originalbilder nirgends liegen -> Willkommensfenster mit Download-Knopf.
//   node tools/erststart-test.mjs   (Port 47814, alles in %TEMP%\mct-erststart; --mac: wie auf dem Mac, Port 47815)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const base = path.join(os.tmpdir(), 'mct-erststart');
fs.rmSync(base, { recursive: true, force: true });
const leer = path.join(base, 'leer');
fs.mkdirSync(leer, { recursive: true });
fs.mkdirSync(path.join(base, 'lunar', 'profiles', 'probe', 'game-versions', '1.21.4'), { recursive: true });
fs.mkdirSync(path.join(base, 'lunar', 'profiles', 'probe', 'mods'), { recursive: true });
process.env.MCT_PORT = process.argv.includes('--mac') ? '47815' : '47814';
if (process.argv.includes('--mac')) process.env.MCT_PLATFORM = 'darwin'; // Mac-Pfade und -Verhalten nachstellen
process.env.MCT_DATA = path.join(base, 'data');
for (const k of ['MCT_INSTANCES', 'MCT_INSTALL', 'MCT_MODRINTH', 'MCT_MINECRAFT']) process.env[k] = leer;
process.env.MCT_LUNAR = path.join(base, 'lunar');
process.env.MCT_KONTO_URL = ''; process.env.MCT_KONTO_KEY = '';
await import('../server.mjs');
