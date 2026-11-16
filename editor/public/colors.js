// Farb-Helfer
export const hex2 = (v) => v.toString(16).padStart(2, '0');
export const toHex = ([r, g, b]) => ('#' + hex2(r) + hex2(g) + hex2(b)).toUpperCase();
export function fromHex(h) {
  const m = String(h).trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const css = ([r, g, b, a = 255]) => `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`;
export const keyOf = (r, g, b, a) => ((r << 24) >>> 0) + (g << 16) + (b << 8) + a;
export const unkey = (k) => [(k >>> 24) & 255, (k >>> 16) & 255, (k >>> 8) & 255, k & 255];
export const percent = (a) => Math.round((a / 255) * 100) + ' %';

export function hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

export function fromHsl(h, s, l) {
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/**
 * Hellere oder dunklere Variante wie in der Pixel-Kunst: dunkel = leicht Richtung Blau/Lila,
 * hell = leicht Richtung Gelb. amount -1..1 (negativ = dunkler).
 */
export function shadeColor(rgba, amount) {
  const [h, s, l] = hsl(rgba);
  const towards = (from, to, t) => { let d = ((to - from + 540) % 360) - 180; return (from + d * t + 360) % 360; };
  let nh = h, ns = s, nl = l;
  if (s > 0.08) nh = amount < 0 ? towards(h, 245, Math.min(0.35, -amount * 0.6)) : towards(h, 55, Math.min(0.3, amount * 0.5));
  if (amount < 0) { nl = l * (1 + amount); ns = Math.min(1, s + -amount * 0.12); }
  else { nl = l + (1 - l) * amount; ns = Math.max(0, s - amount * 0.1); }
  const out = fromHsl(nh, ns, Math.max(0, Math.min(1, nl)));
  return [out[0], out[1], out[2], rgba[3] ?? 255];
}

/** Regenbogen-Sortierung: bunte Farben nach Farbton, Grautoene ans Ende (hell nach dunkel). */
export function rainbowSort(list, get = (x) => x) {
  return list.slice().sort((A, B) => {
    const a = hsl(get(A)), b = hsl(get(B));
    const ga = a[1] < 0.12, gb = b[1] < 0.12;
    if (ga !== gb) return ga ? 1 : -1;
    if (ga) return b[2] - a[2];
    return a[0] - b[0] || b[2] - a[2];
  });
}

// Schnellfarben: ein paar Gruentoene + bunte Farben + Grautoene
export const QUICK = [
  '#0E4900', '#1B6305', '#2F8216', '#35A812', '#4FFF23', '#6AFF3D', '#D9FFEB',
  '#FF4FD8', '#FF5D6C', '#FF9A3C', '#FFE14D', '#5CFF7A', '#3CC8FF', '#2E6BFF', '#8F6BFF', '#B05CFF',
  '#FFFFFF', '#C6C6C6', '#8B8B8B', '#555555', '#2B2B2B', '#000000',
];
