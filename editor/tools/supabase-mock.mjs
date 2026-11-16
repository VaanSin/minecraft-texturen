// Kleiner Nachbau der Supabase-Schnittstellen, die das Programm nutzt - nur fuer Tests ohne Internet.
//   node tools/supabase-mock.mjs  (Port 47899)  ->  MCT_KONTO_URL=http://127.0.0.1:47899  MCT_KONTO_KEY=sb_publishable_test
// Bildet die Regeln aus docs/supabase.sql nach: eigene Zeilen aendern, oeffentliche fuer alle lesen.
import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.MOCK_PORT || 47899);
const users = new Map();    // email -> { id, password, meta }
const tokens = new Map();   // token -> userId
const profiles = [];
const themes = [];
const files = new Map();    // path -> Buffer

const send = (res, code, obj, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type }); res.end(type === 'application/json' ? JSON.stringify(obj) : obj); };
const body = (req) => new Promise((ok) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); });
const session = (u) => { const t = crypto.randomUUID(); tokens.set(t, u.id); return { access_token: t, refresh_token: 'r-' + t, expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: u.id, user_metadata: u.meta } }; };
const uid = (req) => tokens.get(String(req.headers.authorization || '').replace(/^Bearer /, '')) || null;

function filter(rows, params) {
  let out = rows;
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'on_conflict'].includes(k)) continue;
    if (k === 'or') {
      const parts = v.replace(/^\(|\)$/g, '').split(',').map((s) => s.split('.ilike.'));
      out = out.filter((r) => parts.some(([f, pat]) => like(r[f], pat)));
      continue;
    }
    const [op, ...rest] = v.split('.'), val = rest.join('.');
    out = out.filter((r) => (op === 'eq' ? String(r[k]) === val : op === 'ilike' ? like(r[k], val) : true));
  }
  const order = params.get('order');
  if (order) {
    const keys = order.split(',').map((o) => o.split('.'));
    out = [...out].sort((a, b) => { for (const [f, d] of keys) { if (a[f] !== b[f]) return (a[f] < b[f] ? -1 : 1) * (d === 'desc' ? -1 : 1); } return 0; });
  }
  return params.get('limit') ? out.slice(0, Number(params.get('limit'))) : out;
}
function like(v, pat) { const re = new RegExp('^' + pat.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/_/g, '.') + '$', 'i'); return re.test(String(v ?? '')); }

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname, me = uid(req), raw = await body(req);
  const j = () => { try { return JSON.parse(raw.toString() || '{}'); } catch { return {}; } };
  if (!req.headers.apikey) return send(res, 401, { message: 'No API key found in request' });
  // ---- Auth
  if (p === '/auth/v1/signup') {
    const b = j();
    if (users.has(b.email)) return send(res, 422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' });
    if (String(b.password).length < 6) return send(res, 422, { msg: 'Password should be at least 6 characters.' });
    const u = { id: crypto.randomUUID(), password: b.password, meta: b.data || {} };
    users.set(b.email, u);
    return send(res, 200, session(u));
  }
  if (p === '/auth/v1/token') {
    const b = j();
    if (url.searchParams.get('grant_type') === 'refresh_token') {
      const id = tokens.get(String(b.refresh_token).slice(2));
      const u = [...users.values()].find((x) => x.id === id);
      return u ? send(res, 200, session(u)) : send(res, 400, { error: 'invalid_grant' });
    }
    const u = users.get(b.email);
    if (!u || u.password !== b.password) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
    return send(res, 200, session(u));
  }
  if (p === '/auth/v1/logout') { tokens.delete(String(req.headers.authorization).replace(/^Bearer /, '')); return send(res, 204, ''); }
  if (p === '/auth/v1/user' && req.method === 'PUT') { const u = [...users.values()].find((x) => x.id === me); if (!u) return send(res, 401, {}); u.password = j().password; return send(res, 200, { id: u.id }); }
  // ---- Tabellen
  if (p === '/rest/v1/profiles') {
    if (req.method === 'GET') return send(res, 200, filter(profiles, url.searchParams));
    const b = j();
    if (b.id !== me) return send(res, 403, { message: 'new row violates row-level security policy' });
    if (profiles.some((x) => x.username === b.username || x.id === b.id)) return send(res, 409, { message: 'duplicate key' });
    profiles.push({ id: b.id, username: b.username });
    return send(res, 201, '');
  }
  if (p === '/rest/v1/themes') {
    const visible = themes.filter((t) => t.public || t.owner === me);
    if (req.method === 'GET') return send(res, 200, filter(visible, url.searchParams));
    if (req.method === 'POST') {
      const b = j();
      if (!me || b.owner !== me) return send(res, 403, { message: 'new row violates row-level security policy' });
      let row = themes.find((t) => t.owner === me && t.name === b.name && t.mc_version === b.mc_version);
      if (row) Object.assign(row, b);
      else { row = { id: crypto.randomUUID(), downloads: 0, description: '', ...b }; themes.push(row); }
      return send(res, 201, [row]);
    }
    if (req.method === 'PATCH') { for (const t of filter(themes.filter((t) => t.owner === me), url.searchParams)) Object.assign(t, j()); return send(res, 204, ''); }
    if (req.method === 'DELETE') { for (const t of filter(themes.filter((t) => t.owner === me), url.searchParams)) themes.splice(themes.indexOf(t), 1); return send(res, 204, ''); }
  }
  if (p === '/rest/v1/rpc/zaehle_download') { const t = themes.find((x) => x.id === j().theme && x.public); if (t) t.downloads++; return send(res, 204, ''); }
  // ---- Dateien
  if (p.startsWith('/storage/v1/object/themen')) {
    const key = decodeURIComponent(p.slice('/storage/v1/object/themen/'.length));
    const [owner, file] = key.split('/');
    if (req.method === 'POST') {
      if (owner !== me) return send(res, 403, { message: 'new row violates row-level security policy' });
      if (raw.length > 20 * 1024 * 1024) return send(res, 413, { message: 'Payload too large' });
      files.set(key, raw); return send(res, 200, { Key: 'themen/' + key });
    }
    if (req.method === 'GET') {
      const id = (file || '').replace(/\.(zip|png)$/, '');
      const ok = owner === me || themes.some((t) => t.public && t.owner === owner && t.id === id);
      if (!ok || !files.has(key)) return send(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
      return send(res, 200, files.get(key), 'application/octet-stream');
    }
    if (req.method === 'DELETE') { for (const k of j().prefixes || []) if (k.startsWith(me + '/')) files.delete(k); return send(res, 200, []); }
  }
  send(res, 404, { message: 'nicht nachgebaut: ' + req.method + ' ' + p });
}).listen(PORT, '127.0.0.1', () => console.log(`Supabase-Nachbau auf http://127.0.0.1:${PORT}`));
