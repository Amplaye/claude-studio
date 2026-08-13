// The steps Claude is working through actually reach the panel.
//
// The panel used to listen for TodoWrite, one call carrying the whole list. The CLI
// does not have that tool any more: it writes one task at a time with TaskCreate and
// moves it with TaskUpdate, and the number it goes under ("#2") is not in the call that
// creates it — it comes back in the tool's answer. So for months the section sat on
// "Working out what to do…" while Claude was writing its steps down all along.
//
// Both dialects are checked here, over the real bundle: a transcript is written the way
// the CLI writes one, the conversation is reopened, and what the panel is handed has to
// be the list — in order, with the right one in progress and the right ones ticked off.
//
// Real bundle (dist/extension.js), fake `vscode`, fake home folder: no CLI, no network.
const Module = require('node:module');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.dirname(__dirname);
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-studio-tasks-'));
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

// ---- two transcripts, one per dialect ---------------------------------------
const ID_TASK = 'aaaaaaaa-2222-4222-8333-444444444444';
const ID_TODO = 'bbbbbbbb-2222-4222-8333-444444444444';

const projects = path.join(home, '.claude', 'projects', work.replace(/[^a-zA-Z0-9]/g, '-'));
fs.mkdirSync(projects, { recursive: true });

let uuidSeq = 0;
const uuidFor = () => `cccccccc-2222-4222-8333-${String(++uuidSeq).padStart(12, '0')}`;

/** Writes a transcript from a list of {role, content} the way the CLI lays one out. */
function writeTranscript(id, turns) {
  const common = {
    isSidechain: false,
    userType: 'external',
    cwd: work,
    sessionId: id,
    version: '2.0.0',
    gitBranch: '',
    timestamp: new Date().toISOString(),
  };
  let parent = null;
  const rows = turns.map((turn) => {
    const uuid = uuidFor();
    const row = {
      ...common,
      parentUuid: parent,
      type: turn.type,
      uuid,
      message:
        turn.type === 'user'
          ? { role: 'user', content: turn.content }
          : {
              role: 'assistant',
              model: 'claude-sonnet-4-5',
              content: turn.content,
              usage: { input_tokens: 10, output_tokens: 5 },
            },
    };
    parent = uuid;
    return row;
  });
  fs.writeFileSync(
    path.join(projects, id + '.jsonl'),
    rows.map((r) => JSON.stringify(r)).join('\n') + '\n',
    'utf8'
  );
}

const call = (id, name, input) => ({ type: 'tool_use', id, name, input });
const answer = (id, text) => ({ type: 'tool_result', tool_use_id: id, content: text });

// Three tasks created one by one, then the first taken through in_progress to done and
// the second started — exactly the shape the CLI produces.
writeTranscript(ID_TASK, [
  { type: 'user', content: 'rename the column and fix the call sites' },
  {
    type: 'assistant',
    content: [
      call('t1', 'TaskCreate', {
        subject: 'Rename the column',
        description: 'in the schema',
        activeForm: 'Renaming the column',
      }),
      call('t2', 'TaskCreate', { subject: 'Update the three call sites', description: '...' }),
      call('t3', 'TaskCreate', { subject: 'Run the tests', description: '...' }),
    ],
  },
  {
    type: 'user',
    content: [
      answer('t1', 'Task #1 created successfully: Rename the column'),
      answer('t2', 'Task #2 created successfully: Update the three call sites'),
      answer('t3', 'Task #3 created successfully: Run the tests'),
    ],
  },
  { type: 'assistant', content: [call('u1', 'TaskUpdate', { taskId: '1', status: 'in_progress' })] },
  { type: 'user', content: [answer('u1', 'Updated task #1 status')] },
  { type: 'assistant', content: [call('u2', 'TaskUpdate', { taskId: '1', status: 'completed' })] },
  { type: 'user', content: [answer('u2', 'Updated task #1 status')] },
  { type: 'assistant', content: [call('u3', 'TaskUpdate', { taskId: '2', status: 'in_progress' })] },
  { type: 'user', content: [answer('u3', 'Updated task #2 status')] },
  { type: 'assistant', content: [{ type: 'text', text: 'Renamed it.' }] },
]);

// The old tool, still spoken by older CLIs: one call, the whole list.
writeTranscript(ID_TODO, [
  { type: 'user', content: 'the old way' },
  {
    type: 'assistant',
    content: [
      call('d1', 'TodoWrite', {
        todos: [
          { content: 'Read the file', status: 'completed', activeForm: 'Reading the file' },
          { content: 'Write the patch', status: 'in_progress', activeForm: 'Writing the patch' },
        ],
      }),
    ],
  },
  { type: 'user', content: [answer('d1', 'Todos have been modified successfully.')] },
]);

// ---- the fake `vscode` -------------------------------------------------------
const uri = (p) => ({ fsPath: p, scheme: 'file', toString: () => 'file:///' + p.replace(/\\/g, '/') });

const registered = { views: new Map(), commands: new Map(), panels: [] };

function fakeWebview() {
  const got = [];
  const w = {
    cspSource: 'vscode-webview://x',
    options: {},
    _html: '',
    _onMsg: () => {},
    got,
    state: {},
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

function fakePanel(type, title) {
  const dying = [];
  const viewState = [];
  const panel = {
    type,
    title,
    webview: fakeWebview(),
    iconPath: undefined,
    active: true,
    visible: true,
    disposed: false,
    reveal() {},
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
    registerWebviewPanelSerializer: () => ({ dispose() {} }),
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

const memento = (map) => ({
  get: (k, d) => (map.has(k) ? map.get(k) : d),
  update: async (k, v) => void (v === undefined ? map.delete(k) : map.set(k, v)),
  keys: () => [...map.keys()],
});
const ctx = {
  extensionUri: uri(root),
  extensionPath: root,
  subscriptions: [],
  globalState: memento(new Map()),
  workspaceState: memento(new Map()),
};

const settle = (ms = 300) => new Promise((r) => setTimeout(r, ms));
/** The last list the panel was handed. */
const shown = (panel) => {
  const frames = panel.webview.got.filter((m) => m && m.k === 'tasks');
  return frames.length ? frames[frames.length - 1].d : null;
};
const line = (d) =>
  (d?.items ?? []).map((i) => `${i.status[0]}:${i.content}`).join(' | ') || '(empty)';

(async () => {
  require(path.join(root, 'dist', 'extension.js')).activate(ctx);
  await registered.commands.get('claudeStudio.openTab')();
  const tab = registered.panels[0];
  tab.webview._onMsg({ cmd: 'ready' });

  // ---- the tool the CLI actually uses ----
  tab.webview._onMsg({ cmd: 'open', id: ID_TASK });
  await settle();

  const d = shown(tab);
  t(!!d, 'the panel was handed no list at all');
  t(
    d && d.total === 3,
    'the three steps did not reach the panel — this is the defect: TaskCreate was never listened for: ' +
      line(d)
  );
  t(
    line(d) ===
      'c:Rename the column | i:Update the three call sites | p:Run the tests',
    'the steps came out in the wrong order or the wrong state: ' + line(d)
  );
  t(d && d.done === 1, 'the ticked-off step was not counted: ' + (d && d.done));
  t(
    d && d.active === 1,
    'the panel does not know which step is being worked on: ' + (d && d.active)
  );

  // ---- the old tool, still spoken by older CLIs ----
  tab.webview._onMsg({ cmd: 'open', id: ID_TODO });
  await settle();
  const old = shown(tab);
  t(
    line(old) === 'c:Read the file | i:Write the patch',
    'a list written with TodoWrite no longer arrives: ' + line(old)
  );
  t(
    old && old.total === 2 && old.done === 1 && old.active === 1,
    'the counts of a TodoWrite list are wrong: ' + JSON.stringify(old && { ...old, items: undefined })
  );

  // ---- a new conversation leaves nothing behind ----
  tab.webview._onMsg({ cmd: 'newSession' });
  await settle();
  t((shown(tab)?.total ?? 0) === 0, 'the steps of the old conversation stayed on screen');

  for (const dsp of ctx.subscriptions) dsp.dispose?.();

  if (fails.length) {
    console.error('FAILED:\n- ' + fails.join('\n- '));
    process.exit(1);
  }
  console.log('tasks-check ok — the steps reach the panel, in both dialects the CLI speaks');
  process.exit(0);
})();
