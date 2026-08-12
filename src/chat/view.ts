import * as vscode from 'vscode';
import { owned } from '../context/owned';
import type { ContextMonitor } from '../context/monitor';
import { useBadgeHost } from './badge';
import { bindWebview } from './bind';
import type { ChatController } from './controller';
import { ChatPanel } from './panel';

/**
 * When you open the sidebar panel on purpose ("Open in Sidebar") the tab must not
 * jump in your face: for a moment the bounce is switched off.
 */
let stayInSidebarUntil = 0;
export function stayInSidebar() {
  stayInSidebarUntil = Date.now() + 4000;
}

/** The narrow face: it lives in the activity bar container. */
export class ChatView implements vscode.WebviewViewProvider {
  static readonly id = 'claudeStudio.chat';

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly chat: ChatController,
    private readonly monitor: ContextMonitor
  ) {}

  resolveWebviewView(view: vscode.WebviewView) {
    const { surface, listener } = bindWebview(
      view.webview,
      this.ctx,
      this.chat,
      'view',
      undefined,
      () => view.visible
    );
    // The "it's done" badge hangs here: it's the activity bar icon, the only place
    // you can see even from another tab.
    useBadgeHost(view);

    const seen = () => {
      // The context bar wants to know whether the chat is in front of your eyes:
      // that's what lets it say "you are here" without guessing.
      owned.setViewVisible(view.visible);
      if (view.visible) this.maybeJumpToTab();
    };
    seen();
    const vis = view.onDidChangeVisibility(seen);

    view.onDidDispose(() => {
      vis.dispose();
      listener.dispose();
      owned.setViewVisible(false);
      useBadgeHost(undefined);
      this.chat.detach(surface);
    });
  }

  /**
   * Clicking the activity bar icon opens the sidebar container: there's no event for
   * that click, but there is this one — the view becoming visible. From there the
   * tab is opened (or the one already there is brought forward: one only, never a
   * second) and the sidebar panel closes, having already given what it had to give.
   * Anyone who prefers the panel turns this off in Settings.
   */
  private maybeJumpToTab() {
    const on = vscode.workspace.getConfiguration('claudeStudio').get<boolean>('openAsTab', true);
    if (!on || Date.now() < stayInSidebarUntil) return;
    // We don't open a tab while VSCode is still mounting this view: let the round
    // finish, then jump.
    setTimeout(() => {
      ChatPanel.open(this.ctx, this.chat, undefined, this.monitor);
      void vscode.commands.executeCommand('workbench.action.closeSidebar');
    }, 0);
  }
}
