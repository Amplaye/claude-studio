// The project's memory on the real CLI: the model searches it on its own, nobody is
// asked, and the automatic recall puts the right note next to a message.
//
// A project in a temporary folder whose memory lives next to it
// (`autoMemoryDirectory` in its local settings), with one note the index does not
// name — so the only way to it is a search. Three turns:
//   1. "what do we know about X?" with the recall off, in "ask" mode: the search has
//      to start with no permission card and with no ToolSearch before it;
//   2. the same topic with the recall on: the note arrives on its own ("recalled");
//   3. plan mode: the memory still goes through, no card.
//
// It spends: three short turns. Not in `verify` — run it when the memory, the hook or
// the permission path change:
//
//   npm run memory-live
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { uri, newRegistry, fakeWebview, makeVscode, install, memento } = require('./lib/fake-vscode.cjs');

const root = path.dirname(__dirname);
const verbose = process.argv.includes('--verbose');

const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-memlive-'));
const mem = path.join(proj, 'memoria');
fs.mkdirSync(mem);
fs.mkdirSync(path.join(proj, '.claude'));
fs.writeFileSync(path.join(proj, '.claude', 'settings.local.json'), JSON.stringify({ autoMemoryDirectory: mem }), 'utf8');
fs.writeFileSync(path.join(proj, 'README.md'), '# Prova\n\nUn progetto di prova.\n', 'utf8');
fs.writeFileSync(path.join(mem, 'MEMORY.md'), '# Memory index\n\n- [Deploy](deploy-venerdi.md) — mai di venerdi\n', 'utf8');
fs.writeFileSync(
  path.join(mem, 'deploy-venerdi.md'),
  '---\nname: Deploy\ndescription: mai di venerdi\nmetadata:\n  type: feedback\n  modified: 2026-09-01T10:00:00Z\n---\n\nNiente deploy il venerdi.\n',
  'utf8'
);
fs.writeFileSync(
  path.join(mem, 'protocollo-zebra.md'),
  '---\nname: Protocollo Zebra\ndescription: il protocollo Zebra della cucina si attiva solo il martedi, con la cassaforte blu\n' +
    'metadata:\n  type: project\n  modified: 2026-09-20T10:00:00Z\n---\n\n' +
    'Il protocollo Zebra: il martedi la cucina chiude alle 15 e il fondo cassa va nella cassaforte blu.\n',
  'utf8'
);

const registered = newRegistry();
const vscode = makeVscode({ workspaceRoot: proj, registered });
vscode.commands.executeCommand = async () => undefined;
install(vscode);
const ext = require(path.join(root, 'dist', 'extension.js'));
const ctx = {
  extensionUri: uri(root),
  extensionPath: root,
  subscriptions: [],
  globalState: memento(),
  workspaceState: memento(),
};
ext.activate(ctx);
const view = {
  webview: fakeWebview(),
  visible: true,
  onDidChangeVisibility: () => ({ dispose() {} }),
  onDidDispose: () => ({ dispose() {} }),
};
registered.provider.resolveWebviewView(view);
const got = view.webview.got;
const send = (m) => view.webview._onMsg(m);
const rawPost = view.webview.postMessage;
view.webview.postMessage = async (m) => {
  if (verbose && m && !['delta', 'ctx', 'tasks', 'busy', 'commands', 'models'].includes(m.k)) {
    console.log('  ·', JSON.stringify(m).slice(0, 200));
  }
  // Nobody should be asked: a card that shows up anyway gets refused, so the turn ends
  // and the failure is the card itself, not a hang.
  if (m && m.k === 'ask' && m.kind !== 'question') setTimeout(() => send({ cmd: 'answer', id: m.id, choice: 'deny' }), 0);
  return rawPost(m);
};

let bad = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${!ok && detail ? ' — ' + detail : ''}`);
  if (!ok) bad++;
};
const wait = async (cond, ms) => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline && !cond()) await new Promise((r) => setTimeout(r, 250));
  return cond();
};
const turn = async (text) => {
  const mark = got.length;
  const before = got.filter((m) => m.k === 'turn_end').length;
  send({ cmd: 'send', text });
  await wait(() => got.filter((m) => m.k === 'turn_end').length > before, 300000);
  await new Promise((r) => setTimeout(r, 800));
  return got.slice(mark);
};

(async () => {
  send({ cmd: 'ready' });
  send({ cmd: 'setMode', value: 'default' });
  // The model Studio itself would pick (the CLI's recommended one), not whatever the
  // CLI settings of this machine default to: that is the model the panel talks to.
  send({ cmd: 'setPrefs', value: { memoryRecall: false, model: 'default' } });

  // ---- 1. a search, on its own, with nobody asked ----
  const t1 = await turn('Cosa sappiamo del protocollo Zebra? Rispondi in una riga.');
  const tools1 = t1.filter((m) => m.k === 'tool_start').map((m) => m.name);
  const firstMem = tools1.findIndex((n) => /^mcp__memoria__/.test(n));
  check('the model searches the memory', tools1.includes('mcp__memoria__memory_search'), tools1.join(', '));
  check('…with no ToolSearch before it (the tools are always loaded)', firstMem >= 0 && !tools1.slice(0, firstMem).includes('ToolSearch'), tools1.join(', '));
  const asks1 = t1.filter((m) => m.k === 'ask' && m.kind !== 'question');
  check('…and no permission card', asks1.length === 0, asks1.map((a) => a.tool).join(', '));
  const search1 = t1.find((m) => m.k === 'tool_start' && m.name === 'mcp__memoria__memory_search');
  const res1 = search1 && t1.find((m) => m.k === 'tool_end' && m.id === search1.id);
  check('…and it finds the note the index does not name', !!res1 && res1.ok && /protocollo-zebra/.test(res1.text), res1 ? res1.text.slice(0, 200) : 'no result');
  const answer1 = t1.filter((m) => m.k === 'block_final' && m.kind === 'text').map((m) => m.text).join(' ');
  check('…and answers with it', /marted/i.test(answer1), answer1.slice(0, 200));
  check('the recall stays quiet while it is off', !t1.some((m) => m.k === 'recalled'));

  // ---- 2. the recall, on ----
  send({ cmd: 'setPrefs', value: { memoryRecall: true } });
  const t2 = await turn('Ricordami in breve come funziona il protocollo Zebra della cucina.');
  const rec = t2.find((m) => m.k === 'recalled');
  check('with the recall on, the note comes along with the message', !!rec && rec.notes.some((n) => n.slug === 'protocollo-zebra'), JSON.stringify(rec));
  check('…as name, date and file only', !!rec && rec.notes.every((n) => Object.keys(n).sort().join(',') === 'date,file,name,slug'), JSON.stringify(rec));
  const short = await turn('ok');
  check('…and not for a two-letter message', !short.some((m) => m.k === 'recalled'));

  // ---- 3. plan mode: the memory still goes through ----
  send({ cmd: 'setMode', value: 'plan' });
  const t3 = await turn('Usa memory_search per cercare "deploy venerdi" nella memoria, poi dimmi in una riga cosa dice. Non scrivere nessun piano.');
  const tools3 = t3.filter((m) => m.k === 'tool_start').map((m) => m.name);
  check('in plan mode the search goes through too', tools3.some((n) => /^mcp__memoria__/.test(n)), tools3.join(', '));
  check('…with no card', !t3.some((m) => m.k === 'ask' && m.kind !== 'question'));

  const errors = got.filter((m) => m.k === 'error').map((m) => m.message);
  check('no error along the way', errors.length === 0, errors.join(' | ').slice(0, 300));

  for (const d of ctx.subscriptions) d.dispose?.();
  for (const dir of [proj, path.join(os.homedir(), '.claude', 'projects', proj.replace(/[^a-zA-Z0-9]/g, '-'))]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* a temporary folder */
    }
  }
  if (bad) {
    console.error(`\nmemory-live: ${bad} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nmemory-live ok — searched on its own with nobody asked, recalled with the switch on, and plan mode lets it through.');
  process.exit(0);
})();
