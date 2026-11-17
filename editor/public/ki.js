// Eingebaute Textur-KI – ganz ohne Internet und ohne Kosten.
// Sie versteht Wuensche ueber einen Wortschatz (Figuren, Stile, Farben, Muster, Ziele) und malt nach Regeln:
// Form und Schattierung kommen aus der Original-Textur, Farben/Muster/Embleme aus dem Stil.
// Reine Funktionen ohne Oberflaeche (auch ohne Browser testbar).
import { hsl, fromHsl } from './colors.js';
import { MOTIV_WORDS, MOTIVE, motivPixels } from './ki-motive.js';
import { makeEffect, canAnimate } from './animation.js';

// ---------- Hilfen ----------
export const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const toHex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
const clamp01 = (v) => Math.max(0, Math.min(1, v));
export function norm(s) {
  return String(s).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9 ]+/g, ' ');
}
function shade(c, dl, ds = 0, dh = 0) {
  const [h, s, l] = hsl(c);
  // dunkler = etwas kuehler, heller = etwas waermer (wie in Pixel-Kunst)
  return fromHsl((h + dh + (dl < 0 ? 8 : -6) * Math.abs(dl) * (s > 0.15 ? 1 : 0) + 360) % 360, clamp01(s + ds), clamp01(l + dl));
}
/** 5 Toene von dunkel nach hell */
function ramp(c) { return [shade(c, -0.32, 0.05), shade(c, -0.17, 0.03), c.slice(0, 3), shade(c, 0.12, -0.03), shade(c, 0.24, -0.08)]; }
const pick = (r, t) => r[Math.max(0, Math.min(r.length - 1, Math.floor(t * r.length)))];
function rng(seed) { let s = (seed >>> 0) || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
// 32-Bit-Mischfunktion (Math.imul, sonst verliert JavaScript bei grossen Zahlen Stellen)
function hash2(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function noise(x, y, seed, scale = 3) {
  const fx = x / scale, fy = y / scale, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  const s = (t) => t * t * (3 - 2 * t);
  const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed), c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * s(tx) + (c - a) * s(ty) + (a - b - c + d) * s(tx) * s(ty);
}
const lum = (d, i) => (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;

// ---------- Wortschatz ----------
export const COLOR_WORDS = {
  rot: '#D0202A', red: '#D0202A', dunkelrot: '#7A1018', hellrot: '#FF5A5A', blau: '#2A5BD7', blue: '#2A5BD7', dunkelblau: '#1B2A6B', hellblau: '#7FC8FF',
  gruen: '#3FAE3A', green: '#3FAE3A', dunkelgruen: '#1E5A1E', hellgruen: '#8BE36B', gelb: '#F5D021', yellow: '#F5D021', orange: '#F57C00',
  lila: '#8A3FD1', violett: '#8A3FD1', purple: '#8A3FD1', pink: '#FF5FB0', rosa: '#FFA6CF', tuerkis: '#1FC8C0', cyan: '#1FD3E0',
  schwarz: '#1A1A1E', black: '#1A1A1E', weiss: '#F2F2F2', white: '#F2F2F2', grau: '#8A8D93', grey: '#8A8D93', gray: '#8A8D93',
  braun: '#7A4A24', brown: '#7A4A24', beige: '#D8C39A', gold: '#F2C230', golden: '#F2C230', goldig: '#F2C230', silber: '#C3C8D0', silver: '#C3C8D0',
  bronze: '#B0703A', magenta: '#E0209E', mint: '#8FF0C0', oliv: '#6B7A2E', neongruen: '#39FF14', neonpink: '#FF2BD6',
};

/** Figuren und Stile. colors: main/second/line/light; armor: Farbe je Koerperteil; face/emblem/pattern siehe unten */
export const STYLES = [
  { id: 'spiderman', name: 'Spider-Man', words: ['spiderman', 'spider man', 'spinnenmann', 'spidey', 'spidy', 'peter parker'], colors: { main: '#C8102E', second: '#1D3F94', line: '#1A0A0E', light: '#F5F5F5' }, armor: { sides: 'second', legs: 'second', belt: 'second', boots: 'main' }, pattern: { kind: 'web', color: 'line', on: ['head', 'body', 'arms', 'boots'] }, emblem: 'spider', face: 'mask', suit: true },
  { id: 'miles', name: 'Miles Morales', words: ['miles morales', 'miles'], colors: { main: '#16161A', second: '#C8102E', line: '#C8102E', light: '#F5F5F5' }, pattern: { kind: 'web', color: 'line', on: ['head', 'body', 'arms'] }, emblem: 'spider', face: 'mask', suit: true },
  { id: 'venom', name: 'Venom', words: ['venom', 'symbiont'], colors: { main: '#121216', second: '#22222A', line: '#F5F5F5', light: '#F5F5F5' }, emblem: 'spiderbig', face: 'mask', suit: true },
  { id: 'batman', name: 'Batman', words: ['batman', 'bat man', 'fledermausmann', 'bruce wayne'], colors: { main: '#3C3C44', second: '#141418', line: '#0A0A0C', light: '#F5C518' }, armor: { head: 'second', sides: 'second', belt: 'light', legs: 'main', boots: 'second' }, emblem: 'bat', face: 'cowl', suit: true },
  { id: 'superman', name: 'Superman', words: ['superman', 'super man', 'clark kent'], colors: { main: '#1F4FBF', second: '#D0202A', line: '#101A3A', light: '#FFD21F' }, armor: { belt: 'light', boots: 'second' }, emblem: 'super', suit: true },
  { id: 'ironman', name: 'Iron Man', words: ['ironman', 'iron man', 'eisenmann', 'tony stark'], colors: { main: '#B3161B', second: '#E8B923', line: '#3A0A0A', light: '#9EF7FF' }, armor: { sides: 'second', belt: 'second', legs: 'main', boots: 'main' }, pattern: { kind: 'panels', color: 'line', on: ['body', 'arms', 'legs'] }, emblem: 'reactor', face: 'visor', suit: true },
  { id: 'hulk', name: 'Hulk', words: ['hulk'], colors: { main: '#4CA43A', second: '#6B2E8F', line: '#1E3A14', light: '#9BE07A' }, armor: { legs: 'second', belt: 'second', boots: 'main' }, suit: true },
  { id: 'captain', name: 'Captain America', words: ['captain america', 'captainamerica', 'kapitaen amerika'], colors: { main: '#1F3F8F', second: '#C8102E', line: '#0E1A40', light: '#F5F5F5' }, armor: { sides: 'second', belt: 'second', boots: 'second' }, emblem: 'star', suit: true },
  { id: 'thor', name: 'Thor', words: ['thor'], colors: { main: '#4A5260', second: '#B01820', line: '#1A1E26', light: '#D8DCE2' }, armor: { sides: 'second' }, pattern: { kind: 'dots', color: 'light', on: ['body'] }, suit: true },
  { id: 'deadpool', name: 'Deadpool', words: ['deadpool', 'dead pool'], colors: { main: '#A3141A', second: '#16161A', line: '#16161A', light: '#F5F5F5' }, armor: { sides: 'second', belt: 'second' }, face: 'deadpool', suit: true },
  { id: 'flash', name: 'Flash', words: ['flash', 'the flash'], colors: { main: '#C8102E', second: '#F5C518', line: '#5A0A10', light: '#F5C518' }, armor: { belt: 'second', boots: 'second' }, emblem: 'bolt', suit: true },
  { id: 'panther', name: 'Black Panther', words: ['black panther', 'blackpanther', 'schwarzer panther'], colors: { main: '#18181E', second: '#6A4FC8', line: '#9A86FF', light: '#C8C8D8' }, pattern: { kind: 'chevrons', color: 'line', on: ['body', 'arms', 'legs'] }, face: 'cowl', suit: true },
  { id: 'wonderwoman', name: 'Wonder Woman', words: ['wonder woman', 'wonderwoman'], colors: { main: '#B3161B', second: '#1F3F8F', line: '#5A0A10', light: '#F5C518' }, armor: { legs: 'second', belt: 'light' }, emblem: 'crown', suit: true },
  { id: 'creeper', name: 'Creeper', words: ['creeper'], colors: { main: '#4CAF50', second: '#2E7D32', line: '#0E1A0E', light: '#A5D6A7' }, pattern: { kind: 'camo', color: 'second', on: ['head', 'body', 'arms', 'legs', 'boots', 'belt'] }, face: 'creeper', suit: true },
  { id: 'enderman', name: 'Enderman', words: ['enderman', 'ender man', 'ender'], colors: { main: '#161616', second: '#262626', line: '#0A0A0A', light: '#CC33FF' }, face: 'ender', suit: true },
  { id: 'zombie', name: 'Zombie', words: ['zombie', 'zombi', 'untoter'], colors: { main: '#1E8C8C', second: '#3B3F99', line: '#14202A', light: '#5A8A3A' }, armor: { head: 'light', arms: 'light', legs: 'second', belt: 'second', boots: 'line' }, face: 'zombie', suit: true },
  { id: 'skelett', name: 'Skelett', words: ['skelett', 'skeleton', 'knochen', 'gerippe'], colors: { main: '#D6D6D6', second: '#A8A8A8', line: '#3A3A3A', light: '#F5F5F5' }, pattern: { kind: 'ribs', color: 'line', on: ['body'] }, face: 'skull', suit: true },
  { id: 'ninja', name: 'Ninja', words: ['ninja', 'schattenkrieger'], colors: { main: '#1A1A1E', second: '#B01818', line: '#0A0A0C', light: '#F5F5F5' }, armor: { belt: 'second' }, face: 'ninja', suit: true },
  { id: 'pirat', name: 'Pirat', words: ['pirat', 'pirate', 'piraten', 'seeraeuber'], colors: { main: '#8B1A1A', second: '#2B1A0E', line: '#140A04', light: '#E8C060' }, armor: { legs: 'second', belt: 'light', boots: 'second' }, emblem: 'skull', pattern: { kind: 'buttons', color: 'light', on: ['body'] } },
  { id: 'ritter', name: 'Ritter', words: ['ritter', 'knight', 'paladin', 'krieger'], colors: { main: '#B8BCC4', second: '#2E4FA0', line: '#3A3E46', light: '#E8ECF2' }, armor: { belt: 'second' }, emblem: 'cross', pattern: { kind: 'panels', color: 'line', on: ['body', 'arms', 'legs'] } },
  { id: 'koenig', name: 'König', words: ['koenig', 'king', 'koenigin', 'queen', 'koeniglich', 'royal', 'prinz', 'prinzessin'], colors: { main: '#6A1FA0', second: '#F2C230', line: '#2A0A40', light: '#FFF2B0' }, armor: { head: 'second', belt: 'second', sides: 'second' }, emblem: 'crown' },
  { id: 'astronaut', name: 'Astronaut', words: ['astronaut', 'raumfahrer', 'weltraumanzug', 'kosmonaut'], colors: { main: '#EDEDED', second: '#F07F1E', line: '#8A8D93', light: '#2A3A5A' }, armor: { belt: 'second', sides: 'second' }, face: 'glass', suit: true },
  { id: 'roboter', name: 'Roboter', words: ['roboter', 'robot', 'cyborg', 'android', 'mech'], colors: { main: '#8A8F98', second: '#3CC8FF', line: '#3A3E46', light: '#9EF7FF' }, pattern: { kind: 'panels', color: 'line', on: ['head', 'body', 'arms', 'legs', 'boots'] }, emblem: 'reactor', face: 'glass', suit: true },
  { id: 'polizei', name: 'Polizei', words: ['polizei', 'polizist', 'police', 'cop'], colors: { main: '#1B2A55', second: '#2E4FA0', line: '#0A1228', light: '#F5C518' }, emblem: 'star' },
  { id: 'feuerwehr', name: 'Feuerwehr', words: ['feuerwehr', 'feuerwehrmann', 'firefighter'], colors: { main: '#B8161B', second: '#F5D021', line: '#3A0A0A', light: '#E8F0F0' }, pattern: { kind: 'bands', color: 'second', on: ['arms', 'legs', 'body'] } },
  { id: 'pikachu', name: 'Pikachu', words: ['pikachu', 'pokemon'], colors: { main: '#F8D030', second: '#E03020', line: '#2A1A0A', light: '#FFF6C0' }, pattern: { kind: 'backstripes', color: 'line', on: ['body'] }, face: 'pikachu', suit: true },
  { id: 'mario', name: 'Mario', words: ['mario', 'super mario'], colors: { main: '#E52521', second: '#2B4AC8', line: '#5A0A0A', light: '#F5D021' }, armor: { legs: 'second', belt: 'second', sides: 'second', boots: 'line' }, emblem: 'buttons', suit: true },
  { id: 'luigi', name: 'Luigi', words: ['luigi'], colors: { main: '#2E9E3A', second: '#2B4AC8', line: '#0A3A10', light: '#F5D021' }, armor: { legs: 'second', belt: 'second', sides: 'second', boots: 'line' }, emblem: 'buttons', suit: true },
  { id: 'sonic', name: 'Sonic', words: ['sonic', 'igel'], colors: { main: '#1E5BD8', second: '#F1C27D', line: '#0A1A4A', light: '#F5F5F5' }, armor: { sides: 'second', boots: 'line' }, suit: true },
  { id: 'minion', name: 'Minion', words: ['minion', 'minions'], colors: { main: '#F5D33A', second: '#2E5BA8', line: '#2A2A2A', light: '#C8CCD2' }, armor: { legs: 'second', belt: 'second', boots: 'line' }, face: 'goggle', suit: true },
  { id: 'ruffy', name: 'Ruffy', words: ['ruffy', 'luffy', 'strohhut', 'one piece', 'onepiece'], colors: { main: '#C8202A', second: '#2C5AA8', line: '#5A0A10', light: '#E8C46A' }, armor: { head: 'light', legs: 'second', belt: 'light', boots: 'line', sides: 'main' } },
  { id: 'naruto', name: 'Naruto', words: ['naruto'], colors: { main: '#F57C00', second: '#1C2A5A', line: '#5A2A00', light: '#F2F2F2' }, armor: { sides: 'second', head: 'second' } },
  { id: 'goku', name: 'Goku', words: ['goku', 'dragonball', 'dragon ball'], colors: { main: '#F57C00', second: '#1C3FA8', line: '#5A2A00', light: '#F2F2F2' }, armor: { belt: 'second', boots: 'second', sides: 'main' } },
  { id: 'elsa', name: 'Eiskönigin', words: ['elsa', 'eiskoenigin', 'frozen'], colors: { main: '#8FD3FF', second: '#E8F8FF', line: '#3A8FC8', light: '#FFFFFF' }, pattern: { kind: 'sparkle', color: 'light', on: ['head', 'body', 'arms', 'legs', 'boots', 'belt'] } },
  { id: 'barbie', name: 'Barbie', words: ['barbie'], colors: { main: '#FF5FB0', second: '#FFD1E8', line: '#A0205A', light: '#FFFFFF' }, pattern: { kind: 'sparkle', color: 'light', on: ['body', 'legs'] } },
  { id: 'halloween', name: 'Halloween', words: ['halloween', 'kuerbis', 'pumpkin', 'gruselig', 'spooky'], colors: { main: '#F07800', second: '#1A1A1E', line: '#3A1A00', light: '#FFD060' }, armor: { sides: 'second', legs: 'second', boots: 'second' }, face: 'pumpkin' },
  { id: 'weihnachten', name: 'Weihnachten', words: ['weihnachten', 'christmas', 'xmas', 'weihnachtsmann', 'nikolaus', 'santa'], colors: { main: '#C8202A', second: '#F5F5F5', line: '#1E6A2E', light: '#FFFFFF' }, armor: { belt: 'line', boots: 'line' }, pattern: { kind: 'bands', color: 'second', on: ['arms', 'legs', 'boots'] } },
  { id: 'feuer', name: 'Feuer', words: ['feuer', 'fire', 'flammen', 'flamme', 'brennend', 'inferno', 'phoenix', 'phoenix'], colors: { main: '#E8400C', second: '#FFD000', line: '#5A0A00', light: '#FFF4B0' }, pattern: { kind: 'flames', color: 'second', on: ['head', 'body', 'arms', 'legs', 'boots', 'belt', 'item', 'block'] } },
  { id: 'eis', name: 'Eis', words: ['eis', 'ice', 'frost', 'gefroren', 'frozen', 'eisig', 'winter', 'schnee', 'snow'], colors: { main: '#9FE3FF', second: '#FFFFFF', line: '#3A8FC8', light: '#FFFFFF' }, pattern: { kind: 'cracks', color: 'second', on: ['head', 'body', 'arms', 'legs', 'boots', 'block'] } },
  { id: 'lava', name: 'Lava', words: ['lava', 'magma', 'vulkan', 'volcano'], colors: { main: '#2E1A12', second: '#FF6A00', line: '#FFD000', light: '#FFD000' }, pattern: { kind: 'cracks', color: 'second', on: ['head', 'body', 'arms', 'legs', 'boots', 'belt', 'block', 'item'] } },
  { id: 'wasser', name: 'Wasser', words: ['wasser', 'water', 'ozean', 'ocean', 'meer', 'aqua', 'atlantis'], colors: { main: '#2A7FD4', second: '#9FE8FF', line: '#123A7A', light: '#E0FAFF' }, pattern: { kind: 'waves', color: 'second', on: ['head', 'body', 'arms', 'legs', 'boots', 'block'] } },
  { id: 'natur', name: 'Natur', words: ['natur', 'nature', 'wald', 'forest', 'dschungel', 'jungle', 'blaetter', 'pflanzen', 'elfe'], colors: { main: '#3E8E2E', second: '#7A5230', line: '#1E4A16', light: '#9BE07A' }, armor: { legs: 'second', boots: 'second', belt: 'second' }, pattern: { kind: 'dots', color: 'light', on: ['head', 'body', 'arms', 'block'] } },
  { id: 'wueste', name: 'Wüste', words: ['wueste', 'desert', 'aegypten', 'pharao', 'mumie'], colors: { main: '#D8B878', second: '#2A7FD4', line: '#7A5A2A', light: '#F2E2B0' }, emblem: 'eye' },
  { id: 'galaxie', name: 'Galaxie', words: ['galaxie', 'galaxy', 'weltall', 'weltraum', 'space', 'sterne', 'kosmos', 'universum', 'nacht', 'night'], colors: { main: '#1A1040', second: '#6A2FBF', line: '#0A0620', light: '#FFFFFF' }, pattern: { kind: 'stars', color: 'light', on: ['head', 'body', 'arms', 'legs', 'boots', 'belt', 'block', 'item'] }, nebula: true },
  { id: 'regenbogen', name: 'Regenbogen', words: ['regenbogen', 'rainbow', 'bunt', 'colorful', 'pride'], colors: { main: '#FF3030', second: '#3080FF', line: '#2A2A2A', light: '#FFFFFF' }, rainbow: true },
  { id: 'neon', name: 'Neon', words: ['neon', 'cyber', 'cyberpunk', 'leuchtend', 'glow', 'synthwave'], colors: { main: '#14141E', second: '#00FFC8', line: '#FF2BD6', light: '#00FFC8' }, pattern: { kind: 'edges', color: 'second', on: ['head', 'body', 'arms', 'legs', 'boots', 'belt', 'block', 'item'] } },
  { id: 'kristall', name: 'Kristall', words: ['kristall', 'crystal', 'amethyst', 'edelstein', 'juwel', 'diamanten'], colors: { main: '#9A5CC6', second: '#E3B8FF', line: '#4A1A70', light: '#FFFFFF' }, pattern: { kind: 'sparkle', color: 'light', on: ['head', 'body', 'arms', 'legs', 'boots', 'block', 'item'] } },
  { id: 'sakura', name: 'Kirschblüte', words: ['kirschbluete', 'sakura', 'cherry', 'kirsche', 'blumen', 'blume', 'fruehling'], colors: { main: '#F7A8C8', second: '#FFFFFF', line: '#B05A80', light: '#FFF0F6' }, pattern: { kind: 'flowers', color: 'second', on: ['head', 'body', 'arms', 'legs', 'block'] } },
  { id: 'tarnung', name: 'Tarnung', words: ['tarnung', 'tarnmuster', 'camouflage', 'camo', 'militaer', 'soldat', 'army', 'armee'], colors: { main: '#5A6B3A', second: '#3A4A2A', line: '#2A2A1A', light: '#8A8A5A' }, pattern: { kind: 'camo', color: 'second', on: ['head', 'body', 'arms', 'legs', 'boots', 'belt', 'block', 'item'] } },
  { id: 'tiger', name: 'Tiger', words: ['tiger'], colors: { main: '#F08A1E', second: '#F5F0E0', line: '#1A1210', light: '#FFF6E0' }, pattern: { kind: 'tiger', color: 'line', on: ['head', 'body', 'arms', 'legs', 'boots', 'block', 'item'] } },
  { id: 'zebra', name: 'Zebra', words: ['zebra'], colors: { main: '#F2F2F2', second: '#1A1A1E', line: '#1A1A1E', light: '#FFFFFF' }, pattern: { kind: 'tiger', color: 'line', on: ['head', 'body', 'arms', 'legs', 'boots', 'block', 'item'] } },
  { id: 'leopard', name: 'Leopard', words: ['leopard', 'gepard', 'jaguar'], colors: { main: '#E0B050', second: '#7A4A1A', line: '#2A1A0A', light: '#F5E0A0' }, pattern: { kind: 'spots', color: 'line', on: ['head', 'body', 'arms', 'legs', 'boots', 'block', 'item'] } },
  { id: 'schatten', name: 'Schatten', words: ['schatten', 'shadow', 'finster', 'vampir', 'vampire', 'dunkelheit'], colors: { main: '#22222C', second: '#5A1A2A', line: '#0A0A10', light: '#C8102E' }, pattern: { kind: 'edges', color: 'second', on: ['head', 'body', 'arms', 'legs'] } },
  { id: 'gold', name: 'Gold', words: ['goldig', 'reich', 'luxus', 'luxury', 'schatz'], colors: { main: '#F2C230', second: '#FFF2A0', line: '#8A5A00', light: '#FFFBE0' }, pattern: { kind: 'sparkle', color: 'light', on: ['head', 'body', 'arms', 'legs', 'boots', 'block', 'item'] } },
];

/** Muster-Woerter (ueberschreiben das Muster des Stils) */
export const PATTERN_WORDS = {
  streifen: 'bands', gestreift: 'bands', stripes: 'bands', striped: 'bands', netz: 'web', spinnennetz: 'web', web: 'web',
  punkte: 'dots', gepunktet: 'dots', dots: 'dots', tupfen: 'spots', flecken: 'spots', kariert: 'checker', karo: 'checker', checker: 'checker', schachbrett: 'checker',
  sterne: 'stars', stars: 'stars', sternen: 'stars', flammen: 'flames', flames: 'flames', tarnmuster: 'camo', camo: 'camo', glitzer: 'sparkle', sparkle: 'sparkle',
  wellen: 'waves', wellig: 'waves', waves: 'waves', risse: 'cracks', rissig: 'cracks', cracks: 'cracks', blumen: 'flowers', blumig: 'flowers', platten: 'panels', panzerplatten: 'panels',
  zickzack: 'chevrons', zacken: 'chevrons', rand: 'edges', umrandet: 'edges',
};

/** Ruestungs-Material: Wort -> { eq: Ausruestungs-Datei, icon: Item-Praefix, old: alte Rüstungsdatei } */
export const MATERIALS = {
  kupfer: 'copper', copper: 'copper', eisen: 'iron', iron: 'iron', gold: 'gold', golden: 'gold', diamant: 'diamond', diamond: 'diamond', dia: 'diamond',
  netherit: 'netherite', netherite: 'netherite', leder: 'leather', leather: 'leather', kette: 'chainmail', ketten: 'chainmail', chainmail: 'chainmail', kettenhemd: 'chainmail',
  eisern: 'iron', kupfern: 'copper', steinern: 'stone', ledern: 'leather', diamanten: 'diamond', schildkroete: 'turtle', turtle: 'turtle', holz: 'wood', wood: 'wood', hoelzern: 'wood', stein: 'stone', stone: 'stone',
};
const ICON_MAT = { gold: 'golden', wood: 'wooden', turtle: 'turtle', copper: 'copper', iron: 'iron', diamond: 'diamond', netherite: 'netherite', leather: 'leather', chainmail: 'chainmail', stone: 'stone' };
const MAT_NAME = { copper: 'Kupfer', iron: 'Eisen', gold: 'Gold', diamond: 'Diamant', netherite: 'Netherit', leather: 'Leder', chainmail: 'Ketten', turtle: 'Schildkröten', wood: 'Holz', stone: 'Stein' };

const ARMOR_WORDS = ['ruestung', 'ruestungen', 'armor', 'armour', 'anzug', 'kostuem', 'outfit', 'set', 'panzer', 'ausruestung', 'kleidung', 'skin', 'suit', 'kostume'];
export const PIECES = { helm: 'helmet', helmet: 'helmet', kappe: 'helmet', muetze: 'helmet', maske: 'helmet', mask: 'helmet', hut: 'helmet', kopf: 'helmet',
  brustpanzer: 'chestplate', brustplatte: 'chestplate', chestplate: 'chestplate', weste: 'chestplate', jacke: 'chestplate', oberteil: 'chestplate', shirt: 'chestplate', brust: 'chestplate',
  hose: 'leggings', hosen: 'leggings', beinschutz: 'leggings', leggings: 'leggings', beinschienen: 'leggings',
  schuhe: 'boots', stiefel: 'boots', boots: 'boots', schuh: 'boots' };
export const TOOLS = { schwert: 'sword', sword: 'sword', klinge: 'sword', spitzhacke: 'pickaxe', picke: 'pickaxe', pickaxe: 'pickaxe', axt: 'axe', axe: 'axe', beil: 'axe',
  schaufel: 'shovel', spaten: 'shovel', shovel: 'shovel', hacke: 'hoe', hoe: 'hoe', aexte: 'axe', schwerter: 'sword', klingen: 'sword', werkzeug: 'tools', werkzeuge: 'tools', tools: 'tools', waffen: 'weapons' };
const XP_ORB = ['entity/experience/experience_orb.png', 'entity/experience_orb.png'];
const POTIONS = ['item/potion.png', 'item/splash_potion.png', 'item/lingering_potion.png'];
const BOSS = ['gui/sprites/boss_bar/purple_background.png', 'gui/sprites/boss_bar/purple_progress.png'];
const BUTTONS = ['gui/sprites/widget/button.png', 'gui/sprites/widget/button_highlighted.png', 'gui/sprites/widget/button_disabled.png'];
const GLINT = ['misc/enchanted_glint_item.png', 'misc/enchanted_glint_armor.png'];
const XPBAR = ['gui/sprites/hud/experience_bar_background.png', 'gui/sprites/hud/experience_bar_progress.png'];
const HEARTS = ['gui/sprites/hud/heart/full.png', 'gui/sprites/hud/heart/half.png', 'gui/sprites/hud/heart/full_blinking.png', 'gui/sprites/hud/heart/half_blinking.png'];
const SINGLE_ITEMS = {
  bogen: ['item/bow.png', 'item/bow_pulling_0.png', 'item/bow_pulling_1.png', 'item/bow_pulling_2.png'], bow: ['item/bow.png'],
  armbrust: ['item/crossbow_standby.png', 'item/crossbow_pulling_0.png', 'item/crossbow_pulling_1.png', 'item/crossbow_pulling_2.png', 'item/crossbow_arrow.png'],
  dreizack: ['item/trident.png'], trident: ['item/trident.png'], streitkolben: ['item/mace.png'], keule: ['item/mace.png'], mace: ['item/mace.png'], angel: ['item/fishing_rod.png'],
  pfeil: ['item/arrow.png'], pfeile: ['item/arrow.png'], elytra: ['item/elytra.png', 'entity/equipment/wings/elytra.png'], fluegel: ['item/elytra.png', 'entity/equipment/wings/elytra.png'],
  hotbar: ['gui/sprites/hud/hotbar.png', 'gui/sprites/hud/hotbar_selection.png', 'gui/sprites/hud/hotbar_offhand_left.png', 'gui/sprites/hud/hotbar_offhand_right.png'], schnellleiste: ['gui/sprites/hud/hotbar.png', 'gui/sprites/hud/hotbar_selection.png'],
  xp: XPBAR, erfahrung: XPBAR, xpleiste: XPBAR, erfahrungsleiste: XPBAR, levelleiste: XPBAR,
  herzen: HEARTS, herz: HEARTS.slice(0, 2), hearts: HEARTS.slice(0, 2), leben: HEARTS.slice(0, 2), lebensanzeige: HEARTS,
  hunger: ['gui/sprites/hud/food_full.png', 'gui/sprites/hud/food_half.png'], essen: ['gui/sprites/hud/food_full.png', 'gui/sprites/hud/food_half.png'],
  xpkugel: XP_ORB, xpkugeln: XP_ORB, xpball: XP_ORB, xpballs: XP_ORB, xporb: XP_ORB, xporbs: XP_ORB, orbs: XP_ORB, orb: XP_ORB, kugeln: XP_ORB,
  erfahrungskugel: XP_ORB, erfahrungskugeln: XP_ORB, erfahrungsorbs: XP_ORB, erfahrungspunkte: XP_ORB,
  xpflasche: ['item/experience_bottle.png'], erfahrungsflasche: ['item/experience_bottle.png'],
  feuerblock: ['block/fire_0.png', 'block/fire_1.png'], lagerfeuer: ['block/campfire_fire.png', 'block/campfire_log_lit.png'], seelenfeuer: ['block/soul_fire_0.png', 'block/soul_fire_1.png'],
  totem: ['item/totem_of_undying.png'], trank: POTIONS, traenke: POTIONS, potion: POTIONS, zaubertrank: POTIONS,
  enderperle: ['item/ender_pearl.png'], netherstern: ['item/nether_star.png'], lohenrute: ['item/blaze_rod.png'], feuerkugel: ['item/fire_charge.png'], herzdesmeeres: ['item/heart_of_the_sea.png'],
  portal: ['block/nether_portal.png'], netherportal: ['block/nether_portal.png'], lavablock: ['block/lava_still.png', 'block/lava_flow.png'], wasserblock: ['block/water_still.png', 'block/water_flow.png'],
  inventar: ['gui/container/inventory.png'], bossleiste: BOSS, bossbar: BOSS, ruestungsleiste: ['gui/sprites/hud/armor_full.png', 'gui/sprites/hud/armor_half.png', 'gui/sprites/hud/armor_empty.png'],
  fadenkreuz: ['gui/sprites/hud/crosshair.png'], knoepfe: BUTTONS, knopf: BUTTONS, buttons: BUTTONS, glanz: GLINT, verzauberung: GLINT, verzauberungsglanz: GLINT, glint: GLINT,
  eisblock: ['block/ice.png', 'block/packed_ice.png'], diamantblock: ['block/diamond_block.png'], goldblock: ['block/gold_block.png'], eisenblock: ['block/iron_block.png'], smaragdblock: ['block/emerald_block.png'],
  kupferblock: ['block/copper_block.png'], netheritblock: ['block/netherite_block.png'], leuchtstein: ['block/glowstone.png'], meerlaterne: ['block/sea_lantern.png'], redstoneblock: ['block/redstone_block.png'],
  gemaelde: ['painting/kebab.png'], kebab: ['painting/kebab.png'],
};
/** Deutsch -> englischer Dateiname fuer die freie Suche */
const DE_EN = { stein: 'stone', erde: 'dirt', gras: 'grass_block', grasblock: 'grass_block', holz: 'planks', bretter: 'planks', stamm: 'log', glas: 'glass', wolle: 'wool', ziegel: 'bricks', sand: 'sand', kies: 'gravel',
  erz: 'ore', kohle: 'coal', smaragd: 'emerald', apfel: 'apple', goldapfel: 'golden_apple', brot: 'bread', fackel: 'torch', truhe: 'chest', ofen: 'furnace', werkbank: 'crafting_table', bett: 'bed', tuer: 'door',
  schwein: 'pig', kuh: 'cow', schaf: 'sheep', huhn: 'chicken', spinne: 'spider', pferd: 'horse', katze: 'cat', wolf: 'wolf', dorfbewohner: 'villager', schleim: 'slime', blatt: 'leaves', blaetter: 'leaves',
  schild: 'shield', buch: 'book', karte: 'map', kompass: 'compass', uhr: 'clock', diamanterz: 'diamond_ore', obsidian: 'obsidian', tnt: 'tnt', kaktus: 'cactus', kuerbis: 'pumpkin', melone: 'melon',
  hexe: 'witch', lohe: 'blaze', ghast: 'ghast', wither: 'wither', eisengolem: 'iron_golem', golem: 'iron_golem', schneegolem: 'snow_golem', fuchs: 'fox', panda: 'panda', papagei: 'parrot', axolotl: 'axolotl',
  biene: 'bee', frosch: 'frog', ziege: 'goat', lama: 'llama', delfin: 'dolphin', waechter: 'guardian', phantom: 'phantom', piglin: 'piglin', hoglin: 'hoglin', warden: 'warden', enderdrache: 'dragon',
  netherrack: 'netherrack', endstein: 'end_stone', prismarin: 'prismarine', quarz: 'quartz_block', beton: 'concrete', terrakotta: 'terracotta', bruchstein: 'cobblestone', bambus: 'bamboo', pilz: 'mushroom',
  laterne: 'lantern', glocke: 'bell', amboss: 'anvil', fass: 'barrel', schneeball: 'snowball', ei: 'egg', karotte: 'carrot', kartoffel: 'potato', keks: 'cookie', kuchen: 'cake', fisch: 'cod', knochen: 'bone',
  feder: 'feather', faden: 'string', leder: 'leather', smaragde: 'emerald', diamanten: 'diamond', goldbarren: 'gold_ingot', eisenbarren: 'iron_ingot', kupferbarren: 'copper_ingot', redstone: 'redstone' };
/** Mobs, die auch ein Stil sind: mit einem zweiten Stil wird der Mob zum Ziel ("Creeper im Feuer-Stil") */
const MOB_TARGET = { creeper: ['entity/creeper/creeper.png'], zombie: ['entity/zombie/zombie.png'], skelett: ['entity/skeleton/skeleton.png'], enderman: ['entity/enderman/enderman.png'] };
const FILLER = new Set(['leiste', 'balken', 'bar', 'als', 'aus', 'mit', 'und', 'eine', 'einer', 'ein', 'einen', 'einem', 'der', 'die', 'das', 'den', 'dem', 'des', 'was', 'wie', 'soll', 'sein', 'mach', 'mache', 'machen', 'mir', 'mal', 'bitte',
  'im', 'in', 'zu', 'fuer', 'von', 'vom', 'auf', 'style', 'stil', 'look', 'design', 'thema', 'textur', 'texturen', 'so', 'dass', 'es', 'ist', 'aussieht', 'aussehen', 'sieht', 'ich', 'will', 'moechte', 'haette', 'gerne', 'gern',
  'the', 'a', 'an', 'of', 'with', 'like', 'make', 'ganz', 'nur', 'auch', 'noch', 'neue', 'neuen', 'neues', 'neu', 'coole', 'cool', 'cooles', 'coolen', 'schoene', 'schoen', 'schoenes', 'version', 'alle', 'komplette', 'kompletten', 'ganze', 'ganzen',
  'drauf', 'darauf', 'aufdruck', 'emblem', 'logo', 'symbol', 'zeichen', 'motiv', 'kann', 'koennte', 'sollte', 'dann', 'aber', 'oder', 'sehr', 'richtig', 'mega', 'super', 'echt', 'einfach', 'irgendwie', 'etwas', 'bisschen',
  'kugel', 'block', 'bloecke', 'item', 'items', 'teil', 'teile', 'sachen', 'ding', 'dinge', 'vom', 'zum', 'zur', 'am', 'beim', 'nach', 'ueber', 'unter', 'dazu', 'wird', 'werden', 'hat', 'haben', 'bitteschoen']);
/** Woerter, die eine Animation wollen -> Art der Bewegung */
const ANIM_WORDS = { animiert: 'auto', animation: 'auto', animationen: 'auto', animieren: 'auto', bewegt: 'auto', bewegend: 'auto', bewegung: 'auto', lebendig: 'auto', animated: 'auto',
  flackernd: 'burn', flackert: 'burn', flackern: 'burn', brennend: 'burn', brennende: 'burn', brennendes: 'burn', brennenden: 'burn', brennt: 'burn', lodernd: 'burn', flammend: 'burn', burning: 'burn',
  leuchtend: 'pulse', leuchtende: 'pulse', leuchtendes: 'pulse', leuchtet: 'pulse', gluehend: 'pulse', gluehende: 'pulse', gluehendes: 'pulse', glueht: 'pulse', pulsierend: 'pulse', pulsiert: 'pulse', glowing: 'pulse',
  blinkend: 'blink', blinkt: 'blink', glitzernd: 'sparkle', glitzernde: 'sparkle', glitzert: 'sparkle', funkelnd: 'sparkle', funkelnde: 'sparkle', funkelt: 'sparkle', schimmernd: 'shine', schimmert: 'shine',
  fliessend: 'flow', fliesst: 'flow', wabernd: 'flow', flowing: 'flow', wellend: 'wave' };
/** Zusaetze, die den Stil veraendern */
const MOD_WORDS = { hell: 'light', helle: 'light', heller: 'light', hellen: 'light', helles: 'light', dunkel: 'dark', dunkle: 'dark', dunkler: 'dark', dunklen: 'dark', dunkles: 'dark',
  rostig: 'rust', rostige: 'rust', verrostet: 'rust', alt: 'rust', alte: 'rust', altes: 'rust', kaputt: 'rust', verwittert: 'rust', glaenzend: 'shiny', glaenzende: 'shiny', metallisch: 'shiny', poliert: 'shiny',
  matt: 'matt', blass: 'matt', kraeftig: 'vivid', knallig: 'vivid', knallige: 'vivid', grell: 'vivid' };
const PICTURE_WORDS = new Set(['pixelbild', 'pixelart', 'bild', 'zeichnung', 'gemalt', 'malerei', 'poster', 'kunstwerk', 'zeichne', 'male']);
/** Aufloesung: Wort -> Faktor */
const SCALE_WORDS = { hd: 2, hochaufloesend: 2, detailliert: 2, detailreich: 2, feiner: 2, doppelt: 2, doppelte: 2, doppelter: 2, zweifach: 2, vierfach: 4, vierfache: 4, achtfach: 8, achtfache: 8, ultra: 4, uhd: 4 };
const MOTIF_CONTEXT = new Set(['mit', 'drauf', 'darauf', 'aufdruck', 'emblem', 'logo', 'symbol', 'zeichen', 'motiv', 'von', 'vom', 'einem', 'einer', 'eines']);

// alle bekannten Woerter (fuer das Zerlegen zusammengesetzter Woerter wie "eisschwert", "kupferruestung" und fuer Tippfehler)
const VOCAB = new Set([
  ...Object.keys(COLOR_WORDS), ...Object.keys(PATTERN_WORDS), ...Object.keys(MATERIALS), ...Object.keys(PIECES), ...Object.keys(TOOLS), ...Object.keys(SINGLE_ITEMS), ...Object.keys(DE_EN), ...ARMOR_WORDS,
  ...Object.keys(ANIM_WORDS), ...Object.keys(MOD_WORDS), ...PICTURE_WORDS, ...Object.keys(MOTIV_WORDS),
  ...STYLES.flatMap((s) => s.words.map((w) => norm(w).replace(/ /g, ''))),
].map((w) => norm(w).replace(/ /g, '')).filter(Boolean));
const VOCAB_LIST = [...VOCAB];

/** Zusammengesetztes Wort in bekannte Woerter zerlegen ("eisschwert" -> eis + schwert). null = geht nicht */
function split(token) {
  const best = new Array(token.length + 1).fill(null);
  best[0] = [];
  for (let i = 0; i < token.length; i++) {
    if (!best[i]) continue;
    for (let j = token.length; j > i; j--) {
      const part = token.slice(i, j);
      if ((VOCAB.has(part) || (part.length >= 3 && FILLER.has(part))) && (!best[j] || best[j].length > best[i].length + 1)) best[j] = [...best[i], part];
    }
    // Fugen-s: "erfahrungskugel" geht ueber das Woerterbuch, sonst ein s ueberspringen
    if (token[i] === 's' && i > 2 && !best[i + 1]) best[i + 1] = best[i];
  }
  return best[token.length] && best[token.length].length ? best[token.length] : null;
}

/** Abstand zweier Woerter (Tippfehler) */
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Ein Wort verstehen: genau, ohne Endung (Mehrzahl/Beugung), zusammengesetzt oder mit Tippfehler. Gibt Liste von Woertern zurueck. */
function resolve(t, fixes) {
  if (VOCAB.has(t) || FILLER.has(t)) return [t];
  const ends = ['en', 'er', 'es', 'em', 'e', 'n', 's', 'nen'];
  const bases = [t, ...ends.filter((e) => t.length > e.length + 2 && t.endsWith(e)).map((e) => t.slice(0, -e.length))];
  for (const b of bases.slice(1)) if (VOCAB.has(b)) return [b];
  // zusammengesetzt, auch mit Endung ("diamantschwerter" -> diamant + schwert)
  if (t.length > 5) for (const b of bases) { const parts = split(b); if (parts) return parts.filter((p) => !FILLER.has(p) || p.length > 3); }
  const typo = (w) => {
    if (w.length < 4) return null;
    const max = w.length >= 7 ? 2 : 1;
    let best = null, bd = max + 1;
    for (const v of VOCAB_LIST) {
      if (v[0] !== w[0] || v.length < 3) continue;
      const d = editDistance(w, v, max);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  };
  const whole = typo(t);
  if (whole) { fixes.push(`${t} → ${whole}`); return [whole]; }
  // Tippfehler im letzten Teil eines zusammengesetzten Wortes ("diamantschwerd" -> diamant + schwert)
  for (let i = 3; i <= t.length - 4; i++) {
    const head = VOCAB.has(t.slice(0, i)) ? [t.slice(0, i)] : split(t.slice(0, i));
    if (!head) continue;
    const tail = typo(t.slice(i));
    if (tail) { fixes.push(`${t} → ${head.join('')}${tail}`); return [...head, tail]; }
  }
  return [t];
}

/**
 * Wunsch verstehen. available: Set aller Texturpfade dieser Minecraft-Version. current: offene Textur (oder null).
 * Ergebnis: { style, targets, targetName, pieces, understood[], unknown[], notes[], motif, picture, animate, fixes[] }
 */
export function parsePrompt(text, available, current = null) {
  const raw = norm(text);
  const compact = raw.replace(/ /g, '');
  const understood = [], notes = [], fixes = [];
  // 1) Figuren/Stile mit mehreren Woertern zuerst (z. B. "iron man" soll nicht "Eisen" werden)
  let rest = ' ' + raw.replace(/\s+/g, ' ') + ' ';
  const styles = [];
  for (const s of STYLES) {
    for (const w of s.words) {
      const nw = norm(w).trim();
      if (!nw.includes(' ')) continue;
      if (rest.includes(' ' + nw + ' ') || compact.includes(nw.replace(/ /g, ''))) { styles.push(s); rest = rest.replace(nw, ' '); break; }
    }
  }
  // Mehrwort-Ziele ("xp kugeln", "xp balls", "herz des meeres")
  // Aufloesung aus dem Text: "32x32", "64 x 64", "64 Pixel", "2x"/"4x", "HD", "doppelte Aufloesung"
  let size = null, scale = null;
  const dims = rest.match(/ (\d{2,3}) ?(?:x|mal) ?(\d{2,3}) /);
  if (dims) { size = Number(dims[1]); rest = rest.replace(dims[0], ' '); }
  const pxw = !size && rest.match(/ (16|32|64|128|256|512) ?(?:pixel|px|p) /);
  if (pxw) { size = Number(pxw[1]); rest = rest.replace(pxw[0], ' '); }
  const fx = rest.match(/ ([248]) ?(?:x|fach|mal) /);
  if (fx && !size) { scale = Number(fx[1]); rest = rest.replace(fx[0], ' '); }
  for (const [w, f] of Object.entries(SCALE_WORDS)) if (rest.includes(' ' + w + ' ')) { scale = Math.max(scale || 1, f); rest = rest.replace(' ' + w + ' ', ' '); }
  rest = rest.replace(/ (aufloesung|resolution|pixeln?|px) /g, ' ');
  rest = rest.replace(/ xp (kugeln|kugel|balls|ball|orbs|orb) /g, ' xpkugeln ').replace(/ herz des meeres /g, ' herzdesmeeres ').replace(/ xp (leiste|bar) /g, ' xpleiste ');
  // 2) einzelne Woerter verstehen
  const tokens = [];
  for (const t of rest.split(' ').filter(Boolean)) tokens.push(...resolve(t, fixes));
  const colors = [], patterns = [], pieces = new Set(), tools = new Set(), items = [], unknown = [], mods = new Set();
  let material = null, materialWord = null, armor = false, motif = null, picture = false, animate = null, inventory = false;
  tokens.forEach((t, k) => {
    if (FILLER.has(t)) return;
    const ctx = MOTIF_CONTEXT.has(tokens[k - 1]) || MOTIF_CONTEXT.has(tokens[k - 2]) || ['drauf', 'darauf'].includes(tokens[k + 1]);
    if (PICTURE_WORDS.has(t)) { picture = true; return; }
    if (ANIM_WORDS[t]) { animate = animate && animate !== 'auto' ? animate : ANIM_WORDS[t]; return; }
    if (MOD_WORDS[t]) { mods.add(MOD_WORDS[t]); return; }
    // Motiv: im Zusammenhang ("mit Totenkopf", "Bild von einem Drachen") oder wenn das Wort sonst nichts bedeutet
    const mv = MOTIV_WORDS[t];
    const st = STYLES.find((s) => s.words.some((w) => norm(w).replace(/ /g, '') === t));
    const elsewhere = !!(st || SINGLE_ITEMS[t] || DE_EN[t] || PATTERN_WORDS[t] || TOOLS[t] || MATERIALS[t]);
    if (mv && (ctx || picture || !elsewhere)) { motif ||= mv; understood.push(t); return; }
    if (t === 'inventar' && !k) { inventory = true; }
    if (ARMOR_WORDS.includes(t)) { armor = true; return; }
    if (PIECES[t]) { pieces.add(PIECES[t]); armor = true; return; }
    if (TOOLS[t]) { tools.add(TOOLS[t]); return; }
    const mw = [t, t.slice(0, -1), t.slice(0, -2), t.slice(0, -3)].find((c) => c.length >= 4 && MATERIALS[c]) || null; // "goldene" -> golden
    if (mw && !st) { material = MATERIALS[mw]; materialWord = mw; return; }
    if (st && !styles.includes(st)) { styles.push(st); return; }
    if (st) return;
    const cw = COLOR_WORDS[t] || COLOR_WORDS[t.replace(/(e|en|er|es|em)$/, '')];
    if (cw) { colors.push(hex(cw)); return; }
    if (PATTERN_WORDS[t]) { patterns.push(PATTERN_WORDS[t]); return; }
    if (t === 'inventar') inventory = true;
    if (SINGLE_ITEMS[t]) { items.push(...SINGLE_ITEMS[t].filter((p) => available.has(p))); understood.push(t); return; }
    const found = findTextures(DE_EN[t] || t, available);
    if (found.length) { items.push(...found); understood.push(t); return; }
    if (t.length > 2) unknown.push(t);
  });
  // Material ohne Ruestung/Werkzeug: dann ist es eine Farbe ("goldenes Feuer") oder ein Block ("Lava Stein")
  if (material && !armor && !pieces.size && !tools.size) {
    const asColor = { gold: '#F2C230', copper: '#C8703A', diamond: '#4FE3E0', netherite: '#4A3F44', iron: '#C3C8D0' }[material];
    const found = findTextures(DE_EN[materialWord] || materialWord, available);
    if (found.length && !asColor) items.push(...found);
    else if (asColor) colors.push(hex(asColor));
    material = null;
  }
  // Mob als Ziel, wenn ein zweiter Stil/eine Farbe sagt, wie er aussehen soll ("Creeper im Feuer-Stil")
  if (!armor && !tools.size && !items.length) {
    const mob = styles.find((s) => MOB_TARGET[s.id]);
    if (mob && (styles.length > 1 || colors.length || patterns.length)) {
      items.push(...MOB_TARGET[mob.id].filter((p) => available.has(p)));
      styles.splice(styles.indexOf(mob), 1);
      understood.push(mob.name);
    }
  }
  // 3) Ziel bestimmen
  let targets = [], targetName = '', pieceList = null;
  if (armor || (pieces.size && !tools.size)) {
    const mat = material && ['copper', 'iron', 'gold', 'diamond', 'netherite', 'leather', 'chainmail', 'turtle'].includes(material) ? material : null;
    const m = mat || 'iron';
    if (!mat) notes.push(material ? `${MAT_NAME[material]} gibt es als Rüstung nicht – ich nehme Eisen.` : 'Keine Rüstungsart genannt – ich nehme die Eisenrüstung. (Sag z. B. „als Kupferrüstung“.)');
    const want = pieces.size ? [...pieces] : ['helmet', 'chestplate', 'leggings', 'boots'];
    targets.push(...armorPaths(m, want, available));
    targetName = (pieces.size && pieces.size < 4 ? want.map((p) => ({ helmet: 'Helm', chestplate: 'Brustpanzer', leggings: 'Hose', boots: 'Stiefel' }[p])).join(', ') + ' · ' : '') + `${MAT_NAME[m]}rüstung`;
    pieceList = want;
  }
  if (tools.size) {
    const mats = material ? [material] : ['diamond'];
    const list = tools.has('tools') || tools.has('weapons') ? ['sword', 'pickaxe', 'axe', 'shovel', 'hoe'] : [...tools];
    for (const tool of list) for (const mm of mats) {
      const p = `item/${ICON_MAT[mm] || mm}_${tool}.png`;
      if (available.has(p)) targets.push(p);
    }
    if (!material) notes.push('Kein Material genannt – ich nehme Diamant-Werkzeuge.');
    const toolName = list.length > 1 ? 'Werkzeuge' : { sword: 'Schwert', pickaxe: 'Spitzhacke', axe: 'Axt', shovel: 'Schaufel', hoe: 'Hacke' }[list[0]];
    targetName = targetName ? targetName + ' + ' + toolName : `${material ? MAT_NAME[material] : 'Diamant'}-${toolName}`;
  }
  // "Feuer-Animation im Inventar" ohne Item: die Items im Inventar sollen brennen
  if (inventory && animate && !targets.length && items.every((p) => p.startsWith('gui/container/'))) {
    items.length = 0;
    for (const p of ['item/diamond_sword.png']) if (available.has(p)) items.push(p);
    notes.push('Animiert werden die Item-Bilder im Inventar – ich nehme erstmal das Diamantschwert. Sag z. B. „brennende Spitzhacke“ für ein anderes.');
  }
  for (const p of items) if (available.has(p) && !targets.includes(p)) targets.push(p);
  if (items.length && !targetName) targetName = items.length === 1 ? pretty(items[0]) : `${items.length} Texturen`;
  if (!targets.length && picture) {
    const pic = current || [...available].find((p) => p === 'painting/kebab.png') || [...available].find((p) => p.startsWith('painting/'));
    if (pic) { targets = [pic]; targetName = current ? 'diese Textur (' + pretty(pic) + ')' : 'Gemälde „' + pretty(pic) + '“'; }
  }
  if (!targets.length && current) { targets = [current]; targetName = 'diese Textur (' + pretty(current) + ')'; }
  targets = [...new Set(targets)].filter((p) => available.has(p));
  if (targets.some((p) => /experience_orb/.test(p))) notes.push('Minecraft färbt XP-Kugeln beim Aufleuchten selbst grün-gelb ein – helle Farben und Muster wirken am besten.');
  if (animate && targets.some((p) => p.startsWith('entity/') || p.startsWith('misc/') || p.startsWith('gui/container/'))) notes.push('Rüstung am Körper, Mobs und Fenster kann Minecraft nicht als Bilderfolge abspielen – animiert werden nur Items, Blöcke und GUI-Bilder.');
  // 4) Stil zusammenbauen
  let style = null;
  if (styles.length) style = structuredClone(styles[0]);
  if (colors.length) {
    const c = colors.map(toHex);
    if (style) {
      // ganze Palette mitdrehen: "blaues Feuer" = blau mit hellblauen Flammen statt blau mit gelben
      const dh = hsl(colors[0])[0] - hsl(hex(style.colors.main))[0];
      const rot = (h) => { const [hh, ss, ll] = hsl(hex(h)); return toHex(fromHsl((hh + dh + 360) % 360, ss, ll)); };
      style.colors = { main: c[0], second: c[1] || rot(style.colors.second), line: rot(style.colors.line), light: rot(style.colors.light) };
      style.name += ' in ' + colorNames(colors);
    } else style = styleFromColors(colors);
  }
  if (style && styles.length > 1) { style.colors.second = styles[1].colors.main; style.name += ' + ' + styles[1].name; if (!style.pattern && styles[1].pattern) style.pattern = structuredClone(styles[1].pattern); }
  if (patterns.length) {
    // nur ein Muster genannt: eigene Farben der Textur behalten, Muster drueber
    style ||= { id: 'muster', name: 'Original mit Muster', colors: { main: '#8A8D93', second: '#FFFFFF', line: '#1A1A1E', light: '#FFFFFF' }, keepColors: true };
    style.pattern = { kind: patterns[0], color: ['flames', 'camo', 'waves', 'bands', 'cracks', 'flowers'].includes(patterns[0]) ? 'second' : ['stars', 'sparkle'].includes(patterns[0]) ? 'light' : 'line', on: ['head', 'body', 'arms', 'legs', 'boots', 'belt', 'block', 'item'] };
  }
  // nur ein Motiv/Animation/Zusatz genannt: Originalfarben behalten
  if (!style && (motif || animate || mods.size || picture || size || scale)) {
    const animName = { burn: 'Brennend', pulse: 'Leuchtend', sparkle: 'Glitzernd', shine: 'Schimmernd', flow: 'Fließend', wave: 'Wellig', blink: 'Blinkend', rainbow: 'Regenbogen', auto: 'Animiert' }[animate];
    const motifName = motif ? 'mit ' + motif.charAt(0).toUpperCase() + motif.slice(1) : '';
    const name = [animName, picture ? 'Pixelbild' : '', motifName].filter(Boolean).join(' ') || (size || scale ? 'Höhere Auflösung' : 'Originalfarben');
    style = { id: 'original', name, colors: { main: '#8A8D93', second: '#FFFFFF', line: '#1A1A1E', light: '#FFFFFF' }, keepColors: true };
  }
  if (style && animate === 'burn' && !styles.length && !colors.length) {
    // "brennendes Schwert": Feuerfarben fuer die Flammen, das Item behaelt seine Farben
    style.fire = true;
  }
  if (style && mods.size) applyMods(style, mods);
  if (style) understood.unshift(style.name);
  if (motif) understood.push('Motiv ' + motif);
  if (size || scale) understood.push(size ? `${size}×${size}` : `${scale}× Auflösung`);
  return { style, targets, targetName, pieces: pieceList, understood, unknown, notes, material, motif, picture, animate, fixes, mods: [...mods], size, scale };
}

/** hell/dunkel/kraeftig/matt auf alle Stilfarben, rostig/glaenzend als Malhinweis */
function applyMods(style, mods) {
  const adj = (h) => {
    let [hh, s, l] = hsl(hex(h));
    if (mods.has('light')) l = Math.min(0.92, l + 0.14);
    if (mods.has('dark')) l = Math.max(0.06, l - 0.16);
    if (mods.has('vivid')) s = Math.min(1, s + 0.2);
    if (mods.has('matt')) s = Math.max(0, s - 0.3);
    return toHex(fromHsl(hh, s, l));
  };
  for (const k of Object.keys(style.colors)) style.colors[k] = adj(style.colors[k]);
  if (mods.has('rust')) style.rust = true;
  if (mods.has('shiny')) style.shiny = true;
  const names = { light: 'hell', dark: 'dunkel', vivid: 'kräftig', matt: 'matt', rust: 'rostig', shiny: 'glänzend' };
  style.name += ' (' + [...mods].map((m) => names[m]).join(', ') + ')';
  style.mods = [...mods];
}

function colorNames(cols) { return cols.map((c) => Object.entries(COLOR_WORDS).find(([, h]) => toHex(hex(h)) === toHex(c))?.[0] || toHex(c)).join('/'); }
export function pretty(p) { return p.split('/').pop().replace(/\.png$/, '').replace(/_/g, ' '); }

/** Stil nur aus Farben (z. B. "rot blau") */
export function styleFromColors(cols) {
  const main = cols[0], [h, s, l] = hsl(main);
  const second = cols[1] || fromHsl((h + 200) % 360, Math.min(1, s * 0.8 + 0.1), Math.max(0.25, Math.min(0.6, l)));
  return { id: 'farben', name: colorNames(cols.slice(0, 2)), colors: { main: toHex(main), second: toHex(second), line: toHex(shade(main, -0.35)), light: toHex(shade(main, 0.3)) }, armor: { sides: 'second', belt: 'second' } };
}

/** Freie Suche nach Texturnamen (z. B. "creeper" -> entity/creeper/creeper.png) */
function findTextures(word, available) {
  if (word.length < 3) return [];
  const exact = [`block/${word}.png`, `item/${word}.png`, `entity/${word}/${word}.png`, `entity/${word}.png`].filter((p) => available.has(p));
  if (exact.length) return exact;
  const out = [];
  for (const p of available) {
    const name = p.split('/').pop().replace(/\.png$/, '');
    if (name === word || name.startsWith(word + '_') || name.endsWith('_' + word)) out.push(p);
    if (out.length >= 8) break;
  }
  return out;
}

/** Dateien einer Ruestung (neue "equipment"-Dateien oder alte "models/armor") */
export function armorPaths(mat, pieces, available) {
  const out = [];
  const eq = mat === 'turtle' ? 'turtle_scute' : mat;
  const layer1 = pieces.some((p) => p !== 'leggings'), layer2 = pieces.includes('leggings');
  if (available.has(`entity/equipment/humanoid/${eq}.png`)) {
    if (layer1) out.push(`entity/equipment/humanoid/${eq}.png`);
    if (layer2 && available.has(`entity/equipment/humanoid_leggings/${eq}.png`)) out.push(`entity/equipment/humanoid_leggings/${eq}.png`);
  } else {
    const old = mat === 'gold' ? 'gold' : mat;
    if (layer1 && available.has(`models/armor/${old}_layer_1.png`)) out.push(`models/armor/${old}_layer_1.png`);
    if (layer2 && available.has(`models/armor/${old}_layer_2.png`)) out.push(`models/armor/${old}_layer_2.png`);
  }
  for (const p of pieces) {
    const icon = `item/${ICON_MAT[mat] || mat}_${p}.png`;
    if (available.has(icon)) out.push(icon);
  }
  return out;
}

export const isArmorLayer = (p) => /^entity\/equipment\/humanoid(_leggings)?\//.test(p) || /^models\/armor\/.*_layer_[12]\.png$/.test(p);
const isLeggingsLayer = (p) => /humanoid_leggings\//.test(p) || /_layer_2\.png$/.test(p);

// ---------- Koerperteile auf der 64x32-Ruestungstextur ----------
const BOXES = [
  { part: 'head', x: 0, y: 0, w: 8, h: 8, d: 8 }, { part: 'hat', x: 32, y: 0, w: 8, h: 8, d: 8 },
  { part: 'body', x: 16, y: 16, w: 8, h: 12, d: 4 }, { part: 'arm', x: 40, y: 16, w: 4, h: 12, d: 4 }, { part: 'leg', x: 0, y: 16, w: 4, h: 12, d: 4 },
];
function faceAt(x, y) {
  for (const b of BOXES) {
    const faces = [
      ['top', b.x + b.d, b.y, b.w, b.d], ['bottom', b.x + b.d + b.w, b.y, b.w, b.d],
      ['right', b.x, b.y + b.d, b.d, b.h], ['front', b.x + b.d, b.y + b.d, b.w, b.h], ['left', b.x + b.d + b.w, b.y + b.d, b.d, b.h], ['back', b.x + 2 * b.d + b.w, b.y + b.d, b.w, b.h],
    ];
    for (const [face, fx, fy, fw, fh] of faces) {
      if (x >= fx && x < fx + fw && y >= fy && y < fy + fh) return { part: b.part, face, fx: x - fx, fy: y - fy, fw, fh, ox: fx, oy: fy };
    }
  }
  return null;
}
function roleOf(f, leggings) {
  if (f.part === 'head' || f.part === 'hat') return 'head';
  if (f.part === 'arm') return 'arms';
  if (f.part === 'leg') return leggings ? 'legs' : 'boots';
  if (leggings) return 'belt';
  return f.face === 'left' || f.face === 'right' ? 'sides' : 'body';
}
const PIECE_ROLES = { helmet: ['head'], chestplate: ['body', 'sides', 'arms'], leggings: ['legs', 'belt'], boots: ['boots'] };
const DEFAULT_ROLES = { head: 'main', body: 'main', sides: 'main', arms: 'main', legs: 'second', belt: 'second', boots: 'line' };

// ---------- Muster ----------
/** true = an dieser Stelle (fx,fy auf einer Flaeche fw x fh) gehoert Musterfarbe hin */
function patternAt(kind, fx, fy, fw, fh, seed, gx = fx, gy = fy) {
  switch (kind) {
    case 'web': {
      const cx = Math.floor(fw / 2), cy = Math.floor(fh * 0.4), dx = fx - cx, dy = fy - cy;
      const r = Math.hypot(dx, dy);
      if (dx === 0 || dy === 0) return true;
      if (Math.abs(dx) === Math.abs(dy) && fw > 4) return true;
      return r > 2 && Math.abs(r - Math.round(r / 3.2) * 3.2) < 0.3;
    }
    case 'bands': return gy % 4 === 1;
    case 'dots': return fx % 3 === 1 && fy % 3 === 1;
    case 'spots': return noise(gx, gy, seed + 7, 2.2) > 0.72;
    case 'checker': return ((fx >> 1) + (fy >> 1)) % 2 === 0;
    case 'stars': return hash2(gx, gy, seed) < 0.055;
    case 'sparkle': return hash2(gx, gy, seed + 3) < 0.07;
    case 'flames': { const hgt = fh * (0.35 + 0.35 * noise(gx, 0, seed + 11, 1.6)); return fh - 1 - fy < hgt; }
    case 'camo': return noise(gx, gy, seed + 5, 3) > 0.55;
    case 'waves': return (gy + Math.round(Math.sin(gx * 0.9) * 1.2) + 8) % 4 === 0;
    case 'cracks': { const n = noise(gx, gy, seed + 13, 2.4); return Math.abs(n - 0.5) < 0.06; }
    case 'flowers': return hash2(gx >> 1, gy >> 1, seed + 17) < 0.12 && (gx + gy) % 2 === 0;
    case 'panels': return (fx === 0 || fy === 0 || fx === fw - 1 || fy === fh - 1) ? false : fx % 4 === 0 && fy % 3 === 0;
    case 'chevrons': return (fy + Math.abs(fx - (fw - 1) / 2)) % 4 < 1;
    case 'tiger': { const n = noise(gx * 0.6, gy * 2.2, seed + 19, 2); return Math.abs(Math.sin((gx + n * 6) * 0.9)) > 0.92; }
    case 'ribs': return fy >= 2 && fy <= 8 && fy % 2 === 0 && Math.abs(fx - (fw - 1) / 2) > 0.6 && Math.abs(fx - (fw - 1) / 2) < fw / 2 - 0.5;
    case 'backstripes': return false;
    case 'bands_v': return gx % 4 === 1;
    case 'edges': return false; // eigene Behandlung (Rand der Form)
    case 'buttons': return Math.abs(fx - (fw - 1) / 2) < 0.6 && fy % 3 === 1;
    default: return false;
  }
}

// ---------- Embleme und Gesichter (Zeichen: # = line, o = second, w = light, m = main, k = schwarz, W = weiss) ----------
const EMBLEMS = {
  spider: ['#.#.#', '.###.', '#####', '.###.', '#.#.#'],
  spiderbig: ['w..w..w', '.w.w.w.', '..www..', 'wwwwwww', '..www..', '.w.w.w.', 'w..w..w'],
  bat: ['.wwwwww.', 'w#ww#w#w', 'w######w', '.ww##ww.'],
  super: ['wwwwwww', 'wooooow', '.wowww.', '..woo..', '...w...'],
  reactor: ['.ww.', 'wWWw', 'wWWw', '.ww.'],
  star: ['..w..', '.www.', 'wwwww', '.w.w.', 'w...w'],
  skull: ['.www.', 'wwwww', 'w#w#w', 'wwwww', '.w.w.'],
  crown: ['w.w.w', 'wwwww', 'wowow', 'wwwww'],
  cross: ['..o..', '..o..', 'ooooo', '..o..', '..o..', '..o..'],
  bolt: ['..ww', '.ww.', 'wwww', '.ww.', 'ww..'],
  buttons: ['w..w', '....', '....', 'w..w'],
  eye: ['.###.', '#oWo#', '.###.'],
};
const FACES = {
  mask: ['........', '##....##', '#W#..#W#', '#WW##WW#', '.#W..W#.', '........', '........', '........'],
  cowl: ['........', '........', '........', '.WW..WW.', '........', '........', '........', '........'],
  visor: ['........', '.oooooo.', '.ww..ww.', '.oooooo.', '..oooo..', '..o##o..', '..oooo..', '........'],
  deadpool: ['........', '##....##', '#W#..#W#', '##....##', '........', '........', '........', '........'],
  creeper: ['........', '.##..##.', '.##..##.', '...##...', '..####..', '..####..', '..#..#..', '........'],
  ender: ['........', '........', '........', '........', 'www..www', '........', '........', '........'],
  zombie: ['........', '........', '........', '.k#..#k.', '........', '..####..', '........', '........'],
  skull: ['........', '........', '.##..##.', '.##..##.', '...##...', '........', '.#.#.#..', '........'],
  ninja: ['........', '........', 'oooooooo', '.W#..#W.', 'oooooooo', '........', '........', '........'],
  glass: ['........', '.######.', '.#w####.', '.######.', '.######.', '........', '........', '........'],
  goggle: ['........', '........', '.wwwwww.', '#wkWWkw#', '.wwwwww.', '........', '..####..', '........'],
  pikachu: ['........', '........', '.##..##.', '.W#..W#.', '........', 'o..##..o', '........', '........'],
  pumpkin: ['........', '........', '.#....#.', '.##..##.', '........', '.######.', '..#..#..', '........'],
};

function legendColor(ch, st) {
  switch (ch) {
    case '#': return st.line; case 'o': return st.second; case 'w': return st.light; case 'm': return st.main;
    case 'k': return [20, 20, 22]; case 'W': return [245, 245, 245]; default: return null;
  }
}

// ---------- Malen ----------
function colorsOf(style) {
  const c = {};
  for (const k of ['main', 'second', 'line', 'light']) c[k] = hex(style.colors[k] || style.colors.main);
  return c;
}

/**
 * Alle Ziel-Texturen malen. sources: Map pfad -> { w, h, data } (Original), handle: Set der Stiel-Farben ("r,g,b").
 * opts: { seed, variant, image: { mode, motif8, motif16, source, paletteColors, keepShape } }
 * -> [{ path, w, h, data, frameH?, anim? }]
 */
export function render(plan, sources, handle = new Set(), opts = {}) {
  const style = plan.style, seed = opts.seed || 1, variant = opts.variant || 0;
  const st = colorsOf(style);
  const out = [];
  for (const path of plan.targets) {
    const orig = sources.get(path);
    if (!orig) continue;
    // Aufloesung: Original scharf vergroessern, dann in der neuen Groesse fein malen
    const f = scaleFor(path, orig, plan);
    const src = f > 1 ? upscale(orig, f) : orig;
    const libMotif = plan.motif ? motivPixels(plan.motif, 9 * f) : null;
    const kind = path.startsWith('block/') ? 'block' : path.startsWith('item/') ? 'item' : path.startsWith('painting/') ? 'painting' : 'other';
    let data;
    if (isArmorLayer(path)) {
      const s = src.w / 64;
      const motif = opts.image?.mode === 'motif' && opts.image.source ? pixelate(opts.image.source, 8 * s, 8 * s, opts.image.paletteColors?.slice(0, 8), { outline: false })
        : libMotif ? fitMotif(libMotif, 8 * s, 8 * s) : null;
      data = paintArmor(src, style, st, { leggings: isLeggingsLayer(path), pieces: plan.pieces || ['helmet', 'chestplate', 'leggings', 'boots'], seed, motif, variant });
    } else if (plan.picture && opts.image?.mode !== 'pixel') {
      data = paintPicture(src, style, st, { motif: plan.motif, seed });
    } else {
      const armorIcon = /_(helmet|chestplate|leggings|boots)\.png$/.test(path) && plan.pieces; // Motiv nur auf der Brust, nicht auf den kleinen Symbolen
      const motif16 = opts.image?.mode === 'motif' ? (f > 1 && opts.image.source ? pixelate(opts.image.source, 16 * f, 16 * f, opts.image.paletteColors?.slice(0, 8), { outline: true }) : opts.image.motif16) : null;
      data = paintGeneric(src, style, st, { kind, handle, seed, variant, motif: motif16, libMotif: armorIcon ? null : libMotif, pixelart: opts.image?.mode === 'pixel' ? opts.image : null });
    }
    refine(data, src.w, src.h, style.pattern?.kind);
    const res = { path, w: src.w, h: src.h, data };
    // Animation (nur wo Minecraft Bilderfolgen abspielt und das Original noch keine hat)
    const already = src.h > src.w && src.h % src.w === 0;
    if (plan.animate && canAnimate(path).ok && !already) {
      const fh = src.h, a = animateFrames(plan.animate, data, src.w, fh, style, st, seed);
      const n = a.frames.length, all = new Uint8ClampedArray(src.w * fh * 4 * n);
      a.frames.forEach((f, k) => all.set(f, k * src.w * fh * 4));
      Object.assign(res, { data: all, h: fh * n, frameH: fh, anim: { frametime: a.frametime, ...(a.interpolate ? { interpolate: true } : {}) } });
    }
    if (f > 1) res.scale = f;
    out.push(res);
  }
  return out;
}

/**
 * Wie stark vergroessern? plan.size = Wunschbreite in Pixeln ("32x32", "64 Pixel"), plan.scale = Faktor (2x, HD).
 * Nur Zweierpotenzen; Obergrenze 512 Pixel (Ruestung 256), GUI-Bilder bleiben (deren Raster haengt an der Groesse).
 */
export function scaleFor(path, src, plan) {
  if (path.startsWith('gui/') || path.startsWith('misc/')) return 1;
  let f = plan.scale || 1;
  if (plan.size) f = Math.max(1, Math.round(plan.size / src.w));
  f = 2 ** Math.round(Math.log2(Math.max(1, f)));
  const max = isArmorLayer(path) ? 256 : 512;
  while (f > 1 && src.w * f > max) f /= 2;
  return f;
}

/** Bild scharf (ohne Glaetten) um den Faktor f vergroessern */
export function upscale(img, f) {
  const w = img.w * f, h = img.h * f, data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = (Math.floor(y / f) * img.w + Math.floor(x / f)) * 4;
    data.set(img.data.subarray(s, s + 4), (y * w + x) * 4);
  }
  return { w, h, data };
}

/** Einzelbilder zu einem Sprite-Sheet (Raster, ohne Luecken – so laesst es sich wieder einlesen) */
export function spriteSheet(frames, w, fh, cols = Math.ceil(Math.sqrt(frames.length))) {
  const rows = Math.ceil(frames.length / cols), W = w * cols, H = fh * rows, data = new Uint8ClampedArray(W * H * 4);
  frames.forEach((f, k) => {
    const ox = (k % cols) * w, oy = Math.floor(k / cols) * fh;
    for (let y = 0; y < fh; y++) data.set(f.subarray(y * w * 4, (y + 1) * w * 4), ((oy + y) * W + ox) * 4);
  });
  return { w: W, h: H, data, cols, rows };
}

function lumRange(d, skip) {
  let lo = 1, hi = 0;
  for (let i = 0; i < d.length; i += 4) { if (!d[i + 3] || skip?.(i)) continue; const l = lum(d, i); lo = Math.min(lo, l); hi = Math.max(hi, l); }
  return hi - lo < 0.05 ? [lo - 0.3, hi + 0.3] : [lo, hi];
}

/** Zusaetze auf eine fertige Farbe: rostig (braune Flecken), glaenzend (staerkere Lichter) */
function finish(c, style, x, y, t, seed) {
  if (style.rust && noise(x, y, seed + 29, 2.2) > 0.62) c = mixC(c, [122, 66, 30], 0.55 + 0.2 * noise(x, y, seed + 31, 1));
  if (style.shiny) c = t > 0.7 ? mixC(c, [255, 255, 255], (t - 0.7) * 1.2) : t < 0.25 ? mixC(c, [0, 0, 0], (0.25 - t) * 0.8) : c;
  if (style.keepColors && style.mods) {
    let [hh, s, l] = hsl(c);
    if (style.mods.includes('light')) l = Math.min(0.95, l + 0.15);
    if (style.mods.includes('dark')) l = Math.max(0.04, l * 0.62);
    if (style.mods.includes('vivid')) s = Math.min(1, s + 0.2);
    if (style.mods.includes('matt')) s = Math.max(0, s - 0.3);
    c = fromHsl(hh, s, l);
  }
  return c;
}

function paintArmor(src, style, st, { leggings, pieces, seed, motif, variant }) {
  const { w, h } = src, s = w / 64, out = new Uint8ClampedArray(src.data);
  const allowed = new Set(pieces.flatMap((p) => PIECE_ROLES[p]));
  const [lo, hi] = lumRange(src.data);
  const roles = { ...DEFAULT_ROLES, ...(style.armor || {}) };
  // Entwurfs-Varianten: Farben etwas anders auf die Koerperteile verteilen
  if (variant === 1) { roles.arms = roles.sides === 'main' ? 'second' : roles.sides; roles.boots = roles.legs; }
  if (variant === 2) { roles.belt = 'line'; roles.sides = roles.sides === 'second' ? 'main' : 'second'; }
  const keepFree = [];
  if (!leggings && allowed.has('head') && style.face && FACES[style.face]) keepFree.push([8, 8, 8, 8]);
  if (!leggings && allowed.has('body') && (motif || (style.emblem && EMBLEMS[style.emblem]))) {
    const e = motif ? null : EMBLEMS[style.emblem], ew = e ? e[0].length : Math.ceil(motif.w / s), eh = e ? e.length : Math.ceil(motif.h / s);
    keepFree.push([20 + Math.floor((8 - ew) / 2) - 1, 20 + (e ? Math.max(1, Math.floor((7 - eh) / 2)) : 1) - 1, ew + 2, eh + 2]);
  }
  const free = (gx, gy) => keepFree.some(([x0, y0, rw, rh]) => gx >= x0 && gy >= y0 && gx < x0 + rw && gy < y0 + rh);
  const ramps = {};
  const rampFor = (key) => (ramps[key] ||= ramp(st[key]));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const f = faceAt(Math.floor(x / s), Math.floor(y / s));
    if (!f) continue;
    const role = roleOf(f, leggings);
    if (!allowed.has(role)) continue;
    const i = (y * w + x) * 4;
    const a = src.data[i + 3];
    // Ganzkoerper-Anzug: Kopf, Koerper und Arme ganz bedecken (nicht die aeussere Hut-Huelle)
    const fill = style.suit && f.part !== 'hat' && f.face !== 'bottom' && ['head', 'body', 'sides', 'arms', 'legs'].includes(role);
    if (!a && !fill) continue;
    const t = a ? clamp01((lum(src.data, i) - lo) / (hi - lo)) : 0.45 + 0.25 * noise(x, y, seed, 2);
    let r = rampFor(roles[role] || 'main');
    if (style.rainbow) r = ramp(fromHsl(((f.fx / Math.max(1, f.fw)) * 300 + (f.oy / s) * 7 + (seed - 1) * 40) % 360, 0.85, 0.55));
    let c = style.keepColors && a ? [src.data[i], src.data[i + 1], src.data[i + 2]] : pick(r, 0.15 + t * 0.85);
    if (style.nebula) c = mixC(c, hex(style.colors.second), noise(x, y, seed + 3, 3) * 0.6);
    const pat = style.pattern;
    if (pat && pat.on?.includes(role) && f.face !== 'top' && f.face !== 'bottom' && !free(Math.floor(x / s), Math.floor(y / s))) {
      const scaleF = s >= 2 ? Math.floor(s) : 1;
      if (pat.kind === 'edges') { if (isEdge(src.data, w, h, x, y)) c = st[pat.color]; }
      else if (patternAt(pat.kind, x - Math.round(f.ox * s), y - Math.round(f.oy * s), f.fw * scaleF, f.fh * scaleF, seed, x, y)) c = pat.color === 'second' || pat.color === 'light' ? pick(ramp(st[pat.color]), 0.3 + t * 0.6) : mixC(c, st[pat.color], 0.8);
    }
    c = finish(c, style, x, y, t, seed);
    out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = 255;
  }
  // Gesicht auf die Helm-Vorderseite, Motiv/Emblem auf die Brust
  if (!leggings && allowed.has('head') && style.face && FACES[style.face]) stamp(out, w, s, FACES[style.face], 8, 8, 8, 8, st, true);
  if (!leggings && allowed.has('body')) {
    if (motif) stampMotif(out, w, 1, motif, 20 * s + Math.floor((8 * s - motif.w) / 2), 21 * s, motif.w, motif.h); // Motiv in voller Aufloesung
    else if (style.emblem && EMBLEMS[style.emblem]) {
      const e = EMBLEMS[style.emblem], ew = e[0].length, eh = e.length;
      stamp(out, w, s, e, 20 + Math.floor((8 - ew) / 2), 20 + Math.max(1, Math.floor((7 - eh) / 2)), ew, eh, st, false);
    }
  }
  return out;
}

function isEdge(d, w, h, x, y) {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const xx = x + dx, yy = y + dy;
    if (xx < 0 || yy < 0 || xx >= w || yy >= h || !d[(yy * w + xx) * 4 + 3]) return true;
  }
  return false;
}
const mixC = (a, b, m) => [a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m, a[2] + (b[2] - a[2]) * m];

function stamp(out, w, s, grid, ox, oy, gw, gh, st) {
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const c = legendColor(grid[gy]?.[gx], st);
    if (!c) continue;
    for (let yy = 0; yy < s; yy++) for (let xx = 0; xx < s; xx++) {
      const i = (((oy + gy) * s + yy) * w + (ox + gx) * s + xx) * 4;
      out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = 255;
    }
  }
}

function stampMotif(out, w, s, motif, ox, oy, mw, mh) {
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    const j = (y * motif.w + x) * 4;
    if (x >= motif.w || y >= motif.h || motif.data[j + 3] < 128) continue;
    for (let yy = 0; yy < s; yy++) for (let xx = 0; xx < s; xx++) {
      const i = (((oy + y) * s + yy) * w + (ox + x) * s + xx) * 4;
      out[i] = motif.data[j]; out[i + 1] = motif.data[j + 1]; out[i + 2] = motif.data[j + 2]; out[i + 3] = 255;
    }
  }
}

/** Motiv auf seinen Inhalt zuschneiden und (nur wenn noetig) scharf verkleinern */
export function fitMotif(m, maxW, maxH) {
  let x0 = m.w, y0 = m.h, x1 = -1, y1 = -1;
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.data[(y * m.w + x) * 4 + 3] >= 128) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  if (x1 < 0) return m;
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, sc = Math.min(1, maxW / cw, maxH / ch);
  const w = Math.max(1, Math.round(cw * sc)), h = Math.max(1, Math.round(ch * sc)), data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = x0 + Math.min(cw - 1, Math.floor((x + 0.5) / sc)), sy = y0 + Math.min(ch - 1, Math.floor((y + 0.5) / sc));
    data.set(m.data.subarray((sy * m.w + sx) * 4, (sy * m.w + sx) * 4 + 4), (y * w + x) * 4);
  }
  return { w, h, data };
}

function paintGeneric(src, style, st, { kind, handle, seed, variant, motif, libMotif, pixelart }) {
  const { w, h } = src, out = new Uint8ClampedArray(src.data);
  if (pixelart) return pixelArtInto(src, pixelart);
  const isHandle = (i) => kind === 'item' && handle.has(`${src.data[i]},${src.data[i + 1]},${src.data[i + 2]}`);
  const [lo, hi] = lumRange(src.data, isHandle);
  const rMain = ramp(st.main), rSecond = ramp(st.second);
  const pat = style.pattern;
  const fh = Math.min(w, h); // Animierte Streifen: Muster pro Bild
  const accent = variant === 1 ? 0.78 : variant === 2 ? 0.93 : 0.86; // ab welcher Helligkeit die Zweitfarbe kommt
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (!src.data[i + 3] || isHandle(i)) continue;
    const t = clamp01((lum(src.data, i) - lo) / (hi - lo));
    let r = rMain;
    if (style.rainbow) r = ramp(fromHsl((((y % fh) / fh) * 300 + x * 3 + (seed - 1) * 40) % 360, 0.95, 0.58)); // Regenbogen von oben nach unten
    let c = style.keepColors ? [src.data[i], src.data[i + 1], src.data[i + 2]] : pick(r, 0.1 + t * 0.9);
    // Glanzlichter in der Zweitfarbe (Akzent)
    if (t > accent && !style.rainbow && !style.keepColors) c = pick(rSecond, 0.55 + (t - accent) * 3);
    if (style.nebula) c = mixC(c, st.second, noise(x, y, seed + 3, 4) * 0.5);
    if (pat && (pat.on?.includes(kind) || kind === 'other' || kind === 'painting')) {
      if (pat.kind === 'edges') { if (isEdge(src.data, w, h, x, y)) c = st[pat.color]; }
      else if (patternAt(pat.kind, x % w, y % fh, w, fh, seed)) c = pat.color === 'line' ? mixC(c, st.line, 0.75) : pick(ramp(st[pat.color]), 0.3 + t * 0.6);
    }
    if (motif) {
      const mx = Math.floor((x / w) * motif.w), my = Math.floor(((y % fh) / fh) * motif.h), j = (my * motif.w + mx) * 4;
      if (motif.data[j + 3] >= 128) c = mixC([motif.data[j], motif.data[j + 1], motif.data[j + 2]], c, 0.25 * (1 - t));
    }
    c = finish(c, style, x, y, t, seed);
    out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2];
  }
  // Motiv aus der Sammlung: Bloecke/Gemaelde in die Mitte, Items als Abzeichen in die freieste Ecke
  if (libMotif) {
    for (let f0 = 0; f0 < h; f0 += fh) {
      if (kind === 'item' || kind === 'other') {
        const m = fitMotif(libMotif, Math.max(5, Math.round(w * 0.45)), Math.max(5, Math.round(fh * 0.45)));
        const corners = [[0, 0], [w - m.w, 0], [0, fh - m.h], [w - m.w, fh - m.h]];
        let best = corners[0], bestFree = -1;
        for (const [cx, cy] of corners) {
          let freeN = 0;
          for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (!src.data[(((f0 + cy + y) * w) + cx + x) * 4 + 3]) freeN++;
          if (freeN > bestFree) { bestFree = freeN; best = [cx, cy]; }
        }
        pasteMotif(out, w, m, best[0], f0 + best[1]);
      } else {
        const m = fitMotif(libMotif, Math.round(w * 0.7), Math.round(fh * 0.7));
        pasteMotif(out, w, m, Math.floor((w - m.w) / 2), f0 + Math.floor((fh - m.h) / 2));
      }
    }
  }
  return out;
}

function pasteMotif(out, w, m, ox, oy) {
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const j = (y * m.w + x) * 4;
    if (m.data[j + 3] < 128) continue;
    const i = ((oy + y) * w + ox + x) * 4;
    if (i < 0 || i >= out.length) continue;
    out[i] = m.data[j]; out[i + 1] = m.data[j + 1]; out[i + 2] = m.data[j + 2]; out[i + 3] = 255;
  }
}

// ---------- Pixelbilder aus Worten ----------
const NIGHT_MOTIFS = new Set(['mond', 'stern', 'geist', 'fledermaus', 'rakete', 'schneeflocke']);
const GROUND_MOTIFS = new Set(['baum', 'pilz', 'blume', 'katze', 'kuerbis', 'drache', 'creeper']);
function paintPicture(src, style, st, { motif, seed }) {
  const { w, h } = src, fh = Math.min(w, h), out = new Uint8ClampedArray(w * h * 4);
  const night = NIGHT_MOTIFS.has(motif) || style.id === 'galaxie' || style.id === 'schatten';
  const top = night ? hex('#0E1030') : style.keepColors ? hex('#6FC0FF') : hex(style.colors.light);
  const bottom = night ? hex('#2A2060') : style.keepColors ? hex('#D8F2FF') : hex(style.colors.main);
  const ground = GROUND_MOTIFS.has(motif) ? Math.max(2, Math.round(fh * 0.2)) : 0;
  const pic = new Uint8ClampedArray(w * fh * 4);
  for (let y = 0; y < fh; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    // Himmel in Stufen (Pixel-Art statt weichem Verlauf)
    const band = Math.floor((y / fh) * 5) / 4;
    let c = mixC(top, bottom, band);
    if (night && hash2(x, y, seed + 41) < 0.05) c = [255, 255, 230];
    if (!night && style.pattern && patternAt(style.pattern.kind, x, y, w, fh, seed)) c = mixC(c, st[style.pattern.color] || st.line, 0.5);
    if (ground && y >= fh - ground) {
      const gy = y - (fh - ground);
      c = gy === 0 ? (night ? [40, 90, 40] : [92, 170, 60]) : mixC(night ? [60, 40, 30] : [120, 80, 45], [60, 40, 22], noise(x, y, seed + 5, 2) * 0.6);
    }
    pic[i] = c[0]; pic[i + 1] = c[1]; pic[i + 2] = c[2]; pic[i + 3] = 255;
  }
  if (motif && MOTIVE[motif]) {
    const base = motivPixels(motif, 9);
    const sc = Math.max(1, Math.floor((Math.min(w, fh) * 0.75) / 9));
    const big = motivPixels(motif, 9 * sc);
    const m = fitMotif(big, w - 2, fh - ground - 1);
    const ox = Math.floor((w - m.w) / 2), oy = ground ? fh - ground - m.h + Math.min(1, ground) : Math.floor((fh - m.h) / 2);
    // Schatten
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      if (m.data[(y * m.w + x) * 4 + 3] < 128) continue;
      const xx = ox + x + 1, yy = oy + y + 1;
      if (xx < w && yy < fh) { const i = (yy * w + xx) * 4; const c = mixC([pic[i], pic[i + 1], pic[i + 2]], [0, 0, 0], 0.3); pic[i] = c[0]; pic[i + 1] = c[1]; pic[i + 2] = c[2]; }
    }
    pasteMotif(pic, w, m, ox, oy);
    // grosse Bilder: Licht von oben links, Schatten unten rechts auf dem Motiv (sieht plastisch aus)
    if (sc >= 2) {
      for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
        const j = (y * m.w + x) * 4;
        if (m.data[j + 3] < 128) continue;
        const i = ((oy + y) * w + ox + x) * 4;
        const lx = x % sc, ly = y % sc, k = ((sc - 1 - lx) + (sc - 1 - ly)) / (2 * (sc - 1)) - 0.5; // innerhalb jedes Motiv-Pixels
        const g = (0.5 - (x / m.w + y / m.h) / 2) * 0.25 + k * 0.12;
        const c = g > 0 ? mixC([pic[i], pic[i + 1], pic[i + 2]], [255, 255, 255], g) : mixC([pic[i], pic[i + 1], pic[i + 2]], [0, 0, 0], -g);
        pic[i] = c[0]; pic[i + 1] = c[1]; pic[i + 2] = c[2];
      }
    }
    void base;
  }
  // grosse Bilder: Wolken am Taghimmel, Grasbueschel auf dem Boden
  if (fh >= 32) {
    for (let y = 0; y < fh - ground; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (!night && y < fh * 0.45 && noise(x * 0.5, y * 1.4, seed + 61, 3) > 0.7 && isSky(pic, i, top, bottom)) { pic[i] = 248; pic[i + 1] = 252; pic[i + 2] = 255; }
    }
    if (ground) for (let x = 0; x < w; x++) if (hash2(x, 7, seed + 71) < 0.35) {
      const i = ((fh - ground - 1) * w + x) * 4;
      if (isSky(pic, i, top, bottom)) { pic[i] = 70; pic[i + 1] = 150; pic[i + 2] = 50; }
    }
  }
  for (let f0 = 0; f0 < h; f0 += fh) out.set(pic.subarray(0, Math.min(pic.length, (h - f0) * w * 4)), f0 * w * 4);
  return out;
}

/** Ist dieses Pixel noch Himmel (nicht Motiv/Schatten)? */
function isSky(pic, i, top, bottom) {
  const c = [pic[i], pic[i + 1], pic[i + 2]];
  for (let k = 0; k <= 4; k++) { const s = mixC(top, bottom, k / 4); if (Math.abs(c[0] - Math.round(s[0])) + Math.abs(c[1] - Math.round(s[1])) + Math.abs(c[2] - Math.round(s[2])) < 6) return true; }
  return false;
}

// ---------- Animationen ----------
const FIRE_RAMP = ['#6A0A00', '#C8300A', '#FF7A1E', '#FFC21F', '#FFF3A0'].map(hex);
function animKindFor(kind, style) {
  if (kind !== 'auto') return kind;
  const id = style.id;
  if (['feuer', 'lava', 'halloween'].includes(id) || style.fire) return 'burn';
  if (['eis', 'kristall', 'gold', 'galaxie', 'elsa', 'barbie', 'sakura'].includes(id)) return 'sparkle';
  if (['neon', 'schatten', 'roboter', 'ironman'].includes(id)) return 'shine';
  if (id === 'wasser') return 'wave';
  if (id === 'regenbogen') return 'rainbow';
  return 'pulse';
}
function animateFrames(kind0, base, w, fh, style, st, seed) {
  const kind = animKindFor(kind0, style);
  if (kind === 'burn') return burnFrames(base, w, fh, style, st, seed);
  const eff = { pulse: 'pulse', sparkle: 'sparkle', shine: 'shine', wave: 'wave', rainbow: 'rainbow', blink: 'blink', flow: 'flow', tint: 'tint' }[kind] || 'pulse';
  const opts = { pulse: [10, 2, true], sparkle: [8, 3, false], shine: [12, 2, false], wave: [12, 2, false], rainbow: [16, 2, false], blink: [2, 10, false], flow: [16, 2, false], tint: [12, 2, true] }[eff];
  const frames = makeEffect(eff, base, w, fh, { frames: opts[0], strength: eff === 'sparkle' ? 1 : 0.6, color: eff === 'tint' ? (style.keepColors ? [255, 80, 200] : st.second) : st.light, dir: 'down' });
  return { frames, frametime: opts[1], interpolate: opts[2] };
}
/** Flammen, die um das Item herum nach oben lodern (nahtlos wiederholt) */
function burnFrames(base, w, fh, style, st, seed) {
  const n = 12, frames = [];
  // Feuerfarben: normal rot-gelb, bei gefaerbtem Feuer ("blaues Feuer") in dessen Farben
  const custom = !style.keepColors && !style.fire && (style.id === 'farben' || (style.id === 'feuer' && style.colors.main !== '#E8400C'));
  const fire = custom ? [shade(st.main, -0.35), shade(st.main, -0.12), st.main, shade(st.main, 0.22), shade(st.main, 0.42)] : FIRE_RAMP;
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < fh && base[(y * w + x) * 4 + 3] > 0;
  const near = new Float32Array(w * fh).fill(99);
  for (let y = 0; y < fh; y++) for (let x = 0; x < w; x++) {
    if (solid(x, y)) { near[y * w + x] = 0; continue; }
    for (let d = 1; d <= 4; d++) if (solid(x, y + d) || solid(x - 1, y + d) || solid(x + 1, y + d) || (d <= 1 && (solid(x - 1, y) || solid(x + 1, y)))) { near[y * w + x] = d; break; }
  }
  for (let t = 0; t < n; t++) {
    const f = new Uint8ClampedArray(base);
    const ph = t / n, sp = fh * 0.7;
    const heat = (x, y) => noise(x * 1.1, y + ph * sp, seed + 51, 2.2) * (1 - ph) + noise(x * 1.1, y + (ph - 1) * sp, seed + 51, 2.2) * ph;
    for (let y = 0; y < fh; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, d = near[y * w + x];
      if (d === 0) {
        // das Item selbst flackert leicht und glueht an den Raendern
        const k = 0.06 * Math.sin(ph * 2 * Math.PI + x * 0.7 + y * 0.5);
        const c = mixC([base[i], base[i + 1], base[i + 2]], k > 0 ? fire[3] : [0, 0, 0], Math.abs(k) * 2);
        f[i] = c[0]; f[i + 1] = c[1]; f[i + 2] = c[2];
        continue;
      }
      if (d > 4) continue;
      const v = heat(x, y) - d * 0.13 + 0.12;
      if (v < 0.45) continue;
      const c = fire[Math.max(0, Math.min(4, Math.floor((v - 0.45) * 9) + (d <= 1 ? 1 : 0)))];
      f[i] = c[0]; f[i + 1] = c[1]; f[i + 2] = c[2]; f[i + 3] = 255;
    }
    frames.push(f);
  }
  return { frames, frametime: 2, interpolate: false };
}

// ---------- Verfeinern und Bewerten ----------
/** Einzelne Ausreisser-Pixel glaetten (nicht bei Mustern, die gerade aus Einzelpunkten bestehen) */
function refine(d, w, h, pattern) {
  if (['stars', 'sparkle', 'dots', 'spots', 'flowers', 'web', 'cracks'].includes(pattern)) return;
  const copy = new Uint8ClampedArray(d);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = (y * w + x) * 4;
    if (!copy[i + 3]) continue;
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ((y + dy) * w + x + dx) * 4);
    if (nb.some((j) => !copy[j + 3])) continue;
    const cs = nb.map((j) => [copy[j], copy[j + 1], copy[j + 2]]);
    const mean = [0, 1, 2].map((k) => cs.reduce((s, c) => s + c[k], 0) / 4);
    if (cs.some((c) => dist(c, mean) > 28)) continue;
    if (dist([copy[i], copy[i + 1], copy[i + 2]], mean) > 95) { d[i] = mean[0]; d[i + 1] = mean[1]; d[i + 2] = mean[2]; }
  }
}

/** Wie gut ist ein Bild? Kontrast, wenig Rauschen, nicht zu viele Farben (0..1) */
export function scoreImage(d, w, h) {
  let n = 0, s = 0, s2 = 0, iso = 0, edgeSum = 0, edgeN = 0;
  const colors = new Set();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (!d[i + 3]) continue;
    const l = lum(d, i); n++; s += l; s2 += l * l;
    colors.add((d[i] >> 3) << 10 | (d[i + 1] >> 3) << 5 | (d[i + 2] >> 3));
    let diff = 0, cnt = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const j = (yy * w + xx) * 4;
      if (!d[j + 3]) continue;
      cnt++;
      if (Math.abs(d[i] - d[j]) + Math.abs(d[i + 1] - d[j + 1]) + Math.abs(d[i + 2] - d[j + 2]) > 140) diff++;
    }
    if (cnt >= 3 && diff === cnt) iso++;
    // Lesbarkeit: Helligkeitsunterschied zum rechten Nachbarn
    if (x + 1 < w && d[i + 7]) { edgeSum += Math.abs(lum(d, i) - lum(d, i + 4)); edgeN++; }
  }
  if (!n) return 0;
  const mean = s / n, std = Math.sqrt(Math.max(0, s2 / n - mean * mean));
  const contrast = clamp01(1 - Math.abs(std - 0.2) / 0.2);
  const clean = clamp01(1 - (iso / n) * 6);
  const nc = colors.size, colorsOk = nc < 3 ? 0.4 : nc > Math.max(12, n / 5) ? 0.6 : 1;
  const edge = edgeN ? edgeSum / edgeN : 0, edgeOk = clamp01(1 - Math.abs(edge - 0.09) / 0.09);
  return 0.3 * contrast + 0.3 * clean + 0.25 * edgeOk + 0.15 * colorsOk;
}

/**
 * Mehrere Entwuerfe malen, bewerten und sortiert zurueckgeben (beste zuerst).
 * onStep(text, anteil) meldet den Fortschritt.
 */
export async function drafts(plan, sources, handle, opts = {}, count = 6, onStep = () => {}) {
  const list = [];
  for (let v = 0; v < count; v++) {
    await onStep(`Entwurf ${v + 1} von ${count} malen …`, (v + 0.5) / count);
    const results = render(plan, sources, handle, { ...opts, seed: (opts.seed || 1) + v, variant: v % 3 });
    const score = results.reduce((s, r) => s + scoreImage(r.data, r.w, r.frameH || r.h), 0) / Math.max(1, results.length);
    list.push({ seed: (opts.seed || 1) + v, variant: v % 3, results, score });
  }
  return list.sort((a, b) => b.score - a.score);
}

// ---------- Bild als Vorlage ----------
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** Vordergrund finden: Hintergrund vom Rand aus "fluten" (aehnliche Farbe oder durchsichtig) */
export function foreground(img) {
  const { width: w, height: h, data } = img, mask = new Uint8Array(w * h).fill(1);
  const border = [];
  for (let x = 0; x < w; x++) border.push([x, 0], [x, h - 1]);
  for (let y = 0; y < h; y++) border.push([0, y], [w - 1, y]);
  const opaque = border.filter(([x, y]) => data[(y * w + x) * 4 + 3] >= 128);
  const ref = opaque.length ? [0, 1, 2].map((k) => opaque.reduce((s, [x, y]) => s + data[(y * w + x) * 4 + k], 0) / opaque.length) : null;
  const isBg = (i) => data[i + 3] < 128 || (ref && dist([data[i], data[i + 1], data[i + 2]], ref) < 52);
  const stack = border.filter(([x, y]) => isBg((y * w + x) * 4));
  for (const [x, y] of stack) mask[y * w + x] = 0;
  while (stack.length) {
    const [x, y] = stack.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h || !mask[yy * w + xx]) continue;
      if (!isBg((yy * w + xx) * 4)) continue;
      mask[yy * w + xx] = 0; stack.push([xx, yy]);
    }
  }
  const fg = mask.reduce((s, v) => s + v, 0);
  if (fg < w * h * 0.03) for (let i = 0; i < w * h; i++) mask[i] = data[i * 4 + 3] >= 128 ? 1 : 0; // nichts gefunden: ganzes Bild
  return mask;
}

/** Hauptfarben eines Bildes (k-means) – nur vom Motiv, nicht vom Hintergrund */
export function paletteFromImage(img, k = 6) {
  const { width: w, height: h, data } = img;
  const mask = foreground(img);
  const pts = [];
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 5000)));
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
    const i = (y * w + x) * 4;
    if (!mask[y * w + x] || data[i + 3] < 128) continue;
    pts.push([data[i], data[i + 1], data[i + 2]]);
  }
  if (!pts.length) return [];
  let cents = Array.from({ length: Math.min(k, pts.length) }, (_, j) => pts[Math.floor((j + 0.5) * pts.length / Math.min(k, pts.length))].slice());
  let counts = [];
  for (let it = 0; it < 14; it++) {
    const sums = cents.map(() => [0, 0, 0]); counts = cents.map(() => 0);
    for (const p of pts) {
      let b = 0, bd = Infinity;
      cents.forEach((c, j) => { const d = dist(p, c); if (d < bd) { bd = d; b = j; } });
      sums[b][0] += p[0]; sums[b][1] += p[1]; sums[b][2] += p[2]; counts[b]++;
    }
    cents = cents.map((c, j) => (counts[j] ? sums[j].map((v) => v / counts[j]) : c));
  }
  return cents.map((c, j) => ({ color: c.map(Math.round), count: counts[j] })).filter((c) => c.count).sort((a, b) => b.count - a.count);
}

/** Stil aus den Bildfarben: haeufigste kraeftige Farbe = Hauptfarbe usw. */
export function styleFromPalette(pal, name = 'dein Bild') {
  const cols = pal.map((p) => p.color);
  const sat = (c) => hsl(c)[1], li = (c) => hsl(c)[2];
  const main = cols.find((c) => sat(c) > 0.3 && li(c) > 0.15 && li(c) < 0.85) || cols[0];
  const second = cols.find((c) => c !== main && dist(c, main) > 80 && li(c) > 0.12 && li(c) < 0.9) || shade(main, -0.25, 0, 180);
  const dark = [...cols].sort((a, b) => li(a) - li(b))[0];
  const light = [...cols].sort((a, b) => li(b) - li(a))[0];
  return { id: 'bild', name, colors: { main: toHex(main), second: toHex(second), line: toHex(li(dark) < 0.3 ? dark : shade(main, -0.35)), light: toHex(li(light) > 0.7 ? light : shade(main, 0.35)) }, armor: { sides: 'second', legs: 'second', belt: 'second' } };
}

/**
 * Bild auf w x h Pixel bringen: Hintergrund weg, auf das Motiv zuschneiden, pro Feld die haeufigste
 * Palettenfarbe (scharfe Kanten statt Matsch), auf Wunsch eine dunkle Kontur aussen herum.
 */
export function pixelate(img, w, h, palette = null, { outline = false } = {}) {
  const { width: W, height: H, data } = img, out = new Uint8ClampedArray(w * h * 4);
  const mask = foreground(img);
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (mask[y * W + x]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  if (x1 < 0) return { w, h, data: out };
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const sc = Math.min(w / cw, h / ch), dw = cw * sc, dh = ch * sc, ox = (w - dw) / 2, oy = (h - dh) / 2;
  const nearest = (c) => (palette?.length ? palette.reduce((b, p) => (dist(p, c) < dist(b, c) ? p : b), palette[0]) : c);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx0 = x0 + Math.floor((x - ox) / sc), sx1 = x0 + Math.ceil((x + 1 - ox) / sc), sy0 = y0 + Math.floor((y - oy) / sc), sy1 = y0 + Math.ceil((y + 1 - oy) / sc);
    const votes = new Map();
    let n = 0, fgN = 0, sum = [0, 0, 0];
    for (let yy = Math.max(y0, sy0); yy < Math.min(y1 + 1, sy1); yy++) for (let xx = Math.max(x0, sx0); xx < Math.min(x1 + 1, sx1); xx++) {
      n++;
      if (!mask[yy * W + xx]) continue;
      fgN++;
      const i = (yy * W + xx) * 4, c = [data[i], data[i + 1], data[i + 2]];
      sum = [sum[0] + c[0], sum[1] + c[1], sum[2] + c[2]];
      const q = nearest(c), key = q.join(',');
      votes.set(key, (votes.get(key) || 0) + 1);
    }
    if (!n || fgN < n * 0.45) continue;
    const c = palette?.length ? [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number) : sum.map((v) => v / fgN);
    const j = (y * w + x) * 4;
    out[j] = c[0]; out[j + 1] = c[1]; out[j + 2] = c[2]; out[j + 3] = 255;
  }
  if (outline) {
    const dark = palette?.length ? shade([...palette].sort((a, b) => lum([...a, 255], 0) - lum([...b, 255], 0))[0], -0.15) : [30, 30, 34];
    const copy = new Uint8ClampedArray(out);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const j = (y * w + x) * 4;
      if (copy[j + 3]) continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const xx = x + dx, yy = y + dy; return xx >= 0 && yy >= 0 && xx < w && yy < h && copy[(yy * w + xx) * 4 + 3]; })) {
        out[j] = dark[0]; out[j + 1] = dark[1]; out[j + 2] = dark[2]; out[j + 3] = 255;
      }
    }
  }
  return { w, h, data: out };
}

/** "Ganzes Pixelbild": Bild auf die Groesse der Textur bringen (bei Items in deren Umriss) */
function pixelArtInto(src, img) {
  const fh = Math.min(src.w, src.h);
  const pic = pixelate(img.source, src.w, fh, img.paletteColors, { outline: src.w <= 32 });
  const out = new Uint8ClampedArray(src.data.length);
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const i = (y * src.w + x) * 4, j = ((y % fh) * src.w + x) * 4;
    if (img.keepShape && !src.data[i + 3]) continue;
    if (!pic.data[j + 3]) { if (img.keepShape) { out[i] = src.data[i]; out[i + 1] = src.data[i + 1]; out[i + 2] = src.data[i + 2]; out[i + 3] = src.data[i + 3]; } continue; }
    out[i] = pic.data[j]; out[i + 1] = pic.data[j + 1]; out[i + 2] = pic.data[j + 2]; out[i + 3] = 255;
  }
  return out;
}

// ---------- Ideen ----------
const IDEA_TARGETS = ['Kupferrüstung', 'Diamantrüstung', 'Netheritrüstung', 'Eisenschwert', 'Diamant-Spitzhacke', 'Hotbar', 'Herzen', 'XP-Leiste', 'XP-Kugeln', 'Bogen', 'Goldrüstung', 'Lederrüstung', 'Werkzeuge aus Eisen', 'Totem', 'Tränke', 'Elytra'];
const IDEA_FORMS = [
  (st, tg) => `${st} als ${tg}`, (st, tg) => `${tg} im ${st}-Stil`,
  (st, tg, m) => `${tg} mit ${m}`, (st, tg, m, mn) => `Pixelbild von einem ${mn}`,
  () => 'brennendes Diamantschwert', () => 'leuchtende XP-Kugeln in Pink', () => 'glitzernde Goldrüstung', () => 'dunkle rostige Eisenrüstung',
  (st) => `blaues Feuer als Netheritrüstung`, (st, tg) => `animierte ${tg} im ${st}-Stil`,
];
const MOTIF_SHOW = { totenkopf: 'Totenkopf', blitz: 'Blitz', krone: 'Krone', herz: 'Herz', stern: 'Stern', drache: 'Drachen', mond: 'Mond', flamme: 'Flamme', pilz: 'Pilz', geist: 'Geist', rakete: 'Rakete', katze: 'Katze', baum: 'Baum', fisch: 'Fisch' };
export function ideas(n = 6, seed = Date.now()) {
  const r = rng(seed), out = new Set();
  const styleNames = STYLES.map((s) => s.name), motifs = Object.values(MOTIF_SHOW);
  let guard = 0;
  while (out.size < n && guard++ < 200) {
    const st = styleNames[Math.floor(r() * styleNames.length)], tg = IDEA_TARGETS[Math.floor(r() * IDEA_TARGETS.length)], m = motifs[Math.floor(r() * motifs.length)];
    out.add(IDEA_FORMS[Math.floor(r() * IDEA_FORMS.length)](st, tg, m, m));
  }
  return [...out];
}

// ---------- Vorschaubild: Spieler mit Ruestung von vorne/hinten ----------
/**
 * skin: { w, h, data } (64x64), layer1/layer2: { w, h, data } (64x32) oder null.
 * Gibt { w: 36, h: 32, data } zurueck: links vorne, rechts hinten (je 16x32, 4 px Abstand).
 */
export function playerPreview(skin, layer1, layer2) {
  const W = 36, H = 32, out = new Uint8ClampedArray(W * H * 4);
  const put = (img, sx, sy, sw, sh, dx, dy, flip = false) => {
    if (!img) return;
    const s = img.w / 64;
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      const px = Math.floor((sx + (flip ? sw - 1 - x : x)) * s), py = Math.floor((sy + y) * s), i = (py * img.w + px) * 4;
      if (!img.data[i + 3]) continue;
      const j = ((dy + y) * W + dx + x) * 4;
      out[j] = img.data[i]; out[j + 1] = img.data[i + 1]; out[j + 2] = img.data[i + 2]; out[j + 3] = 255;
    }
  };
  // [Quelle-x, Quelle-y] je Flaeche: vorne / hinten
  const view = (back, dx) => {
    const f = (front, rear) => (back ? rear : front);
    // Haut
    put(skin, ...f([8, 8], [24, 8]), 8, 8, dx + 4, 0);
    put(skin, ...f([20, 20], [32, 20]), 8, 12, dx + 4, 8);
    put(skin, ...f([44, 20], [52, 20]), 4, 12, back ? dx + 12 : dx, 8);
    put(skin, ...f([36, 52], [44, 52]), 4, 12, back ? dx : dx + 12, 8);
    put(skin, ...f([4, 20], [12, 20]), 4, 12, back ? dx + 8 : dx + 4, 20);
    put(skin, ...f([20, 52], [28, 52]), 4, 12, back ? dx + 4 : dx + 8, 20);
    // Hose (Ebene 2), dann Ebene 1 (Helm, Brust, Arme, Stiefel)
    put(layer2, ...f([20, 20], [32, 20]), 8, 12, dx + 4, 8);
    put(layer2, ...f([4, 20], [12, 20]), 4, 12, back ? dx + 8 : dx + 4, 20);
    put(layer2, ...f([4, 20], [12, 20]), 4, 12, back ? dx + 4 : dx + 8, 20, true);
    put(layer1, ...f([8, 8], [24, 8]), 8, 8, dx + 4, 0);
    put(layer1, ...f([20, 20], [32, 20]), 8, 12, dx + 4, 8);
    put(layer1, ...f([44, 20], [52, 20]), 4, 12, back ? dx + 12 : dx, 8);
    put(layer1, ...f([44, 20], [52, 20]), 4, 12, back ? dx : dx + 12, 8, true);
    put(layer1, ...f([4, 20], [12, 20]), 4, 12, back ? dx + 8 : dx + 4, 20);
    put(layer1, ...f([4, 20], [12, 20]), 4, 12, back ? dx + 4 : dx + 8, 20, true);
  };
  view(false, 0);
  view(true, 20);
  return { w: W, h: H, data: out };
}
