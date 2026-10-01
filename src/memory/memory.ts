// La memoria come la usano gli strumenti: cercare, leggere, ricordare da soli.
//
// Tutto testo, e tutto passato da `mask`: quello che esce di qui finisce nel discorso,
// e fra le note ci sono credenziali vere. Niente `vscode` e niente SDK, cosi'
// scripts/memory-check.cjs prova ogni risposta su una cartella finta.
import * as path from 'node:path';
import { allMemoryDirs, memoryDirFor } from '../context/paths';
import { mask } from './mask';
import type { Note } from './notes';
import { neighbours, notesIn, search, snippets } from './search';

export type Scope = 'project' | 'all';

/** La riga in testa a ogni risposta: una nota dice com'erano le cose il giorno in cui e' stata scritta. */
export const PAST =
  'Notes written in the past: each one holds as of its date — check its ⚠️ before relying on it.';

/** gg/mm/aaaa: e' come si leggono le date qui, e un mese non si scambia per un giorno. */
export function day(ms: number): string {
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return '?';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Tipo, data, avvisi: quello che serve per decidere quanto fidarsi. */
function tags(n: Pick<Note, 'type' | 'date' | 'warnings'>): string {
  return [n.type, day(n.date), n.warnings ? `${n.warnings}⚠️` : ''].filter(Boolean).join(' · ');
}

/** Le cartelle in cui cercare, con un'etichetta: il nome della cartella del progetto. */
function dirsFor(cwd: string, scope: Scope): { dir: string; label: string }[] {
  if (scope === 'all') return allMemoryDirs().map((dir) => ({ dir, label: path.basename(path.dirname(dir)) }));
  const dir = memoryDirFor(cwd);
  return [{ dir, label: '' }];
}

/** Le note di piu' cartelle insieme, ognuna con la sua etichetta. */
function corpus(cwd: string, scope: Scope) {
  const out: { entries: ReturnType<typeof notesIn>; label: string; dir: string }[] = [];
  for (const { dir, label } of dirsFor(cwd, scope)) out.push({ entries: notesIn(dir), label, dir });
  return out;
}

export interface Found {
  slug: string;
  name: string;
  description: string;
  type: string;
  date: number;
  warnings: number;
  file: string;
  label: string;
  score: number;
  covered: number;
  asked: number;
  head: number;
  lines: string[];
  seeAlso: string[];
}

/** Le note che parlano di `query`, gia' pronte da mostrare. */
export function findNotes(cwd: string, query: string, scope: Scope = 'project', limit = 5): Found[] {
  const n = Math.max(1, Math.min(10, Math.floor(limit) || 5));
  const found: Found[] = [];
  for (const { entries, label } of corpus(cwd, scope)) {
    for (const h of search(entries, query, n)) {
      found.push({
        slug: h.note.slug,
        name: h.note.name,
        description: h.note.description,
        type: h.note.type,
        date: h.note.date,
        warnings: h.note.warnings,
        file: h.note.file,
        label,
        score: h.score,
        covered: h.covered,
        asked: h.asked,
        head: h.head,
        lines: snippets(h.note, h.matched),
        seeAlso: neighbours(entries, h.note),
      });
    }
  }
  found.sort((a, b) => b.score - a.score);
  const top = found.slice(0, n);
  // «Vedi anche» sono le note a un passo che non sono gia' fra i risultati.
  const shown = new Set(top.map((f) => f.slug));
  for (const f of top) f.seeAlso = f.seeAlso.filter((s) => !shown.has(s)).slice(0, 4);
  return top;
}

/** La risposta di `memory_search`. */
export function searchMemory(cwd: string, query: string, scope: Scope = 'project', limit = 5): string {
  const q = String(query || '').trim();
  if (!q) return 'Say what to look for: a topic, a name, a few words.';
  const dirs = dirsFor(cwd, scope);
  const found = findNotes(cwd, q, scope, limit);
  if (!found.length) {
    const where = scope === 'all' ? 'in any project' : `in this project (${dirs[0]?.dir ?? '?'})`;
    return `${PAST}\n\nNo note about «${q}» ${where}.` + (scope === 'all' ? '' : ' Try scope "all" to look in the other projects too.');
  }
  const rows = found.map((f, i) => {
    const head = `${i + 1}. ${f.slug}${f.label ? ` [${f.label}]` : ''} — ${f.description || f.name} (${tags(f)})`;
    return [
      head,
      `   file: ${f.file}`,
      ...f.lines.map((l) => `   > ${l}`),
      ...(f.seeAlso.length ? [`   see also: ${f.seeAlso.join(', ')}`] : []),
    ].join('\n');
  });
  return mask(`${PAST}\n\n${rows.join('\n\n')}\n\nRead a whole note with memory_read.`);
}

/**
 * La risposta di `memory_read`: la nota intera, mascherata, con la data, chi la cita e
 * i link che non portano da nessuna parte.
 */
export function readMemory(cwd: string, name: string): string {
  const want = String(name || '')
    .trim()
    .replace(/^\[\[|\]\]$/g, '');
  if (!want) return 'Say which note: its name, as memory_search shows it.';
  const base = path.basename(want.replace(/\\/g, '/')).replace(/\.md$/i, '');
  const low = base.toLowerCase();
  // Prima il progetto, poi tutti gli altri: lo stesso nome puo' stare in due posti, e
  // quello di casa e' quasi sempre quello che si intende.
  for (const scope of ['project', 'all'] as const) {
    for (const { entries } of corpus(cwd, scope)) {
      const e =
        entries.find((x) => x.note.slug === base) ||
        entries.find((x) => x.note.slug.toLowerCase() === low) ||
        entries.find((x) => x.note.name.toLowerCase() === want.toLowerCase());
      if (!e) continue;
      const n = e.note;
      const slugs = new Set(entries.map((x) => x.note.slug));
      const citedBy = entries.filter((x) => x.note.links.includes(n.slug)).map((x) => x.note.slug);
      const broken = n.links.filter((l) => !slugs.has(l));
      return mask(
        [
          `${n.name} (${n.slug} · ${tags(n)})`,
          `file: ${n.file}`,
          `Written on ${day(n.date)}: it holds as of that date.`,
          `cited by: ${citedBy.length ? citedBy.join(', ') : 'no other note'}`,
          ...(broken.length ? [`broken links: ${broken.join(', ')}`] : []),
          '',
          n.body.trim(),
        ].join('\n')
      );
    }
  }
  return `No note called «${want}». Look for it with memory_search.`;
}

export interface Recalled {
  slug: string;
  name: string;
  description: string;
  date: number;
  file: string;
}

/**
 * Le note che vale la pena ricordare da sole, per un messaggio: al massimo tre, e solo
 * se fanno davvero centro. Un ricordo sbagliato in testa a ogni messaggio e' rumore che
 * si paga a ogni turno, quindi la soglia e' alta: almeno meta' delle parole del
 * messaggio dentro la nota (e almeno due, quando ce ne sono di piu'), almeno una nel
 * nome o nella descrizione — una nota che le ha solo in fondo al corpo parla d'altro —
 * e un punteggio vicino a quello della migliore.
 */
export function recall(cwd: string, prompt: string, max = 3): Recalled[] {
  const found = findNotes(cwd, prompt, 'project', max);
  if (!found.length) return [];
  const best = found[0].score;
  return found
    .filter(
      (f) => f.covered >= Math.min(2, f.asked) && f.covered / f.asked >= 0.5 && f.head >= 1 && f.score >= best * 0.6
    )
    .slice(0, max)
    .map((f) => ({ slug: f.slug, name: f.name, description: mask(f.description), date: f.date, file: f.file }));
}

/** Il pezzo di contesto che il ricordo automatico aggiunge al messaggio: nomi, descrizioni, date. */
export function recallContext(notes: Recalled[]): string {
  return [
    'From this project\'s memory, possibly relevant to this message. These notes were written in the past and hold as of their date: read one with mcp__memoria__memory_read before relying on it.',
    ...notes.map((n) => `- ${n.slug} — ${n.description || n.name} (${day(n.date)})`),
  ].join('\n');
}
