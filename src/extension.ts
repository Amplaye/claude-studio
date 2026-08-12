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
  // La barra di contesto vive nello stesso processo della chat: e' cosi' che vede
  // le conversazioni aperte da qui senza doverle indovinare dal disco.
  const monitor = new ContextMonitor();
  monitor.start(ctx);

  ctx.subscriptions.push(
    registerDiffProvider(),
    // La chat deve sapere cosa hai selezionato senza chiedertelo.
    vscode.window.onDidChangeTextEditorSelection(() => chat.pushSelection()),
    vscode.window.onDidChangeActiveTextEditor(() => chat.pushSelection()),
    // Torni sulla finestra: il bollino di "ha finito" ha gia' detto quel che
    // doveva e si spegne da solo.
    vscode.window.onDidChangeWindowState((s) => s.focused && chat.onWindowFocus()),
    vscode.window.registerWebviewViewProvider(ChatView.id, new ChatView(ctx, chat, monitor), {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerWebviewViewProvider(ContextView.id, new ContextView(ctx, monitor), {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    ChatPanel.register(ctx, chat, monitor),
    // "Apri" apre la scheda: e' la faccia principale. Il pannello laterale resta
    // a portata di mano, ma da comando suo.
    vscode.commands.registerCommand('claudeStudio.show', () => ChatPanel.open(ctx, chat, undefined, monitor)),
    vscode.commands.registerCommand('claudeStudio.openTab', () =>
      ChatPanel.open(ctx, chat, undefined, monitor)
    ),
    vscode.commands.registerCommand('claudeStudio.openSidebar', () => {
      // Chiesto apposta: qui il pannello laterale deve restare, non rimbalzare
      // subito sulla scheda.
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
    // Gli aggiornamenti arrivano da soli; questo comando serve solo a non dover
    // aspettare il giro delle sei ore.
    vscode.commands.registerCommand('claudeStudio.update', () => checkForUpdates(ctx, { manual: true })),
    startAutoUpdate(ctx),
    { dispose: () => chat.dispose() },
    { dispose: () => monitor.dispose() }
  );
}

export function deactivate() {}
