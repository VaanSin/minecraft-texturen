// Lokale Partikel- und Sprite-Animationen. Die Animation beginnt mit dem gelieferten Motiv.
import { EFFECTS, makeEffect, visibleBounds } from './animation.js';
import { COLOR_WORDS, hex, norm, parsePrompt } from './ki.js';

export const MOTION_EFFECTS = EFFECTS.filter(({ id }) =>
  ['rotate', 'bounce', 'expand', 'flow', 'pulse', 'sparkle', 'shine', 'wave', 'blink', 'tint'].includes(id));

const DEFAULT_COLOR = ['#48ABFF', '#2451CF', '#C3F9FF'];
const PARTICLE_WORD = /partikel|\bparticles?\b/;
const SHAPES = [
  ['stripes', /(?:streifen|strahlen|streak|stripe)/],
  ['rings', /(?:ring|kreise?|wellenringe?)/],
  ['spiral', /(?:spirale?|wirbel|strudel|vortex)/],
  ['smoke', /(?:rauch|nebel|wolke|smoke)/],
  ['sparks', /(?:funken|explosion|staub|sterne?|spark|glitzer)/],
];

export function wantsParticleWizard(text) {
  return PARTICLE_WORD.test(norm(text));
}

export function parseMotionPrompt(text) {
  const raw = norm(text);
  const cleanText = text.replace(/#[\da-f]{6}\b/gi, '');
  const parsed = parsePrompt(cleanText, new Set());
  const shape = SHAPES.find(([, test]) => test.test(raw))?.[0] || 'stripes';
  let effect = parsed.animate;
  if (/\b(?:explosion|explodier\w*|ausbreit\w*|expand\w*)\b/.test(raw)) effect = 'expand';
  if (/\b(?:dreh\w*|rotier\w*|rotation|rotate|spin|kreisend\w*|uhrzeigersinn)\b/.test(raw)) effect = 'rotate';
  const explicitEffect = MOTION_EFFECTS.some((item) => item.id === effect);
  if (!explicitEffect) {
    effect = { stripes: 'rotate', rings: 'expand', spiral: 'rotate', smoke: 'bounce', sparks: 'sparkle' }[shape];
  }
  const colors = parsed.style && !parsed.style.keepColors
    ? [parsed.style.colors.main, parsed.style.colors.second, parsed.style.colors.light] : DEFAULT_COLOR;
  const explicit = norm(cleanText).split(/\s+/).filter(Boolean)
    .map((word) => COLOR_WORDS[word] || COLOR_WORDS[word.replace(/(?:en|er|es|em|e)$/, '')]).filter(Boolean);
  const customHex = text.match(/#[\da-f]{6}\b/gi) || [];
  const named = [...new Set([...customHex, ...explicit])].map(hex);
  const primary = named[0] || hex(colors[0]);
  const shadow = named[1] || (named.length ? mix(primary, [8, 12, 25], 0.52) : hex(colors[1]));
  const highlight = named[2] || (named.length ? mix(primary, [240, 249, 255], 0.58) : hex(colors[2]));
  const palette = [primary, shadow, highlight];
  const num = (pattern, min, max) => {
    const value = Number(raw.match(pattern)?.[1]);
    return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : null;
  };
  const dir = /\b(?:gegen den uhrzeigersinn|gegen uhrzeigersinn|linksherum|links|counterclockwise)\b/.test(raw) ? 'left'
    : /\b(?:oben|aufwaerts|up)\b/.test(raw) ? 'up'
      : /\b(?:unten|abwaerts|down)\b/.test(raw) ? 'down' : 'right';
  return {
    shape, effect, palette, dir, explicitEffect,
    frames: num(/\b(\d{1,3}) (?:einzelbilder|bilder|frames)\b/, 4, 32),
    ticks: num(/\b(\d{1,3}) ticks?\b/, 1, 20),
    size: [16, 32, 64, 128].includes(parsed.size) ? parsed.size : null,
  };
}

const DESIGNS = {
  stripes: ['Geschwungene Streifen', 'Zwei Lichtbahnen', 'Sternförmige Streifen'],
  rings: ['Offener Ring', 'Doppelring', 'Ringsegmente'],
  spiral: ['Schmaler Wirbel', 'Doppelspirale', 'Spirale mit Funken'],
  sparks: ['Funkenregen', 'Kreuzfunken', 'Sternenschweif'],
  smoke: ['Lockere Rauchwolke', 'Rauchschwaden', 'Nebelkringel'],
};

const turn = 2 * Math.PI;
const wrap = (n, size) => ((n % size) + size) % size;
const between = (n, min, max) => n >= min && n <= max;
const mix = (a, b, t) => a.map((value, i) => value * (1 - t) + b[i] * t);
const fraction = (n) => n - Math.floor(n);

function particlePixel(shape, variant, x, y, angle, radius) {
  if (shape === 'stripes') {
    if (variant === 1) {
      const along = x * 0.83 + y * 0.55, across = y * 0.83 - x * 0.55;
      const offset = along > 0 ? 0.25 : -0.25;
      const edge = Math.abs(across - offset);
      return Math.abs(along) < 0.71 && edge < 0.125 ? 1 - edge / 0.2 : 0;
    }
    const step = turn / (variant === 0 ? 3 : 5);
    const skew = variant === 0 ? radius * 1.25 : radius * 0.3;
    const line = Math.abs(wrap(angle + skew + step / 2, step) - step / 2);
    return between(radius, variant === 0 ? 0.22 : 0.38, 0.82) && line < 0.18 ? 1 - line * 2.2 : 0;
  }
  if (shape === 'rings') {
    const r = variant === 1 ? Math.min(Math.abs(radius - 0.68), Math.abs(radius - 0.43)) : Math.abs(radius - 0.69);
    const arc = wrap(angle + 0.3, variant === 2 ? turn / 4 : turn);
    return r < 0.09 && (variant === 1 || arc < (variant === 2 ? 1.05 : 5.25)) ? 1 - r * 4 : 0;
  }
  if (shape === 'spiral') {
    const wave = Math.abs(wrap(angle - radius * (variant === 0 ? 8 : 6), variant === 1 ? Math.PI : turn) - 1.6);
    const spark = variant === 2 && between(radius, 0.65, 0.83) && Math.abs(Math.sin(angle * 6)) < 0.12;
    return spark ? 1 : between(radius, 0.14, 0.84) && wave < 0.3 ? 0.85 - wave : 0;
  }
  if (shape === 'sparks') {
    let light = 0;
    for (let k = 0; k < 5 + variant * 2; k++) {
      const a = k * 2.399 + variant;
      const r = 0.16 + fraction(k * 0.618 + variant * 0.12) * 0.62;
      const sx = Math.abs(x - Math.cos(a) * r), sy = Math.abs(y - Math.sin(a) * r);
      const size = 0.07 + (k % 3) * 0.035;
      const core = sx < size && sy < size;
      const cross = variant === 1 && Math.min(sx, sy) < 0.065 && sx + sy < size * 2;
      if (core || cross) light = Math.max(light, core ? 1 : 0.62);
    }
    return light;
  }
  const haze = Math.cos(x * (5 + variant) - y * 4) * 0.24 + Math.sin(y * 8 + x * 2) * 0.14;
  if (variant === 2 && radius < 0.28 + haze * 0.1) return 0;
  const distance = radius + haze + (variant === 1 ? Math.abs(x) * 0.22 : 0);
  return distance < 0.8 ? 0.28 + (0.8 - distance) * 0.6 : 0;
}

function paintParticle(shape, variant, size, palette) {
  const out = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (2 * x + 1) / size - 1, dy = (2 * y + 1) / size - 1;
    const rad = Math.hypot(dx, dy);
    const light = particlePixel(shape, variant, dx, dy, Math.atan2(dy, dx), rad);
    if (!light) continue;
    const [main, shadow, highlight] = palette;
    const color = light > 0.75 ? mix(main, highlight, (light - 0.75) * (variant === 1 ? 2.8 : 1.6))
      : mix(shadow, main, 0.3 + light * 0.7);
    const alpha = shape === 'smoke' ? Math.min(220, light * 240) : Math.min(255, 135 + light * 140);
    out.set([...color, alpha], (y * size + x) * 4);
  }
  return out;
}

export function motionDrafts({ plan, effect, dir, size, images, ticks, source = null }) {
  const make = (name, data, w, h) => {
    if (!visibleBounds(data, w, h)) throw new Error('Das Startbild enthält keine sichtbaren Pixel.');
    const frames = makeEffect(effect, data, w, h, { frames: images, dir, color: plan.palette[0], strength: 0.75 });
    frames[0] = data.slice();
    const changes = frames.slice(1).some((frame) => frame.some((value, i) => value !== data[i] && (frame[i - i % 4 + 3] || data[i - i % 4 + 3])));
    return { name, w, h, frames, ticks, changes };
  };
  if (source) return [make(source.name, source.data, source.w, source.h)];
  return DESIGNS[plan.shape].map((name, index) => make(name, paintParticle(plan.shape, index, size, plan.palette), size, size));
}
