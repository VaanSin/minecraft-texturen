// Alles, was je nach Betriebssystem anders ist: Datenordner, Programmfenster, Ordner oeffnen,
// laufende Minecraft-Prozesse. MCT_PLATFORM (win32/darwin/linux) nur fuer Tests.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, execFileSync, spawn } from 'node:child_process';

export const PLATFORM = process.env.MCT_PLATFORM || process.platform;
export const IS_MAC = PLATFORM === 'darwin';
export const IS_WIN = PLATFORM === 'win32';

/** Ordner fuer Einstellungen, Sitzung, geladene Minecraft-Dateien. */
export function dataDir(env = process.env, home = os.homedir()) {
  if (env.MCT_DATA) return env.MCT_DATA;
  if (IS_WIN) return path.join(env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'MinecraftTexturen');
  if (IS_MAC) return path.join(home, 'Library', 'Application Support', 'MinecraftTexturen');
  return path.join(env.XDG_DATA_HOME || path.join(home, '.local', 'share'), 'MinecraftTexturen');
}

/** Chromium-Browser, die ein eigenes App-Fenster koennen (--app). Erster vorhandener gewinnt. */
export function appBrowser(env = process.env, home = os.homedir()) {
  let cands;
  if (IS_WIN) {
    const pf86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', pf = env.ProgramFiles || 'C:\\Program Files', local = env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    cands = [
      path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ];
  } else if (IS_MAC) {
    const apps = ['Google Chrome.app/Contents/MacOS/Google Chrome', 'Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      'Brave Browser.app/Contents/MacOS/Brave Browser', 'Chromium.app/Contents/MacOS/Chromium', 'Vivaldi.app/Contents/MacOS/Vivaldi', 'Arc.app/Contents/MacOS/Arc'];
    cands = apps.flatMap((a) => [path.join('/Applications', a), path.join(home, 'Applications', a)]);
  } else {
    cands = ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge', '/snap/bin/chromium'];
  }
  return cands.find((c) => fs.existsSync(c)) || null;
}

/** Adresse im normalen Browser oeffnen (wenn es kein App-Fenster gibt). */
export function openUrl(url) {
  const done = () => {}; // Fehler (z. B. kein Browser) nicht abstuerzen lassen
  if (IS_WIN) execFile('cmd.exe', ['/c', 'start', '', url], done);
  else execFile(IS_MAC ? 'open' : 'xdg-open', [url], done);
}

/** Ordner im Explorer / Finder / Dateimanager zeigen. */
export function openFolder(dir) {
  execFile(IS_WIN ? 'explorer.exe' : IS_MAC ? 'open' : 'xdg-open', [dir], () => {});
}

/** Befehlszeilen aller laufenden Java-Prozesse (fuer "laeuft Minecraft gerade?"). */
export function javaCommandLines() {
  try {
    if (IS_WIN) {
      return execFileSync('powershell', ['-NoProfile', '-Command', "Get-CimInstance Win32_Process -Filter \"Name='javaw.exe' or Name='java.exe'\" | ForEach-Object CommandLine"], { encoding: 'utf8', timeout: 8000 }).split(/\r?\n/);
    }
    return execFileSync('ps', ['-axo', 'command'], { encoding: 'utf8', timeout: 8000 }).split('\n').filter((l) => /java/i.test(l));
  } catch { return []; }
}

/** Welcher Prozess lauscht auf diesem Port? { pid, command } oder null. */
export function portOwner(port) {
  try {
    let pid;
    if (IS_WIN) {
      pid = Number(execFileSync('powershell', ['-NoProfile', '-Command', `(Get-NetTCPConnection -LocalPort ${Number(port)} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess`], { encoding: 'utf8', timeout: 8000 }).trim());
      if (!pid) return null;
      const command = execFileSync('powershell', ['-NoProfile', '-Command', `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`], { encoding: 'utf8', timeout: 8000 }).trim();
      return { pid, command };
    }
    pid = Number(execFileSync('lsof', ['-nP', `-iTCP:${Number(port)}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8', timeout: 8000 }).trim().split('\n')[0]);
    if (!pid) return null;
    return { pid, command: execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8', timeout: 8000 }).trim() };
  } catch { return null; }
}

/** App-Fenster starten. Gibt den Kindprozess zurueck (oder null, wenn nur ein Browser-Tab aufging). */
export function startWindow(url, profileDir, detached) {
  const browser = appBrowser();
  if (!browser) { openUrl(url); return null; }
  fs.mkdirSync(profileDir, { recursive: true });
  return spawn(browser, [`--app=${url}`, `--user-data-dir=${profileDir}`, '--window-size=1560,960', '--no-first-run', '--no-default-browser-check', '--disable-features=Translate'], { detached, stdio: 'ignore' });
}
