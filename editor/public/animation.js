// Animationen: Einzelbilder untereinander (wie Minecraft sie speichert) + Effekt-Assistent.
// Reine Funktionen ohne Oberflaeche, damit sie auch ohne Browser testbar sind.
import { hsl, fromHsl } from './colors.js';

/** Anzahl Einzelbilder einer Textur */
export const frameCount = (d) => (d.frameH && d.frameH < d.h ? Math.floor(d.h / d.frameH) : 1);
export const frameHeight = (d) => (d.frameH && d.frameH < d.h ? d.frameH : d.h);

/** Pixel eines Einzelbildes (Kopie) */
export function getFrame(d, i) {
  const fh = frameHeight(d), n = d.w * fh * 4;
  return d.data.slice(i * n, (i + 1) * n);
}

/** Einzelbilder wieder zu einem Streifen zusammensetzen */
export function joinFrames(frames, w, fh) {
  const n = w * fh * 4, out = new Uint8ClampedArray(n * frames.length);
  frames.forEach((f, i) => out.set(f, i * n));
  return out;
}

/** Ab welcher Minecraft-Version / fuer welche Texturen Animationen im Spiel laufen */
export function canAnimate(path) {
  if (/^(block|item|particle|mob_effect|painting)\//.test(path)) return { ok: true };
  if (path.startsWith('gui/sprites/')) return { ok: true, note: 'GUI-Bilder (Hotbar, XP-Leiste, Herzen …) können ab Minecraft 1.20.2 animiert werden.' };
  if (path.startsWith('entity/')) return { ok: false, why: 'Mobs, Rüstungen und Spieler bewegen sich in Minecraft ohne Mods nicht als Bilderfolge. Mit Mods wie „Entity Texture Features“ geht es.' };
  return { ok: false, why: 'Diese Textur liegt nicht auf einer Minecraft-Bildersammlung (Atlas) – dort spielt Minecraft keine Animation ab.' };
}

/** Ticks -> Text (20 Ticks = 1 Sekunde) */
export function speedText(ticks) {
  const fps = 20 / ticks;
  return `${ticks} ${ticks === 1 ? 'Tick' : 'Ticks'} = ${fps >= 1 ? (Math.round(fps * 10) / 10).toString().replace('.', ',') + ' Bilder pro Sekunde' : (Math.round(ticks / 2) / 10).toString().replace('.', ',') + ' Sek. pro Bild'}`;
}

// ---------- Effekt-Assistent ----------
export const EFFECTS = [
  { id: 'shine', icon: '✨', name: 'Lauflicht', tip: 'Ein heller Glanzstreifen wandert durch – wie bei einer Neon-XP-Leiste', frames: 12, ticks: 2 },
  { id: 'wave', icon: '〰️', name: 'Welle', tip: 'Helle und dunkle Wellen fließen von links nach rechts', frames: 12, ticks: 2 },
  { id: 'pulse', icon: '💡', name: 'Leuchten', tip: 'Wird langsam heller und wieder dunkler (pulsiert)', frames: 10, ticks: 2, interpolate: true },
  { id: 'rainbow', icon: '🌈', name: 'Regenbogen', tip: 'Alle Farben wandern durch den Regenbogen', frames: 16, ticks: 2 },
  { id: 'sparkle', icon: '⭐', name: 'Funkeln', tip: 'Einzelne Pixel blitzen hell auf – wie Diamanten', frames: 8, ticks: 3 },
  { id: 'flow', icon: '🌊', name: 'Fließen', tip: 'Das Bild läuft endlos weiter – wie Wasser, Lava oder ein Förderband', frames: 16, ticks: 2 },
  { id: 'blink', icon: '👁️', name: 'Blinken', tip: 'Abwechselnd hell und gedimmt – z. B. für Warnungen', frames: 2, ticks: 10 },
  { id: 'tint', icon: '🎨', name: 'Farbwechsel', tip: 'Färbt sich langsam zur gewählten Farbe und zurück', frames: 12, ticks: 2, interpolate: true },
  { id: 'rotate', icon: '🌀', name: 'Drehen', tip: 'Dreht das Motiv einmal um seinen Mittelpunkt', frames: 16, ticks: 2 },
  { id: 'bounce', icon: '⬆️', name: 'Schweben', tip: 'Hebt das Motiv an und lässt es wieder zurückgleiten', frames: 12, ticks: 2 },
  { id: 'expand', icon: '💥', name: 'Ausbreiten', tip: 'Lässt das Motiv wachsen und wieder zur Ausgangsgröße zurückkehren', frames: 12, ticks: 2 },
];

const MOVEMENT = new Set(['rotate', 'bounce', 'expand']);

export function visibleBounds(data, w, h) {
  let left = w, top = h, right = -1, bottom = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!data[(y * w + x) * 4 + 3]) continue;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  return right < 0 ? null : { left, right, top, bottom };
}

function moveFrames(kind, base, w, h, n, strength, dir) {
  const box = visibleBounds(base, w, h);
  if (!box) return Array.from({ length: n }, () => base.slice());
  const cx = (box.left + box.right) / 2, cy = (box.top + box.bottom) / 2;
  const rx = (box.right - box.left + 1) / 2, ry = (box.bottom - box.top + 1) / 2;
  const roomX = Math.min(cx + 0.5, w - 0.5 - cx), roomY = Math.min(cy + 0.5, h - 0.5 - cy);
  const frames = [base.slice()];
  for (let t = 1; t < n; t++) {
    const phase = 2 * Math.PI * t / n;
    const a = kind === 'rotate' ? phase * (dir === 'left' ? -1 : 1) : 0;
    const cos = Math.cos(a), sin = Math.sin(a);
    const extentX = Math.abs(cos) * rx + Math.abs(sin) * ry;
    const extentY = Math.abs(sin) * rx + Math.abs(cos) * ry;
    const beat = (1 - Math.cos(phase)) / 2;
    let scale = Math.min(roomX / extentX, roomY / extentY, 1), dy = 0;
    if (kind === 'bounce') {
      const bottomSpace = h - 1 - box.bottom, room = Math.max(box.top, bottomSpace);
      const rise = h * 0.3 * strength;
      scale = 1 - Math.min(0.28, Math.max(0, rise - room) / ry) * beat;
      dy = Math.round(Math.min(rise * beat, room + ry * (1 - scale))) * (box.top >= bottomSpace ? -1 : 1);
    }
    if (kind === 'expand') {
      const growth = Math.min(roomX / rx, roomY / ry, 1 + 0.75 * strength);
      scale = growth > 1.05 ? 1 + (growth - 1) * beat : 1 - 0.45 * strength * beat;
    }
    const frame = new Uint8ClampedArray(base.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (x - cx) / scale, sy0 = (y - cy - dy) / scale;
      const sx = Math.round(cx + cos * dx + sin * sy0);
      const sy = Math.round(cy - sin * dx + cos * sy0);
      if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue;
      const i = (y * w + x) * 4, j = (sy * w + sx) * 4;
      for (let c = 0; c < 4; c++) frame[i + c] = base[j + c];
    }
    frames.push(frame);
  }
  return frames;
}

/** Kleiner, wiederholbarer Zufall (gleiche Eingabe = gleiches Ergebnis) */
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** Farbe in HSL aendern: dl = Helligkeit (-1..1), dh = Farbton (Grad) */
function shiftPixel(src, i, dst, { dl = 0, dh = 0 }) {
  const [h, s, l] = hsl([src[i], src[i + 1], src[i + 2]]);
  const [r, g, b] = fromHsl((h + dh + 360) % 360, s, Math.max(0, Math.min(1, l + dl)));
  dst[i] = r; dst[i + 1] = g; dst[i + 2] = b; dst[i + 3] = src[i + 3];
}

/**
 * Animation aus einem Einzelbild erzeugen.
 * base: Pixel (w*fh*4), opts: { frames, strength 0..1, dir ('right'|'down'|'left'|'up'), color [r,g,b] }
 * Gibt ein Array von Einzelbildern zurueck. Bewegungen nehmen die Transparenz des Motivs mit.
 */
export function makeEffect(kind, base, w, fh, opts = {}) {
  const n = Math.max(2, Math.min(64, opts.frames || 8));
  const k = Math.max(0.05, Math.min(1, opts.strength ?? 0.5));
  if (MOVEMENT.has(kind)) return moveFrames(kind, base, w, fh, n, k, opts.dir);
  const out = [];
  for (let t = 0; t < n; t++) {
    const f = new Uint8ClampedArray(base.length);
    const phase = t / n;
    for (let y = 0; y < fh; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (kind === 'flow') {
        // ganzes Bild verschieben (mit Umlauf)
        const dx = opts.dir === 'right' ? -Math.round(phase * w) : opts.dir === 'left' ? Math.round(phase * w) : 0;
        const dy = opts.dir === 'down' || !opts.dir ? -Math.round(phase * fh) : opts.dir === 'up' ? Math.round(phase * fh) : 0;
        const sx = ((x + dx) % w + w) % w, sy = ((y + dy) % fh + fh) % fh, s = (sy * w + sx) * 4;
        f[i] = base[s]; f[i + 1] = base[s + 1]; f[i + 2] = base[s + 2]; f[i + 3] = base[s + 3];
        continue;
      }
      if (base[i + 3] === 0) continue;
      if (kind === 'pulse') shiftPixel(base, i, f, { dl: Math.sin(phase * 2 * Math.PI) * 0.35 * k });
      else if (kind === 'rainbow') shiftPixel(base, i, f, { dh: phase * 360 + x * (opts.spread ?? 4) });
      else if (kind === 'blink') shiftPixel(base, i, f, { dl: t % 2 ? -0.35 * k : 0.08 * k });
      else if (kind === 'wave') {
        const v = Math.sin(((x / Math.max(8, w / 2)) - phase) * 2 * Math.PI);
        shiftPixel(base, i, f, { dl: v * 0.25 * k });
      } else if (kind === 'shine') {
        // schraeger Glanzstreifen, der einmal komplett durchlaeuft
        const band = Math.max(2, Math.round((w + fh) * 0.12));
        const pos = phase * (w + fh + band * 2) - band;
        const d = Math.abs(x + y * 0.6 - pos);
        if (d < band) shiftPixel(base, i, f, { dl: (1 - d / band) * 0.45 * k });
        else { f[i] = base[i]; f[i + 1] = base[i + 1]; f[i + 2] = base[i + 2]; f[i + 3] = base[i + 3]; }
      } else if (kind === 'tint') {
        const c = opts.color || [255, 255, 255], m = (1 - Math.cos(phase * 2 * Math.PI)) / 2 * k;
        f[i] = base[i] + (c[0] - base[i]) * m; f[i + 1] = base[i + 1] + (c[1] - base[i + 1]) * m; f[i + 2] = base[i + 2] + (c[2] - base[i + 2]) * m; f[i + 3] = base[i + 3];
      } else { // sparkle
        f[i] = base[i]; f[i + 1] = base[i + 1]; f[i + 2] = base[i + 2]; f[i + 3] = base[i + 3];
      }
    }
    if (kind === 'sparkle') {
      // pro Bild ein paar zufaellige, aber feste Funken (+ schwaecherer Kreuz-Schein)
      const r = rng(1234 + t * 7919), count = Math.max(1, Math.round(w * fh * 0.02 * (0.5 + k)));
      for (let s = 0; s < count; s++) {
        const x = Math.floor(r() * w), y = Math.floor(r() * fh), i = (y * w + x) * 4;
        if (base[i + 3] === 0) continue;
        shiftPixel(base, i, f, { dl: 0.5 * k + 0.2 });
        for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + ax, yy = y + ay;
          if (xx < 0 || yy < 0 || xx >= w || yy >= fh) continue;
          const j = (yy * w + xx) * 4;
          if (base[j + 3]) shiftPixel(base, j, f, { dl: 0.18 * k + 0.05 });
        }
      }
    }
    out.push(f);
  }
  return out;
}

/** Zwischenbild aus zwei Bildern (fuer die Vorschau mit "weich ueberblenden") */
export function blend(a, b, m) {
  const out = new Uint8ClampedArray(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] + (b[i] - a[i]) * m;
  return out;
}

/** Reihenfolge und Dauer der Bilder wie Minecraft: frames-Liste oder einfach 0..n-1 */
export function timeline(anim, n) {
  const ft = anim?.frametime || 1;
  const list = Array.isArray(anim?.frames) && anim.frames.length ? anim.frames : [...Array(n).keys()];
  return list.map((f) => (typeof f === 'number' ? { index: f, time: ft } : { index: f.index, time: f.time || ft })).filter((f) => f.index >= 0 && f.index < n);
}

// ---------- Sprite-Sheets ----------
/**
 * Moegliche Raster eines Sprite-Sheets fuer eine Textur (Seitenverhaeltnis w:fh).
 * Gibt Vorschlaege [{ fw, fh, cols, rows, n }] zurueck, der in Texturgroesse zuerst.
 */
export function sheetLayouts(W, H, w, fh) {
  const out = [];
  for (let cols = 1; cols <= 64; cols++) {
    if (W % cols) continue;
    const cw = W / cols, ch = (cw * fh) / w;
    if (!Number.isInteger(ch) || ch < 1 || H % ch) continue;
    const rows = H / ch;
    if (cols * rows > 256) continue;
    out.push({ fw: cw, fh: ch, cols, rows, n: cols * rows });
  }
  // Texturgroesse zuerst, dann groessere Bilder (mehr Pixel), dann kleinere
  return out.sort((a, b) => (b.fw === w) - (a.fw === w) || (b.fw >= w) - (a.fw >= w) || a.n - b.n);
}

/** Einzelbilder aus einem Sprite-Sheet (Zeile fuer Zeile); ganz leere Bilder am Ende fallen weg */
export function framesFromSheet(img, { fw, fh, cols, rows }) {
  const frames = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const f = new Uint8ClampedArray(fw * fh * 4);
    for (let y = 0; y < fh; y++) f.set(img.data.subarray(((r * fh + y) * img.width + c * fw) * 4, ((r * fh + y) * img.width + c * fw + fw) * 4), y * fw * 4);
    frames.push(f);
  }
  while (frames.length > 1 && frames[frames.length - 1].every((v, i) => i % 4 !== 3 || v === 0)) frames.pop();
  return frames;
}

/** Einzelbilder zu einem Sprite-Sheet (Raster ohne Luecken – laesst sich wieder einlesen) */
export function toSheet(frames, w, fh, cols = Math.ceil(Math.sqrt(frames.length))) {
  const rows = Math.ceil(frames.length / cols), W = w * cols, H = fh * rows, data = new Uint8ClampedArray(W * H * 4);
  frames.forEach((f, k) => {
    const ox = (k % cols) * w, oy = Math.floor(k / cols) * fh;
    for (let y = 0; y < fh; y++) data.set(f.subarray(y * w * 4, (y + 1) * w * 4), ((oy + y) * W + ox) * 4);
  });
  return { w: W, h: H, data, cols, rows };
}
