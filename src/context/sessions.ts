// The sessions opened by the official extension: the CLI leaves one file per process
// in ~/.claude/sessions/<pid>.json. If the process is dead the tab is closed, and the
// card disappears.
//
// "The process is dead" is the hard part. The file stays behind when the CLI is
// killed rather than closed, and a PID gets handed to somebody else within
// minutes — that's how a conversation nobody has open any more keeps a card lit
// for hours. So three filters, from the cheapest to the most certain:
//   1. the number must exist                       (process.kill(pid, 0))
//   2. it must still be the same process           (procs.ts, asynchronous)
//   3. two files for one conversation are one card (the freshest wins)
// And what is certainly dead gets swept away, so the folder doesn't grow into a
// graveyard that has to be filtered all over again on every tick.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { projectsDirFor, sessionNamesPath, sessionsDir, writeOurFile } from './paths';
import { recycledPid, refreshProcs } from './procs';

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

/** Throws away a session file that certainly has nobody behind it any more. */
function forget(file: string) {
  try {
    fs.unlinkSync(file);
  } catch {
    /* somebody else got there first, or it's read-only: not our problem */
  }
}

/** Removes our own session file when the chat closes the conversation. */
export function forgetSession(sessionId: string) {
  if (!sessionId) return;
  let files: string[];
  try {
    files = fs.readdirSync(sessionsDir());
  } catch {
    return;
  }
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const full = path.join(sessionsDir(), f);
    try {
      const meta = JSON.parse(fs.readFileSync(full, 'utf8'));
      if (meta?.sessionId === sessionId) forget(full);
    } catch {
      /* unreadable: leave it where it is */
    }
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
  // The list of running processes gets refreshed in the background: this round
  // works with the previous answer, the next one with this one.
  refreshProcs();

  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const full = path.join(sessionsDir(), f);
    const pid = parseInt(f.replace(/\.json$/, ''), 10);
    if (!pid) continue;
    // Nobody at that number: the file is rubbish left behind by a CLI that was
    // killed instead of closed.
    if (!pidAlive(pid)) {
      forget(full);
      continue;
    }
    let meta: any;
    try {
      meta = JSON.parse(fs.readFileSync(full, 'utf8'));
    } catch {
      continue;
    }
    if (!meta?.sessionId) continue;
    // Somebody's at that number, but it isn't the one who wrote the file: the
    // number has been recycled. This is the ghost card, and it goes.
    if (recycledPid(pid, meta.startedAt || 0, meta.procStart)) {
      forget(full);
      continue;
    }
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
  // Freshest first; between two files for the same conversation the newer
  // process wins, which is the one still typing.
  out.sort((a, b) => b.mtimeMs - a.mtimeMs || b.startedAt - a.startedAt);
  // One conversation, one card. Resuming a session writes a second file with a
  // new PID, and both are alive: without this the same conversation showed up
  // twice, and the older copy of the two was the one telling the wrong story.
  const once: LiveSession[] = [];
  const seen = new Set<string>();
  for (const s of out) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    once.push(s);
  }
  return once;
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
