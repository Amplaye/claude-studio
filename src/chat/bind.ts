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
import { chats } from './controller';
import { owned } from '../context/owned';
import type { ChatController, Surface } from './controller';

/**
 * Chi ospita questa faccia, quando ne ospita piu' d'una.
 *
 * L'ufficio e' una scheda sola con dentro tutte le conversazioni: il "+" non apre
 * una scheda nuova, apre una conversazione qui; e la striscia in cima le cambia.
 * Le schede normali non passano niente e si comportano come sempre.
 */
export interface FaceHost {
  /**
   * La pagina e' in piedi e sta ascoltando.
   *
   * Serve perche' un messaggio mandato a una webview che non ha ancora caricato
   * non viene messo in coda: si perde. La striscia partiva alla nascita della
   * scheda — cioe' sempre troppo presto — e non ripartiva piu', perche' da li' in
   * poi non cambiava niente da ridire. Risultato: nessuna striscia.
   */
  ready(): void;
  /** Una conversazione nuova, dentro questa stessa scheda. */
  fresh(): void;
  /** Mettiti su questa. */
  pick(key: string): void;
  /** Chiudi questa. */
  close(key: string): void;
}

export function bindWebview(
  webview: vscode.Webview,
  ctx: vscode.ExtensionContext,
  initial: ChatController,
  kind: Surface['kind'],
  monitor?: ContextMonitor,
  /** Is this face on screen? The chime needs to know: see sound.ts. */
  visible: () => boolean = () => true,
  host?: FaceHost
): { surface: Surface; listener: vscode.Disposable; swap(next: ChatController): void } {
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
    roomCss: 'room.css',
    officeCss: 'office.css',
    i18nJs: 'i18n.js',
    ctxpanelJs: 'ctxpanel.js',
    taskspanelJs: 'taskspanel.js',
    chimeJs: 'chime.js',
    svRoomJs: 'sv-room.js',
    npcJs: 'npc.js',
    ghiaiaJs: 'ghiaia.js',
    roomJs: 'room.js',
    officeJs: 'office.js',
    chatJs: 'chat.js',
    // I mobili dell'ufficio: un foglio ritagliato da SeasonVale, impacchettato
    // da scripts/sv-sheet.mjs. Il foglio di stile lo prende da un data-attributo
    // della pagina — vedi chat.html. La gente no: la disegna npc.js, e non passa
    // da nessuna immagine.
    roomPng: 'sv-room.png',
  });

  /**
   * La conversazione che questa pagina ha davanti adesso. E' una variabile e non
   * un parametro fisso perche' l'ufficio la cambia senza ricaricare la pagina: chi
   * risponde ai messaggi qui sotto legge sempre quella di adesso.
   */
  let chat = initial;

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
        host?.ready();
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
      case 'preview':
        void chat.preview(surface, m.path);
        return;
      case 'interrupt':
        chat.interrupt();
        return;
      case 'unqueue':
        chat.unqueue(m.id);
        return;
      case 'editQueued':
        chat.editQueued(m.id, m.text);
        return;
      case 'rewind':
        void chat.rewind(m.id);
        return;
      case 'newSession':
        chat.newSession();
        return;
      case 'openTab':
        void vscode.commands.executeCommand('claudeStudio.openTab');
        return;
      case 'openOffice':
        void vscode.commands.executeCommand('claudeStudio.office');
        return;
      case 'newTab':
        // In una scheda che tiene piu' conversazioni la nuova nasce qui dentro:
        // l'ufficio e' uno solo, e aprirne un secondo per scrivere altrove era
        // esattamente quello che non doveva succedere.
        if (host) host.fresh();
        else void vscode.commands.executeCommand('claudeStudio.openNewTab');
        return;
      case 'pickSession':
        host?.pick(m.key);
        return;
      case 'closeSession':
        host?.close(m.key);
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
      // Una risposta data dalla stanza. La domanda non e' di questa chat — e' della
      // persona che hai cliccato — quindi si consegna alla sua, per id di
      // conversazione. Se quella chat non c'e' piu', non succede niente: la domanda
      // e' morta con lei.
      case 'answerAsk': {
        const host = owned.hosting(m.sid);
        if (host) chats.get(host.key)?.answer(m.id, m.choice);
        return;
      }
    }
  });

  return {
    surface,
    /**
     * Cambia la conversazione senza ricaricare la pagina: la vecchia si stacca, lo
     * schermo si azzera e la nuova si racconta da capo (`hello` rimanda mode,
     * preferenze, trascrizione e id). E' quello che fa la striscia dell'ufficio.
     */
    swap(next: ChatController) {
      if (next === chat) return;
      chat.detach(surface);
      chat = next;
      void webview.postMessage({ k: 'reset' });
      chat.attach(surface);
      chat.hello(surface);
    },
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
