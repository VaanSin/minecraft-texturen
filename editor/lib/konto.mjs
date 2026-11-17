// Online-Konto (Supabase): Anmelden mit Benutzername + Passwort, eigene Themen hochladen,
// auf jedem PC wiederholen und Themen anderer finden.
//
// Supabase kennt nur E-Mail-Anmeldungen. Der Benutzername wird deshalb intern zu einer
// Platzhalter-Adresse (<name>@<emailDomain>); es werden keine E-Mails verschickt
// ("Confirm email" ist im Supabase-Projekt aus). Das Passwort geht nur an Supabase.
//
// Zugangsdaten des Projekts: konto.json neben server.mjs ({ "url": "...", "key": "sb_publishable_..." }).
// Beide Werte sind oeffentlich gedacht; die Rechte regeln die Regeln in docs/supabase.sql.
import fs from 'node:fs';
import path from 'node:path';

export const NAME_RE = /^[A-Za-z0-9_]{3,20}$/;

export class Konto {
  constructor({ configFile, dataDir, env = process.env }) {
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(configFile, 'utf8')); } catch { /* noch nicht eingerichtet */ }
    this.url = String(env.MCT_KONTO_URL || cfg.url || '').replace(/\/+$/, '');
    this.key = String(env.MCT_KONTO_KEY || cfg.key || '');
    this.emailDomain = String(cfg.emailDomain || 'example.com');
    this.sessionFile = path.join(dataDir, 'konto-sitzung.json');
    this.dataDir = dataDir;
    try { this.session = JSON.parse(fs.readFileSync(this.sessionFile, 'utf8')); } catch { this.session = null; }
  }

  get configured() { return !!(this.url && this.key); }
  get user() { return this.session?.user || null; }

  status() { return { configured: this.configured, user: this.user }; }

  #save() {
    fs.mkdirSync(this.dataDir, { recursive: true });
    if (this.session) fs.writeFileSync(this.sessionFile, JSON.stringify(this.session), 'utf8');
    else fs.rmSync(this.sessionFile, { force: true });
  }

  #email(username) { return `${username.toLowerCase()}@${this.emailDomain}`; }

  /** Anfrage an Supabase. auth: true = mit Anmeldung (wird bei Bedarf erneuert). */
  async #call(method, p, { body, headers = {}, auth = false, raw = false } = {}) {
    if (!this.configured) throw new Error('Online-Konten sind in diesem Programm noch nicht eingerichtet.');
    const h = { apikey: this.key, ...headers };
    if (auth) {
      await this.#fresh();
      h.Authorization = 'Bearer ' + this.session.access_token;
    } else if (this.key.startsWith('eyJ')) {
      h.Authorization = 'Bearer ' + this.key; // alter "anon"-Schluessel ist selbst ein Token
    }
    let payload = body;
    if (body !== undefined && !Buffer.isBuffer(body) && typeof body !== 'string') { payload = JSON.stringify(body); h['Content-Type'] ??= 'application/json'; }
    let r;
    try { r = await fetch(this.url + p, { method, headers: h, body: payload }); }
    catch (e) { throw new Error('Keine Verbindung zum Online-Speicher – bist du im Internet?'); }
    if (raw) {
      if (!r.ok) throw new Error(await errorText(r));
      return Buffer.from(await r.arrayBuffer());
    }
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!r.ok) {
      const e = new Error(niceError(data, r.status));
      e.status = r.status; e.code = data?.error_code || data?.code;
      throw e;
    }
    return data;
  }

  async #fresh() {
    if (!this.session) throw new Error('Bitte zuerst anmelden.');
    if (Date.now() / 1000 < (this.session.expires_at || 0) - 60) return;
    let r;
    try {
      r = await fetch(this.url + '/auth/v1/token?grant_type=refresh_token', {
        method: 'POST', headers: { apikey: this.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: this.session.refresh_token }),
      });
    } catch { throw new Error('Keine Verbindung zum Online-Speicher – bist du im Internet?'); }
    const d = await r.json().catch(() => null);
    if (!r.ok || !d?.access_token) { this.session = null; this.#save(); throw new Error('Deine Anmeldung ist abgelaufen – bitte neu anmelden.'); }
    this.#take(d, this.session.user.username);
  }

  #take(d, username) {
    this.session = {
      access_token: d.access_token, refresh_token: d.refresh_token,
      expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600),
      user: { id: d.user?.id || this.session?.user?.id, username },
    };
    this.#save();
  }

  // ---------- Konto ----------
  async register(username, password) {
    username = String(username || '').trim();
    if (!NAME_RE.test(username)) throw new Error('Benutzername: 3–20 Zeichen, nur Buchstaben, Zahlen und _');
    checkPassword(password);
    // Name schon vergeben? (Profile sind fuer alle lesbar)
    const taken = await this.#call('GET', `/rest/v1/profiles?select=id&username=ilike.${encodeURIComponent(username)}`);
    if (Array.isArray(taken) && taken.length) throw new Error('Den Benutzernamen gibt es schon – nimm einen anderen.');
    let d;
    try {
      d = await this.#call('POST', '/auth/v1/signup', { body: { email: this.#email(username), password, data: { username } } });
    } catch (e) {
      if (/already|registered|exists/i.test(e.message) || e.code === 'user_already_exists') throw new Error('Den Benutzernamen gibt es schon – nimm einen anderen.');
      throw e;
    }
    if (!d?.access_token) throw new Error('Registrieren hat geklappt, aber Supabase verlangt noch eine E-Mail-Bestätigung. Im Supabase-Projekt „Confirm email“ ausschalten.');
    this.#take(d, username);
    try { await this.#call('POST', '/rest/v1/profiles', { auth: true, body: { id: this.session.user.id, username }, headers: { Prefer: 'return=minimal' } }); }
    catch (e) { if (e.status !== 409) console.warn('Profil anlegen:', e.message); }
    return this.status();
  }

  async login(username, password) {
    username = String(username || '').trim();
    if (!NAME_RE.test(username)) throw new Error('Benutzernamen haben 3–20 Zeichen: nur Buchstaben, Zahlen und _ (keine Leerzeichen, keine Umlaute).');
    let d;
    try {
      d = await this.#call('POST', '/auth/v1/token?grant_type=password', { body: { email: this.#email(username), password } });
    } catch (e) {
      if (e.status === 400 || e.status === 401) {
        // Gibt es den Namen ueberhaupt? (Benutzernamen sind oeffentlich, z. B. bei geteilten Themen)
        let exists = true;
        try { const r = await this.#call('GET', `/rest/v1/profiles?select=id&username=ilike.${encodeURIComponent(username)}`); exists = Array.isArray(r) && r.length > 0; } catch { /* dann allgemein */ }
        const err = new Error(exists ? 'Das Passwort stimmt nicht.' : `Den Benutzernamen „${username}“ gibt es noch nicht – du musst dich zuerst registrieren.`);
        err.code = exists ? 'wrong_password' : 'unknown_user';
        throw err;
      }
      throw e;
    }
    // Schreibweise des Namens aus dem Profil uebernehmen
    let name = d.user?.user_metadata?.username || username;
    this.#take(d, name);
    try {
      const p = await this.#call('GET', `/rest/v1/profiles?select=username&id=eq.${this.session.user.id}`, { auth: true });
      if (p?.[0]?.username) name = p[0].username;
      else await this.#call('POST', '/rest/v1/profiles', { auth: true, body: { id: this.session.user.id, username: name }, headers: { Prefer: 'return=minimal' } });
    } catch { /* Profil ist nur fuer die Anzeige */ }
    this.session.user.username = name;
    this.#save();
    return this.status();
  }

  async logout() {
    if (this.session) { try { await this.#call('POST', '/auth/v1/logout', { auth: true }); } catch { /* egal */ } }
    this.session = null;
    this.#save();
    return this.status();
  }

  async changePassword(password) {
    checkPassword(password);
    await this.#call('PUT', '/auth/v1/user', { auth: true, body: { password } });
    return { ok: true };
  }

  // ---------- Themen ----------
  /** Eigene Themen (alle Versionen). */
  async mine() {
    if (!this.user) return [];
    return this.#call('GET', `/rest/v1/themes?select=*&owner=eq.${this.user.id}&order=updated_at.desc`, { auth: true });
  }

  /** Oeffentliche Themen aller Leute. */
  async discover({ search = '', version = '', sort = 'downloads' } = {}) {
    let q = '/rest/v1/themes?select=*&public=eq.true&limit=80';
    if (search) q += `&or=(name.ilike.*${encodeURIComponent(likeEscape(search))}*,owner_name.ilike.*${encodeURIComponent(likeEscape(search))}*)`;
    if (version) q += `&mc_version=eq.${encodeURIComponent(version)}`;
    q += sort === 'neu' ? '&order=updated_at.desc' : '&order=downloads.desc,updated_at.desc';
    return this.#call('GET', q, { auth: !!this.user });
  }

  /** Thema hochladen (oder ersetzen). zip/png: Buffer. */
  async upload({ name, description = '', mcVersion, isPublic, textureCount, zip, png }) {
    if (!this.user) throw new Error('Bitte zuerst anmelden.');
    if (zip.length > 20 * 1024 * 1024) throw new Error('Das Thema ist größer als 20 MB.');
    const rows = await this.#call('POST', '/rest/v1/themes?on_conflict=owner,name,mc_version', {
      auth: true,
      headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
      body: {
        owner: this.user.id, owner_name: this.user.username, name: String(name).slice(0, 40), description: String(description).slice(0, 300),
        mc_version: mcVersion, public: !!isPublic, texture_count: textureCount, size_bytes: zip.length, updated_at: new Date().toISOString(),
      },
    });
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row?.id) throw new Error('Speichern online ging nicht.');
    const base = `/storage/v1/object/themen/${this.user.id}/${row.id}`;
    await this.#call('POST', base + '.zip', { auth: true, body: zip, headers: { 'Content-Type': 'application/zip', 'x-upsert': 'true' } });
    if (png) await this.#call('POST', base + '.png', { auth: true, body: png, headers: { 'Content-Type': 'image/png', 'x-upsert': 'true' } });
    return row;
  }

  async remove(id) {
    if (!this.user) throw new Error('Bitte zuerst anmelden.');
    const rows = await this.#call('GET', `/rest/v1/themes?select=id,owner&id=eq.${encodeURIComponent(id)}&owner=eq.${this.user.id}`, { auth: true });
    if (!rows?.length) throw new Error('Das Thema gehört dir nicht.');
    await this.#call('DELETE', '/storage/v1/object/themen', { auth: true, body: { prefixes: [`${this.user.id}/${id}.zip`, `${this.user.id}/${id}.png`] } }).catch(() => {});
    await this.#call('DELETE', `/rest/v1/themes?id=eq.${encodeURIComponent(id)}`, { auth: true, headers: { Prefer: 'return=minimal' } });
    return { ok: true };
  }

  async setPublic(id, isPublic) {
    await this.#call('PATCH', `/rest/v1/themes?id=eq.${encodeURIComponent(id)}&owner=eq.${this.user?.id}`, { auth: true, body: { public: !!isPublic }, headers: { Prefer: 'return=minimal' } });
    return { ok: true };
  }

  /** Zeile + Zip eines Themas laden (eigene oder oeffentliche). */
  async download(id) {
    const rows = await this.#call('GET', `/rest/v1/themes?select=*&id=eq.${encodeURIComponent(id)}`, { auth: !!this.user });
    const row = rows?.[0];
    if (!row) throw new Error('Thema nicht gefunden (vielleicht nicht mehr öffentlich).');
    const zip = await this.#call('GET', `/storage/v1/object/themen/${row.owner}/${row.id}.zip`, { auth: !!this.user, raw: true });
    if (row.owner !== this.user?.id) this.#call('POST', '/rest/v1/rpc/zaehle_download', { body: { theme: row.id }, auth: !!this.user }).catch(() => {});
    return { row, zip };
  }

  /** Vorschaubild (pack.png) eines Themas. */
  async image(owner, id) {
    if (!/^[0-9a-f-]{36}$/i.test(owner) || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Ungültig');
    return this.#call('GET', `/storage/v1/object/themen/${owner}/${id}.png`, { auth: !!this.user, raw: true });
  }
}

function checkPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 6) throw new Error('Das Passwort braucht mindestens 6 Zeichen.');
  if (pw.length > 72) throw new Error('Das Passwort ist zu lang (höchstens 72 Zeichen).');
}

/** Sonderzeichen fuer PostgREST-Filter entschaerfen */
function likeEscape(s) { return String(s).replace(/[%_*(),.\\]/g, ' ').trim().slice(0, 40); }

async function errorText(r) {
  const t = await r.text().catch(() => '');
  try { return niceError(JSON.parse(t), r.status); } catch { return `Fehler ${r.status}`; }
}

function niceError(d, status) {
  const msg = d?.msg || d?.message || d?.error_description || d?.error || (typeof d === 'string' ? d : '');
  if (status === 429) return 'Zu viele Versuche – bitte kurz warten.';
  if (/password/i.test(msg) && /weak|short|characters/i.test(msg)) return 'Das Passwort ist zu schwach – nimm ein längeres.';
  if (/row-level security|violates/i.test(msg)) return 'Keine Berechtigung (Regeln im Online-Speicher).';
  if (/payload too large|maximum allowed size/i.test(msg)) return 'Das Thema ist zu groß für den Online-Speicher.';
  return msg ? String(msg) : `Fehler ${status}`;
}
