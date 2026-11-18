// Unterkategorien fuer die Textur-Auswahl: Bloecke, Items, Mobs, GUI ... in aufklappbare Gruppen sortiert.
// Reine Funktionen ohne DOM, damit sie in Node testbar sind (tools/kategorien-test.mjs).

const base = (p) => p.split('/').pop().replace(/\.png$/, '');

/** Regeln je Kategorie: [id, Name, Symbol, Test auf den Dateinamen]. Erste passende Regel gewinnt. */
const RULES = {
  block: [
    ['risse', 'Abbau-Risse', '💥', /^destroy_stage/],
    ['erze', 'Erze & Metall', '⛏️', /(_ore\b|_ore_|^ore|^raw_|ancient_debris|^(diamond|emerald|gold|iron|lapis|redstone|netherite|coal|amethyst)_block|amethyst|budding|copper)/],
    ['technik', 'Redstone & Technik', '🔴', /(redstone|repeater|comparator|piston|observer|dispenser|dropper|hopper|lever|button|pressure_plate|rail|tnt|daylight|target|note_block|jukebox|tripwire|sculk_(sensor|shrieker|catalyst)|crafter|trial_spawner|vault|furnace|smoker|anvil|grindstone|stonecutter|enchanting|brewing|cauldron|beacon|conduit|lodestone|respawn|spawner|command_block|structure_block|jigsaw|barrier|test_block|lightning_rod|calibrated|crafting_table|smithing|fletching|cartography|loom|lectern|composter|barrel|chiseled_bookshelf|^bookshelf)/],
    ['farben', 'Wolle, Beton & Glas', '🎨', /(wool|concrete|terracotta|glass|carpet|candle|shulker_box)/],
    ['holz', 'Holz', '🪵', /(_log\b|_log_|_wood|planks|hyphae|(crimson|warped)_stem|bamboo|_door|trapdoor|fence|stripped|_sign)/],
    ['meer', 'Meer & Korallen', '🐠', /(coral|prismarine|sea_lantern|sponge|kelp|seagrass|sea_pickle|turtle_egg|sniffer_egg|frogspawn)/],
    ['nether', 'Nether', '🔥', /(netherrack|nether_|soul|crimson|warped|magma|glowstone|shroomlight|basalt|blackstone|gilded|wart_block|weeping|twisting|respawn_anchor)/],
    ['end', 'End', '🌌', /(end_|purpur|chorus|dragon_egg)/],
    ['fluessig', 'Wasser, Lava & Feuer', '💧', /(^water|^lava|fire|campfire|bubble)/],
    ['stein', 'Stein & Ziegel', '🪨', /(stone|cobble|deepslate|granite|diorite|andesite|tuff|calcite|brick|obsidian|bedrock|dripstone|quartz|smooth_|chiseled_|cut_|polished|mud_bricks|packed_mud)/],
    ['erde', 'Erde, Sand & Schnee', '🟫', /(dirt|grass_block|podzol|mycelium|sand|gravel|clay|^mud|farmland|path|snow|ice\b|_ice|^ice)/],
    ['pflanzen', 'Pflanzen & Blätter', '🌿', /(leaves|sapling|flower|tulip|rose|poppy|dandelion|orchid|allium|bluet|oxeye|cornflower|lily|daisy|grass|fern|vine|mushroom|fungus|roots|cactus|sugar_cane|wheat|carrot|potato|beetroot|melon|pumpkin|cocoa|berr|bush|moss|azalea|dripleaf|spore|lichen|pitcher|torchflower|sunflower|lilac|peony|wart|petals|eyeblossom|leaf_litter|cactus_flower|firefly|propagule|hay|dead_)/],
    ['betten', 'Betten, Kuchen & Bienen', '🛏️', /((^|_)bed_|cake|beehive|bee_nest|honey)/],
    ['deko', 'Deko & Licht', '🏮', /(torch|lantern|chain|pot\b|flower_pot|ladder|scaffolding|froglight|end_rod|skull|head|bell|decorated_pot|heavy_core|cobweb|honey|slime|bone_block|dried_kelp|bed_|banner|shelf|lightning|copper_bulb|creaking|resin)/],
  ],
  item: [
    ['eier', 'Spawn-Eier', '🥚', /spawn_egg/],
    ['musik', 'Schallplatten & Hörner', '🎵', /(music_disc|disc_fragment|goat_horn)/],
    ['ruestung', 'Rüstung', '🛡️', /(helmet|chestplate|leggings|boots|elytra|horse_armor|wolf_armor|_armor\b|smithing_template|harness)/],
    ['waffen', 'Waffen', '⚔️', /(sword|^bow|crossbow|arrow|trident|mace|spear|wind_charge|firework_rocket|shield)/],
    ['werkzeuge', 'Werkzeuge', '⛏️', /(pickaxe|_axe\b|^axe|shovel|_hoe\b|shears|fishing_rod|flint_and_steel|brush|compass|clock|spyglass|lead|name_tag|bucket|on_a_stick|bundle|saddle)/],
    ['essen', 'Essen', '🍖', /(apple|bread|beef|porkchop|chicken|mutton|rabbit(?!_hide|_foot)|cod|salmon|tropical_fish|pufferfish|potato|carrot|beetroot|melon_slice|cookie|cake|pie|stew|soup|sweet_berries|glow_berries|honey_bottle|dried_kelp|chorus_fruit|spider_eye|rotten_flesh)/],
    ['traenke', 'Tränke & Brauen', '🧪', /(potion|bottle|blaze_powder|ghast_tear|nether_wart|fermented|glistering|magma_cream|dragon_breath|ominous|tipped)/],
    ['buecher', 'Bücher & Karten', '📖', /(book|map|paper|banner_pattern)/],
    ['rohstoffe', 'Barren & Rohstoffe', '💎', /(ingot|nugget|^raw_|^diamond$|^emerald$|^coal$|charcoal|lapis|^redstone$|quartz|amethyst|netherite_scrap|flint$|stick|string|leather|feather|bone|gunpowder|slime_ball|clay_ball|brick|ink_sac|dye|^wheat$|sugar|^egg$|shard|prismarine|nautilus|scute|phantom_membrane|breeze_rod|blaze_rod|rabbit_hide|rabbit_foot|honeycomb|glowstone_dust|resin|snowball|ender_pearl|ender_eye|nether_star|heart_of_the_sea|totem|experience|echo|armadillo|copper)/],
    ['bloecke', 'Blöcke & Gegenstände', '🧱', /./],
  ],
  mob: [
    ['bosse', 'Bosse', '🐉', /^(enderdragon|wither|warden|elder_guardian)/],
    ['feinde', 'Feindliche Mobs', '👾', /^(zombie|husk|drowned|skeleton|stray|bogged|creeper|spider|cave_spider|enderman|endermite|slime|magmacube|witch|illager|evoker|vindicator|pillager|ravager|vex|piglin|hoglin|zoglin|blaze|ghast|phantom|silverfish|guardian|shulker|breeze|creaking|wither_skeleton)/],
    ['wasser', 'Wassertiere', '🐟', /^(fish|squid|glow_squid|axolotl|dolphin|tadpole|turtle|nautilus)/],
    ['dorf', 'Dorf & Spieler', '🏘️', /^(villager|wandering_trader|player|steve|alex|iron_golem|snow_golem|allay|armorstand)/],
    ['tiere', 'Tiere', '🐮', /^(cow|pig|sheep|chicken|horse|llama|cat|wolf|fox|rabbit|panda|bear|polarbear|goat|camel|sniffer|bee|parrot|frog|armadillo|mooshroom|ocelot|strider|bat|happy_ghast|mule|donkey)/],
    ['objekte', 'Objekte & Fahrzeuge', '📦', /./],
  ],
  particle: [
    ['rauch', 'Rauch, Wolken & Staub', '💨', /(smoke|cloud|poof|dust|ash|spore|spark|explosion|flash|sweep|squid_ink|white_ash|mycelium)/],
    ['feuer', 'Feuer & Lava', '🔥', /(flame|fire|lava|soul|ember)/],
    ['wasser', 'Wasser & Regen', '💧', /(bubble|splash|drip|rain|water|nautilus|bubble_pop)/],
    ['magie', 'Magie & Glitzer', '✨', /(enchant|glint|spell|effect|glow|sga_|totem|portal|end_rod|vault|trial|omen|witch|nectar|cherry|pale|firefly|copper_fire|ominous)/],
    ['mobs', 'Herzen, Noten & Treffer', '❤️', /(heart|angry|note|damage|critical|crit|happy|villager|sculk|shriek|vibration|sonic)/],
    ['rest', 'Weitere Partikel', '🔹', /./],
  ],
};

/** Ordner unterhalb einer Kategorie mit deutschen Namen (fuer GUI, Ruestung, Sonstiges). */
const FOLDER_DE = {
  'gui/sprites/hud': ['HUD: Herzen, Hunger, Hotbar', '❤️'], 'gui/sprites/container': ['Inventare & Truhen (Teile)', '📦'], 'gui/container': ['Inventare & Truhen', '📦'],
  'gui/sprites/widget': ['Knöpfe & Regler', '🔘'], 'gui/sprites/icon': ['Symbole', '🔣'], 'gui/sprites/advancements': ['Fortschritte', '🏆'], 'gui/advancements': ['Fortschritte', '🏆'],
  'gui/sprites/recipe_book': ['Rezeptbuch', '📖'], 'gui/sprites/boss_bar': ['Bossleiste', '👹'], 'gui/sprites/toast': ['Meldungen', '🔔'], 'gui/sprites/statistics': ['Statistik', '📊'],
  'gui/sprites/world_list': ['Weltenliste', '🌍'], 'gui/sprites/server_list': ['Serverliste', '🖥️'], 'gui/sprites/spectator': ['Zuschauer', '👁️'], 'gui/sprites/player_list': ['Spielerliste', '👥'],
  'gui/sprites/social_interactions': ['Soziales', '💬'], 'gui/sprites/realm_status': ['Realms', '🏰'], 'gui/realms': ['Realms', '🏰'], 'gui/sprites/popup': ['Popups', '🪟'],
  'gui/sprites/notification': ['Hinweise', '🔔'], 'gui/sprites/transferable_list': ['Listen', '📋'], 'gui/sprites/pending_invite': ['Einladungen', '✉️'], 'gui/sprites/gamemode_switcher': ['Spielmodus', '🎮'],
  'gui/sprites/dialog': ['Dialoge', '💬'], 'gui/sprites/tooltip': ['Tooltips', '💭'], 'gui/sprites/hud/heart': ['HUD: Herzen', '❤️'], 'gui/title': ['Titelbild & Logo', '🏷️'], 'gui/hanging_signs': ['Hängeschilder', '🪧'],
  'gui/presets': ['Welt-Vorlagen', '🗺️'], gui: ['GUI allgemein', '🖼️'], 'gui/sprites': ['GUI allgemein', '🖼️'], 'gui/signs': ['Schilder', '🪧'],
  'entity/equipment/humanoid': ['Rüstung am Körper', '🛡️'], 'entity/equipment/humanoid_leggings': ['Hosen am Körper', '👖'], 'entity/equipment/wings': ['Elytren', '🪽'],
  'entity/equipment/horse_body': ['Pferderüstung', '🐴'], 'entity/equipment/wolf_body': ['Wolfsrüstung', '🐺'], 'entity/equipment/llama_body': ['Lama-Teppiche', '🦙'], 'entity/equipment/krempe': ['Hutkrempe (Mod)', '🎩'],
  'entity/equipment/happy_ghast_body': ['Ghast-Geschirr', '👻'], 'entity/equipment/pig_saddle': ['Sättel', '🐷'], 'entity/equipment/horse_saddle': ['Sättel', '🐴'],
  'trims/models': ['Besatz-Muster', '✨'], 'trims/color_palettes': ['Besatz-Farben', '🎨'], 'trims/items': ['Besatz an Items', '💎'], 'trims/entity': ['Besatz am Körper', '✨'], 'models/armor': ['Rüstung (alt)', '🛡️'],
  painting: ['Gemälde', '🖼️'], map: ['Karten', '🗺️'], 'map/decorations': ['Karten-Symbole', '📍'], environment: ['Himmel, Sonne & Wetter', '☀️'], misc: ['Verschiedenes (Glanz, Overlays)', '🌟'],
  colormap: ['Farbkarten (Gras, Laub)', '🌈'], font: ['Schrift', '🔤'], mob_effect: ['Effekt-Symbole', '🧪'], effect: ['Effekte', '🧪'],
};

const pretty = (s) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Ordnerweise Gruppen (GUI: bis zur 3. Ebene). */
function byFolder(paths, depth) {
  const groups = new Map();
  for (const p of paths) {
    const parts = p.split('/').slice(0, -1);
    let key = parts.slice(0, depth).join('/') || parts.join('/');
    // tiefe GUI-Ordner zusammenfassen, wenn es den Namen gibt
    while (key.split('/').length > 1 && !FOLDER_DE[key] && key.split('/').length > depth - 1) key = key.split('/').slice(0, -1).join('/');
    if (!groups.has(key)) {
      const [name, icon] = FOLDER_DE[key] || [pretty(key.split('/').pop() || 'Weitere'), '📁'];
      groups.set(key, { id: key, name, icon, paths: [] });
    }
    groups.get(key).paths.push(p);
  }
  // gleiche Namen zusammenlegen, ganz kleine Gruppen in "Weitere"
  const merged = new Map();
  for (const g of groups.values()) {
    if (merged.has(g.name)) merged.get(g.name).paths.push(...g.paths); else merged.set(g.name, g);
  }
  const out = [], rest = { id: 'weitere', name: 'Weitere', icon: '📁', paths: [] };
  for (const g of merged.values()) (g.paths.length < 4 ? rest.paths : null)?.push(...g.paths) ?? out.push(g);
  if (rest.paths.length) out.push(rest);
  return out;
}

/** Mobs: Unterordner von entity/ bestimmen die Gruppe (entity/zombie/husk.png -> zombie). */
function mobKey(p) {
  const parts = p.split('/');
  return parts.length > 2 ? parts[1] : base(p);
}

/**
 * Gruppen fuer eine Kategorie: [{ id, name, icon, paths }] in fester Reihenfolge, leere weggelassen.
 * Gibt null zurueck, wenn sich Gruppen nicht lohnen (zu wenige Texturen oder nur eine Gruppe).
 */
export function groupsFor(cat, paths, catsMeta = []) {
  if (paths.length < 24 && cat !== 'all') return null;
  let groups;
  if (cat === 'all') {
    groups = catsMeta.map((c) => ({ id: c.id, name: c.name, icon: c.icon, paths: [] }));
    const rest = { id: 'rest', name: 'Weitere', icon: '📁', paths: [] };
    for (const p of paths) (groups.find((g) => catsMeta.find((c) => c.id === g.id).test(p)) || rest).paths.push(p);
    groups.push(rest);
  } else if (RULES[cat]) {
    const rules = RULES[cat];
    groups = rules.map(([id, name, icon]) => ({ id, name, icon, paths: [] }));
    for (const p of paths) {
      const key = cat === 'mob' ? mobKey(p) : base(p);
      const i = rules.findIndex(([, , , re]) => re.test(key));
      groups[i < 0 ? groups.length - 1 : i].paths.push(p);
    }
  } else if (cat === 'gui') groups = byFolder(paths, 3);
  else if (cat === 'armor' || cat === 'other') groups = byFolder(paths, cat === 'armor' ? 3 : 2);
  else return null;
  groups = groups.filter((g) => g.paths.length);
  return groups.length > 1 ? groups : null;
}

// ---------- Verzaubert ----------
const ENCH_GROUPS = [
  ['schwerter', 'Schwerter', '🗡️', /_sword$/],
  ['aexte', 'Äxte', '🪓', /_axe$/],
  ['spitzhacken', 'Spitzhacken', '⛏️', /_pickaxe$/],
  ['schaufeln', 'Schaufeln & Hacken', '🥄', /_(shovel|hoe)$/],
  ['speere', 'Speere', '🔱', /_spear$/],
  ['fern', 'Bögen, Armbrust, Dreizack & Streitkolben', '🏹', /^(bow|crossbow|trident|mace)$/],
  ['helme', 'Helme', '⛑️', /(_helmet|turtle_helmet)$/],
  ['brust', 'Brustpanzer & Elytren', '🦺', /(_chestplate|elytra)$/],
  ['hosen', 'Hosen', '👖', /_leggings$/],
  ['stiefel', 'Stiefel', '🥾', /_boots$/],
  ['buecher', 'Verzauberte Bücher', '📖', /^enchanted_book$/],
  ['rest', 'Weitere Werkzeuge', '🧰', /./],
];

/** Gruppen im Tab "Verzaubert": je Item-Art; die Bilder einer Variante stehen direkt hinter ihrem Item. */
export function enchantGroups(items, variants) {
  const groups = ENCH_GROUPS.map(([id, name, icon]) => ({ id, name, icon, paths: [] }));
  const byItem = new Map();
  for (const v of variants) { if (!byItem.has(v.item)) byItem.set(v.item, []); byItem.get(v.item).push(v.rel); }
  const MAT = ['wooden', 'stone', 'copper', 'iron', 'golden', 'diamond', 'netherite', 'leather', 'chainmail', 'turtle'];
  const order = (it) => { const i = MAT.findIndex((m) => it.startsWith(m + '_')); return (i < 0 ? 50 : i) + '_' + it; };
  for (const it of [...items].sort((a, b) => order(a).localeCompare(order(b)))) {
    const i = ENCH_GROUPS.findIndex(([, , , re]) => re.test(it));
    groups[i].paths.push(`item/${it}.png`, ...(byItem.get(it) || []).sort());
  }
  return groups.filter((g) => g.paths.length);
}

/** "item/verzaubert/diamond_sword-fire_aspect-sharpness.png" -> { item, enchants } */
export function variantInfo(p) {
  const m = String(p).match(/^item\/verzaubert\/([a-z0-9_]+)-([a-z0-9_]+)(?:-([a-z0-9_]+))?\.png$/);
  return m ? { item: m[1], enchants: [m[2], m[3]].filter(Boolean) } : null;
}
