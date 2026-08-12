// Le due facce della chat — pannello laterale e scheda — mostrano la stessa pagina
// e parlano lo stesso protocollo. Qui c'e' l'aggancio comune, una volta sola.
import * as vscode from 'vscode';
import type { Cmd } from '../engine/protocol';
import { renderPage } from '../shared/html';
import type { ChatController, Surface } from './controller';

export function bindWebview(
  webview: vscode.Webview,
  ctx: vscode.ExtensionContext,
  chat: ChatController,
  kind: Surface['kind']
): { surface: Surface; listener: vscode.Disposable } {
  webview.options = {
    enableScripts: true,
    localResourceRoots: [
      vscode.Uri.joinPath(ctx.extensionUri, 'dist', 'webview'),
      vscode.Uri.joinPath(ctx.extensionUri, 'media'),
    ],
  };
  webview.html = renderPage(webview, ctx.extensionUri, 'chat.html', {
    tokensCss: 'tokens.css',
    motionCss: 'motion.css',
    chatCss: 'chat.css',
    chatJs: 'chat.js',
  });

  const surface: Surface = {
    kind,
    post: (e) => void webview.postMessage(e),
  };

  const listener = webview.onDidReceiveMessage((m: Cmd) => {
    switch (m?.cmd) {
      case 'ready':
        chat.attach(surface);
        chat.hello(surface);
        return;
      case 'send':
        chat.send(m.text);
        return;
      case 'interrupt':
        chat.interrupt();
        return;
      case 'newSession':
        chat.newSession();
        return;
      case 'openTab':
        void vscode.commands.executeCommand('claudeStudio.openTab');
        return;
    }
  });

  return { surface, listener };
}
