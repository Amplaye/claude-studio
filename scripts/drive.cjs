// Banco di prova: la chat vera, usata da qui.
//
// Carica dist/extension.js con un `vscode` finto, apre la webview e manda i
// messaggi che gli si passano sulla riga di comando. Stampa in chiaro tutto quello
// che la webview riceverebbe, cosi' si vede — senza aprire VSCode — se la chat sta
// facendo la cosa giusta.
//
// ⚠️ Di suo dice SI' a ogni permesso, quindi puo' modificare davvero i file del
// progetto. Per provare cose che scrivono, o si usa --deny, o si mette in conto che
// la prova faccia quello che ha chiesto.
//
//   node scripts/drive.cjs "primo messaggio" "secondo messaggio"
//   node scripts/drive.cjs --json "..."     tutti gli eventi grezzi, uno per riga
//   node scripts/drive.cjs --deny "..."     rifiuta ogni permesso invece di darlo
//   node scripts/drive.cjs --mode plan "..."
//   node scripts/drive.cjs --cmd '{"cmd":"history"}' "..."   comando arbitrario prima
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');

const root = path.dirname(__dirname);
const argv = process.argv.slice(2);
/** Interruttore: c'e' o non c'e', e non si porta via il messaggio che lo segue. */
const on = (name) => {
  const i = argv.indexOf(name);
  if (i < 0) return false;
  argv.splice(i, 1);
  return true;
};
/** Opzione con valore: --mode plan. */
const flag = (name) => {
  const i = argv.indexOf(name);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  argv.splice(i, v === undefined ? 1 : 2);
  return v;
};
const raw = on('--json');
const deny = on('--deny');
const mode = flag('--mode');
const imageFile = flag('--image'); // allega un'immagine al primo messaggio
const pre = [];
for (;;) {
  const c = flag('--cmd');
  if (!c) break;
  pre.push(JSON.parse(c));
}
const prompts = argv.filter((a) => !a.startsWith('--'));

const uri = (p) => ({ fsPath: p, scheme: 'file', toString: () => 'file:///' + p.replace(/\\/g, '/') });

function fakeWebview() {
  const w = {
    cspSource: 'vscode-webview://x',
    options: {},
    _html: '',
    _onMsg: () => {},
    asWebviewUri: (u) => u,
    onDidReceiveMessage: (fn) => ((w._onMsg = fn), { dispose() {} }),
    postMessage: async (m) => (show(m), true),
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
  window: {
    registerWebviewViewProvider: (id, p) => ((registered.provider = p), { dispose() {} }),
    registerWebviewPanelSerializer: () => ({ dispose() {} }),
    createWebviewPanel: (type, title, column, opts) => {
      const panel = {
        type,
        title,
        column,
        opts,
        webview: fakeWebview(),
        reveal() {},
        dispose() {},
        onDidDispose: () => ({ dispose() {} }),
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
    getConfiguration: () => ({ get: (_k, d) => d }),
    findFiles: async () => [uri(path.join(root, 'package.json')), uri(path.join(root, 'src', 'extension.ts'))],
    openTextDocument: async () => ({ getText: () => '' }),
    onDidChangeTextDocument: () => ({ dispose() {} }),
    registerTextDocumentContentProvider: () => ({ dispose() {} }),
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

const load = Module._load;
Module._load = function (req, parent, isMain) {
  return req === 'vscode' ? vscode : load.call(this, req, parent, isMain);
};

// ---- come si vede quello che arriva -----------------------------------------
const cut = (s, n) => {
  const t = String(s ?? '').replace(/\s+/g, ' ');
  return t.length > n ? t.slice(0, n) + '…' : t;
};

let line = '';
function show(m) {
  // Il permesso si risponde comunque, anche quando si guardano gli eventi grezzi:
  // se nessuno risponde, il turno resta appeso e non si vede piu' niente.
  if (m.k === 'ask') {
    setTimeout(
      () => send({ cmd: 'answer', id: m.id, choice: deny ? 'deny' : 'allow', answers: firstAnswers(m) }),
      0
    );
  }
  if (raw) {
    console.log(JSON.stringify(m));
    return;
  }
  switch (m.k) {
    case 'delta':
      // lo streaming si scrive di seguito, come si vedrebbe nella chat
      line += m.text;
      process.stdout.write(m.kind === 'thinking' ? '' : m.text);
      return;
    case 'block_final':
      if (m.kind === 'thinking') {
        console.log('  ~ pensiero:', cut(m.text, 120));
      } else if (!line) {
        // testo arrivato tutto insieme (ridisegno di una conversazione passata):
        // senza questo il ripescaggio sembrerebbe muto
        console.log(cut(m.text, 400));
      }
      if (line) process.stdout.write('\n');
      line = '';
      return;
    case 'user':
      console.log('\n> ' + cut(m.text, 300));
      return;
    case 'session':
      console.log('  · sessione', m.id, '·', m.model);
      return;
    case 'tool_start':
      console.log(`  [${m.name}${m.parent ? ' ↳' : ''}] ${cut(JSON.stringify(m.input), 140)}`);
      return;
    case 'tool_end':
      console.log(`  [${m.ok ? 'ok' : 'KO'}] ${cut(m.text, 140)}`);
      return;
    case 'ask':
      console.log(`  ?? PERMESSO (${m.kind}) ${cut(m.title, 100)} — ${cut(m.detail || m.plan, 100)}`);
      return;
    case 'ask_done':
      console.log('  -> ' + m.label);
      return;
    case 'turn_end':
      console.log(
        `  · fine turno: ${m.ok ? 'ok' : 'KO'} · $${(m.costUsd ?? 0).toFixed(4)} · ${m.tokens} token · ${Math.round((m.durationMs ?? 0) / 100) / 10}s`
      );
      return;
    case 'error':
      console.log('  !! ' + cut(m.message, 400));
      return;
    case 'busy':
      return;
    default:
      console.log('  · ' + m.k + ' ' + cut(JSON.stringify(m), 200));
  }
}

/** Se e' una domanda a scelta multipla si prende sempre la prima opzione. */
function firstAnswers(m) {
  if (m.kind !== 'question' || !m.questions) return undefined;
  const a = {};
  for (const q of m.questions) a[q.question] = q.options[0]?.label;
  return a;
}

// ---- accensione --------------------------------------------------------------
const ext = require(path.join(root, 'dist', 'extension.js'));
const ctx = { extensionUri: uri(root), extensionPath: root, subscriptions: [], globalState: memento(), workspaceState: memento() };
function memento() {
  const map = new Map();
  return { get: (k, d) => (map.has(k) ? map.get(k) : d), update: async (k, v) => void map.set(k, v), keys: () => [...map.keys()] };
}
ext.activate(ctx);

const view = { webview: fakeWebview(), onDidDispose: () => ({ dispose() {} }) };
registered.provider.resolveWebviewView(view);
const send = (m) => view.webview._onMsg(m);

(async () => {
  send({ cmd: 'ready' });
  if (mode) send({ cmd: 'setMode', value: mode });
  for (const c of pre) send(c);
  await new Promise((r) => setTimeout(r, 400));

  let done = 0;
  const seen = [];
  const orig = view.webview.postMessage;
  view.webview.postMessage = async (m) => {
    seen.push(m);
    if (m.k === 'turn_end') done++;
    return orig(m);
  };

  // Se il file non c'e' si deve sapere: un allegato sparito in silenzio fa sembrare
  // rotto il codice quando invece e' sbagliato il comando.
  if (imageFile && !fs.existsSync(imageFile)) {
    console.error('!! immagine inesistente: ' + imageFile);
    process.exit(2);
  }
  const images = imageFile
    ? [{ mime: 'image/png', data: fs.readFileSync(imageFile).toString('base64') }]
    : undefined;

  for (let i = 0; i < prompts.length; i++) {
    send({ cmd: 'send', text: prompts[i], images: i === 0 ? images : undefined });
    const want = i + 1;
    const deadline = Date.now() + 240000;
    while (done < want && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
    if (done < want) console.log('  !! turno non finito entro il tempo');
  }

  await new Promise((r) => setTimeout(r, 300));
  for (const d of ctx.subscriptions) d.dispose?.();
  process.exit(0);
})();
