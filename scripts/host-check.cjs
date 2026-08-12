// Tests the real bundle (dist/extension.js) outside VS Code, with a fake `vscode`
// module. It covers the riskiest piece without having to reload the editor: the
// Agent SDK is ESM packed into a CJS bundle, and that is where the CLI really
// starts. If this passes, inside VS Code the only thing that changes is who draws
// the pixels.
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');

const root = path.dirname(__dirname);

// "Always allow" is not a fact about the session: the CLI writes the rule into
// .claude/settings.local.json, and from there it holds for later runs too. So the
// test starts clean and puts things back: without that, the second run would never
// see a permission asked and would pass for the wrong reason.
const localSettings = path.join(root, '.claude', 'settings.local.json');
const savedSettings = fs.existsSync(localSettings) ? fs.readFileSync(localSettings, 'utf8') : null;
try {
  fs.rmSync(localSettings, { force: true });
} catch {
  /* it was not there */
}
process.on('exit', () => {
  try {
    if (savedSettings === null) fs.rmSync(localSettings, { force: true });
    else {
      fs.mkdirSync(path.dirname(localSettings), { recursive: true });
      fs.writeFileSync(localSettings, savedSettings, 'utf8');
    }
  } catch {
    /* nothing to put back */
  }
});

// ---- the fake `vscode` -----------------------------------------------------
const uri = (p) => ({
  fsPath: p,
  scheme: 'file',
  toString: () => 'file:///' + p.replace(/\\/g, '/'),
});

const registered = { provider: null, views: new Map(), commands: new Map(), panels: [] };
const asked = [];
let statusBar;

/** Fake webview: collects whatever gets sent to it and lets you answer. */
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
    showInputBox: async () => undefined,
    /** The window is always "in the foreground": there is nobody to notify here. */
    state: { focused: true },
    onDidChangeWindowState: () => ({ dispose() {} }),
    registerWebviewViewProvider: (id, p) => {
      registered.views.set(id, p);
      if (id === 'claudeStudio.chat') registered.provider = p;
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
        active: true,
        reveal() {
          panel.revealed = true;
        },
        dispose() {},
        onDidDispose: () => ({ dispose() {} }),
        onDidChangeViewState: () => ({ dispose() {} }),
      };
      registered.panels.push(panel);
      return panel;
    },
    showWarningMessage: async (msg, _opts, ...items) => {
      asked.push(msg);
      return items[0]; // "Allow": here we want to see the tool actually run
    },
    showInformationMessage: async () => undefined,
    showErrorMessage: async () => undefined,
    showTextDocument: async () => ({}),
    activeTextEditor: undefined,
    onDidChangeActiveTextEditor: () => ({ dispose() {} }),
    onDidChangeTextEditorSelection: () => ({ dispose() {} }),
    tabGroups: {
      all: [{ tabs: [{ isActive: true, input: { uri: uri(path.join(root, 'package.json')) } }] }],
      onDidChangeTabs: () => ({ dispose() {} }),
      onDidChangeTabGroups: () => ({ dispose() {} }),
    },
  },
  languages: {
    getDiagnostics: () => [
      [
        uri(path.join(root, 'src', 'extension.ts')),
        [{ severity: 0, message: 'fake error for the test', range: { start: { line: 3, character: 2 } } }],
      ],
    ],
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
    // The tests must not go to npm looking for updates: the automatic check is off
    // here, as if you had turned it off yourself.
    getConfiguration: () => ({ get: (k, d) => (k === 'autoUpdate' ? 'off' : d) }),
    findFiles: async () => [uri(path.join(root, 'package.json'))],
    openTextDocument: async () => ({ getText: () => '' }),
    registerTextDocumentContentProvider: () => ({ dispose() {} }),
    onDidChangeWorkspaceFolders: () => ({ dispose() {} }),
    onDidChangeConfiguration: () => ({ dispose() {} }),
    fs: { stat: async () => ({}) },
    asRelativePath: (p) => {
      const s = String(p?.fsPath ?? p);
      return s.startsWith(root) ? s.slice(root.length + 1).replace(/\\/g, '/') : s;
    },
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

// ---- start-up --------------------------------------------------------------
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

if (!registered.provider) {
  console.error('FAILED: no webview provider registered');
  process.exit(1);
}

const view = {
  webview: fakeWebview(),
  visible: true,
  onDidChangeVisibility: () => ({ dispose() {} }),
  onDidDispose: () => ({ dispose() {} }),
};
registered.provider.resolveWebviewView(view);

const got = view.webview.got;
const onMsg = (m) => view.webview._onMsg(m);

// The permission is now asked inside the chat, not with a VS Code dialog: here we
// play the part of whoever clicks "Allow".
const answered = [];
const rawPost = view.webview.postMessage;
view.webview.postMessage = async (m) => {
  const r = await rawPost(m);
  if (m && m.k === 'ask') {
    // On the first permission we click "Always allow": that way the next turn, with
    // the same command, must not ask for anything.
    const choice = answered.length === 0 ? 'always' : 'allow';
    answered.push(m);
    setTimeout(() => onMsg({ cmd: 'answer', id: m.id, choice }), 0);
  }
  return r;
};

// ---- the page: CSP, nonce, sprite, resolved paths --------------------------
const html = view.webview.html || '';
const pageFails = [];
if (!/Content-Security-Policy/.test(html)) pageFails.push('CSP missing');
if (/unsafe-inline|unsafe-eval/.test(html)) pageFails.push('permissive CSP');
if (/\{\{\w+\}\}/.test(html)) pageFails.push('placeholder not substituted: ' + (html.match(/\{\{\w+\}\}/) || [])[0]);
if (!/<symbol id="ion-send"/.test(html)) pageFails.push('Ionicons sprite not pasted in');
if (!/nonce="[A-Za-z0-9]{32}"/.test(html)) pageFails.push('nonce missing or too short');

// ---- a real turn -----------------------------------------------------------
(async () => {
  onMsg({ cmd: 'ready' });
  // The chat starts in "does everything by itself": there nobody asks for
  // permissions, and there would be nothing underneath to test. Here we want to see
  // the full round trip, so we go back to the mode that asks.
  onMsg({ cmd: 'setMode', value: 'default' });
  onMsg({
    cmd: 'send',
    text: 'Use the Read tool on package.json and then tell me the "name" field in one line. Do nothing else.',
  });

  const turns = async (n) => {
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline && got.filter((m) => m.k === 'turn_end').length < n) {
      await new Promise((r) => setTimeout(r, 250));
    }
  };
  await turns(1);

  // Halfway through the conversation the tab opens: it must find the same history,
  // already composed (no streaming fragments to redraw).
  await registered.commands.get('claudeStudio.openTab')();
  const panel = registered.panels[0];
  if (panel) panel.webview._onMsg({ cmd: 'ready' });
  // Everything the tab receives from here on is live material from turn 2: the
  // replay is only this prefix.
  const replay = panel ? panel.webview.got.slice() : [];

  // Second turn: Read on a project file goes through on its own, Bash does not. It
  // is there to really see the permission round trip — request, answer, tool run.
  const bashTurn = 'Run `node -e "console.log(40+2)"` with Bash and report just the number back to me.';
  onMsg({ cmd: 'send', text: bashTurn });
  await turns(2);
  const asksAfterAlways = answered.length;

  // Third turn, same command: "Always allow" must have put the rule in the session,
  // so there should be no second request.
  onMsg({ cmd: 'send', text: bashTurn });
  await turns(3);
  const asksAfterRepeat = answered.length;

  // Fourth turn: the bridge with the editor. It lives inside this same process, so
  // it is also the proof that the MCP server survives bundling.
  onMsg({
    cmd: 'send',
    text: 'Call the mcp__editor__errori_editor tool and report back the line it answers with, no comments.',
  });
  await turns(4);

  const sessionId = (got.find((m) => m.k === 'session') || {}).id;

  // ---- the context bar sees the conversation we just had ----
  // This is why the chat and the bar live in the same extension: the chat opened the
  // session, so there is nothing to guess.
  const ctxProvider = registered.views.get('claudeStudio.context');
  const ctxView = {
    webview: fakeWebview(),
    visible: true,
    onDidChangeVisibility: () => ({ dispose() {} }),
    onDidDispose: () => ({ dispose() {} }),
  };
  if (ctxProvider) ctxProvider.resolveWebviewView(ctxView);
  ctxView.webview._onMsg({ cmd: 'ready' });
  await new Promise((r) => setTimeout(r, 300));
  const ctxData = [...ctxView.webview.got].reverse().find((m) => m.k === 'data')?.d;
  const mine = ctxData?.cards?.find((c) => c.own);
  // The status bar has to be captured now: further down the test resets the
  // conversation to test the history, and there it is right that it says nothing.
  const ctxStatus = statusBar?.text ?? '';

  // ---- history: listing, fishing back and resuming ----
  // `from` is not a detail: without it the wait immediately finds the old messages
  // and does not wait at all.
  const waitFor = async (pred, from, ms = 20000) => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      const hit = got.slice(from).filter(pred).pop();
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 150));
    }
    return undefined;
  };
  const beforeHist = got.length;
  onMsg({ cmd: 'history' });
  const hist = await waitFor((m) => m.k === 'history', beforeHist);
  const mark = got.length;
  if (hist?.items?.length) onMsg({ cmd: 'open', id: hist.items[0].id });
  await waitFor((m) => m.k === 'user', mark);
  const afterOpen = got.slice(mark);

  const kinds = got.map((m) => m.k);
  const fails = [...pageFails];
  const t = (c, m) => !c && fails.push(m);

  t(!!ctxProvider, 'the context panel is not registered');
  t(!!ctxData, 'the context panel receives no data');
  t(!!mine, 'the chat conversation does not show up in the context bar');
  t(
    mine?.id === sessionId,
    'the chat card is not matched to the real session: ' + mine?.id + ' instead of ' + sessionId
  );
  t(ctxData?.focusHow === 'studio', 'the match for our own chat goes through the heuristic: ' + ctxData?.focusHow);
  t(!!mine?.focused, 'the conversation the chat opened is not the one you are in');
  t(/\d/.test(mine?.tokens || ''), 'the chat card does not report the context: ' + mine?.tokens);
  t(/^\$/.test(mine?.cost || ''), 'the chat card does not report the cost: ' + mine?.cost);
  t(
    /studio-chat/.test(ctxStatus) && /ctx \d/.test(ctxStatus),
    'the status bar does not tell the story of the chat conversation: ' + ctxStatus
  );
  t(
    !/\$\((pulse|warning|error|comment-discussion|layers|dashboard|git-branch|circle-slash)\)/.test(ctxStatus),
    'the status bar uses the native icons instead of the Ionicons: ' + ctxStatus
  );

  t(kinds.includes('hello'), 'no hello');
  t(kinds.includes('session'), 'the session never started: ' + JSON.stringify(got.slice(0, 4)));
  t(kinds.filter((k) => k === 'delta').length >= 2, 'no streaming: ' + kinds.filter((k) => k === 'delta').length + ' deltas');
  t(kinds.includes('tool_start'), 'no tool started');
  t(kinds.includes('tool_end'), 'no tool result');
  t(kinds.includes('turn_end'), 'the turn never ended');
  t(!got.some((m) => m.k === 'error'), 'errors: ' + JSON.stringify(got.filter((m) => m.k === 'error')));

  const tools = got.filter((m) => m.k === 'tool_start');
  const ends = got.filter((m) => m.k === 'tool_end');
  t(
    ends.every((e) => tools.some((s) => s.id === e.id)),
    'a result does not match any tool_use_id'
  );
  // ---- permissions: inside the chat, not in a VS Code dialog ----
  t(asked.length === 0, 'the permission went through a modal dialog: ' + asked.join(' | '));
  t(answered.length > 0, 'the permission was never asked');
  const ask = answered[0] || {};
  t(!!ask.title, 'the permission request has no title to show');
  t(ask.kind === 'tool', 'unexpected request kind: ' + ask.kind);
  t(
    tools.some((s) => s.id === ask.id),
    'the permission request is not matched to any tool_use_id'
  );
  const dones = got.filter((m) => m.k === 'ask_done');
  t(
    answered.every((a) => dones.some((d) => d.id === a.id && d.ok)),
    'a request was left hanging with no outcome'
  );
  const bash = got.find((m) => m.k === 'tool_end' && m.id === ask.id);
  t(
    !!bash && bash.ok,
    'the tool did not run after consent — asked ' +
      JSON.stringify(answered.map((a) => [a.tool, a.id])) +
      ' results ' +
      JSON.stringify(ends.map((e) => [e.id, e.ok, String(e.text).slice(0, 160)]))
  );
  t(/42/.test((bash && bash.text) || ''), 'the allowed tool did not give the expected result');
  t(
    asksAfterRepeat === asksAfterAlways,
    '"Always allow" did not hold: the same command asked for permission again'
  );
  // the mode travels to every face
  t(got.some((m) => m.k === 'mode'), 'the permission mode never reached the webview');

  // ---- bridge with the editor ----
  const bridge = got.find((m) => m.k === 'tool_start' && /mcp__editor__/.test(m.name || ''));
  t(!!bridge, 'the bridge with the editor was never used: no mcp__editor__* tool');
  const bridgeOut = got.find((m) => m.k === 'tool_end' && m.id === bridge?.id);
  t(
    /fake error for the test/.test(bridgeOut?.text || ''),
    'the bridge did not report the editor diagnostics: ' + (bridgeOut?.text || '').slice(0, 120)
  );
  t(
    got.some((m) => m.k === 'commands' && (m.items || []).length > 0),
    'the slash commands never reached the webview'
  );

  // ---- history ----
  t(!!hist, 'the history never arrived');
  t(
    (hist?.items || []).some((i) => i.id === sessionId),
    'the conversation we just had does not show up in the history'
  );
  t(
    (hist?.items || []).every((i) => i.summary && typeof i.when === 'number'),
    'a history entry has no title or no date'
  );
  t(afterOpen.some((m) => m.k === 'reset'), 'opening a conversation did not clear the chat');
  t(
    afterOpen.some((m) => m.k === 'user' && /Read tool on package\.json/.test(m.text || '')),
    'the conversation fished back was not repainted: ' +
      JSON.stringify(afterOpen.filter((m) => m.k === 'user').map((m) => String(m.text).slice(0, 40)))
  );
  t(
    afterOpen.some((m) => m.k === 'tool_start') && afterOpen.some((m) => m.k === 'block_final'),
    'the fished-back conversation is missing the tools or the answers'
  );

  const text = got
    .filter((m) => m.k === 'block_final' && m.kind === 'text')
    .map((m) => m.text)
    .join(' ');
  t(/claude-studio/.test(text), 'the answer does not contain the value read from the file: ' + text.slice(0, 200));

  // ---- the tab ----
  t(!!panel, 'the tab did not open');
  const pg = panel ? panel.webview.got : [];
  t(panel?.type === 'claudeStudio.panel', 'wrong tab type: ' + panel?.type);
  t(panel?.opts?.retainContextWhenHidden === true, 'the tab loses its content when you hide it');
  t(!!panel?.iconPath, 'the tab has no icon');
  t(replay[0]?.k === 'hello' && replay[0]?.surface === 'panel', 'the tab does not recognise itself as a tab');
  t(replay.some((m) => m.k === 'user' && /Read tool on package\.json/.test(m.text)), 'the tab did not pick the history back up');
  t(
    replay.some((m) => m.k === 'block_final' && /claude-studio/.test(m.text || '')),
    'the tab did not pick the already-composed answer back up'
  );
  t(
    !replay.some((m) => m.k === 'delta'),
    'the tab picked the streaming fragments back up instead of the composed text — ids left: ' +
      JSON.stringify([...new Set(replay.filter((m) => m.k === 'delta').map((m) => m.id))])
  );
  const rStart = replay.filter((m) => m.k === 'tool_start');
  const rEnd = replay.filter((m) => m.k === 'tool_end');
  t(rStart.length > 0, 'the tab did not pick up any tool from the turn already gone by');
  t(
    rEnd.every((e) => rStart.some((s) => s.id === e.id)),
    'in the replay a result does not match any tool'
  );
  // and from here on the two faces see the same things
  const after = (arr) => arr.filter((m) => m.k === 'tool_start').length;
  t(after(pg) >= 1, 'the tab does not receive the new events');

  // ---- the context inside the tab ----
  // In the sidebar the context has its own panel; in a tab it does not, so the data
  // has to arrive here, otherwise the wide face is the only one that cannot see it.
  const railFrames = pg.filter((m) => m.k === 'ctx');
  t(railFrames.length > 0, 'the tab does not receive the context data');
  t(
    railFrames.some((m) => (m.d?.cards || []).some((c) => c.own)),
    'the chat conversation does not reach the column in the tab'
  );
  // One tab only: asking for it again brings it back to the front, it does not open a second one.
  t(
    registered.panels.length === 1,
    'more than one tab was opened: ' + registered.panels.length
  );

  for (const d of ctx.subscriptions) d.dispose?.();

  if (fails.length) {
    console.error('FAILED:\n- ' + fails.join('\n- '));
    process.exit(1);
  }
  console.log(
    'host-check ok — %d events, %d deltas, %d tools, %d permissions asked and granted from the chat',
    got.length,
    kinds.filter((k) => k === 'delta').length,
    tools.length,
    answered.length
  );
  process.exit(0);
})();
