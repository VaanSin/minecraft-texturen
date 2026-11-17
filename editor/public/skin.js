// Minecraft Java: UV-Netz für beide 64×64-Spielermodelle.
export const SKIN_SIZE = 64;
export const MAX_SKIN_FRAMES = 32;
export const SKIN_ANIM_NOTE = 'Die Animation läuft hier im Editor. Für den Java-Launcher speicherst du ein Einzelbild als PNG.';

const PARTS = [
  ['head', 0, 0, 32, 0, 8, 8, 8, '#ffe14d', 4, 0],
  ['body', 16, 16, 16, 32, 8, 12, 4, '#ff4fd8', 4, 8],
  ['rightArm', 40, 16, 40, 32, 4, 12, 4, '#3cc8ff', 0, 8],
  ['leftArm', 32, 48, 48, 48, 4, 12, 4, '#3cc8ff', 12, 8],
  ['rightLeg', 0, 16, 0, 32, 4, 12, 4, '#5cff7a', 4, 20],
  ['leftLeg', 16, 48, 0, 48, 4, 12, 4, '#5cff7a', 8, 20],
];

export function skinFaces(model) {
  return PARTS.flatMap(([part, bx, by, ox, oy, width, h, d, color, frontX, frontY]) => {
    const w = model === 'slim' && part.endsWith('Arm') ? 3 : width;
    if (part === 'rightArm') frontX += width - w;
    return [[bx, by], [ox, oy]].flatMap(([x, y], layer) => [
      ['top', x + d, y, w, d], ['bottom', x + d + w, y, w, d],
      ['right', x, y + d, d, h], ['front', x + d, y + d, w, h],
      ['left', x + d + w, y + d, d, h], ['back', x + d + w + d, y + d, w, h],
    ].map(([face, x, y, w, h]) => ({ part, layer, face, x, y, w, h, color, frontX, frontY })));
  });
}

const skinPixel = (x, y) => (y * SKIN_SIZE + x) * 4;
const BASE_COLOR = [119, 111, 148, 255];

export function launcherSkin(data, model) {
  const out = data.slice();
  for (const f of skinFaces(model).filter((face) => !face.layer)) {
    for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) {
      const i = skinPixel(x, y);
      if (!out[i + 3]) out.set(BASE_COLOR, i);
      out[i + 3] = 255;
    }
  }
  return out;
}

export function blankSkin(model) {
  return launcherSkin(new Uint8ClampedArray(SKIN_SIZE * SKIN_SIZE * 4), model);
}

function copyFace(source, from, target, to, reflect = false) {
  for (let y = 0; y < to.h; y++) for (let x = 0; x < to.w; x++) {
    const sx = reflect ? from.w - 1 - x : Math.min(x, from.w - 1);
    const i = skinPixel(from.x + sx, from.y + y);
    target.set(source.subarray(i, i + 4), skinPixel(to.x + x, to.y + y));
  }
}

export function changeSkinModel(data, from, to) {
  if (from === to) return data.slice();
  const out = data.slice();
  const arms = (model) => skinFaces(model).filter((f) => f.part.endsWith('Arm'));
  const original = arms(from);
  for (const f of original) {
    for (let y = f.y; y < f.y + f.h; y++) out.fill(0, skinPixel(f.x, y), skinPixel(f.x, y) + f.w * 4);
  }
  arms(to).forEach((f, i) => copyFace(data, original[i], out, f));
  return out;
}

export function expandLegacySkin(data) {
  const out = new Uint8ClampedArray(SKIN_SIZE * SKIN_SIZE * 4);
  out.set(data);
  const faces = skinFaces('classic').filter((f) => !f.layer);
  for (const to of faces.filter((f) => f.part.startsWith('left'))) {
    const side = { left: 'right', right: 'left' }[to.face] || to.face;
    const from = faces.find((f) => f.part === to.part.replace('left', 'right') && f.face === side);
    copyFace(data, from, out, to, true);
  }
  return out;
}

export function skinFront(data, model) {
  const w = 16, h = 32, out = new Uint8ClampedArray(w * h * 4);
  for (const f of skinFaces(model).filter((face) => face.face === 'front')) {
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
      const i = skinPixel(f.x + x, f.y + y);
      const j = ((f.frontY + y) * w + f.frontX + x) * 4;
      const a = data[i + 3] / 255, b = out[j + 3] / 255 * (1 - a);
      if (!a) continue;
      for (let c = 0; c < 3; c++) out[j + c] = (data[i + c] * a + out[j + c] * b) / (a + b);
      out[j + 3] = (a + b) * 255;
    }
  }
  return { w, h, data: out };
}
