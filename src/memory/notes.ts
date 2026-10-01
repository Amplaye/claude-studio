// Le note della memoria, lette come stanno sul disco.
//
// La CLI tiene la sua memoria in ~/.claude/projects/<progetto>/memory: un file per
// ricordo, piu' `MEMORY.md`, l'indice che carica a ogni sessione. A una nota ci si
// arriva solo se una riga dell'indice la nomina — e l'indice cresce, si legge tutto
// ogni volta, e prima o poi la riga giusta non c'e'. Qui le note si leggono tutte, per
// poterle cercare per argomento (vedi search.ts).
//
// I formati sono quelli che si trovano davvero, non quello che dice la guida: il
// frontmatter con `metadata:` annidato di adesso, quello piatto di prima con `type:`
// in cima, le note senza frontmatter, gli indici `_index_*.md`, e i `._*` che il Mac
// lascia accanto a ogni file copiato da un suo disco — quelli non sono note e si
// saltano.
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface Note {
  /** Il nome del file senza `.md`: e' quello che i link `[[slug]]` usano. */
  slug: string;
  file: string;
  name: string;
  description: string;
  /** user · feedback · project · reference, o '' se la nota non lo dice. */
  type: string;
  /** Quando e' stata scritta: `metadata.modified`, altrimenti la data del file. */
  date: number;
  /** Il testo, senza il frontmatter. */
  body: string;
  /** Le note che cita: `[[slug]]` e `(file.md)`. */
  links: string[];
  /** Quante ⚠️ ha: sono le cose da ricontrollare prima di fidarsi. */
  warnings: number;
}

/** I file che sono note: i `.md`, tranne l'indice e la spazzatura del Mac. */
export function isNoteFile(name: string): boolean {
  return /\.md$/i.test(name) && !name.startsWith('._') && name.toLowerCase() !== 'memory.md';
}

/** Le note di una cartella, per nome di file. Una cartella che non c'e' non ne ha. */
export function listNoteFiles(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isFile() && isNoteFile(d.name))
      .map((d) => path.join(dir, d.name));
  } catch {
    return [];
  }
}

/**
 * Il frontmatter, letto quanto basta: chiavi in cima, una sola annidata (`metadata:`),
 * valori fra virgolette o no, e i blocchi `>`/`|` su piu' righe. Non e' YAML intero e
 * non deve esserlo: una nota con un frontmatter strano resta una nota, con i campi
 * che si sono capiti.
 */
function frontmatter(raw: string): { fields: Record<string, string>; body: string } {
  const text = raw.replace(/^﻿/, '');
  const m = text.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!m) return { fields: {}, body: text };
  const fields: Record<string, string> = {};
  const lines = m[1].split(/\r?\n/);
  let parent = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const kv = line.match(/^(\s*)([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    const [, indent, key, rest] = kv;
    if (!indent) parent = '';
    const name = indent && parent ? `${parent}.${key}` : key;
    let value = rest.trim();
    if (!value) {
      // `metadata:` e simili: quello che viene dopo, rientrato, gli appartiene.
      if (!indent) parent = key;
      continue;
    }
    if (value === '>' || value === '|' || value === '>-' || value === '|-') {
      const own = indent.length;
      const parts: string[] = [];
      while (i + 1 < lines.length && (lines[i + 1].trim() === '' || lines[i + 1].search(/\S/) > own)) {
        parts.push(lines[++i].trim());
      }
      value = parts.join(value.startsWith('|') ? '\n' : ' ').trim();
    } else if (/^".*"$/.test(value)) {
      try {
        value = JSON.parse(value);
      } catch {
        value = value.slice(1, -1);
      }
    } else if (/^'.*'$/.test(value)) {
      value = value.slice(1, -1).replace(/''/g, "'");
    }
    fields[name] = value;
  }
  return { fields, body: text.slice(m[0].length) };
}

/** Le note citate: `[[slug]]`, `[[slug|come la chiamo]]`, e `(nome.md)` dei link markdown. */
function linksOf(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(/\[\[([^\]|#\n]+)(?:[|#][^\]\n]*)?\]\]/g)) out.add(m[1].trim().replace(/\.md$/i, ''));
  for (const m of body.matchAll(/\(([^()\s]+?\.md)(?:#[^)\s]*)?\)/gi)) {
    const target = m[1];
    if (/^[a-z]+:\/\//i.test(target)) continue;
    out.add(path.posix.basename(target.replace(/\\/g, '/')).replace(/\.md$/i, ''));
  }
  out.delete('');
  return [...out];
}

/** Una nota, dal suo testo. `mtime` serve solo se la nota non dice quando e' stata scritta. */
export function parseNote(file: string, text: string, mtime: number): Note {
  const slug = path.basename(file).replace(/\.md$/i, '');
  const { fields, body } = frontmatter(text);
  const firstLine =
    body
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l && l !== '---') ?? '';
  const stamp = fields['metadata.modified'] || fields.modified || fields.updated || '';
  const parsed = stamp ? Date.parse(stamp) : NaN;
  return {
    slug,
    file,
    name: fields.name || slug,
    // Senza frontmatter la descrizione e' la prima riga, senza i cancelletti del titolo.
    description: fields.description || firstLine.replace(/^#+\s*/, ''),
    type: fields['metadata.type'] || fields.type || '',
    date: Number.isFinite(parsed) ? parsed : mtime,
    body,
    links: linksOf(body),
    warnings: (body.match(/⚠/g) ?? []).length + (`${fields.description ?? ''}`.match(/⚠/g) ?? []).length,
  };
}
