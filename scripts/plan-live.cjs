// Plan mode on the real CLI: nobody gets asked anything, and at the end the plan is
// saved and named instead of being put to a vote.
//
// The real bundle, a fake `vscode`, and a project in a temporary folder — with
// `plansDirectory` pointing inside it, so the plan this writes does not land among
// yours. One turn in plan mode that reads a file, runs `ls` and writes a plan; then
// the same conversation reopened from its transcript, where the "Plan ready" card has
// to come back on its own.
//
// It spends: one short planning turn on the real model. Not in `verify` for that
// reason — run it when plan mode or the permission path changes:
//
//   npm run plan-live
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { uri, newRegistry, fakeWebview, makeVscode, install, memento } = require('./lib/fake-vscode.cjs');

const root = path.dirname(__dirname);
const verbose = process.argv.includes('--verbose');

// ---- the project ----
const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-planlive-'));
fs.writeFileSync(path.join(proj, 'README.md'), '# Tiny\n\nA tiny project with a single greeting function in src/hello.js.\n', 'utf8');
fs.mkdirSync(path.join(proj, 'src'));
fs.writeFileSync(path.join(proj, 'src', 'hello.js'), "module.exports = () => 'hello';\n", 'utf8');
fs.mkdirSync(path.join(proj, '.claude'));
fs.writeFileSync(path.join(proj, '.claude', 'settings.json'), JSON.stringify({ plansDirectory: '.plans' }), 'utf8');
const plans = path.join(proj, '.plans');

// ---- the extension ----
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
  if (verbose && m && m.k !== 'delta' && m.k !== 'ctx' && m.k !== 'tasks') {
    console.log('  ·', JSON.stringify(m).slice(0, 220));
  }
  // Nobody should be asked: if a card shows up anyway, it gets refused, so the turn
  // can still end and the failure is the card itself, not a hang.
  if (m && m.k === 'ask' && m.kind !== 'question') {
    setTimeout(() => send({ cmd: 'answer', id: m.id, choice: 'deny' }), 0);
  }
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

(async () => {
  send({ cmd: 'ready' });
  send({ cmd: 'setMode', value: 'plan' });
  send({
    cmd: 'send',
    text:
      'Read README.md and src/hello.js, and run `ls src` with the Bash tool. Then plan adding a ' +
      'function goodbye() next to hello. Keep the plan very short: three bullet points. ' +
      'Write it to the plan file and finish with ExitPlanMode.',
  });
  const ended = await wait(() => got.some((m) => m.k === 'turn_end'), 300000);
  // A moment for whatever trails the end of the turn.
  await new Promise((r) => setTimeout(r, 1500));
  check('the turn ends', ended);

  const asks = got.filter((m) => m.k === 'ask' && m.kind !== 'question');
  check('nobody is asked for a permission or a plan approval', asks.length === 0, asks.map((a) => `${a.kind}:${a.tool}`).join(', '));

  const tools = got.filter((m) => m.k === 'tool_start').map((m) => m.name);
  check('it read and listed on its own', tools.includes('Read') && (tools.includes('Bash') || tools.includes('PowerShell')), tools.join(', '));
  const bash = got.find((m) => m.k === 'tool_start' && (m.name === 'Bash' || m.name === 'PowerShell'));
  const bashEnd = bash && got.find((m) => m.k === 'tool_end' && m.id === bash.id);
  check('the ls ran (it was allowed, not refused)', !!bashEnd && bashEnd.ok, bashEnd ? bashEnd.text.slice(0, 160) : 'no result');

  const ready = got.find((m) => m.k === 'plan_ready');
  check('a plan_ready arrives', !!ready);
  if (ready) {
    check('…with the path of a file that exists', !!ready.path && fs.existsSync(ready.path), ready.path);
    check('…inside the plans folder of the settings', !!ready.path && path.resolve(ready.path).toLowerCase().startsWith(plans.toLowerCase()), ready.path);
    check('…named after the file', !!ready.name && path.basename(ready.path).startsWith(ready.name), `${ready.name} / ${ready.path}`);
    check('…with the plan text', typeof ready.plan === 'string' && ready.plan.trim().length > 20, String(ready.plan).slice(0, 80));
    const exit = got.find((m) => m.k === 'tool_start' && m.name === 'ExitPlanMode');
    check('…on the ExitPlanMode call', !!exit && exit.id === ready.id, `${exit && exit.id} vs ${ready.id}`);
  }

  const modes = got.filter((m) => m.k === 'mode').map((m) => m.value);
  check('the session stays in plan mode', modes.at(-1) === 'plan', modes.join(' → '));

  const end = got.filter((m) => m.k === 'turn_end').at(-1);
  const errors = got.filter((m) => m.k === 'error').map((m) => m.message);
  console.log(`    turn_end ok=${end && end.ok}, errors: ${errors.length ? errors.join(' | ').slice(0, 300) : 'none'}`);
  check('the turn ends clean (no error card)', errors.length === 0, errors.join(' | ').slice(0, 300));

  // ---- the same conversation, reopened from its transcript ----
  const sid = got.filter((m) => m.k === 'session').at(-1)?.id;
  if (sid && ready) {
    const mark = got.length;
    send({ cmd: 'open', id: sid });
    await wait(() => got.slice(mark).some((m) => m.k === 'plan_ready'), 15000);
    const again = got.slice(mark).find((m) => m.k === 'plan_ready');
    check('reopened from the history, the "Plan ready" card comes back', !!again && again.path === ready.path, again ? again.path : 'missing');
    const replayed = got.slice(mark);
    if (verbose) for (const m of replayed) console.log('  ↺', JSON.stringify(m).slice(0, 200));
  } else {
    check('reopened from the history, the "Plan ready" card comes back', false, 'no session or no plan to reopen');
  }

  for (const d of ctx.subscriptions) d.dispose?.();
  // The project and the transcripts the CLI kept for it: a test folder must not leave
  // a conversation behind in ~/.claude/projects every time it runs.
  for (const dir of [proj, path.join(os.homedir(), '.claude', 'projects', proj.replace(/[^a-zA-Z0-9]/g, '-'))]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* a temporary folder */
    }
  }
  if (bad) {
    console.error(`\nplan-live: ${bad} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nplan-live ok — no permission asked, the plan saved and named, the card back from the history.');
  process.exit(0);
})();
