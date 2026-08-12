// Prova il motore della barra di contesto dentro il bundle vero (dist/extension.js),
// con un `vscode` finto e una finta cartella utente. Niente rete, niente CLI: qui si
// controllano i conti e le correzioni ai difetti della 0.0.6, che sono tutte cose
// che a occhio non si vedono.
//
// Su Windows os.homedir() legge USERPROFILE: basta cambiarlo prima di caricare il
// bundle e tutto quello che l'estensione scrive finisce in una cartella usa e getta.
const Module = require('node:module');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.dirname(__dirname);
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-studio-data-'));
const work = path.join(home, 'progetto');
fs.mkdirSync(work, { recursive: true });
process.env.USERPROFILE = home;
process.env.HOME = home;
if (os.homedir() !== home) {
  console.error('FALLITO: non riesco a spostare la cartella utente per la prova');
  process.exit(1);
}
process.on('exit', () => {
  try {
    fs.rmSync(home, { recursive: true, force: true });
  } catch {
    /* la ripulisce il sistema */
  }
});

const fails = [];
const t = (cond, msg) => !cond && fails.push(msg);

// ---- il finto `vscode` -----------------------------------------------------
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
    /** La finestra e' sempre "in primo piano": qui non c'e' nessuno da avvisare. */
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
    getConfiguration: () => ({ get: (_k, d) => d }),
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

// ---- il materiale finto sul disco ------------------------------------------

const slug = work.replace(/[^a-zA-Z0-9]/g, '-');
const projects = path.join(home, '.claude', 'projects', slug);
const sessionsDir = path.join(home, '.claude', 'sessions');
fs.mkdirSync(projects, { recursive: true });
fs.mkdirSync(sessionsDir, { recursive: true });

const SID = '11111111-2222-3333-4444-555555555555';
const transcript = path.join(projects, SID + '.jsonl');

const usage = (n) => ({ input_tokens: n, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 0 });
const row = (o) => JSON.stringify(o) + '\n';

// Un transcript lungo: il costo sta in fondo E in cima. La 0.0.6 leggeva solo gli
// ultimi 256 KB, quindi il primo dollaro non lo vedeva — e il costo usciva
// sottostimato su tutte le conversazioni lunghe.
let big = '';
big += row({ type: 'user', message: { role: 'user', content: 'Sistemare i promemoria del CRM' } });
big += row({ type: 'assistant', costUSD: 1, message: { role: 'assistant', usage: usage(1000) } });
const filler = row({ type: 'assistant', message: { role: 'assistant', content: 'x'.repeat(300) } });
while (Buffer.byteLength(big) < 400 * 1024) big += filler;
big += row({ type: 'assistant', costUSD: 2, message: { role: 'assistant', usage: usage(250000) } });
fs.writeFileSync(transcript, big, 'utf8');
const grewFrom = Buffer.byteLength(big);

// Una sessione viva dell'estensione ufficiale: il pid e' il nostro, quindi e' viva.
fs.writeFileSync(
  path.join(sessionsDir, process.pid + '.json'),
  JSON.stringify({ sessionId: SID, cwd: work, name: 'crm-e6', startedAt: Date.now() - 60000 }),
  'utf8'
);

// ---- accensione -------------------------------------------------------------
const ext = require(path.join(root, 'dist', 'extension.js'));
/** Le preferenze della chat vivono qui: una mappa in memoria basta. */
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
  console.error('FALLITO: il pannello del contesto non e’ registrato');
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
  // ---- la pagina: stesse regole della chat ----
  const html = view.webview.html || '';
  t(/Content-Security-Policy/.test(html), 'il pannello del contesto e’ senza CSP');
  t(!/unsafe-inline|unsafe-eval/.test(html), 'CSP permissiva nel pannello del contesto');
  t(!/\{\{\w+\}\}/.test(html), 'segnaposto non sostituito: ' + (html.match(/\{\{\w+\}\}/) || [])[0]);
  t(/<symbol id="ion-speedometer"/.test(html), 'sprite Ionicons non incollato nel pannello');
  t(/nonce="[A-Za-z0-9]{32}"/.test(html), 'nonce mancante o corto nel pannello');

  onMsg({ cmd: 'ready' });
  await wait(200);

  // ---- i conti ----
  const d1 = lastData();
  t(!!d1, 'il pannello non riceve nessun dato');
  const c1 = d1?.cards?.[0];
  t(d1?.cards?.length === 1, 'la sessione viva non compare: ' + JSON.stringify(d1?.cards?.map((c) => c.id)));
  t(c1?.id === SID, 'sessione sbagliata: ' + c1?.id);
  t(c1?.own === false, 'una tab dell’ufficiale e’ marcata come nostra');
  t(c1?.name === 'crm-e6', 'il nome della card non viene dal nome tab: ' + c1?.name);
  t(c1?.preview === 'Sistemare i promemoria del CRM', 'il primo prompt non e’ stato letto: ' + c1?.preview);
  t(c1?.tokens === '250k', 'il contesto non e’ quello dell’ultimo messaggio: ' + c1?.tokens);
  t(c1?.pct === 25, 'la percentuale non torna: ' + c1?.pct);
  // il dollaro in cima al file, quello che la 0.0.6 perdeva
  t(c1?.cost === '$3.00', 'il costo non e’ sommato su tutto il transcript: ' + c1?.cost);
  t(d1?.totalCost === '$3.00', 'il totale non e’ mostrato: ' + d1?.totalCost);
  t(d1?.project === 'progetto', 'progetto sbagliato: ' + d1?.project);
  t(d1?.limit === '1M', 'il limite non e’ scritto corto: ' + d1?.limit);
  t(d1?.usage === null && /caricamento|limite API/.test(d1?.usageWait || ''), 'lo stato dei numeri account e’ sbagliato');

  // ---- lettura incrementale: si legge solo la coda nuova ----
  fs.appendFileSync(
    transcript,
    row({ type: 'assistant', costUSD: 0.5, message: { role: 'assistant', usage: usage(300000) } })
  );
  registered.commands.get('claudeStudio.context.refresh')();
  await wait(50);
  const d2 = lastData();
  t(d2?.cards?.[0]?.cost === '$3.50', 'la coda nuova non si somma a quella gia’ letta: ' + d2?.cards?.[0]?.cost);
  t(d2?.cards?.[0]?.tokens === '300k', 'il contesto non segue l’ultimo messaggio: ' + d2?.cards?.[0]?.tokens);
  t(fs.statSync(transcript).size > grewFrom, 'la prova non ha davvero allungato il file');

  // ---- un sub-agent non deve far crollare la percentuale ----
  fs.appendFileSync(
    transcript,
    row({ type: 'assistant', isSidechain: true, costUSD: 0.25, message: { role: 'assistant', usage: usage(900) } })
  );
  registered.commands.get('claudeStudio.context.refresh')();
  await wait(50);
  const d3 = lastData();
  t(d3?.cards?.[0]?.tokens === '300k', 'il contesto del sub-agent ha coperto quello vero: ' + d3?.cards?.[0]?.tokens);
  t(d3?.cards?.[0]?.cost === '$3.75', 'il costo del sub-agent non e’ contato: ' + d3?.cards?.[0]?.cost);

  // ---- la barra di stato ----
  t(/crm-e6/.test(statusBar?.text || ''), 'la barra di stato non dice dove sei: ' + statusBar?.text);
  t(/ctx 30%/.test(statusBar?.text || ''), 'la barra di stato non mostra il contesto: ' + statusBar?.text);
  t(
    /\$\(studio-(chat|layers|pulse|warn|alert|gauge|branch|off)\)/.test(statusBar?.text || ''),
    'la barra di stato non usa le Ionicons del font: ' + statusBar?.text
  );
  t(
    !/\$\((pulse|warning|error|circle-outline|comment-discussion|layers|dashboard|git-branch)\)/.test(statusBar?.text || ''),
    'la barra di stato usa ancora le icone native invece delle Ionicons: ' + statusBar?.text
  );

  // ---- rinomina: crea la cartella se manca, e sul file NOSTRO ----
  // Si porta via tutta ~/.claude, come su un PC dove Claude non ha ancora scritto
  // niente: e' li' che la 0.0.6 falliva in silenzio.
  const namesFile = path.join(home, '.claude', 'claude-studio-session-names.json');
  const sessionJson = path.join(sessionsDir, process.pid + '.json');
  const saved = { session: fs.readFileSync(sessionJson, 'utf8'), transcript: fs.readFileSync(transcript, 'utf8') };
  fs.rmSync(path.join(home, '.claude'), { recursive: true, force: true });
  inputBoxAnswer = 'Promemoria';
  onMsg({ cmd: 'rename', id: SID });
  await wait(120);
  t(fs.existsSync(namesFile), 'la rinomina non crea ~/.claude quando manca: e’ il difetto della 0.0.6');
  t(
    !fs.existsSync(path.join(home, '.claude', 'session-names.json')) &&
      !fs.existsSync(path.join(home, '.claude', '.context-bar-usage.json')),
    'scriviamo sui file della 0.0.6: finche’ resta installata si pestano i piedi'
  );
  const bundle = fs.readFileSync(path.join(root, 'dist', 'extension.js'), 'utf8');
  t(!/\.context-bar-usage\.json/.test(bundle), 'la cache dell’uso account ha ancora il nome della 0.0.6');
  t(/claude-studio-usage\.json/.test(bundle), 'la cache dell’uso account non ha un nome nostro');

  // il nome custom vince sul nome tab
  fs.mkdirSync(projects, { recursive: true });
  fs.mkdirSync(sessionsDir, { recursive: true });
  fs.writeFileSync(sessionJson, saved.session, 'utf8');
  fs.writeFileSync(transcript, saved.transcript, 'utf8');
  registered.commands.get('claudeStudio.context.refresh')();
  await wait(50);
  t(lastData()?.cards?.[0]?.name === 'Promemoria', 'il nome che hai dato tu non vince: ' + lastData()?.cards?.[0]?.name);

  // ---- il quinto gruppo di editor: il difetto della 0.0.6 ----
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
    'il quinto gruppo non viene raggiunto (la 0.0.6 si fermava al quarto): ' + executed.join(', ')
  );
  t(
    executed.includes('workbench.action.openEditorAtIndex(2)'),
    'la tab giusta nel gruppo non viene aperta: ' + executed.join(', ')
  );
  t(!shown.length, 'clic su una card viva e la chat dice di non trovarla: ' + shown.join(' | '));

  // e oltre l'ottavo, dove i comandi numerati finiscono, si cammina
  tabGroups = { all: groups(10, 10) };
  executed.length = 0;
  onMsg({ cmd: 'focus', id: SID });
  await wait(120);
  t(
    executed[0] === 'workbench.action.focusFirstEditorGroup' &&
      executed.filter((c) => c === 'workbench.action.focusNextGroup').length === 9,
    'oltre l’ottavo gruppo non ci si arriva: ' + executed.join(', ')
  );

  // ---- l'aggancio per posizione, e il fatto che venga dichiarato ----
  // Due tab che si chiamano uguale e nessun nome salvato dalla CLI: il nome non
  // aiuta piu', resta l'ordine in cui le tab sono nate.
  const SID2 = '99999999-8888-7777-6666-555555555555';
  fs.writeFileSync(
    path.join(sessionsDir, process.pid + '.json'),
    JSON.stringify({ sessionId: SID, cwd: work, name: '', startedAt: 1000 })
  );
  fs.writeFileSync(
    path.join(sessionsDir, process.ppid + '.json'),
    JSON.stringify({ sessionId: SID2, cwd: work, name: '', startedAt: 2000 })
  );
  fs.writeFileSync(path.join(projects, SID2 + '.jsonl'), row({ type: 'user', message: { role: 'user', content: 'seconda' } }));
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
  if (d4?.cards?.length === 2) {
    t(d4?.focusHow === 'posizione', 'il ripiego per posizione non scatta: ' + d4?.focusHow);
    // seconda tab attiva -> seconda sessione per startedAt
    t(focused?.id === SID2, 'per posizione si aggancia la sessione sbagliata: ' + focused?.id);
  } else {
    // process.ppid puo' non essere un processo raggiungibile: in quel caso la
    // seconda sessione non risulta viva e la prova non ha materiale.
    console.log('  (saltata la prova del ripiego per posizione: due sessioni vive non disponibili)');
  }

  for (const s of ctx.subscriptions) s.dispose?.();

  if (fails.length) {
    console.error('FALLITO:\n- ' + fails.join('\n- '));
    process.exit(1);
  }
  console.log('data-check ok — costo su tutto il transcript, letture incrementali, gruppi oltre il quarto, file nostri');
  process.exit(0);
})();
