import * as vscode from 'vscode';
import { ChatController } from './chat/controller';
import { registerDiffProvider } from './chat/editor';
import { ChatPanel } from './chat/panel';
import { ChatView, stayInSidebar } from './chat/view';
import { ContextMonitor } from './context/monitor';
import { owned } from './context/owned';
import { ContextView } from './context/view';
import { tasks } from './tasks/store';
import { tips } from './chat/tips';
import { checkForUpdates, startAutoUpdate } from './update/updater';

export function activate(ctx: vscode.ExtensionContext) {
  // Before the chat: the greeting carries the first tip, and the bag of unseen ones
  // lives in globalState, which only exists once the context is in hand.
  tips.init(ctx);
  const chat = new ChatController(ctx);
  // The context bar lives in the same process as the chat: that's how it sees the
  // conversations opened from here without having to guess them off the disk.
  const monitor = new ContextMonitor();
  monitor.start(ctx);

  // Aprire Studio vuol dire cominciare: la conversazione di ieri non torna da sola.
  // Prima si rileggeva l'ultima del progetto, e cosi' ogni sessione "nuova" nasceva
  // gia' piena di una conversazione che non avevi chiesto.
  //
  // Ricaricando la finestra invece le schede tornano ognuna sulla sua: quello lo fa il
  // serializer in chat/panel.ts, scheda per scheda, e resta com'era — li' la
  // conversazione non la stai aprendo, la stai ritrovando.

  ctx.subscriptions.push(
    registerDiffProvider(),
    // The chat has to know what you selected without asking you.
    vscode.window.onDidChangeTextEditorSelection(() => chat.pushSelection()),
    vscode.window.onDidChangeActiveTextEditor(() => chat.pushSelection()),
    // You come back to the window: the "it's done" badge has already said what it
    // had to say and turns itself off.
    vscode.window.onDidChangeWindowState((s) => s.focused && chat.onWindowFocus()),
    vscode.window.registerWebviewViewProvider(ChatView.id, new ChatView(ctx, chat, monitor), {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerWebviewViewProvider(ContextView.id, new ContextView(ctx, monitor), {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    ChatPanel.register(ctx, chat, monitor),
    // "Open" opens the tab: that's the main face. The sidebar panel stays within
    // reach, but behind its own command.
    // "Apri Claude Studio" apre una conversazione nuova. Chiedere Studio e' chiedere di
    // cominciare qualcosa, non di riavere indietro quello che stavi facendo prima:
    // quella la ritrovi dalla barra di contesto, dove ci sono tutte.
    vscode.commands.registerCommand('claudeStudio.show', () => ChatPanel.openFresh(ctx, chat, monitor)),
    // "Apri come scheda" invece e' il bottone sulla testata della sidebar, e vuol dire
    // "questa conversazione, li'": porta di la' quella che stai guardando. Aprendone
    // una nuova si perderebbe proprio la cosa che si stava chiedendo di spostare.
    vscode.commands.registerCommand('claudeStudio.openTab', () =>
      ChatPanel.open(ctx, chat, undefined, monitor)
    ),
    vscode.commands.registerCommand('claudeStudio.openSidebar', () => {
      // Asked for on purpose: here the sidebar panel has to stay put, not bounce
      // straight over to the tab.
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
    // Rinomina la conversazione della scheda in primo piano — o della sidebar, se e'
    // quella che stai guardando. Il nome finisce sull'etichetta della scheda e sulla
    // card del contesto: e' lo stesso nome, scritto una volta sola.
    vscode.commands.registerCommand('claudeStudio.rename', () => {
      const here = ChatPanel.active();
      return (here?.chat ?? chat).rename();
    }),
    // Click a card in the context panel and you land in that conversation. If it
    // belongs to a tab of the official extension we go to the tab; if that tab
    // isn't in this window the conversation is still on disk, and we reopen it
    // here — the click keeps its promise either way.
    vscode.commands.registerCommand('claudeStudio.openConversation', async (id: string) => {
      if (!id) return;
      // Cliccare una card apre una scheda su quella conversazione. Prima la caricava
      // nella chat della sidebar — o dentro la scheda principale, sopra la
      // conversazione che stavi guardando: due modi diversi di non darti quello che
      // avevi chiesto, cioe' *quella* conversazione, davanti.
      const here = owned.hosting(id);
      if (here) {
        // Gia' aperta in una scheda: si porta davanti. Una seconda faccia sulla
        // stessa conversazione e' solo una finestra da richiudere.
        if (ChatPanel.revealKey(here.key)) return;
        // E' quella della sidebar: la sua chat e' la principale, che ha gia' la sua
        // scheda: si apre quella, e la conversazione ci si trova gia' dentro.
        if (here.key === chat.key) {
          ChatPanel.open(ctx, chat, undefined, monitor);
          return;
        }
      }
      // Nessuno la tiene: una scheda nuova, con la sua chat, che se la carica.
      const panel = ChatPanel.openNew(ctx, monitor);
      await panel.chat.open(id);
    }),
    vscode.commands.registerCommand('claudeStudio.interrupt', () => chat.interrupt()),
    vscode.commands.registerCommand('claudeStudio.context.show', () =>
      vscode.commands.executeCommand('claudeStudio.context.focus')
    ),
    vscode.commands.registerCommand('claudeStudio.context.refresh', () => monitor.tick()),
    vscode.commands.registerCommand('claudeStudio.context.diagnose', () => monitor.diagnose()),
    // Updates arrive on their own; this command only exists so you don't have to
    // wait for the six-hour round.
    vscode.commands.registerCommand('claudeStudio.update', () => checkForUpdates(ctx, { manual: true })),
    startAutoUpdate(ctx),
    { dispose: () => chat.dispose() },
    { dispose: () => monitor.dispose() },
    { dispose: () => tasks.dispose() }
  );
}

export function deactivate() {}
