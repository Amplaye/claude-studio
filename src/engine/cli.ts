// Dove sta la CLI `claude` gia' installata su questo PC.
// Non impacchettiamo una copia del binario: l'ufficiale ne porta 289 MB, noi zero.
// Quello che serve all'SDK e' il percorso di cli.js, non del lanciatore .cmd
// (su Windows il .cmd va passato a cmd.exe e i percorsi con gli spazi si rompono).
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

const REL = path.join('@anthropic-ai', 'claude-code', 'cli.js');

function candidates(): string[] {
  const home = os.homedir();
  const out: string[] = [];
  const push = (...p: string[]) => out.push(path.join(...p, REL));

  if (process.platform === 'win32') {
    if (process.env.APPDATA) push(process.env.APPDATA, 'npm', 'node_modules');
    push(home, 'AppData', 'Roaming', 'npm', 'node_modules');
  } else {
    push('/usr/local/lib/node_modules');
    push('/opt/homebrew/lib/node_modules');
    push(home, '.npm-global', 'lib', 'node_modules');
  }
  push(home, '.claude', 'local', 'node_modules');
  return out;
}

let discovered: string | null | undefined;

/** Chiede a npm dove sta il prefix globale. Costa uno spawn: lo si fa una volta. */
function npmRootGlobal(): string | undefined {
  try {
    const root = execFileSync('npm', ['root', '-g'], {
      timeout: 8000,
      shell: true, // npm su Windows e' npm.cmd
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    return root || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Percorso di cli.js, o undefined se non si trova.
 * @param override valore dell'impostazione claudeStudio.cliPath
 */
export function findClaudeCli(override?: string): string | undefined {
  if (override && fs.existsSync(override)) return override;
  if (discovered !== undefined) return discovered ?? undefined;

  for (const c of candidates()) {
    if (fs.existsSync(c)) {
      discovered = c;
      return c;
    }
  }
  const root = npmRootGlobal();
  if (root) {
    const p = path.join(root, REL);
    if (fs.existsSync(p)) {
      discovered = p;
      return p;
    }
  }
  discovered = null;
  return undefined;
}

/** Versione dichiarata nel package.json della CLI trovata (per la testata). */
export function claudeCliVersion(cliJs: string): string {
  try {
    const pkg = path.join(path.dirname(cliJs), 'package.json');
    return JSON.parse(fs.readFileSync(pkg, 'utf8')).version || '';
  } catch {
    return '';
  }
}
