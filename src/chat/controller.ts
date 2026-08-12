// Lo stato della chat sta qui, non nelle viste. La stessa conversazione puo' essere
// aperta insieme nel pannello laterale e come scheda a tutto schermo: chi si attacca
// dopo si riprende la storia e vede esattamente quello che vede l'altra faccia.
import * as vscode from 'vscode';
import { claudeCliVersion, findClaudeCli } from '../engine/cli';
import type { Wire } from '../engine/protocol';
import { Session } from '../engine/session';

export interface Surface {
  readonly kind: 'view' | 'panel';
  post(e: Wire): void;
}

/** Oltre questo si buttano via gli eventi piu' vecchi: e' solo materiale da ridisegno. */
const MAX_HISTORY = 4000;

export class ChatController {
  private session?: Session;
  private history: Wire[] = [];
  private surfaces = new Set<Surface>();
  private busy = false;

  attach(s: Surface) {
    this.surfaces.add(s);
  }

  detach(s: Surface) {
    this.surfaces.delete(s);
  }

  /** Il saluto e' per forza per singola faccia: dice anche quale faccia e'. */
  hello(s: Surface) {
    const cwd = currentCwd();
    const cli = findClaudeCli(cliSetting());
    s.post({
      k: 'hello',
      cwd,
      project: cwd.split(/[\\/]/).pop() || cwd,
      cliVersion: cli ? claudeCliVersion(cli) : '',
      surface: s.kind,
    });
    for (const e of this.history) s.post(e);
    s.post({ k: 'busy', value: this.busy });
  }

  send(text: string) {
    this.ensureSession().send(text);
  }

  interrupt() {
    void this.session?.interrupt();
  }

  newSession() {
    this.session?.dispose();
    this.session = undefined;
    this.history = [];
    this.busy = false;
    this.broadcast({ k: 'reset' });
  }

  dispose() {
    this.session?.dispose();
  }

  // ---- motore -----------------------------------------------------------

  private ensureSession(): Session {
    if (this.session) return this.session;

    const cli = findClaudeCli(cliSetting());
    if (!cli) {
      this.emit({
        k: 'error',
        message:
          'Non trovo la CLI di Claude Code su questo computer. Installala con "npm i -g @anthropic-ai/claude-code", oppure indica il percorso di cli.js in Impostazioni > Claude Studio > Cli Path.',
      });
    }

    this.session = new Session({
      cwd: currentCwd(),
      cliPath: cli,
      emit: (e) => this.emit(e),
      ask: askPermission,
    });
    return this.session;
  }

  private emit(e: Wire) {
    this.remember(e);
    this.broadcast(e);
  }

  private broadcast(e: Wire) {
    for (const s of this.surfaces) s.post(e);
  }

  /**
   * La storia serve solo a ridisegnare. Quando arriva il testo definitivo di un
   * blocco si buttano via i pezzetti dello streaming: chi apre la scheda a meta'
   * conversazione non deve rivedere mille frammenti, ma il testo gia' composto.
   */
  private remember(e: Wire) {
    if (e.k === 'busy') {
      this.busy = e.value;
      return;
    }
    if (e.k === 'hello' || e.k === 'turn_start') return;

    if (e.k === 'block_final') {
      this.history = this.history.filter(
        (h) => !((h.k === 'delta' || h.k === 'block_start') && h.id === e.id)
      );
    }
    this.history.push(e);
    if (this.history.length > MAX_HISTORY) this.history.splice(0, this.history.length - MAX_HISTORY);
  }
}

function cliSetting(): string {
  return vscode.workspace.getConfiguration('claudeStudio').get<string>('cliPath', '') || '';
}

function currentCwd(): string {
  const f = vscode.workspace.workspaceFolders;
  return f && f.length ? f[0].uri.fsPath : process.cwd();
}

/**
 * Fase 1: il permesso si chiede con una finestra nativa di VSCode.
 * Nella fase 2 diventa la scheda animata dentro la chat — l'aggancio e' gia' qui.
 */
async function askPermission(
  toolName: string,
  input: Record<string, unknown>,
  meta: { title?: string; subtitle?: string }
) {
  const detail = meta.subtitle || summarize(input);
  const choice = await vscode.window.showWarningMessage(
    meta.title || `Claude vuole usare ${toolName}`,
    { modal: true, detail },
    'Consenti',
    'Rifiuta'
  );
  return choice === 'Consenti'
    ? ({ behavior: 'allow' } as const)
    : ({ behavior: 'deny', message: 'Permesso negato da chi usa Claude Studio.' } as const);
}

function summarize(input: Record<string, unknown>): string {
  for (const k of ['command', 'file_path', 'path', 'pattern', 'query', 'url']) {
    const v = input?.[k];
    if (typeof v === 'string' && v.trim()) return v.slice(0, 400);
  }
  try {
    return JSON.stringify(input).slice(0, 400);
  } catch {
    return '';
  }
}
