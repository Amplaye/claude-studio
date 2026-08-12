import * as path from 'node:path';
import * as vscode from 'vscode';
import { claudeCliVersion, findClaudeCli } from '../engine/cli';
import type { Cmd, Wire } from '../engine/protocol';
import { Session } from '../engine/session';
import { renderPage } from '../shared/html';

export class ChatView implements vscode.WebviewViewProvider {
  static readonly id = 'claudeStudio.chat';

  private view?: vscode.WebviewView;
  private session?: Session;
  private ready = false;
  /** Eventi prodotti prima che la webview dicesse "ci sono": si mandano appena c'e'. */
  private backlog: Wire[] = [];

  constructor(private readonly ctx: vscode.ExtensionContext) {}

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.ctx.extensionUri, 'dist', 'webview'),
        vscode.Uri.joinPath(this.ctx.extensionUri, 'media'),
      ],
    };
    view.webview.html = renderPage(view.webview, this.ctx.extensionUri, 'chat.html', {
      tokensCss: 'tokens.css',
      motionCss: 'motion.css',
      chatCss: 'chat.css',
      chatJs: 'chat.js',
    });

    view.webview.onDidReceiveMessage((m: Cmd) => this.onCommand(m));
    view.onDidDispose(() => {
      this.ready = false;
      this.view = undefined;
    });
  }

  // ---- comandi dalla webview -------------------------------------------

  private onCommand(m: Cmd) {
    switch (m?.cmd) {
      case 'ready': {
        this.ready = true;
        const cwd = currentCwd();
        const cli = findClaudeCli(cliSetting());
        this.emit({
          k: 'hello',
          cwd,
          project: path.basename(cwd),
          cliVersion: cli ? claudeCliVersion(cli) : '',
        });
        for (const e of this.backlog.splice(0)) this.emit(e);
        return;
      }
      case 'send':
        void this.ensureSession().send(m.text);
        return;
      case 'interrupt':
        void this.session?.interrupt();
        return;
      case 'newSession':
        this.newSession();
        return;
    }
  }

  // ---- API per i comandi dell'estensione --------------------------------

  newSession() {
    this.session?.dispose();
    this.session = undefined;
    this.emit({ k: 'reset' });
  }

  interrupt() {
    void this.session?.interrupt();
  }

  reveal() {
    void vscode.commands.executeCommand('claudeStudio.chat.focus');
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
    if (!this.view || !this.ready) {
      this.backlog.push(e);
      return;
    }
    void this.view.webview.postMessage(e);
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
