// The second face: the context panel, below the chat in the sidebar. Same rule as
// the chat — real files, tight CSP with a nonce, and what travels the wire is data,
// never HTML.
import * as vscode from 'vscode';
import { renderPage } from '../shared/html';
import { onDidChangeLang } from '../shared/i18n';
import { DEFAULT_PREFS } from '../engine/protocol';
import type { Prefs } from '../engine/protocol';
import type { ContextMonitor } from './monitor';
import type { CtxCmd, CtxWire } from './protocol';
import { tasks } from '../tasks/store';

export class ContextView implements vscode.WebviewViewProvider {
  static readonly id = 'claudeStudio.context';

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly monitor: ContextMonitor
  ) {}

  resolveWebviewView(view: vscode.WebviewView) {
    const webview = view.webview;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.ctx.extensionUri, 'dist', 'webview'),
        vscode.Uri.joinPath(this.ctx.extensionUri, 'media'),
      ],
    };
    webview.html = renderPage(webview, this.ctx.extensionUri, 'context.html', {
      tokensCss: 'tokens.css',
      motionCss: 'motion.css',
      contextCss: 'context.css',
      tasksCss: 'tasks.css',
      i18nJs: 'i18n.js',
      ctxpanelJs: 'ctxpanel.js',
      taskspanelJs: 'taskspanel.js',
      contextJs: 'context.js',
    });

    const post = (e: CtxWire) => void webview.postMessage(e);
    let sub: vscode.Disposable | undefined;
    let steps: vscode.Disposable | undefined;

    const listener = webview.onDidReceiveMessage((m: CtxCmd) => {
      switch (m?.cmd) {
        case 'ready':
          // We only subscribe once the page is ready to receive: otherwise the first
          // snapshot would land in the void and everything would stay grey.
          sub?.dispose();
          steps?.dispose();
          // The language before the data: the first paint should already be in the
          // right words rather than correcting itself a moment later.
          post({ k: 'lang', value: this.lang() });
          sub = this.monitor.subscribe((d) => post({ k: 'data', d }));
          steps = tasks.subscribe((d) => post({ k: 'tasks', d }));
          return;
        case 'refresh':
          this.monitor.refreshNow();
          return;
        case 'rename':
          void this.monitor.rename(m.id);
          return;
        case 'focus':
          void this.monitor.focus(m.id);
          return;
        case 'close':
          void this.monitor.close(m.id);
          return;
        case 'diagnose':
          void this.monitor.diagnose();
          return;
      }
    });

    // Visible again after being hidden: the numbers had been frozen for a while, so
    // this asks the API outright instead of settling for whatever the cache holds.
    const vis = view.onDidChangeVisibility(() => view.visible && this.monitor.refreshNow());
    const lang = onDidChangeLang((value) => post({ k: 'lang', value }));

    view.onDidDispose(() => {
      listener.dispose();
      vis.dispose();
      lang.dispose();
      sub?.dispose();
      steps?.dispose();
    });
  }

  /** The same choice the chat saved: one setting, two panels. */
  private lang() {
    const saved = this.ctx.globalState.get<Partial<Prefs>>('claudeStudio.prefs');
    return saved?.lang ?? DEFAULT_PREFS.lang;
  }
}
