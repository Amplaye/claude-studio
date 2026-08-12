// Staying up to date without having to think about it.
//
// There are two things that age, and they age for different reasons:
//
//  1. the `claude` CLI installed on the PC — it's the one that knows which models
//     exist, so as long as it lags behind, the extension shows last year's models,
//     however new the extension itself is;
//  2. the extension itself — the code in here, together with the Agent SDK it uses
//     to talk to the CLI.
//
// This file watches both, on its own, at generous intervals: at startup and then
// every six hours. If it finds something newer it puts it right and says so; it
// doesn't ask permission, because the only thing worse than an update is having to
// remember it. It's switched off in Settings > Claude Studio > Auto Update.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import * as vscode from 'vscode';
import { claudeCli, resetCliCache } from '../engine/cli';

/** The source this build came out of, and the SDK it brought along with it. */
declare const __CS_SOURCE_ROOT: string;
declare const __CS_SDK_VERSION: string;

const CLI_PKG = '@anthropic-ai/claude-code';
const SDK_PKG = '@anthropic-ai/claude-agent-sdk';

/** How often we go back and look. Six hours: this isn't a stopwatch job. */
const EVERY_MS = 6 * 60 * 60 * 1000;
/** At startup we wait a bit: VSCode's opening has better things to do. */
const FIRST_DELAY_MS = 30_000;
const LAST_KEY = 'claudeStudio.lastUpdateCheck';

type Mode = 'auto' | 'check' | 'off';

let out: vscode.OutputChannel | undefined;
function log(line: string) {
  out ??= vscode.window.createOutputChannel('Claude Studio — Updates');
  out.appendLine(`[${new Date().toLocaleTimeString()}] ${line}`);
}

function mode(): Mode {
  return vscode.workspace.getConfiguration('claudeStudio').get<Mode>('autoUpdate', 'auto');
}

/** Where the source lives: the setting wins, then the folder it was built from. */
function sourceRoot(): string | undefined {
  const conf = vscode.workspace
    .getConfiguration('claudeStudio')
    .get<string>('updateSourcePath', '')
    .trim();
  const baked = typeof __CS_SOURCE_ROOT === 'string' ? __CS_SOURCE_ROOT : '';
  for (const p of [conf, baked]) {
    if (p && fs.existsSync(path.join(p, 'package.json'))) return p;
  }
  return undefined;
}

// ---- tools ---------------------------------------------------------------

interface RunResult {
  ok: boolean;
  out: string;
}

/** A command, and what it said. It never throws: the caller looks at `ok`. */
function run(cmd: string, args: string[], opts: { cwd?: string; timeout?: number } = {}) {
  return new Promise<RunResult>((resolve) => {
    execFile(
      cmd,
      args,
      {
        cwd: opts.cwd,
        timeout: opts.timeout ?? 120_000,
        // npm and git on Windows are .cmd scripts: without a shell they don't start.
        shell: true,
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024,
        env: { ...process.env, NO_COLOR: '1', npm_config_fund: 'false', npm_config_audit: 'false' },
      },
      (err, stdout, stderr) => {
        const text = `${stdout ?? ''}${stderr ?? ''}`.trim();
        resolve({ ok: !err, out: text });
      }
    );
  });
}

/** The latest version published on npm, or '' if the network doesn't answer. */
async function latestOnNpm(pkg: string): Promise<string> {
  const r = await run('npm', ['view', pkg, 'version'], { timeout: 30_000 });
  if (!r.ok) return '';
  return (r.out.match(/\d+\.\d+\.\d+[^\s]*/) || [''])[0];
}

/** true if `a` comes after `b`. Piece-by-piece comparison, no claims about pre-releases. */
export function newer(a: string, b: string): boolean {
  if (!a || !b) return false;
  const n = (v: string) => v.split(/[.+-]/).map((x) => (/^\d+$/.test(x) ? Number(x) : -1));
  const x = n(a);
  const y = n(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const p = x[i] ?? 0;
    const q = y[i] ?? 0;
    if (p !== q) return p > q;
  }
  return false;
}

/** The SDK version baked into this build. */
function bundledSdk(): string {
  return typeof __CS_SDK_VERSION === 'string' ? __CS_SDK_VERSION : '';
}

function readJson(file: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

// ---- the two pieces to keep updated --------------------------------------

/**
 * The CLI. It's the one that brings the new models, so it's the more important of
 * the two. If it was installed with the native installer it updates itself and we
 * touch nothing here: reaching in through npm would leave two installations quarrelling.
 */
async function updateCli(auto: boolean): Promise<string | undefined> {
  const cli = claudeCli();
  if (!cli) {
    log('Claude Code CLI not found: nothing to update.');
    return;
  }
  if (cli.kind !== 'npm') {
    log(`CLI ${cli.version || '?'} installed outside npm (${cli.kind}): it updates itself.`);
    return;
  }
  const latest = await latestOnNpm(CLI_PKG);
  if (!latest) {
    log("npm isn't answering: the CLI gets checked next time.");
    return;
  }
  if (!newer(latest, cli.version)) {
    log(`CLI ${cli.version}: already the latest.`);
    return;
  }
  log(`CLI ${cli.version} -> ${latest}`);
  if (!auto) return `Claude Code CLI ${latest} available (currently ${cli.version}).`;

  const r = await run('npm', ['install', '-g', `${CLI_PKG}@latest`], { timeout: 10 * 60_000 });
  if (!r.ok) {
    log(`CLI update failed:\n${r.out}`);
    return;
  }
  resetCliCache();
  log(`CLI updated to ${latest}.`);
  return `Claude CLI updated to ${latest}: the new models are already there.`;
}

/**
 * The extension. It gets rebuilt from source when there's a real reason: a `git pull`
 * brought a higher version, or an Agent SDK newer than the one baked into this build
 * came out. Without a reason nothing gets touched: recompiling for sport would mean
 * asking you to reload the window every six hours.
 */
async function updateExtension(ctx: vscode.ExtensionContext, auto: boolean): Promise<string | undefined> {
  const root = sourceRoot();
  if (!root) {
    log("source not found: the extension can't be rebuilt from here.");
    return;
  }

  // If there's half-finished work in the source, nothing gets touched here: no pull,
  // no npm install, no rebuild. Rebuilding from a dirty source would mean shipping
  // somebody else's half-finished work onto yourself — or your own.
  const dirty = await run('git', ['status', '--porcelain'], { cwd: root, timeout: 20_000 });
  if (dirty.ok && dirty.out) {
    log('source has uncommitted changes: we wait for it to be in order.');
    return;
  }

  // If the source has a remote, that's the channel for the real updates.
  const remote = await run('git', ['remote'], { cwd: root, timeout: 20_000 });
  if (remote.ok && remote.out) {
    const pull = await run('git', ['pull', '--ff-only'], { cwd: root, timeout: 120_000 });
    log(pull.ok ? `git pull: ${pull.out.split('\n')[0] || 'ok'}` : `git pull failed: ${pull.out.split('\n')[0]}`);
  }

  const pkg = readJson(path.join(root, 'package.json'));
  const srcVersion = String(pkg?.version ?? '');
  const here = String(ctx.extension.packageJSON.version ?? '');

  let why = '';
  let bump = false;

  if (newer(srcVersion, here)) {
    why = `version ${srcVersion} (this one runs ${here})`;
  } else {
    const latestSdk = await latestOnNpm(SDK_PKG);
    if (latestSdk && newer(latestSdk, bundledSdk())) {
      why = `Agent SDK ${latestSdk} (this one has ${bundledSdk() || '?'})`;
      bump = true;
      if (auto) {
        const inst = await run('npm', ['install', `${SDK_PKG}@latest`], { cwd: root, timeout: 10 * 60_000 });
        if (!inst.ok) {
          log(`npm install of the SDK failed:\n${inst.out}`);
          return;
        }
      }
    }
  }

  if (!why) {
    log(`extension ${here} with SDK ${bundledSdk() || '?'}: already up to date.`);
    return;
  }
  log(`extension to rebuild: ${why}`);
  if (!auto) return `Claude Studio update available: ${why}.`;

  // Il numero deve salire, altrimenti VSCode considera il pacchetto lo stesso di
  // prima e non lo rimpiazza.
  if (bump && pkg) {
    const parts = srcVersion.split('.');
    parts[2] = String((Number(parts[2]) || 0) + 1);
    pkg.version = parts.join('.');
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    log(`version bumped to ${pkg.version}`);
  }

  const built = await run('npm', ['run', 'package'], { cwd: root, timeout: 15 * 60_000 });
  if (!built.ok) {
    log(`build failed:\n${built.out}`);
    return;
  }
  const vsix = path.join(root, 'claude-studio.vsix');
  if (!fs.existsSync(vsix)) {
    log(`the build did not produce ${vsix}`);
    return;
  }
  await vscode.commands.executeCommand('workbench.extensions.installExtension', vscode.Uri.file(vsix));
  log(`installed ${pkg?.version ?? srcVersion}.`);
  if (bump) log('the version number and the lockfile are still to be committed in the source.');
  return `Claude Studio updated to ${pkg?.version ?? srcVersion}. Reload the window to use it.`;
}

// ---- il giro completo ----------------------------------------------------

let running = false;

export async function checkForUpdates(ctx: vscode.ExtensionContext, opts: { manual?: boolean } = {}) {
  if (running) return;
  const m = opts.manual ? (mode() === 'off' ? 'auto' : mode()) : mode();
  if (m === 'off') return;
  running = true;
  const auto = m === 'auto';
  try {
    void ctx.globalState.update(LAST_KEY, Date.now());
    log(opts.manual ? '— check requested by you —' : '— periodic check —');

    const news: string[] = [];
    const cli = await updateCli(auto);
    if (cli) news.push(cli);
    const ext = await updateExtension(ctx, auto);
    if (ext) news.push(ext);

    if (!news.length) {
      if (opts.manual) void vscode.window.showInformationMessage('Claude Studio: everything is up to date.');
      return;
    }
    const reload = news.some((n) => n.includes('Reload'));
    const choice = await vscode.window.showInformationMessage(
      news.join(' '),
      ...(reload ? ['Reload now'] : []),
      'Details'
    );
    if (choice === 'Reload now') {
      void vscode.commands.executeCommand('workbench.action.reloadWindow');
    } else if (choice === 'Details') {
      out?.show(true);
    }
  } catch (e) {
    log(`check interrupted: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    running = false;
  }
}

/**
 * Attacca il controllo periodico. Con piu' finestre di VSCode aperte il lavoro lo
 * fa una sola: le altre vedono l'orario dell'ultimo controllo e lasciano stare.
 */
export function startAutoUpdate(ctx: vscode.ExtensionContext): vscode.Disposable {
  const tick = () => {
    const last = ctx.globalState.get<number>(LAST_KEY, 0);
    if (Date.now() - last < EVERY_MS) return;
    void checkForUpdates(ctx);
  };
  const first = setTimeout(tick, FIRST_DELAY_MS);
  const every = setInterval(tick, EVERY_MS);
  return {
    dispose() {
      clearTimeout(first);
      clearInterval(every);
      out?.dispose();
    },
  };
}
