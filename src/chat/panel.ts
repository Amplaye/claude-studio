// La faccia larga: una scheda vera nell'area editor, come quella dell'ufficiale.
// La prima scheda e' la "principale" e si comporta come prima (riaprirla la
// riporta in primo piano). Il "+" ne apre di nuove, ciascuna con il proprio
// controller e la propria sessione: cosi' si lavora su piu' conversazioni
// in contemporanea.
import * as vscode from 'vscode';
import { owned } from '../context/owned';
import type { ContextMonitor } from '../context/monitor';
import { bindWebview } from './bind';
import { ChatController } from './controller';

const TYPE = 'claudeStudio.panel';

export class ChatPanel {
  /** La scheda principale: una sola, riaprirla la riporta davanti. */
  private static primary?: ChatPanel;
  /** Tutte le schede aperte, principale compresa: servono per la pulizia. */
  private static all = new Set<ChatPanel>();

  /**
   * Apre la scheda principale: se c'e' gia', la riporta davanti. E' il
   * comportamento di "Apri Claude Studio" e del clic sull'icona.
   */
  static open(
    ctx: vscode.ExtensionContext,
    chat: ChatController,
    column?: vscode.ViewColumn,
    monitor?: ContextMonitor
  ) {
    if (ChatPanel.primary) {
      ChatPanel.primary.panel.reveal(column, false);
      return ChatPanel.primary;
    }
    const panel = vscode.window.createWebviewPanel(
      TYPE,
      'Claude Studio',
      column ?? vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    return new ChatPanel(panel, ctx, chat, monitor, true);
  }

  /**
   * Apre una nuova scheda indipendente, con il proprio controller e la propria
   * sessione. E' il "+" nella testata.
   */
  static openNew(ctx: vscode.ExtensionContext, monitor?: ContextMonitor) {
    const chat = new ChatController(ctx, { primary: false });
    const n = ChatPanel.all.size + 1;
    const panel = vscode.window.createWebviewPanel(
      TYPE,
      `Claude Studio #${n}`,
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    return new ChatPanel(panel, ctx, chat, monitor, false);
  }

  /** Ricarichi la finestra e la scheda e' ancora li'. */
  static register(
    ctx: vscode.ExtensionContext,
    chat: ChatController,
    monitor?: ContextMonitor
  ): vscode.Disposable {
    return vscode.window.registerWebviewPanelSerializer(TYPE, {
      async deserializeWebviewPanel(panel) {
        if (ChatPanel.primary) {
          panel.dispose();
          return;
        }
        new ChatPanel(panel, ctx, chat, monitor, true);
      },
    });
  }

  /** Il controller di questa scheda: le schede secondarie ne hanno uno proprio. */
  readonly chat: ChatController;
  /** true = scheda principale, false = scheda secondaria (ne ha uno suo). */
  private readonly isPrimary: boolean;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    ctx: vscode.ExtensionContext,
    chat: ChatController,
    monitor: ContextMonitor | undefined,
    isPrimary: boolean
  ) {
    this.chat = chat;
    this.isPrimary = isPrimary;
    if (isPrimary) ChatPanel.primary = this;
    ChatPanel.all.add(this);
    panel.iconPath = vscode.Uri.joinPath(ctx.extensionUri, 'media', 'activity.svg');

    const { surface, listener } = bindWebview(panel.webview, ctx, chat, 'panel', monitor);
    // Solo la principale governa il bollino della barra: le secondarie sono
    // conversazioni a se', la barra di contesto le ignora.
    if (isPrimary) {
      owned.setPanelActive(panel.active);
    }
    const state = panel.onDidChangeViewState(() => {
      if (isPrimary) owned.setPanelActive(panel.active);
    });
    panel.onDidDispose(() => {
      state.dispose();
      listener.dispose();
      if (isPrimary) owned.setPanelActive(false);
      chat.detach(surface);
      // Le schede secondarie portano con se' il controller: quando muoiono, muore
      // anche quello.
      if (!isPrimary) chat.dispose();
      ChatPanel.all.delete(this);
      if (ChatPanel.primary === this) ChatPanel.primary = undefined;
    });
  }
}
