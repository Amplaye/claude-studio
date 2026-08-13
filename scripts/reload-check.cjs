// "Developer: Reload Window" and every tab comes back on its own conversation.
//
// The extension host dies at every reload and takes the conversations with it: they
// live in memory, the transcripts stay on disk. What has to survive is knowing *which*
// transcript belonged to *which* tab — and that memory is the one VS Code keeps for
// each webview (vscode.setState), because it is the only one that comes back attached
// to the single tab.
//
// This is the check for the defect worth having a test about: with four tabs open you
// reloaded and got one back, because the deserializer threw away every panel after the
// first. Here two conversations go out, the window is reloaded for real — the bundle is
// loaded again from scratch, exactly what the extension host does — and both have to
// come back, each with its own text.
//
// Real bundle (dist/extension.js), fake `vscode`, fake home folder: no CLI, no network.
const Module = require('node:module');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.dirname(__dirname);
// Through realpath: su macOS la cartella temporanea sta sotto /var, che e' un
// collegamento a /private/var. Una conversazione e' archiviata sotto il nome per
// esteso della cartella a cui appartiene, quindi il test scriverebbe sotto un nome e
// l'SDK cercherebbe sotto l'altro — non trovando niente e dando per rotto quello che
// funziona.
const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'claude-studio-reload-')));
const work = path.join(home, 'project');
fs.mkdirSync(work, { recursive: true });
process.env.USERPROFILE = home;
process.env.HOME = home;
if (os.homedir() !== home) {
  console.error('FAILED: cannot move the home folder for the test');
  process.exit(1);
}
process.on('exit', () => {
  try {
    fs.rmSync(home, { recursive: true, force: true });
  } catch {
    /* the system will clean it up */
  }
});

const fails = [];
const t = (cond, msg) => !cond && fails.push(msg);

// ---- two conversations already on disk --------------------------------------
// The id has to be a real UUID: the SDK refuses to read anything else, and a test
// that hands it "session-a" would only be checking that it says no.
const ID_A = 'aaaaaaaa-1111-4222-8333-444444444444';
const ID_B = 'bbbbbbbb-1111-4222-8333-444444444444';
const SAID_A = 'the invoices page, the one on the left';
const SAID_B = 'why the nightly backup takes six hours';

const projects = path.join(home, '.claude', 'projects', work.replace(/[^a-zA-Z0-9]/g, '-'));
fs.mkdirSync(projects, { recursive: true });

let uuidSeq = 0;
const uuidFor = () => {
  const n = String(++uuidSeq).padStart(12, '0');
  return `cccccccc-1111-4222-8333-${n}`;
};

/** A transcript as the CLI writes it: one JSON per line, in order. */
function writeTranscript(id, said, answered) {
  const stamp = new Date().toISOString();
  const common = {
    isSidechain: false,
    userType: 'external',
    cwd: work,
    sessionId: id,
    version: '2.0.0',
    gitBranch: '',
    timestamp: stamp,
  };
  const first = uuidFor();
  const rows = [
    { ...common, parentUuid: null, type: 'user', uuid: first, message: { role: 'user', content: said } },
    {
      ...common,
      parentUuid: first,
      type: 'assistant',
      uuid: uuidFor(),
      message: {
        role: 'assistant',
        model: 'claude-sonnet-4-5',
        content: [{ type: 'text', text: answered }],
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    },
  ];
  fs.writeFileSync(path.join(projects, id + '.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
}
writeTranscript(ID_A, SAID_A, 'Moved the total under the table.');
writeTranscript(ID_B, SAID_B, 'It re-reads the whole archive every night.');

// ---- the fake `vscode` -------------------------------------------------------
const uri = (p) => ({ fsPath: p, scheme: 'file', toString: () => 'file:///' + p.replace(/\\/g, '/') });

let registered = { views: new Map(), commands: new Map(), panels: [], serializer: null };
const reset = () => {
  registered = { views: new Map(), commands: new Map(), panels: [], serializer: null };
};

/**
 * A page that behaves like ours: it keeps aside what the extension tells it to keep
 * aside (the `sid` wire, see webview/chat.js), and that is the state VS Code hands
 * back to the deserializer after a reload.
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

function fakePanel(type, title, state) {
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
    showInputBox: async () => undefined,
    state: { focused: true },
    onDidChangeWindowState: () => ({ dispose() {} }),
    registerWebviewViewProvider: (id, p) => {
      registered.views.set(id, p);
      return { dispose() {} };
    },
    registerWebviewPanelSerializer: (type, ser) => {
      registered.serializer = { type, ser };
      return { dispose() {} };
    },
    createWebviewPanel: (type, title) => fakePanel(type, title),
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
    workspaceFolders: [{ uri: uri(work) }],
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

const bundle = path.join(root, 'dist', 'extension.js');

/** The state VS Code keeps between two windows: it does not die with the host. */
function memento(map) {
  return {
    get: (k, d) => (map.has(k) ? map.get(k) : d),
    update: async (k, v) => void (v === undefined ? map.delete(k) : map.set(k, v)),
    keys: () => [...map.keys()],
  };
}
const globalMap = new Map();
const workspaceMap = new Map();
const context = () => ({
  extensionUri: uri(root),
  extensionPath: root,
  subscriptions: [],
  globalState: memento(globalMap),
  workspaceState: memento(workspaceMap),
});

/** Loads the bundle from scratch, like the extension host after a reload. */
function startHost() {
  delete require.cache[require.resolve(bundle)];
  reset();
  const ctx = context();
  require(bundle).activate(ctx);
  return ctx;
}

const settle = (ms = 250) => new Promise((r) => setTimeout(r, ms));
const said = (panel) =>
  panel.webview.got
    .filter((m) => m.k === 'user')
    .map((m) => m.text)
    .join(' | ');

(async () => {
  // ---- before the reload: two tabs, two conversations ----
  let ctx = startHost();
  await registered.commands.get('claudeStudio.openTab')();
  await registered.commands.get('claudeStudio.openNewTab')();
  const [tabA, tabB] = registered.panels;
  t(registered.panels.length === 2, 'two tabs did not open: ' + registered.panels.length);
  tabA.webview._onMsg({ cmd: 'ready' });
  tabB.webview._onMsg({ cmd: 'ready' });
  tabA.webview._onMsg({ cmd: 'open', id: ID_A });
  tabB.webview._onMsg({ cmd: 'open', id: ID_B });
  await settle();

  t(
    tabA.webview.state.sid === ID_A,
    'the first tab did not put its conversation aside: ' + tabA.webview.state.sid
  );
  t(
    tabB.webview.state.sid === ID_B,
    'the tab opened with "+" did not put its conversation aside: ' + tabB.webview.state.sid
  );
  t(
    workspaceMap.get('claudeStudio.lastSession') === ID_A,
    'the project does not remember the conversation of the main chat: ' +
      workspaceMap.get('claudeStudio.lastSession')
  );
  // The page really is the one keeping it: without this line in chat.js there would be
  // nothing to hand back to the deserializer, and the test above would be checking a
  // rule that only lives in the fake page.
  const page = fs.readFileSync(path.join(root, 'webview', 'chat.js'), 'utf8');
  t(
    /case 'sid':[\s\S]{0,200}vscode\.setState/.test(page),
    'the page does not put the conversation aside with vscode.setState'
  );

  const stateA = { ...tabA.webview.state };
  const stateB = { ...tabB.webview.state };

  // ---- the reload ----
  for (const d of ctx.subscriptions) d.dispose?.();
  ctx = startHost();
  t(!!registered.serializer, 'nobody is registered to bring the tabs back');
  t(
    registered.serializer.type === 'claudeStudio.panel',
    'the tabs come back under another type: ' + registered.serializer.type
  );

  // VS Code hands back one panel per tab that was open, each with the state its page
  // had put aside.
  const backA = fakePanel('claudeStudio.panel', 'Claude Studio', stateA);
  const backB = fakePanel('claudeStudio.panel', 'Claude Studio', stateB);
  await registered.serializer.ser.deserializeWebviewPanel(backA, stateA);
  await registered.serializer.ser.deserializeWebviewPanel(backB, stateB);
  backA.webview._onMsg({ cmd: 'ready' });
  backB.webview._onMsg({ cmd: 'ready' });
  await settle(600);

  t(!backA.disposed, 'the first tab was thrown away while coming back');
  t(!backB.disposed, 'the second tab was thrown away: this is the defect — one tab survives, the others are closed');
  t(
    said(backA).includes(SAID_A),
    'the first tab did not come back on its conversation: ' + said(backA)
  );
  t(
    said(backB).includes(SAID_B),
    'the second tab did not come back on its conversation: ' + said(backB)
  );
  t(
    !said(backA).includes(SAID_B) && !said(backB).includes(SAID_A),
    'the two tabs came back on the same conversation'
  );
  t(
    backA.webview.state.sid === ID_A && backB.webview.state.sid === ID_B,
    'after coming back the tabs no longer know which conversation they are on: ' +
      backA.webview.state.sid + ' | ' + backB.webview.state.sid
  );
  // And they are two conversations, not one read twice: the context bar has to see both.
  const cards = () => {
    registered.commands.get('claudeStudio.context.refresh')();
    const frames = [...backA.webview.got, ...backB.webview.got].filter((m) => m.k === 'ctx');
    return frames.length ? frames[frames.length - 1].d.cards.filter((c) => c.own) : [];
  };
  await settle(200);
  const mine = cards();
  t(
    mine.some((c) => c.id === ID_A) && mine.some((c) => c.id === ID_B),
    'the context bar does not see both restored conversations: ' + mine.map((c) => c.shortId).join(' | ')
  );

  // ---- a new conversation forgets the old one ----
  // Otherwise the next reload would drag back something you had put away on purpose.
  backB.webview._onMsg({ cmd: 'newSession' });
  await settle();
  t(backB.webview.state.sid === '', 'asking for a new conversation left the old one to come back');

  for (const d of ctx.subscriptions) d.dispose?.();

  // ---- the order VS Code brings them back in, which is not the order you opened them --
  //
  // VS Code wakes a tab up when it needs to draw it, so the one you were looking at
  // comes back first and the others follow — or wait until you click them. The project
  // meanwhile keeps a note of its own: the last conversation of the window, there for
  // the sidebar chat, which has no tab to be woken up from.
  //
  // Those two used to fight, and the note won because it was there first: whichever tab
  // came back first was handed the note's conversation instead of its own, and its own
  // was gone. With three tabs you got the same conversation twice and lost one — "it
  // resets me from scratch". A tab now speaks for itself, even to say it had nothing.
  ctx = startHost();
  await registered.commands.get('claudeStudio.openTab')(); // A: la principale
  await registered.commands.get('claudeStudio.openNewTab')(); // B
  await registered.commands.get('claudeStudio.openNewTab')(); // E: rimane vuota
  const [tA, tB, tE] = registered.panels;
  for (const p of [tA, tB, tE]) p.webview._onMsg({ cmd: 'ready' });
  tA.webview._onMsg({ cmd: 'open', id: ID_A });
  tB.webview._onMsg({ cmd: 'open', id: ID_B });
  await settle();
  t(
    workspaceMap.get('claudeStudio.lastSession') === ID_A,
    'il progetto non si ricorda la conversazione della chat principale: ' +
      workspaceMap.get('claudeStudio.lastSession')
  );
  t(!tE.webview.state.sid, 'la scheda lasciata vuota si e\' presa una conversazione: ' + tE.webview.state.sid);
  const sA = { ...tA.webview.state };
  const sB = { ...tB.webview.state };
  const sE = { ...tE.webview.state };

  for (const d of ctx.subscriptions) d.dispose?.();
  ctx = startHost();
  // La vuota e' quella che stavi guardando: torna per prima, e prende in mano la chat
  // che il segnaposto del progetto vorrebbe riempire.
  const rE = fakePanel('claudeStudio.panel', 'Claude Studio', sE);
  const rB = fakePanel('claudeStudio.panel', 'Claude Studio', sB);
  const rA = fakePanel('claudeStudio.panel', 'Claude Studio', sA);
  await registered.serializer.ser.deserializeWebviewPanel(rE, sE);
  await registered.serializer.ser.deserializeWebviewPanel(rB, sB);
  await registered.serializer.ser.deserializeWebviewPanel(rA, sA);
  for (const p of [rE, rB, rA]) p.webview._onMsg({ cmd: 'ready' });
  await settle(600);

  t(
    !rE.disposed && !rB.disposed && !rA.disposed,
    'tornando in tre, qualcuna e\' stata buttata via'
  );
  t(
    !said(rE),
    'la scheda vuota e\' tornata con addosso la conversazione di un\'altra: ' + said(rE)
  );
  t(said(rB).includes(SAID_B), 'la seconda scheda non e\' tornata sulla sua: ' + said(rB));
  t(said(rA).includes(SAID_A), 'la scheda principale non e\' tornata sulla sua: ' + said(rA));
  t(
    !said(rB).includes(SAID_A) && !said(rA).includes(SAID_B),
    'due schede sono tornate sulla stessa conversazione'
  );
  t(
    rA.webview.state.sid === ID_A && rB.webview.state.sid === ID_B && !rE.webview.state.sid,
    'dopo il ritorno le schede non sanno piu\' su che conversazione stanno: ' +
      [rA.webview.state.sid, rB.webview.state.sid, rE.webview.state.sid].join(' | ')
  );

  for (const d of ctx.subscriptions) d.dispose?.();

  if (fails.length) {
    console.error('FAILED:\n- ' + fails.join('\n- '));
    process.exit(1);
  }
  console.log(
    'reload-check ok — the tabs come back on their own conversation, whatever order they wake up in'
  );
  process.exit(0);
})();
