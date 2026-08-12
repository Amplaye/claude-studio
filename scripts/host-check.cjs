// Prova il bundle vero (dist/extension.js) fuori da VSCode, con un modulo `vscode`
// finto. Serve a coprire il pezzo piu' rischioso senza dover ricaricare l'editor:
// l'Agent SDK e' ESM impacchettato in un bundle CJS, e da li' parte davvero la CLI.
// Se questo passa, dentro VSCode cambia solo chi disegna i pixel.
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');

const root = path.dirname(__dirname);

// "Consenti sempre" non e' un fatto della sessione: la CLI suggerisce di scrivere la
// regola in .claude/settings.local.json, e da li' vale anche per le prove successive.
// Quindi la prova parte pulita e rimette a posto: senza, la seconda esecuzione non
// vedrebbe piu' chiedere nessun permesso e passerebbe per il motivo sbagliato.
const localSettings = path.join(root, '.claude', 'settings.local.json');
const savedSettings = fs.existsSync(localSettings) ? fs.readFileSync(localSettings, 'utf8') : null;
try {
  fs.rmSync(localSettings, { force: true });
} catch {
  /* non c'era */
}
process.on('exit', () => {
  try {
    if (savedSettings === null) fs.rmSync(localSettings, { force: true });
    else {
      fs.mkdirSync(path.dirname(localSettings), { recursive: true });
      fs.writeFileSync(localSettings, savedSettings, 'utf8');
    }
  } catch {
    /* niente da rimettere a posto */
  }
});

// ---- il finto `vscode` -----------------------------------------------------
const uri = (p) => ({
  fsPath: p,
  scheme: 'file',
  toString: () => 'file:///' + p.replace(/\\/g, '/'),
});

const registered = { provider: null, commands: new Map(), panels: [] };
const asked = [];

/** Finta webview: raccoglie quello che le viene mandato e lascia rispondere. */
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
  Uri: {
    file: uri,
    joinPath: (base, ...parts) => uri(path.join(base.fsPath, ...parts)),
  },
  window: {
    registerWebviewViewProvider: (id, p) => {
      registered.provider = p;
      return { dispose() {} };
    },
    registerWebviewPanelSerializer: () => ({ dispose() {} }),
    createWebviewPanel: (type, title, column, opts) => {
      const panel = {
        type,
        title,
        column,
        opts,
        webview: fakeWebview(),
        iconPath: undefined,
        reveal() {
          panel.revealed = true;
        },
        dispose() {},
        onDidDispose: () => ({ dispose() {} }),
      };
      registered.panels.push(panel);
      return panel;
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

const view = { webview: fakeWebview(), onDidDispose: () => ({ dispose() {} }) };
registered.provider.resolveWebviewView(view);

const got = view.webview.got;
const onMsg = (m) => view.webview._onMsg(m);

// Il permesso ora si chiede dentro la chat, non con una finestra di VSCode: qui
// facciamo la parte di chi clicca "Consenti".
const answered = [];
const rawPost = view.webview.postMessage;
view.webview.postMessage = async (m) => {
  const r = await rawPost(m);
  if (m && m.k === 'ask') {
    // Al primo permesso si clicca "Consenti sempre": cosi' il turno dopo, con lo
    // stesso comando, non deve chiedere piu' niente.
    const choice = answered.length === 0 ? 'always' : 'allow';
    answered.push(m);
    setTimeout(() => onMsg({ cmd: 'answer', id: m.id, choice }), 0);
  }
  return r;
};

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

  // A meta' conversazione si apre la scheda: deve ritrovarsi la stessa storia,
  // gia' composta (niente frammenti di streaming da ridisegnare).
  await registered.commands.get('claudeStudio.openTab')();
  const panel = registered.panels[0];
  if (panel) panel.webview._onMsg({ cmd: 'ready' });
  // Tutto quello che la scheda riceve da qui in poi e' roba dal vivo del turno 2:
  // il replay e' solo questo prefisso.
  const replay = panel ? panel.webview.got.slice() : [];

  // Secondo turno: Read su un file del progetto passa da solo, Bash no. Serve per
  // vedere davvero il giro del permesso — richiesta, risposta, tool eseguito.
  const bashTurn = 'Esegui `node -e "console.log(40+2)"` con Bash e riportami solo il numero.';
  onMsg({ cmd: 'send', text: bashTurn });
  await turns(2);
  const asksAfterAlways = answered.length;

  // Terzo turno, stesso comando: "Consenti sempre" deve aver messo la regola in
  // sessione, quindi nessuna seconda richiesta.
  onMsg({ cmd: 'send', text: bashTurn });
  await turns(3);

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
  // ---- permessi: dentro la chat, non in una finestra di VSCode ----
  t(asked.length === 0, 'il permesso e’ passato da una finestra modale: ' + asked.join(' | '));
  t(answered.length > 0, 'il permesso non e’ stato chiesto');
  const ask = answered[0] || {};
  t(!!ask.title, 'la richiesta di permesso non ha un titolo da mostrare');
  t(ask.kind === 'tool', 'tipo di richiesta inatteso: ' + ask.kind);
  t(
    tools.some((s) => s.id === ask.id),
    'la richiesta di permesso non e’ agganciata a nessun tool_use_id'
  );
  const dones = got.filter((m) => m.k === 'ask_done');
  t(
    answered.every((a) => dones.some((d) => d.id === a.id && d.ok)),
    'una richiesta e’ rimasta appesa senza esito'
  );
  const bash = got.find((m) => m.k === 'tool_end' && m.id === ask.id);
  t(
    !!bash && bash.ok,
    'il tool non e’ partito dopo il consenso — chiesto ' +
      JSON.stringify(answered.map((a) => [a.tool, a.id])) +
      ' esiti ' +
      JSON.stringify(ends.map((e) => [e.id, e.ok, String(e.text).slice(0, 160)]))
  );
  t(/42/.test((bash && bash.text) || ''), 'il tool consentito non ha dato il risultato atteso');
  t(
    answered.length === asksAfterAlways,
    '"Consenti sempre" non ha retto: lo stesso comando ha chiesto di nuovo il permesso'
  );
  // la modalita' viaggia verso tutte le facce
  t(got.some((m) => m.k === 'mode'), 'la modalita’ permessi non e’ mai arrivata alla webview');

  const text = got
    .filter((m) => m.k === 'block_final' && m.kind === 'text')
    .map((m) => m.text)
    .join(' ');
  t(/claude-studio/.test(text), 'la risposta non contiene il dato letto dal file: ' + text.slice(0, 200));

  // ---- la scheda ----
  t(!!panel, 'la scheda non si e’ aperta');
  const pg = panel ? panel.webview.got : [];
  t(panel?.type === 'claudeStudio.panel', 'tipo di scheda sbagliato: ' + panel?.type);
  t(panel?.opts?.retainContextWhenHidden === true, 'la scheda perde il contenuto quando la nascondi');
  t(!!panel?.iconPath, 'la scheda non ha icona');
  t(replay[0]?.k === 'hello' && replay[0]?.surface === 'panel', 'la scheda non si riconosce come scheda');
  t(replay.some((m) => m.k === 'user' && /Read su package\.json/.test(m.text)), 'la scheda non ha ripreso la storia');
  t(
    replay.some((m) => m.k === 'block_final' && /claude-studio/.test(m.text || '')),
    'la scheda non ha ripreso la risposta gia’ composta'
  );
  t(
    !replay.some((m) => m.k === 'delta'),
    'la scheda si e’ ripresa i frammenti di streaming invece del testo composto — id rimasti: ' +
      JSON.stringify([...new Set(replay.filter((m) => m.k === 'delta').map((m) => m.id))])
  );
  const rStart = replay.filter((m) => m.k === 'tool_start');
  const rEnd = replay.filter((m) => m.k === 'tool_end');
  t(rStart.length > 0, 'la scheda non ha ripreso nessun tool del turno gia’ passato');
  t(
    rEnd.every((e) => rStart.some((s) => s.id === e.id)),
    'nel replay un esito non corrisponde a nessun tool'
  );
  // e da qui in poi le due facce vedono le stesse cose
  const after = (arr) => arr.filter((m) => m.k === 'tool_start').length;
  t(after(pg) >= 1, 'la scheda non riceve i nuovi eventi');

  for (const d of ctx.subscriptions) d.dispose?.();

  if (fails.length) {
    console.error('FALLITO:\n- ' + fails.join('\n- '));
    process.exit(1);
  }
  console.log(
    'host-check ok — %d eventi, %d delta, %d tool, %d permessi chiesti e concessi dalla chat',
    got.length,
    kinds.filter((k) => k === 'delta').length,
    tools.length,
    answered.length
  );
  process.exit(0);
})();
