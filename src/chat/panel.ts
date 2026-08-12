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
    // No number in the name: "Claude Studio #2" told you nothing, and three of them
    // side by side were three identical labels. The tab takes the conversation's
    // name as soon as there is one — see followName below.
    const panel = vscode.window.createWebviewPanel(TYPE, 'Claude Studio', vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
    });
    return new ChatPanel(panel, ctx, chat, monitor, false);
  }

  /** The tab that holds a given chat, for going back to it. */
  static byKey(key: string): ChatPanel | undefined {
    return [...ChatPanel.all].find((p) => p.chat.key === key);
  }

  /** The Studio tab in front, if one is. */
  static active(): ChatPanel | undefined {
    return [...ChatPanel.all].find((p) => p.panel.active);
  }

  /** Brings a specific chat's tab to the front. */
  static revealKey(key: string): boolean {
    const p = ChatPanel.byKey(key);
    if (!p) return false;
    p.panel.reveal(undefined, false);
    return true;
  }

  /** Is the primary tab open at all — in front, or behind other editors? */
  static exists(): boolean {
    return !!ChatPanel.primary;
  }

  /** Is the primary tab on screen? Asked before opening another face onto the same
      conversation: one is enough, and the second is a window you have to close. */
  static isVisible(): boolean {
    return !!ChatPanel.primary?.panel.visible;
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
  /** Rewrites the label from the conversation's name. */
  private followName: () => void = () => {};

  /** The name changed somewhere else (a rename from the context card). */
  refreshName() {
    this.followName();
  }

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

    const { surface, listener } = bindWebview(
      panel.webview,
      ctx,
      chat,
      'panel',
      monitor,
      () => panel.visible
    );
    // Every tab says where it is: the context panel draws one card per conversation
    // and puts the "here" badge on the one you're actually looking at. It used to be
    // the primary only, so with three tabs open the badge never moved.
    owned.setFace(chat.key, 'panel', panel.active);
    // The tab is named after its conversation, and follows it: the first thing you
    // write becomes the label, and renaming the card renames the tab.
    this.followName = () => {
      const name = chat.name();
      if (panel.title !== name) panel.title = name;
    };
    this.followName();
    const named = chat.onTitle(this.followName);
    const state = panel.onDidChangeViewState(() => {
      owned.setFace(chat.key, 'panel', panel.active);
      // Back in front after being behind: the numbers had been frozen for a while,
      // and the "refresh" button is gone because this does it by itself.
      if (panel.visible) monitor?.tickSoon();
    });
    panel.onDidDispose(() => {
      state.dispose();
      named.dispose();
      listener.dispose();
      owned.setFace(chat.key, 'panel', false);
      chat.detach(surface);
      // Secondary tabs carry their controller with them: when they die, it dies too.
      if (!isPrimary) chat.dispose();
      ChatPanel.all.delete(this);
      if (ChatPanel.primary === this) ChatPanel.primary = undefined;
    });
  }
}
