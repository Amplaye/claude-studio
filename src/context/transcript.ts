// Lettura dei transcript. Il tick puo' scattare ogni secondo e mezzo, quindi qui
// dentro non si rilegge mai due volte lo stesso byte.
//
// Differenza con la 0.0.6, ed e' la correzione piu' importante: li' il costo veniva
// sommato solo sugli ultimi 256 KB del file. Su una conversazione lunga usciva un
// costo sottostimato — e per giunta non era mostrato da nessuna parte. Qui il file
// si legge tutto **una volta sola**, e da li' in poi solo la parte nuova: il costo e'
// quello vero dall'inizio, e il lavoro per tick resta quello di prima o meno.
import * as fs from 'node:fs';

export interface Scan {
  /** Contesto occupato: usage dell'ultimo messaggio del discorso principale. */
  usedTokens: number;
  /** Costo dell'intera conversazione, dal primo messaggio. */
  costUsd: number;
  /** Primo prompt umano: serve a dare un nome alla card. */
  prompt: string;
  /** Quante righe sono state digerite: utile alle prove. */
  lines: number;
}

interface Entry extends Scan {
  /** Byte gia' letti. */
  offset: number;
  /** Coda di riga rimasta a meta' fra due letture (in byte, non in caratteri). */
  carry: Buffer;
  /** Se il file dichiara un totale suo, quello batte la somma riga per riga. */
  declaredTotal: number | null;
  sum: number;
}

const cache = new Map<string, Entry>();

/** Le prove partono da zero: senza questo la seconda prova vedrebbe la prima. */
export function forgetTranscripts() {
  cache.clear();
}

function fresh(): Entry {
  return {
    usedTokens: 0,
    costUsd: 0,
    prompt: '',
    lines: 0,
    offset: 0,
    carry: Buffer.alloc(0),
    declaredTotal: null,
    sum: 0,
  };
}

/**
 * Lo stato di una conversazione dal suo transcript.
 * Se il file non e' cresciuto dall'ultima volta non si tocca il disco.
 */
export function scanTranscript(file: string): Scan {
  let size: number;
  try {
    size = fs.statSync(file).size;
  } catch {
    return { usedTokens: 0, costUsd: 0, prompt: '', lines: 0 };
  }

  let e = cache.get(file);
  // File piu' corto di quanto avevamo letto: e' stato riscritto da capo. Ripartire
  // dal vecchio offset darebbe numeri inventati.
  if (!e || size < e.offset) {
    e = fresh();
    cache.set(file, e);
  }
  if (size === e.offset) return snapshot(e);

  let chunk: Buffer;
  try {
    const fd = fs.openSync(file, 'r');
    try {
      chunk = Buffer.alloc(size - e.offset);
      fs.readSync(fd, chunk, 0, chunk.length, e.offset);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return snapshot(e);
  }
  e.offset = size;

  const buf = e.carry.length ? Buffer.concat([e.carry, chunk]) : chunk;
  const text = buf.toString('utf8');
  const rows = text.split('\n');
  // L'ultimo pezzo puo' essere una riga scritta a meta': si tiene da parte in byte,
  // cosi' non si spezza un carattere multibyte a cavallo di due letture.
  const tail = rows.pop() ?? '';
  e.carry = tail ? buf.subarray(buf.length - Buffer.byteLength(tail, 'utf8')) : Buffer.alloc(0);

  for (const row of rows) digest(e, row);
  return snapshot(e);
}

function snapshot(e: Entry): Scan {
  return { usedTokens: e.usedTokens, costUsd: e.costUsd, prompt: e.prompt, lines: e.lines };
}

function digest(e: Entry, row: string) {
  const line = row.trim();
  if (!line) return;
  let o: any;
  try {
    o = JSON.parse(line);
  } catch {
    return; // riga a meta' o rumore: non e' un errore da raccontare
  }
  if (!o || typeof o !== 'object') return;
  e.lines++;

  // Il costo lo pagano anche i sub-agent, quindi si somma tutto.
  if (typeof o.costUSD === 'number') e.sum += o.costUSD;
  if (typeof o.totalCostUsd === 'number') e.declaredTotal = o.totalCostUsd;
  e.costUsd = e.declaredTotal ?? e.sum;

  // Il contesto no: quello del sub-agent e' una finestra sua, e prenderlo per buono
  // farebbe crollare la percentuale del discorso principale appena parte un Task.
  const usage = o.message?.usage;
  if (usage && !o.isSidechain) {
    e.usedTokens =
      (usage.input_tokens || 0) +
      (usage.cache_read_input_tokens || 0) +
      (usage.cache_creation_input_tokens || 0) +
      (usage.output_tokens || 0);
  }

  if (!e.prompt && o.type === 'user' && o.message) e.prompt = humanPrompt(o.message.content);
}

/** Il primo prompt scritto da una persona: gli inserimenti automatici non contano. */
function humanPrompt(content: unknown): string {
  let txt = '';
  if (typeof content === 'string') txt = content;
  else if (Array.isArray(content)) {
    for (const p of content as any[]) {
      if (typeof p === 'string') {
        txt = p;
        break;
      }
      if (p?.type === 'text') {
        txt = p.text;
        break;
      }
    }
  }
  txt = (txt || '').trim();
  if (!txt) return '';
  if (
    /^(<system-reminder|<local-command-caveat|----- BEGIN HANDOFF|# \[|♻|<command-name|<command-message)/.test(
      txt
    )
  ) {
    return '';
  }
  if (/^Caveat:|^This session is being continued/.test(txt)) return '';
  const cmd = txt.match(/<command-name>\s*([^<]+?)\s*<\/command-name>/);
  if (cmd) return cmd[1].trim().slice(0, 80);
  return txt.replace(/\s+/g, ' ').slice(0, 80);
}
