// Le sessioni aperte dall'estensione ufficiale: la CLI lascia un file per processo
// in ~/.claude/sessions/<pid>.json. Se il processo e' morto la tab e' chiusa, e la
// card sparisce.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { projectsDirFor, sessionNamesPath, sessionsDir, writeOurFile } from './paths';

export interface LiveSession {
  id: string;
  pid: number;
  file: string;
  mtimeMs: number;
  startedAt: number;
  /** Il nome della tab mostrato da Claude: e' l'unico aggancio serio con la tab vera. */
  tabName: string;
}

/** Un processo e' vivo? Nessun segnale mandato: si controlla solo che esista. */
export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: any) {
    return e?.code === 'EPERM'; // esiste ma non e' nostro
  }
}

/** Le sessioni vive di questo progetto, la piu' fresca per prima. */
export function liveSessions(cwd: string): LiveSession[] {
  const out: LiveSession[] = [];
  let files: string[];
  try {
    files = fs.readdirSync(sessionsDir());
  } catch {
    return out; // nessuna tab dell'ufficiale mai aperta: caso normale
  }
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const pid = parseInt(f.replace(/\.json$/, ''), 10);
    if (!pid || !pidAlive(pid)) continue;
    let meta: any;
    try {
      meta = JSON.parse(fs.readFileSync(path.join(sessionsDir(), f), 'utf8'));
    } catch {
      continue;
    }
    if (!meta?.sessionId) continue;
    if (meta.cwd && cwd && meta.cwd !== cwd) continue; // solo il progetto corrente
    const file = path.join(projectsDirFor(meta.cwd || cwd), meta.sessionId + '.jsonl');
    let mtimeMs = meta.startedAt || 0;
    try {
      mtimeMs = fs.statSync(file).mtimeMs;
    } catch {
      /* transcript non ancora scritto: resta l'ora di avvio */
    }
    out.push({
      id: meta.sessionId,
      pid,
      file,
      mtimeMs,
      startedAt: meta.startedAt || 0,
      tabName: meta.name || '',
    });
  }
  out.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return out;
}

// ---- i nomi che dai tu alle sessioni -------------------------------------

export function readSessionNames(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(sessionNamesPath(), 'utf8')) || {};
  } catch {
    return {};
  }
}

export function writeSessionName(id: string, name: string) {
  const all = readSessionNames();
  if (name) all[id] = name;
  else delete all[id];
  writeOurFile(sessionNamesPath(), all);
}
