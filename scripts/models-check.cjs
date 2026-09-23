// The model cards say what the CLI installed *now* offers — not what the last one did.
//
// On 23/09 the CLI updated itself to the version where "opus" is Opus 5.5, and the
// cards went on saying "Opus 5" until the first message: the list shown before that
// was the one kept aside from the previous CLI. The engine was already on 5.5; the
// panel was telling you otherwise.
//
// Real bundle (dist/extension.js), fake `vscode`, real CLI. The CLI is only asked for
// its list — the handshake, no message — so this costs nothing and writes no
// conversation, and that is checked too.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { uri, newRegistry, fakeWebview, makeVscode, install, memento } = require('./lib/fake-vscode.cjs');

const root = path.dirname(__dirname);
const fails = [];
const t = (cond, msg) => !cond && fails.push(msg);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const registered = newRegistry();
install(makeVscode({ workspaceRoot: root, registered }));
const ext = require(path.join(root, 'dist', 'extension.js'));

// What the machine had on 23/09, with made-up names so it can never be mistaken for
// a real answer: a list kept aside, said by a CLI older than the installed one.
const STALE = 'claude-opus-0-1[1m]';
const ctx = {
  extensionUri: uri(root),
  extensionPath: root,
  subscriptions: [],
  globalState: memento(
    new Map([
      [
        'claudeStudio.models',
        [
          {
            value: 'opus[1m]',
            label: 'Opus (1M context)',
            description: 'Opus 0.1 with 1M context · Best for everyday, complex tasks',
            resolved: STALE,
            efforts: ['low', 'medium', 'high'],
            adaptive: true,
            recommended: false,
          },
        ],
      ],
      ['claudeStudio.models.cli', '0.0.1'],
    ])
  ),
  workspaceState: memento(),
};

// Where the CLI would write a conversation for this folder, had one started.
const transcripts = path.join(os.homedir(), '.claude', 'projects', root.replace(/[^a-zA-Z0-9]/g, '-'));
const written = (since) => {
  try {
    return fs
      .readdirSync(transcripts)
      .filter((f) => f.endsWith('.jsonl') && fs.statSync(path.join(transcripts, f)).mtimeMs >= since);
  } catch {
    return [];
  }
};

(async () => {
  const start = Date.now();
  ext.activate(ctx);
  const view = {
    webview: fakeWebview(),
    visible: true,
    onDidChangeVisibility: () => ({ dispose() {} }),
    onDidDispose: () => ({ dispose() {} }),
  };
  registered.provider.resolveWebviewView(view);
  const got = view.webview.got;
  const waitFor = async (pred, from, ms) => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      const hit = got.slice(from).filter(pred).pop();
      if (hit) return hit;
      await sleep(150);
    }
    return undefined;
  };
  const stale = (m) => m.k === 'models' && m.items.some((i) => i.resolved === STALE);

  view.webview._onMsg({ cmd: 'ready' });
  await sleep(150);
  const hello = got.find((m) => m.k === 'hello');
  if (!hello?.cliVersion) {
    console.error('FAILED: no claude CLI on this machine — this check asks the installed one');
    process.exit(1);
  }
  t(!got.some(stale), 'the list said by an older CLI still reaches the cards');

  // What the page sends when the settings open (webview/chat.js, toggleCfg).
  const mark = got.length;
  view.webview._onMsg({ cmd: 'models' });
  const fresh = await waitFor((m) => m.k === 'models' && m.items.length, mark, 30000);
  t(!!fresh, 'opening the settings got no list of models from the CLI');
  if (fresh) {
    t(!stale(fresh), 'the list that arrived is still the old one');
    t(
      fresh.items.some((i) => /opus/i.test(i.value + i.resolved) && /\d/.test(i.resolved)),
      'no Opus with a real model behind it in the list: ' + fresh.items.map((i) => i.value).join(', ')
    );
    t(
      ctx.globalState.get('claudeStudio.models.cli') === hello.cliVersion,
      'the list kept aside is not tied to the CLI that said it: ' +
        ctx.globalState.get('claudeStudio.models.cli') + ' instead of ' + hello.cliVersion
    );
  }

  // A tab opened now finds the right list already there, without asking again.
  await registered.commands.get('claudeStudio.openNewTab')();
  const tab = registered.panels.at(-1);
  tab.webview._onMsg({ cmd: 'ready' });
  await sleep(150);
  const shown = tab.webview.got.find((m) => m.k === 'models');
  t(
    !!fresh && shown?.items?.length === fresh.items.length && !stale(shown),
    'a new tab does not show the list said by the CLI installed now'
  );

  // Asking for the list is a handshake, not a conversation.
  const files = written(start);
  t(!files.length, 'asking for the models started a conversation: ' + files.join(', '));

  for (const d of ctx.subscriptions) d.dispose?.();

  if (fails.length) {
    console.error('FAILED:\n- ' + fails.join('\n- '));
    process.exit(1);
  }
  const opus = fresh.items.find((i) => /opus/i.test(i.value));
  console.log(
    `models-check ok — CLI ${hello.cliVersion}: the old list never shows, ` +
      `${opus?.value} → ${opus?.resolved} arrives in ${Date.now() - start} ms, no conversation`
  );
  process.exit(0);
})();
