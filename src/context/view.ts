// The second face: the context panel, below the chat in the sidebar. Same rule as
// the chat — real files, tight CSP with a nonce, and what travels the wire is data,
// never HTML.
import * as vscode from 'vscode';
import { renderPage } from '../shared/html';
import type { ContextMonitor } from './monitor';
import type { CtxCmd, CtxWire } from './protocol';

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
      ctxpanelJs: 'ctxpanel.js',
      contextJs: 'context.js',
    });

    const post = (e: CtxWire) => void webview.postMessage(e);
    let sub: vscode.Disposable | undefined;

    const listener = webview.onDidReceiveMessage((m: CtxCmd) => {
      switch (m?.cmd) {
        case 'ready':
          // We only subscribe once the page is ready to receive: otherwise the first
          // snapshot would land in the void and everything would stay grey.
          sub?.dispose();
          sub = this.monitor.subscribe((d) => post({ k: 'data', d }));
          return;
        case 'refresh':
          this.monitor.tick();
          return;
        case 'rename':
          void this.monitor.rename(m.id);
          return;
        case 'focus':
          void this.monitor.focus(m.id);
          return;
        case 'diagnose':
          void this.monitor.diagnose();
          return;
      }
    });

    // Visible again after being hidden: the numbers had been frozen for a while.
    const vis = view.onDidChangeVisibility(() => view.visible && this.monitor.tickSoon());

    view.onDidDispose(() => {
      listener.dispose();
      vis.dispose();
      sub?.dispose();
    });
  }
}
