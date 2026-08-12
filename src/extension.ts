import * as vscode from 'vscode';
import { ChatView } from './chat/view';

export function activate(ctx: vscode.ExtensionContext) {
  const chat = new ChatView(ctx);

  ctx.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatView.id, chat, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('claudeStudio.show', () =>
      vscode.commands.executeCommand('workbench.view.extension.claudeStudio')
    ),
    vscode.commands.registerCommand('claudeStudio.newSession', () => chat.newSession()),
    vscode.commands.registerCommand('claudeStudio.interrupt', () => chat.interrupt()),
    { dispose: () => chat.dispose() }
  );
}

export function deactivate() {}
