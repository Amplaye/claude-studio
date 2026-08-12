// La faccia larga: una scheda vera nell'area editor, come quella dell'ufficiale.
// Una sola alla volta — riaprirla la riporta in primo piano invece di duplicarla —
// e sopravvive al ricaricamento della finestra grazie al serializer.
import * as vscode from 'vscode';
import { owned } from '../context/owned';
import type { ContextMonitor } from '../context/monitor';
import { bindWebview } from './bind';
import type { ChatController } from './controller';

const TYPE = 'claudeStudio.panel';

export class ChatPanel {
  private static current?: ChatPanel;

  static open(
    ctx: vscode.ExtensionContext,
    chat: ChatController,
    column?: vscode.ViewColumn,
    monitor?: ContextMonitor
  ) {
    if (ChatPanel.current) {
      ChatPanel.current.panel.reveal(column, false);
      return ChatPanel.current;
    }
    const panel = vscode.window.createWebviewPanel(
      TYPE,
      'Claude Studio',
      column ?? vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    return new ChatPanel(panel, ctx, chat, monitor);
  }

  /** Ricarichi la finestra e la scheda e' ancora li'. */
  static register(
    ctx: vscode.ExtensionContext,
    chat: ChatController,
    monitor?: ContextMonitor
  ): vscode.Disposable {
    return vscode.window.registerWebviewPanelSerializer(TYPE, {
      async deserializeWebviewPanel(panel) {
        if (ChatPanel.current) {
          panel.dispose();
          return;
        }
        new ChatPanel(panel, ctx, chat, monitor);
      },
    });
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    ctx: vscode.ExtensionContext,
    chat: ChatController,
    monitor?: ContextMonitor
  ) {
    ChatPanel.current = this;
    panel.iconPath = vscode.Uri.joinPath(ctx.extensionUri, 'media', 'activity.svg');

    const { surface, listener } = bindWebview(panel.webview, ctx, chat, 'panel', monitor);
    // Scheda in primo piano = so per certo che conversazione stai guardando: e' il
    // caso in cui la barra di contesto non ha proprio niente da indovinare.
    owned.setPanelActive(panel.active);
    const state = panel.onDidChangeViewState(() => owned.setPanelActive(panel.active));
    panel.onDidDispose(() => {
      state.dispose();
      listener.dispose();
      owned.setPanelActive(false);
      chat.detach(surface);
      if (ChatPanel.current === this) ChatPanel.current = undefined;
    });
  }
}
