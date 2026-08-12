// Where the `claude` CLI already installed on this PC lives.
// We don't bundle a copy of the binary: the official one carries hundreds of MB, we
// carry zero.
//
// Since 2.1.x the npm package no longer ships `cli.js`: it ships a native binary in
// `bin/claude(.exe)`, pulled down from the platform-specific package. Still looking
// only for `cli.js` means finding nothing — and without a path the SDK goes looking
// for its own binary, which we deliberately don't ship. So we look for both forms,
// newest to oldest, plus the native installer.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

const PKG = path.join('@anthropic-ai', 'claude-code');
const EXE = process.platform === 'win32' ? 'claude.exe' : 'claude';

/** How we got to this CLI: the automatic update needs to know. */
export type CliKind = 'npm' | 'native' | 'manual';

export interface ClaudeCli {
  /** The file to hand the SDK: native binary or cli.js. */
  path: string;
  /** What it claims to be, '' if we can't find out. */
  version: string;
  kind: CliKind;
  /** Root of the npm global modules, when that's the installation. */
  npmRoot?: string;
}

/** The roots where npm puts global modules on this system. */
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

/** Asks npm where the global prefix is. It costs a spawn: we do it once. */
function npmRootGlobal(): string | undefined {
  try {
    const root = execFileSync('npm', ['root', '-g'], {
      timeout: 8000,
      shell: true, // npm on Windows is npm.cmd
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    return root || undefined;
  } catch {
    return undefined;
  }
}

/** The two files inside the package that can act as the CLI: the new one first. */
function insidePackage(pkgDir: string): string | undefined {
  const bin = path.join(pkgDir, 'bin', EXE);
  if (fs.existsSync(bin)) return bin;
  const legacy = path.join(pkgDir, 'cli.js');
  if (fs.existsSync(legacy)) return legacy;
  return undefined;
}

/** The native installer doesn't go through npm: it just leaves a binary. */
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
 * The CLI to use, or undefined if there isn't one on this PC.
 * @param override value of the claudeStudio.cliPath setting
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
  // Last card, and the most expensive: ask npm where it keeps the globals.
  const root = npmRootGlobal();
  if (root) {
    const p = insidePackage(path.join(root, PKG));
    if (p) return (found = { path: p, version: versionOf(p), kind: 'npm', npmRoot: root });
  }
  found = null;
  return undefined;
}

/** Just the path, which is what the SDK needs. */
export function findClaudeCli(override?: string): string | undefined {
  return claudeCli(override)?.path;
}

/**
 * After an update the path stays the same, but the version doesn't: and if before
 * there was nothing, now there might be something. We throw away what we knew.
 */
export function resetCliCache() {
  found = undefined;
  versions.clear();
}

const versions = new Map<string, string>();

/**
 * The version the CLI we found declares (for the header). First we look at the
 * package's package.json — that costs nothing; if it isn't there (native installer)
 * we ask the binary, once.
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
      /* try the folder above */
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
      /* never mind: the header stays without a number */
    }
  }
  versions.set(cli, v);
  return v;
}

/** Historical name, kept because the chat header calls it. */
export const claudeCliVersion = versionOf;
