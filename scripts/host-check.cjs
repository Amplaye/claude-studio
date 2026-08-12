// Prova il bundle vero (dist/extension.js) fuori da VSCode, con un modulo `vscode`
// finto. Serve a coprire il pezzo piu' rischioso senza dover ricaricare l'editor:
// l'Agent SDK e' ESM impacchettato in un bundle CJS, e da li' parte davvero la CLI.
// Se questo passa, dentro VSCode cambia solo chi disegna i pixel.
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');

const root = path.dirname(__dirname);

// ---- il finto `vscode` -----------------------------------------------------
const uri = (p) => ({
  fsPath: p,
  scheme: 'file',
  toString: () => 'file:///' + p.replace(/\\/g, '/'),
});

const registered = { provider: null, commands: new Map() };
const asked = [];

const vscode = {
  Uri: {
    file: uri,
    joinPath: (base, ...parts) => uri(path.join(base.fsPath, ...parts)),
  },
  window: {
    registerWebviewViewProvider: (id, p) => {
      registered.provider = p;
      return { dispose() {} };
    },
    showWarningMessage: async (msg, _opts, ...items) => {
      asked.push(msg);
      return items[0]; // "Consenti": qui vogliamo vedere il tool girare davvero
    },
    showInformationMessage: async () => undefined,
  },
  commands: {
    registerCommand: (id, fn) => {
      registered.commands.set(id, fn);
      return { dispose() {} };
    },
    executeCommand: async () => undefined,
  },
  workspace: {
    workspaceFolders: [{ uri: uri(root) }],
    getConfiguration: () => ({ get: (_k, d) => d }),
  },
};

const load = Module._load;
Module._load = function (req, parent, isMain) {
  if (req === 'vscode') return vscode;
  return load.call(this, req, parent, isMain);
};

// ---- accensione ------------------------------------------------------------
const ext = require(path.join(root, 'dist', 'extension.js'));

const ctx = {
  extensionUri: uri(root),
  extensionPath: root,
  subscriptions: [],
};
ext.activate(ctx);

if (!registered.provider) {
  console.error('FALLITO: nessun provider di webview registrato');
  process.exit(1);
}

const got = [];
let onMsg = () => {};
const view = {
  webview: {
    cspSource: 'vscode-webview://x',
    options: {},
    asWebviewUri: (u) => u,
    onDidReceiveMessage: (fn) => {
      onMsg = fn;
      return { dispose() {} };
    },
    postMessage: async (m) => {
      got.push(m);
      return true;
    },
    set html(v) {
      this._html = v;
    },
    get html() {
      return this._html;
    },
  },
  onDidDispose: () => ({ dispose() {} }),
};

registered.provider.resolveWebviewView(view);

// ---- la pagina: CSP, nonce, sprite, percorsi risolti ------------------------
const html = view.webview.html || '';
const pageFails = [];
if (!/Content-Security-Policy/.test(html)) pageFails.push('CSP assente');
if (/unsafe-inline|unsafe-eval/.test(html)) pageFails.push('CSP permissiva');
if (/\{\{\w+\}\}/.test(html)) pageFails.push('segnaposto non sostituito: ' + (html.match(/\{\{\w+\}\}/) || [])[0]);
if (!/<symbol id="ion-send"/.test(html)) pageFails.push('sprite Ionicons non incollato');
if (!/nonce="[A-Za-z0-9]{32}"/.test(html)) pageFails.push('nonce mancante o corto');

// ---- un turno vero ---------------------------------------------------------
(async () => {
  onMsg({ cmd: 'ready' });
  onMsg({
    cmd: 'send',
    text: 'Usa il tool Read su package.json e poi dimmi in una riga il campo "name". Non fare altro.',
  });

  const turns = async (n) => {
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline && got.filter((m) => m.k === 'turn_end').length < n) {
      await new Promise((r) => setTimeout(r, 250));
    }
  };
  await turns(1);

  // Secondo turno: Read su un file del progetto passa da solo, Bash no. Serve per
  // vedere davvero il giro del permesso — richiesta, risposta, tool eseguito.
  onMsg({ cmd: 'send', text: 'Esegui `node -e "console.log(40+2)"` con Bash e riportami solo il numero.' });
  await turns(2);

  const kinds = got.map((m) => m.k);
  const fails = [...pageFails];
  const t = (c, m) => !c && fails.push(m);

  t(kinds.includes('hello'), 'nessun hello');
  t(kinds.includes('session'), 'la sessione non e’ mai partita: ' + JSON.stringify(got.slice(0, 4)));
  t(kinds.filter((k) => k === 'delta').length >= 2, 'niente streaming: ' + kinds.filter((k) => k === 'delta').length + ' delta');
  t(kinds.includes('tool_start'), 'nessun tool avviato');
  t(kinds.includes('tool_end'), 'nessun esito di tool');
  t(kinds.includes('turn_end'), 'il turno non e’ finito');
  t(!got.some((m) => m.k === 'error'), 'errori: ' + JSON.stringify(got.filter((m) => m.k === 'error')));

  const tools = got.filter((m) => m.k === 'tool_start');
  const ends = got.filter((m) => m.k === 'tool_end');
  t(
    ends.every((e) => tools.some((s) => s.id === e.id)),
    'un esito non corrisponde a nessun tool_use_id'
  );
  t(asked.length > 0, 'il permesso non e’ stato chiesto');

  const text = got
    .filter((m) => m.k === 'block_final' && m.kind === 'text')
    .map((m) => m.text)
    .join(' ');
  t(/claude-studio/.test(text), 'la risposta non contiene il dato letto dal file: ' + text.slice(0, 200));

  for (const d of ctx.subscriptions) d.dispose?.();

  if (fails.length) {
    console.error('FALLITO:\n- ' + fails.join('\n- '));
    process.exit(1);
  }
  console.log(
    'host-check ok — %d eventi, %d delta, %d tool, permessi chiesti %d',
    got.length,
    kinds.filter((k) => k === 'delta').length,
    tools.length,
    asked.length
  );
  process.exit(0);
})();
