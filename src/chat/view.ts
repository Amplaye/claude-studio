import * as vscode from 'vscode';
import { owned } from '../context/owned';
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
    // La barra di contesto vuole sapere se la chat e' sotto gli occhi: e' quello che
    // le permette di dire "sei qui" senza tirare a indovinare.
    owned.setViewVisible(view.visible);
    const vis = view.onDidChangeVisibility(() => owned.setViewVisible(view.visible));
    view.onDidDispose(() => {
      vis.dispose();
      listener.dispose();
      owned.setViewVisible(false);
      this.chat.detach(surface);
    });
  }
}
