// Dove sta la CLI `claude` gia' installata su questo PC.
// Non impacchettiamo una copia del binario: l'ufficiale ne porta centinaia di MB,
// noi zero.
//
// Dalla 2.1.x il pacchetto npm non porta piu' `cli.js`: porta un binario nativo in
// `bin/claude(.exe)`, tirato giu' dal pacchetto per la piattaforma. Cercare ancora
// solo `cli.js` vuol dire non trovare niente — e senza percorso l'SDK va a cercare
// il proprio binario, che noi apposta non spediamo. Si cercano quindi entrambe le
// forme, dalla piu' nuova alla piu' vecchia, piu' l'installer nativo.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

const PKG = path.join('@anthropic-ai', 'claude-code');
const EXE = process.platform === 'win32' ? 'claude.exe' : 'claude';

/** Come si e' arrivati a questa CLI: serve all'aggiornamento automatico. */
export type CliKind = 'npm' | 'native' | 'manual';

export interface ClaudeCli {
  /** Il file da passare all'SDK: binario nativo o cli.js. */
  path: string;
  /** Quello che dichiara di essere, '' se non si riesce a saperlo. */
  version: string;
  kind: CliKind;
  /** Radice dei moduli globali npm, quando l'installazione e' quella. */
  npmRoot?: string;
}

/** Le radici dove npm mette i moduli globali su questo sistema. */
function npmRoots(): string[] {
  const home = os.homedir();
  const out: string[] = [];
  if (process.platform === 'win32') {
    if (process.env.APPDATA) out.push(path.join(process.env.APPDATA, 'npm', 'node_modules'));
    out.push(path.join(home, 'AppData', 'Roaming', 'npm', 'node_modules'));
  } else {
    out.push('/usr/local/lib/node_modules');
    out.push('/opt/homebrew/lib/node_modules');
    out.push(path.join(home, '.npm-global', 'lib', 'node_modules'));
  }
  out.push(path.join(home, '.claude', 'local', 'node_modules'));
  return out;
}

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

/** I due file che, dentro il pacchetto, sanno fare da CLI: prima il nuovo. */
function insidePackage(pkgDir: string): string | undefined {
  const bin = path.join(pkgDir, 'bin', EXE);
  if (fs.existsSync(bin)) return bin;
  const legacy = path.join(pkgDir, 'cli.js');
  if (fs.existsSync(legacy)) return legacy;
  return undefined;
}

/** L'installer nativo non passa da npm: lascia un binario e basta. */
function nativeCandidates(): string[] {
  const home = os.homedir();
  return [
    path.join(home, '.local', 'bin', EXE),
    path.join(home, '.claude', 'local', EXE),
    path.join(home, '.claude', 'bin', EXE),
  ];
}

let found: ClaudeCli | null | undefined;

/**
 * La CLI da usare, o undefined se su questo PC non ce n'e' una.
 * @param override valore dell'impostazione claudeStudio.cliPath
 */
export function claudeCli(override?: string): ClaudeCli | undefined {
  if (override && fs.existsSync(override)) {
    return { path: override, version: versionOf(override), kind: 'manual' };
  }
  if (found !== undefined) return found ?? undefined;

  for (const root of npmRoots()) {
    const p = insidePackage(path.join(root, PKG));
    if (p) return (found = { path: p, version: versionOf(p), kind: 'npm', npmRoot: root });
  }
  for (const p of nativeCandidates()) {
    if (fs.existsSync(p)) return (found = { path: p, version: versionOf(p), kind: 'native' });
  }
  // Ultima carta, e la piu' cara: si chiede a npm dove tiene i globali.
  const root = npmRootGlobal();
  if (root) {
    const p = insidePackage(path.join(root, PKG));
    if (p) return (found = { path: p, version: versionOf(p), kind: 'npm', npmRoot: root });
  }
  found = null;
  return undefined;
}

/** Solo il percorso, che e' quello che serve all'SDK. */
export function findClaudeCli(override?: string): string | undefined {
  return claudeCli(override)?.path;
}

/**
 * Dopo un aggiornamento il percorso resta quello, ma la versione no: e se prima
 * non c'era niente, adesso potrebbe esserci. Si butta via quel che si sapeva.
 */
export function resetCliCache() {
  found = undefined;
  versions.clear();
}

const versions = new Map<string, string>();

/**
 * Versione dichiarata dalla CLI trovata (per la testata). Prima si guarda il
 * package.json del pacchetto — costa zero; se non c'e' (installer nativo) si
 * chiede al binario, una volta sola.
 */
export function versionOf(cli: string): string {
  const cached = versions.get(cli);
  if (cached !== undefined) return cached;

  let v = '';
  for (const dir of [path.dirname(cli), path.dirname(path.dirname(cli))]) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      if (pkg?.name === '@anthropic-ai/claude-code' && pkg.version) {
        v = String(pkg.version);
        break;
      }
    } catch {
      /* si prova la cartella sopra */
    }
  }
  if (!v && !cli.endsWith('.js')) {
    try {
      // "2.1.228 (Claude Code)" -> "2.1.228"
      const out = execFileSync(cli, ['--version'], {
        timeout: 10000,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).toString();
      v = (out.match(/\d+\.\d+\.\d+/) || [''])[0];
    } catch {
      /* pazienza: la testata resta senza numero */
    }
  }
  versions.set(cli, v);
  return v;
}

/** Nome storico, tenuto perche' lo chiama la testata della chat. */
export const claudeCliVersion = versionOf;
