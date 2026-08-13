// The third face: the task list, in the sidebar under the chat. Same rules as the
// other two — real files, tight CSP with a nonce, data on the wire and never HTML.
import * as vscode from 'vscode';
import { renderPage } from '../shared/html';
import { onDidChangeLang } from '../shared/i18n';
import { DEFAULT_PREFS } from '../engine/protocol';
import type { Prefs } from '../engine/protocol';
import type { TaskStore } from './store';
import type { TaskCmd, TaskWire } from './protocol';

export class TaskView implements vscode.WebviewViewProvider {
  static readonly id = 'claudeStudio.tasks';

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly store: TaskStore
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
    webview.html = renderPage(webview, this.ctx.extensionUri, 'tasks.html', {
      tokensCss: 'tokens.css',
      motionCss: 'motion.css',
      contextCss: 'context.css',
      tasksCss: 'tasks.css',
      i18nJs: 'i18n.js',
      taskspanelJs: 'taskspanel.js',
      tasksJs: 'tasks.js',
    });

    const post = (e: TaskWire) => void webview.postMessage(e);
    let sub: vscode.Disposable | undefined;

    const listener = webview.onDidReceiveMessage((m: TaskCmd) => {
      if (m?.cmd !== 'ready') return;
      // Only once the page can receive: the first list would otherwise land in the
      // void and the panel would sit there empty for a whole turn.
      sub?.dispose();
      post({ k: 'lang', value: this.lang() });
      sub = this.store.subscribe((d) => post({ k: 'tasks', d }));
    });

    const lang = onDidChangeLang((value) => post({ k: 'lang', value }));

    view.onDidDispose(() => {
      listener.dispose();
      lang.dispose();
      sub?.dispose();
    });
  }

  /** The same choice the chat saved: one setting, every panel. */
  private lang() {
    const saved = this.ctx.globalState.get<Partial<Prefs>>('claudeStudio.prefs');
    return saved?.lang ?? DEFAULT_PREFS.lang;
  }
}
