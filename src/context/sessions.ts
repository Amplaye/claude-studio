// The sessions opened by the official extension: the CLI leaves one file per process
// in ~/.claude/sessions/<pid>.json. If the process is dead the tab is closed, and the
// card disappears.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { projectsDirFor, sessionNamesPath, sessionsDir, writeOurFile } from './paths';

export interface LiveSession {
  id: string;
  pid: number;
  file: string;
  mtimeMs: number;
  startedAt: number;
  /** The tab name Claude shows: it's the only serious hook onto the real tab. */
  tabName: string;
}

/** Is a process alive? No signal is sent: we only check that it exists. */
export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: any) {
    return e?.code === 'EPERM'; // it exists but it isn't ours
  }
}

/** The live sessions of this project, freshest first. */
export function liveSessions(cwd: string): LiveSession[] {
  const out: LiveSession[] = [];
  let files: string[];
  try {
    files = fs.readdirSync(sessionsDir());
  } catch {
    return out; // no official tab ever opened: a normal case
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
    if (meta.cwd && cwd && meta.cwd !== cwd) continue; // the current project only
    const file = path.join(projectsDirFor(meta.cwd || cwd), meta.sessionId + '.jsonl');
    let mtimeMs = meta.startedAt || 0;
    try {
      mtimeMs = fs.statSync(file).mtimeMs;
    } catch {
      /* transcript not written yet: the start time stands */
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

// ---- the names you give the sessions --------------------------------------

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
