// Themen-Pakete, Original-Texturen aus dem Jar, Speichern, Massen-Ersetzen.
import fs from 'node:fs';
import path from 'node:path';
import { ZipReader } from './zip.mjs';
import { decodePng, encodePng } from './png.mjs';
import { VARIANT, MANIFEST, parseVariant, versionLevel, buildFiles, enchantTable } from './verzaubert.mjs';

const TEX = 'assets/minecraft/textures/';
// Neue Themen heissen "Thema-<Name>"; die ersten hiessen "Border-<Name>" und gehen weiter.
const PREFIXES = ['Thema-', 'Border-'];
const prefixOf = (folder) => PREFIXES.find((p) => folder.startsWith(p) && folder.length > p.length) || null;
const VANILLA_DATE = new Date('1980-02-01T00:00:00'); // Datum der Original-Dateien im Desktop-Ordner
/** Zusatz-Texturen, die es in Minecraft nicht gibt, die aber die /thema-Mod nutzt (z. B. breite Hutkrempe) */
export const EXTRA = /^entity\/equipment\/krempe\/[a-z0-9_]+\.png$/;
const JARS = new Map();

/** Wie in der Mod: "Lila Nacht" -> "lilanacht", "Grün" -> "gruen" */
export function themeKey(text) {
  return String(text).toLowerCase().trim()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');
}

/** Animationsangaben pruefen: nur bekannte Felder, sinnvolle Zahlen, Bildhoehe passt zum Bild. */
function cleanAnimation(a, img) {
  const out = {};
  const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);
  const ft = int(a?.frametime, 1, 2000);
  if (ft && ft !== 1) out.frametime = ft;
  if (a?.interpolate === true) out.interpolate = true;
  const h = int(a?.height, 1, img.height);
  if (h && img.height % h !== 0) throw new Error(`Die Bildhöhe ${h} passt nicht zur Texturhöhe ${img.height}.`);
  const fh = h || Math.min(img.width, img.height);
  if (h && h !== img.width) out.height = h;
  if (int(a?.width, 1, img.width) && a.width !== img.width) out.width = a.width;
  if (Array.isArray(a?.frames)) {
    const n = Math.floor(img.height / fh);
    const frames = a.frames.slice(0, 512).map((f) => (typeof f === 'number' ? int(f, 0, n - 1) : f && int(f.index, 0, n - 1) !== null ? (int(f.time, 1, 2000) ? { index: f.index, time: f.time } : f.index) : null)).filter((f) => f !== null);
    if (frames.length) out.frames = frames;
  }
  return out;
}

/** Anzeigename: thema.json -> Beschreibung "Thema: X" -> Ordnername */
function themeDisplayName(dir, fallback) {
  try { const j = JSON.parse(fs.readFileSync(path.join(dir, 'thema.json'), 'utf8')); if (j?.name) return String(j.name); } catch { /* optional */ }
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(dir, 'pack.mcmeta'), 'utf8'));
    const m = (typeof meta?.pack?.description === 'string' ? meta.pack.description : '').match(/^Thema:\s*(.+)$/);
    if (m) return m[1].trim();
  } catch { /* Beschreibung ist optional */ }
  return fallback;
}

/** Ordnername aus dem Themennamen: Umlaute ausschreiben, nur sichere Zeichen. */
function folderName(name) {
  const s = String(name).trim().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss')
    .replace(/[^A-Za-z0-9 _-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function safeRel(rel) {
  const r = String(rel || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!r.endsWith('.png') || r.split('/').some((s) => s === '..' || s === '' || s === '.')) throw new Error('Ungueltiger Pfad: ' + rel);
  return r;
}

export class Store {
  constructor({ instanceDir, jarPath, version, desktopAssets, dataDir }) {
    this.instanceDir = instanceDir;
    this.packsDir = path.join(instanceDir, 'resourcepacks');
    this.jarPath = jarPath;
    this.desktopAssets = desktopAssets;
    this.dataDir = dataDir;
    if (!JARS.has(jarPath)) JARS.set(jarPath, new ZipReader(jarPath)); // beim Profilwechsel wiederverwenden
    this.jar = JARS.get(jarPath);
    this.vanillaList = this.jar.names()
      .filter((n) => n.startsWith(TEX) && n.endsWith('.png'))
      .map((n) => n.slice(TEX.length))
      .sort();
    this.vanillaSet = new Set(this.vanillaList);
    this.version = version || path.basename(path.dirname(jarPath));
    this.pack = packFormatOf(this.jar, this.version);
    this.decodeCache = new Map(); // nur Originale
    this.lastBatch = this.#loadUndo();
  }

  // ---------- Themen ----------
  themes() {
    const out = [];
    if (!fs.existsSync(this.packsDir)) return out;
    const entries = fs.readdirSync(this.packsDir, { withFileTypes: true }).sort((a, b) => a.name.startsWith('Border-') - b.name.startsWith('Border-'));
    for (const d of entries) {
      const prefix = d.isDirectory() ? prefixOf(d.name) : null;
      if (!prefix) continue;
      const dir = path.join(this.packsDir, d.name);
      if (!fs.existsSync(path.join(dir, 'pack.mcmeta'))) continue;
      const key = themeKey(d.name.slice(prefix.length));
      if (!key || key === 'normal' || out.some((t) => t.key === key)) continue; // "Thema-X" vor "Border-X"
      out.push({ key, folder: d.name, name: themeDisplayName(dir, d.name.slice(prefix.length)), dir, count: this.overrides(dir).length });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }

  theme(key) {
    if (!key || key === 'normal') return null;
    const t = this.themes().find((x) => x.key === key);
    if (!t) throw new Error('Thema nicht gefunden: ' + key);
    return t;
  }

  createTheme(name, copyFrom) {
    const key = themeKey(name);
    if (!key || key === 'normal') throw new Error('Bitte einen anderen Namen wählen.');
    if (this.themes().some((t) => t.key === key)) throw new Error('Das Thema gibt es schon.');
    const folder = 'Thema-' + folderName(name);
    const dir = path.join(this.packsDir, folder);
    if (fs.existsSync(dir)) throw new Error('Den Ordner gibt es schon: ' + folder);
    fs.mkdirSync(path.join(dir, TEX), { recursive: true });
    this.writePackMeta(dir, 'Thema: ' + String(name).trim());
    const src = copyFrom && copyFrom !== 'normal' ? this.theme(copyFrom) : null;
    if (src) {
      fs.cpSync(path.join(src.dir, 'assets'), path.join(dir, 'assets'), { recursive: true });
      for (const f of ['pack.png', MANIFEST]) if (fs.existsSync(path.join(src.dir, f))) fs.copyFileSync(path.join(src.dir, f), path.join(dir, f));
    } else {
      fs.writeFileSync(path.join(dir, 'pack.png'), packIcon(name));
    }
    return this.theme(key);
  }

  /** pack.mcmeta im Format dieser Minecraft-Version (alt: pack_format, ab 1.21.9: min/max_format). */
  writePackMeta(dir, description) {
    const f = this.pack;
    const pack = f.modern
      ? { description, min_format: f.format, max_format: f.format }
      : { pack_format: f.format, description };
    fs.writeFileSync(path.join(dir, 'pack.mcmeta'), JSON.stringify({ pack }, null, 2) + '\n', 'utf8');
  }

  /**
   * Thema-Paket aus einem anderen Profil hierher kopieren (wenn es hier noch fehlt).
   * Bei anderer Minecraft-Version: nur Texturen, die es hier gibt und die gleich aufgebaut sind;
   * pack.mcmeta bekommt das Format dieser Version.
   */
  importTheme(srcDir, srcStore, displayName) {
    const name = path.basename(srcDir);
    const rest = name.slice((prefixOf(name) || '').length);
    const key = themeKey(rest);
    const dst = path.join(this.packsDir, name);
    if (fs.existsSync(dst)) return { key, copied: 0, skipped: 0 };
    const description = 'Thema: ' + (displayName || rest);
    fs.mkdirSync(path.join(dst, TEX), { recursive: true });
    this.writePackMeta(dst, description);
    if (fs.existsSync(path.join(srcDir, 'pack.png'))) fs.copyFileSync(path.join(srcDir, 'pack.png'), path.join(dst, 'pack.png'));
    let copied = 0, skipped = 0;
    for (const rel of this.overrides(srcDir)) {
      const from = path.join(srcDir, TEX, rel);
      if (!this.fitsHere(rel, from, srcStore)) { skipped++; continue; }
      const to = path.join(dst, TEX, rel);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
      if (fs.existsSync(from + '.mcmeta')) fs.copyFileSync(from + '.mcmeta', to + '.mcmeta');
      copied++;
    }
    this.syncEnchanted({ dir: dst });
    return { key, copied, skipped };
  }

  /** Passt eine Textur aus einer anderen Version hierher? (gleicher Pfad, gleiches Seitenverhaeltnis wie hier im Original) */
  fitsHere(rel, file, srcStore) {
    if (EXTRA.test(rel)) return true; // Zusatzbilder der /thema-Mod passen ueberall
    if (VARIANT.test(rel)) return this.variantOk(rel); // verzauberte Items: wenn es das Item hier gibt
    if (!this.vanillaSet.has(rel)) return false;
    if (srcStore && srcStore.version === this.version) return true;
    try {
      const here = this.vanillaImage(rel);
      const there = srcStore?.vanillaSet.has(rel) ? srcStore.vanillaImage(rel) : decodePng(fs.readFileSync(file));
      return here && there && here.width * there.height === here.height * there.width;
    } catch { return false; }
  }

  // ---------- Online: Thema als Zip ----------
  /** Thema als Zip zum Hochladen: pack.mcmeta, pack.png, thema.json und alle geaenderten Texturen. */
  exportTheme(key) {
    const t = this.theme(key);
    if (!t) throw new Error('Bitte ein Thema wählen.');
    const rels = this.overrides(t.dir);
    if (!rels.length) throw new Error('Das Thema ist noch leer – erst etwas malen und speichern.');
    const entries = [];
    const add = (name, file) => { if (fs.existsSync(file)) entries.push({ name, data: fs.readFileSync(file) }); };
    add('pack.mcmeta', path.join(t.dir, 'pack.mcmeta'));
    add('pack.png', path.join(t.dir, 'pack.png'));
    entries.push({ name: 'thema.json', data: Buffer.from(JSON.stringify({ name: t.name, mc_version: this.version, pack_format: this.pack.format }, null, 2)) });
    for (const rel of rels) {
      add(TEX + rel, path.join(t.dir, TEX, rel));
      add(TEX + rel + '.mcmeta', path.join(t.dir, TEX, rel + '.mcmeta'));
    }
    const png = fs.existsSync(path.join(t.dir, 'pack.png')) ? fs.readFileSync(path.join(t.dir, 'pack.png')) : null;
    return { name: t.name, count: rels.length, entries, png };
  }

  /**
   * Heruntergeladenes Thema (Zip-Datei) hier als "Thema-<Name>" anlegen. Nur Texturen, die es in dieser
   * Minecraft-Version gibt und die passen. replace: vorhandenes gleichnamiges Thema ersetzen (Kopie in trashDir).
   */
  installTheme(zipFile, { name, mcVersion }, { replace = false, trashDir } = {}) {
    const folder = 'Thema-' + folderName(name);
    const dst = path.join(this.packsDir, folder);
    const existing = this.themes().find((t) => t.key === themeKey(name));
    if ((existing || fs.existsSync(dst)) && !replace) { const e = new Error(`Das Thema „${name}“ gibt es hier schon.`); e.code = 'exists'; throw e; }
    fs.mkdirSync(this.dataDir, { recursive: true });
    const tmp = fs.mkdtempSync(path.join(this.dataDir, 'entpacken-'));
    const src = path.join(tmp, folder);
    const z = new ZipReader(zipFile);
    try {
      const names = z.names();
      if (names.length > 20000) throw new Error('Zu viele Dateien im Thema.');
      let total = 0;
      for (const n of names) {
        // nur Texturen (+ Animationsangaben) und das Paketbild - nichts anderes wird ausgepackt
        const isTex = n.startsWith(TEX) && /\.png(\.mcmeta)?$/.test(n);
        if (!isTex && n !== 'pack.png') continue;
        if (isTex) { try { safeRel(n.slice(TEX.length).replace(/\.mcmeta$/, '')); } catch { continue; } }
        const data = z.readLimited(n, 16 * 1024 * 1024);
        total += data.length;
        if (total > 300 * 1024 * 1024) throw new Error('Das Thema ist ausgepackt zu groß.');
        const out = path.join(src, ...n.split('/'));
        if (!out.startsWith(src + path.sep)) continue;
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, data);
      }
    } finally { z.close(); }
    fs.mkdirSync(src, { recursive: true });
    if (existing || fs.existsSync(dst)) {
      // altes Thema nicht loeschen, sondern beiseitelegen
      const old = existing ? existing.dir : dst;
      const bin = path.join(trashDir || path.join(tmp, 'alt'), `${Date.now()}-${path.basename(old)}`);
      fs.mkdirSync(path.dirname(bin), { recursive: true });
      fs.cpSync(old, bin, { recursive: true });
      fs.rmSync(old, { recursive: true, force: true });
    }
    const r = this.importTheme(src, { version: mcVersion, vanillaSet: new Set() }, name);
    fs.writeFileSync(path.join(dst, 'thema.json'), JSON.stringify({ name }, null, 2) + '\n');
    if (!fs.existsSync(path.join(dst, 'pack.png'))) fs.writeFileSync(path.join(dst, 'pack.png'), packIcon(name));
    fs.rmSync(tmp, { recursive: true, force: true });
    return { ...r, key: themeKey(name), folder };
  }

  // ---------- Texturen ----------
  overrides(dir) {
    const root = path.join(dir, TEX);
    const out = [];
    const walk = (d, rel) => {
      if (!fs.existsSync(d)) return;
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const r = rel ? rel + '/' + e.name : e.name;
        if (e.isDirectory()) walk(path.join(d, e.name), r);
        else if (e.name.endsWith('.png')) out.push(r);
      }
    };
    walk(root, '');
    return out.sort();
  }

  list(themeKeyName) {
    const t = this.theme(themeKeyName);
    const changed = t ? this.overrides(t.dir) : [];
    const all = new Set(this.vanillaList);
    for (const c of changed) all.add(c);
    return { textures: [...all].sort(), changed, animated: this.#animatedList() };
  }

  #animatedList() {
    if (!this._animated) {
      this._animated = this.jar.names()
        .filter((n) => n.startsWith(TEX) && n.endsWith('.png.mcmeta'))
        .filter((n) => { try { return !!JSON.parse(this.jar.read(n).toString('utf8')).animation; } catch { return false; } })
        .map((n) => n.slice(TEX.length, -'.mcmeta'.length));
    }
    return this._animated;
  }

  packFile(t, rel) { return path.join(t.dir, TEX, rel); }

  vanillaBytes(rel) { return this.jar.read(TEX + safeRel(rel)); }

  vanillaMcmeta(rel) {
    const b = this.jar.read(TEX + safeRel(rel) + '.mcmeta');
    if (!b) return null;
    try { return JSON.parse(b.toString('utf8')); } catch { return null; }
  }

  /** Bytes der Textur so, wie das Thema sie zeigt (Paket oder Original). */
  effectiveBytes(themeKeyName, rel) {
    rel = safeRel(rel);
    const t = this.theme(themeKeyName);
    if (t) {
      const f = this.packFile(t, rel);
      if (fs.existsSync(f)) return { bytes: fs.readFileSync(f), source: 'thema' };
    }
    const v = this.vanillaBytes(rel);
    return v ? { bytes: v, source: 'original' } : null;
  }

  vanillaImage(rel) {
    if (!this.decodeCache.has(rel)) {
      const b = this.vanillaBytes(rel);
      this.decodeCache.set(rel, b ? decodePng(b) : null);
    }
    return this.decodeCache.get(rel);
  }

  effectiveImage(themeKeyName, rel) {
    const t = this.theme(themeKeyName);
    if (t) {
      const f = this.packFile(t, rel);
      if (fs.existsSync(f)) return decodePng(fs.readFileSync(f));
    }
    return this.vanillaImage(rel);
  }

  pixels(themeKeyName, rel) {
    rel = safeRel(rel);
    let eff = this.effectiveBytes(themeKeyName, rel);
    // Verzaubertes Item, das es noch nicht gibt: mit dem normalen Item-Bild anfangen
    const variant = parseVariant(rel);
    const baseRel = variant ? `item/${variant.item}.png` : rel;
    if (!eff && variant && this.variantOk(rel)) eff = { ...this.effectiveBytes(themeKeyName, baseRel), source: 'basis' };
    if (!eff?.bytes) throw new Error('Textur nicht gefunden: ' + rel);
    const img = decodePng(eff.bytes);
    const t = this.theme(themeKeyName);
    let mcmeta = null;
    if (t && fs.existsSync(this.packFile(t, rel) + '.mcmeta')) {
      try { mcmeta = JSON.parse(fs.readFileSync(this.packFile(t, rel) + '.mcmeta', 'utf8')); } catch { mcmeta = null; }
    }
    if (variant) rel = baseRel; // Original zum Vergleichen = normales Item
    const van = this.vanillaImage(rel);
    return {
      w: img.width, h: img.height, data: Buffer.from(img.data).toString('base64'), source: eff.source,
      mcmeta: mcmeta ?? this.vanillaMcmeta(rel),
      vanilla: van ? { w: van.width, h: van.height, data: Buffer.from(van.data).toString('base64'), mcmeta: this.vanillaMcmeta(rel) } : null,
    };
  }

  /** Speichert eine Textur ins Thema (und auf Wunsch zusaetzlich in einen Arbeitsordner, siehe #mirror). */
  /**
   * anim: undefined = Animation wie bisher (aus Thema/Original mitnehmen),
   *       null = Animation entfernen, { frametime, interpolate, height?, frames? } = neue Animation.
   */
  save(themeKeyName, rel, img, anim) {
    rel = safeRel(rel);
    const t = this.theme(themeKeyName);
    if (!t) throw new Error('Im Thema "Normal" kann nichts gespeichert werden. Bitte ein Thema wählen.');
    const file = this.packFile(t, rel);
    const variant = VARIANT.test(rel);
    if (variant && !this.variantOk(rel)) throw new Error(`Verzauberte Item-Bilder gehen erst ab Minecraft 1.21.4 (hier: ${this.version}).`);
    if (!variant && !this.vanillaSet.has(rel) && !EXTRA.test(rel) && !fs.existsSync(file)) throw new Error(`Diese Textur gibt es in Minecraft ${this.version} nicht.`);
    // Animations-/GUI-Einstellungen mitnehmen, sonst gehen Animation und Nine-Slice verloren.
    let meta = null, oldW = null;
    if (fs.existsSync(file + '.mcmeta')) {
      try { meta = JSON.parse(fs.readFileSync(file + '.mcmeta', 'utf8')); } catch { meta = null; }
    }
    const prev = this.effectiveBytes(themeKeyName, rel);
    if (prev) { try { oldW = decodePng(prev.bytes).width; } catch { oldW = null; } }
    if (!meta) meta = this.vanillaMcmeta(rel);
    if (anim !== undefined) {
      // Animation aus dem Animations-Werkzeug: nur den "animation"-Teil ersetzen, Rest (z. B. GUI-Raster) bleibt
      meta = meta ? { ...meta } : {};
      if (anim === null) delete meta.animation;
      else meta.animation = cleanAnimation(anim, img);
      if (!Object.keys(meta).length) meta = null;
    } else if (meta && oldW && img.width !== oldW && meta.animation) {
      const f = img.width / oldW;
      for (const k of ['width', 'height']) if (typeof meta.animation[k] === 'number') meta.animation[k] = Math.round(meta.animation[k] * f);
    }
    const png = encodePng(img);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, png);
    const metaText = meta ? JSON.stringify(meta, null, 2) + '\n' : null;
    if (metaText) fs.writeFileSync(file + '.mcmeta', metaText, 'utf8');
    else if (fs.existsSync(file + '.mcmeta')) fs.rmSync(file + '.mcmeta'); // Animation entfernt
    this.#mirror(t, rel, png, metaText);
    if (variant) this.syncEnchanted(t);
    return { bytes: png.length };
  }

  revert(themeKeyName, rel) {
    rel = safeRel(rel);
    const t = this.theme(themeKeyName);
    if (!t) return;
    const file = this.packFile(t, rel);
    for (const f of [file, file + '.mcmeta']) if (fs.existsSync(f)) fs.rmSync(f);
    // leere Ordner aufraeumen
    let d = path.dirname(file);
    const stop = path.join(t.dir, 'assets');
    while (d.startsWith(stop) && d !== stop && fs.existsSync(d) && fs.readdirSync(d).length === 0) { fs.rmdirSync(d); d = path.dirname(d); }
    if (VARIANT.test(rel)) { this.syncEnchanted(t); return; } // gibt es im Original nicht
    const vb = this.vanillaBytes(rel);
    const vm = this.jar.read(TEX + rel + '.mcmeta');
    this.#mirror(t, rel, vb, vm ? vm.toString('utf8') : null, true);
  }

  // ---------- Verzauberte Items ----------
  /** Geht diese Verzauberungs-Variante in dieser Version? (Version neu genug, Item gibt es, Verzauberung passt) */
  variantOk(rel) {
    const v = parseVariant(rel);
    const level = versionLevel(this.version);
    if (!v || !level || !this.vanillaSet.has(`item/${v.item}.png`)) return false;
    if (level === 'alle') return v.enchants.length === 1 && v.enchants[0] === 'alle';
    const ok = this.enchantInfo().items[v.item];
    return !!ok && v.enchants.every((e) => ok.includes(e)) && (v.enchants.length === 1 || !v.enchants.includes('alle'));
  }

  /** Verzauberungen dieser Version und welche Items sie bekommen koennen (aus dem Jar). */
  enchantInfo() {
    if (!this._enchants) {
      const readJson = (n) => { const b = this.jar.read(n); if (!b) return null; try { return JSON.parse(b.toString('utf8')); } catch { return null; } };
      this._enchants = { ...enchantTable(this.jar.names(), readJson), level: versionLevel(this.version) };
    }
    return this._enchants;
  }

  /** Varianten eines Themas: [{ item, enchants, rel }] */
  variants(themeKeyName) {
    const t = this.theme(themeKeyName);
    return t ? this.overrides(t.dir).map(parseVariant).filter(Boolean) : [];
  }

  /**
   * Item-Definitionen + Modelle fuer alle verzauberten Bilder im Thema neu schreiben. Eigene JSON-Dateien des
   * Themas (nicht von uns) bleiben die Grundlage; was wir geschrieben haben, steht in mct-verzaubert.json.
   */
  syncEnchanted(t) {
    const manFile = path.join(t.dir, MANIFEST);
    let old = [], own = {};
    try { const m = JSON.parse(fs.readFileSync(manFile, 'utf8')); old = m.dateien || []; own = m.eigene || {}; } catch { old = []; }
    const ours = new Set(old);
    const readJson = (p) => {
      if (own[p]) return own[p]; // eigene Datei des Themas, die wir ueberschrieben haben
      const f = path.join(t.dir, ...p.split('/'));
      if (!ours.has(p) && fs.existsSync(f)) {
        try { own[p] = JSON.parse(fs.readFileSync(f, 'utf8')); return own[p]; } catch { return null; }
      }
      const b = this.jar.read(p);
      if (!b) return null;
      try { return JSON.parse(b.toString('utf8')); } catch { return null; }
    };
    const level = versionLevel(this.version);
    const variants = level ? this.overrides(t.dir).filter((r) => VARIANT.test(r) && this.variantOk(r)).map(parseVariant) : [];
    const files = buildFiles(variants, readJson, level);
    for (const [p, obj] of files) {
      const f = path.join(t.dir, ...p.split('/'));
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, JSON.stringify(obj, null, 2) + '\n', 'utf8');
    }
    for (const p of old) {
      if (files.has(p) || !/^assets\/minecraft\/(items|models\/item\/verzaubert)\//.test(p)) continue;
      const f = path.join(t.dir, ...p.split('/'));
      if (own[p]) { fs.writeFileSync(f, JSON.stringify(own[p], null, 2) + '\n', 'utf8'); delete own[p]; continue; } // eigene Datei zurueck
      if (fs.existsSync(f)) fs.rmSync(f);
      let d = path.dirname(f);
      const stop = path.join(t.dir, 'assets');
      while (d.startsWith(stop) && d !== stop && fs.existsSync(d) && fs.readdirSync(d).length === 0) { fs.rmdirSync(d); d = path.dirname(d); }
    }
    for (const p of Object.keys(own)) if (!files.has(p)) delete own[p];
    if (files.size) fs.writeFileSync(manFile, JSON.stringify({ hinweis: 'Von Minecraft Texturen erzeugt (verzauberte Items)', dateien: [...files.keys()].sort(), eigene: own }, null, 2) + '\n', 'utf8');
    else if (fs.existsSync(manFile)) fs.rmSync(manFile);
    return { files: files.size, variants: variants.length };
  }

  #mirror(t, rel, png, metaText, vanilla = false) {
    const s = this.settings?.();
    // Optional: ein Arbeitsordner (z. B. Desktop\assets) bekommt jede Aenderung eines bestimmten Themas mit
    if (!s?.mirrorDesktop || !s.mirrorTheme || t.key !== s.mirrorTheme || (s.mirrorProfile && path.basename(this.instanceDir) !== s.mirrorProfile) || !this.desktopAssets || !fs.existsSync(this.desktopAssets)) return;
    const f = path.join(this.desktopAssets, 'minecraft', 'textures', rel);
    try {
      if (!png) return;
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, png);
      if (metaText) fs.writeFileSync(f + '.mcmeta', metaText, 'utf8');
      else if (vanilla && fs.existsSync(f + '.mcmeta')) fs.rmSync(f + '.mcmeta');
      if (vanilla) { fs.utimesSync(f, VANILLA_DATE, VANILLA_DATE); if (metaText) fs.utimesSync(f + '.mcmeta', VANILLA_DATE, VANILLA_DATE); }
    } catch (e) { console.warn('Desktop-Spiegel fehlgeschlagen:', e.message); }
  }

  // ---------- Farben in allen Texturen ----------
  #scope(themeKeyName, scope) {
    const { textures } = this.list(themeKeyName);
    const pre = scope ? String(scope).replace(/\\/g, '/') : '';
    return textures.filter((r) => !pre || r.startsWith(pre));
  }

  /** Schnelle Variante fuer Schleifen: Thema und geaenderte Dateien nur einmal ermitteln. */
  #imageGetter(themeKeyName) {
    const t = this.theme(themeKeyName);
    const changed = new Set(t ? this.overrides(t.dir) : []);
    return (rel) => (t && changed.has(rel) ? decodePng(fs.readFileSync(this.packFile(t, rel))) : this.vanillaImage(rel));
  }

  findColor(themeKeyName, from, tol = 0, scope = '') {
    const hits = [];
    let pixels = 0;
    const get = this.#imageGetter(themeKeyName);
    for (const rel of this.#scope(themeKeyName, scope)) {
      let img;
      try { img = get(rel); } catch { continue; }
      if (!img) continue;
      const n = countMatches(img.data, from, tol);
      if (n) { hits.push(rel); pixels += n; }
    }
    return { count: hits.length, pixels, paths: hits.slice(0, 400) };
  }

  replaceColor(themeKeyName, from, to, tol = 0, scope = '', onlyPaths = null) {
    const t = this.theme(themeKeyName);
    if (!t) throw new Error('Bitte zuerst ein Thema wählen.');
    const undo = [];
    const changed = [];
    const list = onlyPaths ? onlyPaths.map(safeRel) : this.#scope(themeKeyName, scope);
    const get = this.#imageGetter(themeKeyName);
    for (const rel of list) {
      let img;
      try { img = get(rel); } catch { continue; }
      if (!img) continue;
      const data = new Uint8Array(img.data);
      if (!replaceIn(data, from, to, tol)) continue;
      const file = this.packFile(t, rel);
      undo.push({
        rel,
        png: fs.existsSync(file) ? fs.readFileSync(file).toString('base64') : null,
        meta: fs.existsSync(file + '.mcmeta') ? fs.readFileSync(file + '.mcmeta', 'utf8') : null,
      });
      this.save(themeKeyName, rel, { width: img.width, height: img.height, data });
      changed.push(rel);
    }
    this.lastBatch = { theme: themeKeyName, instanceDir: this.instanceDir, time: Date.now(), from, to, undo };
    this.#saveUndo();
    return { changed: changed.length, paths: changed };
  }

  undoBatch() {
    const b = this.lastBatch;
    if (!b || !b.undo?.length) throw new Error('Es gibt nichts rückgängig zu machen.');
    if (b.instanceDir && path.resolve(b.instanceDir) !== path.resolve(this.instanceDir)) {
      throw new Error(`Das letzte „überall ersetzen“ war im Profil „${path.basename(b.instanceDir)}“ – bitte erst dorthin wechseln.`);
    }
    const t = this.theme(b.theme);
    for (const u of b.undo) {
      const file = this.packFile(t, u.rel);
      if (u.png === null) { this.revert(b.theme, u.rel); continue; }
      const png = Buffer.from(u.png, 'base64');
      fs.writeFileSync(file, png);
      if (u.meta) fs.writeFileSync(file + '.mcmeta', u.meta, 'utf8');
      else if (fs.existsSync(file + '.mcmeta')) fs.rmSync(file + '.mcmeta');
      this.#mirror(t, u.rel, png, u.meta);
    }
    const n = b.undo.length;
    this.lastBatch = null;
    this.#saveUndo();
    return { restored: n };
  }

  #undoFile() { return path.join(this.dataDir, 'letzte-ersetzung.json'); }
  #loadUndo() { try { return JSON.parse(fs.readFileSync(this.#undoFile(), 'utf8')); } catch { return null; } }
  #saveUndo() {
    try {
      fs.mkdirSync(this.dataDir, { recursive: true });
      if (this.lastBatch) fs.writeFileSync(this.#undoFile(), JSON.stringify(this.lastBatch));
      else if (fs.existsSync(this.#undoFile())) fs.rmSync(this.#undoFile());
    } catch (e) { console.warn(e.message); }
  }
}

/** Gibt es die Textur in diesem Minecraft-Jar, und wie gross ist sie? (fuer das Speichern-Fenster) */
const SIZE_CACHE = new Map();
export function textureInJar(jarPath, rel) {
  const k = jarPath + '|' + rel;
  if (SIZE_CACHE.has(k)) return SIZE_CACHE.get(k);
  let r = { exists: false };
  try {
    if (!JARS.has(jarPath)) JARS.set(jarPath, new ZipReader(jarPath));
    const b = JARS.get(jarPath).read(TEX + rel);
    if (b) { const img = decodePng(b); r = { exists: true, w: img.width, h: img.height }; }
  } catch { /* nicht lesbar */ }
  SIZE_CACHE.set(k, r);
  return r;
}

/**
 * Ressourcen-Paketformat aus version.json im Jar. Vor 1.14 gibt es die Datei nicht -> Tabelle.
 * modern = ab 1.21.9 (resource_major): pack.mcmeta mit min_format/max_format.
 */
function packFormatOf(jar, version) {
  try {
    const pv = JSON.parse(jar.read('version.json').toString('utf8')).pack_version;
    if (typeof pv === 'number') return { format: pv, modern: false };
    if (pv?.resource_major !== undefined) return { format: pv.resource_major, modern: true };
    if (pv?.resource !== undefined) return { format: pv.resource, modern: false };
  } catch { /* alte Version */ }
  const m = String(version).match(/^1\.(\d+)/);
  const minor = m ? Number(m[1]) : 12;
  return { format: minor >= 13 ? 4 : minor >= 11 ? 3 : minor >= 9 ? 2 : 1, modern: false };
}

function matches(d, i, from, tol) {
  if (d[i + 3] === 0) return false;
  return Math.abs(d[i] - from[0]) <= tol && Math.abs(d[i + 1] - from[1]) <= tol && Math.abs(d[i + 2] - from[2]) <= tol;
}

export function countMatches(data, from, tol) {
  let n = 0;
  for (let i = 0; i < data.length; i += 4) if (matches(data, i, from, tol)) n++;
  return n;
}

/** Ersetzt nach Farbe (Dichte egal). Aehnliche Farben werden mitverschoben, damit Schattierungen bleiben. */
export function replaceIn(data, from, to, tol) {
  let n = 0;
  const ta = to[3] ?? 255;
  for (let i = 0; i < data.length; i += 4) {
    if (!matches(data, i, from, tol)) continue;
    for (let c = 0; c < 3; c++) data[i + c] = Math.max(0, Math.min(255, to[c] + (data[i + c] - from[c])));
    data[i + 3] = Math.round((data[i + 3] * ta) / 255);
    n++;
  }
  return n;
}

/** Buntes Paket-Bild fuer neue Themen: Farbverlauf mit Pixel-Muster. */
function packIcon(name) {
  const w = 64, h = 64, data = new Uint8Array(w * h * 4);
  let hash = 0;
  for (const ch of String(name)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const block = ((x >> 3) + (y >> 3)) % 2;
    const [r, g, b] = hsl((hue + (x + y) * 1.2) % 360, 0.75, block ? 0.5 : 0.42);
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
  }
  return encodePng({ width: w, height: h, data });
}

function hsl(h, s, l) {
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}
