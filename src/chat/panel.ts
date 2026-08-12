// The wide face: a real tab in the editor area, like the official one's. The first
// tab is the "primary" and behaves as before (reopening it brings it to the front).
// The "+" opens new ones, each with its own controller and its own session: that's
// how you work on several conversations at the same time.
import * as vscode from 'vscode';
import { owned } from '../context/owned';
import type { ContextMonitor } from '../context/monitor';
import { bindWebview } from './bind';
import { ChatController } from './controller';

const TYPE = 'claudeStudio.panel';

export class ChatPanel {
  /** The primary tab: one only, reopening it brings it to the front. */
  private static primary?: ChatPanel;
  /** Every open tab, primary included: they're needed for cleanup. */
  private static all = new Set<ChatPanel>();

  /**
   * Opens the primary tab: if it's already there, it brings it to the front. This is
   * the behaviour of "Open Claude Studio" and of the click on the icon.
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
   * Opens a new independent tab, with its own controller and its own session. This
   * is the "+" in the header.
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

  /** You reload the window and the tab is still there. */
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

  /** This tab's controller: secondary tabs have one of their own. */
  readonly chat: ChatController;
  /** true = primary tab, false = secondary tab (which has its own). */
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
    panel.iconPath = vscode.Uri.joinPath(ctx.extensionUri, 'media', 'icon.png');

    const { surface, listener } = bindWebview(panel.webview, ctx, chat, 'panel', monitor);
    // Only the primary governs the bar's badge: the secondary ones are conversations
    // of their own, and the context bar ignores them.
    if (isPrimary) {
      owned.setPanelActive(panel.active);
    }
    const state = panel.onDidChangeViewState(() => {
      if (isPrimary) owned.setPanelActive(panel.active);
      // Back in front after being behind: the numbers had been frozen for a while,
      // and the "refresh" button is gone because this does it by itself.
      if (panel.visible) monitor?.tickSoon();
    });
    panel.onDidDispose(() => {
      state.dispose();
      listener.dispose();
      if (isPrimary) owned.setPanelActive(false);
      chat.detach(surface);
      // Secondary tabs carry their controller with them: when they die, it dies too.
      if (!isPrimary) chat.dispose();
      ChatPanel.all.delete(this);
      if (ChatPanel.primary === this) ChatPanel.primary = undefined;
    });
  }
}
