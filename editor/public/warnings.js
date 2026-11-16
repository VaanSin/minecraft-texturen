// Hinweise unten links: findet typische Fehler in der geoeffneten Textur.
import { toHex, percent } from './colors.js';

const FAINT = 38; // bis 15 % Dichte gilt als "fast unsichtbar"

export function computeWarnings(doc, path) {
  const out = [];
  if (!doc) return out;
  const { w, h, data } = doc;
  const van = doc.vanilla;
  const sameSize = van && van.w === w && van.h === h;

  // 1) Fast unsichtbare Pixel - die Farbe ist noch da, nur ganz schwach.
  //    Gewollte Effekte (Leuchtraender, Schatten) bestehen aus vielen gleichen schwachen Pixeln
  //    nebeneinander - Reste vom Radieren stehen dagegen einzeln.
  const isFaint = (i) => data[i + 3] > 0 && data[i + 3] <= FAINT;
  const sameFaint = (i, j) => isFaint(j) && data[j] === data[i] && data[j + 1] === data[i + 1] && data[j + 2] === data[i + 2] && Math.abs(data[j + 3] - data[i + 3]) <= 8;
  const faint = [];
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    if (!isFaint(i)) continue;
    if (sameSize && van.data[i + 3] === data[i + 3]) continue; // war im Original genauso (z. B. Glas)
    const x = p % w, y = (p - x) / w;
    const n = [x > 0 ? i - 4 : -1, x < w - 1 ? i + 4 : -1, y > 0 ? i - w * 4 : -1, y < h - 1 ? i + w * 4 : -1];
    if (n.some((j) => j >= 0 && sameFaint(i, j))) continue;
    faint.push(p);
  }
  if (faint.length) {
    out.push({
      id: 'faint', level: 'warn', icon: '👻',
      title: 'Fast unsichtbare Pixel',
      text: `${faint.length} Pixel sind nur ganz schwach zu sehen (Dichte unter 15 %). Die Farbe ist also noch nicht ganz weg.`,
      pixels: faint,
      fixes: [
        { label: 'Ganz löschen', run: (d) => { for (const p of faint) d.data.fill(0, p * 4, p * 4 + 4); } },
        { label: 'Voll sichtbar', run: (d) => { for (const p of faint) d.data[p * 4 + 3] = 255; } },
      ],
    });
  }

  // 2) Ersetzte Farbe ist noch da (andere Dichte oder fast gleicher Farbton)
  for (const r of doc.replaced || []) {
    const left = [], similar = [];
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      if (data[i + 3] === 0) continue;
      const dr = Math.abs(data[i] - r.from[0]), dg = Math.abs(data[i + 1] - r.from[1]), db = Math.abs(data[i + 2] - r.from[2]);
      if (!dr && !dg && !db) left.push(p);
      else if (dr <= 10 && dg <= 10 && db <= 10) similar.push(p);
    }
    if (left.length) {
      out.push({
        id: 'left-' + toHex(r.from), level: 'warn', icon: '🎯',
        title: `Alte Farbe ${toHex(r.from)} ist noch da`,
        text: `${left.length} Pixel haben noch die alte Farbe – mit anderer Dichte, deshalb wurden sie nicht mitgetauscht.`,
        swatch: r.from, pixels: left,
        fixes: [{ label: 'Auch tauschen', run: (d, ed) => ed.replaceColor(r.from, r.to) }],
      });
    }
    if (similar.length) {
      out.push({
        id: 'sim-' + toHex(r.from), level: 'info', icon: '🔎',
        title: `Ähnliche Farbe wie ${toHex(r.from)}`,
        text: `${similar.length} Pixel haben fast dieselbe Farbe. Vielleicht sollen die auch getauscht werden?`,
        swatch: r.from, pixels: similar,
        fixes: [{ label: 'Mittauschen', run: (d, ed) => ed.replaceColor(r.from, r.to, 10) }],
      });
    }
  }

  // 3) Bloecke ohne Durchsichtigkeit
  if ((path.startsWith('block/') || path.startsWith('blocks/')) && van && sameSize) {
    let vanOpaque = true;
    for (let i = 3; i < van.data.length; i += 4) if (van.data[i] !== 255) { vanOpaque = false; break; }
    if (vanOpaque) {
      const holes = [];
      for (let i = 3, p = 0; i < data.length; i += 4, p++) if (data[i] !== 255) holes.push(p);
      if (holes.length) {
        out.push({
          id: 'solid', level: 'warn', icon: '🧱',
          title: 'Durchsichtig geht hier nicht',
          text: `Dieser Block ist im Spiel immer ganz undurchsichtig. ${holes.length} durchsichtige Pixel werden dort schwarz oder komisch aussehen.`,
          pixels: holes,
          fixes: [{ label: 'Voll sichtbar machen', run: (d) => { for (const p of holes) d.data[p * 4 + 3] = 255; } }],
        });
      }
    }
  }

  // 4) Groesse passt nicht (bei Animationen zaehlt das Einzelbild, nicht der ganze Streifen)
  if (van && !sameSize) {
    const fh = doc.frameH || h;
    const vfh = van.frameH || van.h;
    const ratioOk = Math.abs(w / fh - van.w / vfh) < 1e-6;
    const factorOk = ratioOk && (w % van.w === 0 || van.w % w === 0);
    if (!factorOk) {
      out.push({
        id: 'size', level: 'error', icon: '📐',
        title: 'Größe passt nicht',
        text: `Ein Bild der Textur ist ${w}×${fh}, beim Original ${van.w}×${vfh}. Minecraft braucht dasselbe Seitenverhältnis (z. B. ${van.w * 2}×${vfh * 2}).`,
      });
    }
  }

  // 5) Animation: Hoehe muss zu den Einzelbildern passen
  if (doc.frameH && h % doc.frameH !== 0) {
    out.push({
      id: 'anim', level: 'error', icon: '🎞️',
      title: 'Animation passt nicht',
      text: `Die Textur besteht aus Einzelbildern mit je ${doc.frameH} Pixeln Höhe, ist aber ${h} hoch.`,
    });
  }

  // 6) Komplett leer
  let any = false;
  for (let i = 3; i < data.length; i += 4) if (data[i]) { any = true; break; }
  if (!any) out.push({ id: 'empty', level: 'info', icon: '🫥', title: 'Textur ist leer', text: 'Alle Pixel sind durchsichtig – im Spiel sieht man davon nichts.' });

  return out;
}

export function describeAlpha(a) {
  if (a === 255) return 'voll sichtbar';
  if (a === 0) return 'unsichtbar';
  return 'Dichte ' + percent(a);
}
