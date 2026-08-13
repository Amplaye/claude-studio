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

// `--live` runs the same check against the real CLI instead of a written transcript:
// a prompt goes out, Claude writes its own list, and the panel has to receive it. It
// costs a call and needs your login, so it stays out of `npm run ui-check` — but it is
// the only thing that proves the whole chain, and a replayed transcript never can.
const LIVE = process.argv.includes('--live');

const root = path.dirname(__dirname);
// Live needs your real home: that's where the login is. Offline moves it, so the
// transcripts the test writes are the only ones the extension can find.
const home = LIVE ? os.homedir() : fs.mkdtempSync(path.join(os.tmpdir(), 'claude-studio-tasks-'));
const work = LIVE ? root : path.join(home, 'project');
if (!LIVE) {
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
}

const fails = [];
const t = (cond, msg) => !cond && fails.push(msg);

// ---- two transcripts, one per dialect ---------------------------------------
const ID_TASK = 'aaaaaaaa-2222-4222-8333-444444444444';
const ID_TODO = 'bbbbbbbb-2222-4222-8333-444444444444';

const projects = path.join(home, '.claude', 'projects', work.replace(/[^a-zA-Z0-9]/g, '-'));
if (!LIVE) fs.mkdirSync(projects, { recursive: true });

let uuidSeq = 0;
const uuidFor = () => `cccccccc-2222-4222-8333-${String(++uuidSeq).padStart(12, '0')}`;

/** Writes a transcript from a list of {role, content} the way the CLI lays one out. */
function writeTranscript(id, turns) {
  if (LIVE) return; // the real home is not a scratch pad
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

/**
 * The last thing the panel was handed: every conversation's list, under the id of the
 * conversation that wrote it.
 */
const board = (panel) => {
  const frames = panel.webview.got.filter((m) => m && m.k === 'tasks');
  return frames.length ? frames[frames.length - 1].d : {};
};
/**
 * The one list on the board. Used where the check has a single conversation open and
 * does not know the id the CLI handed it — and it doubles as a check in itself: two
 * lists where one was expected is exactly the mixing this is all about.
 */
const only = (panel) => {
  const all = Object.values(board(panel));
  return all.length === 1 ? all[0] : null;
};

/**
 * The sidebar panel, the one you actually look at while a tab works. It is a second
 * surface subscribing to the same list, and the tab passing on its own proves nothing
 * about it: this is where the section used to sit empty.
 */
function mountSidebar() {
  const view = {
    webview: fakeWebview(),
    visible: true,
    onDidChangeVisibility: () => ({ dispose() {} }),
    onDidDispose: () => ({ dispose() {} }),
  };
  registered.views.get('claudeStudio.context').resolveWebviewView(view);
  view.webview._onMsg({ cmd: 'ready' });
  return view;
}

const line = (d) =>
  (d?.items ?? []).map((i) => `${i.status[0]}:${i.content}`).join(' | ') || '(empty)';

/**
 * The real thing: a prompt goes to the CLI and Claude writes its own list. Nothing is
 * staged — if the panel ends the turn without the steps, the panel is broken.
 */
async function live(tab, side) {
  // Every board the tab was handed, flattened to the single conversation's list: only
  // one is open here, and a board with two in it would be a bug of its own.
  const seen = () =>
    tab.webview.got
      .filter((m) => m && m.k === 'tasks')
      .map((m) => Object.values(m.d || {}))
      .map((v) => (v.length === 1 ? v[0] : null));
  let ended = 0;
  const watch = setInterval(() => {}, 1000); // keeps the loop alive while the CLI thinks
  tab.webview.got.length = 0;
  const orig = tab.webview.postMessage;
  tab.webview.postMessage = async (m) => {
    // Every permission gets a no: this check is about the list, not about letting a
    // test edit the repo it is being run in.
    if (m?.k === 'ask') setTimeout(() => tab.webview._onMsg({ cmd: 'answer', id: m.id, choice: 'deny' }), 0);
    if (m?.k === 'turn_end') ended++;
    return orig(m);
  };
  /** Sends a prompt and waits for the turn to end. */
  async function turn(text) {
    const want = ended + 1;
    tab.webview._onMsg({ cmd: 'send', text });
    const deadline = Date.now() + 240000;
    while (ended < want && Date.now() < deadline) await settle(200);
    await settle(500);
    return ended >= want;
  }

  const ok1 = await turn(
    'Scriviti una lista di task con tre voci — "Leggere il README", "Contare le righe", ' +
      '"Scrivere il risultato" — poi metti la prima in corso e la seconda completata. ' +
      'Non leggere e non toccare nessun file: e\' solo la lista che mi serve.'
  );

  const frames = seen().filter(Boolean);
  const d = frames[frames.length - 1] ?? null;
  console.log('  turn 1: ' + frames.length + ' list(s) handed over; the last one: ' + line(d));
  t(ok1, 'the turn never finished: no CLI, no login, or no network');
  t(frames.length > 0, 'the panel was handed no list at all while Claude was writing one');
  t((d?.total ?? 0) >= 3, 'the steps Claude wrote down did not reach the panel: ' + line(d));
  t(
    (d?.items ?? []).some((i) => i.status === 'completed'),
    'a step Claude ticked off is still drawn as pending: ' + line(d)
  );
  // The list must be built as it goes, not handed over in one piece at the end: that
  // delay is the whole reason this panel exists.
  t(
    frames.filter((f) => f.total > 0).length > 1,
    'the list only appeared once, at the end — it is not being built as Claude writes it'
  );

  const s = only(side);
  console.log('  the sidebar was handed: ' + line(s));
  t(line(s) === line(d), 'the sidebar panel does not show what the tab shows: ' + line(s));

  // ---- the second message: this is where a list used to disappear ----------
  //
  // A TodoWrite list belongs to the prompt that produced it and goes when the next
  // one arrives; a Task* list belongs to the conversation and must not. Get that
  // wrong and the panel empties itself the moment you say "go on".
  const before = seen().length;
  const ok2 = await turn('Adesso completa anche la terza task della lista. Nient\'altro.');
  const after = seen().slice(before).filter(Boolean);
  const d2 = after[after.length - 1] ?? only(tab);
  console.log('  turn 2: ' + line(d2));
  t(ok2, 'the second turn never finished');
  t((d2?.total ?? 0) >= 3, 'the list emptied itself on the second message: ' + line(d2));
  t(
    (d2?.items ?? []).filter((i) => i.status === 'completed').length >= 2,
    'the step ticked off in the second turn did not reach the panel: ' + line(d2)
  );
  t(
    line(only(side)) === line(d2),
    'after a second message the sidebar and the tab disagree: ' + line(only(side))
  );
  clearInterval(watch);
}

(async () => {
  require(path.join(root, 'dist', 'extension.js')).activate(ctx);
  const side = mountSidebar();
  await registered.commands.get('claudeStudio.openTab')();
  const tab = registered.panels[0];
  tab.webview._onMsg({ cmd: 'ready' });

  if (LIVE) {
    await live(tab, side);
    if (fails.length) {
      console.error('FAILED:\n- ' + fails.join('\n- '));
      process.exit(1);
    }
    console.log('tasks-check --live ok — Claude wrote its list and the panel drew it');
    process.exit(0);
  }

  // ---- the tool the CLI actually uses ----
  tab.webview._onMsg({ cmd: 'open', id: ID_TASK });
  await settle();

  const d = board(tab)[ID_TASK];
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
  // The sidebar is the surface you leave open while a tab works: it has to be told
  // the same thing, not merely be able to be.
  t(
    line(board(side)[ID_TASK]) === line(d),
    'the sidebar panel does not show what the tab shows: ' + line(board(side)[ID_TASK])
  );

  // ---- the old tool, still spoken by older CLIs ----
  tab.webview._onMsg({ cmd: 'open', id: ID_TODO });
  await settle();
  const old = board(tab)[ID_TODO];
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
  t(
    !board(tab)[ID_TODO] && !board(tab)[ID_TASK],
    'the steps of the old conversation stayed on screen: ' + JSON.stringify(Object.keys(board(tab)))
  );

  // ---- two conversations at once, each with its own list -------------------
  //
  // This is the one you hit with three tabs open. Each conversation writes its own
  // steps; the panel used to hand over one list and nothing said whose it was, so the
  // section swapped under you depending on which conversation had moved last. Every
  // list travels now, under the id of the conversation that wrote it.
  tab.webview._onMsg({ cmd: 'open', id: ID_TASK });
  await settle();
  await registered.commands.get('claudeStudio.openNewTab')();
  const tab2 = registered.panels[registered.panels.length - 1];
  tab2.webview._onMsg({ cmd: 'ready' });
  tab2.webview._onMsg({ cmd: 'open', id: ID_TODO });
  await settle();

  const both = board(side);
  t(
    both.items === undefined,
    'the sidebar is still handed one nameless list instead of one per conversation'
  );
  const mine = both[ID_TASK];
  const theirs = both[ID_TODO];
  t(
    line(mine) === 'c:Rename the column | i:Update the three call sites | p:Run the tests',
    'the first conversation lost its own steps: ' + line(mine)
  );
  t(
    line(theirs) === 'c:Read the file | i:Write the patch',
    'the second conversation lost its own steps: ' + line(theirs)
  );

  for (const dsp of ctx.subscriptions) dsp.dispose?.();

  if (fails.length) {
    console.error('FAILED:\n- ' + fails.join('\n- '));
    process.exit(1);
  }
  console.log('tasks-check ok — the steps reach the panel, in both dialects the CLI speaks');
  process.exit(0);
})();
