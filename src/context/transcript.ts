// Reading the transcripts. The tick can fire every second and a half, so in here the
// same byte is never read twice.
//
// The difference from 0.0.6, and it's the most important fix: over there the cost was
// summed over only the last 256 KB of the file. On a long conversation that produced
// an understated cost — and on top of that it wasn't shown anywhere. Here the file is
// read in full **once**, and from then on only the new part: the cost is the real one
// from the beginning, and the work per tick stays what it was before, or less.
import * as fs from 'node:fs';

export interface Scan {
  /** Context used: usage of the last message of the main thread. */
  usedTokens: number;
  /** Cost of the whole conversation, from the first message. */
  costUsd: number;
  /** First human prompt: it's what gives the card a name. */
  prompt: string;
  /** How many lines were digested: useful to the tests. */
  lines: number;
}

interface Entry extends Scan {
  /** Bytes already read. */
  offset: number;
  /** Line tail left half-written between two reads (in bytes, not characters). */
  carry: Buffer;
  /** If the file declares a total of its own, that beats the line-by-line sum. */
  declaredTotal: number | null;
  sum: number;
}

const cache = new Map<string, Entry>();

/** The tests start from scratch: without this the second test would see the first. */
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
 * A conversation's state, from its transcript.
 * If the file hasn't grown since last time, the disk isn't touched.
 */
export function scanTranscript(file: string): Scan {
  let size: number;
  try {
    size = fs.statSync(file).size;
  } catch {
    return { usedTokens: 0, costUsd: 0, prompt: '', lines: 0 };
  }

  let e = cache.get(file);
  // File shorter than what we had read: it was rewritten from scratch. Starting again
  // from the old offset would give made-up numbers.
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
  // The last piece can be a half-written line: it's set aside in bytes, so a
  // multibyte character straddling two reads doesn't get broken.
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
    return; // half a line or noise: not an error worth reporting
  }
  if (!o || typeof o !== 'object') return;
  e.lines++;

  // Sub-agents cost money too, so everything gets summed.
  if (typeof o.costUSD === 'number') e.sum += o.costUSD;
  if (typeof o.totalCostUsd === 'number') e.declaredTotal = o.totalCostUsd;
  e.costUsd = e.declaredTotal ?? e.sum;

  // Not the context: a sub-agent's is a window of its own, and taking it at face
  // value would collapse the main thread's percentage the moment a Task starts.
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

/** The first prompt written by a person: automatic insertions don't count. */
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
