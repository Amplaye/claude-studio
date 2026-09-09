// The wide face: a real tab in the editor area, like the official one's. The first
// tab is the "primary" and behaves as before (reopening it brings it to the front).
// The "+" opens new ones, each with its own controller and its own session: that's
// how you work on several conversations at the same time.
import * as vscode from 'vscode';
import { owned } from '../context/owned';
import type { ContextMonitor } from '../context/monitor';
import { t } from '../shared/i18n';
import { bindWebview, type FaceHost } from './bind';
import { ChatController } from './controller';

const TYPE = 'claudeStudio.panel';

export class ChatPanel {
  /** The primary tab: one only, reopening it brings it to the front. */
  private static primary?: ChatPanel;
  /** Every open tab, primary included: they're needed for cleanup. */
  private static all = new Set<ChatPanel>();
  /** L'ufficio: una scheda sola. Il bottone ci riporta invece di aprirne un'altra. */
  private static officeTab?: ChatPanel;

  /**
   * Opens the primary tab: if it's already there, it brings it to the front. This is
   * the behaviour of "Open Claude Studio" and of the click on the icon.
   */
  static open(
    ctx: vscode.ExtensionContext,
    chat: ChatController,
    column?: vscode.ViewColumn,
    monitor?: ContextMonitor
  ) {
    if (ChatPanel.primary) {
      ChatPanel.primary.panel.reveal(column, false);
      return ChatPanel.primary;
    }
    const panel = vscode.window.createWebviewPanel(
      TYPE,
      'Claude Studio',
      column ?? vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    return new ChatPanel(panel, ctx, chat, monitor, true);
  }

  /**
   * "Claude Studio: L'ufficio": la pianta, in una scheda tutta sua.
   *
   * Girare la scheda su cui stavi non reggeva. La chat le si metteva accanto e si
   * prendeva la larghezza che le serviva — in una scheda intera sono mille pixel
   * di testata — e la pianta finiva schiacciata in una striscia: l'ufficio si
   * rimpiccioliva per far posto alla conversazione, che e' l'esatto contrario di
   * quello che deve fare. Adesso ha la sua scheda, con dentro la sua chat, e
   * quella colonna e' larga quanto diciamo noi.
   *
   * Una sola: se c'e' gia', torna davanti quella.
   */
  static openOffice(ctx: vscode.ExtensionContext, monitor?: ContextMonitor) {
    if (ChatPanel.officeTab) {
      ChatPanel.officeTab.panel.reveal(undefined, false);
      ChatPanel.officeTab.showOffice();
      return ChatPanel.officeTab;
    }
    const chat = new ChatController(ctx, { primary: false });
    const panel = vscode.window.createWebviewPanel(TYPE, 'Claude Studio', vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
    });
    const tab = new ChatPanel(panel, ctx, chat, monitor, false, true);
    tab.showOffice();
    return tab;
  }

  /**
   * Quello che fanno la scorciatoia e il comando "apri": sempre una conversazione
   * nuova. La prima volta la scheda principale non c'e' ancora e si fa quella —
   * nasce vuota, che e' gia' il foglio bianco che stai chiedendo. Dalla seconda in
   * poi `open` si limiterebbe a riportare davanti la scheda di prima, quindi se ne
   * apre una indipendente.
   */
  static openFresh(ctx: vscode.ExtensionContext, chat: ChatController, monitor?: ContextMonitor) {
    if (!ChatPanel.primary) return ChatPanel.open(ctx, chat, undefined, monitor);
    return ChatPanel.openNew(ctx, monitor);
  }

  /**
   * Opens a new independent tab, with its own controller and its own session. This
   * is the "+" in the header.
   */
  static openNew(ctx: vscode.ExtensionContext, monitor?: ContextMonitor) {
    const chat = new ChatController(ctx, { primary: false });
    // No number in the name: "Claude Studio #2" told you nothing, and three of them
    // side by side were three identical labels. The tab takes the conversation's
    // name as soon as there is one — see followName below.
    const panel = vscode.window.createWebviewPanel(TYPE, 'Claude Studio', vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
    });
    return new ChatPanel(panel, ctx, chat, monitor, false);
  }

  /**
   * La scheda che tiene una conversazione — anche se non e' quella che sta
   * mostrando adesso: l'ufficio ne tiene quante ne apri, e sono tutte sue.
   */
  static byKey(key: string): ChatPanel | undefined {
    return [...ChatPanel.all].find((p) => p.sessions.some((c) => c.key === key));
  }

  /** The Studio tab in front, if one is. */
  static active(): ChatPanel | undefined {
    return [...ChatPanel.all].find((p) => p.panel.active);
  }

  /** Brings a specific chat's tab to the front. */
  static revealKey(key: string): boolean {
    const p = ChatPanel.byKey(key);
    if (!p) return false;
    p.panel.reveal(undefined, false);
    // Portare davanti una conversazione che la scheda teneva dietro vuol dire
    // mettercisi sopra, non solo mostrare la scheda: e' il clic su una persona
    // dell'ufficio, che deve finire nella sua chat senza cambiare stanza.
    p.show(key);
    return true;
  }

  /**
   * Chiude la scheda di una conversazione. Torna false se quella conversazione non
   * sta in una scheda: e' il caso della chat nella sidebar, che non si chiude — si
   * azzera (vedi ContextMonitor.close).
   */
  static closeKey(key: string): boolean {
    const p = ChatPanel.byKey(key);
    if (!p) return false;
    // Una scheda che ne tiene tante chiude quella conversazione, non se stessa:
    // chiudere l'ufficio perche' hai finito con una delle sei sarebbe chiudere la
    // stanza per liberare una scrivania.
    if (p.sessions.length > 1) {
      p.closeSession(key);
      return true;
    }
    if (p.isPrimary) return false;
    p.panel.dispose();
    return true;
  }

  /** Is the primary tab open at all — in front, or behind other editors? */
  static exists(): boolean {
    return !!ChatPanel.primary;
  }

  /** Is the primary tab on screen? Asked before opening another face onto the same
      conversation: one is enough, and the second is a window you have to close. */
  static isVisible(): boolean {
    return !!ChatPanel.primary?.panel.visible;
  }

  /**
   * You reload the window and the tabs are still there — all of them, each on the
   * conversation it had.
   *
   * VS Code brings back one panel per tab that was open and hands each one the state
   * its page had put aside: the id of its conversation (see the `sid` wire). The tabs
   * beyond the first used to be thrown away here — `panel.dispose()`, on the grounds
   * that there was one chat and one tab — so a window with four conversations came
   * back with one, and reloading became something you learnt not to do. Each extra tab
   * gets a controller of its own, exactly like the ones the "+" opens, and reopens its
   * own transcript.
   */
  static register(
    ctx: vscode.ExtensionContext,
    chat: ChatController,
    monitor?: ContextMonitor
  ): vscode.Disposable {
    return vscode.window.registerWebviewPanelSerializer(TYPE, {
      async deserializeWebviewPanel(panel, state: unknown) {
        const st = (state ?? {}) as { sid?: unknown; office?: unknown; sids?: unknown };
        const sid = st.sid;
        const id = typeof sid === 'string' ? sid : '';
        // L'ufficio torna a essere l'ufficio, e con dentro le conversazioni che
        // teneva. Senza questo un reload della finestra lo faceva tornare come una
        // scheda qualsiasi con una conversazione sola: le altre restavano sul
        // disco ma la stanza non le conosceva piu'.
        if (st.office === true && !ChatPanel.officeTab) {
          const own = new ChatController(ctx, { primary: false });
          const tab = new ChatPanel(panel, ctx, own, monitor, false, true);
          tab.showOffice();
          void own.restoreSession(id);
          const sids = Array.isArray(st.sids) ? st.sids : [];
          for (const s of sids) {
            if (typeof s === 'string' && s && s !== id) tab.adopt(s);
          }
          return;
        }
        // La prima che torna e' la principale: e' quella che divide la conversazione
        // con la chat della sidebar, e l'unica che il resto dell'estensione sa dove
        // trovare (il badge, "apri", i comandi).
        if (!ChatPanel.primary) {
          new ChatPanel(panel, ctx, chat, monitor, true);
          void chat.restoreSession(id);
          return;
        }
        const own = new ChatController(ctx, { primary: false });
        new ChatPanel(panel, ctx, own, monitor, false);
        void own.restoreSession(id);
      },
    });
  }

  /**
   * La conversazione che questa scheda ha davanti adesso. Non e' piu' fissa: nella
   * scheda dell'ufficio si cambia dalla striscia in cima, senza ricaricare niente.
   */
  chat: ChatController;
  /**
   * Tutte le conversazioni che vivono in questa scheda. Una sola, tranne
   * l'ufficio: li' il "+" ne aggiunge una qui dentro invece di aprire una scheda —
   * un ufficio solo, con dentro tutte le sessioni.
   */
  private readonly sessions: ChatController[] = [];
  /** Cambia la conversazione della pagina. Lo da' bindWebview. */
  private swapFace: (next: ChatController) => void = () => {};
  /** Il filo verso la pagina, per la striscia. */
  private post: (e: unknown) => void = () => {};
  /** L'iscrizione al nome della conversazione di adesso: cambia con lei. */
  private named: vscode.Disposable = { dispose() {} };
  /** L'ultima striscia mandata, per non rimandarla uguale dieci volte al secondo. */
  private lastTabs = '';
  /** true = primary tab, false = secondary tab (which has its own). */
  private readonly isPrimary: boolean;
  /** Rewrites the label from the conversation's name. */
  private followName: () => void = () => {};

  /** The name changed somewhere else (a rename from the context card). */
  refreshName() {
    this.followName();
  }

  /**
   * Gira la scheda sulla pianta dell'ufficio.
   *
   * Se la pagina non e' ancora in piedi — la scheda l'abbiamo appena aperta — il
   * messaggio finirebbe nel vuoto: si riprova al primo colpo d'occhio utile, che
   * arriva comunque entro un attimo dal caricamento.
   */
  showOffice() {
    const send = () => {
      try {
        void this.panel.webview.postMessage({ k: 'view', value: 'office' });
      } catch {
        /* scheda chiusa nel frattempo */
      }
    };
    // La scheda e' appena nata e la pagina non e' ancora in piedi: il primo colpo
    // va nel vuoto. Tre in un secondo, che e' molto piu' di quanto ci mette a
    // caricarsi, e quelli di troppo non costano niente.
    send();
    for (const ms of [400, 1000]) setTimeout(send, ms);
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly ctx: vscode.ExtensionContext,
    chat: ChatController,
    monitor: ContextMonitor | undefined,
    isPrimary: boolean,
    /** La scheda dell'ufficio: si chiama come l'ufficio, e ce n'e' una sola. */
    private readonly isOffice = false
  ) {
    this.chat = chat;
    this.sessions.push(chat);
    this.isPrimary = isPrimary;
    if (isPrimary) ChatPanel.primary = this;
    if (isOffice) ChatPanel.officeTab = this;
    ChatPanel.all.add(this);
    panel.iconPath = vscode.Uri.joinPath(ctx.extensionUri, 'media', 'icon.png');

    // Solo l'ufficio ospita: nelle altre schede il "+" continua ad aprire una
    // scheda nuova, che li' e' quello che vuoi.
    const host: FaceHost | undefined = isOffice
      ? {
          ready: () => {
            // Quella di prima non l'ha sentita nessuno: si riparte da zero, se no
            // `sendTabs` la crede gia' consegnata e non la rimanda.
            this.lastTabs = '';
            this.sendTabs();
          },
          fresh: () => this.newSession(),
          pick: (key) => this.show(key),
          close: (key) => this.closeSession(key),
        }
      : undefined;
    const { surface, listener, swap } = bindWebview(
      panel.webview,
      ctx,
      chat,
      'panel',
      monitor,
      () => panel.visible,
      host
    );
    this.swapFace = swap;
    this.post = (e) => surface.post(e as never);
    // Every tab says where it is: the context panel draws one card per conversation
    // and puts the "here" badge on the one you're actually looking at. It used to be
    // the primary only, so with three tabs open the badge never moved.
    owned.setFace(chat.key, 'panel', panel.active);
    // The tab is named after its conversation, and follows it: the first thing you
    // write becomes the label, and renaming the card renames the tab.
    //
    // E se ha finito mentre guardavi altrove, il nome se lo porta scritto davanti:
    // un pallino, sulla linguetta, esattamente dove stai gia' guardando per capire
    // quale scheda aprire. Sparisce appena quella scheda torna davanti.
    this.followName = () => {
      const chat = this.chat;
      // La scheda dell'ufficio si chiama l'ufficio finche' la sua conversazione non
      // ha un nome suo. `name()` risponde 'Claude Studio' proprio quando non ce l'ha
      // ancora, ed e' l'unica etichetta che in una fila di linguette non dice niente.
      const given = chat.name();
      const label = this.isOffice && given === 'Claude Studio' ? t(chat.lang(), 'tab.office') : given;
      const name = (owned.isDone(chat.key) ? '● ' : '') + label;
      if (panel.title !== name) panel.title = name;
    };
    this.followName();
    this.named = chat.onTitle(this.followName);
    // La striscia deve dire anche di quelle che stanno dietro: chi lavora, chi ha
    // finito, chi aspetta un permesso. Quelle non passano da onTitle.
    const roster = isOffice ? owned.onChange(() => this.sendTabs()) : { dispose() {} };
    this.sendTabs();
    const state = panel.onDidChangeViewState(() => {
      owned.setFace(chat.key, 'panel', panel.active);
      if (panel.active) this.followName();
      // Back in front after being behind: the numbers had been frozen for a while,
      // and the "refresh" button is gone because this does it by itself.
      if (panel.visible) monitor?.refreshNow();
    });
    panel.onDidDispose(() => {
      state.dispose();
      roster.dispose();
      this.named.dispose();
      listener.dispose();
      owned.setFace(this.chat.key, 'panel', false);
      this.chat.detach(surface);
      // Secondary tabs carry their controller with them: when they die, it dies too.
      // E l'ufficio se ne porta dietro quante ne teneva: sono nate qui.
      if (!isPrimary) for (const c of this.sessions) c.dispose();
      // La principale no: la sua conversazione vive anche nella chat della sidebar, e
      // chiudere la scheda non e' chiudere la conversazione. Ma se la sidebar non c'e'
      // — ed e' il caso normale, visto che aprendo la scheda la sidebar si chiude da
      // sola — quella conversazione non e' piu' da nessuna parte, e la sua card resta
      // in elenco a dire "sei qui" mentre non c'e' nessun qui. Niente facce, niente
      // card. Riaprendo la scheda torna: la riattacca `readopt`.
      else if (!this.chat.hasFaces()) owned.end(this.chat.key);
      ChatPanel.all.delete(this);
      if (ChatPanel.primary === this) ChatPanel.primary = undefined;
      if (ChatPanel.officeTab === this) ChatPanel.officeTab = undefined;
    });
  }

  /**
   * Mettiti su questa conversazione, che questa scheda tiene gia'.
   *
   * La pagina non si ricarica: si stacca quella di prima, lo schermo si azzera e
   * la nuova si racconta da capo. E' il modo in cui un ufficio solo puo' tenere
   * dentro tutte le conversazioni invece di aprire una stanza per ciascuna.
   */
  show(key: string) {
    const next = this.sessions.find((c) => c.key === key);
    if (!next || next === this.chat) return;
    owned.setFace(this.chat.key, 'panel', false);
    this.named.dispose();
    this.chat = next;
    this.swapFace(next);
    owned.setFace(next.key, 'panel', this.panel.active);
    this.named = next.onTitle(this.followName);
    this.followName();
    this.sendTabs();
  }

  /**
   * Rimette dentro una conversazione che questa scheda teneva prima del reload.
   * Non ci si va sopra: si riprende da dove eri, e le altre stanno nella striscia
   * ad aspettare che le apri.
   */
  adopt(sid: string) {
    const chat = new ChatController(this.ctx, { primary: false });
    this.sessions.push(chat);
    void chat.restoreSession(sid).then(() => this.sendTabs());
  }

  /** Una conversazione nuova, qui dentro, e ci si va subito. */
  newSession() {
    const chat = new ChatController(this.ctx, { primary: false });
    this.sessions.push(chat);
    this.show(chat.key);
  }

  /**
   * Chiude una conversazione della scheda. L'ultima non si chiude: una scheda
   * dell'ufficio senza nessuna conversazione e' una stanza senza chat, e da li'
   * non si scriverebbe piu' niente.
   */
  closeSession(key: string) {
    if (this.sessions.length < 2) return;
    const i = this.sessions.findIndex((c) => c.key === key);
    if (i < 0) return;
    const [gone] = this.sessions.splice(i, 1);
    // Se chiudevi quella che avevi davanti ci si sposta sulla vicina: quella
    // prima, o la prima che resta.
    if (this.chat === gone) this.show(this.sessions[Math.max(0, i - 1)].key);
    gone.dispose();
    this.sendTabs();
  }

  /**
   * La striscia delle conversazioni di questa scheda, come la disegna la pagina.
   * Solo l'ufficio la manda: le altre schede ne hanno una sola, e la striscia
   * sarebbe una linguetta che ripete l'etichetta della scheda.
   */
  private sendTabs() {
    if (!this.isOffice) return;
    const live = owned.all();
    const items = this.sessions.map((c) => {
      const own = live.find((o) => o.key === c.key);
      const given = c.name();
      return {
        key: c.key,
        sid: own?.id ?? '',
        // 'Claude Studio' e' quello che risponde name() quando un nome non ce
        // l'ha ancora: nella striscia lo scrive la pagina, nella sua lingua.
        name: given === 'Claude Studio' ? '' : given,
        busy: !!own?.busy,
        done: !!own?.done,
        asking: !!own?.asks.length,
        active: c === this.chat,
      };
    });
    // owned cambia a ogni pezzo di risposta: senza questo la striscia si
    // rimanderebbe intera dieci volte al secondo per non dire niente di nuovo.
    const sig = JSON.stringify(items);
    if (sig === this.lastTabs) return;
    this.lastTabs = sig;
    this.post({ k: 'tabs', items });
  }
}
