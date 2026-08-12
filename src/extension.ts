import * as vscode from 'vscode';
import { ChatController } from './chat/controller';
import { registerDiffProvider } from './chat/editor';
import { ChatPanel } from './chat/panel';
import { ChatView } from './chat/view';

export function activate(ctx: vscode.ExtensionContext) {
  const chat = new ChatController();

  ctx.subscriptions.push(
    registerDiffProvider(),
    // La chat deve sapere cosa hai selezionato senza chiedertelo.
    vscode.window.onDidChangeTextEditorSelection(() => chat.pushSelection()),
    vscode.window.onDidChangeActiveTextEditor(() => chat.pushSelection()),
    vscode.window.registerWebviewViewProvider(ChatView.id, new ChatView(ctx, chat), {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    ChatPanel.register(ctx, chat),
    // "Apri" apre la scheda: e' la faccia principale. Il pannello laterale resta
    // a portata di mano, ma da comando suo.
    vscode.commands.registerCommand('claudeStudio.show', () => ChatPanel.open(ctx, chat)),
    vscode.commands.registerCommand('claudeStudio.openTab', () => ChatPanel.open(ctx, chat)),
    vscode.commands.registerCommand('claudeStudio.openSidebar', () =>
      vscode.commands.executeCommand('workbench.view.extension.claudeStudio')
    ),
    vscode.commands.registerCommand('claudeStudio.openTabBeside', () =>
      ChatPanel.open(ctx, chat, vscode.ViewColumn.Beside)
    ),
    vscode.commands.registerCommand('claudeStudio.newSession', () => chat.newSession()),
    vscode.commands.registerCommand('claudeStudio.interrupt', () => chat.interrupt()),
    { dispose: () => chat.dispose() }
  );
}

export function deactivate() {}
