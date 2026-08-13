// Several conversations open at once: names, "you are here", and going back.
//
// host-check drives one real conversation through the CLI, which is slow and needs
// an account. This one asks a cheaper question that had been getting the wrong
// answer for a long time: with three Studio tabs open, does the extension know
// there are three? It used to track only the first — the context panel drew one
// card, the "here" badge never moved, and the tokens you were spending in the other
// two belonged to nobody.
//
// Everything here happens against the real bundle (dist/extension.js) with a fake
// `vscode` and a fake engine: the conversations are simulated by sending the
// chat's own wire events back through the webview, which is exactly what the
// context bar listens to.
const path = require('node:path');
const { uri, newRegistry, fakeWebview, fakePanel, makeVscode, install, memento } = require('./lib/fake-vscode.cjs');

const root = path.dirname(__dirname);
const fails = [];
const t = (cond, msg) => !cond && fails.push(msg);

// ---- the fake `vscode` -------------------------------------------------------
// The shared surface lives in lib/fake-vscode.cjs; here only the rename dialog,
// whose question and answer this check reads back.
const registered = newRegistry();
const vscode = makeVscode({ workspaceRoot: root, registered });

const inputs = []; // what showInputBox was asked, and what it answers
let inputAnswer;

vscode.window.showInputBox = async (opts) => {
  inputs.push(opts);
  return inputAnswer;
};
// Revealing a tab is also what brings it to the front here.
const rawPanel = vscode.window.createWebviewPanel;
vscode.window.createWebviewPanel = (type, title) => {
  const panel = rawPanel(type, title);
  panel.active = false;
  const reveal = panel.reveal;
  panel.reveal = () => {
    reveal();
    panel.setActive(true);
  };
  return panel;
};

install(vscode);

const ext = require(path.join(root, 'dist', 'extension.js'));

const ctx = {
  extensionUri: uri(root),
  extensionPath: root,
  subscriptions: [],
  globalState: memento(),
  workspaceState: memento(),
};

(async () => {
  ext.activate(ctx);

  t(registered.commands.has('claudeStudio.rename'), 'the rename command is not registered');
  t(
    registered.commands.has('claudeStudio.openConversation'),
    'the "open this conversation" command is not registered'
  );

  // ---- two tabs, two conversations ----
  await registered.commands.get('claudeStudio.openTab')();
  await registered.commands.get('claudeStudio.openNewTab')();
  t(registered.panels.length === 2, 'two tabs did not open: ' + registered.panels.length);
  const [tabA, tabB] = registered.panels;
  t(
    !/#\d/.test(tabB.title),
    'the second tab is still numbered instead of named: ' + tabB.title
  );

  tabA.webview._onMsg({ cmd: 'ready' });
  tabB.webview._onMsg({ cmd: 'ready' });

  // Each tab picks up a conversation of its own. This is the road the history drawer
  // takes, and the point of the whole exercise: the id is known the moment you click,
  // without waiting for the engine to start at the next message.
  const ID_A = 'aaaaaaaa-1111-2222-3333-444444444444';
  const ID_B = 'bbbbbbbb-1111-2222-3333-444444444444';
  tabA.webview._onMsg({ cmd: 'open', id: ID_A });
  tabB.webview._onMsg({ cmd: 'open', id: ID_B });
  await new Promise((r) => setTimeout(r, 200));

  const cards = () => {
    registered.commands.get('claudeStudio.context.refresh')();
    const frames = [...tabA.webview.got, ...tabB.webview.got].filter((m) => m.k === 'ctx');
    return frames.length ? frames[frames.length - 1].d.cards : [];
  };
  const ours = () => cards().filter((c) => c.own);

  const mine = ours();
  t(mine.length === 2, 'the context panel does not see both conversations: ' + mine.length);
  t(
    mine.some((c) => c.id === ID_A) && mine.some((c) => c.id === ID_B),
    'the two conversations are not both there: ' + mine.map((c) => c.shortId).join(' | ')
  );

  // ---- "you are here" follows the tab you bring to the front ----
  tabB.setActive(false);
  tabA.setActive(true);
  await new Promise((r) => setTimeout(r, 120));
  const onA = ours().find((c) => c.focused);
  t(onA?.id === ID_A, 'the badge did not follow the tab in front: ' + onA?.shortId);

  tabA.setActive(false);
  tabB.setActive(true);
  await new Promise((r) => setTimeout(r, 120));
  const onB = ours().find((c) => c.focused);
  t(onB?.id === ID_B, 'the badge is stuck on the first conversation: ' + onB?.shortId);

  // ---- clicking a card lands on the tab that holds it ----
  // Not "on Studio": with three tabs open that was the first one, which is almost
  // never the one you clicked.
  const before = tabA.revealed;
  await vscode.commands.executeCommand('claudeStudio.openConversation', ID_A);
  t(tabA.revealed > before, 'clicking the card did not bring its own tab to the front');

  // ---- a card nobody holds opens a tab of its own ----
  // Prima finiva nella chat della sidebar, o dentro la scheda principale sopra la
  // conversazione che stavi guardando: in un caso non la vedevi, nell'altro perdevi
  // quella di prima. Una conversazione che apri e' una scheda.
  const tabs = registered.panels.length;
  await vscode.commands.executeCommand(
    'claudeStudio.openConversation',
    'cccccccc-1111-2222-3333-444444444444'
  );
  t(
    registered.panels.length === tabs + 1,
    'clicking a card of a conversation with no tab did not open one: ' +
      `${registered.panels.length} vs ${tabs}`
  );

  // ---- rename asks about the conversation you are in ----
  // Cancelled on purpose (showInputBox answers undefined): the test must not leave
  // names behind on the disk.
  tabA.setActive(false);
  tabB.setActive(true);
  inputs.length = 0;
  inputAnswer = undefined;
  await registered.commands.get('claudeStudio.rename')();
  t(inputs.length === 1, 'rename did not ask anything: ' + inputs.length);

  for (const d of ctx.subscriptions) d.dispose?.();

  if (fails.length) {
    console.error('FAILED:\n- ' + fails.join('\n- '));
    process.exit(1);
  }
  console.log('sessions-check ok — two conversations, two names, the badge follows the tab');
  process.exit(0);
})();
