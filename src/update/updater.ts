// Restare aggiornati senza doverci pensare.
//
// Ci sono due cose che invecchiano, e invecchiano per motivi diversi:
//
//  1. la CLI `claude` installata sul PC — e' lei che sa quali modelli esistono,
//     quindi finche' resta indietro l'estensione mostra i modelli dell'anno
//     scorso, per quanto nuova sia l'estensione;
//  2. l'estensione stessa — il codice che sta qui dentro, insieme all'Agent SDK
//     con cui parla alla CLI.
//
// Questo file guarda tutte e due, da solo, a intervalli larghi: all'avvio e poi
// ogni sei ore. Se trova qualcosa di piu' nuovo lo mette a posto e lo dice; non
// chiede permesso, perche' l'unica cosa peggiore di un aggiornamento e' doverselo
// ricordare. Si spegne da Impostazioni > Claude Studio > Auto Update.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import * as vscode from 'vscode';
import { claudeCli, resetCliCache } from '../engine/cli';

/** Il sorgente da cui questa build e' uscita, e l'SDK che si e' portata dietro. */
declare const __CS_SOURCE_ROOT: string;
declare const __CS_SDK_VERSION: string;

const CLI_PKG = '@anthropic-ai/claude-code';
const SDK_PKG = '@anthropic-ai/claude-agent-sdk';

/** Ogni quanto si torna a guardare. Sei ore: non e' una cosa da fare col cronometro. */
const EVERY_MS = 6 * 60 * 60 * 1000;
/** All'avvio si aspetta un po': l'apertura di VSCode ha di meglio da fare. */
const FIRST_DELAY_MS = 30_000;
const LAST_KEY = 'claudeStudio.lastUpdateCheck';

type Mode = 'auto' | 'check' | 'off';

let out: vscode.OutputChannel | undefined;
function log(line: string) {
  out ??= vscode.window.createOutputChannel('Claude Studio — Aggiornamenti');
  out.appendLine(`[${new Date().toLocaleTimeString()}] ${line}`);
}

function mode(): Mode {
  return vscode.workspace.getConfiguration('claudeStudio').get<Mode>('autoUpdate', 'auto');
}

/** Dove sta il sorgente: l'impostazione vince, poi la cartella da cui si e' costruito. */
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

// ---- attrezzi ------------------------------------------------------------

interface RunResult {
  ok: boolean;
  out: string;
}

/** Un comando, e cosa ha detto. Non lancia mai: chi chiama guarda `ok`. */
function run(cmd: string, args: string[], opts: { cwd?: string; timeout?: number } = {}) {
  return new Promise<RunResult>((resolve) => {
    execFile(
      cmd,
      args,
      {
        cwd: opts.cwd,
        timeout: opts.timeout ?? 120_000,
        // npm e git su Windows sono script .cmd: senza shell non partono.
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

/** L'ultima versione pubblicata su npm, o '' se la rete non risponde. */
async function latestOnNpm(pkg: string): Promise<string> {
  const r = await run('npm', ['view', pkg, 'version'], { timeout: 30_000 });
  if (!r.ok) return '';
  return (r.out.match(/\d+\.\d+\.\d+[^\s]*/) || [''])[0];
}

/** true se `a` viene dopo `b`. Confronto per pezzi, senza pretese sui pre-release. */
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

/** Versione dell'SDK cotta dentro questa build. */
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

// ---- i due pezzi da tenere aggiornati ------------------------------------

/**
 * La CLI. E' quella che porta i modelli nuovi, quindi e' la piu' importante delle
 * due. Se l'hanno installata con l'installer nativo si aggiorna da sola e qui non
 * si tocca niente: metterci le mani da npm farebbe due installazioni in lite.
 */
async function updateCli(auto: boolean): Promise<string | undefined> {
  const cli = claudeCli();
  if (!cli) {
    log('CLI di Claude Code non trovata: niente da aggiornare.');
    return;
  }
  if (cli.kind !== 'npm') {
    log(`CLI ${cli.version || '?'} installata fuori da npm (${cli.kind}): si aggiorna da sola.`);
    return;
  }
  const latest = await latestOnNpm(CLI_PKG);
  if (!latest) {
    log('npm non risponde: la CLI si guarda la prossima volta.');
    return;
  }
  if (!newer(latest, cli.version)) {
    log(`CLI ${cli.version}: gia' l'ultima.`);
    return;
  }
  log(`CLI ${cli.version} -> ${latest}`);
  if (!auto) return `CLI di Claude Code ${latest} disponibile (ora ${cli.version}).`;

  const r = await run('npm', ['install', '-g', `${CLI_PKG}@latest`], { timeout: 10 * 60_000 });
  if (!r.ok) {
    log(`aggiornamento CLI fallito:\n${r.out}`);
    return;
  }
  resetCliCache();
  log(`CLI aggiornata a ${latest}.`);
  return `Claude CLI aggiornata alla ${latest}: i modelli nuovi ci sono gia'.`;
}

/**
 * L'estensione. Si ricostruisce dal sorgente quando c'e' un motivo vero:
 * un `git pull` ha portato una versione piu' alta, oppure e' uscito un Agent SDK
 * nuovo rispetto a quello cotto in questa build. Senza motivo non si tocca niente:
 * ricompilare per sport vorrebbe dire chiedere di ricaricare la finestra ogni sei ore.
 */
async function updateExtension(ctx: vscode.ExtensionContext, auto: boolean): Promise<string | undefined> {
  const root = sourceRoot();
  if (!root) {
    log("sorgente non trovato: da qui l'estensione non si puo' ricostruire.");
    return;
  }

  // Se nel sorgente c'e' del lavoro a meta', qui non si tocca niente: ne' un pull,
  // ne' un npm install, ne' una ricompilata. Ricostruire da un sorgente sporco
  // vorrebbe dire spedirsi addosso il lavoro a meta' di qualcun altro — o il proprio.
  const dirty = await run('git', ['status', '--porcelain'], { cwd: root, timeout: 20_000 });
  if (dirty.ok && dirty.out) {
    log('sorgente con modifiche non committate: si aspetta che sia in ordine.');
    return;
  }

  // Se il sorgente ha un remoto, quello e' il canale degli aggiornamenti veri.
  const remote = await run('git', ['remote'], { cwd: root, timeout: 20_000 });
  if (remote.ok && remote.out) {
    const pull = await run('git', ['pull', '--ff-only'], { cwd: root, timeout: 120_000 });
    log(pull.ok ? `git pull: ${pull.out.split('\n')[0] || 'ok'}` : `git pull non riuscito: ${pull.out.split('\n')[0]}`);
  }

  const pkg = readJson(path.join(root, 'package.json'));
  const srcVersion = String(pkg?.version ?? '');
  const here = String(ctx.extension.packageJSON.version ?? '');

  let why = '';
  let bump = false;

  if (newer(srcVersion, here)) {
    why = `versione ${srcVersion} (qui gira la ${here})`;
  } else {
    const latestSdk = await latestOnNpm(SDK_PKG);
    if (latestSdk && newer(latestSdk, bundledSdk())) {
      why = `Agent SDK ${latestSdk} (qui c'e' il ${bundledSdk() || '?'})`;
      bump = true;
      if (auto) {
        const inst = await run('npm', ['install', `${SDK_PKG}@latest`], { cwd: root, timeout: 10 * 60_000 });
        if (!inst.ok) {
          log(`npm install dell'SDK fallito:\n${inst.out}`);
          return;
        }
      }
    }
  }

  if (!why) {
    log(`estensione ${here} con SDK ${bundledSdk() || '?'}: gia' aggiornata.`);
    return;
  }
  log(`estensione da ricostruire: ${why}`);
  if (!auto) return `Aggiornamento di Claude Studio disponibile: ${why}.`;

  // Il numero deve salire, altrimenti VSCode considera il pacchetto lo stesso di
  // prima e non lo rimpiazza.
  if (bump && pkg) {
    const parts = srcVersion.split('.');
    parts[2] = String((Number(parts[2]) || 0) + 1);
    pkg.version = parts.join('.');
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    log(`versione portata a ${pkg.version}`);
  }

  const built = await run('npm', ['run', 'package'], { cwd: root, timeout: 15 * 60_000 });
  if (!built.ok) {
    log(`build fallita:\n${built.out}`);
    return;
  }
  const vsix = path.join(root, 'claude-studio.vsix');
  if (!fs.existsSync(vsix)) {
    log(`la build non ha prodotto ${vsix}`);
    return;
  }
  await vscode.commands.executeCommand('workbench.extensions.installExtension', vscode.Uri.file(vsix));
  log(`installata ${pkg?.version ?? srcVersion}.`);
  if (bump) log('nel sorgente restano da committare il numero di versione e il lockfile.');
  return `Claude Studio aggiornato alla ${pkg?.version ?? srcVersion}. Ricarica la finestra per usarlo.`;
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
    log(opts.manual ? '— controllo richiesto da te —' : '— controllo periodico —');

    const news: string[] = [];
    const cli = await updateCli(auto);
    if (cli) news.push(cli);
    const ext = await updateExtension(ctx, auto);
    if (ext) news.push(ext);

    if (!news.length) {
      if (opts.manual) void vscode.window.showInformationMessage('Claude Studio: è tutto aggiornato.');
      return;
    }
    const reload = news.some((n) => n.includes('Ricarica'));
    const choice = await vscode.window.showInformationMessage(
      news.join(' '),
      ...(reload ? ['Ricarica adesso'] : []),
      'Dettagli'
    );
    if (choice === 'Ricarica adesso') {
      void vscode.commands.executeCommand('workbench.action.reloadWindow');
    } else if (choice === 'Dettagli') {
      out?.show(true);
    }
  } catch (e) {
    log(`controllo interrotto: ${e instanceof Error ? e.message : String(e)}`);
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
