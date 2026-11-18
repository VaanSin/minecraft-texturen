// Verzauberte Items: eigenes Bild je Verzauberung (oder fuer zwei Verzauberungen zusammen).
// Die Bilder liegen im Thema unter textures/item/verzaubert/<item>-<verzauberung>[-<zweite>].png;
// daraus entstehen Item-Modell-Definitionen (assets/minecraft/items/<item>.json) mit Bedingungen.
// Ab Minecraft 1.21.5 (auch 26.x): je Verzauberung. 1.21.4: nur "irgendeine Verzauberung". Davor geht es ohne Mod nicht.

export const VARIANT = /^item\/verzaubert\/([a-z0-9_]+)-([a-z0-9_]+)(?:-([a-z0-9_]+))?\.png$/;
export const ANY = 'alle';
export const MANIFEST = 'mct-verzaubert.json';

/** Deutsche Namen wie im Spiel */
export const ENCHANT_DE = {
  alle: 'Irgendeine Verzauberung', aqua_affinity: 'Wasseraffinität', bane_of_arthropods: 'Nemesis der Gliederfüßer', binding_curse: 'Fluch der Bindung',
  blast_protection: 'Explosionsschutz', breach: 'Bresche', channeling: 'Entladung', density: 'Dichte', depth_strider: 'Wasserläufer',
  efficiency: 'Effizienz', feather_falling: 'Federfall', fire_aspect: 'Verbrennung', fire_protection: 'Feuerschutz', flame: 'Flamme',
  fortune: 'Glück', frost_walker: 'Eisläufer', impaling: 'Harpune', infinity: 'Unendlichkeit', knockback: 'Rückstoß', looting: 'Plünderung',
  loyalty: 'Treue', luck_of_the_sea: 'Glück des Meeres', lunge: 'Ausfallschritt', lure: 'Köder', mending: 'Reparatur', multishot: 'Mehrfachschuss',
  piercing: 'Durchschuss', power: 'Stärke', projectile_protection: 'Schusssicher', protection: 'Schutz', punch: 'Schlag', quick_charge: 'Schnellladen',
  respiration: 'Atmung', riptide: 'Sog', sharpness: 'Schärfe', silk_touch: 'Behutsamkeit', smite: 'Bann', soul_speed: 'Seelenläufer',
  sweeping_edge: 'Schwungkraft', swift_sneak: 'Huschen', thorns: 'Dornen', unbreaking: 'Haltbarkeit', vanishing_curse: 'Fluch des Verschwindens',
  wind_burst: 'Windstoß',
};

/** 'voll' (je Verzauberung), 'alle' (nur "irgendeine", 1.21.4) oder null (zu alt). Auch Snapshots wie 25w14a. */
export function versionLevel(version) {
  const v = String(version || '');
  const snap = v.match(/^(\d{2})w(\d{2})/);
  if (snap) return +snap[1] > 25 || (+snap[1] === 25 && +snap[2] >= 2) ? 'voll' : +snap[1] === 24 && +snap[2] >= 44 ? 'alle' : null;
  const m = v.match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!m) return null;
  const [a, b, c = 0] = [+m[1], +m[2], +(m[3] || 0)];
  if (a >= 2) return 'voll'; // 26.1, 26.2 ...
  if (a < 1 || b < 21) return null;
  if (b > 21 || c >= 5) return 'voll';
  return c === 4 ? 'alle' : null;
}

/** Sortierte, eindeutige Liste; "alle" nur allein. */
export function normEnchants(list) {
  const l = [...new Set((list || []).map(String))].filter((e) => /^[a-z0-9_]+$/.test(e));
  if (l.includes(ANY)) return [ANY];
  return l.sort().slice(0, 2);
}
export function variantPath(item, enchants) {
  const e = normEnchants(enchants);
  if (!/^[a-z0-9_]+$/.test(item) || !e.length) throw new Error('Ungültige Verzauberung');
  return `item/verzaubert/${item}-${e.join('-')}.png`;
}
export function parseVariant(rel) {
  const m = String(rel).match(VARIANT);
  if (!m) return null;
  return { item: m[1], enchants: [m[2], m[3]].filter(Boolean), rel };
}

const strip = (id) => String(id || '').replace(/^minecraft:/, '');

/**
 * Welche Verzauberungen gehen auf welches Item? Aus den Daten der Minecraft-Version (Verzauberungen + Item-Tags).
 * readJson(name) -> Objekt oder null (Dateien im Jar). Gibt { items: { item: [ids] }, enchantments: [ids] }.
 */
export function enchantTable(names, readJson) {
  const ids = names.map((n) => n.match(/^data\/minecraft\/enchantment\/([a-z0-9_]+)\.json$/)?.[1]).filter(Boolean).sort();
  const tagCache = new Map();
  const resolve = (ref, seen = new Set()) => {
    const out = new Set();
    for (const r of Array.isArray(ref) ? ref : [ref]) {
      const id = typeof r === 'string' ? r : r?.id;
      if (!id) continue;
      if (!id.startsWith('#')) { out.add(strip(id)); continue; }
      const tag = strip(id.slice(1));
      if (seen.has(tag)) continue;
      seen.add(tag);
      if (!tagCache.has(tag)) {
        const j = readJson(`data/minecraft/tags/item/${tag}.json`) || readJson(`data/minecraft/tags/items/${tag}.json`);
        tagCache.set(tag, [...resolve(j?.values || [], seen)]);
      }
      for (const x of tagCache.get(tag)) out.add(x);
    }
    return out;
  };
  const items = {};
  for (const e of ids) {
    const j = readJson(`data/minecraft/enchantment/${e}.json`);
    for (const it of resolve(j?.supported_items || [])) (items[it] ||= []).push(e);
  }
  if (ids.length) items.enchanted_book = [...ids];
  for (const k of Object.keys(items)) items[k] = [ANY, ...items[k]];
  return { items, enchantments: ids };
}

/**
 * Baut alle Dateien fuer die Varianten eines Themas.
 * variants: [{ item, enchants }], readJson(path) liefert die Datei, die ohne uns gelten wuerde (Thema oder Original).
 * level: 'voll' | 'alle'. Rueckgabe: Map(path -> Objekt).
 */
export function buildFiles(variants, readJson, level) {
  const files = new Map();
  const byItem = new Map();
  for (const v of variants) {
    const enchants = normEnchants(v.enchants);
    if (!enchants.length || (level === 'alle' && enchants[0] !== ANY)) continue;
    if (!byItem.has(v.item)) byItem.set(v.item, []);
    byItem.get(v.item).push(enchants);
  }
  for (const [item, list] of byItem) {
    const defPath = `assets/minecraft/items/${item}.json`;
    const base = readJson(defPath) || { model: { type: 'minecraft:model', model: `minecraft:item/${item}` } };
    const comp = item === 'enchanted_book' ? 'minecraft:stored_enchantments' : 'minecraft:enchantments';
    // genauere zuerst: zwei Verzauberungen vor einer, "irgendeine" zuletzt
    list.sort((a, b) => (a[0] === ANY) - (b[0] === ANY) || b.length - a.length || a.join().localeCompare(b.join()));
    let chain = base.model;
    for (const enchants of [...list].reverse()) {
      const suffix = enchants.join('-');
      const tex = `minecraft:item/verzaubert/${item}-${suffix}`;
      let replaced = 0;
      const swap = (node) => {
        if (Array.isArray(node)) return node.map(swap);
        if (!node || typeof node !== 'object') return node;
        if (strip(node.type) === 'model' && typeof node.model === 'string') {
          const name = strip(node.model);
          const m = readJson(`assets/minecraft/models/${name}.json`);
          if (m?.textures && strip(m.textures.layer0) === `item/${item}`) {
            const id = `item/verzaubert/${name.replace(/^item\//, '').replace(/\//g, '_')}-${suffix}`;
            files.set(`assets/minecraft/models/${id}.json`, { ...m, textures: { ...m.textures, layer0: tex } });
            replaced++;
            return { ...node, model: 'minecraft:' + id };
          }
          return node;
        }
        const out = {};
        for (const [k, v] of Object.entries(node)) out[k] = swap(v);
        return out;
      };
      let onTrue = swap(base.model);
      if (!replaced) {
        // Kein passendes Bild im Original-Modell gefunden: einfaches flaches Item
        const id = `item/verzaubert/${item}-${suffix}`;
        files.set(`assets/minecraft/models/${id}.json`, { parent: 'minecraft:item/handheld', textures: { layer0: tex } });
        onTrue = { type: 'minecraft:model', model: 'minecraft:' + id };
      }
      const cond = enchants[0] === ANY
        ? { type: 'minecraft:condition', property: 'minecraft:has_component', component: comp }
        : { type: 'minecraft:condition', property: 'minecraft:component', predicate: comp, value: enchants.map((e) => ({ enchantments: 'minecraft:' + e })) };
      chain = { ...cond, on_true: onTrue, on_false: chain };
    }
    files.set(defPath, { ...base, model: chain });
  }
  return files;
}
