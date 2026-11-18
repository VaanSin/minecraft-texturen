// Testet: Eine neue Version loest eine noch laufende alte ab (Port belegt), dieselbe Version nicht;
// fremde Webseiten werden abgewiesen.
//   node tools/uebernahme-test.mjs   (Port 47820, alles in %TEMP%\mct-uebernahme, keine Fenster)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ED = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = path.join(os.tmpdir(), 'mct-uebernahme');
fs.rmSync(base, { recursive: true, force: true });
const leer = path.join(base, 'leer');
fs.mkdirSync(leer, { recursive: true });
const PORT = 47820, URL = `http://127.0.0.1:${PORT}`;
const env = { ...process.env, MCT_PORT: String(PORT), MCT_DATA: path.join(base, 'data'), MCT_NO_WINDOW: '1', MCT_KONTO_URL: '', MCT_KONTO_KEY: '' };
for (const k of ['MCT_INSTANCES', 'MCT_INSTALL', 'MCT_MODRINTH', 'MCT_MINECRAFT', 'MCT_LUNAR']) env[k] = leer;

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function waitFor(fn, ms = 8000) { const t = Date.now(); while (Date.now() - t < ms) { if (await fn().catch(() => false)) return true; await sleep(150); } return false; }
const version = () => fetch(URL + '/api/version').then((r) => r.json());
function start(dir, extra = {}) {
  const p = spawn(process.execPath, ['--no-warnings', path.join(dir, 'server.mjs'), '--app'], { cwd: dir, env: { ...env, ...extra }, stdio: ['ignore', 'pipe', 'pipe'] });
  p.log = ''; p.stdout.on('data', (d) => { p.log += d; }); p.stderr.on('data', (d) => { p.log += d; });
  return p;
}

// Kopie mit anderer Versionsnummer = "alte" Version, die /api/quit schon kennt
const alt = path.join(base, 'alt');
fs.cpSync(ED, alt, { recursive: true, filter: (s) => !/[\\/](mod-dateien|node_modules|tools)([\\/]|$)/.test(s.slice(ED.length)) });
const pkg = JSON.parse(fs.readFileSync(path.join(alt, 'package.json'), 'utf8'));
const NEU = JSON.parse(fs.readFileSync(path.join(ED, 'package.json'), 'utf8')).version;
pkg.version = '0.9.9'; fs.writeFileSync(path.join(alt, 'package.json'), JSON.stringify(pkg));

console.log('1) Alte Version läuft, neue startet → alte wird abgelöst');
const a = start(alt);
ok(await waitFor(async () => (await version()).version === '0.9.9'), 'alte Version 0.9.9 antwortet');
const b = start(ED);
ok(await waitFor(async () => (await version()).version === NEU), `neue Version ${NEU} hat übernommen`);
ok(await waitFor(async () => !alive(a.pid) || a.exitCode !== null), 'alter Prozess ist beendet');

console.log('2) Dieselbe Version nochmal gestartet → nur Fenster, beendet sich selbst');
const c = start(ED);
ok(await waitFor(async () => c.exitCode !== null, 6000), 'zweiter Start beendet sich');
ok(alive(b.pid) && (await version()).version === NEU, 'erster Prozess läuft weiter');

console.log('3) Fremde Webseiten werden abgewiesen');
const post = (headers) => fetch(URL + '/api/settings', { method: 'POST', headers, body: '{}' }).then((r) => r.status);
ok(await post({ 'Content-Type': 'text/plain' }) === 403, 'POST ohne JSON → 403');
ok(await post({ 'Content-Type': 'application/json', Origin: 'https://boese.example' }) === 403, 'POST von fremder Seite → 403');
ok(await post({ 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${PORT}` }) !== 403, 'POST vom eigenen Fenster geht');
const hostStatus = await new Promise((resolve) => {
  import('node:http').then(({ default: http }) => http.get({ host: '127.0.0.1', port: PORT, path: '/api/info', headers: { Host: 'boese.example:' + PORT } }, (r) => { r.resume(); resolve(r.statusCode); }).on('error', () => resolve(0)));
});
ok(hostStatus === 403, 'fremder Host (DNS-Rebinding) → 403');

console.log('4) Ganz alte Version (ohne /api/version) wird über den Prozess beendet');
b.kill(); await waitFor(async () => !alive(b.pid));
const uralt = path.join(base, 'uralt');
fs.mkdirSync(uralt, { recursive: true });
// Minimaler Stellvertreter fuer 1.5.0: gleicher Dateiname, gleiche Argumente, kein /api/version
fs.writeFileSync(path.join(uralt, 'server.mjs'), `import http from 'node:http';
http.createServer((q, s) => { s.writeHead(404); s.end('alt'); }).listen(${PORT}, '127.0.0.1');`);
const d = start(uralt);
ok(await waitFor(async () => (await fetch(URL + '/api/version')).status === 404), 'Stellvertreter 1.5.0 läuft');
const e = start(ED);
ok(await waitFor(async () => (await version()).version === NEU), 'neue Version hat übernommen');
ok(await waitFor(async () => !alive(d.pid) || d.exitCode !== null), 'alter Prozess ist beendet');

for (const p of [a, b, c, d, e]) try { p.kill(); } catch { /* schon weg */ }
if (fails) { console.log(`\n${fails} Fehler`); for (const [n, p] of Object.entries({ a, b, c, d, e })) console.log(`--- ${n}\n${p.log}`); }
else console.log('\nAlles ok');
process.exit(fails ? 1 : 0);
