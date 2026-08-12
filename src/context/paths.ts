// Dove Claude Code tiene le sue cose, e dove le teniamo noi.
//
// I due file che scriviamo in ~/.claude sono rinominati apposta: finche' la
// context-bar 0.0.6 resta installata accanto a questa, le due estensioni non devono
// scrivere sullo stesso file. Stesso posto, nomi diversi, nessuna lite.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export function claudeDir(): string {
  return path.join(os.homedir(), '.claude');
}

/**
 * Scrive un file nostro in ~/.claude, creando la cartella se manca.
 * Nella 0.0.6 la cartella non veniva creata e la scrittura falliva in silenzio: su
 * un PC dove Claude non aveva ancora scritto niente, la cache condivisa fra le
 * finestre semplicemente non esisteva — e ognuna tornava a interrogare l'API da
 * sola. Il posto dove si sbaglia e' uno solo, quindi il rimedio sta qui.
 */
export function writeOurFile(file: string, value: unknown): boolean {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value), 'utf8');
    return true;
  } catch {
    return false; // disco pieno o cartella protetta: si tira avanti a memoria
  }
}

/**
 * Claude Code mappa il cwd in ~/.claude/projects/<cwd con i caratteri non
 * alfanumerici sostituiti da ->. Su Windows servono anche \ e : (il ":" di "c:"
 * produce due trattini: c:\Users -> c--Users), altrimenti lo slug resta il percorso
 * grezzo, la cartella non si trova e i token restano a zero.
 */
export function projectsDirFor(cwd: string): string {
  return path.join(claudeDir(), 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
}

/** Il transcript di una conversazione: e' un jsonl, una riga per messaggio. */
export function transcriptPath(cwd: string, sessionId: string): string {
  return path.join(projectsDirFor(cwd), sessionId + '.jsonl');
}

/** Le sessioni vive che la CLI annuncia: un file per processo. */
export function sessionsDir(): string {
  return path.join(claudeDir(), 'sessions');
}

/** Cache dell'uso account, condivisa fra tutte le finestre di VSCode. */
export function usageCachePath(): string {
  return path.join(claudeDir(), '.claude-studio-usage.json');
}

/** I nomi che dai tu alle sessioni dal pannello. */
export function sessionNamesPath(): string {
  return path.join(claudeDir(), 'claude-studio-session-names.json');
}
