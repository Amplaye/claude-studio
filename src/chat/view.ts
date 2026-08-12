import * as vscode from 'vscode';
import { bindWebview } from './bind';
import type { ChatController } from './controller';

/** La faccia stretta: vive nel contenitore della barra delle attivita'. */
export class ChatView implements vscode.WebviewViewProvider {
  static readonly id = 'claudeStudio.chat';

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly chat: ChatController
  ) {}

  resolveWebviewView(view: vscode.WebviewView) {
    const { surface, listener } = bindWebview(view.webview, this.ctx, this.chat, 'view');
    view.onDidDispose(() => {
      listener.dispose();
      this.chat.detach(surface);
    });
  }
}
