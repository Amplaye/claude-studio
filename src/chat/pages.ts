// La storia di una conversazione, a pagine.
//
// Entrando in una chat — dall'ufficio, dalla cronologia, dopo un reload — si
// rimandava alla pagina tutta la storia, un messaggio per evento: fino a quattromila,
// ognuno disegnato e fatto scorrere per conto suo, con dentro risultati di strumenti
// da decine di kilobyte. Cambiare conversazione costava secondi, e la pagina si
// riempiva di roba che nessuno guardava.
//
// Adesso entra la coda — gli ultimi eventi, abbastanza da riempire lo schermo e un
// po' di piu' — in un messaggio solo, e il resto arriva a pezzi quando si scorre in
// su. Tutto quello che serve a decidere i pezzi sta qui, puro, senza vscode: lo
// prova scripts/pages-check.cjs.
import type { PageCarry, Wire } from '../engine/protocol';

/** Un evento della storia, col suo numero d'ordine. */
export interface Past {
  /**
   * Cresce sempre, anche quando la storia si accorcia in testa: e' il segnalibro con
   * cui la pagina chiede «quelli prima di questo». Una posizione nell'elenco non
   * andrebbe bene — l'elenco perde i pezzetti dello streaming quando un blocco si
   * chiude, e la testa quando supera il tetto.
   */
  n: number;
  e: Wire;
}

/** Quanti eventi almeno in una pagina: la coda di un turno lungo, o due turni corti. */
export const PAGE_EVENTS = 120;
/**
 * E quanto peso al massimo, a spanne in caratteri, prima di cercare il taglio: una
 * pagina di centoventi `Read` da trentamila caratteri l'uno sono quattro megabyte, e
 * a quel punto la pagina e' gia' piena da un pezzo.
 */
export const PAGE_WEIGHT = 400_000;

/** Quanto di un risultato arriva alla pagina: quello che la card mostra, e non di piu'. */
export const OUT_LINES = 400;
export const OUT_CHARS = 48_000;

/**
 * Gli strumenti che contano come «file toccati» nella riga di fine turno. E' il
 * gemello di `DIFF_TOOLS` in webview/chat.js, che non e' bundlata e non puo'
 * importarlo da qui: se cambia la', cambia anche qui.
 */
const RECAP_WRITERS = new Set(['Write', 'Edit', 'NotebookEdit']);

/**
 * Da dove puo' cominciare una pagina quando non resta niente di aperto. Non un
 * risultato o un verdetto (chiudono qualcosa che sta nella pagina prima), non le note
 * ricordate (vanno sotto il messaggio che le ha chiamate), non la scheda del piano
 * (va subito dopo la sua chiamata), e non un pezzetto di streaming: il suo blocco e'
 * nato prima, e resterebbe vuoto nella pagina di sopra.
 */
const CUT_OK = new Set<Wire['k']>(['tool_start', 'block_start', 'block_final', 'error', 'autofix', 'ask', 'turn_end']);

/** Quello che la pagina non disegna: non serve rimandarlo. */
const DROP = new Set<Wire['k']>(['task', 'session', 'busy', 'turn_start', 'hello', 'chime', 'prefs', 'models', 'commands', 'mode', 'sid']);

/**
 * Accorcia il risultato di uno strumento prima che parta verso la pagina.
 *
 * La card ne mostra le prime quattrocento righe e nient'altro, ma il testo viaggiava
 * intero — e restava intero nella storia, rimandato a ogni ingresso. Il conto vero
 * delle righe resta (`lines`), perche' e' quello che la card scrive accanto al nome.
 * Chi deve leggere il risultato intero (le task, il piano) lo legge prima, dall'evento
 * originale: questa e' solo la copia per la pagina.
 */
export function slimToolEnd(e: Wire): Wire {
  if (e.k !== 'tool_end' || typeof e.text !== 'string' || e.text.length <= OUT_CHARS) return e;
  const text = e.text;
  let lines = 1;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) lines++;
  let kept = text.slice(0, OUT_CHARS);
  const parts = kept.split('\n');
  if (parts.length > OUT_LINES) kept = parts.slice(0, OUT_LINES).join('\n');
  return { ...e, text: kept, lines, clipped: true };
}

/** Il primo indice con un numero d'ordine almeno `n` (la storia e' in ordine). */
export function seqIndex(h: Past[], n: number): number {
  let lo = 0;
  let hi = h.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (h[mid].n < n) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** A spanne, quanto pesa un evento una volta scritto in JSON. */
function weightOf(e: Wire): number {
  switch (e.k) {
    case 'tool_start': {
      try {
        return 120 + JSON.stringify(e.input ?? null).length;
      } catch {
        return 120;
      }
    }
    case 'tool_end':
    case 'block_final':
    case 'delta':
      return 80 + (e.text ? e.text.length : 0);
    case 'user':
      return 80 + (e.text ? e.text.length : 0) + (e.images || []).reduce((s, i) => s + (i.data ? i.data.length : 0), 0);
    default:
      return 120;
  }
}

/**
 * Dove si puo' tagliare, fra 0 e `end`: `safe[i]` vuol dire che una pagina puo'
 * cominciare dall'evento i senza lasciare niente a meta'.
 *
 * Un messaggio tuo apre sempre un turno, e li' si taglia sempre. Dentro un turno si
 * taglia solo dove non c'e' niente di aperto: nessuno strumento senza il suo
 * risultato, nessun permesso senza il suo verdetto, e quindi nessun sub-agent a meta'
 * (i suoi pezzi stanno dentro la card dello strumento che l'ha lanciato, che e'
 * aperto finche' lui lavora). Altrimenti un risultato finirebbe lontano dalla sua
 * card — e la card, rimasta nella pagina prima, girerebbe per sempre.
 *
 * Uno strumento interrotto il risultato non lo riceve mai: un messaggio nuovo o una
 * fine turno chiudono tutto quello che era rimasto aperto.
 */
export function cutPoints(h: Past[], end: number): Uint8Array {
  const safe = new Uint8Array(end + 1);
  const open = new Set<string>();
  for (let i = 0; i < end; i++) {
    const e = h[i].e;
    if (e.k === 'user') {
      open.clear();
      safe[i] = 1;
    } else if (!open.size && CUT_OK.has(e.k) && !(e as { parent?: string | null }).parent) {
      safe[i] = 1;
    }
    if (e.k === 'tool_start') open.add('t' + e.id);
    else if (e.k === 'tool_end') open.delete('t' + e.id);
    else if (e.k === 'ask') open.add('a' + e.id);
    else if (e.k === 'ask_done') open.delete('a' + e.id);
    else if (e.k === 'turn_end') open.clear();
  }
  safe[end] = 1;
  return safe;
}

/**
 * Dove comincia la pagina che finisce a `end` (escluso): abbastanza indietro da
 * avere `PAGE_EVENTS` eventi — o `PAGE_WEIGHT` di peso, se arriva prima — e poi
 * ancora indietro fino al primo punto in cui si puo' tagliare.
 */
export function pageStart(h: Past[], end: number): number {
  if (end <= 0) return 0;
  const safe = cutPoints(h, end);
  let i = end;
  let count = 0;
  let weight = 0;
  while (i > 0 && count < PAGE_EVENTS && weight < PAGE_WEIGHT) {
    i--;
    const k = h[i].e.k;
    if (DROP.has(k)) continue;
    weight += weightOf(h[i].e);
    // Contano le cose che la pagina disegna: i pezzetti dello streaming partono come
    // uno solo, e la fila non sta nel discorso.
    if (k !== 'delta' && k !== 'queued' && k !== 'unqueued') count++;
  }
  while (i > 0 && !safe[i]) i--;
  return i;
}

/**
 * Quello che il turno tagliato aveva gia' fatto prima di `start`: i passi e i file,
 * contati come li conta la pagina (un passo per strumento, sub-agent compresi; un file
 * per percorso scritto). Senza, la riga di fine turno di una pagina che comincia a
 * meta' turno direbbe tre passi per un turno che ne ha fatti novanta.
 *
 * Un turno ricomincia a ogni messaggio tuo e a ogni giro dell'autofix — gli stessi
 * punti in cui la pagina azzera i suoi conti.
 */
export function carryAt(h: Past[], start: number): PageCarry | undefined {
  if (start <= 0 || start >= h.length || h[start].e.k === 'user') return undefined;
  let i = start - 1;
  while (i > 0 && h[i].e.k !== 'user' && h[i].e.k !== 'autofix') i--;
  let steps = 0;
  const files = new Map<string, number>();
  for (let j = i; j < start; j++) {
    const e = h[j].e;
    if (e.k === 'user' || e.k === 'autofix') {
      steps = 0;
      files.clear();
      continue;
    }
    if (e.k !== 'tool_start') continue;
    steps++;
    if (!RECAP_WRITERS.has(e.name) || !e.input || typeof e.input !== 'object') continue;
    const inp = e.input as { file_path?: unknown; path?: unknown };
    const p = inp.file_path || inp.path;
    if (typeof p === 'string' && p) files.set(p, (files.get(p) || 0) + 1);
  }
  return steps || files.size ? { steps, files: [...files] } : undefined;
}

/**
 * Gli eventi della pagina, pronti per partire.
 *
 * - quello che la pagina non disegna resta a casa;
 * - i pezzetti dello streaming di un blocco ancora aperto diventano uno solo: il
 *   blocco nasce dove arriva il primo, e il resto e' solo testo che si aggiunge;
 * - la fila dei messaggi scritti mentre lavorava: nella coda restano solo quelli
 *   ancora in attesa (gli altri sono partiti o ritirati, e nella conversazione ci
 *   sono gia' come messaggi tuoi); nelle pagine vecchie niente, perche' quella fila
 *   non c'e' piu' da un pezzo.
 */
export function pageEvents(h: Past[], start: number, end: number, tail: boolean): Wire[] {
  const gone = new Set<string>();
  if (tail) for (const p of h) if (p.e.k === 'unqueued') gone.add(p.e.id);
  const out: Wire[] = [];
  const deltaAt = new Map<string, number>();
  for (let j = start; j < end; j++) {
    const e = h[j].e;
    if (DROP.has(e.k)) continue;
    if (e.k === 'unqueued') continue;
    if (e.k === 'queued' && (!tail || gone.has(e.id))) continue;
    if (e.k === 'delta') {
      const at = deltaAt.get(e.id);
      if (at !== undefined) {
        const d = out[at] as Extract<Wire, { k: 'delta' }>;
        out[at] = { ...d, text: d.text + e.text };
        continue;
      }
      deltaAt.set(e.id, out.length);
    }
    out.push(e);
  }
  return out;
}

/** Una pagina intera: dove comincia, cosa contiene, se prima c'e' altro. */
export function page(h: Past[], end: number, tail: boolean, nextSeq: number) {
  const start = pageStart(h, end);
  return {
    events: pageEvents(h, start, end, tail),
    first: start < h.length ? h[start].n : nextSeq,
    more: start > 0,
    carry: carryAt(h, start),
  };
}
