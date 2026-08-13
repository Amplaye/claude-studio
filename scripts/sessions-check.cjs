// Several conversations open at once: names, "you are here", and going back.
//
// host-check drives one real conversation through the CLI, which is slow and needs
// an account. This one asks a cheaper question that had been getting the wrong
// answer for a long time: with three Studio tabs open, does the extension know
// there are three? It used to track only the first — the context panel drew one
// card, the "here" badge never moved, and the tokens you were spending in the other
// two belonged to nobody.
//
// Everything here happens against the real bundle (dist/extension.js) with a fake
// `vscode` and a fake engine: the conversations are simulated by sending the
// chat's own wire events back through the webview, which is exactly what the
// context bar listens to.
const Module = require('node:module');
const path = require('node:path');

const root = path.dirname(__dirname);
const fails = [];
const t = (cond, msg) => !cond && fails.push(msg);

const uri = (p) => ({
  fsPath: p,
  scheme: 'file',
  toString: () => 'file:///' + p.replace(/\\/g, '/'),
});

const registered = { views: new Map(), commands: new Map(), panels: [] };
const inputs = []; // what showInputBox was asked, and what it answers
let inputAnswer;

function fakeWebview() {
  const got = [];
  const w = {
    cspSource: 'vscode-webview://x',
    options: {},
    _html: '',
    _onMsg: () => {},
    got,
    asWebviewUri: (u) => u,
    onDidReceiveMessage: (fn) => {
      w._onMsg = fn;
      return { dispose() {} };
    },
    postMessage: async (m) => {
      got.push(m);
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

const vscode = {
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
    createStatusBarItem: () => ({ text: '', tooltip: '', show() {}, hide() {}, dispose() {} }),
    showInputBox: async (opts) => {
      inputs.push(opts);
      return inputAnswer;
    },
    state: { focused: true },
    onDidChangeWindowState: () => ({ dispose() {} }),
    registerWebviewViewProvider: (id, p) => {
      registered.views.set(id, p);
      return { dispose() {} };
    },
    registerWebviewPanelSerializer: () => ({ dispose() {} }),
    createWebviewPanel: (type, title) => {
      const listeners = [];
      const panel = {
        type,
        title,
        webview: fakeWebview(),
        iconPath: undefined,
        active: false,
        visible: true,
        revealed: 0,
        reveal() {
          panel.revealed++;
          panel.setActive(true);
        },
        /** Bringing a tab to the front: the same event VS Code fires. */
        setActive(v) {
          panel.active = v;
          for (const fn of listeners) fn();
        },
        dispose() {},
        onDidDispose: () => ({ dispose() {} }),
        onDidChangeViewState: (fn) => {
          listeners.push(fn);
          return { dispose() {} };
        },
      };
      registered.panels.push(panel);
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
    workspaceFolders: [{ uri: uri(root) }],
    getConfiguration: () => ({ get: (k, d) => (k === 'autoUpdate' ? 'off' : d) }),
    findFiles: async () => [],
    openTextDocument: async () => ({ getText: () => '' }),
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

const load = Module._load;
Module._load = function (req, parent, isMain) {
  if (req === 'vscode') return vscode;
  return load.call(this, req, parent, isMain);
};

const ext = require(path.join(root, 'dist', 'extension.js'));

function memento() {
  const map = new Map();
  return {
    get: (k, d) => (map.has(k) ? map.get(k) : d),
    update: async (k, v) => void map.set(k, v),
    keys: () => [...map.keys()],
  };
}
const ctx = {
  extensionUri: uri(root),
  extensionPath: root,
  subscriptions: [],
  globalState: memento(),
  workspaceState: memento(),
};

(async () => {
  ext.activate(ctx);

  t(registered.commands.has('claudeStudio.rename'), 'the rename command is not registered');
  t(
    registered.commands.has('claudeStudio.openConversation'),
    'the "open this conversation" command is not registered'
  );

  // ---- two tabs, two conversations ----
  await registered.commands.get('claudeStudio.openTab')();
  await registered.commands.get('claudeStudio.openNewTab')();
  t(registered.panels.length === 2, 'two tabs did not open: ' + registered.panels.length);
  const [tabA, tabB] = registered.panels;
  t(
    !/#\d/.test(tabB.title),
    'the second tab is still numbered instead of named: ' + tabB.title
  );

  tabA.webview._onMsg({ cmd: 'ready' });
  tabB.webview._onMsg({ cmd: 'ready' });

  // Each tab picks up a conversation of its own. This is the road the history drawer
  // takes, and the point of the whole exercise: the id is known the moment you click,
  // without waiting for the engine to start at the next message.
  const ID_A = 'aaaaaaaa-1111-2222-3333-444444444444';
  const ID_B = 'bbbbbbbb-1111-2222-3333-444444444444';
  tabA.webview._onMsg({ cmd: 'open', id: ID_A });
  tabB.webview._onMsg({ cmd: 'open', id: ID_B });
  await new Promise((r) => setTimeout(r, 200));

  const cards = () => {
    registered.commands.get('claudeStudio.context.refresh')();
    const frames = [...tabA.webview.got, ...tabB.webview.got].filter((m) => m.k === 'ctx');
    return frames.length ? frames[frames.length - 1].d.cards : [];
  };
  const ours = () => cards().filter((c) => c.own);

  const mine = ours();
  t(mine.length === 2, 'the context panel does not see both conversations: ' + mine.length);
  t(
    mine.some((c) => c.id === ID_A) && mine.some((c) => c.id === ID_B),
    'the two conversations are not both there: ' + mine.map((c) => c.shortId).join(' | ')
  );

  // ---- "you are here" follows the tab you bring to the front ----
  tabB.setActive(false);
  tabA.setActive(true);
  await new Promise((r) => setTimeout(r, 120));
  const onA = ours().find((c) => c.focused);
  t(onA?.id === ID_A, 'the badge did not follow the tab in front: ' + onA?.shortId);

  tabA.setActive(false);
  tabB.setActive(true);
  await new Promise((r) => setTimeout(r, 120));
  const onB = ours().find((c) => c.focused);
  t(onB?.id === ID_B, 'the badge is stuck on the first conversation: ' + onB?.shortId);

  // ---- clicking a card lands on the tab that holds it ----
  // Not "on Studio": with three tabs open that was the first one, which is almost
  // never the one you clicked.
  const before = tabA.revealed;
  await vscode.commands.executeCommand('claudeStudio.openConversation', ID_A);
  t(tabA.revealed > before, 'clicking the card did not bring its own tab to the front');

  // ---- a card nobody holds opens a tab of its own ----
  // Prima finiva nella chat della sidebar, o dentro la scheda principale sopra la
  // conversazione che stavi guardando: in un caso non la vedevi, nell'altro perdevi
  // quella di prima. Una conversazione che apri e' una scheda.
  const tabs = registered.panels.length;
  await vscode.commands.executeCommand(
    'claudeStudio.openConversation',
    'cccccccc-1111-2222-3333-444444444444'
  );
  t(
    registered.panels.length === tabs + 1,
    'clicking a card of a conversation with no tab did not open one: ' +
      `${registered.panels.length} vs ${tabs}`
  );

  // ---- rename asks about the conversation you are in ----
  // Cancelled on purpose (showInputBox answers undefined): the test must not leave
  // names behind on the disk.
  tabA.setActive(false);
  tabB.setActive(true);
  inputs.length = 0;
  inputAnswer = undefined;
  await registered.commands.get('claudeStudio.rename')();
  t(inputs.length === 1, 'rename did not ask anything: ' + inputs.length);

  for (const d of ctx.subscriptions) d.dispose?.();

  if (fails.length) {
    console.error('FAILED:\n- ' + fails.join('\n- '));
    process.exit(1);
  }
  console.log('sessions-check ok — two conversations, two names, the badge follows the tab');
  process.exit(0);
})();
