import * as vscode from 'vscode';
import { owned } from '../context/owned';
import type { ContextMonitor } from '../context/monitor';
import { bindWebview } from './bind';
import type { ChatController } from './controller';
import { ChatPanel } from './panel';

/**
 * Quando apri il pannello laterale apposta ("Apri nel pannello laterale") non deve
 * scapparti la scheda in faccia: per qualche istante il rimbalzo si spegne.
 */
let stayInSidebarUntil = 0;
export function stayInSidebar() {
  stayInSidebarUntil = Date.now() + 4000;
}

/** La faccia stretta: vive nel contenitore della barra delle attivita'. */
export class ChatView implements vscode.WebviewViewProvider {
  static readonly id = 'claudeStudio.chat';

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly chat: ChatController,
    private readonly monitor: ContextMonitor
  ) {}

  resolveWebviewView(view: vscode.WebviewView) {
    const { surface, listener } = bindWebview(view.webview, this.ctx, this.chat, 'view');

    const seen = () => {
      // La barra di contesto vuole sapere se la chat e' sotto gli occhi: e' quello
      // che le permette di dire "sei qui" senza tirare a indovinare.
      owned.setViewVisible(view.visible);
      if (view.visible) this.maybeJumpToTab();
    };
    seen();
    const vis = view.onDidChangeVisibility(seen);

    view.onDidDispose(() => {
      vis.dispose();
      listener.dispose();
      owned.setViewVisible(false);
      this.chat.detach(surface);
    });
  }

  /**
   * Cliccare l'icona nella barra delle attivita' apre il contenitore laterale: non
   * c'e' un evento per quel clic, ma c'e' questo — la vista che diventa visibile.
   * Da li' si apre la scheda (o si riporta davanti quella che c'e' gia': una sola,
   * mai una seconda) e il pannello laterale si chiude, avendo gia' dato quel che
   * doveva. Chi preferisce il pannello lo spegne da Impostazioni.
   */
  private maybeJumpToTab() {
    const on = vscode.workspace.getConfiguration('claudeStudio').get<boolean>('openAsTab', true);
    if (!on || Date.now() < stayInSidebarUntil) return;
    // Non si apre una scheda mentre VSCode sta ancora montando questa vista: si
    // lascia finire il giro e poi si salta.
    setTimeout(() => {
      ChatPanel.open(this.ctx, this.chat, undefined, this.monitor);
      void vscode.commands.executeCommand('workbench.action.closeSidebar');
    }, 0);
  }
}
