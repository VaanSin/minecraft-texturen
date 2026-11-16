// 3D-Ansicht: Mobs (echte Minecraft-Modelle), Bloecke als Wuerfel, Items als Pixel-Figur.
import * as THREE from './vendor/three.module.min.js';
import { guessModels, rankModels } from './modelmatch.js';

let MODELS = null;
async function models() {
  if (!MODELS) {
    MODELS = (await (await fetch('models.json')).json()).models;
    MODELS['themenwechsel:krempe'] = krempeModel();
  }
  return MODELS;
}

/**
 * Die breite Hutkrempe der /thema-Mod (KrempenEbene.java): flache Scheibe 16 x 1 x 16 auf Kopfhoehe
 * y = -5 .. -4, Bild 64 x 32 mit Oberseite bei (16,0) und Unterseite bei (32,0).
 */
function krempeModel() {
  const q = (y, u0) => {
    const U = (u) => u / 64, V = (v) => v / 32;
    return [-8, y, -8, U(u0), V(0), 8, y, -8, U(u0 + 16), V(0), 8, y, 8, U(u0 + 16), V(16), -8, y, 8, U(u0), V(16)];
  };
  return { tw: 64, th: 32, root: { p: [0, 0, 0], q: [q(-5, 16), q(-4, 32)] } };
}

const pretty = (key) => key.replace('minecraft:', '').replace('#main', '').replace('#', ' · ').replace(/_/g, ' ');

export class Viewer3D {
  constructor(host, select, opts = {}) {
    this.host = host;
    this.select = select;
    this.autoRotate = opts.autoRotate ?? true;
    this.empty = host.querySelector('.view3d-empty');
    this.renderer = null;
    this.yaw = 0.6; this.pitch = 0.35; this.dist = 1;
    this.mode = null;
    this.select.addEventListener('change', () => this.#rebuild(this.select.value ? this.select.value.split('|') : []));
  }

  #init() {
    if (this.renderer) return;
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.host.appendChild(r.domElement);
    this.renderer = r;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 5000);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.9));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(-0.6, 1, 0.9); this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0xb9a6ff, 0.9); rim.position.set(0.8, 0.3, -1); this.scene.add(rim);
    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);
    // Drehen mit der Maus, Zoomen mit dem Rad
    let drag = null;
    const el = r.domElement;
    el.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; try { el.setPointerCapture(e.pointerId); } catch { /* egal */ } });
    el.addEventListener('pointermove', (e) => {
      if (!drag) return;
      this.yaw += (e.clientX - drag.x) * 0.012; this.pitch = Math.max(-1.3, Math.min(1.3, this.pitch + (e.clientY - drag.y) * 0.01));
      drag = { x: e.clientX, y: e.clientY }; this.lastInteract = performance.now();
    });
    el.addEventListener('pointerup', () => { drag = null; });
    el.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomF = Math.max(0.4, Math.min(3, (this.zoomF || 1) * (e.deltaY > 0 ? 1.1 : 0.9))); }, { passive: false });
    new ResizeObserver(() => this.#size()).observe(this.host);
    this.#size();
    const loop = () => {
      requestAnimationFrame(loop);
      if (!this.mode || !this.host.isConnected || this.host.offsetParent === null) return;
      if (this.autoRotate && performance.now() - (this.lastInteract || 0) > 2500) this.yaw += 0.008;
      const d = this.dist * (this.zoomF || 1);
      this.camera.position.set(Math.sin(this.yaw) * Math.cos(this.pitch) * d, Math.sin(this.pitch) * d, Math.cos(this.yaw) * Math.cos(this.pitch) * d);
      this.camera.lookAt(0, 0, 0);
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  #size() {
    if (!this.renderer) return;
    const w = this.host.clientWidth, h = this.host.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  setAutoRotate(on) { this.autoRotate = on; }

  /**
   * Neue Textur geoeffnet. canvas = Bild der Malflaeche (wird live mitbenutzt).
   * extras = weitere Teile mit eigener Textur, z. B. Steve und die zweite Ruestungs-Ebene:
   *   [{ keys: ['minecraft:player#main'], source: { url } | { canvas } }]
   */
  async show(path, doc, canvas, extras = []) {
    this.path = path; this.doc = doc; this.canvas = canvas; this.extras = extras;
    this.select.hidden = true;
    let mode = null;
    if (path.startsWith('block/') || path.startsWith('blocks/')) mode = 'block'; // blocks/ = bis 1.12
    else if (path.startsWith('item/') || path.startsWith('items/')) mode = 'item';
    else if (path.startsWith('entity/') || path.startsWith('models/armor/')) mode = 'entity';
    if (mode === 'entity') {
      const all = await models();
      if (this.path !== path) return;
      const guess = guessModels(path, all, doc.vanilla?.w || doc.w, doc.vanilla?.h || doc.h);
      const ranked = rankModels(path, all, doc.vanilla?.w || doc.w, doc.vanilla?.h || doc.h).slice(0, 40).map((r) => r.key);
      const opts = [];
      const DE = { helmet: 'Helm', chestplate: 'Brust', boots: 'Stiefel', leggings: 'Hose', main: 'Körper', flag: 'Fahne' };
      if (guess) opts.push({ v: guess.join('|'), t: guess.length > 1 ? (guess[0].includes('banner') ? 'Banner' : 'Rüstung (' + guess.map((k) => DE[k.split('#')[1]] || k.split('#')[1]).join(', ') + ')') : pretty(guess[0]) });
      for (const k of ranked) if (!guess || guess.length > 1 || k !== guess[0]) opts.push({ v: k, t: pretty(k) });
      opts.push({ v: '', t: '– kein Modell –' });
      this.select.innerHTML = opts.map((o) => `<option value="${o.v}">${o.t}</option>`).join('');
      this.select.hidden = false;
      this.select.value = guess ? guess.join('|') : '';
      this.mode = 'entity';
      this.#rebuild(guess || []);
      return;
    }
    this.mode = mode;
    this.#rebuild();
  }

  /** Textur wurde bemalt */
  update() {
    if (!this.mode || !this.texture) return;
    if (this.texture.image.width !== this.texW || this.texture.image.height !== this.texH) { this.#rebuild(this.currentKeys); return; }
    this.texture.needsUpdate = true;
    if (this.mode === 'item') {
      clearTimeout(this.itemTimer);
      this.itemTimer = setTimeout(() => this.#rebuild(), 120); // Form haengt an durchsichtigen Pixeln
    }
  }

  #clear() {
    if (!this.pivot) return;
    for (const c of [...this.pivot.children]) {
      this.pivot.remove(c);
      c.traverse((o) => { o.geometry?.dispose(); });
    }
  }

  #rebuild(keys) {
    this.currentKeys = keys;
    const hasModel = this.mode === 'block' || this.mode === 'item' || (this.mode === 'entity' && keys?.length);
    this.empty.style.display = hasModel ? 'none' : 'grid';
    this.empty.textContent = this.mode === 'entity' ? 'Für diese Textur gibt es kein passendes Modell. Oben kannst du eins aussuchen.' : 'Für diese Textur gibt es keine 3D-Ansicht – nur für Blöcke, Items und Mobs.';
    if (!hasModel) { this.#clear(); if (this.renderer) this.renderer.domElement.style.visibility = 'hidden'; return; }
    this.#init();
    this.renderer.domElement.style.visibility = 'visible';
    this.#clear();
    this.texture?.dispose();
    const tex = new THREE.CanvasTexture(this.canvas);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
    tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace;
    this.texture = tex; this.texW = this.canvas.width; this.texH = this.canvas.height;
    const mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.05, side: THREE.DoubleSide });
    const frame = this.doc.frameH && this.doc.frameH < this.doc.h ? this.doc.frameH / this.doc.h : 1;

    let obj;
    if (this.mode === 'block') obj = blockCube(mat, frame);
    else if (this.mode === 'item') obj = itemMesh(this.doc, mat, frame);
    else {
      // Zusatzteile (nur wenn das automatisch erkannte Modell gezeigt wird)
      for (const t of this.extraTextures || []) t.dispose();
      this.extraTextures = [];
      const parts = [{ keys, mat }];
      const auto = this.select.value === (keys || []).join('|');
      for (const ex of auto ? this.extras || [] : []) {
        const t = ex.source.canvas ? new THREE.CanvasTexture(ex.source.canvas) : new THREE.TextureLoader().load(ex.source.url);
        t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
        t.flipY = false; t.colorSpace = THREE.SRGBColorSpace;
        this.extraTextures.push(t);
        parts.unshift({ keys: ex.keys, mat: new THREE.MeshLambertMaterial({ map: t, alphaTest: 0.05, side: THREE.DoubleSide }) });
      }
      obj = entity(MODELS, parts);
    }

    // In die Mitte setzen und Kamera-Abstand passend waehlen
    const holder = new THREE.Group();
    holder.add(obj);
    const box = new THREE.Box3().setFromObject(holder);
    const center = box.getCenter(new THREE.Vector3());
    obj.position.sub(center);
    const size = box.getSize(new THREE.Vector3()).length();
    this.dist = size * 1.85 + 2;
    this.pivot.add(holder);
  }
}

function blockCube(mat, frame) {
  const geo = new THREE.BoxGeometry(16, 16, 16);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, (1 - uv.getY(i)) * frame); // Bild steht sonst kopf (flipY aus)
  return new THREE.Mesh(geo, mat);
}

function itemMesh(doc, mat, frame) {
  // Wie Minecraft Items in der Hand zeigt: jedes sichtbare Pixel wird ein kleiner Block (1 Pixel dick)
  const w = doc.w, h = Math.round(doc.h * frame), d = doc.data;
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 12;
  const pos = [], uvs = [], idx = [];
  const s = 16 / Math.max(w, h), half = 0.5;
  const quad = (a, b, c, e, u, v) => {
    const base = pos.length / 3;
    for (const p of [a, b, c, e]) { pos.push(p[0] * s, p[1] * s, p[2] * s); uvs.push(u, v); }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!solid(x, y)) continue;
    const X = x - w / 2, Y = h / 2 - y;
    const u = (x + 0.5) / w, v = ((y + 0.5) / h) * frame;
    const front = [[X, Y, half], [X + 1, Y, half], [X + 1, Y - 1, half], [X, Y - 1, half]];
    const back = [[X + 1, Y, -half], [X, Y, -half], [X, Y - 1, -half], [X + 1, Y - 1, -half]];
    // Vorder- und Rueckseite mit echter Pixel-Abbildung
    const qf = (pts, flip) => {
      const base = pos.length / 3;
      for (const [px, py, pz] of pts) {
        pos.push(px * s, py * s, pz * s);
        const uu = (px + w / 2) / w, vv = ((h / 2 - py) / h) * frame;
        uvs.push(flip ? uu : uu, vv);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    qf(front); qf(back, true);
    if (!solid(x, y - 1)) quad([X, Y, -half], [X + 1, Y, -half], [X + 1, Y, half], [X, Y, half], u, v);
    if (!solid(x, y + 1)) quad([X, Y - 1, half], [X + 1, Y - 1, half], [X + 1, Y - 1, -half], [X, Y - 1, -half], u, v);
    if (!solid(x - 1, y)) quad([X, Y, -half], [X, Y, half], [X, Y - 1, half], [X, Y - 1, -half], u, v);
    if (!solid(x + 1, y)) quad([X + 1, Y, half], [X + 1, Y, -half], [X + 1, Y - 1, -half], [X + 1, Y - 1, half], u, v);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

/** parts: [{ keys: [...Modell-Schluessel], mat }] - alle im selben Koordinatensystem (z. B. Steve + Ruestung) */
function entity(all, parts) {
  // Minecraft zeichnet Modelle gespiegelt (scale -1,-1,1) - hier genauso, und mit dem Gesicht zur Kamera.
  const root = new THREE.Group();
  root.scale.set(-1, -1, 1);
  root.rotation.y = Math.PI;
  const outer = new THREE.Group();
  outer.add(root);
  for (const { keys, mat } of parts) {
    for (const k of keys || []) {
      const m = all[k];
      if (m) root.add(part(m.root, mat));
    }
  }
  return outer;
}

function part(def, mat) {
  const g = new THREE.Group();
  g.position.set(def.p[0], def.p[1], def.p[2]);
  if (def.r) g.rotation.set(def.r[0], def.r[1], def.r[2], 'ZYX');
  if (def.s) g.scale.set(def.s[0], def.s[1], def.s[2]);
  if (def.q?.length) {
    const pos = [], uv = [], idx = [];
    def.q.forEach((q, n) => {
      for (let i = 0; i < 4; i++) { pos.push(q[i * 5], q[i * 5 + 1], q[i * 5 + 2]); uv.push(q[i * 5 + 3], q[i * 5 + 4]); }
      const b = n * 4;
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, mat));
  }
  for (const ch of Object.values(def.c || {})) if (!ch.hidden) g.add(part(ch, mat));
  return g;
}
