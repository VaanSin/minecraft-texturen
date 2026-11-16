// Findet die Namen der wenigen Minecraft-Funktionen, die /thema braucht, fuer jede Version:
//   mojmap        (NeoForge ab 1.20.5, Minecraft 26.x)  -> echte Mojang-Namen
//   srg           (Forge 1.17 - 1.20.x)                 -> Mojang-Klassen + SRG-Mitglieder (m_12345_)
//   intermediary  (Fabric)                              -> class_1234 / method_1234 / field_1234
// Quellen liegen lokal im CurseForge-Install-Ordner (Mojang-Namensliste, mcp_config, intermediary).
//
// node namen.mjs <version> <mojmap|srg|intermediary>   -> gibt JSON aus
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const LIB = path.join(os.homedir(), 'curseforge', 'minecraft', 'Install', 'libraries');

// Was gebraucht wird (Mojang-Namen)
// Namen mit "?" sind optional: fehlen sie (z. B. updateResourcePacks in 1.19.2), nimmt der Bau den Ersatzweg.
export const NEEDED = {
  Minecraft: { cls: 'net.minecraft.client.Minecraft', methods: { getInstance: '()Lnet/minecraft/client/Minecraft;', getResourcePackRepository: '()Lnet/minecraft/server/packs/repository/PackRepository;', 'reloadResourcePacks?': '()Ljava/util/concurrent/CompletableFuture;' }, fields: { options: 'Lnet/minecraft/client/Options;' } },
  Options: { cls: 'net.minecraft.client.Options', methods: { 'updateResourcePacks?': '(Lnet/minecraft/server/packs/repository/PackRepository;)V', 'save?': '()V' }, fields: { 'resourcePacks?': 'Ljava/util/List;' } },
  PackRepository: { cls: 'net.minecraft.server.packs.repository.PackRepository', methods: { reload: '()V', setSelected: '(Ljava/util/Collection;)V', getAvailableIds: '()Ljava/util/Collection;', getSelectedIds: '()Ljava/util/Collection;', 'getSelectedPacks?': '()Ljava/util/Collection;' } },
  Pack: { cls: 'net.minecraft.server.packs.repository.Pack', methods: { 'isFixedPosition?': '()Z', 'getId?': '()Ljava/lang/String;' } },
  Component: { cls: 'net.minecraft.network.chat.Component', methods: { literal: '(Ljava/lang/String;)Lnet/minecraft/network/chat/MutableComponent;' } },
  CommandSourceStack: { cls: 'net.minecraft.commands.CommandSourceStack', methods: { sendSystemMessage: '(Lnet/minecraft/network/chat/Component;)V' } },
};

function findFile(dir, re) {
  if (!fs.existsSync(dir)) return null;
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) { const r = findFile(p, re); if (r) return r; }
    else if (re.test(d.name)) return p;
  }
  return null;
}

/** Mojang-Namensliste (ProGuard-Format): Mojang-Name -> verschluesselter Name */
function readMojang(version) {
  const file = findFile(path.join(LIB, 'net', 'minecraft', 'client'), new RegExp(`^client-${version.replace(/\./g, '\\.')}-\\d+\\.\\d+-mappings\\.txt$`));
  if (!file) throw new Error('Keine Mojang-Namensliste fuer ' + version);
  const classes = new Map(); // mojang -> { obf, members: [] }
  let cur = null;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue;
    if (!line.startsWith(' ')) {
      const m = line.match(/^(\S+) -> (\S+):$/);
      if (m) { cur = { obf: m[2], members: [] }; classes.set(m[1], cur); }
      continue;
    }
    const m = line.trim().match(/^(?:\d+:\d+:)?(\S+) ([^\s(]+)(\(([^)]*)\))? -> (\S+)$/);
    if (m && cur) cur.members.push({ type: m[1], name: m[2], method: !!m[3], params: m[4] ? m[4].split(',').filter(Boolean) : [], obf: m[5] });
  }
  return classes;
}

const PRIM = { void: 'V', boolean: 'Z', byte: 'B', char: 'C', short: 'S', int: 'I', long: 'J', float: 'F', double: 'D' };
function desc(type, classMap) {
  let arr = '';
  while (type.endsWith('[]')) { arr += '['; type = type.slice(0, -2); }
  if (PRIM[type]) return arr + PRIM[type];
  const mapped = classMap ? (classMap.get(type)?.obf ?? type) : type;
  return arr + 'L' + mapped.replace(/\./g, '/') + ';';
}

export function resolve(version, target) {
  const moj = readMojang(version);
  const out = { version, target, classes: {}, members: {} };
  let srg = null, inter = null;
  if (target === 'srg') {
    const f = findFile(path.join(LIB, 'de', 'oceanlabs', 'mcp', 'mcp_config'), new RegExp(`^mcp_config-${version.replace(/\./g, '\\.')}-\\d+\\.\\d+-mappings-merged\\.txt$`));
    if (!f) throw new Error('Keine SRG-Tabelle fuer ' + version);
    srg = new Map(); // obfClass -> Map(obf+desc -> srg)
    let c = null;
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      if (!line || line.startsWith('tsrg2')) continue;
      if (!line.startsWith('\t')) { c = new Map(); srg.set(line.split(' ')[0], c); continue; }
      if (line.startsWith('\t\t')) continue; // Parameter
      const p = line.trim().split(' ');
      if (p.length === 3) c.set(p[0] + p[1], p[2]); else if (p.length === 2) c.set(p[0], p[1]);
    }
  }
  if (target === 'intermediary') {
    const jar = findFile(path.join(LIB, 'net', 'fabricmc', 'intermediary', version), /\.jar$/);
    if (!jar) throw new Error('Keine intermediary-Tabelle fuer ' + version);
    const tiny = readZipEntry(jar, 'mappings/mappings.tiny').toString('utf8');
    inter = { cls: new Map(), mem: new Map() };
    for (const line of tiny.split('\n')) {
      const p = line.trim().split('\t');
      if (p[0] === 'CLASS') inter.cls.set(p[1], p[2]);
      else if (p[0] === 'METHOD' || p[0] === 'FIELD') inter.mem.set(p[1] + '.' + p[3] + p[2], p[4]);
    }
  }
  const className = (mojName) => {
    if (target !== 'intermediary') return mojName;
    const obf = moj.get(mojName)?.obf;
    return (inter.cls.get(obf) || mojName).replace(/\//g, '.');
  };
  for (const [key, spec] of Object.entries(NEEDED)) {
    const c = moj.get(spec.cls);
    if (!c) throw new Error(`${spec.cls} fehlt in ${version}`);
    out.classes[key] = className(spec.cls);
    const all = [...Object.entries(spec.methods || {}).map(([n, d]) => [n, d, true]), ...Object.entries(spec.fields || {}).map(([n, d]) => [n, d, false])];
    for (const [rawName, mdesc, isMethod] of all) {
      const optional = rawName.endsWith('?');
      const name = rawName.replace('?', '');
      const cand = c.members.filter((m) => m.name === name && m.method === isMethod && (isMethod
        ? '(' + m.params.map((t) => desc(t, null)).join('') + ')' + desc(m.type, null) === mdesc
        : desc(m.type, null) === mdesc));
      if (cand.length === 0 && optional) { out.members[key + '.' + name] = null; continue; }
      if (cand.length !== 1) throw new Error(`${spec.cls}.${name}${mdesc} in ${version}: ${cand.length} Treffer`);
      const m = cand[0];
      const obfDesc = isMethod ? '(' + m.params.map((t) => desc(t, moj)).join('') + ')' + desc(m.type, moj) : desc(m.type, moj);
      let res = name;
      if (target === 'srg') {
        res = srg.get(c.obf)?.get(isMethod ? m.obf + obfDesc : m.obf);
        if (!res) throw new Error(`SRG-Name fuer ${spec.cls}.${name} fehlt`);
      } else if (target === 'intermediary') {
        res = inter.mem.get(c.obf + '.' + m.obf + obfDesc);
        if (!res) throw new Error(`intermediary-Name fuer ${spec.cls}.${name} fehlt`);
      }
      out.members[key + '.' + name] = res;
    }
  }
  return out;
}

function readZipEntry(file, name) {
  const buf = fs.readFileSync(file);
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  let p = buf.readUInt32LE(eocd + 16);
  const n = buf.readUInt16LE(eocd + 10);
  for (let i = 0; i < n; i++) {
    const method = buf.readUInt16LE(p + 10), comp = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const ename = buf.toString('utf8', p + 46, p + 46 + nl);
    if (ename === name) {
      const start = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
      const data = buf.subarray(start, start + comp);
      return method === 8 ? zlib.inflateRawSync(data) : data;
    }
    p += 46 + nl + el + cl;
  }
  throw new Error(name + ' nicht in ' + file);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) {
  console.log(JSON.stringify(resolve(process.argv[2], process.argv[3]), null, 2));
}
