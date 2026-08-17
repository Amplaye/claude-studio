// Un VSCode finto, quel tanto che basta perche' l'estensione vera si accenda.
//
// Serve a piu' di un banco di prova (`drive.cjs` per guidare la chat a mano,
// `router-check.cjs` per misurarla), e finche' ce n'era una copia per ciascuno le
// due potevano divergere senza che nessuno se ne accorgesse: una prova che gira su
// un editor diverso dall'altra non confronta niente.
//
//   const { install, boot } = require('./fake-vscode.cjs');
//   install();                       // prima di require('dist/extension.js')
//   const { send } = boot(onMessage); // accende e restituisce come parlarle
const Module = require('node:module');
const path = require('node:path');

const root = path.dirname(__dirname);

const uri = (p) => ({
  fsPath: p,
  scheme: 'file',
  toString: () => 'file:///' + p.replace(/\\/g, '/'),
});

/** Una webview finta: quello che l'estensione le posta arriva a `onPost`. */
function fakeWebview(onPost) {
  const w = {
    cspSource: 'vscode-webview://x',
    options: {},
    _html: '',
    _onMsg: () => {},
    asWebviewUri: (u) => u,
    onDidReceiveMessage: (fn) => ((w._onMsg = fn), { dispose() {} }),
    postMessage: async (m) => (onPost(m), true),
    set html(v) {
      w._html = v;
    },
    get html() {
      return w._html;
    },
  };
  return w;
}

const registered = { provider: null, commands: new Map(), panels: [] };

const vscode = {
  ViewColumn: { Active: -1, Beside: -2, One: 1 },
  Uri: {
    file: uri,
    joinPath: (b, ...p) => uri(path.join(b.fsPath, ...p)),
    parse: (s) => uri(s),
    from: (o) => uri(o.path || ''),
  },
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
  TextEditorRevealType: { InCenter: 2 },
  EventEmitter: class {
    constructor() {
      this.listeners = [];
      this.event = (fn) => (this.listeners.push(fn), { dispose() {} });
    }
    fire(v) {
      for (const l of this.listeners) l(v);
    }
    dispose() {}
  },
  StatusBarAlignment: { Left: 1, Right: 2 },
  ThemeColor: class {
    constructor(id) {
      this.id = id;
    }
  },
  MarkdownString: class {
    constructor(v) {
      this.value = v;
    }
  },
  window: {
    // La barra di stato qui non la vede nessuno, ma l'estensione la crea comunque.
    createStatusBarItem: () => ({ text: '', tooltip: '', show() {}, hide() {}, dispose() {} }),
    // Il registro degli aggiornamenti. Serve trenta secondi dopo l'avvio, non
    // subito: una prova corta non ci arrivava mai e la sua mancanza non si vedeva,
    // una lunga ci arriva e moriva li' dentro, a meta' misura.
    createOutputChannel: () => ({
      appendLine() {},
      append() {},
      show() {},
      hide() {},
      clear() {},
      dispose() {},
    }),
    showInputBox: async () => undefined,
    /** La finestra e' sempre "in primo piano": qui non c'e' nessuno da avvisare. */
    state: { focused: true },
    onDidChangeWindowState: () => ({ dispose() {} }),
    registerWebviewViewProvider: (id, p) => (
      id === 'claudeStudio.chat' && (registered.provider = p), { dispose() {} }
    ),
    registerWebviewPanelSerializer: () => ({ dispose() {} }),
    createWebviewPanel: (type, title, column, opts) => {
      const panel = {
        type,
        title,
        column,
        opts,
        webview: fakeWebview(() => {}),
        active: false,
        reveal() {},
        dispose() {},
        onDidDispose: () => ({ dispose() {} }),
        onDidChangeViewState: () => ({ dispose() {} }),
      };
      registered.panels.push(panel);
      return panel;
    },
    showWarningMessage: async () => undefined,
    showInformationMessage: async () => undefined,
    showErrorMessage: async (m) => (console.log('  [errore VSCode]', m), undefined),
    showTextDocument: async () => ({}),
    activeTextEditor: undefined,
    visibleTextEditors: [],
    onDidChangeActiveTextEditor: () => ({ dispose() {} }),
    onDidChangeTextEditorSelection: () => ({ dispose() {} }),
    tabGroups: {
      all: [{ tabs: [{ isActive: true, input: { uri: uri(path.join(root, 'package.json')) } }] }],
      onDidChangeTabs: () => ({ dispose() {} }),
      onDidChangeTabGroups: () => ({ dispose() {} }),
    },
  },
  commands: {
    registerCommand: (id, fn) => (registered.commands.set(id, fn), { dispose() {} }),
    executeCommand: async () => undefined,
  },
  // due diagnostiche finte, cosi' si vede che il ponte riporta roba vera
  languages: {
    getDiagnostics: () => [
      [
        uri(path.join(root, 'src', 'extension.ts')),
        [{ severity: 0, message: 'prova di errore', range: { start: { line: 3, character: 2 } } }],
      ],
    ],
  },
  workspace: {
    workspaceFolders: [{ uri: uri(root), name: path.basename(root) }],
    // Tutte le impostazioni al loro valore di serie, tranne una: qui gli
    // aggiornamenti automatici stanno spenti. Di serie sono accesi, e mezzo minuto
    // dopo l'avvio un banco di prova si metterebbe a reinstallare la CLI da npm —
    // rete, minuti, e una misura fatta mentre sotto cambia il motore.
    getConfiguration: () => ({ get: (k, d) => (k === 'autoUpdate' ? 'off' : d) }),
    findFiles: async () => [
      uri(path.join(root, 'package.json')),
      uri(path.join(root, 'src', 'extension.ts')),
    ],
    openTextDocument: async () => ({ getText: () => '' }),
    onDidChangeTextDocument: () => ({ dispose() {} }),
    registerTextDocumentContentProvider: () => ({ dispose() {} }),
    onDidChangeWorkspaceFolders: () => ({ dispose() {} }),
    onDidChangeConfiguration: () => ({ dispose() {} }),
    fs: { stat: async () => ({}) },
    asRelativePath: (p) => {
      const s = String(p?.fsPath ?? p);
      return s.startsWith(root) ? s.slice(root.length + 1).replace(/\\/g, '/') : s;
    },
  },
  RelativePattern: class {},
  Range: class {},
  Position: class {},
  Selection: class {},
};

/** Da chiamare **prima** di require('dist/extension.js'). */
function install() {
  const load = Module._load;
  Module._load = function (req, parent, isMain) {
    return req === 'vscode' ? vscode : load.call(this, req, parent, isMain);
  };
  return vscode;
}

function memento() {
  const map = new Map();
  return {
    get: (k, d) => (map.has(k) ? map.get(k) : d),
    update: async (k, v) => void map.set(k, v),
    keys: () => [...map.keys()],
  };
}

/**
 * Accende l'estensione vera e attacca una faccia della chat.
 * @param onPost  chiamata con ogni evento che la webview riceverebbe
 * @returns {{ send, ctx, view }}  `send` manda un comando come farebbe la pagina
 */
function boot(onPost) {
  install();
  const ext = require(path.join(root, 'dist', 'extension.js'));
  const ctx = {
    extensionUri: uri(root),
    extensionPath: root,
    subscriptions: [],
    globalState: memento(),
    workspaceState: memento(),
  };
  ext.activate(ctx);

  const view = {
    webview: fakeWebview(onPost),
    visible: true,
    onDidChangeVisibility: () => ({ dispose() {} }),
    onDidDispose: () => ({ dispose() {} }),
  };
  registered.provider.resolveWebviewView(view);
  return { send: (m) => view.webview._onMsg(m), ctx, view, registered, root };
}

module.exports = { boot, install, fakeWebview, memento, registered, root, uri, vscode };
