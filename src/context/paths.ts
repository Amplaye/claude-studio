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

/**
 * Un file di impostazioni della CLI, letto senza storie: se manca o non e' JSON
 * valido vale come vuoto — e' quello che fa anche lei.
 */
function readSettings(file: string): Record<string, unknown> {
  try {
    const v = JSON.parse(fs.readFileSync(file, 'utf8'));
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

/**
 * Dove la CLI scrive i piani del plan mode.
 *
 * `plansDirectory` dei settings, col primo che lo dice fra locale, progetto e utente
 * — l'ordine in cui la CLI li fa valere. E' relativo alla radice del progetto, e la
 * CLI lo prende solo se ci resta dentro: fuori, se ne lamenta e torna a quella di
 * serie. Qui lo stesso, o il piano lo cercheremmo dove lei non l'ha scritto.
 */
export function plansDir(cwd: string): string {
  for (const file of [
    path.join(cwd, '.claude', 'settings.local.json'),
    path.join(cwd, '.claude', 'settings.json'),
    path.join(claudeDir(), 'settings.json'),
  ]) {
    const v = readSettings(file).plansDirectory;
    if (typeof v !== 'string' || !v.trim()) continue;
    const dir = path.resolve(cwd, v);
    const rel = path.relative(path.resolve(cwd), dir);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return dir;
    break;
  }
  return path.join(claudeDir(), 'plans');
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
