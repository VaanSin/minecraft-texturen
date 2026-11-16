// Ordnet eine Textur (z. B. "entity/pig/pig_cold.png") dem passenden 3D-Modell zu.
// Die Modelle stammen direkt aus Minecraft (public/models.json, erzeugt von tools/ModelDump.java).
// Ergebnis: Liste von Modell-Schluesseln, die zusammen gezeichnet werden (z. B. Helm + Brust + Stiefel).

const STOP = new Set(['entity', 'png', 'temperate', 'main', 'normal', 'default', 'base', 'layer', 'texture']);

// Feste Regeln fuer Faelle, bei denen Namen nicht weiterhelfen
const RULES = [
  [/^entity\/player\/slim\//, ['minecraft:player_slim#main']],
  [/^entity\/player\/wide\//, ['minecraft:player#main']],
  [/^entity\/equipment\/humanoid\//, ['minecraft:player#helmet', 'minecraft:player#chestplate', 'minecraft:player#boots']],
  [/^entity\/equipment\/humanoid_baby\//, ['minecraft:zombie_baby#helmet', 'minecraft:zombie_baby#chestplate', 'minecraft:zombie_baby#boots']],
  [/^entity\/equipment\/humanoid_leggings\//, ['minecraft:player#leggings']],
  [/^entity\/equipment\/wolf_body\//, ['minecraft:wolf_armor#main']],
  [/^entity\/equipment\/horse_body\//, ['minecraft:horse_armor#main']],
  [/^entity\/equipment\/llama_body\//, ['minecraft:llama#decor']],
  [/^entity\/equipment\/happy_ghast_body\//, ['minecraft:happy_ghast_harness#main']],
  [/^entity\/equipment\/nautilus_body\//, ['minecraft:nautilus_armor#main']],
  [/^entity\/equipment\/wings\//, ['minecraft:elytra#main']],
  [/^entity\/equipment\/([a-z_]+)_saddle\//, (m) => ['minecraft:' + m[1] + '#saddle']],
  [/^entity\/banner\//, ['minecraft:standing_banner#main', 'minecraft:standing_banner#flag']],
  [/^entity\/equipment\/krempe\//, ['themenwechsel:krempe']],   // breite Hutkrempe der /thema-Mod
  // Dorfbewohner: Berufe, Stufen und Biome liegen in Unterordnern, nutzen aber dasselbe Modell
  [/^entity\/(zombie_villager|villager)\/(.+)$/, (m) => ['minecraft:' + m[1] + (/(^|[/_])baby([/_.]|$)/.test(m[2]) ? '_baby' : '') + '#main']],
];

function tokens(s) {
  return s.toLowerCase().split(/[/_\-#:.]+/).filter((t) => t && !STOP.has(t) && t !== 'minecraft' && !/^\d+$/.test(t));
}

export function guessModels(rel, models, w = 0, h = 0) {
  // Bis 1.21.1 liegen Ruestungen unter models/armor/ (_layer_1 = Helm/Brust/Stiefel, _layer_2 = Hose)
  if (/^models\/armor\/.*_layer_1(_overlay)?\.png$/.test(rel)) return ['minecraft:player#helmet', 'minecraft:player#chestplate', 'minecraft:player#boots'];
  if (/^models\/armor\/.*_layer_2(_overlay)?\.png$/.test(rel)) return ['minecraft:player#leggings'];
  if (!rel.startsWith('entity/')) return null;
  for (const [re, out] of RULES) {
    const m = rel.match(re);
    if (m) {
      const keys = typeof out === 'function' ? out(m) : out;
      const ok = keys.filter((k) => models[k]);
      if (ok.length) return ok;
    }
  }
  const ranked = rankModels(rel, models, w, h);
  return ranked.length && ranked[0].score > 1 ? [ranked[0].key] : null;
}

/** Alle Modelle nach Passgenauigkeit sortiert (fuer die Auswahlliste in der 3D-Ansicht). */
export function rankModels(rel, models, w = 0, h = 0) {
  const parts = rel.replace(/\.png$/, '').split('/');
  const file = parts.pop();
  const fileT = tokens(file);
  const dirT = tokens(parts.join('/'));
  const texBaby = fileT.includes('baby') || dirT.includes('baby');
  const fileJoined = file.replace(/[^a-z]/g, '');
  const out = [];
  for (const key of Object.keys(models)) {
    const mdl = models[key];
    const name = key.replace('minecraft:', '');
    const [base, layer] = name.split('#');
    const mt = tokens(base).concat(layer && layer !== 'main' ? tokens(layer) : []);
    const set = new Set(mt);
    let score = 0, hit = 0;
    for (const t of fileT) if (set.has(t)) { score += 2; hit++; }
    for (const t of dirT) if (set.has(t)) { score += 1; hit++; }
    if (base.replace(/[^a-z]/g, '') === fileJoined) score += 6;
    if (!hit && score < 6) continue;
    const texAll = new Set(fileT.concat(dirT));
    for (const t of mt) if (!texAll.has(t)) score -= 1;           // Modell hat Woerter, die die Textur nicht hat
    if (set.has('baby') !== texBaby) score -= 5;                   // Baby nur zu Baby
    if (layer === 'main') score += 0.3;
    if (w && h && mdl.tw / mdl.th !== w / h) score -= 3;           // Seitenverhaeltnis muss passen
    out.push({ key, score });
  }
  return out.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
}
