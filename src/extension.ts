import * as vscode from 'vscode';
import { ChatController } from './chat/controller';
import { registerDiffProvider } from './chat/editor';
import { ChatPanel } from './chat/panel';
import { ChatView, stayInSidebar } from './chat/view';
import { ContextMonitor } from './context/monitor';
import { ContextView } from './context/view';
import { TaskStore } from './tasks/store';
import { tips } from './chat/tips';
import { TaskView } from './tasks/view';
import { checkForUpdates, startAutoUpdate } from './update/updater';

export function activate(ctx: vscode.ExtensionContext) {
  // Before the chat: the greeting carries the first tip, and the bag of unseen ones
  // lives in globalState, which only exists once the context is in hand.
  tips.init(ctx);
  // The task list is filled by the chat and read by the panel, so it is made here and
  // handed to both — the same object, or the panel would be watching a different list
  // from the one being worked through.
  const tasks = new TaskStore();
  const chat = new ChatController(ctx, { tasks });
  // The context bar lives in the same process as the chat: that's how it sees the
  // conversations opened from here without having to guess them off the disk.
  const monitor = new ContextMonitor();
  monitor.start(ctx);

  // Reloading the window ("Developer: Reload Window") restarts the extension host and
  // takes the in-memory conversation with it. The transcript is still on disk, so the
  // last one is read back in and you carry on where you left off. Fire-and-forget: the
  // views paint the moment they're ready and the replayed messages land as they come.
  void chat.restoreLast();

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
    vscode.window.registerWebviewViewProvider(TaskView.id, new TaskView(ctx, tasks), {
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
    // Rinomina la conversazione della scheda in primo piano — o della sidebar, se e'
    // quella che stai guardando. Il nome finisce sull'etichetta della scheda e sulla
    // card del contesto: e' lo stesso nome, scritto una volta sola.
    vscode.commands.registerCommand('claudeStudio.rename', () => {
      const here = ChatPanel.active();
      return (here?.chat ?? chat).rename();
    }),
    // Click a card in the context panel and you land in that conversation. If it
    // belongs to a tab of the official extension we go to the tab; if that tab
    // isn't in this window the conversation is still on disk, and we reopen it
    // here — the click keeps its promise either way.
    vscode.commands.registerCommand('claudeStudio.openConversation', async (id: string) => {
      if (!id) return;
      // The tab if there is one — brought to the front even from behind other
      // editors — and the sidebar only when there's no tab at all. Opening a second
      // face onto the same conversation is a window you then have to close.
      if (ChatPanel.exists()) {
        ChatPanel.open(ctx, chat, undefined, monitor);
      } else {
        stayInSidebar();
        await vscode.commands.executeCommand('workbench.view.extension.claudeStudio');
      }
      await chat.open(id);
    }),
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
