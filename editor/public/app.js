// Minecraft Texturen - Hauptsteuerung
import { get, post, b64ToBytes, bytesToB64 } from './api.js';
import { toHex, fromHex, css, keyOf, unkey, percent, rainbowSort, QUICK, hsl as hslOf, fromHsl as hslToRgb, shadeColor } from './colors.js';
import { PixelEditor, isTyping } from './editor.js';
import { computeWarnings, describeAlpha } from './warnings.js';
import { Viewer3D } from './viewer3d.js';
import { parsePrompt, drafts as kiDrafts, styleFromPalette, paletteFromImage, pixelate, ideas, playerPreview, pretty, toHex as kiHex } from './ki.js';
import { frameCount, frameHeight, getFrame, joinFrames, canAnimate, speedText, EFFECTS, makeEffect, blend, timeline, sheetLayouts, framesFromSheet, toSheet } from './animation.js';

const $ = (s) => document.querySelector(s);
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const KEY = IS_MAC ? '⌘' : 'Strg'; // Anzeige fuer Tastenkuerzel
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- Zustand ----------
const S = {
  info: null, theme: 'normal', themes: [],
  textures: [], changed: new Set(), animated: new Set(),
  cat: 'block', search: '',
  doc: null,
  drafts: new Map(),         // Pfad -> bearbeitete, noch nicht gespeicherte Textur
  profileConfirmed: false,   // Profil in diesem Programmstart schon gewaehlt?
  tool: 'pencil', color: [79, 255, 35, 255],
  opt: { size: 1, strength: 0.16, shadeMode: 'ring', filled: false, gradEnd: 'dark', outlineAuto: true, mirrorX: false, mirrorY: false, noiseMode: 'zufall', noiseColors: [] },
  thumbVer: new Map(), globalVer: 0,
  warnCollapsed: false,
};

const CATS = [
  { id: 'block', name: 'Blöcke', icon: '🧱', c: '#ff9a3c', test: (p) => p.startsWith('block/') || p.startsWith('blocks/') },
  { id: 'item', name: 'Items', icon: '⚔️', c: '#ff4fd8', test: (p) => p.startsWith('item/') || p.startsWith('items/') },
  { id: 'mob', name: 'Mobs', icon: '🐷', c: '#5cff7a', test: (p) => p.startsWith('entity/') && !p.startsWith('entity/equipment/') },
  { id: 'armor', name: 'Rüstung', icon: '🛡️', c: '#3cc8ff', test: (p) => p.startsWith('entity/equipment/') || p.startsWith('trims/') || p.startsWith('models/armor/') },
  { id: 'gui', name: 'GUI & HUD', icon: '❤️', c: '#8f6bff', test: (p) => p.startsWith('gui/') },
  { id: 'particle', name: 'Partikel', icon: '✨', c: '#ffe14d', test: (p) => p.startsWith('particle/') },
  { id: 'effect', name: 'Effekte', icon: '🧪', c: '#ff5d6c', test: (p) => p.startsWith('mob_effect/') || p.startsWith('effect/') },
  { id: 'other', name: 'Sonstiges', icon: '🗺️', c: '#7aa2ff', test: (p) => /^(painting|map|environment|misc|colormap|font)\//.test(p) },
  { id: 'drafts', name: 'Ungespeichert', icon: '✏️', c: '#ffb347', test: (p) => S.drafts.has(p) },
  { id: 'changed', name: 'Geändert', icon: '🟢', c: '#2ee59d', test: (p) => S.changed.has(p) },
  { id: 'all', name: 'Alle', icon: '🌈', c: '#ffffff', test: () => true },
];

const TOOLS = [
  { id: 'pencil', name: 'Stift', icon: '✏️', c: '#ff4fd8', key: 'b', tip: 'Malt mit der gewählten Farbe (B)' },
  { id: 'shade', name: 'Schatten', icon: '🖌️', c: '#ff7ad9', key: 's', tip: 'Malt und macht drumherum automatisch dunklere Pixel (S)' },
  { id: 'noise', name: 'Muster', icon: '🎲', c: '#ffb347', key: 'm', tip: 'Malt mit leicht wechselnden Tönen – wie echte Minecraft-Texturen (M)' },
  { id: 'lighten', name: 'Heller', icon: '🌞', c: '#ffe14d', key: 'h', tip: 'Macht Pixel heller, Farbe bleibt (H)' },
  { id: 'darken', name: 'Dunkler', icon: '🌚', c: '#7b8bff', key: 'j', tip: 'Macht Pixel dunkler, Farbe bleibt (J)' },
  { id: 'spray', name: 'Sprühen', icon: '💨', c: '#7ee0ff', key: 'y', tip: 'Sprüht Pixel wie eine Spraydose (Y)' },
  { id: 'eraser', name: 'Radierer', icon: '🧽', c: '#ff9a3c', key: 'e', tip: 'Löscht genau ein Pixel – ganz weg (E)' },
  { id: 'bucket', name: 'Eimer', icon: '🪣', c: '#3cc8ff', key: 'g', tip: 'Füllt eine zusammenhängende Fläche (G)' },
  { id: 'gradient', name: 'Verlauf', icon: '🌈', c: '#c084fc', key: 'v', tip: 'Ziehen: Fläche mit Farbverlauf füllen (V)' },
  { id: 'line', name: 'Linie', icon: '📏', c: '#f472b6', key: 'l', tip: 'Ziehen: gerade Linie (L)' },
  { id: 'rect', name: 'Rechteck', icon: '⬛', c: '#34d399', key: 'q', tip: 'Ziehen: Rechteck (Q)' },
  { id: 'ellipse', name: 'Kreis', icon: '⚪', c: '#60a5fa', key: 'k', tip: 'Ziehen: Kreis oder Oval (K)' },
  { id: 'outline', name: 'Umriss', icon: '🔲', c: '#a3e635', key: 'u', tip: 'Klick auf eine Form: Rand drumherum (U)' },
  { id: 'select', name: 'Auswahl', icon: '✂️', c: '#fb7185', key: 'a', tip: 'Bereich auswählen, verschieben, kopieren (A)' },
  { id: 'picker', name: 'Pipette', icon: '💧', c: '#fde047', key: 'i', tip: 'Nimmt eine Farbe aus dem Bild (I)' },
  { id: 'density', name: 'Dichte', icon: '🌫️', c: '#8f6bff', key: 'd', tip: 'Ändert nur, wie stark man ein Pixel sieht (D)' },
  { id: 'replace', name: 'Tauschen', icon: '🔄', c: '#5cff7a', key: 'r', tip: 'Klick auf eine Farbe: in der ganzen Textur tauschen (R)' },
];
const SIZE_TOOLS = new Set(['pencil', 'shade', 'noise', 'lighten', 'darken', 'density', 'line', 'spray']);
const MIRROR_TOOLS = new Set(['pencil', 'shade', 'noise', 'lighten', 'darken', 'spray', 'eraser', 'density', 'bucket', 'line', 'rect', 'ellipse']);

// Deutsche Suchwoerter -> Minecraft-Namen
const ALIAS = {
  herz: 'heart', herzen: 'heart', schwert: 'sword', spitzhacke: 'pickaxe', axt: 'axe', schaufel: 'shovel', hacke: 'hoe',
  helm: 'helmet', brustplatte: 'chestplate', hose: 'leggings', stiefel: 'boots', ruestung: 'equipment', rüstung: 'equipment',
  diamant: 'diamond', eisen: 'iron', stein: 'stone', holz: 'planks', stamm: 'log', erde: 'dirt', gras: 'grass', glas: 'glass',
  wolle: 'wool', skelett: 'skeleton', schwein: 'pig', kuh: 'cow', schaf: 'sheep', huhn: 'chicken', spinne: 'spider',
  dorfbewohner: 'villager', essen: 'food', hunger: 'food', erfahrung: 'experience', trank: 'potion', apfel: 'apple', brot: 'bread',
  bogen: 'bow', pfeil: 'arrow', fackel: 'torch', truhe: 'chest', bett: 'bed', tuer: 'door', tür: 'door', erz: 'ore', kohle: 'coal',
  smaragd: 'emerald', netherit: 'netherite', kupfer: 'copper', katze: 'cat', pferd: 'horse', drache: 'dragon', blatt: 'leaves',
  blaetter: 'leaves', blätter: 'leaves', wasser: 'water', lava: 'lava', sand: 'sand', schnee: 'snow', eis: 'ice', blume: 'flower',
  boss: 'boss_bar', bossbar: 'boss_bar', rüstungsbesatz: 'trims', besatz: 'trims', fadenkreuz: 'crosshair', spieler: 'player',
  verzauberung: 'enchant', glanz: 'glint', schild: 'shield', zaun: 'fence', ofen: 'furnace', werkbank: 'crafting_table',
};

// ---------- Start ----------
const editor = new PixelEditor($('#view'), {
  getTool: () => S.tool,
  getColor: () => S.color,
  getOptions: () => S.opt,
  isReadOnly: () => S.theme === 'normal',
  onChange: () => docChanged(),
  onHover: (h) => showHover(h),
  onPick: (rgba) => setColor(rgba, false),
  onPickEnd: () => { addRecent(S.color); },
  onReplace: (from, to) => S.doc.replaced.push({ from: from.slice(0, 3), to: to.slice() }),
  onZoom: (z) => { $('#zoomLabel').textContent = Math.round(z * 100) + ' %'; },
  onRestore: () => { if (S.animOpen) renderAnimBar(); },
});
const viewer = new Viewer3D($('#view3d'), $('#modelSelect'));

init().catch((e) => toast('Start fehlgeschlagen: ' + e.message, 'bad'));

async function init() {
  S.info = await get('/api/info');
  if (S.info.setup) { await setupDialog(); S.info = await get('/api/info'); }
  S.themes = S.info.themes;
  const last = S.info.settings.lastTheme;
  S.theme = S.themes.some((t) => t.key === last) ? last : S.themes[0]?.key || 'normal';
  editor.setGrid(S.info.settings.showGrid);
  viewer.setAutoRotate(S.info.settings.autoRotate);
  buildTools();
  buildQuickColors();
  loadRecent();
  setColor(S.color, false);
  bindUi();
  if (IS_MAC) document.querySelectorAll('[title*="Strg"]').forEach((el) => { el.title = el.title.replace(/Strg/g, '⌘'); });
  renderProfileButton();
  renderThemeButton();
  refreshKonto();
  await loadList();
  setInterval(() => post('/api/ping').catch(() => {}), 5000);
  post('/api/ping').catch(() => {});
  document.addEventListener('visibilitychange', () => { if (!document.hidden) post('/api/ping').catch(() => toast('Das Programm im Hintergrund wurde beendet – bitte neu starten.', 'bad')); });
}

async function loadList() {
  const l = await get('/api/list?theme=' + S.theme);
  S.textures = l.textures;
  S.changed = new Set(l.changed);
  S.animated = new Set(l.animated);
  renderCats();
  renderGrid();
}

// ---------- Kategorien und Kacheln ----------
function renderCats() {
  $('#cats').innerHTML = CATS.map((c) => {
    const n = S.textures.filter(c.test).length;
    if (c.id === 'changed' && S.theme === 'normal') return '';
    if (c.id === 'drafts' && !n) { if (S.cat === 'drafts') S.cat = 'changed'; return ''; }
    return `<button class="cat ${S.cat === c.id ? 'active' : ''}" data-cat="${c.id}" style="--c:${c.c}">${c.icon} ${c.name} <span class="n">${n}</span></button>`;
  }).join('');
}

function matchesSearch(p) {
  if (!S.search) return true;
  const words = S.search.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = p.toLowerCase();
  return words.every((w) => hay.includes(w) || (ALIAS[w] && hay.includes(ALIAS[w])));
}

let gridItems = [], gridShown = 0, gridObserver = null;
function renderGrid() {
  const cat = CATS.find((c) => c.id === S.cat) || CATS[0];
  // auch neue Zusatz-Texturen (z. B. Krempe), die es erst als Entwurf gibt
  const all = S.drafts.size ? [...new Set([...S.textures, ...S.drafts.keys()])].sort() : S.textures;
  const list = all.filter((p) => (S.search ? true : cat.test(p)) && matchesSearch(p));
  gridItems = [];
  let lastDir = null;
  for (const p of list) {
    const dir = p.split('/').slice(0, -1).join('/');
    if (dir !== lastDir) { gridItems.push({ head: dir }); lastDir = dir; }
    gridItems.push({ p });
  }
  const grid = $('#grid');
  grid.innerHTML = '';
  grid.scrollTop = 0;
  gridShown = 0;
  $('#gridCount').textContent = list.length ? `${list.length} Texturen${S.search ? ' gefunden' : ''}` : 'Nichts gefunden 🤷';
  gridObserver?.disconnect();
  gridObserver = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) moreTiles(); }, { root: grid, rootMargin: '400px' });
  moreTiles();
}

function moreTiles() {
  const grid = $('#grid');
  grid.querySelector('.sentinel')?.remove();
  const end = Math.min(gridItems.length, gridShown + 300);
  const frag = document.createDocumentFragment();
  for (let i = gridShown; i < end; i++) {
    const it = gridItems[i];
    if (it.head !== undefined) {
      const h = document.createElement('div');
      h.className = 'group-head';
      h.textContent = it.head.replace(/\//g, ' › ') || 'textures';
      frag.appendChild(h);
      continue;
    }
    frag.appendChild(tileFor(it.p));
  }
  gridShown = end;
  grid.appendChild(frag);
  if (gridShown < gridItems.length) {
    const s = document.createElement('div');
    s.className = 'sentinel';
    grid.appendChild(s);
    gridObserver.observe(s);
  }
}

function thumbUrl(p) {
  return `/thumb/${S.theme}/${p.split('/').map(encodeURIComponent).join('/')}?v=${S.globalVer}.${S.thumbVer.get(p) || 0}`;
}

function tileFor(p) {
  const t = document.createElement('div');
  const draft = S.drafts.get(p);
  t.className = 'tile' + (S.doc?.path === p ? ' active' : '') + (draft ? ' unsaved' : '');
  t.dataset.p = p;
  t.title = p + (draft ? ' – noch nicht gespeichert' : '');
  const name = p.split('/').pop().replace(/\.png$/, '').replace(/_/g, ' ');
  // Ungespeicherte Texturen zeigen ihren aktuellen Stand statt der gespeicherten Datei
  const src = draft ? draftThumb(draft) : thumbUrl(p);
  t.innerHTML = `<img loading="lazy" src="${src}" alt="">${S.changed.has(p) ? '<span class="mark" title="In diesem Thema geändert"></span>' : ''}${draft ? '<span class="draft" title="Noch nicht gespeichert">✏️</span>' : ''}${S.animated.has(p) ? '<span class="anim" title="Animiert">▶</span>' : ''}<div class="label">${esc(name)}</div>`;
  return t;
}

function draftThumb(d) {
  const c = document.createElement('canvas');
  const h = d.frameH && d.frameH < d.h ? d.frameH : d.h;
  c.width = d.w; c.height = h;
  c.getContext('2d').putImageData(new ImageData(d.data.slice(0, d.w * h * 4), d.w, h), 0, 0);
  return c.toDataURL();
}

function refreshTile(p) {
  const old = $('#grid').querySelector(`.tile[data-p="${CSS.escape(p)}"]`);
  if (old) old.replaceWith(tileFor(p));
}

// ---------- Textur oeffnen ----------
/** Textur vom Server holen und als Dokument aufbereiten. */
async function loadDoc(p) {
  const px = await get(`/api/pixels?theme=${S.theme}&path=${encodeURIComponent(p)}`);
  const anim = px.mcmeta?.animation;
  // Hoehe eines Einzelbildes - genau wie Minecraft sie berechnet
  const frameOf = (a, w, h) => (a ? (a.height ?? (a.width ? h : Math.min(w, h))) : null);
  const frameH = frameOf(anim, px.w, px.h);
  const vanFrameH = px.vanilla ? frameOf(px.vanilla.mcmeta?.animation, px.vanilla.w, px.vanilla.h) : null;
  return {
    path: p, w: px.w, h: px.h, data: b64ToBytes(px.data), source: px.source, mcmeta: px.mcmeta,
    vanilla: px.vanilla ? { w: px.vanilla.w, h: px.vanilla.h, frameH: vanFrameH, data: b64ToBytes(px.vanilla.data) } : null,
    frameH, undo: [], redo: [], replaced: [], dirty: false,
    anim: anim ? structuredClone(anim) : null, animDirty: false,
  };
}

/**
 * Textur oeffnen. Ungespeicherte Aenderungen anderer Texturen bleiben erhalten (Entwuerfe) -
 * gespeichert wird alles zusammen mit einem Klick. force: neu vom Server laden, Entwurf verwerfen.
 */
async function openTexture(p, force = false) {
  editor.commitSelection();
  let doc = !force && S.drafts.get(p);
  if (!doc) {
    try { doc = await loadDoc(p); }
    catch (e) { toast('Konnte nicht geöffnet werden: ' + e.message, 'bad'); return; }
    if (force && S.drafts.delete(p)) { renderCats(); refreshTile(p); }
  }
  S.doc = doc;
  editor.setDoc(S.doc);
  S.animFrame = 0;
  if (S.animOpen) renderAnimBar();
  $('#welcome').hidden = true;
  document.querySelectorAll('.tile.active').forEach((t) => t.classList.remove('active'));
  $('#grid').querySelector(`.tile[data-p="${CSS.escape(p)}"]`)?.classList.add('active');
  renderDocBar();
  renderPalette();
  renderWarnings();
  viewer.show(p, S.doc, editor.img, outfitExtras(p));
}

/** Fuer die 3D-Ansicht: Ruestung komplett an Steve zeigen (Koerper + die andere Ruestungs-Ebene). */
function outfitExtras(p) {
  const LAYER1 = ['minecraft:player#helmet', 'minecraft:player#chestplate', 'minecraft:player#boots'];
  const has = (x) => S.textures.includes(x) || S.drafts.has(x);
  const LEG = ['minecraft:player#leggings'];
  let m, others = null, mat = null;
  if ((m = p.match(/^entity\/equipment\/humanoid\/(.+)$/))) { mat = m[1]; others = [{ keys: LEG, path: 'entity/equipment/humanoid_leggings/' + m[1] }]; }
  else if ((m = p.match(/^entity\/equipment\/humanoid_leggings\/(.+)$/))) { mat = m[1]; others = [{ keys: LAYER1, path: 'entity/equipment/humanoid/' + m[1] }]; }
  else if ((m = p.match(/^entity\/equipment\/krempe\/(.+)$/))) { mat = m[1]; others = [{ keys: LAYER1, path: 'entity/equipment/humanoid/' + m[1] }, { keys: LEG, path: 'entity/equipment/humanoid_leggings/' + m[1] }]; }
  else if ((m = p.match(/^models\/armor\/(.+)_layer_1\.png$/))) others = [{ keys: LEG, path: `models/armor/${m[1]}_layer_2.png` }];
  else if ((m = p.match(/^models\/armor\/(.+)_layer_2\.png$/))) others = [{ keys: LAYER1, path: `models/armor/${m[1]}_layer_1.png` }];
  else return [];
  // breite Krempe aus dem Thema (zeichnet im Spiel die /thema-Mod)
  if (mat && !p.includes('/krempe/')) others.push({ keys: ['themenwechsel:krempe'], path: 'entity/equipment/krempe/' + mat });
  const out = [];
  const steve = ['entity/player/wide/steve.png', 'entity/steve.png'].find(has);
  if (steve) out.push({ keys: ['minecraft:player#main'], source: texSource(steve) });
  for (const o of others) if (has(o.path)) out.push({ keys: o.keys, source: texSource(o.path) });
  return out;
}

/** Bildquelle fuer die 3D-Ansicht: ungespeicherter Entwurf (Canvas) oder Datei vom Server. */
function texSource(path) {
  const d = S.drafts.get(path);
  if (d) {
    const c = document.createElement('canvas');
    c.width = d.w; c.height = d.h;
    c.getContext('2d').putImageData(new ImageData(d.data, d.w, d.h), 0, 0);
    return { canvas: c };
  }
  return { url: `/tex/${S.theme}/${path.split('/').map(encodeURIComponent).join('/')}?v=${S.globalVer}.${S.thumbVer.get(path) || 0}` };
}

const prettyName = (p) => p.split('/').pop().replace(/\.png$/, '').replace(/_/g, ' ');

function renderDocBar() {
  const d = S.doc;
  $('#docName').textContent = d ? prettyName(d.path) + (d.dirty ? ' •' : '') : 'Keine Textur geöffnet';
  $('#docPath').textContent = d ? d.path : '';
  const b = [];
  if (d) {
    b.push(`<span class="badge">${d.w}×${d.h}</span>`);
    if (d.vanilla && d.w !== d.vanilla.w) b.push(`<span class="badge yellow">✨ ${d.w / d.vanilla.w}× Pixel</span>`);
    if (d.frameH && d.frameH < d.h) b.push(`<span class="badge cyan">▶ ${d.h / d.frameH} Bilder</span>`);
    b.push(d.source === 'thema' || S.changed.has(d.path) ? '<span class="badge green">🟢 im Thema</span>' : '<span class="badge">Original</span>');
  }
  $('#docBadges').innerHTML = b.join('');
  const ro = S.theme === 'normal';
  const n = S.drafts.size;
  $('#readonly').hidden = !d || !ro;
  $('#saveBtn').disabled = !n || ro || saving;
  $('#saveBtn').classList.toggle('dirty', n > 0);
  if (!saving) $('#saveBtn').textContent = n > 1 ? `💾 Alles speichern (${n})` : '💾 Speichern';
  $('#saveBtn').title = n ? `${n} ${n === 1 ? 'Textur' : 'Texturen'} noch nicht gespeichert (${KEY}+S)` : 'Alles gespeichert';
  $('#undoBtn').disabled = !d?.undo.length;
  $('#redoBtn').disabled = !d?.redo.length;
  $('#growBtn').disabled = !d || ro;
  $('#animBtn').disabled = !d;
  $('#animBtn').classList.toggle('on', !!S.animOpen);
  $('#imageBtn').disabled = !d || ro;
  $('#revertBtn').disabled = !d || ro || !(S.changed.has(d.path) || S.drafts.has(d.path));
  $('#revertBtn').textContent = d && !S.changed.has(d.path) && S.drafts.has(d.path) ? '↩️ Verwerfen' : '♻️ Original';
  document.title = d ? `${prettyName(d.path)}${d.dirty ? ' •' : ''} – Minecraft Texturen` : 'Minecraft Texturen';
  document.querySelectorAll('.tool').forEach((t) => { t.disabled = ro && t.dataset.tool !== 'picker'; });
}

let changeTimer = null, tileTimer = null;
function docChanged() {
  if (!S.doc) return;
  S.doc.dirty = true;
  const fresh = !S.drafts.has(S.doc.path);
  S.drafts.set(S.doc.path, S.doc);
  if (fresh) renderCats();
  const p = S.doc.path;
  clearTimeout(tileTimer);
  tileTimer = setTimeout(() => refreshTile(p), fresh ? 0 : 400); // Kachel zeigt den neuen Stand
  renderDocBar();
  viewer.update();
  clearTimeout(changeTimer);
  changeTimer = setTimeout(() => { renderPalette(); renderWarnings(); if (S.animOpen) renderAnimThumbs(); }, 120);
}

// ---------- Speichern / Original ----------
/**
 * Speichert ALLE ungespeicherten Texturen auf einmal. Man kann so oft speichern, wie man will -
 * nach dem Profil wird nur beim ersten Mal (pro Programmstart) gefragt.
 */
let saving = false;
async function save() {
  editor.commitSelection();
  const drafts = [...S.drafts.values()];
  if (!drafts.length) return true;
  if (S.theme === 'normal' || saving) return false;
  const problems = drafts.flatMap((d) => computeWarnings(d, d.path).filter((w) => w.level === 'error').map((w) => `⚠️ <b>${esc(prettyName(d.path))}</b>: ${esc(w.title)}`));
  if (problems.length) {
    const ok = await choose('Trotzdem speichern?', `${problems.join('<br>')}<br><br>Minecraft zeigt das so vielleicht falsch an.`, [{ v: 'yes', t: 'Trotzdem speichern', cls: 'danger' }, { v: 'no', t: 'Abbrechen', cls: 'ghost' }]);
    if (ok !== 'yes') return false;
  }
  saving = true;
  try {
    // Erst das Profil waehlen (einmal pro Programmstart)
    if (S.info.settings.askProfile && !S.profileConfirmed) {
      const target = await profileDialog(drafts.map((d) => d.path));
      if (!target) return false;
      if (target !== S.info.profile.id && !(await switchProfile(target, { keepDoc: true, bring: 'copy' }))) return false;
      S.profileConfirmed = true;
    }
    let done = 0, lastMod = null, profile = S.info.profile.name;
    const failed = [];
    for (const d of drafts) {
      $('#saveBtn').innerHTML = `<span class="spinner"></span> ${drafts.length > 1 ? `${done + 1}/${drafts.length}` : 'Speichern'}`;
      try {
        const animation = d.animDirty ? (frameCount(d) > 1 ? { ...(d.anim || {}), height: d.frameH } : null) : undefined;
        const r = await post('/api/save', { theme: S.theme, path: d.path, w: d.w, h: d.h, data: bytesToB64(d.data), animation });
        d.dirty = false; d.source = 'thema'; d.animDirty = false;
        S.drafts.delete(d.path);
        S.changed.add(d.path);
        if (!S.textures.includes(d.path)) { S.textures.push(d.path); S.textures.sort(); } // neue Zusatz-Textur
        S.thumbVer.set(d.path, (S.thumbVer.get(d.path) || 0) + 1);
        refreshTile(d.path);
        lastMod = r.mod; profile = r.profile; done++;
      } catch (e) { failed.push(`${prettyName(d.path)}: ${e.message}`); }
    }
    renderCats();
    if (lastMod?.state === 'installiert') S.info.profile.mod = 'da';
    if (done) toast(`💾 ${done === 1 ? `„${esc(prettyName(drafts.find((d) => !S.drafts.has(d.path)).path))}“` : `${done} Texturen`} gespeichert in „${esc(profile)}“ · Thema „${esc(themeName())}“${modText(lastMod)} – im Spiel <b>F3+T</b> drücken`, 'ok');
    if (failed.length) toast('Nicht gespeichert: ' + failed.map(esc).join(' · '), 'bad');
    return failed.length === 0;
  } catch (e) { toast('Speichern ging nicht: ' + e.message, 'bad'); return false; }
  finally { saving = false; renderDocBar(); }
}

/** Vor Themen-/Profilwechsel: was passiert mit ungespeicherten Texturen? true = weitermachen */
async function handleDrafts(what) {
  const n = S.drafts.size;
  if (!n) return true;
  const r = await choose('Noch nicht gespeichert', `${n === 1 ? 'Eine Textur ist' : `${n} Texturen sind`} noch nicht gespeichert. ${what}`, [
    { v: 'save', t: n > 1 ? `💾 Alle ${n} speichern` : '💾 Speichern', cls: 'primary' }, { v: 'drop', t: 'Verwerfen' }, { v: 'cancel', t: 'Abbrechen', cls: 'ghost' }]);
  if (r === 'cancel' || r === null) return false;
  if (r === 'save') return save();
  S.drafts.clear();
  if (S.doc) S.doc.dirty = false;
  return true;
}

function modText(mod) {
  if (!mod) return '';
  if (mod.state === 'installiert') return ' · <b>/thema</b> wurde installiert ✓';
  if (mod.state === 'gesperrt') return ' · /thema kommt beim nächsten Speichern (Minecraft läuft)';
  return '';
}

// ---------- Minecraft-Profile (CurseForge, Modrinth, Lunar, Minecraft Launcher) ----------
const avatar = (name) => `<span class="avatar" style="background:hsl(${[...name].reduce((a, c) => a + c.charCodeAt(0) * 53, 0) % 360} 75% 55%)">${esc(name.charAt(0).toUpperCase())}</span>`;

const usable = (p) => p.fits && p.texture !== 'fehlt';

function profileStatus(p) {
  if (!p.fits) return `<span class="pstat off">${esc(p.why)}</span>`;
  if (p.texture === 'fehlt') return `<span class="pstat off">${p.total > 1 ? 'Diese Texturen gibt' : 'Diese Textur gibt'} es in Minecraft ${esc(p.version)} nicht</span>`;
  const folder = S.themes.find((t) => t.key === S.theme)?.folder;
  const parts = [];
  if (p.texture === 'teilweise') parts.push(`⚠️ ${p.missing} von ${p.total} gibt es in ${esc(p.version)} nicht – die bleiben ungespeichert`);
  if (p.texture === 'anders') parts.push(`⚠️ In ${esc(p.version)} anders aufgebaut`);
  if (folder) parts.push(p.themes.includes(folder) ? `🟢 Thema „${esc(themeName())}“ ist da` : `📦 Thema „${esc(themeName())}“ wird mitgenommen`);
  if (p.mod === 'da') parts.push('✓ /thema installiert');
  else if (p.mod === 'fehlt' || p.mod === 'alt') parts.push('⬇️ /thema wird installiert');
  else parts.push('ℹ️ kein /thema – Thema-Menü: „Im Spiel einschalten“');
  if (p.canCommand && p.needsFabricApi && !p.fabricApi) parts.push('⚠️ Fabric API fehlt – /thema braucht sie');
  return `<span class="pstat">${parts.join(' · ')}</span>`;
}

const LAUNCHER_ICON = { curseforge: '🔥', modrinth: '🟢', lunar: '🌙', minecraft: '⛏️' };
const launcherTag = (p) => `<span class="ltag l-${p.launcher}">${LAUNCHER_ICON[p.launcher] || '🎮'} ${esc(p.launcherName)}</span>`;

function profileCard(p, current, asRadio) {
  const dis = !usable(p);
  return `<label class="pcard ${dis ? 'off' : ''} ${p.id === current ? 'cur' : ''}">
    ${asRadio ? `<input type="radio" name="prof" value="${esc(p.id)}" data-name="${esc(p.name)}" ${p.id === current && !dis ? 'checked' : ''} ${dis ? 'disabled' : ''}>` : ''}
    ${avatar(p.name)}
    <span class="pmain"><b>${esc(p.name)}</b><span class="pver">${launcherTag(p)} Minecraft ${esc(p.version)} · ${esc(p.loader)}</span>${profileStatus(p)}
      ${!p.fits && p.canDownload ? `<button class="btn small" data-fetch="${esc(p.version)}">⬇️ Originalbilder für ${esc(p.version)} laden (ca. 30 MB)</button>` : ''}</span>
  </label>`;
}

/** Erster Start ohne passendes Profil: eins waehlen (oder dessen Originalbilder laden). */
async function setupDialog() {
  for (;;) {
    const { profiles } = await get('/api/profiles');
    const id = await new Promise((resolve) => {
      const m = openModal(`
        <h2>👋 Willkommen bei Minecraft Texturen!</h2>
        <p>Wähle das Minecraft-Profil, für das du Texturen malen willst. Gefunden werden Profile aus <b>CurseForge</b>, <b>Modrinth</b>, <b>Lunar Client</b> und dem <b>Minecraft Launcher</b>.</p>
        <div class="plist">${profiles.map((p) => profileCard({ ...p, texture: null }, null, true)).join('') || '<p>Kein Minecraft-Profil gefunden. Starte Minecraft einmal mit deinem Launcher und öffne dann dieses Programm neu.</p>'}</div>
        <div class="actions"><button class="btn ghost" id="sRetry">🔄 Neu suchen</button><button class="btn primary" id="sGo" disabled>Los geht's</button></div>`);
      const bg = m.parentElement; bg.replaceWith(bg.cloneNode(true)); // nicht durch Klick daneben schliessen
      const mm = $('#modalRoot .modal');
      const go = mm.querySelector('#sGo');
      mm.addEventListener('change', () => { const r = mm.querySelector('input[name=prof]:checked'); go.disabled = !r; if (r) go.textContent = `Los geht's mit „${r.dataset.name}“`; });
      mm.addEventListener('click', async (e) => {
        const f = e.target.closest('[data-fetch]');
        if (f) { e.preventDefault(); if (await fetchMinecraft(f)) resolve('again'); return; }
        if (e.target.closest('#sRetry')) resolve('again');
        if (e.target.closest('#sGo')) resolve(mm.querySelector('input[name=prof]:checked')?.value || 'again');
      });
    });
    if (id === 'again') continue;
    try {
      await post('/api/profile', { id });
      $('#modalRoot').innerHTML = '';
      S.profileConfirmed = true;
      return;
    } catch (e) { toast(e.message, 'bad'); }
  }
}

/** Originalbilder einer Version von Mojang laden (Knopf in den Profil-Listen). true = geklappt */
async function fetchMinecraft(btn) {
  const v = btn.dataset.fetch;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Lade Minecraft ${esc(v)} …`;
  try {
    await post('/api/fetch-minecraft', { version: v });
    toast(`⬇️ Originalbilder für Minecraft ${esc(v)} sind da`, 'ok');
    return true;
  } catch (e) { toast('Laden ging nicht: ' + e.message, 'bad'); btn.disabled = false; btn.textContent = '⬇️ Nochmal versuchen'; return false; }
}

/** Fenster vor dem Speichern: in welches Profil? Gibt die Profil-Id zurueck oder null. */
async function profileDialog(paths) {
  const q = paths.slice(0, 80).map((p) => 'path=' + encodeURIComponent(p)).join('&');
  const { current, profiles } = await get('/api/profiles?' + q);
  const ok = profiles.filter(usable), other = profiles.filter((p) => !usable(p));
  const what = paths.length === 1 ? 'die Textur' : `alle ${paths.length} Texturen`;
  return new Promise((resolve) => {
    const m = openModal(`
      <h2>💾 Wohin speichern?</h2>
      <p>Wähle dein Minecraft-Profil (CurseForge, Modrinth, Lunar Client oder Minecraft Launcher). Dort landen ${what} im Thema „${esc(themeName())}“ – und der Befehl <code>/thema</code> wird automatisch mitinstalliert, wo es geht.</p>
      <div class="plist">${ok.map((p) => profileCard(p, current, true)).join('') || '<p>Kein passendes Profil gefunden.</p>'}</div>
      ${other.length ? `<details class="pother"><summary>Andere Profile (${other.length}) – hier geht das (noch) nicht</summary><div class="plist">${other.map((p) => profileCard(p, current, true)).join('')}</div></details>` : ''}
      <p class="hint">Danach wird bis zum Schließen des Programms ohne Nachfrage hierhin gespeichert – so oft du willst.</p>
      <label class="row" style="gap:8px;cursor:pointer"><input type="checkbox" id="pNoAsk"> Gar nicht mehr fragen (Profil oben 🎮 ändern)</label>
      <div class="actions"><button class="btn ghost" data-close>Abbrechen</button><button class="btn primary" id="pGo">💾 Speichern</button></div>`);
    modalResolve = resolve;
    const go = m.querySelector('#pGo');
    const upd = () => { const r = m.querySelector('input[name=prof]:checked'); go.disabled = !r; go.textContent = r ? `💾 In „${r.dataset.name}“ speichern` : '💾 Speichern'; };
    m.addEventListener('change', upd);
    m.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-fetch]');
      if (!b) return;
      e.preventDefault();
      if (await fetchMinecraft(b)) { modalResolve = null; $('#modalRoot').innerHTML = ''; resolve(await profileDialog(paths)); }
    });
    upd();
    go.addEventListener('click', async () => {
      const v = m.querySelector('input[name=prof]:checked')?.value;
      if (!v) return;
      if (m.querySelector('#pNoAsk').checked) { S.info.settings.askProfile = false; post('/api/settings', { askProfile: false }).catch(() => {}); }
      modalResolve = null; $('#modalRoot').innerHTML = '';
      resolve(v);
    });
  });
}

async function openProfileMenu() {
  const m = $('#profileMenu');
  m.innerHTML = '<div class="menu-hint"><span class="spinner"></span></div>';
  m.hidden = false;
  const { current, profiles } = await get('/api/profiles');
  let html = '', last = '';
  for (const p of [...profiles].sort((a, b) => a.launcherName.localeCompare(b.launcherName, 'de') || a.name.localeCompare(b.name, 'de'))) {
    if (p.launcher !== last) { html += `<div class="menu-hint">${LAUNCHER_ICON[p.launcher] || '🎮'} ${esc(p.launcherName)}</div>`; last = p.launcher; }
    html += p.fits || !p.canDownload
      ? `<button data-profile="${esc(p.id)}" class="${p.id === current ? 'current' : ''}" ${p.fits ? '' : `disabled title="${esc(p.why)}"`}>${avatar(p.name)} ${esc(p.name)} <span class="meta">${esc(p.version)} · ${esc(p.loader)}${p.canCommand ? '' : ' · ohne /thema'}</span></button>`
      : `<button data-fetch="${esc(p.version)}" title="${esc(p.why)}">${avatar(p.name)} ${esc(p.name)} <span class="meta">${esc(p.version)} · ⬇️ Originalbilder laden</span></button>`;
  }
  m.innerHTML = (html || '<div class="menu-hint">Kein Minecraft-Profil gefunden</div>') +
    `<div class="menu-hint">Jede Minecraft-Version geht – die Texturen kommen aus genau dieser Version. <code>/thema</code> wird automatisch installiert, wo es geht.</div>`;
}

/** Profil wechseln (id aus /api/profiles). keepDoc: die offene (bemalte) Textur bleibt, z. B. vor dem Speichern. */
async function switchProfile(id, { keepDoc = false, bring = null } = {}) {
  if (id === S.info.profile.id) return true;
  if (!keepDoc && !(await handleDrafts(`Vorher in „${esc(S.info.profile.name)}“ speichern?`))) return false;
  if (!keepDoc) S.profileConfirmed = true; // selbst gewaehlt - beim Speichern nicht nochmal fragen
  const { profiles } = await get('/api/profiles');
  const target = profiles.find((x) => x.id === id);
  const name = target?.name || id;
  if (!bring && S.theme !== 'normal') {
    const p = target;
    const folder = S.themes.find((t) => t.key === S.theme)?.folder;
    if (p && folder && !p.themes.includes(folder)) {
      bring = await choose('Thema mitnehmen?', `Das Thema „${esc(themeName())}“ gibt es in „${esc(name)}“ noch nicht.`, [
        { v: 'copy', t: '📦 Mitnehmen (Kopie)', cls: 'primary' }, { v: 'empty', t: '✨ Leer anlegen' }, { v: 'none', t: 'Ohne Thema' }]);
      if (bring === null) return false;
    }
  }
  try {
    const r = await post('/api/profile', { id, theme: S.theme, bring });
    S.info = await get('/api/info');
    S.themes = S.info.themes;
    S.theme = r.theme;
    post('/api/settings', { lastTheme: S.theme }).catch(() => {});
    S.globalVer++;
    renderProfileButton();
    renderThemeButton();
    if (S.theme === 'normal') setTool('picker');
    await loadList();
    if (S.doc) {
      if (keepDoc) { S.doc.source = S.changed.has(S.doc.path) ? 'thema' : 'original'; renderDocBar(); }
      else await openTexture(S.doc.path, true);
    }
    const copy = r.copied ? ` · 📦 ${r.copied.copied} Texturen mitgenommen${r.copied.skipped ? `, ${r.copied.skipped} passten nicht zu Minecraft ${esc(r.version)}` : ''}` : '';
    toast(`🎮 Profil „${esc(name)}“ (Minecraft ${esc(r.version)})${copy}${modText(r.mod)}`, 'ok');
    return true;
  } catch (e) { toast(e.message, 'bad'); return false; }
}

function renderProfileButton() {
  $('#profileName').textContent = S.info.profile.name;
  $('#profileBtn').title = `${S.info.profile.launcherName || 'Minecraft'}-Profil: ${S.info.profile.name} (Minecraft ${S.info.profile.version} · ${S.info.profile.loader})`;
}

async function revert() {
  const d = S.doc;
  if (!d) return;
  if (!S.changed.has(d.path)) {
    // nur ungespeicherte Aenderungen -> einfach verwerfen
    const ok = await choose('Änderungen verwerfen?', `Deine ungespeicherten Änderungen an <b>${esc(prettyName(d.path))}</b> gehen verloren.`, [{ v: 'yes', t: '↩️ Verwerfen', cls: 'danger' }, { v: 'no', t: 'Abbrechen', cls: 'ghost' }]);
    if (ok !== 'yes') return;
    await openTexture(d.path, true);
    renderDocBar();
    return;
  }
  const ok = await choose('Zurück zum Original?', `<b>${esc(prettyName(d.path))}</b> wird im Thema „${esc(themeName())}“ wieder wie bei Minecraft. Deine Version wird gelöscht.`, [{ v: 'yes', t: '♻️ Ja, Original', cls: 'danger' }, { v: 'no', t: 'Abbrechen', cls: 'ghost' }]);
  if (ok !== 'yes') return;
  await post('/api/revert', { theme: S.theme, path: d.path });
  S.changed.delete(d.path);
  S.thumbVer.set(d.path, (S.thumbVer.get(d.path) || 0) + 1);
  refreshTile(d.path);
  renderCats();
  await openTexture(d.path, true);
  toast('♻️ Wieder Original', 'ok');
}

// ---------- Mehr Pixel ----------
async function grow() {
  const d = S.doc;
  if (!d) return;
  const opts = [2, 4].filter((f) => d.w * f <= 2048 && d.h * f <= 2048);
  if (!opts.length) { toast('Die Textur ist schon sehr groß.', 'bad'); return; }
  const r = await choose('✨ Mehr Pixel zum Malen', `Jedes Pixel wird in mehrere kleine Pixel geteilt. Erst sieht alles genauso aus – aber dann kannst du viel feinere Details malen, z. B. bei Bossbars, Herzen oder Schwertern.<br><br>Jetzt: <b>${d.w}×${d.h}</b>`,
    opts.map((f) => ({ v: String(f), t: `${f}× → ${d.w * f}×${d.h * f}`, cls: f === 2 ? 'primary' : '' })).concat([{ v: 'no', t: 'Abbrechen', cls: 'ghost' }]));
  const f = Number(r);
  if (!f) return;
  const w = d.w * f, h = d.h * f, out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = (Math.floor(y / f) * d.w + Math.floor(x / f)) * 4, t = (y * w + x) * 4;
    out[t] = d.data[s]; out[t + 1] = d.data[s + 1]; out[t + 2] = d.data[s + 2]; out[t + 3] = d.data[s + 3];
  }
  if (d.frameH) d.frameH *= f;
  editor.replaceAll(w, h, out);
  renderDocBar();
  toast(`✨ Jetzt ${w}×${h} – viel Platz für Details!`, 'ok');
}

// ---------- Werkzeuge ----------
function buildTools() {
  $('#tools').innerHTML = `<div class="tool-grid">${TOOLS.map((t) => `<button class="tool ${S.tool === t.id ? 'active' : ''}" data-tool="${t.id}" style="--c:${t.c}" title="${t.tip}"><span class="ic">${t.icon}</span><span class="tl">${t.name}</span></button>`).join('')}</div><div id="toolOpts" class="tool-opts"></div>`;
  renderToolOpts();
}

/** Einstellungen fuer das gewaehlte Werkzeug (unter den Werkzeugen). */
function renderToolOpts() {
  const o = S.opt, t = S.tool, parts = [];
  const seg = (key, items) => `<div class="seg">${items.map(([v, label]) => `<button data-opt="${key}" data-val="${v}" class="${String(o[key]) === String(v) ? 'on' : ''}">${label}</button>`).join('')}</div>`;
  if (SIZE_TOOLS.has(t)) {
    // freie Groesse 1..32 (Regler + Zahl), Tasten [ und ]
    parts.push(`<div class="opt-title">Größe <b id="sizeVal">${o.size}</b></div>
      <input type="range" min="1" max="32" value="${o.size}" data-optsize>
      <div class="seg">${[1, 2, 4, 8, 16].map((s) => `<button data-opt="size" data-val="${s}" class="${o.size === s ? 'on' : ''}">${s}</button>`).join('')}</div>`);
  }
  if (t === 'shade') parts.push(`<div class="opt-title">Schatten</div>${seg('shadeMode', [['ring', 'Rand'], ['light', 'Licht']])}<div class="opt-hint">${o.shadeMode === 'light' ? 'Oben/links heller, unten/rechts dunkler' : 'Ringsum dunklere Pixel'}</div>`);
  if (t === 'noise') {
    parts.push(`<div class="opt-title">Muster aus</div>${seg('noiseMode', [['zufall', 'Zufall'], ['farben', 'Farben']])}`);
    if (o.noiseMode === 'farben') {
      parts.push(`<div class="opt-hint">Malt zufällig mit diesen Farben (Klick = entfernen)</div>
        <div class="noise-list">${o.noiseColors.map((c, i) => `<button class="sw-btn" data-noisedel="${i}" title="${toHex(c)} entfernen"><i style="background:${css(c)}"></i></button>`).join('')}
        <button class="noise-add" data-noiseadd title="Aktuelle Farbe dazu">＋</button></div>`);
    }
    parts.push(`<div class="opt-title">Passende Farben</div>${noiseSuggestions().map((s, i) => `
      <button class="noise-sugg" data-noisesugg="${i}" title="${esc(s.name)} übernehmen"><span class="ns-name">${esc(s.name)}</span><span class="ns-row">${s.colors.map((c) => `<i style="background:${css(c)}"></i>`).join('')}</span></button>`).join('')}`);
  }
  if (['shade', 'lighten', 'darken'].includes(t) || (t === 'noise' && o.noiseMode === 'zufall')) parts.push(`<div class="opt-title">Stärke</div><input type="range" min="4" max="40" value="${Math.round(o.strength * 100)}" data-optrange="strength">`);
  if (t === 'rect' || t === 'ellipse') parts.push(`<div class="opt-title">Form</div>${seg('filled', [[false, 'Rand'], [true, 'Voll']])}`);
  if (t === 'gradient') parts.push(`<div class="opt-title">Verlauf bis</div>${seg('gradEnd', [['dark', 'Dunkel'], ['light', 'Hell'], ['clear', 'Weg']])}<div class="opt-hint">Auf eine Fläche ziehen</div>`);
  if (t === 'outline') parts.push(`<div class="opt-title">Randfarbe</div>${seg('outlineAuto', [[true, 'Auto'], [false, 'Meine']])}<div class="opt-hint">Klick ins Leere: Rand um alles</div>`);
  if (t === 'select') parts.push(`<div class="opt-hint">Ziehen = auswählen<br>Reinklicken = verschieben<br>Entf = löschen<br>${KEY}+C / ${KEY}+V</div>`);
  if (MIRROR_TOOLS.has(t)) parts.push(`<div class="opt-title">Spiegeln</div><div class="seg"><button data-mirror="mirrorX" class="${o.mirrorX ? 'on' : ''}" title="Links und rechts gleich malen">↔</button><button data-mirror="mirrorY" class="${o.mirrorY ? 'on' : ''}" title="Oben und unten gleich malen">↕</button></div>`);
  $('#toolOpts').innerHTML = parts.join('');
}

function setBrushSize(n, rerender = true) {
  S.opt.size = Math.max(1, Math.min(32, Math.round(n)));
  if (rerender) renderToolOpts();
  else {
    const v = $('#sizeVal'); if (v) v.textContent = S.opt.size;
    document.querySelectorAll('[data-opt="size"]').forEach((b) => b.classList.toggle('on', Number(b.dataset.val) === S.opt.size));
  }
  editor.render();
}

/** Farbvorschlaege fuer den Muster-Pinsel, passend zur gewaehlten Farbe (und zur offenen Textur). */
let lastSuggestions = [];
function noiseSuggestions() {
  const c = S.color.slice(0, 3).concat(255);
  const [h, s, l] = hslOf(c);
  const fromHsl3 = (hh, ss, ll) => [...hslToRgb((hh + 360) % 360, Math.max(0, Math.min(1, ss)), Math.max(0, Math.min(1, ll))), 255];
  const out = [
    { name: 'Schattierung', colors: [-0.45, -0.22, 0, 0.18, 0.36].map((k) => (k ? shadeColor(c, k) : c)) },
    { name: 'Nachbarfarben', colors: [-28, -14, 0, 14, 28].map((d) => (d ? fromHsl3(h + d, s, l) : c)) },
    { name: 'Natürlich', colors: [fromHsl3(h, s * 0.6, l * 0.85), shadeColor(c, -0.15), c, fromHsl3(h + 8, s * 0.8, Math.min(0.9, l * 1.12)), fromHsl3(h - 10, s * 0.45, l * 0.7)] },
    { name: 'Mit Kontrast', colors: [shadeColor(c, -0.3), c, shadeColor(c, 0.25), fromHsl3(h + 180, Math.min(1, s * 0.8), l), fromHsl3(h + 165, s * 0.6, l * 0.8)] },
  ];
  if (S.doc) {
    const top = [...paletteOf(S.doc).entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => unkey(k));
    if (top.length >= 2) out.push({ name: 'Aus dieser Textur', colors: top });
  }
  lastSuggestions = out;
  return out;
}

function setTool(id) {
  if (S.theme === 'normal' && id !== 'picker') return;
  if (S.tool === 'select' && id !== 'select') editor.commitSelection();
  S.tool = id;
  document.querySelectorAll('.tool').forEach((t) => t.classList.toggle('active', t.dataset.tool === id));
  renderToolOpts();
  editor.render();
}

// ---------- Bild-Menue (ganze Textur) ----------
function openImageMenu() {
  const m = $('#imageMenu');
  const d = S.doc;
  const square = d && d.w === (d.frameH || d.h);
  m.innerHTML = `
    <button data-img="flipH">↔️ Waagrecht spiegeln</button>
    <button data-img="flipV">↕️ Senkrecht spiegeln</button>
    <button data-img="rotate" ${square ? '' : 'disabled title="Nur bei quadratischen Texturen"'}>🔃 Um 90° drehen</button>
    <hr>
    <button data-img="recolor">🌈 Umfärben …</button>
    <button data-img="outlineAll">🔲 Rand um alles</button>
    <button data-img="clear">🧹 Alles leeren</button>`;
  m.hidden = false;
}

function imageAction(kind) {
  const d = S.doc;
  if (!d || S.theme === 'normal') return;
  if (kind === 'recolor') return recolorDialog();
  if (kind === 'clear') { editor.selectAll(); editor.deleteSelection(); editor.deselect(); return; }
  if (kind === 'outlineAll') {
    editor.commitSelection();
    editor.pushUndo();
    if (editor.outlineAll()) editor.changed();
    else { d.undo.pop(); toast('Kein Platz für einen Rand – alles ist voll.', 'bad'); }
    return;
  }
  if (!editor.transform(kind)) toast('Das geht nur bei quadratischen Texturen.', 'bad');
}

function recolorDialog() {
  const d = S.doc;
  editor.commitSelection();
  editor.pushUndo();
  const base = d.data.slice();
  const p = { hue: 0, sat: 0, light: 0, colorize: null };
  const modal = openModal(`
    <h2>🌈 Umfärben</h2>
    <p>Färbt die ganze Textur auf einmal um – praktisch für neue Themen.</p>
    <label class="density"><span>Farbton <b id="cHueL">0°</b></span><input id="cHue" type="range" min="-180" max="180" value="0" class="hue-range"></label>
    <label class="density"><span>Kräftigkeit <b id="cSatL">0</b></span><input id="cSat" type="range" min="-100" max="100" value="0"></label>
    <label class="density"><span>Helligkeit <b id="cLightL">0</b></span><input id="cLight" type="range" min="-100" max="100" value="0"></label>
    <div class="row"><button class="btn small" id="cColorize">🎨 In meiner Farbe einfärben</button><button class="btn small ghost" id="cReset">Zurücksetzen</button></div>
    <div class="actions"><button class="btn ghost" id="cCancel">Abbrechen</button><button class="btn primary" id="cOk">✓ Übernehmen</button></div>`);
  let done = false;
  const apply = () => {
    p.hue = Number(modal.querySelector('#cHue').value); p.sat = Number(modal.querySelector('#cSat').value); p.light = Number(modal.querySelector('#cLight').value);
    modal.querySelector('#cHueL').textContent = p.hue + '°'; modal.querySelector('#cSatL').textContent = p.sat; modal.querySelector('#cLightL').textContent = p.light;
    editor.recolor(base, p);
  };
  modal.querySelectorAll('input[type=range]').forEach((r) => r.addEventListener('input', apply));
  modal.querySelector('#cColorize').addEventListener('click', () => { const [h, s] = hslOf(S.color); p.colorize = [h, s]; modal.querySelector('#cHue').value = 0; apply(); });
  modal.querySelector('#cReset').addEventListener('click', () => { p.colorize = null; for (const id of ['#cHue', '#cSat', '#cLight']) modal.querySelector(id).value = 0; apply(); });
  // Abbrechen, Esc oder Klick daneben: alles wie vorher
  modalCancel = () => { if (done) return; done = true; d.data.set(base); d.undo.pop(); editor.changed(); };
  modal.querySelector('#cCancel').addEventListener('click', closeModal);
  modal.querySelector('#cOk').addEventListener('click', () => {
    done = true; modalCancel = null; closeModal();
    if (base.every((v, i) => v === d.data[i])) d.undo.pop(); else toast('🌈 Umgefärbt', 'ok');
  });
}

// ---------- Farben ----------
function setColor(rgba, recent = true) {
  S.color = [rgba[0], rgba[1], rgba[2], rgba[3] ?? 255];
  $('#curSwatch').style.background = css(S.color);
  $('#colorInput').value = toHex(S.color).toLowerCase();
  if (document.activeElement !== $('#hexInput')) $('#hexInput').value = toHex(S.color);
  $('#alphaInput').value = S.color[3];
  $('#alphaLabel').textContent = percent(S.color[3]) + (S.color[3] === 255 ? ' (voll)' : S.color[3] === 0 ? ' (unsichtbar)' : '');
  if (recent) addRecent(S.color);
  // Muster-Vorschlaege passen sich der neuen Farbe an
  if (S.tool === 'noise') { clearTimeout(setColor.t); setColor.t = setTimeout(renderToolOpts, 150); }
}

function swatchBtn(rgba, extra = '', title = '') {
  return `<button class="sw-btn ${extra}" data-rgba="${rgba.join(',')}" title="${esc(title || toHex(rgba) + ' · ' + describeAlpha(rgba[3]))}"><i style="background:${css(rgba)}"></i></button>`;
}

function buildQuickColors() {
  $('#quickColors').innerHTML = QUICK.map((h) => swatchBtn([...fromHex(h), 255])).join('');
}

let recent = [];
function loadRecent() { try { recent = JSON.parse(localStorage.getItem('mct-recent') || '[]'); } catch { recent = []; } renderRecent(); }
function addRecent(c) {
  const k = c.join(',');
  recent = [c.slice(), ...recent.filter((r) => r.join(',') !== k)].slice(0, 12);
  try { localStorage.setItem('mct-recent', JSON.stringify(recent)); } catch { /* egal */ }
  renderRecent();
}
function renderRecent() { $('#recentColors').innerHTML = recent.length ? recent.map((c) => swatchBtn(c)).join('') : '<span class="hint">Noch keine</span>'; }

function paletteOf(d) {
  const m = new Map();
  for (let i = 0; i < d.data.length; i += 4) {
    if (d.data[i + 3] === 0) continue;
    const k = keyOf(d.data[i], d.data[i + 1], d.data[i + 2], d.data[i + 3]);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

function renderPalette() {
  const d = S.doc;
  if (!d) { $('#palette').innerHTML = ''; $('#paletteCount').textContent = ''; return; }
  const m = paletteOf(d);
  const list = rainbowSort([...m.entries()], (e) => unkey(e[0]));
  $('#paletteCount').textContent = list.length + ' Farben';
  $('#palette').innerHTML = list.slice(0, 600).map(([k, n]) => {
    const c = unkey(k);
    return swatchBtn(c, c[3] <= 38 ? 'faint' : '', `${toHex(c)} · ${describeAlpha(c[3])} · ${n} Pixel`).replace('data-rgba', `data-count="${n}" data-rgba`);
  }).join('') || '<span class="hint">Die Textur ist leer.</span>';
}

function openColorMenu(rgba, count, anchor) {
  const m = $('#colorMenu');
  const ro = S.theme === 'normal';
  m.innerHTML = `
    <div class="pop-head"><div class="swatch big checker"><div style="width:100%;height:100%;background:${css(rgba)}"></div></div>
      <div><div class="hexline">${toHex(rgba)}</div><div class="meta">${describeAlpha(rgba[3])}${count ? ' · ' + count + ' Pixel' : ''}</div></div></div>
    <button data-act="paint">🖌️ Damit malen</button>
    ${count ? '<button data-act="show">👁️ Im Bild zeigen</button>' : ''}
    ${ro ? '' : '<button data-act="local">🎨 In dieser Textur ersetzen …</button>'}
    ${ro ? '' : '<button data-act="global">🌍 In allen Texturen ersetzen …</button>'}`;
  m.hidden = false;
  const r = anchor.getBoundingClientRect();
  const left = Math.min(window.innerWidth - 262, Math.max(8, r.left - 120));
  const top = r.bottom + 8 + 260 > window.innerHeight ? r.top - 8 - m.offsetHeight : r.bottom + 8;
  m.style.left = left + 'px'; m.style.top = Math.max(8, top) + 'px';
  m.onclick = (e) => {
    const act = e.target.closest('button')?.dataset.act;
    if (!act) return;
    m.hidden = true;
    if (act === 'paint') { setColor(rgba); if (S.tool === 'eraser' || S.tool === 'picker') setTool('pencil'); }
    if (act === 'show') editor.highlight(pixelsOf(rgba));
    if (act === 'local') replaceDialog(rgba, false);
    if (act === 'global') replaceDialog(rgba, true);
  };
}

function pixelsOf(rgba) {
  const out = [], d = S.doc.data;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) if (d[i] === rgba[0] && d[i + 1] === rgba[1] && d[i + 2] === rgba[2] && d[i + 3] === rgba[3]) out.push(p);
  return out;
}

// ---------- Ersetzen-Fenster ----------
async function replaceDialog(from, global) {
  const d = S.doc;
  let to = S.color.slice();
  if (to[0] === from[0] && to[1] === from[1] && to[2] === from[2]) to = [79, 255, 35, 255];
  const dir = d.path.split('/').slice(0, -1).join('/') + '/';
  const scopes = [['', 'Alle Texturen'], ['block/', 'Nur Blöcke'], ['item/', 'Nur Items'], ['entity/', 'Nur Mobs & Rüstung'], ['gui/', 'Nur GUI & HUD'], [dir, 'Nur Ordner ' + dir]];
  const modal = openModal(`
    <h2>${global ? '🌍 Farbe in allen Texturen ersetzen' : '🎨 Farbe in dieser Textur ersetzen'}</h2>
    <div class="swap">
      <div class="side-col"><div class="swatch big checker"><div style="width:100%;height:100%;background:${css(from)}"></div></div><b>${toHex(from)}</b><span class="hint">${describeAlpha(from[3])}</span></div>
      <div class="arrow">➡️</div>
      <div class="side-col"><div class="swatch big checker"><div id="rTo" style="width:100%;height:100%"></div></div>
        <label class="native-pick" style="width:100%"><input id="rColor" type="color"><span>Neue Farbe</span></label>
        <input id="rHex" class="hex" maxlength="7"></div>
    </div>
    <div class="swatches" id="rQuick">${QUICK.map((h) => swatchBtn([...fromHex(h), 255])).join('')}${recent.slice(0, 6).map((c) => swatchBtn(c)).join('')}</div>
    <label class="density"><span>Dichte der neuen Farbe <b id="rAlphaL"></b></span><input id="rAlpha" type="range" min="0" max="255"></label>
    <label class="density"><span>Ähnliche Farben mitnehmen <b id="rTolL"></b></span><input id="rTol" type="range" min="0" max="40" value="0"></label>
    <p class="hint">Pixel mit dieser Farbe werden getauscht – egal wie stark man sie sieht. So bleiben keine schwachen Reste übrig.</p>
    ${global ? `<label class="field">Wo ersetzen?<select id="rScope">${scopes.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('')}</select></label>
    <div id="rFound" class="found"><span class="spinner"></span> Suche …</div>` : ''}
    <div class="actions"><button class="btn ghost" data-close>Abbrechen</button><button class="btn primary" id="rGo">🔄 Ersetzen</button></div>`);
  const upd = () => {
    modal.querySelector('#rTo').style.background = css(to);
    modal.querySelector('#rColor').value = toHex(to).toLowerCase();
    if (document.activeElement !== modal.querySelector('#rHex')) modal.querySelector('#rHex').value = toHex(to);
    modal.querySelector('#rAlpha').value = to[3];
    modal.querySelector('#rAlphaL').textContent = percent(to[3]);
    modal.querySelector('#rTolL').textContent = modal.querySelector('#rTol').value === '0' ? 'nur genau diese' : '± ' + modal.querySelector('#rTol').value;
  };
  upd();
  modal.querySelector('#rColor').addEventListener('input', (e) => { to = [...fromHex(e.target.value), to[3]]; upd(); });
  modal.querySelector('#rHex').addEventListener('input', (e) => { const c = fromHex(e.target.value); if (c) { to = [...c, to[3]]; upd(); } });
  modal.querySelector('#rAlpha').addEventListener('input', (e) => { to[3] = Number(e.target.value); upd(); });
  modal.querySelector('#rQuick').addEventListener('click', (e) => { const b = e.target.closest('.sw-btn'); if (b) { to = b.dataset.rgba.split(',').map(Number); upd(); } });
  let findTimer = null, found = null;
  const find = () => {
    if (!global) return;
    clearTimeout(findTimer);
    const box = modal.querySelector('#rFound');
    box.innerHTML = '<span class="spinner"></span> Suche …';
    findTimer = setTimeout(async () => {
      try {
        found = await post('/api/find-color', { theme: S.theme, from: from.slice(0, 3), tol: Number(modal.querySelector('#rTol').value), scope: modal.querySelector('#rScope').value });
        box.innerHTML = found.count ? `🎯 Steckt in <b>${found.count}</b> ${found.count === 1 ? 'Textur' : 'Texturen'} (${found.pixels.toLocaleString('de')} Pixel)` : '🤷 In keiner gespeicherten Textur gefunden';
      } catch (e) { box.textContent = e.message; }
    }, 250);
  };
  modal.querySelector('#rTol').addEventListener('input', () => { upd(); find(); });
  modal.querySelector('#rScope')?.addEventListener('change', find);
  find();
  modal.querySelector('#rGo').addEventListener('click', async () => {
    const tol = Number(modal.querySelector('#rTol').value);
    if (!global) {
      editor.pushUndo();
      const n = editor.replaceColor(from, to, tol);
      if (!n) { S.doc.undo.pop(); toast('Nichts zum Ersetzen gefunden', 'bad'); }
      else { S.doc.replaced.push({ from: from.slice(0, 3), to: to.slice() }); editor.changed(); toast(`🔄 ${n} Pixel getauscht`, 'ok'); }
      closeModal();
      return;
    }
    const btn = modal.querySelector('#rGo');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Ersetze …';
    try {
      if (S.drafts.size && !(await save())) { btn.disabled = false; btn.textContent = '🔄 Ersetzen'; return; }
      const r = await post('/api/replace-color', { theme: S.theme, from: from.slice(0, 3), to, tol, scope: modal.querySelector('#rScope').value });
      closeModal();
      await afterBatch();
      toast(`🌍 In ${r.changed} ${r.changed === 1 ? 'Textur' : 'Texturen'} ersetzt`, 'ok', { label: 'Rückgängig', run: undoBatch });
    } catch (e) { btn.disabled = false; btn.textContent = '🔄 Ersetzen'; toast(e.message, 'bad'); }
  });
}

async function afterBatch() {
  S.globalVer++;
  await loadList();
  if (S.doc) await openTexture(S.doc.path, true);
  S.info.canUndoBatch = true;
}

async function undoBatch() {
  try {
    const r = await post('/api/undo-batch');
    await afterBatch();
    S.info.canUndoBatch = false;
    toast(`↩️ ${r.restored} Texturen zurückgeholt`, 'ok');
  } catch (e) { toast(e.message, 'bad'); }
}

// ---------- Hinweise ----------
let lastWarnings = [];
function renderWarnings() {
  const box = $('#warnings');
  if (!S.info.settings.showWarnings || !S.doc) { box.innerHTML = ''; return; }
  const ws = computeWarnings(S.doc, S.doc.path);
  lastWarnings = ws;
  if (!ws.length) { box.innerHTML = '<div class="warn-ok">✓ Keine Fehler gefunden</div>'; return; }
  const head = `<button class="warn-head" data-toggle>⚠️ Hinweise (${ws.length}) ${S.warnCollapsed ? '▸' : '▾'}</button>`;
  box.innerHTML = head + (S.warnCollapsed ? '' : ws.map((w, i) => `
    <div class="warn ${w.level}">
      <div class="wt">${w.icon} ${esc(w.title)}${w.swatch ? `<span class="sw-btn" style="width:16px;height:16px;display:inline-block"><i style="background:${css(w.swatch)}"></i></span>` : ''}</div>
      <div class="wx">${esc(w.text)}</div>
      <div class="wb">${w.pixels ? `<button data-show="${i}">👁️ Zeigen</button>` : ''}${S.theme !== 'normal' ? (w.fixes || []).map((f, j) => `<button class="fix" data-fix="${i}:${j}">🛠️ ${esc(f.label)}</button>`).join('') : ''}</div>
    </div>`).join(''));
}

// ---------- Themen ----------
const themeName = () => (S.theme === 'normal' ? 'Normal' : S.themes.find((t) => t.key === S.theme)?.name || S.theme);
const themeColor = (key) => (key === 'normal' ? '#c6c6c6' : `hsl(${[...key].reduce((a, c) => a + c.charCodeAt(0) * 37, 0) % 360} 90% 65%)`);

function renderThemeButton() {
  $('#themeName').textContent = 'Thema: ' + themeName();
  $('#themeBtn .dot').style.background = themeColor(S.theme);
  $('#themeBtn .dot').style.color = themeColor(S.theme);
  $('#cmdHint').textContent = '/thema ' + (S.theme === 'normal' ? (S.themes[0]?.key || 'meinthema') : S.theme);
}

function openThemeMenu() {
  const m = $('#themeMenu');
  m.innerHTML = `
    <button data-theme="normal" class="${S.theme === 'normal' ? 'current' : ''}"><span style="color:${themeColor('normal')}">⬤</span> Normal <span class="meta">Original, nur ansehen</span></button>
    ${S.themes.map((t) => `<button data-theme="${t.key}" class="${S.theme === t.key ? 'current' : ''}"><span style="color:${themeColor(t.key)}">⬤</span> ${esc(t.name)} <span class="meta">${t.count} geändert</span></button>`).join('')}
    <hr>
    <button data-act="new">➕ Neues Thema …</button>
    ${S.info.vorlagen ? `<button data-act="vorlagen" ${S.theme === 'normal' ? 'disabled' : ''}>✨ Fertige Vorlage anwenden …</button>` : ''}
    <button data-act="activate" ${S.theme === 'normal' ? 'disabled' : ''}>🎮 „${esc(themeName())}“ im Spiel einschalten</button>
    <button data-act="deactivate">⬜ Im Spiel ausschalten (normal)</button>
    <button data-act="folder">📂 Themen-Ordner öffnen</button>
    <hr>
    <button data-act="upload" ${S.theme === 'normal' ? 'disabled' : ''}>⬆️ „${esc(themeName())}“ online speichern …</button>
    <button data-act="mine">☁️ Meine Online-Themen …</button>
    <button data-act="discover">🌍 Themen von anderen …</button>
    <div class="menu-hint">${S.info.profile.canCommand
      ? `Im Spiel wechseln: <code>/thema ${S.theme === 'normal' ? esc(S.themes[0]?.key || 'meinthema') : esc(S.theme)}</code> · <code>/thema normal</code>`
      : `In Minecraft ${esc(S.info.profile.version)} gibt es kein /thema – „Im Spiel einschalten“ wirkt beim nächsten Start.`}
      <br>Beim nächsten Start aktiv: <b>${esc(activeName())}</b></div>`;
  m.hidden = false;
}

/** Fertige Designs: werden als ungespeicherte Aenderungen geladen - anschauen, dann einmal speichern. */
async function vorlagenDialog() {
  const list = await get('/api/vorlagen');
  const m = openModal(`
    <h2>✨ Fertige Vorlagen</h2>
    <p>Eine Vorlage malt gleich mehrere Texturen auf einmal. Danach kannst du alles anschauen und weiter verändern – gespeichert wird erst, wenn du auf 💾 klickst.</p>
    <div class="plist">${list.map((v) => `
      <div class="pcard vorlage ${v.passt ? '' : 'off'}">
        <span class="vicon">${esc(v.icon || '✨')}</span>
        <span class="pmain"><b>${esc(v.name)}</b><img class="vprev" src="/vorlagen/${encodeURIComponent(v.id)}/vorschau.png" alt="">
          <span class="pver">${esc(v.beschreibung || '')}</span>
          <span class="pstat ${v.passt ? '' : 'off'}">${v.passt ? `${v.passt} Texturen` : `Passt nicht zu Minecraft ${esc(S.info.version)}`}</span></span>
        <button class="btn primary small" data-vorlage="${esc(v.id)}" ${v.passt ? '' : 'disabled'}>Anwenden</button>
      </div>`).join('') || '<p>Keine Vorlagen gefunden.</p>'}</div>
    <div class="actions"><button class="btn ghost" data-close>Schließen</button></div>`);
  m.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-vorlage]');
    if (!b) return;
    b.disabled = true; b.innerHTML = '<span class="spinner"></span>';
    try { await applyVorlage(b.dataset.vorlage); closeModal(); }
    catch (er) { toast(er.message, 'bad'); b.disabled = false; b.textContent = 'Anwenden'; }
  });
}

async function applyVorlage(id) {
  const v = await get('/api/vorlage?id=' + encodeURIComponent(id));
  let first = null;
  for (const t of v.textures) {
    let doc = S.drafts.get(t.path);
    if (!doc) {
      try { doc = await loadDoc(t.path); }
      catch {
        // Zusatz-Textur, die es noch nicht gibt (z. B. Krempe fuer die Mod): neu anlegen
        doc = { path: t.path, w: t.w, h: t.h, data: new Uint8ClampedArray(t.w * t.h * 4), source: 'neu', mcmeta: null, vanilla: null, frameH: null, undo: [], redo: [], replaced: [], dirty: false };
      }
    }
    doc.undo.push({ w: doc.w, h: doc.h, data: doc.data.slice() }); // Strg+Z holt den alten Stand zurueck
    doc.redo.length = 0;
    Object.assign(doc, { w: t.w, h: t.h, data: b64ToBytes(t.data), dirty: true });
    S.drafts.set(t.path, doc);
    first = first || (t.path.startsWith('entity/equipment/humanoid/') ? t.path : null);
  }
  S.cat = 'drafts';
  renderCats();
  renderGrid();
  await openTexture(first || v.textures[0].path);
  renderDocBar();
  toast(`${esc(v.name)}: ${v.textures.length} Texturen geladen – noch nicht gespeichert. Anschauen, ändern, dann einmal <b>💾 Speichern</b>.`, 'ok');
}

function activeName() {
  const f = S.info.profile.activeInOptions;
  return f ? (S.themes.find((t) => t.folder === f)?.name || f) : 'normal';
}

/** Thema ohne /thema einschalten: schreibt die options.txt des Profils (nur wenn das Spiel zu ist). */
async function activateTheme(on) {
  try {
    const r = await post('/api/activate', { theme: on ? S.theme : 'normal' });
    S.info.profile.activeInOptions = r.active;
    toast(on ? `🎮 „${esc(themeName())}“ ist beim nächsten Start von „${esc(S.info.profile.name)}“ an` : `⬜ Beim nächsten Start von „${esc(S.info.profile.name)}“: normale Texturen`, 'ok');
  } catch (e) { toast(e.message, 'bad'); }
}

async function switchTheme(key) {
  if (key === S.theme) return;
  if (!(await handleDrafts('Vor dem Themenwechsel speichern?'))) return;
  S.theme = key;
  if (key === 'normal' && S.cat === 'changed') S.cat = 'block';
  if (key === 'normal') setTool('picker'); else if (S.tool === 'picker') setTool('pencil');
  post('/api/settings', { lastTheme: key }).catch(() => {});
  S.info.settings.lastTheme = key;
  renderThemeButton();
  await loadList();
  if (S.doc) await openTexture(S.doc.path, true);
  toast(`🎨 Thema „${themeName()}“`, 'ok');
}

async function newThemeDialog() {
  const modal = openModal(`
    <h2>➕ Neues Thema</h2>
    <p>Ein Thema ist ein eigenes Texturen-Paket im Profil <b>${esc(S.info.profile.name)}</b>. Im Spiel wechselst du mit <code>/thema name</code>.</p>
    <label class="field">Name<input type="text" id="tName" placeholder="z. B. Rot, Lila Nacht, Eis" maxlength="30"></label>
    <label class="field">Starten mit<select id="tFrom"><option value="normal">Minecraft-Original (alles neu malen)</option>${S.themes.map((t) => `<option value="${t.key}">Kopie von „${esc(t.name)}“</option>`).join('')}</select></label>
    <div class="actions"><button class="btn ghost" data-close>Abbrechen</button><button class="btn primary" id="tGo">✨ Anlegen</button></div>`);
  modal.querySelector('#tName').focus();
  const go = async () => {
    const name = modal.querySelector('#tName').value.trim();
    if (!name) return;
    try {
      const r = await post('/api/theme', { name, copyFrom: modal.querySelector('#tFrom').value });
      S.themes = (await get('/api/info')).themes;
      closeModal();
      await switchTheme(r.theme.key);
      toast(`✨ Thema „${esc(r.theme.name)}“ angelegt – im Spiel: <code>/thema ${r.theme.key}</code>`, 'ok');
    } catch (e) { toast(e.message, 'bad'); }
  };
  modal.querySelector('#tGo').addEventListener('click', go);
  modal.querySelector('#tName').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
}

// ---------- Animation ----------
/** Ein Einzelbild in eine kleine Leinwand zeichnen (scharfe Pixel) */
function drawFrame(canvas, data, w, fh, maxW, maxH) {
  const s = Math.max(1, Math.min(Math.floor(maxW / w) || 1, Math.floor(maxH / fh) || 1));
  const fit = Math.min(maxW / w, maxH / fh);
  const scale = w * s > maxW || fh * s > maxH ? fit : s;
  canvas.width = Math.max(1, Math.round(w * scale)); canvas.height = Math.max(1, Math.round(fh * scale));
  const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = fh;
  tmp.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data), w, fh), 0, 0);
  const c = canvas.getContext('2d');
  c.imageSmoothingEnabled = false;
  c.clearRect(0, 0, canvas.width, canvas.height);
  c.drawImage(tmp, 0, 0, canvas.width, canvas.height);
}

function renderAnimBar() {
  const bar = $('#animBar'), d = S.doc;
  $('#animBtn').classList.toggle('on', !!S.animOpen);
  bar.hidden = !S.animOpen || !d;
  if (bar.hidden) { editor.focusFrame(null, false); stopAnimPreview(); return; }
  const n = frameCount(d), ro = S.theme === 'normal', ca = canAnimate(d.path);
  S.animFrame = Math.max(0, Math.min(n - 1, S.animFrame || 0));
  const a = d.anim || {}, ft = a.frametime || 1;
  bar.innerHTML = `
    <div class="anim-head">
      <b>🎬 Animation</b><span class="muted">${n > 1 ? `${n} Bilder · ${d.w}×${frameHeight(d)}` : 'Noch keine Animation – mit ＋ oder dem Effekt-Assistenten anfangen'}</span>
      ${!ca.ok ? `<span class="anim-warn" title="${esc(ca.why)}">⚠️ Läuft im Spiel ohne Mods nicht</span>` : ca.note ? `<span class="anim-note" title="${esc(ca.note)}">ℹ️ ab 1.20.2</span>` : ''}
      <span class="fill"></span>
      <button class="btn small primary" data-a="effect" ${ro ? 'disabled' : ''}>✨ Effekt-Assistent</button>
      <button class="btn small" data-a="sheetload" ${ro ? 'disabled' : ''} title="Ein Sprite-Sheet (PNG mit Einzelbildern im Raster) als Animation laden – oder hier hineinziehen">📂 Sprite-Sheet laden</button>
      <button class="btn small" data-a="sheetsave" ${n < 2 ? 'disabled' : ''} title="Alle Einzelbilder als ein PNG-Raster speichern">💾 Sprite-Sheet</button>
      <input type="file" accept="image/png,image/*" id="sheetFile" hidden>
      <button class="btn small" data-a="help">❓ Hilfe</button>
      <button class="iconbtn sm" data-a="close" title="Leiste schließen">✕</button>
    </div>
    <div class="anim-body">
      <div class="anim-preview" title="So sieht es im Spiel aus"><canvas id="animPrev"></canvas>
        <button class="iconbtn sm" data-a="play" title="Abspielen / Anhalten">${S.animPaused ? '▶' : '⏸'}</button></div>
      <div class="anim-strip" id="animStrip">
        ${[...Array(n).keys()].map((i) => `<button class="aframe ${i === S.animFrame ? 'on' : ''}" data-f="${i}" title="Bild ${i + 1} bearbeiten"><canvas data-thumb="${i}"></canvas><span>${i + 1}</span></button>`).join('')}
        <button class="aframe add" data-a="add" ${ro ? 'disabled' : ''} title="Neues Bild: Kopie vom gewählten Bild dahinter">＋</button>
      </div>
      <div class="anim-ctrl">
        <div class="anim-row"><span class="lbl">Bild ${S.animFrame + 1}</span>
          <button class="iconbtn sm" data-a="dup" ${ro ? 'disabled' : ''} title="Bild doppeln">⧉</button>
          <button class="iconbtn sm" data-a="blank" ${ro ? 'disabled' : ''} title="Leeres Bild dahinter">⬜</button>
          <button class="iconbtn sm" data-a="left" ${ro || S.animFrame === 0 ? 'disabled' : ''} title="Nach vorne schieben">◀</button>
          <button class="iconbtn sm" data-a="right" ${ro || S.animFrame >= n - 1 ? 'disabled' : ''} title="Nach hinten schieben">▶</button>
          <button class="iconbtn sm" data-a="del" ${ro || n < 2 ? 'disabled' : ''} title="Bild löschen">🗑️</button>
        </div>
        <label class="anim-row" title="1 Tick = 1/20 Sekunde"><span class="lbl">Takt</span><input type="range" min="1" max="40" value="${ft}" data-a="speed" ${ro || n < 2 ? 'disabled' : ''}><span id="animSpeed" class="muted">${speedText(ft)}</span></label>
        <label class="anim-row"><input type="checkbox" data-a="interp" ${a.interpolate ? 'checked' : ''} ${ro || n < 2 ? 'disabled' : ''}> Weich überblenden <span class="muted">(Minecraft mischt zwischen den Bildern)</span></label>
        ${n > 1 && !ro ? '<button class="btn small ghost" data-a="remove" title="Nur Bild 1 bleibt">Animation entfernen</button>' : ''}
      </div>
    </div>`;
  renderAnimThumbs();
  editor.focusFrame(n > 1 ? S.animFrame : null, false);
  startAnimPreview();
}

function renderAnimThumbs() {
  const d = S.doc;
  if (!d || $('#animBar').hidden) return;
  const fh = frameHeight(d);
  $('#animBar').querySelectorAll('canvas[data-thumb]').forEach((c) => drawFrame(c, getFrame(d, Number(c.dataset.thumb)), d.w, fh, 72, 36));
}

let animTimer = null;
function stopAnimPreview() { cancelAnimationFrame(animTimer); animTimer = null; }
function startAnimPreview() {
  stopAnimPreview();
  const cv = $('#animPrev');
  if (!cv) return;
  const t0 = performance.now();
  const tick = (now) => {
    const d = S.doc;
    if (!d || !cv.isConnected) return;
    const n = frameCount(d), fh = frameHeight(d), tl = timeline(d.anim, n), total = tl.reduce((s, f) => s + f.time, 0) || 1;
    // 1 Tick = 50 ms; angehalten: das gewaehlte Bild zeigen
    let data;
    if (S.animPaused || n < 2) data = getFrame(d, Math.min(S.animFrame || 0, n - 1));
    else {
      let t = ((now - t0) / 50) % total, k = 0;
      while (k < tl.length - 1 && t >= tl[k].time) { t -= tl[k].time; k++; }
      data = getFrame(d, tl[k].index);
      if (d.anim?.interpolate) data = blend(data, getFrame(d, tl[(k + 1) % tl.length].index), t / tl[k].time);
    }
    drawFrame(cv, data, d.w, fh, 124, 58);
    animTimer = requestAnimationFrame(tick);
  };
  animTimer = requestAnimationFrame(tick);
}

/** Einzelbilder ersetzen (mit Rueckgaengig). sel = danach gewaehltes Bild */
function setFrames(frames, fh, sel, anim) {
  const d = S.doc;
  editor.commitSelection();
  editor.pushUndo();
  d.data = joinFrames(frames, d.w, fh);
  d.h = fh * frames.length;
  d.frameH = frames.length > 1 ? fh : null;
  if (anim !== undefined) d.anim = anim;
  if (frames.length > 1) { d.anim ||= { frametime: 2 }; delete d.anim.frames; } // eigene Reihenfolge passt nicht mehr
  else d.anim = null;
  d.animDirty = true;
  S.animFrame = Math.max(0, Math.min(frames.length - 1, sel));
  editor.changed();
  renderAnimBar();
  editor.focusFrame(frames.length > 1 ? S.animFrame : null, true);
}

function animAction(a, el) {
  const d = S.doc;
  if (!d) return;
  const n = frameCount(d), fh = frameHeight(d), i = S.animFrame || 0;
  const frames = [...Array(n).keys()].map((k) => getFrame(d, k));
  if (a === 'close') { S.animOpen = false; renderAnimBar(); return; }
  if (a === 'help') return animHelp();
  if (a === 'play') { S.animPaused = !S.animPaused; el.textContent = S.animPaused ? '▶' : '⏸'; return; }
  if (S.theme === 'normal') return;
  if (a === 'sheetsave') { const sh = toSheet(frames, d.w, fh); return savePng(sh.data, sh.w, sh.h, `${pretty(d.path)}-sprite-sheet.png`); }
  if (S.theme === 'normal') return;
  if (a === 'sheetload') { $('#sheetFile').click(); return; }
  if (a === 'effect') return effectDialog();
  if (a === 'add' || a === 'dup') { frames.splice(i + 1, 0, frames[i].slice()); return setFrames(frames, fh, i + 1); }
  if (a === 'blank') { frames.splice(i + 1, 0, new Uint8ClampedArray(frames[i].length)); return setFrames(frames, fh, i + 1); }
  if (a === 'left' && i > 0) { [frames[i - 1], frames[i]] = [frames[i], frames[i - 1]]; return setFrames(frames, fh, i - 1); }
  if (a === 'right' && i < n - 1) { [frames[i + 1], frames[i]] = [frames[i], frames[i + 1]]; return setFrames(frames, fh, i + 1); }
  if (a === 'del' && n > 1) { frames.splice(i, 1); return setFrames(frames, fh, i - 1); }
  if (a === 'remove') { return setFrames([frames[0]], fh, 0); }
}

function bindAnimBar() {
  const bar = $('#animBar');
  bar.addEventListener('change', (e) => { if (e.target.id === 'sheetFile' && e.target.files[0]) { loadSheetFile(e.target.files[0]); e.target.value = ''; } });
  bar.addEventListener('dragover', (e) => { if (S.theme !== 'normal') { e.preventDefault(); bar.classList.add('drop'); } });
  bar.addEventListener('dragleave', () => bar.classList.remove('drop'));
  bar.addEventListener('drop', (e) => { e.preventDefault(); bar.classList.remove('drop'); if (S.theme !== 'normal' && e.dataTransfer.files[0]) loadSheetFile(e.dataTransfer.files[0]); });
  bar.addEventListener('click', (e) => {
    const f = e.target.closest('[data-f]');
    if (f) { S.animFrame = Number(f.dataset.f); renderAnimBar(); editor.focusFrame(S.animFrame, true); return; }
    const b = e.target.closest('button[data-a]');
    if (b && !b.disabled) animAction(b.dataset.a, b);
  });
  bar.addEventListener('input', (e) => {
    const d = S.doc;
    if (!d || S.theme === 'normal') return;
    if (e.target.dataset.a === 'speed') {
      d.anim = { ...(d.anim || {}), frametime: Number(e.target.value) };
      d.animDirty = true;
      $('#animSpeed').textContent = speedText(d.anim.frametime);
      docChanged();
    }
    if (e.target.dataset.a === 'interp') {
      d.anim = { ...(d.anim || {}), interpolate: e.target.checked };
      if (!e.target.checked) delete d.anim.interpolate;
      d.animDirty = true;
      docChanged();
    }
  });
}

/** Effekt-Assistent: aus dem gewaehlten Bild eine fertige Animation machen */
function effectDialog() {
  const d = S.doc;
  const fh = frameHeight(d), base = getFrame(d, S.animFrame || 0);
  const ca = canAnimate(d.path);
  let eff = EFFECTS[0], opts = { frames: eff.frames, ticks: eff.ticks, strength: 0.6, dir: 'down', interpolate: !!eff.interpolate };
  const m = openModal(`
    <h2>✨ Effekt-Assistent</h2>
    <p>Macht aus <b>Bild ${(S.animFrame || 0) + 1}</b> eine fertige Animation. Danach kannst du jedes Bild noch nachmalen.</p>
    ${!ca.ok ? `<p class="hint">⚠️ ${esc(ca.why)}</p>` : ''}
    <div class="fx-grid">${EFFECTS.map((e) => `<button class="fx ${e.id === eff.id ? 'on' : ''}" data-fx="${e.id}" title="${esc(e.tip)}"><span class="fx-ic">${e.icon}</span><b>${esc(e.name)}</b><small>${esc(e.tip)}</small></button>`).join('')}</div>
    <div class="fx-row">
      <div class="fx-prev"><canvas id="fxPrev"></canvas></div>
      <div class="fx-opts">
        <label>Bilder <b id="fxN"></b><input type="range" min="2" max="32" id="fxFrames"></label>
        <label>Takt <b id="fxT"></b><input type="range" min="1" max="20" id="fxTicks"></label>
        <label>Stärke <b id="fxS"></b><input type="range" min="10" max="100" id="fxStrength"></label>
        <label id="fxDirRow">Richtung <select id="fxDir"><option value="down">⬇️ nach unten</option><option value="up">⬆️ nach oben</option><option value="right">➡️ nach rechts</option><option value="left">⬅️ nach links</option></select></label>
        <label class="chk"><input type="checkbox" id="fxInterp"> Weich überblenden</label>
        <div class="hint" id="fxColorHint">🎨 Zielfarbe = deine aktuelle Farbe <span class="sw-btn" style="width:16px;height:16px;display:inline-block;vertical-align:middle"><i style="background:${css(S.color)}"></i></span></div>
      </div>
      <div class="fx-sheet"><div class="muted small">Sprite-Sheet (alle Bilder):</div><canvas id="fxSheet"></canvas><button class="btn small" id="fxSave">💾 Als PNG speichern</button></div>
    </div>
    <div class="actions"><button class="btn ghost" data-close>Abbrechen</button><button class="btn primary" id="fxGo">✨ Übernehmen</button></div>`);
  let frames = [], raf = null;
  const prev = m.querySelector('#fxPrev');
  const build = () => {
    frames = makeEffect(eff.id, base, d.w, fh, { ...opts, color: S.color.slice(0, 3) });
    m.querySelector('#fxN').textContent = opts.frames;
    m.querySelector('#fxT').textContent = speedText(opts.ticks);
    m.querySelector('#fxS').textContent = Math.round(opts.strength * 100) + ' %';
    m.querySelector('#fxFrames').value = opts.frames; m.querySelector('#fxTicks').value = opts.ticks;
    m.querySelector('#fxStrength').value = Math.round(opts.strength * 100); m.querySelector('#fxInterp').checked = opts.interpolate;
    m.querySelector('#fxDirRow').hidden = eff.id !== 'flow';
    m.querySelector('#fxColorHint').hidden = eff.id !== 'tint';
    m.querySelectorAll('.fx').forEach((b) => b.classList.toggle('on', b.dataset.fx === eff.id));
    const sh = toSheet(frames, d.w, fh);
    drawFrame(m.querySelector('#fxSheet'), sh.data, sh.w, sh.h, 260, 110);
  };
  const t0 = performance.now();
  const loop = (now) => {
    if (!prev.isConnected) return;
    const total = frames.length * opts.ticks, t = ((now - t0) / 50) % total, k = Math.floor(t / opts.ticks);
    let data = frames[k];
    if (opts.interpolate) data = blend(data, frames[(k + 1) % frames.length], (t % opts.ticks) / opts.ticks);
    drawFrame(prev, data, d.w, fh, 260, 120);
    raf = requestAnimationFrame(loop);
  };
  modalCancel = () => cancelAnimationFrame(raf);
  m.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fx]');
    if (!b) return;
    eff = EFFECTS.find((x) => x.id === b.dataset.fx);
    opts = { ...opts, frames: eff.frames, ticks: eff.ticks, interpolate: !!eff.interpolate };
    build();
  });
  m.addEventListener('input', (e) => {
    const id = e.target.id;
    if (id === 'fxFrames') opts.frames = Number(e.target.value);
    if (id === 'fxTicks') opts.ticks = Number(e.target.value);
    if (id === 'fxStrength') opts.strength = Number(e.target.value) / 100;
    if (id === 'fxDir') opts.dir = e.target.value;
    if (id === 'fxInterp') opts.interpolate = e.target.checked;
    build();
  });
  m.querySelector('#fxSave').addEventListener('click', () => { const sh = toSheet(frames, d.w, fh); savePng(sh.data, sh.w, sh.h, `${pretty(d.path)}-${eff.id}-sprite-sheet.png`); });
  m.querySelector('#fxGo').addEventListener('click', () => {
    cancelAnimationFrame(raf); modalCancel = null; closeModal();
    const anim = { frametime: opts.ticks };
    if (opts.interpolate) anim.interpolate = true;
    setFrames(frames, fh, 0, anim);
    S.animPaused = false;
    toast(`✨ ${eff.name}: ${frames.length} Bilder – jetzt kannst du jedes Bild noch nachmalen. Speichern nicht vergessen!`, 'ok');
  });
  build();
  raf = requestAnimationFrame(loop);
}

/** Pixel als PNG-Datei herunterladen (landet im Download-Ordner) */
function savePng(data, w, h, name) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data), w, h), 0, 0);
  c.toBlob((b) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = name.replace(/[^\p{L}\p{N} ._-]/gu, '_');
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast(`💾 „${esc(a.download)}“ gespeichert (Download-Ordner)`, 'ok');
  }, 'image/png');
}

/** Bild-Datei in Originalgroesse lesen (fuer Sprite-Sheets) */
async function readImageRaw(file) {
  const bmp = await createImageBitmap(file);
  if (bmp.width * bmp.height > 4096 * 4096) throw new Error('Das Bild ist zu groß.');
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
  const g = c.getContext('2d'); g.drawImage(bmp, 0, 0);
  const id = g.getImageData(0, 0, c.width, c.height);
  return { width: id.width, height: id.height, data: id.data };
}

/** Einzelbilder (auch in anderer Aufloesung) als Animation in die offene Textur laden */
function loadFrames(frames, fw, fh, anim) {
  const d = S.doc;
  editor.commitSelection();
  editor.pushUndo();
  d.w = fw;
  d.data = joinFrames(frames, fw, fh);
  d.h = fh * frames.length;
  d.frameH = frames.length > 1 ? fh : null;
  d.anim = frames.length > 1 ? { ...(anim || d.anim || { frametime: 2 }) } : null;
  if (d.anim) delete d.anim.frames;
  d.animDirty = true;
  S.animFrame = 0; S.animOpen = true; S.animPaused = false;
  editor.changed(); editor.fit();
  renderAnimBar(); renderDocBar();
}

/** Sprite-Sheet-Datei laden: Raster erkennen (bei mehreren Moeglichkeiten fragen) */
async function loadSheetFile(file) {
  const d = S.doc;
  if (!d || S.theme === 'normal') return;
  try {
    const img = await readImageRaw(file);
    const fh0 = frameHeight(d);
    const lays = sheetLayouts(img.width, img.height, d.w, fh0).filter((l) => l.fw >= d.w / 2 && l.n <= 128);
    if (!lays.length) { toast(`Das Bild (${img.width}×${img.height}) passt nicht zu dieser Textur (${d.w}×${fh0} pro Bild). Die Einzelbilder müssen dasselbe Seitenverhältnis haben.`, 'bad'); return; }
    let lay = lays[0];
    if (lays.length > 1) {
      const pick = await choose('Wie ist das Sprite-Sheet aufgebaut?', `Dein Bild ist ${img.width}×${img.height} Pixel groß. Die Textur hat ${d.w}×${fh0} pro Bild.`,
        lays.slice(0, 4).map((l, i) => ({ v: String(i), t: `${l.n} ${l.n === 1 ? 'Bild' : 'Bilder'} à ${l.fw}×${l.fh}${l.fw > d.w ? ' (mehr Pixel)' : ''}`, cls: i === 0 ? 'primary' : '' })).concat([{ v: 'no', t: 'Abbrechen', cls: 'ghost' }]));
      if (pick === null || pick === 'no') return;
      lay = lays[Number(pick)];
    }
    const frames = framesFromSheet(img, lay);
    loadFrames(frames, lay.fw, lay.fh);
    toast(`📂 Sprite-Sheet geladen: ${frames.length} ${frames.length === 1 ? 'Bild' : 'Bilder'} à ${lay.fw}×${lay.fh}. Speichern nicht vergessen!`, 'ok');
  } catch (e) { toast('Sprite-Sheet ging nicht: ' + e.message, 'bad'); }
}

function animHelp() {
  openModal(`
    <h2>❓ So funktionieren Animationen</h2>
    <div class="help">
      <p>🎞️ Eine Animation sind <b>mehrere Bilder untereinander</b> in einer Textur. Minecraft zeigt sie nacheinander – wie ein Daumenkino. Die Bilder sind auf der Malfläche durch blaue Linien getrennt; das gewählte Bild ist gelb umrahmt.</p>
      <p>⏱️ <b>Takt</b>: Minecraft rechnet in <b>Ticks</b>. 20 Ticks sind 1 Sekunde. Takt 2 = 10 Bilder pro Sekunde (flott), Takt 10 = 2 Bilder pro Sekunde (gemütlich).</p>
      <p>🌫️ <b>Weich überblenden</b>: Minecraft mischt zwischen zwei Bildern. Super für Leuchten und Farbwechsel, schlecht für Blinken.</p>
      <h3>Beispiel: leuchtende XP-Leiste</h3>
      <ol>
        <li>Links suchen: <code>experience bar progress</code> und anklicken (die grüne Füllung).</li>
        <li>Nach Wunsch umfärben (Farbe rechts anklicken → „überall ersetzen“).</li>
        <li><b>🎬 Animation</b> → <b>✨ Effekt-Assistent</b> → <b>Lauflicht</b> oder <b>Welle</b> → <b>Übernehmen</b>.</li>
        <li>Einzelbilder unten anklicken und nachmalen, wenn du willst.</li>
        <li><b>💾 Speichern</b> – im Spiel <b>F3+T</b> drücken. Fertig!</li>
      </ol>
      <h3>Was kann man animieren?</h3>
      <ul>
        <li>✅ Blöcke, Items, Partikel, Effekt-Symbole</li>
        <li>✅ GUI-Bilder unter <code>gui/sprites</code> (Hotbar, XP-Leiste, Herzen, Hunger …) – ab Minecraft 1.20.2</li>
        <li>❌ Mobs, Spieler, Rüstung am Körper – nur mit Mods (z. B. „Entity Texture Features“)</li>
      </ul>
      <h3>Tipps</h3>
      <ul>
        <li>Mit <b>＋</b> kopierst du das gewählte Bild – dann nur kleine Änderungen malen, das sieht am flüssigsten aus.</li>
        <li>Wenige Bilder reichen oft: 8–12 für Glanz und Wellen, 2 für Blinken.</li>
        <li>Rückgängig (${KEY}+Z) klappt auch für neue, gelöschte und verschobene Bilder.</li>
      </ul>
    </div>
    <div class="actions"><button class="btn primary" data-close>Alles klar!</button></div>`);
}

// ---------- Textur-KI (ohne Internet) ----------
let kiImage = null; // { img, palette, name }
const kiEdit = { removed: new Set(), added: [] }; // Ziele, die man im Fenster weggeklickt/hinzugefuegt hat
const swatches = (cols) => cols.map((c) => `<i class="ki-sw" style="background:${c}"></i>`).join('');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Bild-Datei lesen (max. 256 px) -> { width, height, data } */
async function readImageFile(file) {
  const bmp = await createImageBitmap(file);
  const sc = Math.min(1, 256 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * sc)); c.height = Math.max(1, Math.round(bmp.height * sc));
  const g = c.getContext('2d');
  g.drawImage(bmp, 0, 0, c.width, c.height);
  const id = g.getImageData(0, 0, c.width, c.height);
  return { width: id.width, height: id.height, data: id.data, url: c.toDataURL() };
}

/** Plan aus Text + Bild (Bildfarben, wenn kein Stil genannt) + im Fenster geaenderte Ziele */
function kiPlan(text) {
  const plan = parsePrompt(text, new Set(S.textures), S.doc?.path || null);
  if (kiImage && (!plan.style || S.kiMode === 'pixel' || plan.style.keepColors)) {
    plan.style = styleFromPalette(kiImage.palette, 'Farben aus „' + kiImage.name + '“');
    plan.understood.unshift(plan.style.name);
  }
  if (S.kiEffect === 'none') plan.animate = null;
  else if (S.kiEffect) plan.animate = S.kiEffect;
  if (S.kiScale) { plan.scale = S.kiScale; plan.size = null; }
  if (plan.animate && !plan.style) plan.style = { id: 'original', name: 'Animiert', colors: { main: '#8A8D93', second: '#FFFFFF', line: '#1A1A1E', light: '#FFFFFF' }, keepColors: true };
  const avail = new Set(S.textures);
  plan.targets = [...plan.targets.filter((p) => !kiEdit.removed.has(p)), ...kiEdit.added.filter((p) => avail.has(p) && !plan.targets.includes(p))];
  if (kiEdit.removed.size || kiEdit.added.length) plan.targetName = plan.targets.length === 1 ? pretty(plan.targets[0]) : `${plan.targets.length} Texturen`;
  return plan;
}

const ANIM_DE = { tint: 'Farbwechsel', burn: 'brennt (Flammen)', pulse: 'leuchtet (pulsiert)', sparkle: 'glitzert', shine: 'Glanz läuft durch', flow: 'fließt', wave: 'Welle', blink: 'blinkt', rainbow: 'Regenbogen', auto: 'passend zum Stil' };
function kiPlanHtml(plan) {
  if (!plan.style) return `<div class="ki-miss">🤔 Ich weiß noch nicht, wie es aussehen soll. Nenne eine Figur (Spider-Man, Creeper …), einen Stil (Feuer, Eis, Galaxie …), Farben, ein Motiv („mit Totenkopf“) – oder gib ein Bild dazu.</div>`;
  const st = plan.style, c = st.colors;
  const chips = plan.targets.map((p) => `<span class="tchip" title="${esc(p)}">${esc(pretty(p))}<button data-untarget="${esc(p)}" title="Weg damit">✕</button></span>`).join('');
  const rows = [
    `<div>🎨 <b>Stil:</b> ${esc(st.name)} ${st.keepColors ? '' : swatches([c.main, c.second, c.line, c.light])}${st.pattern ? ` · Muster: ${esc(PATTERN_DE[st.pattern.kind] || st.pattern.kind)}` : ''}${st.emblem ? ' · Emblem' : ''}${st.face ? ' · Gesicht' : ''}</div>`,
    plan.motif ? `<div>🖼️ <b>Motiv:</b> ${esc(plan.motif)}${plan.picture ? ' – als ganzes Pixelbild' : ''}</div>` : plan.picture ? '<div>🖼️ <b>Pixelbild</b> im Stil</div>' : '',
    plan.animate ? `<div>🎬 <b>Animation:</b> ${esc(ANIM_DE[plan.animate] || plan.animate)} – du bekommst ein Sprite-Sheet</div>` : '',
    plan.size || (plan.scale && plan.scale > 1) ? `<div>📐 <b>Auflösung:</b> ${plan.size ? `${plan.size}×${plan.size}` : `${plan.scale}× (z. B. 16×16 → ${16 * plan.scale}×${16 * plan.scale})`}</div>` : '',
    `<div class="tline">🎯 <b>Ziel${plan.targets.length === 1 ? '' : 'e'}:</b> ${chips || '<span class="ki-miss">keins – sag z. B. „Kupferrüstung“, „Schwert“, „XP-Kugeln“ oder öffne eine Textur</span>'}
      <input id="kiAdd" list="kiAddList" placeholder="＋ Textur dazu …" size="14"><datalist id="kiAddList"></datalist></div>`,
    plan.fixes?.length ? `<div class="ki-note">✏️ Verbessert: ${plan.fixes.map(esc).join(', ')}</div>` : '',
    ...plan.notes.map((n) => `<div class="ki-note">ℹ️ ${esc(n)}</div>`),
    plan.unknown.length ? `<div class="ki-note">❓ Nicht verstanden: ${plan.unknown.map(esc).join(', ')}</div>` : '',
  ];
  return rows.join('');
}
const PATTERN_DE = { web: 'Spinnennetz', bands: 'Streifen', dots: 'Punkte', spots: 'Flecken', checker: 'Karo', stars: 'Sterne', sparkle: 'Glitzer', flames: 'Flammen', camo: 'Tarnmuster', waves: 'Wellen', cracks: 'Risse', flowers: 'Blüten', panels: 'Panzerplatten', chevrons: 'Zacken', tiger: 'Tigerstreifen', ribs: 'Rippen', edges: 'Leuchtrand', buttons: 'Knöpfe' };

async function kiDialog() {
  const { current, profiles } = await get('/api/profiles');
  const usable = profiles.filter((p) => p.fits);
  let ideaSeed = Date.now();
  const m = openModal(`
    <h2>🤖 Textur-KI <span class="muted small">läuft ohne Internet</span></h2>
    <p>Schreib, was du willst. Die KI malt mehrere Entwürfe, bewertet sie und zeigt dir die besten drei – erst <b>💾 Speichern</b> schreibt es ins Profil.</p>
    <textarea id="kiText" rows="2" maxlength="300" placeholder="z. B. Spider-Man-Rüstung als Kupferrüstung · brennendes Diamantschwert · XP-Kugeln im Galaxie-Stil · Pixelbild von einem Drachen">${esc(S.kiText || '')}</textarea>
    <div class="ki-ideas"><span>💡 Ideen:</span><span id="kiIdeas"></span><button class="iconbtn sm" id="kiMore" title="Andere Ideen">🔄</button></div>
    <div class="ki-image">
      <label class="btn small" title="Ein Bild (z. B. von Spider-Man) – die KI stellt das Motiv frei und nimmt Farben und Motiv">📷 Bild als Vorlage<input type="file" accept="image/*" id="kiFile" hidden></label>
      <span id="kiImgInfo" class="muted">oder Bild hier hineinziehen</span>
    </div>
    <div id="kiMode" class="seg wide" hidden>
      <button data-kimode="colors">🎨 Nur Farben</button><button data-kimode="motif">🖼️ Farben + Motiv</button><button data-kimode="pixel">🧩 Ganzes Pixelbild</button>
    </div>
    <div class="ki-opts"><span class="lbl">🎬 Effekt</span><button class="chip" data-kieffect="">aus dem Text</button><button class="chip" data-kieffect="none">keiner</button><button class="chip" data-kieffect="burn">🔥 Flammen</button><button class="chip" data-kieffect="shine">✨ Lauflicht</button><button class="chip" data-kieffect="wave">〰️ Welle</button><button class="chip" data-kieffect="pulse">💡 Leuchten</button><button class="chip" data-kieffect="rainbow">🌈 Regenbogen</button><button class="chip" data-kieffect="sparkle">⭐ Funkeln</button><button class="chip" data-kieffect="flow">🌊 Fließen</button><button class="chip" data-kieffect="blink">👁️ Blinken</button><button class="chip" data-kieffect="tint">🎨 Farbwechsel</button></div>
    <div class="ki-opts"><span class="lbl">📐 Auflösung</span><button class="chip" data-kiscale="">aus dem Text</button><button class="chip" data-kiscale="1">Original</button><button class="chip" data-kiscale="2">2× (z. B. 32×32)</button><button class="chip" data-kiscale="4">4× (z. B. 64×64)</button></div>
    <div class="ki-where">🎮 Profil <select id="kiProf">${usable.map((p) => `<option value="${esc(p.id)}" ${p.id === current ? 'selected' : ''}>${esc(p.name)} · ${esc(p.launcherName)} · Minecraft ${esc(p.version)}</option>`).join('')}</select>
      <span>· Thema: <b id="kiTheme"></b></span></div>
    <div id="kiPlan" class="ki-plan"></div>
    <div class="actions"><button class="btn ghost" data-close>Abbrechen</button><button class="btn primary" id="kiGo">✨ Los geht's</button></div>`);
  const text = m.querySelector('#kiText');
  const update = () => {
    S.kiText = text.value;
    const plan = kiPlan(text.value);
    const keep = m.querySelector('#kiAdd')?.value || '';
    m.querySelector('#kiPlan').innerHTML = kiPlanHtml(plan);
    const add = m.querySelector('#kiAdd');
    if (add) add.value = keep;
    m.querySelector('#kiTheme').textContent = S.theme === 'normal' ? `neu: „${plan.style?.name || 'KI-Thema'}“` : themeName();
    m.querySelector('#kiGo').disabled = !plan.style || !plan.targets.length;
    m.querySelector('#kiMode').hidden = !kiImage;
    m.querySelectorAll('[data-kimode]').forEach((b) => b.classList.toggle('on', b.dataset.kimode === (S.kiMode || 'colors')));
    m.querySelectorAll('[data-kieffect]').forEach((b) => b.classList.toggle('on', b.dataset.kieffect === (S.kiEffect || '')));
    m.querySelectorAll('[data-kiscale]').forEach((b) => b.classList.toggle('on', b.dataset.kiscale === String(S.kiScale || '')));
  };
  const showIdeas = () => { m.querySelector('#kiIdeas').innerHTML = ideas(4, ideaSeed++).map((t) => `<button class="chip" data-idea="${esc(t)}">${esc(t)}</button>`).join(''); };
  const setImage = async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const img = await readImageFile(file);
      kiImage = { img, palette: paletteFromImage(img, 8), name: file.name.replace(/\.[a-z]+$/i, '').slice(0, 30) };
      const pv = pixelate(img, 24, 24, kiImage.palette.map((p) => p.color), { outline: true });
      const cv = document.createElement('canvas'); drawFrame(cv, pv.data, pv.w, pv.h, 36, 36);
      m.querySelector('#kiImgInfo').innerHTML = `<img class="ki-thumb" src="${img.url}" alt="" title="dein Bild"> → <img class="ki-thumb px" src="${cv.toDataURL()}" alt="" title="so sieht die KI das Motiv"> ${swatches(kiImage.palette.slice(0, 6).map((p) => kiHex(p.color)))} <button class="iconbtn sm" id="kiNoImg" title="Bild entfernen">✕</button>`;
      S.kiMode ||= 'motif';
      update();
    } catch (e) { toast('Bild ging nicht: ' + e.message, 'bad'); }
  };
  text.addEventListener('input', () => { clearTimeout(kiDialog.t); kiDialog.t = setTimeout(() => { kiEdit.removed.clear(); update(); }, 150); });
  m.querySelector('#kiFile').addEventListener('change', (e) => setImage(e.target.files[0]));
  m.addEventListener('dragover', (e) => { e.preventDefault(); m.classList.add('drop'); });
  m.addEventListener('dragleave', () => m.classList.remove('drop'));
  m.addEventListener('drop', (e) => { e.preventDefault(); m.classList.remove('drop'); setImage(e.dataTransfer.files[0]); });
  m.addEventListener('input', (e) => {
    if (e.target.id !== 'kiAdd') return;
    // Vorschlaege fuer "Textur dazu"
    const q = e.target.value.trim().toLowerCase().replace(/ /g, '_');
    m.querySelector('#kiAddList').innerHTML = q.length < 2 ? '' : S.textures.filter((p) => p.includes(q)).slice(0, 30).map((p) => `<option value="${esc(p)}">`).join('');
    if (S.textures.includes(e.target.value.trim())) { kiEdit.added.push(e.target.value.trim()); kiEdit.removed.delete(e.target.value.trim()); e.target.value = ''; update(); }
  });
  m.addEventListener('click', async (e) => {
    const idea = e.target.closest('[data-idea]');
    if (idea) { text.value = idea.dataset.idea; kiEdit.removed.clear(); kiEdit.added.length = 0; update(); return; }
    const un = e.target.closest('[data-untarget]');
    if (un) { const p = un.dataset.untarget; kiEdit.removed.add(p); kiEdit.added = kiEdit.added.filter((x) => x !== p); update(); return; }
    if (e.target.closest('#kiMore')) { showIdeas(); return; }
    if (e.target.closest('#kiNoImg')) { kiImage = null; m.querySelector('#kiImgInfo').textContent = 'oder Bild hier hineinziehen'; update(); return; }
    const mode = e.target.closest('[data-kimode]');
    if (mode) { S.kiMode = mode.dataset.kimode; update(); }
    const ef = e.target.closest('[data-kieffect]');
    if (ef) { S.kiEffect = ef.dataset.kieffect || null; update(); }
    const sc = e.target.closest('[data-kiscale]');
    if (sc) { S.kiScale = Number(sc.dataset.kiscale) || null; update(); }
  });
  m.querySelector('#kiProf').addEventListener('change', async (e) => {
    // anderes Profil: dort gelten andere Texturen (Version)
    const id = e.target.value;
    closeModal();
    await switchProfile(id, { bring: 'copy' });
    kiDialog();
  });
  m.querySelector('#kiGo').addEventListener('click', async () => {
    const plan = kiPlan(text.value);
    if (!plan.style || !plan.targets.length) return;
    closeModal();
    await kiRun(plan, 1);
  });
  showIdeas();
  update();
  text.focus();
}

/** Fortschrittsfenster: die KI zeigt, woran sie gerade arbeitet */
function kiProgress(steps) {
  const m = openModal(`<h2>🤖 Die KI arbeitet …</h2>
    <ol class="ki-steps">${steps.map((s, i) => `<li data-step="${i}"><span class="st-ic">○</span> ${esc(s)}<small></small></li>`).join('')}</ol>
    <div class="ki-bar"><i id="kiBar"></i></div>`);
  m.parentElement.replaceWith(m.parentElement.cloneNode(true)); // nicht wegklickbar
  const root = $('#modalRoot .modal');
  let cur = -1;
  return {
    async step(i, detail = '', frac = null) {
      if (i !== cur) {
        root.querySelectorAll('[data-step]').forEach((li) => {
          const k = Number(li.dataset.step);
          li.classList.toggle('done', k < i); li.classList.toggle('now', k === i);
          li.querySelector('.st-ic').textContent = k < i ? '✔' : k === i ? '◐' : '○';
        });
        cur = i;
      }
      const li = root.querySelector(`[data-step="${i}"] small`);
      if (li) li.textContent = detail ? ' – ' + detail : '';
      root.querySelector('#kiBar').style.width = Math.round(((i + (frac ?? 0.5)) / steps.length) * 100) + '%';
      await sleep(260); // die KI nimmt sich Zeit - und man kann mitlesen
    },
  };
}

/** KI: mehrere Entwuerfe malen, bewerten, die besten drei zur Auswahl zeigen */
async function kiRun(plan, seed) {
  const steps = ['Wunsch verstehen', 'Farben, Muster und Motiv planen', 'Original-Texturen laden', 'Entwürfe malen', 'Entwürfe bewerten und verfeinern', 'Vorschau bauen'];
  try {
    const p = kiProgress(steps);
    await p.step(0, `${plan.understood.slice(0, 4).join(', ') || plan.style.name}`);
    await p.step(1, `${plan.style.name}${plan.motif ? ' + Motiv ' + plan.motif : ''}${plan.animate ? ' + Animation' : ''}`);
    if (S.theme === 'normal') {
      // ohne Thema: eins nach dem Stil anlegen
      let name = plan.style.name.replace(/[^\p{L}\p{N} -]/gu, '').slice(0, 30) || 'KI-Thema', n = 1;
      while (S.themes.some((t) => t.name.toLowerCase() === name.toLowerCase())) name = `${plan.style.name.slice(0, 26)} ${++n}`;
      const r = await post('/api/theme', { name });
      S.themes = (await get('/api/info')).themes;
      S.theme = r.theme.key;
      post('/api/settings', { lastTheme: S.theme }).catch(() => {});
      renderThemeButton();
    }
    const sources = new Map();
    let k = 0;
    for (const t of plan.targets) {
      await p.step(2, `${++k}/${plan.targets.length}: ${pretty(t)}`, k / plan.targets.length);
      const px = await get(`/api/pixels?theme=normal&path=${encodeURIComponent(t)}`);
      sources.set(t, { w: px.w, h: px.h, data: b64ToBytes(px.data) });
    }
    const handle = new Set();
    try {
      const st = await get('/api/pixels?theme=normal&path=item/stick.png');
      const d = b64ToBytes(st.data);
      for (let i = 0; i < d.length; i += 4) if (d[i + 3]) handle.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
    } catch { /* ohne Stiel-Farben */ }
    const pal = kiImage ? kiImage.palette.map((q) => q.color) : null;
    const image = kiImage ? {
      mode: S.kiMode || 'colors',
      motif8: pixelate(kiImage.img, 8, 8, pal, { outline: false }),
      motif16: pixelate(kiImage.img, 16, 16, pal, { outline: true }),
      source: kiImage.img, paletteColors: paletteFromImage(kiImage.img, 12).map((q) => q.color), keepShape: true,
    } : null;
    const list = await kiDrafts(plan, sources, handle, { seed, image }, 6, (txt, frac) => p.step(3, txt, frac));
    await p.step(4, `bester Entwurf: ${Math.round(list[0].score * 100)} von 100 Punkten`);
    let skin = null;
    if (plan.targets.some((t) => /humanoid|_layer_/.test(t))) {
      for (const sp of ['entity/player/wide/steve.png', 'entity/steve.png']) {
        try { const px = await get(`/api/pixels?theme=normal&path=${encodeURIComponent(sp)}`); skin = { w: px.w, h: px.h, data: b64ToBytes(px.data) }; break; } catch { /* naechste */ }
      }
    }
    await p.step(5, 'fast fertig');
    closeModal();
    kiChoose(plan, list.slice(0, 3), skin, seed);
  } catch (e) { closeModal(); toast('Die KI ist gestolpert: ' + e.message, 'bad'); }
}

/** Die besten Entwuerfe zeigen (animierte laufen live) und den gewaehlten uebernehmen */
function kiChoose(plan, best, skin, seed) {
  const nStars = (s) => Math.max(1, Math.min(5, Math.round(2 + s * 4)));
  const stars = (s) => '★'.repeat(nStars(s)) + '☆'.repeat(5 - nStars(s));
  const m = openModal(`
    <h2>🤖 ${esc(plan.style.name)} – such dir einen Entwurf aus</h2>
    <p>${plan.targets.length} ${plan.targets.length === 1 ? 'Textur' : 'Texturen'} für <b>${esc(plan.targetName)}</b>. Die KI hat 6 Entwürfe gemalt und die besten drei behalten.</p>
    <div class="ki-choices">${best.map((d, i) => `
      <div class="ki-choice ${i === 0 ? 'top' : ''}">
        <div class="ki-choice-head"><b>Entwurf ${i + 1}</b>${i === 0 ? ' <span class="badge green">Empfehlung</span>' : ''}<span class="stars" title="${Math.round(d.score * 100)} Punkte">${stars(d.score)}</span></div>
        <div class="ki-choice-pics" data-c="${i}"></div>
        ${d.results.some((r) => r.frameH) ? `<div class="ki-sheet" data-sheet="${i}"><span class="muted small">🎞️ Sprite-Sheet (alle Bilder)</span></div>` : ''}
        <div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn ${i === 0 ? 'primary' : ''} small" data-take="${i}">${d.results.some((r) => r.frameH) ? '📥 In die Textur laden' : '✔ Diesen nehmen'}</button>${d.results.some((r) => r.frameH) ? `<button class="btn small" data-savesheet="${i}">💾 Sprite-Sheet</button>` : ''}</div>
      </div>`).join('')}</div>
    <div class="actions"><button class="btn ghost" data-close>Abbrechen</button><button class="btn" id="kiNew">🎲 6 neue Entwürfe</button></div>`);
  const anims = [];
  best.forEach((d, i) => {
    const box = m.querySelector(`[data-c="${i}"]`);
    const L1 = d.results.find((r) => /equipment\/humanoid\//.test(r.path) || /_layer_1\.png$/.test(r.path));
    const L2 = d.results.find((r) => /humanoid_leggings\//.test(r.path) || /_layer_2\.png$/.test(r.path));
    if (L1 || L2) {
      const pv = playerPreview(skin || { w: 64, h: 64, data: new Uint8ClampedArray(64 * 64 * 4) }, L1 && { w: L1.w, h: L1.h, data: L1.data }, L2 && { w: L2.w, h: L2.h, data: L2.data });
      const c = document.createElement('canvas'); c.className = 'ki-big';
      drawFrame(c, pv.data, pv.w, pv.h, 180, 160); box.append(c);
    }
    for (const r of d.results.filter((x) => !/equipment|_layer_/.test(x.path)).slice(0, L1 || L2 ? 4 : 6)) {
      const c = document.createElement('canvas'); c.title = pretty(r.path);
      const fh = r.frameH || (r.h > r.w && r.h % r.w === 0 ? r.w : r.h), n = Math.max(1, Math.floor(r.h / fh));
      const big = !(L1 || L2) && d.results.length <= 2;
      drawFrame(c, r.data.slice(0, r.w * fh * 4), r.w, fh, big ? 150 : 64, big ? 150 : 64);
      box.append(c);
      if (n > 1) anims.push({ c, r, fh, n, ft: r.anim?.frametime || 2, big });
    }
  });
  // Sprite-Sheets der animierten Entwuerfe (alle Einzelbilder im Raster)
  const sheetOf = (r) => { const fh = r.frameH, n = Math.floor(r.h / fh); return toSheet([...Array(n).keys()].map((k) => r.data.slice(k * r.w * fh * 4, (k + 1) * r.w * fh * 4)), r.w, fh); };
  best.forEach((d, i) => {
    const box = m.querySelector(`[data-sheet="${i}"]`);
    const r = d.results.find((x) => x.frameH);
    if (!box || !r) return;
    const sh = sheetOf(r), c = document.createElement('canvas');
    drawFrame(c, sh.data, sh.w, sh.h, 190, 120); box.append(c);
  });
  m.addEventListener('click', (e) => {
    const b = e.target.closest('[data-savesheet]');
    if (!b) return;
    for (const r of best[Number(b.dataset.savesheet)].results.filter((x) => x.frameH)) { const sh = sheetOf(r); savePng(sh.data, sh.w, sh.h, `${pretty(r.path)}-sprite-sheet.png`); }
  });
  // animierte Entwuerfe abspielen
  const t0 = performance.now();
  let raf = 0;
  const loop = (now) => {
    if (!m.isConnected) return;
    for (const a of anims) { const k = Math.floor((now - t0) / (50 * a.ft)) % a.n; drawFrame(a.c, a.r.data.slice(k * a.r.w * a.fh * 4, (k + 1) * a.r.w * a.fh * 4), a.r.w, a.fh, a.big ? 150 : 64, a.big ? 150 : 64); }
    raf = requestAnimationFrame(loop);
  };
  if (anims.length) raf = requestAnimationFrame(loop);
  modalCancel = () => cancelAnimationFrame(raf);
  m.querySelector('#kiNew').addEventListener('click', () => { cancelAnimationFrame(raf); modalCancel = null; closeModal(); kiRun(plan, seed + 6); });
  m.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-take]');
    if (!b) return;
    cancelAnimationFrame(raf); modalCancel = null; closeModal();
    await kiApply(plan, best[Number(b.dataset.take)].results);
  });
}

/** Ergebnis als Entwuerfe einsetzen (mit Rueckgaengig je Textur) */
async function kiApply(plan, results) {
  for (const r of results) {
    let doc = S.drafts.get(r.path);
    if (!doc) doc = await loadDoc(r.path);
    doc.undo.push({ w: doc.w, h: doc.h, data: doc.data.slice(), frameH: doc.frameH, anim: doc.anim ? structuredClone(doc.anim) : doc.anim });
    doc.redo.length = 0;
    if (r.frameH) Object.assign(doc, { frameH: r.frameH, anim: r.anim, animDirty: true }); // neue Animation
    Object.assign(doc, { w: r.w, h: r.h, data: new Uint8ClampedArray(r.data), dirty: true });
    S.drafts.set(r.path, doc);
    refreshTile(r.path);
  }
  S.cat = 'drafts';
  renderCats(); renderGrid();
  const first = results.find((r) => /humanoid\//.test(r.path) || /_layer_1/.test(r.path)) || results[0];
  if (first) await openTexture(first.path);
  if (results.some((r) => r.frameH)) { S.animOpen = true; renderAnimBar(); }
  renderDocBar();
  toast(`🤖 ${results.length} ${results.length === 1 ? 'Textur' : 'Texturen'} übernommen – noch nicht gespeichert. Gefällt's? <b>💾 Speichern</b>. Nicht? ${KEY}+Z je Textur.`, 'ok');
}

// ---------- Online-Konto ----------
async function refreshKonto() {
  try { S.konto = await get('/api/konto'); } catch { S.konto = { configured: false, user: null }; }
  $('#kontoName').textContent = S.konto.user ? S.konto.user.username : 'Anmelden';
  $('#kontoBtn').classList.toggle('in', !!S.konto.user);
  return S.konto;
}

/** Anmelden / Registrieren / Konto. Gibt true zurueck, wenn danach jemand angemeldet ist. */
const kontoUsedHere = () => { try { return !!localStorage.getItem('mct-konto-genutzt'); } catch { return false; } };
/** mode: 'anmelden' | 'registrieren' | null (= wer sich hier noch nie angemeldet hat, sieht zuerst "Neu registrieren") */
async function kontoDialog(mode = null, why = '', prefill = {}) {
  mode ||= kontoUsedHere() ? 'anmelden' : 'registrieren';
  const k = await refreshKonto();
  if (!k.configured) {
    openModal(`<h2>👤 Online-Konto</h2><p>Online-Konten sind in dieser Version noch nicht eingerichtet.</p><div class="actions"><button class="btn primary" data-close>OK</button></div>`);
    return false;
  }
  if (k.user) {
    const m = openModal(`
      <h2>👤 ${esc(k.user.username)}</h2>
      <p>Du bist angemeldet. Deine Online-Themen sind auf jedem PC da, auf dem du dich anmeldest.</p>
      <div class="konto-grid">
        <button class="btn" data-k="mine">☁️ Meine Online-Themen</button>
        <button class="btn" data-k="discover">🌍 Themen von anderen</button>
        <button class="btn" data-k="upload" ${S.theme === 'normal' ? 'disabled title="Erst ein Thema wählen"' : ''}>⬆️ „${esc(themeName())}“ hochladen</button>
        <button class="btn" data-k="pw">🔑 Passwort ändern</button>
      </div>
      <div class="actions"><button class="btn ghost" data-k="logout">Abmelden</button><button class="btn primary" data-close>Fertig</button></div>`);
    m.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-k]');
      if (!b || b.disabled) return;
      const a = b.dataset.k;
      if (a === 'logout') { await post('/api/konto/abmelden'); await refreshKonto(); closeModal(); toast('👋 Abgemeldet', 'ok'); }
      if (a === 'mine') mineDialog();
      if (a === 'discover') discoverDialog();
      if (a === 'upload') uploadDialog();
      if (a === 'pw') passwordDialog();
    });
    return true;
  }
  return new Promise((resolve) => {
    const reg = mode === 'registrieren';
    const m = openModal(`
      <h2>👤 ${reg ? 'Konto erstellen' : 'Anmelden'}</h2>
      ${why ? `<p>${why}</p>` : ''}
      <div class="seg wide"><button data-mode="anmelden" class="${reg ? '' : 'on'}">Anmelden</button><button data-mode="registrieren" class="${reg ? 'on' : ''}">Neu registrieren</button></div>
      <label class="field">Benutzername<input type="text" id="kUser" autocomplete="username" maxlength="20" placeholder="z. B. Pixel_Profi"></label>
      <label class="field">Passwort<input type="password" id="kPw" autocomplete="${reg ? 'new-password' : 'current-password'}" maxlength="72"></label>
      ${reg ? `<label class="field">Passwort nochmal<input type="password" id="kPw2" autocomplete="new-password" maxlength="72"></label>
        <p class="hint">3–20 Zeichen: Buchstaben, Zahlen und _. Passwort mindestens 6 Zeichen.<br>⚠️ Merk dir dein Passwort gut – ohne E-Mail kann es niemand zurücksetzen.</p>` : ''}
      <div class="kerr" id="kErr"></div>
      <div class="actions"><button class="btn ghost" data-close>Abbrechen</button><button class="btn primary" id="kGo">${reg ? '✨ Konto erstellen' : '➡️ Anmelden'}</button></div>`);
    modalResolve = resolve;
    m.querySelector('#kUser').value = prefill.username || '';
    m.querySelector('#kPw').value = prefill.password || '';
    (prefill.username ? m.querySelector(reg && prefill.password ? '#kPw2' : '#kPw') : m.querySelector('#kUser')).focus();
    const switchTo = (to) => {
      const keep = { username: m.querySelector('#kUser').value.trim(), password: m.querySelector('#kPw').value };
      modalResolve = null; closeModal(); kontoDialog(to, why, keep).then(resolve);
    };
    m.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => switchTo(b.dataset.mode)));
    const go = async () => {
      const username = m.querySelector('#kUser').value.trim(), password = m.querySelector('#kPw').value;
      const err = m.querySelector('#kErr');
      if (reg && password !== m.querySelector('#kPw2').value) { err.textContent = 'Die Passwörter sind nicht gleich.'; return; }
      const btn = m.querySelector('#kGo');
      btn.disabled = true; err.textContent = '';
      try {
        await post(reg ? '/api/konto/registrieren' : '/api/konto/anmelden', { username, password });
        await refreshKonto();
        modalResolve = null; closeModal();
        try { localStorage.setItem('mct-konto-genutzt', '1'); } catch { /* egal */ }
        toast(reg ? `🎉 Willkommen, ${esc(S.konto.user.username)}! Dein Konto ist fertig.` : `👋 Hallo ${esc(S.konto.user.username)}!`, 'ok');
        resolve(true);
      } catch (e) {
        btn.disabled = false;
        err.textContent = e.message;
        if (e.code === 'unknown_user' && !reg) {
          // Name gibt es noch nicht -> direkt zum Registrieren (Name und Passwort bleiben drin)
          const b = document.createElement('button');
          b.className = 'btn primary small'; b.style.marginTop = '6px';
          b.textContent = `✨ Jetzt „${username}“ registrieren`;
          b.addEventListener('click', () => switchTo('registrieren'));
          err.append(document.createElement('br'), b);
        }
      }
    };
    m.querySelector('#kGo').addEventListener('click', go);
    m.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  });
}

async function passwordDialog() {
  const m = openModal(`
    <h2>🔑 Passwort ändern</h2>
    <label class="field">Neues Passwort<input type="password" id="pw1" autocomplete="new-password" maxlength="72"></label>
    <label class="field">Nochmal<input type="password" id="pw2" autocomplete="new-password" maxlength="72"></label>
    <div class="kerr" id="pwErr"></div>
    <div class="actions"><button class="btn ghost" data-close>Abbrechen</button><button class="btn primary" id="pwGo">Ändern</button></div>`);
  m.querySelector('#pwGo').addEventListener('click', async () => {
    const a = m.querySelector('#pw1').value, b = m.querySelector('#pw2').value;
    if (a !== b) { m.querySelector('#pwErr').textContent = 'Die Passwörter sind nicht gleich.'; return; }
    try { await post('/api/konto/passwort', { password: a }); closeModal(); toast('🔑 Passwort geändert', 'ok'); }
    catch (e) { m.querySelector('#pwErr').textContent = e.message; }
  });
}

async function needLogin(why) {
  const k = await refreshKonto();
  if (!k.configured) { toast('Online-Konten sind in dieser Version noch nicht eingerichtet.', 'bad'); return false; }
  return k.user ? true : kontoDialog(null, why);
}

async function uploadDialog() {
  if (S.theme === 'normal') { toast('Erst ein eigenes Thema wählen.', 'bad'); return; }
  if (S.drafts.size && !(await handleDrafts('Vor dem Hochladen speichern?'))) return;
  if (!(await needLogin('Zum Hochladen bitte anmelden – oder schnell ein Konto erstellen.'))) return;
  const t = S.themes.find((x) => x.key === S.theme);
  const m = openModal(`
    <h2>⬆️ „${esc(themeName())}“ hochladen</h2>
    <p>${t?.count || 0} Texturen für Minecraft ${esc(S.info.version)}. Gibt es das Thema online schon, wird es ersetzt.</p>
    <label class="field">Beschreibung (optional)<textarea id="uDesc" maxlength="300" rows="3" placeholder="Was ist das Besondere?"></textarea></label>
    <label class="toggle"><span>🌍 Öffentlich<small>Andere können es finden und installieren. Aus = nur für dich (auf all deinen PCs).</small></span><span class="switch"><input type="checkbox" id="uPub" checked><span></span></span></label>
    <div class="kerr" id="uErr"></div>
    <div class="actions"><button class="btn ghost" data-close>Abbrechen</button><button class="btn primary" id="uGo">⬆️ Hochladen</button></div>`);
  m.querySelector('#uGo').addEventListener('click', async (e) => {
    const b = e.currentTarget;
    b.disabled = true; b.innerHTML = '<span class="spinner"></span> Lädt hoch …';
    try {
      const r = await post('/api/konto/hochladen', { theme: S.theme, public: m.querySelector('#uPub').checked, description: m.querySelector('#uDesc').value });
      closeModal();
      toast(`☁️ „${esc(r.row.name)}“ ist online (${r.count} Texturen, ${(r.size / 1024).toFixed(0)} KB${r.row.public ? ', öffentlich' : ', nur für dich'})`, 'ok');
    } catch (er) { m.querySelector('#uErr').textContent = er.message; b.disabled = false; b.textContent = '⬆️ Nochmal versuchen'; }
  });
}

const themeImg = (t) => `<img class="otimg" src="/api/konto/bild/${t.owner}/${t.id}.png" alt="" onerror="this.style.visibility='hidden'">`;
const dateDe = (s) => { try { return new Date(s).toLocaleDateString('de-DE'); } catch { return ''; } };

async function installOnline(t, btn) {
  const old = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'; }
  const run = (replace) => post('/api/konto/holen', { id: t.id, replace });
  try {
    if (S.drafts.size && !(await handleDrafts('Vorher speichern?'))) return;
    let r;
    try { r = await run(false); }
    catch (e) {
      if (e.code !== 'exists') throw e;
      const ok = await choose('Ersetzen?', `Das Thema „${esc(t.name)}“ gibt es in „${esc(S.info.profile.name)}“ schon. Mit der Online-Version ersetzen? (Die alte kommt in den Papierkorb-Ordner des Programms.)`, [{ v: 'yes', t: '♻️ Ersetzen', cls: 'primary' }, { v: 'no', t: 'Abbrechen', cls: 'ghost' }]);
      if (ok !== 'yes') return;
      r = await run(true);
    }
    S.info = await get('/api/info');
    S.themes = S.info.themes;
    S.globalVer++;
    closeModal();
    if (S.theme === r.theme) { await loadList(); renderThemeButton(); } else await switchTheme(r.theme);
    const diff = r.from !== r.version ? ` (gemacht für ${esc(r.from)}${r.skipped ? `, ${r.skipped} passten nicht zu ${esc(r.version)}` : ''})` : '';
    toast(`⬇️ „${esc(r.name)}“ installiert – ${r.copied} Texturen${diff}. Im Spiel: <code>/thema ${esc(r.theme)}</code>`, 'ok');
  } catch (e) { toast(e.message, 'bad'); }
  finally { if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = old; } }
}

async function mineDialog() {
  if (!(await needLogin('Bitte anmelden, um deine Online-Themen zu sehen.'))) return;
  const m = openModal(`<h2>☁️ Meine Online-Themen</h2><div class="olist" id="oList"><span class="spinner"></span></div>
    <div class="actions"><button class="btn" id="oUp" ${S.theme === 'normal' ? 'disabled' : ''}>⬆️ „${esc(themeName())}“ hochladen</button><button class="btn primary" data-close>Fertig</button></div>`);
  let list = [];
  const render = () => {
    m.querySelector('#oList').innerHTML = list.length ? list.map((t, i) => `
      <div class="ocard">${themeImg(t)}
        <div class="ometa"><b>${esc(t.name)}</b><span>Minecraft ${esc(t.mc_version)} · ${t.texture_count} Texturen · ${dateDe(t.updated_at)}</span>
          <span>${t.public ? `🌍 öffentlich · ${t.downloads}× geladen` : '🔒 nur für dich'}</span></div>
        <div class="obtns"><button class="btn small primary" data-i="${i}" data-o="get">⬇️ Holen</button>
          <button class="btn small" data-i="${i}" data-o="vis" title="${t.public ? 'Nur für mich' : 'Öffentlich machen'}">${t.public ? '🔒' : '🌍'}</button>
          <button class="btn small danger" data-i="${i}" data-o="del" title="Online löschen">🗑️</button></div>
      </div>`).join('') : '<p>Noch nichts online. Wähle ein Thema und lade es hoch – dann ist es auf jedem PC da.</p>';
  };
  try { list = await get('/api/konto/meine'); render(); } catch (e) { m.querySelector('#oList').textContent = e.message; }
  m.querySelector('#oUp').addEventListener('click', () => { closeModal(); uploadDialog(); });
  m.querySelector('#oList').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-o]');
    if (!b) return;
    const t = list[Number(b.dataset.i)];
    if (b.dataset.o === 'get') return installOnline(t, b);
    if (b.dataset.o === 'vis') { try { await post('/api/konto/sichtbar', { id: t.id, public: !t.public }); t.public = !t.public; render(); } catch (er) { toast(er.message, 'bad'); } }
    if (b.dataset.o === 'del') {
      const ok = await choose('Online löschen?', `„${esc(t.name)}“ (Minecraft ${esc(t.mc_version)}) wird online gelöscht. Was schon in deinen Profilen ist, bleibt.`, [{ v: 'yes', t: '🗑️ Löschen', cls: 'danger' }, { v: 'no', t: 'Abbrechen', cls: 'ghost' }]);
      if (ok === 'yes') { try { await post('/api/konto/loeschen', { id: t.id }); toast('🗑️ Online gelöscht', 'ok'); } catch (er) { toast(er.message, 'bad'); } }
      mineDialog();
    }
  });
}

async function discoverDialog() {
  const k = await refreshKonto();
  if (!k.configured) { toast('Online-Konten sind in dieser Version noch nicht eingerichtet.', 'bad'); return; }
  const m = openModal(`
    <h2>🌍 Themen von anderen</h2>
    <div class="row ofilter"><input type="search" id="dQ" placeholder="Suchen (Name oder Ersteller)">
      <select id="dV"><option value="${esc(S.info.version)}">Minecraft ${esc(S.info.version)}</option><option value="">Alle Versionen</option></select>
      <select id="dS"><option value="downloads">Beliebt</option><option value="neu">Neu</option></select></div>
    <div class="olist grid" id="dList"><span class="spinner"></span></div>
    <div class="actions"><button class="btn primary" data-close>Fertig</button></div>`);
  let list = [], timer = null;
  const load = async () => {
    const q = new URLSearchParams({ suche: m.querySelector('#dQ').value.trim(), version: m.querySelector('#dV').value, sort: m.querySelector('#dS').value });
    try {
      list = await get('/api/konto/entdecken?' + q);
      m.querySelector('#dList').innerHTML = list.length ? list.map((t, i) => `
        <div class="ocard">${themeImg(t)}
          <div class="ometa"><b>${esc(t.name)}</b><span>von ${esc(t.owner_name)} · Minecraft ${esc(t.mc_version)}</span>
            <span>${t.texture_count} Texturen · ${t.downloads}× geladen</span>${t.description ? `<span class="odesc">${esc(t.description)}</span>` : ''}</div>
          <div class="obtns"><button class="btn small primary" data-i="${i}">⬇️ Installieren</button></div>
        </div>`).join('') : '<p>Nichts gefunden. Lade doch dein eigenes Thema hoch! 🙂</p>';
    } catch (e) { m.querySelector('#dList').textContent = e.message; }
  };
  m.querySelector('#dQ').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 300); });
  m.querySelector('#dV').addEventListener('change', load);
  m.querySelector('#dS').addEventListener('change', load);
  m.querySelector('#dList').addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) installOnline(list[Number(b.dataset.i)], b); });
  load();
}

// ---------- Einstellungen ----------
function settingsDialog() {
  const s = S.info.settings;
  const tog = (k, t, sub, disabled = false) => `<label class="toggle"><span>${t}<small>${sub}</small></span><span class="switch"><input type="checkbox" data-set="${k}" ${s[k] ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span></span></span></label>`;
  openModal(`
    <h2>⚙️ Einstellungen</h2>
    ${tog('askProfile', '💾 Beim ersten Speichern nach dem Profil fragen', 'Einmal pro Programmstart wählst du das Profil, /thema kommt automatisch mit')}
    ${tog('showWarnings', '⚠️ Hinweise unten links', 'Zeigt Fehler, z. B. wenn eine Farbe nur noch schwach da ist')}
    ${tog('showGrid', '▦ Pixelraster', 'Linien zwischen den Pixeln beim Reinzoomen')}
    ${tog('autoRotate', '🧊 3D-Ansicht dreht sich', 'Mobs und Blöcke drehen sich von allein')}
    ${S.info.desktopAssets && s.mirrorTheme ? tog('mirrorDesktop', `🖥️ „${esc(S.themes.find((t) => t.key === s.mirrorTheme)?.name || s.mirrorTheme)}“ auch im Arbeitsordner`, `Speichert dieses Thema zusätzlich in ${esc(S.info.desktopAssets)}`) : ''}
    <div class="row">
      <button class="btn small" data-act="folder">📂 Themen-Ordner öffnen</button>
      ${S.info.canUndoBatch ? '<button class="btn small" data-act="undo">↩️ Letztes „überall ersetzen“ rückgängig</button>' : ''}
    </div>
    <div class="paths">
      <div>Minecraft <b>${esc(S.info.version)}</b> (${esc(S.info.profile.loader)}, Paketformat ${S.info.pack.format}) · Profil <b>${esc(S.info.profile.name)}</b> · /thema: <b>${S.info.profile.mod === 'da' ? 'installiert ✓' : esc(S.info.profile.mod)}</b></div>
      <div>Themen: <b>${esc(S.info.packsDir)}</b></div>
      <div>Originale aus: <b>${esc(S.info.jar)}</b></div>
    </div>
    <div class="actions"><button class="btn primary" data-close>Fertig</button></div>`);
  const m = $('#modalRoot .modal');
  m.addEventListener('change', async (e) => {
    const k = e.target.dataset.set;
    if (!k) return;
    s[k] = e.target.checked;
    await post('/api/settings', { [k]: s[k] }).catch(() => {});
    if (k === 'showGrid') { editor.setGrid(s[k]); $('#gridBtn').classList.toggle('on', s[k]); }
    if (k === 'autoRotate') viewer.setAutoRotate(s[k]);
    if (k === 'showWarnings') renderWarnings();
  });
  m.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'folder') post('/api/open-folder', { theme: S.theme });
    if (a === 'undo') { closeModal(); undoBatch(); }
  });
}

// ---------- Fenster, Meldungen ----------
function openModal(html) {
  const root = $('#modalRoot');
  root.innerHTML = `<div class="modal-bg"><div class="modal" role="dialog">${html}</div></div>`;
  const bg = root.querySelector('.modal-bg');
  bg.addEventListener('mousedown', (e) => { if (e.target === bg) closeModal(); });
  root.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeModal));
  return root.querySelector('.modal');
}
let modalResolve = null, modalCancel = null;
function closeModal() {
  const c = modalCancel; modalCancel = null;
  if (c) c();
  $('#modalRoot').innerHTML = '';
  if (modalResolve) { modalResolve(null); modalResolve = null; }
}

function choose(title, html, buttons) {
  return new Promise((resolve) => {
    const m = openModal(`<h2>${title}</h2><p>${html}</p><div class="actions">${buttons.map((b) => `<button class="btn ${b.cls || ''}" data-v="${b.v}">${b.t}</button>`).join('')}</div>`);
    modalResolve = resolve;
    m.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => { modalResolve = null; $('#modalRoot').innerHTML = ''; resolve(b.dataset.v); }));
  });
}

function toast(html, kind = '', action = null) {
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  t.innerHTML = `<span>${html}</span>`;
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.onclick = () => { t.remove(); action.run(); };
    t.appendChild(b);
  }
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), action ? 12000 : 4500);
}

function showHover(h) {
  const el = $('#hoverInfo');
  if (!h) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<span>x ${h.x} · y ${h.y}</span><span class="sw" style="background:${css(h.rgba)}"></span><span>${h.rgba[3] ? toHex(h.rgba) + ' · ' + describeAlpha(h.rgba[3]) : 'durchsichtig'}</span>`;
}

// ---------- Ereignisse ----------
function bindUi() {
  $('#cats').addEventListener('click', (e) => {
    const b = e.target.closest('.cat');
    if (!b) return;
    S.cat = b.dataset.cat;
    if (S.search) { S.search = ''; $('#search').value = ''; }
    renderCats(); renderGrid();
  });
  let st = null;
  $('#search').addEventListener('input', (e) => { clearTimeout(st); st = setTimeout(() => { S.search = e.target.value.trim(); renderGrid(); }, 150); });
  $('#grid').addEventListener('click', (e) => { const t = e.target.closest('.tile'); if (t) openTexture(t.dataset.p); });

  $('#tools').addEventListener('click', (e) => {
    const t = e.target.closest('.tool'); if (t) setTool(t.dataset.tool);
    const o = e.target.closest('[data-opt]');
    if (o) {
      const v = o.dataset.val;
      S.opt[o.dataset.opt] = v === 'true' ? true : v === 'false' ? false : isNaN(Number(v)) ? v : Number(v);
      renderToolOpts(); editor.render();
    }
    const m = e.target.closest('[data-mirror]');
    if (m) { S.opt[m.dataset.mirror] = !S.opt[m.dataset.mirror]; renderToolOpts(); editor.render(); }
    // Muster-Farben
    const nd = e.target.closest('[data-noisedel]');
    if (nd) { S.opt.noiseColors.splice(Number(nd.dataset.noisedel), 1); renderToolOpts(); }
    if (e.target.closest('[data-noiseadd]')) {
      if (!S.opt.noiseColors.some((c) => c.join() === S.color.join())) S.opt.noiseColors.push(S.color.slice());
      renderToolOpts();
    }
    const ns = e.target.closest('[data-noisesugg]');
    if (ns) {
      S.opt.noiseColors = lastSuggestions[Number(ns.dataset.noisesugg)].colors.map((c) => c.slice());
      S.opt.noiseMode = 'farben';
      renderToolOpts();
      toast('🎲 Muster-Farben übernommen', 'ok');
    }
  });
  $('#tools').addEventListener('input', (e) => {
    const k = e.target.dataset.optrange; if (k) S.opt[k] = Number(e.target.value) / 100;
    if (e.target.dataset.optsize !== undefined) { setBrushSize(Number(e.target.value), false); }
  });
  $('#imageBtn').addEventListener('click', (e) => { e.stopPropagation(); const m = $('#imageMenu'); if (m.hidden) openImageMenu(); else m.hidden = true; });
  $('#imageMenu').addEventListener('click', (e) => { const b = e.target.closest('[data-img]'); if (!b || b.disabled) return; $('#imageMenu').hidden = true; imageAction(b.dataset.img); });

  $('#colorInput').addEventListener('input', (e) => setColor([...fromHex(e.target.value), S.color[3]], false));
  $('#colorInput').addEventListener('change', () => addRecent(S.color));
  $('#hexInput').addEventListener('input', (e) => { const c = fromHex(e.target.value); if (c) setColor([...c, S.color[3]], false); });
  $('#hexInput').addEventListener('change', () => addRecent(S.color));
  $('#alphaInput').addEventListener('input', (e) => { S.color[3] = Number(e.target.value); setColor(S.color, false); });
  for (const sel of ['#quickColors', '#recentColors']) {
    $(sel).addEventListener('click', (e) => { const b = e.target.closest('.sw-btn'); if (b) { setColor(b.dataset.rgba.split(',').map(Number)); if (S.tool === 'eraser' || S.tool === 'picker') setTool('pencil'); } });
  }
  $('#palette').addEventListener('click', (e) => {
    const b = e.target.closest('.sw-btn');
    if (b) { e.stopPropagation(); openColorMenu(b.dataset.rgba.split(',').map(Number), Number(b.dataset.count), b); }
  });

  $('#saveBtn').addEventListener('click', save);
  $('#revertBtn').addEventListener('click', revert);
  $('#growBtn').addEventListener('click', grow);
  $('#undoBtn').addEventListener('click', () => { editor.undo(); renderDocBar(); });
  $('#redoBtn').addEventListener('click', () => { editor.redo(); renderDocBar(); });
  $('#zoomIn').addEventListener('click', () => editor.zoomStep(1));
  $('#zoomOut').addEventListener('click', () => editor.zoomStep(-1));
  $('#fitBtn').addEventListener('click', () => editor.fit());
  $('#gridBtn').classList.toggle('on', S.info.settings.showGrid);
  $('#gridBtn').addEventListener('click', () => {
    const on = !editor.showGrid; editor.setGrid(on); $('#gridBtn').classList.toggle('on', on);
    S.info.settings.showGrid = on; post('/api/settings', { showGrid: on }).catch(() => {});
  });
  $('#settingsBtn').addEventListener('click', settingsDialog);
  $('#animBtn').addEventListener('click', () => { S.animOpen = !S.animOpen; renderAnimBar(); });
  bindAnimBar();
  $('#kontoBtn').addEventListener('click', () => kontoDialog());
  $('#kiBtn').addEventListener('click', () => kiDialog().catch((e) => toast(e.message, 'bad')));

  $('#profileBtn').addEventListener('click', (e) => { e.stopPropagation(); const m = $('#profileMenu'); if (m.hidden) openProfileMenu().catch((er) => toast(er.message, 'bad')); else m.hidden = true; });
  $('#profileMenu').addEventListener('click', async (e) => {
    e.stopPropagation();
    const f = e.target.closest('[data-fetch]');
    if (f && !f.disabled) { if (await fetchMinecraft(f)) openProfileMenu().catch((er) => toast(er.message, 'bad')); return; }
    const b = e.target.closest('[data-profile]');
    if (!b || b.disabled) return;
    $('#profileMenu').hidden = true;
    switchProfile(b.dataset.profile);
  });
  $('#themeBtn').addEventListener('click', (e) => { e.stopPropagation(); const m = $('#themeMenu'); if (m.hidden) openThemeMenu(); else m.hidden = true; });
  $('#themeMenu').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    $('#themeMenu').hidden = true;
    if (b.dataset.theme) switchTheme(b.dataset.theme);
    if (b.dataset.act === 'new') newThemeDialog();
    if (b.dataset.act === 'vorlagen') vorlagenDialog();
    if (b.dataset.act === 'activate') activateTheme(true);
    if (b.dataset.act === 'deactivate') activateTheme(false);
    if (b.dataset.act === 'folder') post('/api/open-folder', { theme: S.theme });
    if (b.dataset.act === 'upload') uploadDialog();
    if (b.dataset.act === 'mine') mineDialog();
    if (b.dataset.act === 'discover') discoverDialog();
  });

  $('#warnings').addEventListener('click', (e) => {
    if (e.target.closest('[data-toggle]')) { S.warnCollapsed = !S.warnCollapsed; renderWarnings(); return; }
    const s = e.target.closest('[data-show]');
    if (s) editor.highlight(lastWarnings[Number(s.dataset.show)].pixels);
    const f = e.target.closest('[data-fix]');
    if (f) {
      const [i, j] = f.dataset.fix.split(':').map(Number);
      editor.pushUndo();
      lastWarnings[i].fixes[j].run(S.doc, editor);
      editor.changed();
      toast('🛠️ Erledigt', 'ok');
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#colorMenu')) $('#colorMenu').hidden = true;
    if (!e.target.closest('.theme-picker')) $('#themeMenu').hidden = true;
    if (!e.target.closest('.image-picker')) $('#imageMenu').hidden = true;
    if (!e.target.closest('.profile-picker')) $('#profileMenu').hidden = true;
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      $('#colorMenu').hidden = true; $('#themeMenu').hidden = true; $('#imageMenu').hidden = true; $('#profileMenu').hidden = true;
      if ($('#modalRoot').innerHTML) closeModal(); else editor.deselect();
      return;
    }
    if (isTyping(e) || $('#modalRoot').innerHTML) return;
    const k = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey; // Strg (Windows) bzw. Cmd (Mac)
    if (mod && k === 's') { e.preventDefault(); save(); return; }
    const editable = S.doc && S.theme !== 'normal';
    if (editable && (e.key === 'Delete' || e.key === 'Backspace')) { if (editor.deleteSelection()) e.preventDefault(); return; }
    if (editable && e.key === 'Enter') { editor.commitSelection(); return; }
    if (S.doc && mod && k === 'a') { e.preventDefault(); setTool('select'); editor.selectAll(); return; }
    if (S.doc && mod && k === 'c') { if (editor.copySelection()) toast('📋 Kopiert', 'ok'); return; }
    if (editable && mod && k === 'x') { if (editor.copySelection()) { editor.deleteSelection(); toast('✂️ Ausgeschnitten', 'ok'); } return; }
    if (editable && mod && k === 'v') { e.preventDefault(); setTool('select'); if (!editor.paste()) toast(`Erst etwas kopieren (${KEY}+C)`, 'bad'); return; }
    if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); editor.undo(); renderDocBar(); return; }
    if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); editor.redo(); renderDocBar(); return; }
    if (mod || e.altKey) return;
    const tool = TOOLS.find((t) => t.key === k);
    if (tool) { setTool(tool.id); return; }
    if (k === '[' || k === ']') { setBrushSize(S.opt.size + (k === ']' ? 1 : -1)); return; } // Pinselgroesse
    if (k === '+' || k === '=') editor.zoomStep(1);
    if (k === '-') editor.zoomStep(-1);
    if (k === '0') editor.fit();
    if (k === '#') $('#gridBtn').click();
  });

  window.addEventListener('beforeunload', (e) => { if (S.drafts.size) { e.preventDefault(); e.returnValue = ''; } });
}
