// La terza faccia: l'ufficio, una scheda a tutto schermo nell'area dell'editor.
//
// Non ha dati suoi. Guarda le stesse sessioni del pannello del contesto, dallo stesso
// monitor e sullo stesso filo (`CtxWire`/`CtxCmd`): quello che cambia e' come sono
// disegnate — una pianta vista dall'alto, e una persona seduta a una scrivania per
// ogni conversazione aperta. Cliccare una persona porta alla sua conversazione,
// esattamente come cliccare la sua card.
//
// Una sola, come la scheda principale della chat: due uffici sullo stesso piano sono
// due finestre da chiudere.
import * as vscode from 'vscode';
import { renderPage } from '../shared/html';
import { onDidChangeLang } from '../shared/i18n';
import { DEFAULT_PREFS } from '../engine/protocol';
import type { Prefs } from '../engine/protocol';
import type { ContextMonitor } from '../context/monitor';
import type { CtxCmd, CtxWire } from '../context/protocol';

const TYPE = 'claudeStudio.office';
const TITLE = { en: 'The Office', it: "L'ufficio" };

export class OfficePanel {
  private static current?: OfficePanel;

  /** Apre l'ufficio, o lo riporta davanti se e' gia' aperto. */
  static open(ctx: vscode.ExtensionContext, monitor: ContextMonitor) {
    if (OfficePanel.current) {
      OfficePanel.current.panel.reveal(undefined, false);
      return;
    }
    const panel = vscode.window.createWebviewPanel(TYPE, TITLE.en, vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
    });
    new OfficePanel(panel, ctx, monitor);
  }

  /** Ricarichi la finestra e l'ufficio e' ancora li'. */
  static register(ctx: vscode.ExtensionContext, monitor: ContextMonitor): vscode.Disposable {
    return vscode.window.registerWebviewPanelSerializer(TYPE, {
      async deserializeWebviewPanel(panel) {
        if (OfficePanel.current) {
          panel.dispose();
          return;
        }
        new OfficePanel(panel, ctx, monitor);
      },
    });
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    ctx: vscode.ExtensionContext,
    monitor: ContextMonitor
  ) {
    OfficePanel.current = this;
    const webview = panel.webview;
    panel.iconPath = vscode.Uri.joinPath(ctx.extensionUri, 'media', 'icon.png');
    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(ctx.extensionUri, 'dist', 'webview'),
        vscode.Uri.joinPath(ctx.extensionUri, 'media'),
      ],
    };
    webview.html = renderPage(webview, ctx.extensionUri, 'office.html', {
      tokensCss: 'tokens.css',
      motionCss: 'motion.css',
      officeCss: 'office.css',
      i18nJs: 'i18n.js',
      officeJs: 'office.js',
    });

    const lang = (): 'en' | 'it' =>
      ctx.globalState.get<Partial<Prefs>>('claudeStudio.prefs')?.lang ?? DEFAULT_PREFS.lang;
    const post = (e: CtxWire) => void webview.postMessage(e);
    const name = (l: 'en' | 'it') => {
      const title = TITLE[l];
      if (panel.title !== title) panel.title = title;
    };
    name(lang());

    let sub: vscode.Disposable | undefined;
    const listener = webview.onDidReceiveMessage((m: CtxCmd) => {
      switch (m?.cmd) {
        case 'ready':
          // Ci si iscrive solo quando la pagina e' pronta a ricevere: la prima
          // istantanea, mandata prima, finirebbe nel vuoto e l'ufficio resterebbe
          // vuoto per tutto il primo giro.
          sub?.dispose();
          post({ k: 'lang', value: lang() });
          sub = monitor.subscribe((d) => post({ k: 'data', d }));
          return;
        case 'focus':
          void monitor.focus(m.id);
          return;
      }
    });

    // Tornato davanti dopo essere stato dietro: i numeri erano fermi da un pezzo.
    const state = panel.onDidChangeViewState(() => panel.visible && monitor.refreshNow());
    const onLang = onDidChangeLang((value) => {
      name(value);
      post({ k: 'lang', value });
    });

    panel.onDidDispose(() => {
      listener.dispose();
      state.dispose();
      onLang.dispose();
      sub?.dispose();
      if (OfficePanel.current === this) OfficePanel.current = undefined;
    });
  }
}
