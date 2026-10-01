// Cercare nella memoria per argomento.
//
// Niente embedding: nessun modello da scaricare, niente rete, niente quota. Le note
// sono qualche centinaio di file corti, scritti da chi lavora qui e con le parole di
// chi lavora qui — basta un indice di parole fatto bene: minuscole e accenti tolti
// («Fuoricittà» e «fuoricitta» sono la stessa parola), le parole vuote scartate, una
// radice corta (stampante e stampanti coincidono), il prefisso per le parole lunghe
// abbastanza, e BM25 che da' piu' peso al nome e alla descrizione che al corpo.
//
// L'indice resta in memoria, nota per nota, finche' il file non cambia: a ogni ricerca
// la cartella si ripassa con `stat` e si rilegge solo cio' che e' cambiato. Centinaia
// di file costano millisecondi.
import * as fs from 'node:fs';
import { type Note, listNoteFiles, parseNote } from './notes';

/** Parole che ci sono dappertutto e non distinguono niente, in italiano e in inglese. */
const STOP = new Set(
  (
    'il lo la i gli le un uno una di da in con su per tra fra a e o ma se che chi cui non piu ' +
    'del dello della dei degli delle al allo alla ai agli alle dal dallo dalla dai dagli dalle ' +
    'nel nello nella nei negli nelle sul sullo sulla sui sugli sulle col coi come anche gia ' +
    'quando dove cosa questo questa questi queste quello quella quelli quelle sono era essere ' +
    'ha hanno ho hai abbiamo fa fare stato stata si ci ne mi ti vi lui lei noi voi loro suo sua ' +
    'suoi sue mio mia tuo tua nostro nostra solo poi ora qui li sempre mai tutto tutti tutte ' +
    'molto poco ogni ancora sappiamo sai sapere perche quale quali quanto fammi dimmi rifai mostrami ' +
    'puoi potresti vorrei voglio ' +
    'the an of to in on at by for with from and or but not no is are was were be been being ' +
    'it its this that these those as if then than so do does did done has have had what which ' +
    'who whom how when where why there here all any some can could would should will just about ' +
    'into over also only very we you they he she his her their our your my me us them know please ' +
    'make let'
  ).split(/\s+/)
);

/** La radice corta: una parola lunga perde la vocale in fondo, e un plurale inglese la s. */
export function stem(w: string): string {
  if (w.length >= 5 && /[aeiou]$/.test(w)) return w.slice(0, -1);
  if (w.length > 4 && /[^su]s$/.test(w)) return w.slice(0, -1);
  return w;
}

/** Le parole di un testo, nella forma in cui si confrontano. */
export function terms(text: string): string[] {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem);
}

const count = (words: string[]) => {
  const m = new Map<string, number>();
  for (const w of words) m.set(w, (m.get(w) ?? 0) + 1);
  return m;
};

interface Entry {
  note: Note;
  mtime: number;
  size: number;
  /** Le parole per campo, con quante volte compaiono. */
  f: { name: Map<string, number>; desc: Map<string, number>; body: Map<string, number> };
  len: { name: number; desc: number; body: number };
}

const WEIGHT = { name: 3, desc: 2, body: 1 } as const;
const K1 = 1.2;
const B = 0.75;

/** Le cartelle gia' lette, file per file: si rilegge solo quello che e' cambiato. */
const cache = new Map<string, Map<string, Entry>>();

/** Le note di una cartella, aggiornate a adesso. */
export function notesIn(dir: string): Entry[] {
  let known = cache.get(dir);
  if (!known) cache.set(dir, (known = new Map()));
  const seen = new Set<string>();
  for (const file of listNoteFiles(dir)) {
    seen.add(file);
    let st: fs.Stats;
    try {
      st = fs.statSync(file);
    } catch {
      continue;
    }
    const was = known.get(file);
    if (was && was.mtime === st.mtimeMs && was.size === st.size) continue;
    let text = '';
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const note = parseNote(file, text, st.mtimeMs);
    const name = terms(`${note.name} ${note.slug.replace(/[-_]/g, ' ')}`);
    const desc = terms(note.description);
    const body = terms(note.body);
    known.set(file, {
      note,
      mtime: st.mtimeMs,
      size: st.size,
      f: { name: count(name), desc: count(desc), body: count(body) },
      len: { name: name.length, desc: desc.length, body: body.length },
    });
  }
  for (const file of [...known.keys()]) if (!seen.has(file)) known.delete(file);
  return [...known.values()];
}

export interface Hit {
  note: Note;
  score: number;
  /** Le parole del corpo che hanno fatto centro: servono a scegliere le righe da mostrare. */
  matched: Set<string>;
  /** Quante parole della domanda la nota contiene, su quante erano. */
  covered: number;
  asked: number;
  /** Quante di quelle stanno nel nome o nella descrizione: e' li' che una nota dice di cosa parla. */
  head: number;
}

/**
 * Le note che parlano di `query`, le migliori per prime.
 *
 * Una parola della domanda lunga almeno quattro lettere vale anche come inizio di
 * parola: «stamp» trova stampante, stampanti e stampa. Piu' corta, deve combaciare
 * intera — se no «re» troverebbe mezzo vocabolario. Da sette lettere in su l'inizio
 * perde le ultime due: in italiano e' li' che cambia la parola, e «stampava» deve
 * trovare la stampante.
 */
export function search(entries: Entry[], query: string, limit: number): Hit[] {
  const qs = [...new Set(terms(query))];
  if (!qs.length || !entries.length) return [];
  const N = entries.length;
  const avg = {
    name: entries.reduce((s, e) => s + e.len.name, 0) / N || 1,
    desc: entries.reduce((s, e) => s + e.len.desc, 0) / N || 1,
    body: entries.reduce((s, e) => s + e.len.body, 0) / N || 1,
  };
  const matches = (q: string, w: string) => {
    if (w === q) return true;
    const key = q.length >= 7 ? q.slice(0, -2) : q;
    return key.length >= 4 && w.startsWith(key);
  };

  const scores = new Map<Entry, Hit>();
  for (const q of qs) {
    // Per ogni nota, quante volte la parola (o una che comincia cosi') compare in ogni campo.
    const per: { e: Entry; tf: { name: number; desc: number; body: number }; words: string[] }[] = [];
    for (const e of entries) {
      const tf = { name: 0, desc: 0, body: 0 };
      const words: string[] = [];
      for (const field of ['name', 'desc', 'body'] as const) {
        for (const [w, n] of e.f[field]) {
          if (!matches(q, w)) continue;
          tf[field] += n;
          if (field === 'body') words.push(w);
        }
      }
      if (tf.name || tf.desc || tf.body) per.push({ e, tf, words });
    }
    if (!per.length) continue;
    const idf = Math.log(1 + (N - per.length + 0.5) / (per.length + 0.5));
    for (const { e, tf, words } of per) {
      let s = 0;
      for (const field of ['name', 'desc', 'body'] as const) {
        const t = tf[field];
        if (!t) continue;
        s += WEIGHT[field] * ((t * (K1 + 1)) / (t + K1 * (1 - B + (B * e.len[field]) / avg[field])));
      }
      const hit = scores.get(e) ?? { note: e.note, score: 0, matched: new Set<string>(), covered: 0, asked: qs.length, head: 0 };
      hit.score += idf * s;
      hit.covered++;
      if (tf.name || tf.desc) hit.head++;
      for (const w of words) hit.matched.add(w);
      // Il nome e la descrizione fanno centro anche loro: le righe del corpo si
      // scelgono comunque sulle parole della domanda.
      hit.matched.add(q);
      scores.set(e, hit);
    }
  }
  return [...scores.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Le righe del corpo che dicono di piu' su quello che si e' cercato: una o due. */
export function snippets(note: Note, matched: Set<string>, max = 2): string[] {
  const rows: { line: string; n: number; at: number }[] = [];
  note.body.split(/\r?\n/).forEach((raw, at) => {
    const line = raw.trim();
    if (!line || /^---+$/.test(line)) return;
    const ws = terms(line);
    let n = 0;
    for (const w of ws) for (const m of matched) if (w === m || (m.length >= 4 && w.startsWith(m.length >= 7 ? m.slice(0, -2) : m))) n++;
    if (n) rows.push({ line, n, at });
  });
  return rows
    .sort((a, b) => b.n - a.n || a.at - b.at)
    .slice(0, max)
    .sort((a, b) => a.at - b.at)
    .map((r) => (r.line.length > 200 ? r.line.slice(0, 199) + '…' : r.line));
}

/** Le note a un passo: quelle che questa cita e quelle che citano lei. */
export function neighbours(entries: Entry[], note: Note): string[] {
  const slugs = new Set(entries.map((e) => e.note.slug));
  const out = new Set<string>();
  for (const l of note.links) if (slugs.has(l) && l !== note.slug) out.add(l);
  for (const e of entries) if (e.note.slug !== note.slug && e.note.links.includes(note.slug)) out.add(e.note.slug);
  return [...out];
}
