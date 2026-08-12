import * as vscode from 'vscode';
import { ChatController } from './chat/controller';
import { registerDiffProvider } from './chat/editor';
import { ChatPanel } from './chat/panel';
import { ChatView, stayInSidebar } from './chat/view';
import { ContextMonitor } from './context/monitor';
import { ContextView } from './context/view';
import { checkForUpdates, startAutoUpdate } from './update/updater';

export function activate(ctx: vscode.ExtensionContext) {
  const chat = new ChatController(ctx);
  // The context bar lives in the same process as the chat: that's how it sees the
  // conversations opened from here without having to guess them off the disk.
  const monitor = new ContextMonitor();
  monitor.start(ctx);

  ctx.subscriptions.push(
    registerDiffProvider(),
    // The chat has to know what you selected without asking you.
    vscode.window.onDidChangeTextEditorSelection(() => chat.pushSelection()),
    vscode.window.onDidChangeActiveTextEditor(() => chat.pushSelection()),
    // You come back to the window: the "it's done" badge has already said what it
    // had to say and turns itself off.
    vscode.window.onDidChangeWindowState((s) => s.focused && chat.onWindowFocus()),
    vscode.window.registerWebviewViewProvider(ChatView.id, new ChatView(ctx, chat, monitor), {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerWebviewViewProvider(ContextView.id, new ContextView(ctx, monitor), {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    ChatPanel.register(ctx, chat, monitor),
    // "Open" opens the tab: that's the main face. The sidebar panel stays within
    // reach, but behind its own command.
    vscode.commands.registerCommand('claudeStudio.show', () => ChatPanel.open(ctx, chat, undefined, monitor)),
    vscode.commands.registerCommand('claudeStudio.openTab', () =>
      ChatPanel.open(ctx, chat, undefined, monitor)
    ),
    vscode.commands.registerCommand('claudeStudio.openSidebar', () => {
      // Asked for on purpose: here the sidebar panel has to stay put, not bounce
      // straight over to the tab.
      stayInSidebar();
      return vscode.commands.executeCommand('workbench.view.extension.claudeStudio');
    }),
    vscode.commands.registerCommand('claudeStudio.openTabBeside', () =>
      ChatPanel.open(ctx, chat, vscode.ViewColumn.Beside, monitor)
    ),
    vscode.commands.registerCommand('claudeStudio.openNewTab', () =>
      ChatPanel.openNew(ctx, monitor)
    ),
    vscode.commands.registerCommand('claudeStudio.newSession', () => chat.newSession()),
    vscode.commands.registerCommand('claudeStudio.interrupt', () => chat.interrupt()),
    vscode.commands.registerCommand('claudeStudio.context.show', () =>
      vscode.commands.executeCommand('claudeStudio.context.focus')
    ),
    vscode.commands.registerCommand('claudeStudio.context.refresh', () => monitor.tick()),
    vscode.commands.registerCommand('claudeStudio.context.diagnose', () => monitor.diagnose()),
    // Updates arrive on their own; this command only exists so you don't have to
    // wait for the six-hour round.
    vscode.commands.registerCommand('claudeStudio.update', () => checkForUpdates(ctx, { manual: true })),
    startAutoUpdate(ctx),
    { dispose: () => chat.dispose() },
    { dispose: () => monitor.dispose() }
  );
}

export function deactivate() {}
