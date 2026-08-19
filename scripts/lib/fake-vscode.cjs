// The fake `vscode` the offline checks load instead of the real editor.
//
// Only the surface every check agreed on, character for character: the constants,
// the class stubs, the events nobody listens to, a page and a tab that behave like
// ours. What a single check needs to *observe* — which warning gets accepted, which
// diagnostics exist, which tabs are open, whether a command runs or is only written
// down — is not here: build the object, then assign over the two or three branches
// that test cares about. That is deliberate; folding those into options would put
// five tests' expectations inside one file where none of them read.
const Module = require('node:module');
const path = require('node:path');

const uri = (p) => ({ fsPath: p, scheme: 'file', toString: () => 'file:///' + p.replace(/\\/g, '/') });

/** What `registered` starts as. Reused by reload-check, which empties it in place. */
const newRegistry = () => ({
  views: new Map(),
  commands: new Map(),
  panels: [],
  provider: null,
  serializer: null,
  statusBar: null,
});

/**
 * A page that behaves like ours: it collects whatever the extension sends it, lets
 * the test answer back, and keeps aside what it is told to keep aside (the `sid`
 * wire, see webview/chat.js) — that is the state VS Code hands the deserializer
 * after a reload.
 */
function fakeWebview(state) {
  const got = [];
  const w = {
    cspSource: 'vscode-webview://x',
    options: {},
    _html: '',
    _onMsg: () => {},
    got,
    state: state ? { ...state } : {},
    asWebviewUri: (u) => u,
    onDidReceiveMessage: (fn) => {
      w._onMsg = fn;
      return { dispose() {} };
    },
    postMessage: async (m) => {
      got.push(m);
      if (m && m.k === 'sid') w.state = { ...w.state, sid: m.id || '' };
      return true;
    },
    set html(v) {
      w._html = v;
    },
    get html() {
      return w._html;
    },
  };
  return w;
}

/** A tab: opened, brought to the front, made active, closed. */
function fakePanel(registered, type, title, state) {
  const dying = [];
  const viewState = [];
  const panel = {
    type,
    title,
    webview: fakeWebview(state),
    iconPath: undefined,
    active: true,
    visible: true,
    disposed: false,
    revealed: 0,
    reveal() {
      panel.revealed++;
    },
    /** Bringing a tab to the front: the same event VS Code fires. */
    setActive(v) {
      panel.active = v;
      for (const fn of viewState) fn();
    },
    dispose() {
      panel.disposed = true;
      for (const fn of dying) fn();
    },
    onDidDispose: (fn) => {
      dying.push(fn);
      return { dispose() {} };
    },
    onDidChangeViewState: (fn) => {
      viewState.push(fn);
      return { dispose() {} };
    },
  };
  registered.panels.push(panel);
  return panel;
}

/**
 * The shared object. `workspaceRoot` is the folder the extension believes it is
 * open on; `registered` is where everything the extension announces gets written
 * down, so the test can read it back.
 */
function makeVscode({ workspaceRoot, registered }) {
  return {
    ViewColumn: { Active: -1, Beside: -2, One: 1 },
    StatusBarAlignment: { Left: 1, Right: 2 },
    DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
    TextEditorRevealType: { InCenter: 2 },
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
    Uri: {
      file: uri,
      joinPath: (base, ...parts) => uri(path.join(base.fsPath, ...parts)),
      from: (o) => uri(o.path || ''),
    },
    env: { clipboard: { writeText: async () => {} }, openExternal: async () => true },
    window: {
      createOutputChannel: () => ({ appendLine() {}, show() {}, dispose() {} }),
      createStatusBarItem: () => {
        registered.statusBar = { text: '', tooltip: '', show() {}, hide() {}, dispose() {} };
        return registered.statusBar;
      },
      showInputBox: async () => undefined,
      /** The window is always "in the foreground": there is nobody to notify here. */
      state: { focused: true },
      onDidChangeWindowState: () => ({ dispose() {} }),
      registerWebviewViewProvider: (id, p) => {
        registered.views.set(id, p);
        if (id === 'claudeStudio.chat') registered.provider = p;
        return { dispose() {} };
      },
      registerWebviewPanelSerializer: (type, ser) => {
        registered.serializer = { type, ser };
        return { dispose() {} };
      },
      createWebviewPanel: (type, title, column, opts) => {
        // `opts` carries retainContextWhenHidden, which host-check reads back: a tab
        // that loses its page when you look away is the defect it guards.
        const panel = fakePanel(registered, type, title);
        panel.column = column;
        panel.opts = opts;
        return panel;
      },
      showWarningMessage: async () => undefined,
      showInformationMessage: async () => undefined,
      showErrorMessage: async () => undefined,
      showTextDocument: async () => ({}),
      activeTextEditor: undefined,
      onDidChangeActiveTextEditor: () => ({ dispose() {} }),
      onDidChangeTextEditorSelection: () => ({ dispose() {} }),
      tabGroups: {
        all: [],
        onDidChangeTabs: () => ({ dispose() {} }),
        onDidChangeTabGroups: () => ({ dispose() {} }),
      },
    },
    languages: { getDiagnostics: () => [] },
    commands: {
      registerCommand: (id, fn) => {
        registered.commands.set(id, fn);
        return { dispose() {} };
      },
      executeCommand: async (id, ...args) => registered.commands.get(id)?.(...args),
    },
    workspace: {
      workspaceFolders: [{ uri: uri(workspaceRoot) }],
      // The tests must not go to npm looking for updates: the automatic check is off
      // here, as if you had turned it off yourself.
      getConfiguration: () => ({ get: (k, d) => (k === 'autoUpdate' ? 'off' : d) }),
      findFiles: async () => [],
      openTextDocument: async (o) => ({ getText: () => o?.content ?? '' }),
      registerTextDocumentContentProvider: () => ({ dispose() {} }),
      onDidChangeWorkspaceFolders: () => ({ dispose() {} }),
      onDidChangeConfiguration: () => ({ dispose() {} }),
      fs: { stat: async () => ({}) },
      asRelativePath: (p) => String(p?.fsPath ?? p),
    },
    Position: class {},
    Range: class {},
    Selection: class {},
  };
}

/**
 * Hand `vscode` — and anything else in `extra`, keyed by module name — to the
 * bundle when it asks for them. Everything else loads normally.
 */
function install(vscode, extra = {}) {
  const load = Module._load;
  Module._load = function (req, parent, isMain) {
    if (req === 'vscode') return vscode;
    if (req in extra) return extra[req];
    return load.call(this, req, parent, isMain);
  };
}

/** `context.globalState` / `workspaceState`: a Map that remembers. */
const memento = (map = new Map()) => ({
  get: (k, d) => (map.has(k) ? map.get(k) : d),
  update: async (k, v) => void (v === undefined ? map.delete(k) : map.set(k, v)),
  keys: () => [...map.keys()],
});

/**
 * Accende l'estensione vera e le attacca una faccia della chat.
 *
 * Lo fanno gia' quasi tutti i controlli qui dentro, ognuno con le sue dieci righe;
 * questo serve ai due che *guidano* la chat invece di ispezionarla — `drive.cjs` e
 * `router-check.cjs` — e che devono per forza girare sullo stesso editor finto, o
 * non stanno confrontando la stessa cosa.
 *
 * @param root    la cartella su cui l'estensione crede di essere aperta
 * @param onPost  chiamata con ogni evento che la webview riceverebbe
 * @param tweak   ricevi il `vscode` prima dell'accensione, per piegare i due o tre
 *                rami che ti interessano (vedi il commento in testa a questo file)
 */
function boot(root, onPost, tweak) {
  const registered = newRegistry();
  const vscode = makeVscode({ workspaceRoot: root, registered });
  tweak?.(vscode);
  install(vscode);

  const ext = require(path.join(root, 'dist', 'extension.js'));
  const ctx = {
    extensionUri: uri(root),
    extensionPath: root,
    subscriptions: [],
    globalState: memento(),
    workspaceState: memento(),
  };
  ext.activate(ctx);
  if (!registered.provider) throw new Error('nessun provider di webview registrato');

  const view = {
    webview: fakeWebview(),
    visible: true,
    onDidChangeVisibility: () => ({ dispose() {} }),
    onDidDispose: () => ({ dispose() {} }),
  };
  // La faccia della libreria mette da parte quello che riceve; qui serve invece
  // vederlo passare, uno per uno, mentre passa.
  const collect = view.webview.postMessage;
  view.webview.postMessage = async (m) => {
    onPost(m);
    return collect(m);
  };
  registered.provider.resolveWebviewView(view);

  return { send: (m) => view.webview._onMsg(m), ctx, view, registered, vscode };
}

module.exports = { boot, uri, newRegistry, fakeWebview, fakePanel, makeVscode, install, memento };
