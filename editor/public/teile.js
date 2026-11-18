// KI aus Textur-Teilen: Man gibt kleine Teile (z. B. eine Leiste aus 6 Pixeln von Rot nach Orange oder ein
// kleines Funkel-Motiv), sagt, wie es sich bewegen soll und wofuer – heraus kommt die fertige Animation.
// Reine Rechnung ohne DOM (tools/teile-test.mjs).

/** Bewegungen fuer Teile. frames/ticks = Vorgabe. */
export const PIECE_MOTIONS = [
  { id: 'swirl', name: 'Wirbeln', icon: '🌀', frames: 16, ticks: 2, re: /(wirbel|strudel|spiral|dreh|rotier|kreisel|vortex|swirl)/ },
  { id: 'cycle', name: 'Farbe läuft durch', icon: '🌈', frames: 12, ticks: 2, re: /(lauf|durch|fliess|fließ|flow|welle|wander|lauflicht|stroem|ström)/ },
  { id: 'pulse', name: 'Pulsieren', icon: '💡', frames: 12, ticks: 3, re: /(puls|atm|leucht|glueh|glüh|poch|herzschlag|blinken)/ },
  { id: 'flicker', name: 'Flackern wie Feuer', icon: '🔥', frames: 16, ticks: 2, re: /(flacker|feuer|brenn|flamm|loder|glut)/ },
  { id: 'shimmer', name: 'Glanz läuft drüber', icon: '✨', frames: 14, ticks: 2, re: /(schimmer|glanz|glaenz|glänz|spiegel|blitz)/ },
  { id: 'sparkle', name: 'Funkeln', icon: '⭐', frames: 16, ticks: 3, re: /(funkel|glitzer|stern|sparkle|blink)/ },
  { id: 'rise', name: 'Aufsteigen', icon: '⬆️', frames: 16, ticks: 2, re: /(steig|aufwaerts|aufwärts|blase|bubble|nach oben|schweb)/ },
];

const norm = (s) => String(s || '').toLowerCase();
/** Bewegung aus dem Text ("die Enderperle soll wirbeln") – null, wenn nichts passt. */
export function pieceMotionFromText(text) {
  const t = norm(text);
  return PIECE_MOTIONS.find((m) => m.re.test(t))?.id || null;
}

const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const frac = (v) => v - Math.floor(v);

/**
 * Ein Teil auswerten: duenne Leiste (1–2 Pixel hoch oder breit) = Farbverlauf in Reihenfolge,
 * sonst ein kleines Motiv. img = { w, h, data } (RGBA).
 */
export function analyzePiece(img, name = 'Teil') {
  const { w, h, data } = img;
  const thin = Math.min(w, h) <= 2 && Math.max(w, h) >= 2;
  if (thin) {
    const along = w >= h;
    const n = along ? w : h, mid = Math.floor((along ? h : w) / 2);
    const colors = [];
    for (let i = 0; i < n; i++) {
      const x = along ? i : mid, y = along ? mid : i, k = (y * w + x) * 4;
      if (data[k + 3] < 30) continue;
      const c = [data[k], data[k + 1], data[k + 2], data[k + 3]];
      const last = colors[colors.length - 1];
      if (!last || last.some((v, j) => Math.abs(v - c[j]) > 2)) colors.push(c);
    }
    if (colors.length >= 2) return { kind: 'ramp', name, colors, w, h, data };
  }
  // Motiv: auf sichtbare Pixel zuschneiden
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] >= 30) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  if (x1 < 0) throw new Error('Im Teil sind keine sichtbaren Pixel.');
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, out = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y++) out.set(data.subarray(((y + y0) * w + x0) * 4, ((y + y0) * w + x1 + 1) * 4), y * cw * 4);
  return { kind: 'sprite', name, w: cw, h: ch, data: out };
}

/** Leiste selbst bauen: von einer Farbe zur anderen in "steps" Schritten. */
export function rampFrom(from, to, steps = 6) {
  const n = Math.max(2, Math.min(32, steps | 0));
  return Array.from({ length: n }, (_, i) => from.map((v, j) => Math.round(v + ((to[j] ?? v) - v) * (i / (n - 1)))).slice(0, 3).concat(255));
}

/** Farben einer Textur nach Helligkeit sortiert (wenn keine Leiste gegeben ist). */
export function rampFromImage(img) {
  const seen = new Map();
  for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3] >= 30) seen.set(((img.data[i] >> 3) << 10) | ((img.data[i + 1] >> 3) << 5) | (img.data[i + 2] >> 3), [img.data[i], img.data[i + 1], img.data[i + 2], 255]);
  const cols = [...seen.values()].sort((a, b) => lum(...a) - lum(...b));
  if (cols.length <= 8) return cols.length >= 2 ? cols : [[40, 40, 40, 255], [230, 230, 230, 255]];
  return Array.from({ length: 8 }, (_, i) => cols[Math.round((i / 7) * (cols.length - 1))]);
}

/** Farbe auf der Leiste bei t (0..1), weich zwischen den Stufen – aber pixelig genug (auf Stufen gerundet). */
function sample(ramp, t, smooth = false) {
  const n = ramp.length;
  const p = clamp01(t) * (n - 1);
  if (!smooth) return ramp[Math.round(p)];
  const i = Math.floor(p), f = p - i, a = ramp[i], b = ramp[Math.min(n - 1, i + 1)];
  return a.map((v, j) => Math.round(v + (b[j] - v) * f));
}
/** Leiste als Schleife (hin und zurueck), damit die Animation ohne Sprung wieder von vorn beginnt. */
const loopT = (t) => { const f = frac(t); return f < 0.5 ? f * 2 : 2 - f * 2; };

/** Pseudo-Zufall ohne Math.random (gleiche Eingabe = gleiches Bild) */
function hash(x, y, s = 0) { let h = Math.imul(x * 374761393 + y * 668265263 + s * 2246822519, 1274126177); h ^= h >>> 13; h = Math.imul(h, 1103515245); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function noise(x, y, s, px, py) {
  // weiche, in x/y periodische Wert-Rauschen (px/py = Periode), damit die Schleife nahtlos ist
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const w = (a, b) => hash(((a % px) + px) % px, ((b % py) + py) % py, s);
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const top = w(xi, yi) + (w(xi + 1, yi) - w(xi, yi)) * sx, bot = w(xi, yi + 1) + (w(xi + 1, yi + 1) - w(xi, yi + 1)) * sx;
  return top + (bot - top) * sy;
}

/**
 * Die Animation bauen.
 *   base: { w, h, data } – Zieltextur (erstes Bild)
 *   ramp: Farben (dunkel -> hell oder wie die Leiste es vorgibt) oder null
 *   sprite: kleines Motiv { w, h, data } oder null
 *   motion: id aus PIECE_MOTIONS, frames, dir ('right'|'left'|'up'|'down'), variant 0..2
 *   variant 0 = Umriss bleibt, nur innen; 1 = ganze Textur; 2 = mit dem Original gemischt
 * Rueckgabe: Liste von Einzelbildern (Uint8ClampedArray, gleiche Groesse wie base).
 */
export function pieceAnimation({ base, ramp, sprite, motion = 'swirl', frames = 16, dir = 'right', variant = 0 }) {
  const { w, h, data } = base;
  const R = ramp?.length >= 2 ? ramp : rampFromImage(base);
  const n = Math.max(2, Math.min(64, frames | 0));
  const opaque = (x, y) => x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3] >= 30;
  // Umriss = sichtbare Pixel mit durchsichtigem Nachbarn
  const edge = new Uint8Array(w * h);
  let minL = 1e9, maxL = -1e9, cx = 0, cy = 0, cnt = 0, maxR = 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!opaque(x, y)) continue;
    const k = (y * w + x) * 4;
    edge[y * w + x] = !opaque(x - 1, y) || !opaque(x + 1, y) || !opaque(x, y - 1) || !opaque(x, y + 1) ? 1 : 0;
    const l = lum(data[k], data[k + 1], data[k + 2]);
    minL = Math.min(minL, l); maxL = Math.max(maxL, l);
    cx += x; cy += y; cnt++;
  }
  if (!cnt) throw new Error('Die Zieltextur ist leer.');
  cx /= cnt; cy /= cnt;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (opaque(x, y)) maxR = Math.max(maxR, Math.hypot(x - cx, y - cy));
  const span = Math.max(1, maxL - minL);
  const keepEdge = variant === 0;
  const shade = variant === 2; // Licht und Schatten vom Original uebernehmen
  // Sparkle-/Aufsteige-Punkte: feste Plaetze im sichtbaren Bereich
  const spots = [];
  if (motion === 'sparkle' || motion === 'rise') {
    const want = Math.max(3, Math.round(cnt / (sprite ? 22 : 14)));
    for (let i = 0, tries = 0; spots.length < want && tries < 4000; tries++, i++) {
      const x = Math.floor(hash(i, 1, 7) * w), y = Math.floor(hash(i, 2, 7) * h);
      if (opaque(x, y) && !edge[y * w + x]) spots.push({ x, y, phase: hash(i, 3, 7), speed: hash(i, 4, 7) > 0.6 ? 2 : 1 });
    }
  }
  const top = R[R.length - 1];
  const sp = sprite || { w: 3, h: 3, data: plusSprite(top.map((v, j) => (j < 3 ? Math.round(v + (255 - v) * 0.7) : 255))) };
  const out = [];
  const dirV = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] }[dir] || [1, 0];
  for (let k = 0; k < n; k++) {
    const ph = k / n;
    const img = new Uint8ClampedArray(data);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!opaque(x, y)) continue;
      const i = y * w + x, q = i * 4;
      if (keepEdge && edge[i] && motion !== 'sparkle' && motion !== 'rise') continue;
      const lt = (lum(data[q], data[q + 1], data[q + 2]) - minL) / span; // 0 dunkel .. 1 hell
      let c = null;
      if (motion === 'swirl') {
        const a = Math.atan2(y - cy, x - cx) / (2 * Math.PI), r = Math.hypot(x - cx, y - cy) / maxR;
        const arms = variant === 1 ? 2 : 1;
        const t = loopT(a * arms + r * 1.35 - ph * (dir === 'left' ? -1 : 1));
        c = sample(R, clamp01(t * 0.8 + lt * 0.2));
      } else if (motion === 'cycle') {
        const pos = (dirV[0] ? (dirV[0] > 0 ? x / w : 1 - x / w) : (dirV[1] > 0 ? y / h : 1 - y / h));
        c = sample(R, loopT(pos * 0.6 + lt * 0.4 - ph));
      } else if (motion === 'pulse') {
        const s = 0.5 - 0.5 * Math.cos(ph * 2 * Math.PI);
        c = sample(R, clamp01(lt * 0.55 + s * 0.45));
      } else if (motion === 'flicker') {
        const f = 0.5, py = Math.max(1, Math.round(h * f));
        const v = noise(x * f, (y + ph * h) * f, 3, Math.max(1, Math.round(w * f)), py) * 0.65 + noise(x * f * 2, (y + ph * h) * f * 2, 9, Math.max(1, Math.round(w * f * 2)), py * 2) * 0.35;
        const low = y / Math.max(1, h - 1); // unten heller, oben dunkler – wie Glut
        c = sample(R, clamp01((v - 0.5) * 1.6 + 0.5 + (low - 0.5) * 0.5 + (lt - 0.5) * 0.3));
      } else if (motion === 'shimmer') {
        const band = frac((x + y) / (w + h) - ph * 1.0);
        const hit = Math.max(0, 1 - Math.abs(band - 0.5) * 7);
        c = sample(R, clamp01(lt * 0.85 + hit * 0.6));
      } else {
        c = sample(R, clamp01(lt)); // Grundfarbe fuer Funkeln/Aufsteigen
      }
      if (keepEdge && edge[i]) c = null; // Rand bleibt original
      if (!c) continue;
      const f = shade ? 0.55 + lt * 0.75 : 1;
      img[q] = Math.min(255, Math.round(c[0] * f));
      img[q + 1] = Math.min(255, Math.round(c[1] * f));
      img[q + 2] = Math.min(255, Math.round(c[2] * f));
    }
    if (motion === 'sparkle' || motion === 'rise') {
      for (const s of spots) {
        let px = s.x, py = s.y, alpha;
        if (motion === 'sparkle') {
          // ganze Zahl als Tempo, sonst springt die Schleife; halbe Zeit an, halbe aus
          alpha = Math.max(0, Math.sin(frac(ph * s.speed + s.phase) * 2 * Math.PI)) ** 1.5;
        } else {
          const t = frac(ph + s.phase);
          py = Math.round(s.y - t * h * 0.8); px = s.x + Math.round(Math.sin((t + s.phase) * 6) * 0.6);
          alpha = Math.sin(t * Math.PI);
        }
        if (alpha <= 0.05) continue;
        stamp(img, w, h, sp, px - (sp.w >> 1), py - (sp.h >> 1), alpha, (x, y) => opaque(x, y) && (!keepEdge || !edge[y * w + x]));
      }
    }
    out.push(img);
  }
  return out;
}

function plusSprite(c) {
  const d = new Uint8ClampedArray(3 * 3 * 4);
  for (const [x, y, a] of [[1, 0, 200], [0, 1, 200], [1, 1, 255], [2, 1, 200], [1, 2, 200]]) d.set([c[0], c[1], c[2], a], (y * 3 + x) * 4);
  return d;
}

function stamp(img, w, h, sp, ox, oy, alpha, allowed) {
  for (let y = 0; y < sp.h; y++) for (let x = 0; x < sp.w; x++) {
    const k = (y * sp.w + x) * 4, a = (sp.data[k + 3] / 255) * alpha;
    const X = ox + x, Y = oy + y;
    if (a < 0.05 || X < 0 || Y < 0 || X >= w || Y >= h || !allowed(X, Y)) continue;
    const q = (Y * w + X) * 4;
    for (let j = 0; j < 3; j++) img[q + j] = Math.round(img[q + j] * (1 - a) + sp.data[k + j] * a);
  }
}

const VARIANT_NAMES = ['Umriss bleibt, innen bewegt', 'Ganze Textur', 'Mit Licht und Schatten vom Original'];

/** Drei Entwuerfe wie bei der Partikel-KI: [{ name, w, h, frames, ticks, changes }] */
export function pieceDrafts({ base, pieces = [], motion, frames, ticks, dir }) {
  const ramp = pieces.find((p) => p.kind === 'ramp')?.colors || null;
  const sprite = pieces.find((p) => p.kind === 'sprite') || null;
  const m = PIECE_MOTIONS.find((x) => x.id === motion) || PIECE_MOTIONS[0];
  const n = frames || m.frames, tk = ticks || m.ticks;
  return VARIANT_NAMES.map((name, variant) => {
    const fr = pieceAnimation({ base, ramp, sprite, motion: m.id, frames: n, dir, variant });
    const changes = fr.slice(1).some((f) => f.some((v, i) => v !== fr[0][i]));
    return { name, w: base.w, h: base.h, frames: fr, ticks: tk, changes };
  });
}
