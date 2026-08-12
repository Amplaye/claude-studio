// Where Claude Code keeps its things, and where we keep ours.
//
// The two files we write in ~/.claude are renamed on purpose: as long as
// context-bar 0.0.6 stays installed next to this one, the two extensions must not
// write to the same file. Same place, different names, no quarrel.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export function claudeDir(): string {
  return path.join(os.homedir(), '.claude');
}

/**
 * Writes one of our files in ~/.claude, creating the folder if it's missing.
 * In 0.0.6 the folder wasn't created and the write failed silently: on a PC where
 * Claude had never written anything yet, the cache shared between windows simply
 * didn't exist — and each one went back to querying the API on its own. There's
 * only one place where this goes wrong, so the fix belongs here.
 */
export function writeOurFile(file: string, value: unknown): boolean {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value), 'utf8');
    return true;
  } catch {
    return false; // disk full or protected folder: we carry on from memory
  }
}

/**
 * Claude Code maps the cwd to ~/.claude/projects/<cwd with every non-alphanumeric
 * character replaced by ->. On Windows that has to cover \ and : too (the ":" in
 * "c:" produces two dashes: c:\Users -> c--Users), otherwise the slug stays the raw
 * path, the folder isn't found and the tokens stay at zero.
 */
export function projectsDirFor(cwd: string): string {
  return path.join(claudeDir(), 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
}

/** A conversation's transcript: it's a jsonl, one line per message. */
export function transcriptPath(cwd: string, sessionId: string): string {
  return path.join(projectsDirFor(cwd), sessionId + '.jsonl');
}

/** The live sessions the CLI announces: one file per process. */
export function sessionsDir(): string {
  return path.join(claudeDir(), 'sessions');
}

/** Account usage cache, shared across all VSCode windows. */
export function usageCachePath(): string {
  return path.join(claudeDir(), '.claude-studio-usage.json');
}

/** The names you give sessions from the panel. */
export function sessionNamesPath(): string {
  return path.join(claudeDir(), 'claude-studio-session-names.json');
}
