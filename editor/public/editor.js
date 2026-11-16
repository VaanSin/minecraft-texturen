// Die Malflaeche: zeichnen, zoomen, verschieben, alle Werkzeuge, Rueckgaengig.
import { shadeColor, hsl, fromHsl } from './colors.js';

const ZOOMS = [0.25, 0.5, 1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

// Welche Werkzeuge wie arbeiten
const STROKE = new Set(['pencil', 'shade', 'noise', 'lighten', 'darken', 'spray', 'eraser', 'density']);
const SHAPE = new Set(['line', 'rect', 'ellipse', 'gradient']);
const SIZED = new Set(['pencil', 'shade', 'noise', 'lighten', 'darken', 'density', 'line', 'spray']);

/** Pixel eines runden Pinsels mit genau b Pixeln Durchmesser (passt zum Vorschau-Rahmen). */
const FOOTPRINTS = new Map();
function footprint(b) {
  if (FOOTPRINTS.has(b)) return FOOTPRINTS.get(b);
  const out = [], off = Math.floor((b - 1) / 2), c = (b - 1) / 2, r2 = (b / 2) ** 2 + (b > 2 ? 0.1 : 1);
  for (let y = 0; y < b; y++) for (let x = 0; x < b; x++) if ((x - c) ** 2 + (y - c) ** 2 <= r2) out.push([x - off, y - off]);
  FOOTPRINTS.set(b, out);
  return out;
}

export class PixelEditor {
  constructor(canvas, hooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hooks = hooks; // getTool, getColor, getOptions, isReadOnly, onChange, onHover, onPick, onPickEnd, onReplace, onZoom
    this.doc = null;
    this.zoom = 8; this.ox = 0; this.oy = 0;
    this.showGrid = true;
    this.img = document.createElement('canvas');
    this.hover = null;
    this.highlightSet = null; this.highlightUntil = 0;
    this.space = false;
    this.sel = null;        // Auswahl {x,y,w,h}
    this.floating = null;   // verschobene Pixel {x,y,w,h,data,base}
    this.clipboard = null;
    this.#bind();
    new ResizeObserver(() => { this.#resize(); this.render(); }).observe(canvas.parentElement);
    this.#resize();
    setInterval(() => { if (this.sel) this.render(); }, 250); // "laufende Ameisen" der Auswahl
  }

  get opt() { return this.hooks.getOptions(); }

  // ---------- Dokument ----------
  setDoc(doc, keepView = false) {
    this.doc = doc;
    this.sel = null; this.floating = null;
    this.updateImage();
    if (!keepView) this.fit();
    this.render();
  }

  updateImage() {
    const d = this.doc;
    if (!d) return;
    if (this.img.width !== d.w || this.img.height !== d.h) { this.img.width = d.w; this.img.height = d.h; }
    this.img.getContext('2d').putImageData(new ImageData(d.data, d.w, d.h), 0, 0);
  }

  changed() { this.updateImage(); this.render(); this.hooks.onChange?.(); }

  snapshot() { const d = this.doc; return { w: d.w, h: d.h, data: d.data.slice() }; }

  pushUndo() {
    const d = this.doc;
    d.undo.push(this.snapshot());
    if (d.undo.length > 60) d.undo.shift();
    d.redo.length = 0;
  }

  undo() { this.commitSelection(); this.#swap(this.doc?.undo, this.doc?.redo); }
  redo() { this.commitSelection(); this.#swap(this.doc?.redo, this.doc?.undo); }
  #swap(from, to) {
    if (!from?.length) return;
    to.push(this.snapshot());
    const s = from.pop();
    const sizeChanged = s.w !== this.doc.w || s.h !== this.doc.h;
    Object.assign(this.doc, s);
    if (sizeChanged) { this.sel = null; this.fit(); }
    this.changed();
  }

  replaceAll(w, h, data) {
    this.commitSelection();
    this.pushUndo();
    Object.assign(this.doc, { w, h, data });
    this.sel = null;
    this.fit();
    this.changed();
  }

  // ---------- Ansicht ----------
  #resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.cw = r.width; this.ch = r.height;
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  fit() {
    if (!this.doc) return;
    const z = Math.min((this.cw - 60) / this.doc.w, (this.ch - 60) / this.doc.h);
    this.zoom = z >= 1 ? Math.max(1, Math.min(64, Math.floor(z))) : Math.max(0.25, z);
    this.ox = Math.round((this.cw - this.doc.w * this.zoom) / 2);
    this.oy = Math.round((this.ch - this.doc.h * this.zoom) / 2);
    this.render();
    this.hooks.onZoom?.(this.zoom);
  }

  zoomStep(dir, cx = this.cw / 2, cy = this.ch / 2) {
    if (!this.doc) return;
    let i = ZOOMS.findIndex((z) => z >= this.zoom - 1e-6);
    if (i < 0) i = ZOOMS.length - 1;
    const next = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, ZOOMS[i] === this.zoom || dir < 0 ? i + dir : i))];
    const tx = (cx - this.ox) / this.zoom, ty = (cy - this.oy) / this.zoom;
    this.zoom = next;
    this.ox = Math.round(cx - tx * next); this.oy = Math.round(cy - ty * next);
    this.render();
    this.hooks.onZoom?.(this.zoom);
  }

  setGrid(on) { this.showGrid = on; this.render(); }

  highlight(indices, ms = 4000) {
    this.highlightSet = indices;
    this.highlightUntil = performance.now() + ms;
    const loop = () => { this.render(); if (performance.now() < this.highlightUntil) requestAnimationFrame(loop); else { this.highlightSet = null; this.render(); } };
    requestAnimationFrame(loop);
  }

  render() {
    const c = this.ctx, d = this.doc;
    c.clearRect(0, 0, this.cw, this.ch);
    if (!d) return;
    const z = this.zoom, W = d.w * z, H = d.h * z;
    const cell = z >= 8 ? z : 8;
    c.save();
    c.beginPath(); c.rect(this.ox, this.oy, W, H); c.clip();
    c.fillStyle = '#3b3560'; c.fillRect(this.ox, this.oy, W, H);
    c.fillStyle = '#4d4673';
    const x0 = Math.max(0, Math.floor(-this.ox / cell)), y0 = Math.max(0, Math.floor(-this.oy / cell));
    const x1 = Math.min(Math.ceil(W / cell), Math.ceil((this.cw - this.ox) / cell)), y1 = Math.min(Math.ceil(H / cell), Math.ceil((this.ch - this.oy) / cell));
    for (let y = y0; y < y1; y++) for (let x = x0 + ((x0 + y) % 2); x < x1; x += 2) c.fillRect(this.ox + x * cell, this.oy + y * cell, cell, cell);
    c.imageSmoothingEnabled = false;
    c.drawImage(this.img, this.ox, this.oy, W, H);
    if (this.showGrid && z >= 6) {
      const vx0 = Math.max(0, Math.floor(-this.ox / z)), vx1 = Math.min(d.w, Math.ceil((this.cw - this.ox) / z));
      const vy0 = Math.max(0, Math.floor(-this.oy / z)), vy1 = Math.min(d.h, Math.ceil((this.ch - this.oy) / z));
      c.lineWidth = 1;
      c.strokeStyle = 'rgba(255,255,255,0.10)';
      c.beginPath();
      for (let x = vx0; x <= vx1; x++) { const X = Math.round(this.ox + x * z) + 0.5; c.moveTo(X, this.oy + vy0 * z); c.lineTo(X, this.oy + vy1 * z); }
      for (let y = vy0; y <= vy1; y++) { const Y = Math.round(this.oy + y * z) + 0.5; c.moveTo(this.ox + vx0 * z, Y); c.lineTo(this.ox + vx1 * z, Y); }
      c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.22)';
      c.beginPath();
      for (let x = vx0 - (vx0 % 16); x <= vx1; x += 16) { const X = Math.round(this.ox + x * z) + 0.5; c.moveTo(X, this.oy + vy0 * z); c.lineTo(X, this.oy + vy1 * z); }
      for (let y = vy0 - (vy0 % 16); y <= vy1; y += 16) { const Y = Math.round(this.oy + y * z) + 0.5; c.moveTo(this.ox + vx0 * z, Y); c.lineTo(this.ox + vx1 * z, Y); }
      c.stroke();
    }
    if (d.frameH && d.frameH < d.h) {
      c.strokeStyle = 'rgba(60,200,255,0.75)'; c.setLineDash([6, 4]); c.lineWidth = 2;
      c.beginPath();
      for (let y = d.frameH; y < d.h; y += d.frameH) { const Y = Math.round(this.oy + y * z); c.moveTo(this.ox, Y); c.lineTo(this.ox + W, Y); }
      c.stroke(); c.setLineDash([]);
    }
    // Spiegelachsen
    const o = this.opt;
    if (o.mirrorX || o.mirrorY) {
      c.lineWidth = 2; c.setLineDash([10, 6]);
      if (o.mirrorX) { c.strokeStyle = 'rgba(255,79,216,0.8)'; c.beginPath(); c.moveTo(this.ox + W / 2, this.oy); c.lineTo(this.ox + W / 2, this.oy + H); c.stroke(); }
      if (o.mirrorY) {
        c.strokeStyle = 'rgba(255,225,77,0.8)'; c.beginPath();
        const fh = d.frameH || d.h;
        for (let y = fh / 2; y < d.h; y += fh) { c.moveTo(this.ox, this.oy + y * z); c.lineTo(this.ox + W, this.oy + y * z); }
        c.stroke();
      }
      c.setLineDash([]);
    }
    if (this.highlightSet && Math.floor(performance.now() / 300) % 2 === 0) {
      c.lineWidth = Math.max(2, Math.min(4, z / 5));
      c.strokeStyle = '#ff4fd8'; c.fillStyle = 'rgba(255,79,216,0.35)';
      const s = Math.max(z, 3);
      for (const i of this.highlightSet.slice(0, 20000)) {
        const x = i % d.w, y = Math.floor(i / d.w);
        c.fillRect(this.ox + x * z - (s - z) / 2, this.oy + y * z - (s - z) / 2, s, s);
        c.strokeRect(this.ox + x * z - (s - z) / 2, this.oy + y * z - (s - z) / 2, s, s);
      }
    }
    c.restore();
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1;
    c.strokeRect(this.ox - 0.5, this.oy - 0.5, W + 1, H + 1);
    // Auswahl mit laufenden Ameisen
    const sel = this.floating || this.sel;
    if (sel) {
      const X = this.ox + sel.x * z, Y = this.oy + sel.y * z;
      c.lineWidth = 2;
      c.strokeStyle = '#000'; c.setLineDash([]); c.strokeRect(X, Y, sel.w * z, sel.h * z);
      c.strokeStyle = '#fff'; c.setLineDash([6, 6]); c.lineDashOffset = -Math.floor(performance.now() / 120) % 12;
      c.strokeRect(X, Y, sel.w * z, sel.h * z);
      c.setLineDash([]);
    }
    // Pinsel-Vorschau
    const tool = this.hooks.getTool();
    if (this.hover && !this.hooks.isReadOnly() && tool !== 'select') {
      const fp = footprint(SIZED.has(tool) && tool !== 'spray' ? o.size : 1);
      c.fillStyle = 'rgba(255,255,255,0.28)';
      for (const [sx, sy] of this.sym(this.hover.x, this.hover.y)) {
        for (const [dx, dy] of fp) c.fillRect(this.ox + (sx + dx) * z, this.oy + (sy + dy) * z, z, z);
      }
      const b = SIZED.has(tool) && tool !== 'spray' ? o.size : 1, off = Math.floor((b - 1) / 2);
      const X = this.ox + (this.hover.x - off) * z, Y = this.oy + (this.hover.y - off) * z;
      c.lineWidth = 2; c.strokeStyle = 'rgba(0,0,0,0.8)'; c.strokeRect(X - 1, Y - 1, b * z + 2, b * z + 2);
      c.lineWidth = 1.5; c.strokeStyle = '#fff'; c.strokeRect(X, Y, b * z, b * z);
    }
  }

  // ---------- Hilfen ----------
  texel(ev) {
    const r = this.canvas.getBoundingClientRect();
    const mx = ev.clientX - r.left, my = ev.clientY - r.top;
    return { mx, my, x: Math.floor((mx - this.ox) / this.zoom), y: Math.floor((my - this.oy) / this.zoom) };
  }
  inside(x, y) { return this.doc && x >= 0 && y >= 0 && x < this.doc.w && y < this.doc.h; }
  pixel(x, y) { const i = (y * this.doc.w + x) * 4, a = this.doc.data; return [a[i], a[i + 1], a[i + 2], a[i + 3]]; }

  /** Punkt plus seine Spiegelbilder (Spiegel-Malen). Senkrecht wird pro Animationsbild gespiegelt. */
  sym(x, y) {
    const d = this.doc, o = this.opt, out = [[x, y]];
    const fh = d.frameH || d.h, f0 = Math.floor(y / fh) * fh;
    const my = f0 + (fh - 1 - (y - f0));
    if (o.mirrorX) out.push([d.w - 1 - x, y]);
    if (o.mirrorY) out.push([x, my]);
    if (o.mirrorX && o.mirrorY) out.push([d.w - 1 - x, my]);
    return out;
  }

  #put(p, col) { const a = this.doc.data, i = p * 4; a[i] = col[0]; a[i + 1] = col[1]; a[i + 2] = col[2]; a[i + 3] = col[3]; }

  #flood(data, x, y, test) {
    const d = this.doc, seen = new Uint8Array(d.w * d.h), out = [];
    const stack = [x, y];
    while (stack.length) {
      const py = stack.pop(), px = stack.pop();
      if (px < 0 || py < 0 || px >= d.w || py >= d.h) continue;
      const p = py * d.w + px;
      if (seen[p] || !test(p * 4)) continue;
      seen[p] = 1; out.push(p);
      stack.push(px + 1, py, px - 1, py, px, py + 1, px, py - 1);
    }
    return out;
  }

  // ---------- Pinsel-Werkzeuge ----------
  #strokePoint(x, y) {
    const st = this.stroke, d = this.doc, o = this.opt, col = this.hooks.getColor();
    const size = st.tool === 'eraser' ? 1 : SIZED.has(st.tool) ? o.size : 1;
    const fp = footprint(size);
    const fresh = [];
    for (const [sx, sy] of this.sym(x, y)) for (const [dx, dy] of fp) {
      const px = sx + dx, py = sy + dy;
      if (!this.inside(px, py)) continue;
      const p = py * d.w + px;
      if (!st.set.has(p)) { st.set.add(p); fresh.push(p); }
    }
    const base = st.base, data = d.data;
    switch (st.tool) {
      case 'pencil': for (const p of fresh) this.#put(p, col); break;
      case 'eraser': for (const p of fresh) this.#put(p, [0, 0, 0, 0]); break; // genau ein Pixel, ganz weg
      case 'density': for (const p of fresh) if (data[p * 4 + 3] > 0) data[p * 4 + 3] = col[3]; break;
      case 'noise': {
        const own = o.noiseMode === 'farben' && o.noiseColors?.length ? o.noiseColors : null;
        const k = o.strength;
        for (const p of fresh) {
          if (own) { this.#put(p, own[Math.floor(Math.random() * own.length)]); continue; } // eigene Farben
          const r = (Math.random() * 2 - 1) * k;                                            // Zufall
          this.#put(p, r === 0 ? col : shadeColor(col, r));
        }
        break;
      }
      case 'lighten': case 'darken': {
        const k = (st.tool === 'lighten' ? 1 : -1) * o.strength;
        for (const p of fresh) {
          const i = p * 4;
          if (base[i + 3] === 0) continue;
          this.#put(p, shadeColor([base[i], base[i + 1], base[i + 2], base[i + 3]], k));
        }
        break;
      }
      case 'shade': this.#redrawShade(); break;
    }
    return fresh.length > 0;
  }

  /** Schattenpinsel: Strich in der Farbe, drumherum automatisch dunklere (und hellere) Pixel. */
  #redrawShade() {
    const st = this.stroke, d = this.doc, o = this.opt, col = this.hooks.getColor();
    const dark = shadeColor(col, -o.strength * 1.6), light = shadeColor(col, o.strength * 1.3);
    d.data.set(st.base);
    const W = d.w, H = d.h;
    for (const p of st.set) {
      const x = p % W, y = (p - x) / W;
      const nb = [[x, y - 1, 'u'], [x - 1, y, 'l'], [x + 1, y, 'r'], [x, y + 1, 'd']];
      for (const [nx, ny, side] of nb) {
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const q = ny * W + nx;
        if (st.set.has(q)) continue;
        const c = o.shadeMode === 'light' ? (side === 'u' || side === 'l' ? light : dark) : dark;
        this.#put(q, c);
      }
    }
    for (const p of st.set) this.#put(p, col);
  }

  #spray(x, y) {
    const d = this.doc, st = this.stroke, col = this.hooks.getColor();
    const r = Math.max(2, this.opt.size * 2);
    let any = false;
    for (let n = 0; n < 3 + this.opt.size; n++) {
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * r;
      const px = Math.round(x + Math.cos(a) * rr), py = Math.round(y + Math.sin(a) * rr);
      for (const [sx, sy] of this.sym(px, py)) {
        if (!this.inside(sx, sy)) continue;
        const p = sy * d.w + sx;
        if (st.set.has(p)) continue;
        st.set.add(p); this.#put(p, col); any = true;
      }
    }
    if (any) this.changed();
  }

  // ---------- Formen ----------
  #shape(t) {
    const st = this.stroke, d = this.doc, o = this.opt, col = this.hooks.getColor();
    d.data.set(st.base);
    const pts = new Set();
    const add = (x, y) => { for (const [sx, sy] of this.sym(x, y)) if (this.inside(sx, sy)) pts.add(sy * d.w + sx); };
    const x0 = Math.min(st.start.x, t.x), x1 = Math.max(st.start.x, t.x), y0 = Math.min(st.start.y, t.y), y1 = Math.max(st.start.y, t.y);
    if (st.tool === 'line') {
      const fp = footprint(o.size);
      this.#line(st.start.x, st.start.y, t.x, t.y, (x, y) => { for (const [dx, dy] of fp) add(x + dx, y + dy); });
    } else if (st.tool === 'rect') {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (o.filled || x === x0 || x === x1 || y === y0 || y === y1) add(x, y);
    } else if (st.tool === 'ellipse') {
      const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2, rx = (x1 - x0 + 1) / 2, ry = (y1 - y0 + 1) / 2;
      const inE = (x, y) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1.0001;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (!inE(x, y)) continue;
        if (o.filled || !inE(x - 1, y) || !inE(x + 1, y) || !inE(x, y - 1) || !inE(x, y + 1)) add(x, y);
      }
    } else if (st.tool === 'gradient') {
      const end = o.gradEnd === 'clear' ? [col[0], col[1], col[2], 0] : shadeColor(col, o.gradEnd === 'light' ? 0.45 : -0.55);
      const vx = t.x - st.start.x, vy = t.y - st.start.y, len2 = vx * vx + vy * vy || 1;
      const steps = 5;
      for (const p of st.region) {
        const x = p % d.w, y = (p - x) / d.w;
        let f = ((x - st.start.x) * vx + (y - st.start.y) * vy) / len2;
        f = Math.max(0, Math.min(1, f));
        const band = Math.min(steps - 1, Math.floor(f * (steps - 1) + BAYER[(y % 4) * 4 + (x % 4)])) / (steps - 1);
        this.#put(p, col.map((v, k) => Math.round(v + (end[k] - v) * band)));
      }
      return;
    }
    for (const p of pts) this.#put(p, col);
  }

  // ---------- Klick-Werkzeuge ----------
  #fill(x, y) {
    const d = this.doc, data = d.data, col = this.hooks.getColor();
    let any = false;
    for (const [sx, sy] of this.sym(x, y)) {
      if (!this.inside(sx, sy)) continue;
      const i0 = (sy * d.w + sx) * 4;
      const t = [data[i0], data[i0 + 1], data[i0 + 2], data[i0 + 3]];
      if (t.every((v, k) => v === col[k])) continue;
      const region = this.#flood(data, sx, sy, (i) => data[i] === t[0] && data[i + 1] === t[1] && data[i + 2] === t[2] && data[i + 3] === t[3]);
      for (const p of region) this.#put(p, col);
      any = any || region.length > 0;
    }
    return any;
  }

  /** Umriss um eine Form (oder um alles, wenn man ins Leere klickt). */
  #outline(x, y) {
    const d = this.doc, data = d.data, col = this.hooks.getColor(), auto = this.opt.outlineAuto;
    let shape;
    if (data[(y * d.w + x) * 4 + 3] > 0) shape = this.#flood(data, x, y, (i) => data[i + 3] > 0);
    else { shape = []; for (let p = 0; p < d.w * d.h; p++) if (data[p * 4 + 3] > 0) shape.push(p); }
    const writes = new Map();
    for (const p of shape) {
      const px = p % d.w, py = (p - px) / d.w;
      for (const [nx, ny] of [[px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]]) {
        if (!this.inside(nx, ny)) continue;
        const q = ny * d.w + nx;
        if (data[q * 4 + 3] !== 0 || writes.has(q)) continue;
        writes.set(q, auto ? shadeColor([data[p * 4], data[p * 4 + 1], data[p * 4 + 2], 255], -0.55) : col);
      }
    }
    for (const [q, c] of writes) this.#put(q, c);
    return writes.size > 0;
  }

  /** Rand um alle Formen der Textur. */
  outlineAll() {
    const d = this.doc;
    for (let p = 0; p < d.w * d.h; p++) if (d.data[p * 4 + 3] === 0) return this.#outline(p % d.w, Math.floor(p / d.w));
    return false;
  }

  /** Alle Pixel dieser Farbe (Dichte egal) in der Textur ersetzen. */
  replaceColor(from, to, tol = 0) {
    const data = this.doc.data;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      if (Math.abs(data[i] - from[0]) > tol || Math.abs(data[i + 1] - from[1]) > tol || Math.abs(data[i + 2] - from[2]) > tol) continue;
      for (let c = 0; c < 3; c++) data[i + c] = Math.max(0, Math.min(255, to[c] + (data[i + c] - from[c])));
      data[i + 3] = Math.round((data[i + 3] * (to[3] ?? 255)) / 255);
      n++;
    }
    return n;
  }

  // ---------- Auswahl ----------
  #inSel(x, y) { const s = this.floating || this.sel; return s && x >= s.x && y >= s.y && x < s.x + s.w && y < s.y + s.h; }

  #lift() {
    if (this.floating || !this.sel) return;
    const d = this.doc, s = this.sel;
    this.pushUndo();
    const px = new Uint8ClampedArray(s.w * s.h * 4);
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
      const i = ((s.y + y) * d.w + s.x + x) * 4, j = (y * s.w + x) * 4;
      px.set(d.data.subarray(i, i + 4), j);
      d.data.fill(0, i, i + 4);
    }
    this.floating = { ...s, data: px, base: d.data.slice() };
    this.#placeFloating();
  }

  #placeFloating() {
    const d = this.doc, f = this.floating;
    d.data.set(f.base);
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
      const tx = f.x + x, ty = f.y + y;
      if (!this.inside(tx, ty)) continue;
      const j = (y * f.w + x) * 4;
      if (f.data[j + 3] === 0) continue;
      d.data.set(f.data.subarray(j, j + 4), (ty * d.w + tx) * 4);
    }
    this.changed();
  }

  commitSelection() {
    if (!this.floating) return;
    const f = this.floating;
    this.floating = null;
    this.sel = { x: Math.max(0, f.x), y: Math.max(0, f.y), w: Math.min(f.w, this.doc.w - Math.max(0, f.x)), h: Math.min(f.h, this.doc.h - Math.max(0, f.y)) };
    if (this.sel.w <= 0 || this.sel.h <= 0) this.sel = null;
    this.render();
  }

  deselect() { this.commitSelection(); this.sel = null; this.render(); }
  selectAll() { if (!this.doc) return; this.commitSelection(); this.sel = { x: 0, y: 0, w: this.doc.w, h: this.doc.h }; this.render(); }

  deleteSelection() {
    if (this.floating) { this.doc.data.set(this.floating.base); this.floating = null; this.sel = null; this.changed(); return true; }
    if (!this.sel) return false;
    const d = this.doc, s = this.sel;
    this.pushUndo();
    for (let y = s.y; y < s.y + s.h; y++) d.data.fill(0, (y * d.w + s.x) * 4, (y * d.w + s.x + s.w) * 4);
    this.changed();
    return true;
  }

  copySelection() {
    const s = this.floating || this.sel;
    if (!s) return false;
    if (this.floating) { this.clipboard = { w: s.w, h: s.h, data: this.floating.data.slice() }; return true; }
    const d = this.doc, px = new Uint8ClampedArray(s.w * s.h * 4);
    for (let y = 0; y < s.h; y++) px.set(d.data.subarray(((s.y + y) * d.w + s.x) * 4, ((s.y + y) * d.w + s.x + s.w) * 4), y * s.w * 4);
    this.clipboard = { w: s.w, h: s.h, data: px };
    return true;
  }

  paste() {
    if (!this.clipboard || !this.doc) return false;
    this.commitSelection();
    this.pushUndo();
    const c = this.clipboard, s = this.sel;
    this.floating = { x: s ? s.x : 0, y: s ? s.y : 0, w: c.w, h: c.h, data: c.data.slice(), base: this.doc.data.slice() };
    this.sel = null;
    this.#placeFloating();
    return true;
  }

  // ---------- Ganze Textur ----------
  transform(kind) {
    const d = this.doc;
    if (!d) return false;
    this.commitSelection();
    const { w, h } = d, src = d.data, fh = d.frameH || h;
    if (kind === 'rotate' && w !== fh) return false;
    this.pushUndo();
    const out = new Uint8ClampedArray(src.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const f0 = Math.floor(y / fh) * fh, ly = y - f0;
      let sx = x, sy = y;
      if (kind === 'flipH') sx = w - 1 - x;
      if (kind === 'flipV') sy = f0 + (fh - 1 - ly);
      if (kind === 'rotate') { sx = ly; sy = f0 + (w - 1 - x); } // 90 Grad im Uhrzeigersinn, pro Bild
      out.set(src.subarray((sy * w + sx) * 4, (sy * w + sx) * 4 + 4), (y * w + x) * 4);
    }
    d.data = out;
    this.changed();
    return true;
  }

  /** Umfaerben: Farbton verschieben oder ganz einfaerben (fuer Vorschau mit Ausgangsbild). */
  recolor(base, { hue = 0, sat = 0, light = 0, colorize = null }) {
    const out = this.doc.data;
    for (let i = 0; i < base.length; i += 4) {
      if (base[i + 3] === 0) { out[i] = base[i]; out[i + 1] = base[i + 1]; out[i + 2] = base[i + 2]; out[i + 3] = 0; continue; }
      let [h, s, l] = hsl([base[i], base[i + 1], base[i + 2]]);
      if (colorize) { h = colorize[0]; s = Math.max(colorize[1], 0.35) * Math.min(1, 0.4 + s); }
      h = (h + hue + 360) % 360;
      s = Math.max(0, Math.min(1, s * (1 + sat / 100)));
      l = Math.max(0, Math.min(1, l + (light / 100) * (light > 0 ? 1 - l : l)));
      const c = fromHsl(h, s, l);
      out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = base[i + 3];
    }
    this.changed();
  }

  #line(x0, y0, x1, y1, f) {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, any = false;
    for (;;) {
      any = f(x0, y0) || any;
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return any;
  }

  // ---------- Maus und Tastatur ----------
  #bind() {
    const cv = this.canvas;
    let mode = null, last = null, panStart = null, sprayTimer = null, selStart = null, moveStart = null;
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('pointerdown', (e) => {
      if (!this.doc) return;
      try { cv.setPointerCapture(e.pointerId); } catch { /* z. B. Stift-Eingabe ohne Erfassung */ }
      const t = this.texel(e);
      if (e.button === 1 || e.button === 2 || this.space) { mode = 'pan'; panStart = { mx: t.mx, my: t.my, ox: this.ox, oy: this.oy }; return; }
      if (e.button !== 0) return;
      const tool = this.hooks.getTool();
      if (tool === 'picker') { if (this.inside(t.x, t.y)) this.hooks.onPick?.(this.pixel(t.x, t.y)); mode = 'pick'; return; }
      if (this.hooks.isReadOnly()) return;
      if (tool === 'select') {
        if (this.#inSel(t.x, t.y)) { this.#lift(); mode = 'move'; moveStart = { x: t.x, y: t.y, fx: this.floating.x, fy: this.floating.y }; return; }
        this.commitSelection();
        mode = 'select'; selStart = { x: Math.max(0, Math.min(this.doc.w - 1, t.x)), y: Math.max(0, Math.min(this.doc.h - 1, t.y)) };
        this.sel = { x: selStart.x, y: selStart.y, w: 1, h: 1 };
        this.render();
        return;
      }
      this.commitSelection();
      if (!this.inside(t.x, t.y)) return;
      if (tool === 'bucket' || tool === 'outline') {
        this.pushUndo();
        if (tool === 'bucket' ? this.#fill(t.x, t.y) : this.#outline(t.x, t.y)) this.changed(); else this.doc.undo.pop();
        return;
      }
      if (tool === 'replace') {
        const p = this.pixel(t.x, t.y);
        if (p[3] === 0) return;
        const to = this.hooks.getColor();
        this.pushUndo();
        if (this.replaceColor(p, to)) { this.hooks.onReplace?.(p, to); this.changed(); } else this.doc.undo.pop();
        return;
      }
      this.pushUndo();
      this.stroke = { tool, base: this.doc.data.slice(), set: new Set(), start: { x: t.x, y: t.y }, changed: false };
      if (SHAPE.has(tool)) {
        if (tool === 'gradient') {
          const b = this.stroke.base, i0 = (t.y * this.doc.w + t.x) * 4, c0 = [b[i0], b[i0 + 1], b[i0 + 2], b[i0 + 3]];
          this.stroke.region = this.#flood(b, t.x, t.y, (i) => b[i] === c0[0] && b[i + 1] === c0[1] && b[i + 2] === c0[2] && b[i + 3] === c0[3]);
        }
        mode = 'shape';
        this.#shape(t); this.stroke.changed = true; this.changed();
        return;
      }
      mode = 'draw'; last = t;
      if (tool === 'spray') {
        this.#spray(t.x, t.y); this.stroke.changed = true;
        sprayTimer = setInterval(() => this.#spray(last.x, last.y), 45);
      } else if (this.#strokePoint(t.x, t.y)) { this.stroke.changed = true; this.changed(); }
      this.hooks.onHover?.({ x: t.x, y: t.y, rgba: this.pixel(t.x, t.y) });
    });
    cv.addEventListener('pointermove', (e) => {
      if (!this.doc) return;
      const t = this.texel(e);
      const inside = this.inside(t.x, t.y);
      const prev = this.hover;
      this.hover = inside ? { x: t.x, y: t.y } : null;
      if (mode === 'pan') { this.ox = panStart.ox + (t.mx - panStart.mx); this.oy = panStart.oy + (t.my - panStart.my); this.render(); return; }
      if (mode === 'pick' && inside) { this.hooks.onPick?.(this.pixel(t.x, t.y)); return; }
      if (mode === 'select') {
        const x = Math.max(0, Math.min(this.doc.w - 1, t.x)), y = Math.max(0, Math.min(this.doc.h - 1, t.y));
        this.sel = { x: Math.min(x, selStart.x), y: Math.min(y, selStart.y), w: Math.abs(x - selStart.x) + 1, h: Math.abs(y - selStart.y) + 1 };
        this.render(); return;
      }
      if (mode === 'move') {
        this.floating.x = moveStart.fx + (t.x - moveStart.x); this.floating.y = moveStart.fy + (t.y - moveStart.y);
        this.#placeFloating(); return;
      }
      if (mode === 'shape') { this.#shape(t); this.changed(); return; }
      if (mode === 'draw') {
        if (this.stroke.tool !== 'spray' && this.#line(last.x, last.y, t.x, t.y, (x, y) => this.#strokePoint(x, y))) { this.stroke.changed = true; this.changed(); }
        last = t;
        if (inside) this.hooks.onHover?.({ x: t.x, y: t.y, rgba: this.pixel(t.x, t.y) });
        return;
      }
      this.hooks.onHover?.(inside ? { x: t.x, y: t.y, rgba: this.pixel(t.x, t.y) } : null);
      if (!prev || !this.hover || prev.x !== this.hover.x || prev.y !== this.hover.y) this.render();
    });
    const end = () => {
      clearInterval(sprayTimer); sprayTimer = null;
      if ((mode === 'draw' || mode === 'shape') && this.stroke && !this.stroke.changed) this.doc.undo.pop();
      if (mode === 'pick') this.hooks.onPickEnd?.();
      this.stroke = null;
      mode = null; last = null;
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', () => { this.hover = null; this.hooks.onHover?.(null); this.render(); });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); const t = this.texel(e); this.zoomStep(e.deltaY < 0 ? 1 : -1, t.mx, t.my); }, { passive: false });
    window.addEventListener('keydown', (e) => { if (e.code === 'Space' && !isTyping(e)) { this.space = true; this.canvas.style.cursor = 'grab'; } });
    window.addEventListener('keyup', (e) => { if (e.code === 'Space') { this.space = false; this.canvas.style.cursor = ''; } });
  }
}

export function isTyping(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}
