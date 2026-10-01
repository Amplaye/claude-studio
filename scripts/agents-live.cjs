// Chi lavora per chi, sulla CLI vera: i sub-agent arrivano come aiutanti, ognuno con
// la chiamata che l'ha lanciato e il suo livello, e il piano non si tocca.
//
// Un progetto in una cartella temporanea, con due file .ts e un README. Due turni:
//   1. due sub-agent Explore in primo piano: devono arrivare in `agents` (mai fra i
//      passi), con `toolUseId` e `depth`, e finire spuntati;
//   2. un sub-agent che ne lancia un altro: se la CLI lo fa, il nipote deve avere il
//      livello che dice lei e il genitore giusto. Se non lo fa, si dice e basta —
//      l'albero e' provato comunque da tasks-check, sullo store da solo.
//
// Spende: due turni con dei sub-agent. Fuori da `verify` — si lancia quando cambiano
// il filo delle task, lo store o l'albero:
//
//   npm run agents-live
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { uri, newRegistry, makeVscode, install, memento } = require('./lib/fake-vscode.cjs');

const root = path.dirname(__dirname);
const verbose = process.argv.includes('--verbose');

const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-agentslive-'));
fs.mkdirSync(path.join(proj, 'src'));
fs.writeFileSync(path.join(proj, 'README.md'), '# Prova\n\nUn progetto di prova.\nTre righe e un titolo.\n', 'utf8');
fs.writeFileSync(path.join(proj, 'src', 'a.ts'), 'export const a = 1;\n', 'utf8');
fs.writeFileSync(path.join(proj, 'src', 'b.ts'), 'export const b = 2;\n', 'utf8');

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
// Una scheda, non la chat della barra laterale: il quadro delle task lo riceve solo
// chi lo disegna — la colonna del contesto sta nelle schede.
let view;
const got = [];
const send = (m) => view.webview._onMsg(m);

/** Quello che non cambia niente passa; il resto no — e' una cartella di prova, ma la regola e' quella. */
const READONLY = /^(Read|Glob|Grep|LS|Agent|Task|ToolSearch|mcp__editor__.*|mcp__memoria__.*)$/;
function listen() {
  const rawPost = view.webview.postMessage;
  view.webview.postMessage = async (m) => {
    got.push(m);
    if (verbose && m && !['delta', 'ctx', 'tasks', 'busy', 'commands', 'models'].includes(m.k)) {
      console.log('  ·', JSON.stringify(m).slice(0, 220));
    }
    if (m && m.k === 'ask' && m.kind !== 'question') {
      setTimeout(() => send({ cmd: 'answer', id: m.id, choice: READONLY.test(m.tool) ? 'allow' : 'deny' }), 0);
    }
    return rawPost(m);
  };
}

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
  await wait(() => got.filter((m) => m.k === 'turn_end').length > before, 360000);
  // Gli aiutanti possono chiudersi un attimo dopo il turno: si aspetta che lo dicano.
  await wait(() => {
    const b = board(got.slice(mark));
    return (b?.agents ?? []).length > 0 && b.agents.every((a) => a.status !== 'in_progress');
  }, 30000);
  await new Promise((r) => setTimeout(r, 800));
  return got.slice(mark);
};
/** L'ultimo quadro di questa conversazione (ce n'e' una sola). */
const board = (frames) => {
  const all = frames.filter((m) => m && m.k === 'tasks').map((m) => Object.values(m.d || {})[0]).filter(Boolean);
  return all[all.length - 1] ?? null;
};
const crew = (b) =>
  (b?.agents ?? []).map((a) => `${a.title}[${a.type || '?'}] ${a.parentId ? '<' + a.parentId.slice(0, 6) + '> ' : ''}d${a.depth}:${a.status}`).join(' | ') ||
  '(nessuno)';

(async () => {
  await registered.commands.get('claudeStudio.openTab')();
  view = registered.panels[0];
  listen();
  send({ cmd: 'ready' });
  send({ cmd: 'setMode', value: 'default' });
  // Il modello che Studio sceglierebbe da se', non quello dei settings di questa
  // macchina (haiku): e' con quello che parla il pannello.
  send({ cmd: 'setPrefs', value: { memoryRecall: false, model: 'default' } });

  // ---- 1. due aiutanti, in primo piano ----
  const t1 = await turn(
    'Usa lo strumento Agent per lanciare DUE sub-agent di tipo Explore, insieme e in primo piano ' +
      '(run_in_background: false): il primo conta i file .ts sotto src/, il secondo dice quante righe ha README.md. ' +
      'Poi riporta i due numeri in una riga. Non modificare nessun file.'
  );
  const b1 = board(t1);
  console.log('  turno 1, gli aiutanti: ' + crew(b1));
  const started1 = t1.filter((m) => m.k === 'task' && m.status === 'running');
  check('the CLI said the helpers were born', started1.length >= 2, String(started1.length));
  check('…and they reached the panel as helpers', (b1?.agents ?? []).length >= 2, crew(b1));
  check(
    '…each with the call that launched it and its level',
    (b1?.agents ?? []).length > 0 && b1.agents.every((a) => a.toolUseId && a.depth >= 1),
    JSON.stringify(b1?.agents)
  );
  check(
    '…launched by the conversation itself',
    (b1?.agents ?? []).every((a) => a.parentId === null && a.depth === 1),
    crew(b1)
  );
  check('…and ticked off when done', (b1?.agents ?? []).some((a) => a.status === 'completed'), crew(b1));
  // Mai fra i passi: i passi sono il piano, e un sub-agent non e' un passo.
  const ids = new Set(started1.map((m) => m.id));
  const mixed = t1
    .filter((m) => m.k === 'tasks')
    .some((m) => Object.values(m.d || {}).some((d) => (d.items || []).some((i) => ids.has(i.id))));
  check('…and never among the plan steps', !mixed);
  const asks1 = t1.filter((m) => m.k === 'ask' && m.kind !== 'question');
  if (asks1.length) console.log('  (schede di permesso nel turno 1: ' + asks1.map((a) => a.tool).join(', ') + ')');

  // ---- 2. un aiutante che ne lancia un altro ----
  const t2 = await turn(
    'Usa lo strumento Agent per lanciare UN sub-agent general-purpose in primo piano (run_in_background: false) ' +
      'con questo compito: "usa a tua volta lo strumento Agent per lanciare un sub-agent Explore che conti i file .ts ' +
      'sotto src/, poi riporta il numero". Tu riporta il numero in una riga. Non modificare nessun file.'
  );
  const b2 = board(t2);
  console.log('  turno 2, gli aiutanti: ' + crew(b2));
  const nested = t2.filter((m) => m.k === 'task' && typeof m.depth === 'number' && m.depth >= 2);
  if (!nested.length) {
    console.log('  (la CLI non ha lanciato aiutanti annidati: l’albero e’ provato da tasks-check sullo store)');
  } else {
    for (const n of nested) {
      const a = (b2?.agents ?? []).find((x) => x.id === n.id);
      check(
        'a helper launched by a helper hangs under it (CLI level ' + n.depth + ')',
        !!a && a.depth === n.depth && !!a.parentId && b2.agents.some((p) => p.id === a.parentId),
        crew(b2)
      );
    }
  }

  const errors = got.filter((m) => m.k === 'error').map((m) => m.message);
  check('no error along the way', errors.length === 0, errors.join(' | ').slice(0, 300));

  for (const d of ctx.subscriptions) d.dispose?.();
  for (const dir of [proj, path.join(os.homedir(), '.claude', 'projects', proj.replace(/[^a-zA-Z0-9]/g, '-'))]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* una cartella temporanea */
    }
  }
  if (bad) {
    console.error(`\nagents-live: ${bad} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nagents-live ok — the helpers arrive apart from the plan, with their call and their level.');
  process.exit(0);
})();
