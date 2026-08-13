// Tests the engine behind the context bar inside the real bundle (dist/extension.js),
// with a fake `vscode` and a fake home folder. No network, no CLI: what gets checked
// here are the sums and the fixes for the 0.0.6 defects, all things you cannot see
// by eye.
//
// On Windows os.homedir() reads USERPROFILE: change it before loading the bundle and
// everything the extension writes ends up in a throwaway folder.
const Module = require('node:module');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.dirname(__dirname);
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-studio-data-'));
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

// ---- the fake `vscode` -----------------------------------------------------
const uri = (p) => ({ fsPath: p, scheme: 'file', toString: () => 'file:///' + p.replace(/\\/g, '/') });

const executed = [];
const registered = { views: new Map(), commands: new Map() };
let tabGroups = { all: [] };
let inputBoxAnswer;
const shown = [];
let statusBar;

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
  window: {
    createOutputChannel: () => ({
      appendLine() {},
      show() {},
      dispose() {},
    }),
    createStatusBarItem: () => {
      statusBar = { text: '', tooltip: '', show() {}, hide() {}, dispose() {} };
      return statusBar;
    },
    registerWebviewViewProvider: (id, p) => {
      registered.views.set(id, p);
      return { dispose() {} };
    },
    registerWebviewPanelSerializer: () => ({ dispose() {} }),
    createWebviewPanel: () => ({
      webview: fakeWebview(),
      active: false,
      reveal() {},
      dispose() {},
      onDidDispose: () => ({ dispose() {} }),
      onDidChangeViewState: () => ({ dispose() {} }),
    }),
    showInputBox: async () => inputBoxAnswer,
    showInformationMessage: async (m) => {
      shown.push(m);
    },
    showWarningMessage: async () => undefined,
    showErrorMessage: async () => undefined,
    showTextDocument: async () => ({}),
    activeTextEditor: undefined,
    onDidChangeActiveTextEditor: () => ({ dispose() {} }),
    onDidChangeTextEditorSelection: () => ({ dispose() {} }),
    /** The window is always "in the foreground": there is nobody to notify here. */
    state: { focused: true },
    onDidChangeWindowState: () => ({ dispose() {} }),
    get tabGroups() {
      return {
        all: tabGroups.all,
        onDidChangeTabs: () => ({ dispose() {} }),
        onDidChangeTabGroups: () => ({ dispose() {} }),
      };
    },
  },
  languages: { getDiagnostics: () => [] },
  commands: {
    registerCommand: (id, fn) => {
      registered.commands.set(id, fn);
      return { dispose() {} };
    },
    executeCommand: async (id, ...args) => {
      executed.push(args.length ? `${id}(${args.join(',')})` : id);
    },
  },
  workspace: {
    workspaceFolders: [{ uri: uri(work) }],
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

const load = Module._load;
Module._load = function (req, parent, isMain) {
  if (req === 'vscode') return vscode;
  return load.call(this, req, parent, isMain);
};

// ---- the fake material on disk ---------------------------------------------

const slug = work.replace(/[^a-zA-Z0-9]/g, '-');
const projects = path.join(home, '.claude', 'projects', slug);
const sessionsDir = path.join(home, '.claude', 'sessions');
fs.mkdirSync(projects, { recursive: true });
fs.mkdirSync(sessionsDir, { recursive: true });

const SID = '11111111-2222-3333-4444-555555555555';
const transcript = path.join(projects, SID + '.jsonl');

const usage = (n) => ({ input_tokens: n, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 0 });
const row = (o) => JSON.stringify(o) + '\n';

// A long transcript: the cost sits at the end AND at the top. 0.0.6 only read the
// last 256 KB, so it never saw the first dollar — and the cost came out
// underestimated on every long conversation.
let big = '';
big += row({ type: 'user', message: { role: 'user', content: 'Fix the CRM reminders' } });
big += row({ type: 'assistant', costUSD: 1, message: { role: 'assistant', usage: usage(1000) } });
const filler = row({ type: 'assistant', message: { role: 'assistant', content: 'x'.repeat(300) } });
while (Buffer.byteLength(big) < 400 * 1024) big += filler;
big += row({ type: 'assistant', costUSD: 2, message: { role: 'assistant', usage: usage(250000) } });
fs.writeFileSync(transcript, big, 'utf8');
const grewFrom = Buffer.byteLength(big);

/**
 * Quando e' nato davvero il processo che presta il suo pid alle sessioni finte, come
 * FILETIME di Windows — cioe' nella stessa forma in cui lo scrive la CLI.
 *
 * Senza, la fixture si contraddice: dice "questa sessione e' di un processo partito un
 * minuto fa" mentre presta il pid di un node acceso tre secondi fa, e il guardiano dei
 * pid riciclati (context/procs.ts) fa esattamente il suo mestiere — vede un numero che
 * appartiene a qualcuno nato dopo, lo dichiara riciclato e butta via il file. Poi il
 * test si domanda perche' le card siano sparite. Il ripulitore, pero', entra in scena
 * solo quando la fotografia dei processi e' arrivata: e' asincrona e ci mette un paio
 * di secondi, quindi i primi controlli passavano e quelli in fondo no. Un test che
 * fallisce a seconda di quanto ci ha messo PowerShell non e' un test.
 */
const procStart = String(
  Math.round((Date.now() - process.uptime() * 1000 + 11644473600000) * 10000)
);

// A live session from the official extension: the pid is ours, so it is alive.
fs.writeFileSync(
  path.join(sessionsDir, process.pid + '.json'),
  JSON.stringify({
    sessionId: SID,
    cwd: work,
    name: 'crm-e6',
    startedAt: Date.now() - 60000,
    procStart,
  }),
  'utf8'
);

// ---- start-up ---------------------------------------------------------------
const ext = require(path.join(root, 'dist', 'extension.js'));
/** The chat preferences live here: an in-memory map is enough. */
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
ext.activate(ctx);

const provider = registered.views.get('claudeStudio.context');
if (!provider) {
  console.error('FAILED: the context panel is not registered');
  process.exit(1);
}
const view = {
  webview: fakeWebview(),
  visible: true,
  onDidChangeVisibility: () => ({ dispose() {} }),
  onDidDispose: () => ({ dispose() {} }),
};
provider.resolveWebviewView(view);

const onMsg = (m) => view.webview._onMsg(m);
const lastData = () => [...view.webview.got].reverse().find((m) => m.k === 'data')?.d;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // ---- the page: same rules as the chat ----
  const html = view.webview.html || '';
  t(/Content-Security-Policy/.test(html), 'the context panel has no CSP');
  t(!/unsafe-inline|unsafe-eval/.test(html), 'permissive CSP in the context panel');
  t(!/\{\{\w+\}\}/.test(html), 'placeholder not substituted: ' + (html.match(/\{\{\w+\}\}/) || [])[0]);
  t(/<symbol id="ion-speedometer"/.test(html), 'Ionicons sprite not pasted into the panel');
  t(/nonce="[A-Za-z0-9]{32}"/.test(html), 'nonce missing or too short in the panel');

  onMsg({ cmd: 'ready' });
  await wait(200);

  // ---- the sums ----
  const d1 = lastData();
  t(!!d1, 'the panel receives no data at all');
  const c1 = d1?.cards?.[0];
  t(d1?.cards?.length === 1, 'the live session does not show up: ' + JSON.stringify(d1?.cards?.map((c) => c.id)));
  t(c1?.id === SID, 'wrong session: ' + c1?.id);
  t(c1?.own === false, 'a tab from the official extension is marked as ours');
  t(c1?.name === 'crm-e6', 'the card name does not come from the tab name: ' + c1?.name);
  t(c1?.preview === 'Fix the CRM reminders', 'the first prompt was not read: ' + c1?.preview);
  t(c1?.tokens === '250k', 'the context is not the one from the last message: ' + c1?.tokens);
  t(c1?.pct === 25, 'the percentage does not add up: ' + c1?.pct);
  // Il costo non si mostra piu', ma va ancora sommato correttamente: si controlla
  // il dato grezzo invece della stringa formattata.
  t(c1?.costUsd === 3, 'the cost is not summed over the whole transcript: ' + c1?.costUsd);
  t(d1?.totalCostUsd === 3, 'the total is not summed: ' + d1?.totalCostUsd);
  t(d1?.project === 'project', 'wrong project: ' + d1?.project);
  t(d1?.limit === '1M', 'the limit is not written in short form: ' + d1?.limit);
  t(d1?.usage === null && /loading|API limit/.test(d1?.usageWait || ''), 'the state of the account numbers is wrong');

  // ---- incremental read: only the new tail gets read ----
  fs.appendFileSync(
    transcript,
    row({ type: 'assistant', costUSD: 0.5, message: { role: 'assistant', usage: usage(300000) } })
  );
  registered.commands.get('claudeStudio.context.refresh')();
  await wait(50);
  const d2 = lastData();
  t(d2?.cards?.[0]?.costUsd === 3.5, 'the new tail is not added to what was already read: ' + d2?.cards?.[0]?.costUsd);
  t(d2?.cards?.[0]?.tokens === '300k', 'the context does not follow the last message: ' + d2?.cards?.[0]?.tokens);
  t(fs.statSync(transcript).size > grewFrom, 'the test did not actually grow the file');

  // ---- a sub-agent must not make the percentage collapse ----
  fs.appendFileSync(
    transcript,
    row({ type: 'assistant', isSidechain: true, costUSD: 0.25, message: { role: 'assistant', usage: usage(900) } })
  );
  registered.commands.get('claudeStudio.context.refresh')();
  await wait(50);
  const d3 = lastData();
  t(d3?.cards?.[0]?.tokens === '300k', 'the sub-agent context covered the real one: ' + d3?.cards?.[0]?.tokens);
  t(d3?.cards?.[0]?.costUsd === 3.75, 'the sub-agent cost is not counted: ' + d3?.cards?.[0]?.costUsd);

  // ---- the status bar ----
  // The project name moved into the tooltip: the bar holds the numbers.
  t(
    /crm-e6/.test(String(statusBar?.tooltip?.value || statusBar?.tooltip || '')),
    'the status bar does not say where you are: ' + (statusBar?.tooltip?.value || statusBar?.tooltip)
  );
  t(/ctx 30%/.test(statusBar?.text || ''), 'the status bar does not show the context: ' + statusBar?.text);
  t(
    /\$\(studio-(chat|layers|pulse|warn|alert|gauge|branch|off)\)/.test(statusBar?.text || ''),
    'the status bar does not use the Ionicons from the font: ' + statusBar?.text
  );
  t(
    !/\$\((pulse|warning|error|circle-outline|comment-discussion|layers|dashboard|git-branch)\)/.test(statusBar?.text || ''),
    'the status bar still uses the native icons instead of the Ionicons: ' + statusBar?.text
  );

  // ---- rename: creates the folder if missing, and on OUR file ----
  // It wipes all of ~/.claude, like on a PC where Claude has never written anything
  // yet: that is where 0.0.6 failed silently.
  const namesFile = path.join(home, '.claude', 'claude-studio-session-names.json');
  const sessionJson = path.join(sessionsDir, process.pid + '.json');
  const saved = { session: fs.readFileSync(sessionJson, 'utf8'), transcript: fs.readFileSync(transcript, 'utf8') };
  fs.rmSync(path.join(home, '.claude'), { recursive: true, force: true });
  inputBoxAnswer = 'Reminders';
  onMsg({ cmd: 'rename', id: SID });
  await wait(120);
  t(fs.existsSync(namesFile), 'the rename does not create ~/.claude when it is missing: that is the 0.0.6 defect');
  t(
    !fs.existsSync(path.join(home, '.claude', 'session-names.json')) &&
      !fs.existsSync(path.join(home, '.claude', '.context-bar-usage.json')),
    'we write to the 0.0.6 files: while it stays installed the two step on each other'
  );
  const bundle = fs.readFileSync(path.join(root, 'dist', 'extension.js'), 'utf8');
  t(!/\.context-bar-usage\.json/.test(bundle), 'the account usage cache still has the 0.0.6 name');
  t(/claude-studio-usage\.json/.test(bundle), 'the account usage cache does not have a name of our own');

  // the custom name wins over the tab name
  fs.mkdirSync(projects, { recursive: true });
  fs.mkdirSync(sessionsDir, { recursive: true });
  fs.writeFileSync(sessionJson, saved.session, 'utf8');
  fs.writeFileSync(transcript, saved.transcript, 'utf8');
  registered.commands.get('claudeStudio.context.refresh')();
  await wait(50);
  t(lastData()?.cards?.[0]?.name === 'Reminders', 'the name you gave it does not win: ' + lastData()?.cards?.[0]?.name);

  // ---- the fifth editor group: the 0.0.6 defect ----
  const tab = (viewType, label, isActive) => ({ label, isActive, input: { viewType } });
  const groups = (n, at) =>
    Array.from({ length: n }, (_, i) => ({
      viewColumn: i + 1,
      isActive: i + 1 === at,
      tabs: i + 1 === at ? [tab('other', 'note.md', false), tab('claudeVSCodePanel', 'crm-e6', true)] : [],
    }));

  tabGroups = { all: groups(5, 5) };
  executed.length = 0;
  onMsg({ cmd: 'focus', id: SID });
  await wait(120);
  t(
    executed.includes('workbench.action.focusFifthEditorGroup'),
    'the fifth group is never reached (0.0.6 stopped at the fourth): ' + executed.join(', ')
  );
  t(
    executed.includes('workbench.action.openEditorAtIndex(2)'),
    'the right tab inside the group is not opened: ' + executed.join(', ')
  );
  t(!shown.length, 'you click a live card and the chat says it cannot find it: ' + shown.join(' | '));

  // and past the eighth, where the numbered commands run out, it walks
  tabGroups = { all: groups(10, 10) };
  executed.length = 0;
  onMsg({ cmd: 'focus', id: SID });
  await wait(120);
  t(
    executed[0] === 'workbench.action.focusFirstEditorGroup' &&
      executed.filter((c) => c === 'workbench.action.focusNextGroup').length === 9,
    'you cannot get past the eighth group: ' + executed.join(', ')
  );

  // ---- matching by position, and the fact that it gets declared ----
  // Two tabs with the same name and no name saved by the CLI: the name is no help
  // any more, what is left is the order the tabs were born in.
  const SID2 = '99999999-8888-7777-6666-555555555555';
  // startedAt 1000 e 2000 servono solo a dare un ordine di nascita alle due sessioni:
  // e' quello che l'abbinamento per posizione guarda. Ma un `startedAt` del 1970 senza
  // `procStart` accanto fa dichiarare riciclati due pid vivissimi, e le due sessioni
  // sparivano prima di poter essere confrontate — che e' il motivo per cui questo
  // pezzo di test si e' auto-saltato per mesi.
  // Un secondo processo vivo, acceso da noi: del padre non si sa quando sia nato — e
  // su Windows spesso non e' nemmeno raggiungibile — quindi la seconda sessione non
  // reggeva in piedi e il confronto non avveniva mai.
  const kid = require('node:child_process').spawn(
    process.execPath,
    ['-e', 'setTimeout(() => {}, 120000)'],
    { stdio: 'ignore' }
  );
  // Nato adesso, cioe' dopo la fotografia dei processi: procs.ts si rifiuta di
  // giudicare chi e' nato dopo l'ultima occhiata, che e' esattamente la garanzia che
  // serve a una conversazione appena aperta.
  const kidStart = String(Math.round((Date.now() + 11644473600000) * 10000));

  fs.writeFileSync(
    path.join(sessionsDir, process.pid + '.json'),
    JSON.stringify({ sessionId: SID, cwd: work, name: '', startedAt: 1000, procStart })
  );
  fs.writeFileSync(
    path.join(sessionsDir, kid.pid + '.json'),
    JSON.stringify({ sessionId: SID2, cwd: work, name: '', startedAt: 2000, procStart: kidStart })
  );
  fs.writeFileSync(path.join(projects, SID2 + '.jsonl'), row({ type: 'user', message: { role: 'user', content: 'second' } }));
  tabGroups = {
    all: [
      {
        viewColumn: 1,
        isActive: true,
        tabs: [tab('claudeVSCodePanel', 'Claude Code', false), tab('claudeVSCodePanel', 'Claude Code', true)],
      },
    ],
  };
  registered.commands.get('claudeStudio.context.refresh')();
  await wait(50);
  const d4 = lastData();
  const focused = d4?.cards?.find((c) => c.focused);
  // Non si salta piu': le due sessioni sono vive per costruzione, e un test che si
  // auto-salta e' un test che non c'e'.
  t(
    d4?.cards?.length === 2,
    'le due sessioni vive non arrivano al pannello: ' + JSON.stringify(d4?.cards?.map((c) => c.id))
  );
  t(d4?.focusHow === 'position', 'the fallback by position does not kick in: ' + d4?.focusHow);
  // second tab active -> second session by startedAt
  t(focused?.id === SID2, 'matching by position latches onto the wrong session: ' + focused?.id);
  kid.kill();

  for (const s of ctx.subscriptions) s.dispose?.();

  if (fails.length) {
    console.error('FAILED:\n- ' + fails.join('\n- '));
    process.exit(1);
  }
  console.log('data-check ok — cost over the whole transcript, incremental reads, groups past the fourth, our own files');
  process.exit(0);
})();
