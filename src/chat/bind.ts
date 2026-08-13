// The chat's two faces — sidebar panel and tab — show the same page and speak the
// same protocol. Here is the common hook-up, written once.
import * as vscode from 'vscode';
import type { Cmd } from '../engine/protocol';
import type { ContextMonitor } from '../context/monitor';
import type { CtxCmd, CtxToChat } from '../context/protocol';
import { renderPage } from '../shared/html';
import { openFile } from './editor';
import { sound } from './sound';
import { tasks } from '../tasks/store';
import type { ChatController, Surface } from './controller';

export function bindWebview(
  webview: vscode.Webview,
  ctx: vscode.ExtensionContext,
  chat: ChatController,
  kind: Surface['kind'],
  monitor?: ContextMonitor,
  /** Is this face on screen? The chime needs to know: see sound.ts. */
  visible: () => boolean = () => true
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
    tasksCss: 'tasks.css',
    chatCss: 'chat.css',
    i18nJs: 'i18n.js',
    ctxpanelJs: 'ctxpanel.js',
    taskspanelJs: 'taskspanel.js',
    chimeJs: 'chime.js',
    chatJs: 'chat.js',
  });

  const surface: Surface = {
    kind,
    post: (e) => void webview.postMessage(e),
  };

  // The fullscreen tab keeps the context in a column beside it: in the sidebar that
  // panel already exists on its own, here it doesn't. We subscribe only for the tab,
  // so we don't ship things to someone who doesn't draw them.
  let ctxSub: vscode.Disposable | undefined;
  /** Le task vivono nella stessa colonna delle card: stessa regola, stessa faccia. */
  let taskSub: vscode.Disposable | undefined;

  // This page joins the chorus: the chime goes to whoever can be heard, no matter
  // which conversation finished. The page itself says when its audio woke up.
  let audioReady = false;
  const speaker = sound.add({
    post: (e) => void webview.postMessage(e),
    ready: () => audioReady,
    visible,
  });

  const msgs = webview.onDidReceiveMessage((m: Cmd | CtxCmd) => {
    switch (m?.cmd) {
      case 'ready':
        chat.attach(surface);
        chat.hello(surface);
        if (kind === 'panel' && monitor && !ctxSub) {
          ctxSub = monitor.subscribe((d) => void webview.postMessage({ k: 'ctx', d } as CtxToChat));
        }
        if (kind === 'panel' && !taskSub) {
          taskSub = tasks.subscribe((d) => void webview.postMessage({ k: 'tasks', d } as CtxToChat));
        }
        return;
      case 'send':
        chat.send(m.text, m.images, m.withSelection, m.files);
        return;
      case 'pickFiles':
        void chat.pickAttachments(surface);
        return;
      case 'stashFile':
        void chat.stashAttachment(surface, m.name, m.data);
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
      case 'newTab':
        void vscode.commands.executeCommand('claudeStudio.openNewTab');
        return;
      case 'closeTab':
        // From the tab only: in the sidebar the button isn't there at all, and
        // closing "the active editor" from there would mean closing someone else's file.
        if (kind === 'panel') void vscode.commands.executeCommand('workbench.action.closeActiveEditor');
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
      case 'audio':
        audioReady = !!m.ok;
        return;
      case 'copy':
        void vscode.env.clipboard.writeText(m.text);
        return;
      case 'openLink':
        // http(s) only: the page hands over a string, and a string that turns into
        // a command:// URI would be the page running commands in the editor.
        if (/^https?:\/\//i.test(m.url)) void vscode.env.openExternal(vscode.Uri.parse(m.url));
        return;
      // ---- what the context column sends ----
      case 'refresh':
        monitor?.tick();
        return;
      case 'rename':
        void monitor?.rename(m.id);
        return;
      case 'focus':
        void monitor?.focus(m.id);
        return;
      case 'close':
        void monitor?.close(m.id);
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
        taskSub?.dispose();
        speaker.dispose();
        msgs.dispose();
      },
    },
  };
}
