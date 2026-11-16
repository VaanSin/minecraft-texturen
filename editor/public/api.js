// Anfragen an den lokalen Server
export async function get(url) {
  const r = await fetch(url, { cache: 'no-store' });
  const j = await r.json();
  if (!r.ok || j.error) { const e = new Error(j.error || r.statusText); e.code = j.code; throw e; }
  return j;
}

export async function post(url, body = {}) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok || j.error) { const e = new Error(j.error || r.statusText); e.code = j.code; throw e; }
  return j;
}

export function b64ToBytes(b64) {
  const s = atob(b64);
  const out = new Uint8ClampedArray(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function bytesToB64(bytes) {
  let s = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) s += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
  return btoa(s);
}
