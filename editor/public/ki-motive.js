// Pixel-Motive fuer die Textur-KI: von Hand gezeichnet (9x9), damit die KI Bilder aus Worten malen kann
// ("Schwert mit Totenkopf", "Pixelbild von einem Drachen").
// Zeichen: . = durchsichtig, # = Kontur, a = Hauptfarbe, b = Zweitfarbe, c = Licht/Glanz, d = Extra
export const MOTIVE = {
  herz: { words: ['herz', 'herzchen', 'heart', 'liebe', 'love'], colors: { a: '#E0202A', b: '#A0101A', c: '#FF8A8A', d: '#FFFFFF', '#': '#3A0A0E' },
    px: ['.##...##.', '#ac#.#aa#', '#caa#aaa#', '#aaaaaaa#', '.#aaaaa#.', '..#aaa#..', '...#a#...', '....#....', '.........'] },
  stern: { words: ['stern', 'star'], colors: { a: '#F5D021', b: '#E0A010', c: '#FFF6A0', d: '#FFFFFF', '#': '#7A5A00' },
    px: ['....#....', '...#c#...', '...#a#...', '####a####', '#ccaaaab#', '.#aaaab#.', '..#aaa#..', '.#aa#ab#.', '#a#...#b#'] },
  totenkopf: { words: ['totenkopf', 'schaedel', 'totenschaedel', 'skull', 'knochenkopf'], colors: { a: '#EDEDE6', b: '#BDBDB4', c: '#FFFFFF', d: '#EDEDE6', '#': '#26262A' },
    px: ['..#####..', '.#accca#.', '#acccccb#', '#a##c##b#', '#a##c##b#', '#aaa#aab#', '.#aaaab#.', '..#a#b#..', '..#####..'] },
  blitz: { words: ['blitz', 'lightning', 'donner', 'thunder', 'flash'], colors: { a: '#F5C518', b: '#D89A00', c: '#FFF3A0', d: '#FFFFFF', '#': '#6A4A00' },
    px: ['.....###.', '....#cc#.', '...#ca#..', '..#ca####', '.#caaab#.', '####ab#..', '...#a#...', '..#b#....', '..##.....'] },
  flamme: { words: ['flamme', 'feuerball', 'flame'], colors: { a: '#E8400C', b: '#FF9A1E', c: '#FFE14D', d: '#FFFFFF', '#': '#5A0A00' },
    px: ['....#....', '...#a#...', '..#aa#...', '..#aba#..', '.#abba#..', '.#abcba#.', '#abccba#.', '#abccba#.', '.#aaaa#..'] },
  mond: { words: ['mond', 'moon', 'halbmond'], colors: { a: '#E8E0B0', b: '#C8BE88', c: '#FFFBE0', d: '#FFFFFF', '#': '#5A5430' },
    px: ['..####...', '.#cc#....', '#cc#.....', '#ca#.....', '#ca#.....', '#caa#..#.', '.#caa##a#', '..#aabb#.', '...####..'] },
  sonne: { words: ['sonne', 'sun', 'sonnig'], colors: { a: '#FFC21F', b: '#F09A00', c: '#FFE98A', d: '#FFFFFF', '#': '#E07A00' },
    px: ['....c....', '.c.###.c.', '..#aaa#..', '.#acaab#.', 'c#aaaab#c', '.#aaabb#.', '..#bbb#..', '.c.###.c.', '....c....'] },
  krone: { words: ['krone', 'crown', 'koenigskrone'], colors: { a: '#F2C230', b: '#D0202A', c: '#FFF2A0', d: '#2A7FD4', '#': '#7A5A00' },
    px: ['.........', '#...#...#', '#c.#c#.a#', '#ca#a#aa#', '#aaaaaaa#', '#abadaba#', '#aaaaaaa#', '#########', '.........'] },
  juwel: { words: ['juwel', 'edelstein', 'gem', 'kristallherz', 'smaragdstein'], colors: { a: '#4FE3E0', b: '#2AA8B0', c: '#C8FFFF', d: '#FFFFFF', '#': '#0E4A50' },
    px: ['..#####..', '.#ccaab#.', '#cccaabb#', '#########', '.#aaabb#.', '..#aab#..', '...#b#...', '....#....', '.........'] },
  blume: { words: ['blume', 'flower', 'bluete', 'rose'], colors: { a: '#3FAE3A', b: '#FF6FB0', c: '#FFE14D', d: '#3FAE3A', '#': '#7A1A4A' },
    px: ['...###...', '..#bbb#..', '.#bbcbb#.', '.#bcccb#.', '.#bbcbb#.', '..#bbb#..', '...#d#...', '..#dd#...', '....d....'] },
  baum: { words: ['baum', 'tree', 'tanne', 'wald'], colors: { a: '#3E8E2E', b: '#2A6A1E', c: '#8BE36B', d: '#7A4A24', '#': '#16300E' },
    px: ['...###...', '..#aca#..', '.#acaab#.', '#aaacabb#', '#acaaabb#', '.#aabbb#.', '..##d##..', '....d....', '...ddd...'] },
  fisch: { words: ['fisch', 'fish', 'goldfisch'], colors: { a: '#F57C00', b: '#D85A00', c: '#FFB060', d: '#FFFFFF', '#': '#5A2A00' },
    px: ['.........', '..####..#', '.#acaa#bb', '#a#aaaabb', '#aaaab#bb', '.#aabb#.#', '..####...', '.........', '.........'] },
  katze: { words: ['katze', 'cat', 'kater', 'kaetzchen'], colors: { a: '#9A9AA2', b: '#FF8FB0', c: '#C8C8D0', d: '#7AE05A', '#': '#2A2A30' },
    px: ['#.......#', '##.....##', '#a#####a#', '#accccca#', '#a#ccc#a#', '#cccbccc#', '.#cc#cc#.', '..#####..', '.........'] },
  smiley: { words: ['smiley', 'smily', 'lachen', 'lachgesicht', 'emoji', 'gesicht'], colors: { a: '#F5D021', b: '#E0A010', c: '#FFF2A0', d: '#FFFFFF', '#': '#5A3A00' },
    px: ['..#####..', '.#accaa#.', '#ac#a#ab#', '#aa#a#ab#', '#aaaaaab#', '#a#aaa#b#', '#aa###bb#', '.#abbbb#.', '..#####..'] },
  auge: { words: ['auge', 'eye', 'augen'], colors: { a: '#2A7FD4', b: '#1B4A90', c: '#FFFFFF', d: '#FFFFFF', '#': '#14141A' },
    px: ['.........', '..#####..', '.#ccacc#.', '#cca#acc#', '#cca#bcc#', '.#ccbcc#.', '..#####..', '.........', '.........'] },
  anker: { words: ['anker', 'anchor'], colors: { a: '#5A6270', b: '#3A4048', c: '#9AA2B0', d: '#FFFFFF', '#': '#1E2228' },
    px: ['...###...', '...#.#...', '...###...', '.#aacaa#.', '....a....', '....a....', '#...a...#', '.#..a..#.', '..#####..'] },
  schwert: { words: ['schwertsymbol', 'klingensymbol'], colors: { a: '#F2C230', b: '#7A4A24', c: '#D8DCE2', d: '#FFFFFF', '#': '#2A2A30' },
    px: ['.......#c', '......#cc', '.....#cc#', '....#cc#.', '.#.#cc#..', '..#ac#...', '..ba#a...', '.bb#.....', '#b.......'] },
  schild: { words: ['schildsymbol', 'wappen', 'emblem'], colors: { a: '#2E4FA0', b: '#F5C518', c: '#5A7FD0', d: '#FFFFFF', '#': '#0E1A40' },
    px: ['#########', '#acabaaa#', '#aaabaaa#', '#bbbbbbb#', '#aaabaaa#', '.#aabaa#.', '..#aba#..', '...#a#...', '....#....'] },
  rakete: { words: ['rakete', 'rocket', 'raumschiff'], colors: { a: '#FF9A1E', b: '#D0202A', c: '#F2F2F2', d: '#7FC8FF', '#': '#2A2A30' },
    px: ['....#....', '...#b#...', '...#c#...', '..#ccc#..', '..#cdc#..', '..#ccc#..', '.#b#c#b#.', '#bb#a#bb#', '...#a#...'] },
  geist: { words: ['geist', 'gespenst', 'ghost', 'buh'], colors: { a: '#F2F2F2', b: '#C8C8D8', c: '#FFFFFF', d: '#FFFFFF', '#': '#2A2A40' },
    px: ['..#####..', '.#acaaa#.', '#acaaaab#', '#a##a##b#', '#a##a##b#', '#aaaaaab#', '#aaaaabb#', '#a#a#b#b#', '.#.#.#.#.'] },
  kuerbis: { words: ['kuerbisgesicht', 'jackolantern', 'laterne', 'kuerbiskopf'], colors: { a: '#F07800', b: '#C85A00', c: '#FFB040', d: '#3FAE3A', '#': '#2A1000' },
    px: ['....d....', '..##d##..', '.#acaab#.', '#a#aaa#b#', '#aca#aab#', '#a#####b#', '#aa#a#bb#', '.#aabbb#.', '..#####..'] },
  schneeflocke: { words: ['schneeflocke', 'snowflake', 'flocke', 'schneestern'], colors: { a: '#BFEFFF', b: '#8FD3FF', c: '#FFFFFF', d: '#FFFFFF', '#': '#3A8FC8' },
    px: ['....c....', '.c..c..c.', '..c.a.c..', '...cac...', 'caaa#aaac', '...cac...', '..c.a.c..', '.c..c..c.', '....c....'] },
  note: { words: ['note', 'musiknote', 'musik', 'music'], colors: { a: '#2A2A30', b: '#14141A', c: '#6A6A78', d: '#FFFFFF', '#': '#14141A' },
    px: ['...#####.', '...#acc#.', '...#...#.', '...#...#.', '...#...#.', '.###.###.', '#aa##aa#.', '#ab##ab#.', '.##..##..'] },
  pfote: { words: ['pfote', 'pfoten', 'paw', 'tatze'], colors: { a: '#7A4A24', b: '#5A3418', c: '#A0703A', d: '#FFFFFF', '#': '#2A1408' },
    px: ['.ca...ca.', '.ab...ab.', '.........', 'c..cac..c', 'a.aaaab.b', '..aaaab..', '..aabbb..', '...bbb...', '.........'] },
  kreuz: { words: ['kreuz', 'cross', 'plus'], colors: { a: '#D0202A', b: '#A0101A', c: '#FF6A6A', d: '#FFFFFF', '#': '#3A0A0E' },
    px: ['...###...', '...#c#...', '...#a#...', '####a####', '#ccaaaab#', '####b####', '...#b#...', '...#b#...', '...###...'] },
  drache: { words: ['drache', 'drachen', 'dragon', 'drachenkopf'], colors: { a: '#2E9E3A', b: '#1E6A26', c: '#8BE36B', d: '#F5D021', '#': '#0E2A10' },
    px: ['.#.......', '#a#.##...', '#aa#ac#..', '.#aaaaa#.', '.#ada#ab#', '#aaaaaabb', '#cbaaab#.', '.#c#cc#..', '..#.#....'] },
  creeper: { words: ['creepergesicht', 'creeperface'], colors: { a: '#4CAF50', b: '#2E7D32', c: '#8BE38F', d: '#FFFFFF', '#': '#0E1A0E' },
    px: ['acaaabaa', 'a##aa##a', 'a##ab##a', 'aaa##aab', 'aa####ba', 'ab####aa', 'aa#ab#aa', 'abaaaaba'] },
  spinne: { words: ['spinne', 'spider', 'spinnen'], colors: { a: '#26262A', b: '#14141A', c: '#5A5A64', d: '#D0202A', '#': '#14141A' },
    px: ['#.......#', '.#.....#.', '..#.#.#..', '#..#c#..#', '.###a###.', '#..#a#..#', '..#.d.#..', '.#.....#.', '#.......#'] },
  fledermaus: { words: ['fledermaus', 'bat', 'fledermaeuse'], colors: { a: '#26262A', b: '#14141A', c: '#5A5A64', d: '#D0202A', '#': '#14141A' },
    px: ['.........', '#...a...#', '##.aaa.##', '#aaadaaa#', '#aaaaaaa#', '.aaa.aaa.', '..a...a..', '.........', '.........'] },
  pilz: { words: ['pilz', 'mushroom', 'fliegenpilz'], colors: { a: '#D0202A', b: '#A0101A', c: '#FFFFFF', d: '#E8D8B8', '#': '#3A0A0E' },
    px: ['..#####..', '.#acaca#.', '#acaaaab#', '#aaacaab#', '#########', '...#dd#..', '...#dd#..', '..#dddd#.', '..######.'] },
};

/** Motiv-Wort -> Name (ohne Doppel) */
export const MOTIV_WORDS = Object.fromEntries(Object.entries(MOTIVE).flatMap(([k, m]) => m.words.map((w) => [w, k])));

/** Motiv als Pixel { w, h, data } in Wunschgroesse (scharf vergroessert); colors ueberschreibt Farben (z. B. aus einem Stil) */
export function motivPixels(name, size = 9, colors = null) {
  const m = MOTIVE[name];
  if (!m) return null;
  const pal = { ...m.colors, ...(colors || {}) };
  const gw = m.px[0].length, gh = m.px.length;
  const sc = Math.max(1, Math.floor(size / Math.max(gw, gh)));
  const w = gw * sc, h = gh * sc, data = new Uint8ClampedArray(w * h * 4);
  const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const ch = m.px[y][x];
    if (ch === '.' || !pal[ch]) continue;
    const c = hex(pal[ch]);
    for (let yy = 0; yy < sc; yy++) for (let xx = 0; xx < sc; xx++) {
      const i = ((y * sc + yy) * w + x * sc + xx) * 4;
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
    }
  }
  return { w, h, data };
}
