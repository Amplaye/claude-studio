// Le due facce della chat — pannello laterale e scheda — mostrano la stessa pagina
// e parlano lo stesso protocollo. Qui c'e' l'aggancio comune, una volta sola.
import * as vscode from 'vscode';
import type { Cmd } from '../engine/protocol';
import type { ContextMonitor } from '../context/monitor';
import type { CtxCmd, CtxToChat } from '../context/protocol';
import { renderPage } from '../shared/html';
import { openFile } from './editor';
import type { ChatController, Surface } from './controller';

export function bindWebview(
  webview: vscode.Webview,
  ctx: vscode.ExtensionContext,
  chat: ChatController,
  kind: Surface['kind'],
  monitor?: ContextMonitor
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
    contextCss: 'context.css',
    chatCss: 'chat.css',
    ctxpanelJs: 'ctxpanel.js',
    chimeJs: 'chime.js',
    chatJs: 'chat.js',
  });

  const surface: Surface = {
    kind,
    post: (e) => void webview.postMessage(e),
  };

  // La scheda a tutto schermo si tiene il contesto in una colonna di fianco: nella
  // barra laterale quel pannello c'e' gia' per conto suo, qui no. Ci si iscrive solo
  // per la scheda, cosi' non si spedisce roba a chi non la disegna.
  let ctxSub: vscode.Disposable | undefined;

  const msgs = webview.onDidReceiveMessage((m: Cmd | CtxCmd) => {
    switch (m?.cmd) {
      case 'ready':
        chat.attach(surface);
        chat.hello(surface);
        if (kind === 'panel' && monitor && !ctxSub) {
          ctxSub = monitor.subscribe((d) => void webview.postMessage({ k: 'ctx', d } as CtxToChat));
        }
        return;
      case 'send':
        chat.send(m.text, m.images, m.withSelection);
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
      case 'answer':
        chat.answer(m.id, m.choice, m.answers);
        return;
      case 'setMode':
        chat.setMode(m.value);
        return;
      case 'setPrefs':
        chat.setPrefs(m.value);
        return;
      case 'history':
        void chat.sendHistory(surface);
        return;
      case 'open':
        void chat.open(m.id, !!m.fork);
        return;
      case 'files':
        void chat.sendFiles(m.q, surface);
        return;
      case 'openFile':
        void openFile(m.path, m.line);
        return;
      // ---- quello che manda la colonna del contesto ----
      case 'refresh':
        monitor?.tick();
        return;
      case 'rename':
        void monitor?.rename(m.id);
        return;
      case 'focus':
        void monitor?.focus(m.id);
        return;
      case 'diagnose':
        void monitor?.diagnose();
        return;
    }
  });

  return {
    surface,
    listener: {
      dispose() {
        ctxSub?.dispose();
        msgs.dispose();
      },
    },
  };
}
