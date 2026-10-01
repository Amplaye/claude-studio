// The steps Claude is working through actually reach the panel.
//
// The panel used to listen for TodoWrite, one call carrying the whole list. The CLI
// does not have that tool any more: it writes one task at a time with TaskCreate and
// moves it with TaskUpdate, and the number it goes under ("#2") is not in the call that
// creates it — it comes back in the tool's answer. So for months the section sat on
// "Working out what to do…" while Claude was writing its steps down all along.
//
// Both dialects are checked here, over the real bundle: a transcript is written the way
// the CLI writes one, the conversation is reopened, and what the panel is handed has to
// be the list — in order, with the right one in progress and the right ones ticked off.
//
// Real bundle (dist/extension.js), fake `vscode`, fake home folder: no CLI, no network.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { uri, newRegistry, fakeWebview, fakePanel, makeVscode, install, memento } = require('./lib/fake-vscode.cjs');

// `--live` runs the same check against the real CLI instead of a written transcript:
// a prompt goes out, Claude writes its own list, and the panel has to receive it. It
// costs a call and needs your login, so it stays out of `npm run ui-check` — but it is
// the only thing that proves the whole chain, and a replayed transcript never can.
const LIVE = process.argv.includes('--live');

const root = path.dirname(__dirname);
// Live needs your real home: that's where the login is. Offline moves it, so the
// transcripts the test writes are the only ones the extension can find.
//
// Through realpath, and it matters on macOS: the temp folder lives under /var, which
// is a symlink to /private/var. A conversation is filed under the folder it belongs
// to, spelled out — so the test would write to one name and the SDK look under the
// other, find nothing, and report the panel as broken when it was fine.
const home = LIVE
  ? os.homedir()
  : fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'claude-studio-tasks-')));
const work = LIVE ? root : path.join(home, 'project');
if (!LIVE) {
  fs.mkdirSync(work, { recursive: true });
  process.env.USERPROFILE = home;
  process.env.HOME = home;
  if (os.homedir() !== home) {
    console.error('FAILED: cannot move the home folder for the test');
    process.exit(1);
  }
  process.on('exit', () => {
    try {
      fs.rmSync(home, { recursive: true, force: true });
    } catch {
      /* the system will clean it up */
    }
  });
}

/** Gli strumenti che non cambiano niente: nel test dal vivo passano, gli altri no. */
const READONLY = new Set([
  'Read',
  'Glob',
  'Grep',
  'LS',
  'NotebookRead',
  'Task',
  'mcp__editor__plan',
  'mcp__editor__open_files',
  'mcp__editor__editor_errors',
]);

const fails = [];
const t = (cond, msg) => !cond && fails.push(msg);

// ---- two transcripts, one per dialect ---------------------------------------
const ID_TASK = 'aaaaaaaa-2222-4222-8333-444444444444';
const ID_TODO = 'bbbbbbbb-2222-4222-8333-444444444444';
const ID_EARLY = 'dddddddd-2222-4222-8333-444444444444';
const ID_LIST = 'eeeeeeee-2222-4222-8333-444444444444';
const ID_PLAN = 'ffffffff-2222-4222-8333-444444444444';

const projects = path.join(home, '.claude', 'projects', work.replace(/[^a-zA-Z0-9]/g, '-'));
if (!LIVE) fs.mkdirSync(projects, { recursive: true });

let uuidSeq = 0;
const uuidFor = () => `cccccccc-2222-4222-8333-${String(++uuidSeq).padStart(12, '0')}`;

/** Writes a transcript from a list of {role, content} the way the CLI lays one out. */
function writeTranscript(id, turns) {
  if (LIVE) return; // the real home is not a scratch pad
  const common = {
    isSidechain: false,
    userType: 'external',
    cwd: work,
    sessionId: id,
    version: '2.0.0',
    gitBranch: '',
    timestamp: new Date().toISOString(),
  };
  let parent = null;
  const rows = turns.map((turn) => {
    const uuid = uuidFor();
    const row = {
      ...common,
      parentUuid: parent,
      type: turn.type,
      uuid,
      message:
        turn.type === 'user'
          ? { role: 'user', content: turn.content }
          : {
              role: 'assistant',
              model: 'claude-sonnet-4-5',
              content: turn.content,
              usage: { input_tokens: 10, output_tokens: 5 },
            },
    };
    parent = uuid;
    return row;
  });
  fs.writeFileSync(
    path.join(projects, id + '.jsonl'),
    rows.map((r) => JSON.stringify(r)).join('\n') + '\n',
    'utf8'
  );
}

const call = (id, name, input) => ({ type: 'tool_use', id, name, input });
const answer = (id, text) => ({ type: 'tool_result', tool_use_id: id, content: text });

// Three tasks created one by one, then the first taken through in_progress to done and
// the second started — exactly the shape the CLI produces.
writeTranscript(ID_TASK, [
  { type: 'user', content: 'rename the column and fix the call sites' },
  {
    type: 'assistant',
    content: [
      call('t1', 'TaskCreate', {
        subject: 'Rename the column',
        description: 'in the schema',
        activeForm: 'Renaming the column',
      }),
      call('t2', 'TaskCreate', { subject: 'Update the three call sites', description: '...' }),
      call('t3', 'TaskCreate', { subject: 'Run the tests', description: '...' }),
    ],
  },
  {
    type: 'user',
    content: [
      answer('t1', 'Task #1 created successfully: Rename the column'),
      answer('t2', 'Task #2 created successfully: Update the three call sites'),
      answer('t3', 'Task #3 created successfully: Run the tests'),
    ],
  },
  { type: 'assistant', content: [call('u1', 'TaskUpdate', { taskId: '1', status: 'in_progress' })] },
  { type: 'user', content: [answer('u1', 'Updated task #1 status')] },
  { type: 'assistant', content: [call('u2', 'TaskUpdate', { taskId: '1', status: 'completed' })] },
  { type: 'user', content: [answer('u2', 'Updated task #1 status')] },
  { type: 'assistant', content: [call('u3', 'TaskUpdate', { taskId: '2', status: 'in_progress' })] },
  { type: 'user', content: [answer('u3', 'Updated task #2 status')] },
  { type: 'assistant', content: [{ type: 'text', text: 'Renamed it.' }] },
]);

// Two tasks created and one of them started inside the *same* assistant message, which
// is what the CLI does whenever it knows its first step before it has finished writing
// the list down. The three answers only arrive afterwards, together — so for the length
// of that message the tasks had no number yet, and a TaskUpdate that names one found
// nobody home and was dropped without a word. The step stayed drawn as "to do" while
// Claude was working on it, and nothing on screen said why.
writeTranscript(ID_EARLY, [
  { type: 'user', content: 'start on it while you write the list' },
  {
    type: 'assistant',
    content: [
      call('e1', 'TaskCreate', {
        subject: 'Read the file',
        description: '...',
        activeForm: 'Reading the file',
      }),
      call('e2', 'TaskCreate', { subject: 'Write the patch', description: '...' }),
      call('e3', 'TaskUpdate', { taskId: '1', status: 'in_progress' }),
    ],
  },
  {
    type: 'user',
    content: [
      answer('e1', 'Task #1 created successfully: Read the file'),
      answer('e2', 'Task #2 created successfully: Write the patch'),
      answer('e3', 'Updated task #1 status'),
    ],
  },
]);

// TaskList: the one call where the CLI says all the tasks at once. Here it contradicts
// what watching the calls go by would have built — a task nobody saw being created, and
// one already ticked off — and the answer it gives is the one that has to win.
writeTranscript(ID_LIST, [
  { type: 'user', content: 'where were we?' },
  { type: 'assistant', content: [call('l0', 'TaskUpdate', { taskId: '7', status: 'completed' })] },
  { type: 'user', content: [answer('l0', 'Updated task #7 status')] },
  { type: 'assistant', content: [call('l1', 'TaskList', {})] },
  {
    type: 'user',
    content: [
      answer(
        'l1',
        '#6 [completed] Move the parser out\n#7 [in_progress] Rename the column\n#8 [pending] Run the tests'
      ),
    ],
  },
]);

// Il piano che l'estensione si e' data da sola.
//
// La CLI di oggi non ha piu' uno strumento per scrivere una lista di passi: le sue
// task sono i sub-agent, e un turno normale non ne apre nessuno, quindi il pannello
// restava con la riga di "cosa sta facendo adesso" e niente altro. Lo strumento
// mancante lo mette l'estensione nel suo server MCP (engine/ide.ts), e la lista si
// legge dalla chiamata mentre passa — non dalla risposta del gestore, che riaprendo
// una conversazione non gira affatto. E' esattamente quello che questo transcript
// prova: qui dentro c'e' solo la chiamata registrata, nessun gestore da nessuna parte.
writeTranscript(ID_PLAN, [
  { type: 'user', content: 'porta i pagamenti su interi' },
  {
    type: 'assistant',
    content: [
      call('p1', 'mcp__editor__plan', {
        steps: [
          { content: 'Leggere il modulo', activeForm: 'Leggendo il modulo', status: 'completed' },
          { content: 'Portare i totali su interi', activeForm: 'Portando i totali su interi', status: 'in_progress' },
          { content: 'Sistemare i test', status: 'pending' },
        ],
      }),
    ],
  },
  { type: 'user', content: [answer('p1', 'Plan on screen: 1/3 done.')] },
  // E lo stesso piano riscritto male: due passi accesi insieme. Succede — il modello
  // riscrive la lista intera a ogni giro e gliene sfugge uno acceso di troppo — e il
  // pannello ci si spacca: tutta la sua grammatica dice "uno" (una riga accesa, un
  // indice attivo, una stima), e con quattro accesi diventava un muro d'arancione in
  // cui non si capiva piu' dove fosse arrivato. Vale il primo.
  {
    type: 'assistant',
    content: [
      call('p2', 'mcp__editor__plan', {
        steps: [
          { content: 'Leggere il modulo', activeForm: 'Leggendo il modulo', status: 'completed' },
          {
            content: 'Portare i totali su interi',
            activeForm: 'Portando i totali su interi',
            status: 'in_progress',
          },
          { content: 'Sistemare i test', activeForm: 'Sistemando i test', status: 'in_progress' },
        ],
      }),
    ],
  },
  { type: 'user', content: [answer('p2', 'Plan on screen: 1/3 done.')] },
]);

// The old tool, still spoken by older CLIs: one call, the whole list.
writeTranscript(ID_TODO, [
  { type: 'user', content: 'the old way' },
  {
    type: 'assistant',
    content: [
      call('d1', 'TodoWrite', {
        todos: [
          { content: 'Read the file', status: 'completed', activeForm: 'Reading the file' },
          { content: 'Write the patch', status: 'in_progress', activeForm: 'Writing the patch' },
        ],
      }),
    ],
  },
  { type: 'user', content: [answer('d1', 'Todos have been modified successfully.')] },
]);

// ---- the fake `vscode` -------------------------------------------------------
// The shared surface lives in lib/fake-vscode.cjs; nothing here needs bending.
const registered = newRegistry();
const vscode = makeVscode({ workspaceRoot: work, registered });
install(vscode);

const ctx = {
  extensionUri: uri(root),
  extensionPath: root,
  subscriptions: [],
  globalState: memento(new Map()),
  workspaceState: memento(new Map()),
};

const settle = (ms = 300) => new Promise((r) => setTimeout(r, ms));

/**
 * The last thing the panel was handed: every conversation's list, under the id of the
 * conversation that wrote it.
 */
const board = (panel) => {
  const frames = panel.webview.got.filter((m) => m && m.k === 'tasks');
  return frames.length ? frames[frames.length - 1].d : {};
};
/**
 * The one list on the board. Used where the check has a single conversation open and
 * does not know the id the CLI handed it — and it doubles as a check in itself: two
 * lists where one was expected is exactly the mixing this is all about.
 */
const only = (panel) => {
  const all = Object.values(board(panel));
  return all.length === 1 ? all[0] : null;
};

/**
 * The sidebar panel, the one you actually look at while a tab works. It is a second
 * surface subscribing to the same list, and the tab passing on its own proves nothing
 * about it: this is where the section used to sit empty.
 */
function mountSidebar() {
  const view = {
    webview: fakeWebview(),
    visible: true,
    onDidChangeVisibility: () => ({ dispose() {} }),
    onDidDispose: () => ({ dispose() {} }),
  };
  registered.views.get('claudeStudio.context').resolveWebviewView(view);
  view.webview._onMsg({ cmd: 'ready' });
  return view;
}

const line = (d) =>
  (d?.items ?? []).map((i) => `${i.status[0]}:${i.content}`).join(' | ') || '(empty)';

/**
 * The real thing: a prompt goes to the CLI and Claude writes its own list. Nothing is
 * staged — if the panel ends the turn without the steps, the panel is broken.
 */
async function live(tab, side) {
  // Every board the tab was handed, flattened to the single conversation's list: only
  // one is open here, and a board with two in it would be a bug of its own.
  const seen = () =>
    tab.webview.got
      .filter((m) => m && m.k === 'tasks')
      .map((m) => Object.values(m.d || {}))
      .map((v) => (v.length === 1 ? v[0] : null));
  let ended = 0;
  const watch = setInterval(() => {}, 1000); // keeps the loop alive while the CLI thinks
  tab.webview.got.length = 0;
  const orig = tab.webview.postMessage;
  tab.webview.postMessage = async (m) => {
    // Guardare si', toccare no. Prima era un no a tutto, ed e' il no giusto per quello
    // che questo test faceva; ma un lavoro da tre passi, che e' quello che serve per
    // vedere se il piano compare da solo, con un no a ogni lettura non arriva al
    // secondo passo — e allora non si starebbe misurando il piano, si starebbe
    // misurando il rifiuto. Gli strumenti che non cambiano niente passano; tutto il
    // resto no, che questo test gira nel repo vero.
    if (m?.k === 'ask') {
      const harmless = READONLY.has(m.tool);
      setTimeout(
        () => tab.webview._onMsg({ cmd: 'answer', id: m.id, choice: harmless ? 'allow' : 'deny' }),
        0
      );
    }
    if (m?.k === 'turn_end') ended++;
    return orig(m);
  };
  /** Sends a prompt and waits for the turn to end. */
  async function turn(text) {
    const want = ended + 1;
    tab.webview._onMsg({ cmd: 'send', text });
    const deadline = Date.now() + 240000;
    while (ended < want && Date.now() < deadline) await settle(200);
    await settle(500);
    return ended >= want;
  }

  // Quello che la CLI sa davvero fare, oggi.
  //
  // Questo test chiedeva TaskCreate e TaskUpdate. Quei due strumenti la CLI non ce li
  // ha piu': chiedendoglieli il modello risponde, per iscritto, che non esistono — e
  // il test falliva accusando il pannello di una cosa che era vera altrove. TodoWrite
  // idem. Le task della CLI di adesso sono i sub-agent, e non passano da nessun tool
  // che si possa spiare: le annuncia lei, con dei messaggi di sistema suoi.
  //
  // Quindi qui si chiede la cosa che le task le crea davvero. Due sub-agent, corti,
  // che non toccano niente: devono comparire nel pannello mentre lavorano e spuntarsi
  // quando finiscono.
  const ok1 = await turn(
    'Lancia due sub-agent con lo strumento Task (subagent_type "Explore"): il primo ' +
      'conta i file .ts sotto src/, il secondo dice quante righe ha README.md. ' +
      'Poi riporta i due numeri. Non modificare nessun file.'
  );

  // I sub-agent sono aiutanti, e viaggiano in `agents`: fra i passi non ci vanno piu'.
  const crew = (x) => (x?.agents ?? []).map((a) => `${a.status[0]}:${a.title}`).join(' | ') || '(nobody)';
  const frames = seen().filter(Boolean);
  const d = frames[frames.length - 1] ?? null;
  console.log('  turn 1: ' + frames.length + ' list(s) handed over; the helpers: ' + crew(d));
  t(ok1, 'the turn never finished: no CLI, no login, or no network');
  t(frames.length > 0, 'the panel was handed no list at all while Claude was writing one');
  t((d?.agents ?? []).length >= 2, 'the sub-agents the CLI opened did not reach the panel: ' + crew(d));
  t(
    (d?.agents ?? []).every((a) => a.toolUseId && a.depth >= 1),
    'a helper arrived without the call that launched it or its level: ' + JSON.stringify(d?.agents)
  );
  t(
    (d?.agents ?? []).some((a) => a.status === 'completed'),
    'a helper that finished is still drawn as working: ' + crew(d)
  );
  // The list must be built as it goes, not handed over in one piece at the end: that
  // delay is the whole reason this panel exists.
  t(
    frames.filter((f) => (f.agents ?? []).length > 0).length > 1,
    'the helpers only appeared once, at the end — they are not followed as they work'
  );

  const s = only(side);
  console.log('  the sidebar was handed: ' + crew(s));
  t(crew(s) === crew(d), 'the sidebar panel does not show what the tab shows: ' + crew(s));

  // ---- the second message: the helpers of the turn before make room ----------
  //
  // The ones that finished belonged to the turn before and go with it; the new one
  // has to arrive, and be ticked off when it is done.
  const before = seen().length;
  const ok2 = await turn('Lancia un altro sub-agent Explore che dica quante righe ha LICENSE.');
  const after = seen().slice(before).filter(Boolean);
  const d2 = after[after.length - 1] ?? only(tab);
  console.log('  turn 2: ' + crew(d2));
  t(ok2, 'the second turn never finished');
  t((d2?.agents ?? []).length >= 1, 'the new helper did not reach the panel: ' + crew(d2));
  t(
    (d2?.agents ?? []).every((a) => a.status === 'completed'),
    'the helper that finished is not ticked off: ' + crew(d2)
  );
  t(
    crew(only(side)) === crew(d2),
    'after a second message the sidebar and the tab disagree: ' + crew(only(side))
  );

  // ---- un turno normale, senza sub-agent: la card deve dire cosa sta facendo ----
  //
  // Le task della CLI sono i sub-agent, e un turno qualunque — legge un file,
  // risponde — non ne apre nessuno. La card restava con una frase fissa addosso per
  // tutta la sessione, che e' il motivo per cui questo pannello sembrava rotto anche
  // quando non lo era. Questa riga c'e' sempre, perche' un passo in corso c'e' sempre.
  const mark3 = seen().length;
  const ok3 = await turn('Leggi package.json e dimmi il campo "name" in una riga. Nient\'altro.');
  const steps = tab.webview.got
    .filter((m) => m && m.k === 'tasks')
    .map((m) => Object.values(m.d || {})[0])
    .filter(Boolean)
    .map((v) => v.doing)
    .filter(Boolean);
  console.log('  turn 3, what it was doing: ' + (steps.join(' → ') || '(nothing)'));
  t(ok3, 'the third turn never finished');
  t(steps.length > 0, 'the card never said what it was doing in a turn without sub-agents');
  // Un passo del filo principale, non solo quelli dei sub-agent di prima: e' la
  // differenza fra una card che racconta questo turno e una che ricorda quello prima.
  // Con quale strumento lo faccia — Read, un grep da Bash — lo sceglie lui, e va bene
  // cosi': la domanda a cui questa riga risponde e' "sta facendo qualcosa?".
  const own = steps.filter((s) => !/^Agent /.test(s));
  t(
    own.length > 0,
    'the card only ever showed the sub-agents of the earlier turns: ' + steps.join(' | ')
  );
  void mark3;

  // ---- il piano, senza che glielo si chieda ----
  //
  // La meta' della faccenda che un transcript non puo' provare. Lo strumento che
  // scrive il piano c'e' (lo mette l'estensione, engine/ide.ts) e la strada dal
  // tool al pannello e' gia' verificata piu' su — ma tutto questo vale zero se il
  // modello non lo chiama da solo. Quindi qui non si nomina: si chiede un lavoro da
  // tre passi e si guarda se il piano compare.
  // Conversazione nuova, e non e' un dettaglio: i tre sub-agent dei turni prima
  // avevano lasciato in piedi una lista da tre voci, e un controllo su "ci sono almeno
  // tre passi" la trovava e passava senza che nessun piano fosse mai stato scritto.
  // Su una lista vuota tutto quello che compare e' il piano, e non c'e' niente da
  // distinguere.
  tab.webview._onMsg({ cmd: 'newSession' });
  await settle(400);
  const mark4 = seen().length;
  const ok4 = await turn(
    'Guarda src/tasks/store.ts, src/tasks/protocol.ts e webview/taskspanel.js e dimmi ' +
      'in una riga per file cosa fa ognuno. Non modificare niente.'
  );
  const planned = seen().slice(mark4).filter(Boolean);
  const biggest = planned.reduce((a, b) => ((b?.total ?? 0) > (a?.total ?? 0) ? b : a), null);
  console.log('  turn 4, il piano: ' + line(biggest));
  t(ok4, 'the fourth turn never finished');
  t(
    (biggest?.total ?? 0) >= 3,
    'Claude non ha scritto nessun piano per un lavoro da tre passi: ' + line(biggest)
  );
  // Uno alla volta, e si vede quale: e' la meta' della richiesta che la lista da sola
  // non soddisfa.
  t(
    planned.some((f) => (f?.items ?? []).some((i) => i.status === 'in_progress')),
    'il piano e’ arrivato ma non ha mai detto a quale passo era'
  );
  t(
    planned.some((f) => typeof f?.activeSince === 'number' && typeof f?.expectedMs === 'number'),
    'il passo in corso non ha mai portato i numeri con cui si stima quanto manca'
  );

  // La stessa cosa, chiesta a voce. Non e' un controllo — che il modello faccia una
  // cosa quando gliela ordini non dimostra niente sul comportamento vero — e' la
  // diagnosi del controllo qui sopra: se questo passa e quello no, lo strumento
  // funziona e a essere debole e' l'istruzione nel prompt di sistema; se non passa
  // nemmeno questo, lo strumento non arriva proprio al modello.
  if (!planned.some((f) => (f?.total ?? 0) >= 3)) {
    const mark5 = seen().length;
    await turn(
      'Chiama mcp__editor__plan con tre passi (uno in_progress, due pending) e poi fermati.'
    );
    const forced = seen().slice(mark5).filter(Boolean);
    const got = forced.reduce((a, b) => ((b?.total ?? 0) > (a?.total ?? 0) ? b : a), null);
    console.log(
      '  diagnosi — chiamato a voce: ' +
        (got?.total
          ? line(got) + '  → lo strumento funziona, e’ l’istruzione a non bastare'
          : '(niente) → lo strumento non arriva al modello')
    );
  }
  clearInterval(watch);
}

/**
 * Gli aiutanti, sullo store vero e da solo.
 *
 * Le task della CLI di oggi sono messaggi di sistema che in un transcript non
 * finiscono, quindi qui non c'e' una conversazione da riaprire: lo store si compila a
 * parte, insieme al suo `owned`, e gli si danno le notizie nell'ordine in cui le da'
 * il motore. Tre cose da guardare, e sono le tre che si rompevano:
 *   - il piano non sparisce piu' quando arriva una task (la prima svuotava i passi);
 *   - gli aiutanti stanno in `agents`, mai fra i passi;
 *   - il genitore si aggancia dal `tool_use_id`: la chiamata Agent ha il filo da cui
 *     e' partita, e la `task_started` porta l'id di quella chiamata.
 */
function agents() {
  const esbuild = require('esbuild');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-agents-'));
  const out = path.join(tmp, 'store.cjs');
  esbuild.buildSync({
    stdin: {
      contents: "export { tasks } from './src/tasks/store'; export { owned } from './src/context/owned';",
      resolveDir: root,
      loader: 'ts',
    },
    bundle: true,
    outfile: out,
    platform: 'node',
    format: 'cjs',
    external: ['vscode'],
    logLevel: 'warning',
  });
  const { tasks: store, owned: own } = require(out);
  const K = 'k-agents';
  const SID = 'sid-agents';
  own.adopt(K, SID, work);
  let last = {};
  const sub = store.subscribe((d) => (last = d));
  const now = () => last[SID] || {};
  const crew = () =>
    (now().agents || []).map((a) => `${a.id}<${a.parentId || '-'}>${a.depth}:${a.status[0]}`).join(' ') || '(nobody)';

  // Il piano, scritto col nostro strumento.
  const piano = [
    { content: 'Leggere il modulo', status: 'completed' },
    { content: 'Contare i file', activeForm: 'Contando i file', status: 'in_progress' },
    { content: 'Scrivere il riassunto', status: 'pending' },
  ];
  store.set(K, piano);
  const PIANO = 'c:Leggere il modulo | i:Contare i file | p:Scrivere il riassunto';

  // La conversazione lancia un aiutante; l'aiutante ne lancia un altro; la
  // conversazione ne lancia un secondo. Nell'ordine del motore: prima la chiamata
  // Agent (col filo da cui parte), poi la task_started con l'id di quella chiamata.
  store.spawned(K, 'tu-1', null, {
    description: 'Contare i file',
    prompt: 'Conta i file .ts sotto src e dimmi quanti sono',
    subagent_type: 'Explore',
    name: 'contatore',
  });
  store.fromCli(K, 'task-1', { description: 'Contare i file', status: 'running', toolUseId: 'tu-1', depth: 1, type: 'Explore' });
  t(line(now()) === PIANO, 'la prima task della CLI ha svuotato il piano: ' + line(now()));
  t(!(now().items || []).some((i) => /task-/.test(i.id || '')), 'un aiutante e’ finito fra i passi: ' + line(now()));

  store.spawned(K, 'tu-2', 'tu-1', { description: 'Guardare i test', subagent_type: 'Explore' });
  store.fromCli(K, 'task-2', { description: 'Guardare i test', status: 'running', toolUseId: 'tu-2', depth: 2 });
  store.spawned(K, 'tu-3', null, { description: 'Leggere il README' });
  store.fromCli(K, 'task-3', { description: 'Leggere il README', status: 'running', toolUseId: 'tu-3', depth: 1 });
  t(
    crew() === 'task-1<->1:i task-2<task-1>2:i task-3<->1:i',
    'l’albero di chi lavora per chi e’ sbagliato: ' + crew()
  );
  const primo = (now().agents || [])[0] || {};
  t(
    primo.toolUseId === 'tu-1' && primo.name === 'contatore' && primo.type === 'Explore' && /Conta i file/.test(primo.brief || ''),
    'l’aiutante ha perso chi e’ (chiamata, nome, tipo, compito): ' + JSON.stringify(primo)
  );
  t(typeof primo.since === 'number' && primo.since > 0, 'l’aiutante non dice da quando lavora: ' + primo.since);
  t(line(now()) === PIANO, 'con tre aiutanti al lavoro il piano non e’ piu’ quello: ' + line(now()));

  // Una notizia arrivata prima della chiamata che l'ha fatta nascere: per un attimo
  // e' della conversazione, poi la chiamata la riaggancia a chi l'ha lanciata.
  store.fromCli(K, 'task-4', { description: 'Contare le righe', status: 'running', toolUseId: 'tu-4' });
  store.spawned(K, 'tu-4', 'tu-1', { description: 'Contare le righe' });
  const quarto = (now().agents || []).find((a) => a.id === 'task-4') || {};
  t(quarto.parentId === 'task-1' && quarto.depth === 2, 'una task arrivata prima della sua chiamata resta orfana: ' + crew());

  // La controprova: chi la CLI dice lanciato dalla conversazione, lo e'.
  store.spawned(K, 'tu-5', 'tu-1', { description: 'Uno che dice di essere del capo' });
  store.fromCli(K, 'task-5', { description: 'Uno che dice di essere del capo', status: 'running', toolUseId: 'tu-5', depth: 1 });
  const quinto = (now().agents || []).find((a) => a.id === 'task-5') || {};
  t(quinto.parentId === null && quinto.depth === 1, 'il livello detto dalla CLI non fa da controprova: ' + crew());

  // Cosa sta facendo, e come finisce.
  store.fromCli(K, 'task-2', { doing: 'Running grep', lastTool: 'Grep', ms: 1200 });
  store.fromCli(K, 'task-2', { status: 'completed', summary: 'Trovati tre test', ms: 4200 });
  store.fromCli(K, 'task-3', { status: 'stopped' });
  const fine = Object.fromEntries((now().agents || []).map((a) => [a.id, a]));
  t(
    fine['task-2'] && fine['task-2'].status === 'completed' && fine['task-2'].ms === 4200 && fine['task-2'].summary === 'Trovati tre test',
    'la fine di un aiutante non arriva com’e’: ' + JSON.stringify(fine['task-2'])
  );
  t(fine['task-2'] && !fine['task-2'].doing, 'un aiutante finito dice ancora cosa sta facendo: ' + JSON.stringify(fine['task-2']));
  t(fine['task-3'] && fine['task-3'].status === 'failed', 'un aiutante fermato non e’ andato storto: ' + JSON.stringify(fine['task-3']));

  // Il piano riscritto non si porta via gli aiutanti.
  store.set(K, piano.map((p) => ({ ...p, status: 'completed' })));
  t((now().agents || []).length === 5, 'il piano riscritto si e’ portato via gli aiutanti: ' + crew());

  // Una task_progress senza la sua task_started non apre una riga vuota.
  store.fromCli(K, 'task-9', { doing: 'Running ls' });
  t(!(now().agents || []).some((a) => a.id === 'task-9'), 'una notizia senza nome ha aperto un aiutante vuoto: ' + crew());

  // Un messaggio nuovo: il piano (scritto tutto intero) se ne va, gli aiutanti finiti
  // pure; quelli ancora al lavoro restano — in sottofondo lavorano oltre il turno.
  store.newTurn(K);
  t(!(now().items || []).length, 'il piano del messaggio prima e’ rimasto: ' + line(now()));
  t(
    crew() === 'task-1<->1:i task-4<task-1>2:i task-5<->1:i',
    'al messaggio dopo gli aiutanti non sono quelli ancora al lavoro: ' + crew()
  );
  t(!!last[SID], 'una conversazione con aiutanti al lavoro sparisce dalla bacheca a turno finito');

  // Conversazione azzerata: non resta nessuno.
  store.clear(K);
  t(!(now().agents || []).length, 'dopo l’azzeramento restano degli aiutanti: ' + crew());
  sub.dispose();
}

(async () => {
  require(path.join(root, 'dist', 'extension.js')).activate(ctx);
  const side = mountSidebar();
  await registered.commands.get('claudeStudio.openTab')();
  const tab = registered.panels[0];
  tab.webview._onMsg({ cmd: 'ready' });

  if (LIVE) {
    await live(tab, side);
    if (fails.length) {
      console.error('FAILED:\n- ' + fails.join('\n- '));
      process.exit(1);
    }
    console.log('tasks-check --live ok — Claude wrote its list and the panel drew it');
    process.exit(0);
  }

  // ---- the tool the CLI actually uses ----
  tab.webview._onMsg({ cmd: 'open', id: ID_TASK });
  await settle();

  const d = board(tab)[ID_TASK];
  t(!!d, 'the panel was handed no list at all');
  t(
    d && d.total === 3,
    'the three steps did not reach the panel — this is the defect: TaskCreate was never listened for: ' +
      line(d)
  );
  t(
    line(d) ===
      'c:Rename the column | i:Update the three call sites | p:Run the tests',
    'the steps came out in the wrong order or the wrong state: ' + line(d)
  );
  t(d && d.done === 1, 'the ticked-off step was not counted: ' + (d && d.done));
  t(
    d && d.active === 1,
    'the panel does not know which step is being worked on: ' + (d && d.active)
  );
  // The sidebar is the surface you leave open while a tab works: it has to be told
  // the same thing, not merely be able to be.
  t(
    line(board(side)[ID_TASK]) === line(d),
    'the sidebar panel does not show what the tab shows: ' + line(board(side)[ID_TASK])
  );

  // ---- the old tool, still spoken by older CLIs ----
  tab.webview._onMsg({ cmd: 'open', id: ID_TODO });
  await settle();
  const old = board(tab)[ID_TODO];
  t(
    line(old) === 'c:Read the file | i:Write the patch',
    'a list written with TodoWrite no longer arrives: ' + line(old)
  );
  t(
    old && old.total === 2 && old.done === 1 && old.active === 1,
    'the counts of a TodoWrite list are wrong: ' + JSON.stringify(old && { ...old, items: undefined })
  );

  // ---- il piano che l'estensione si e' data da sola ----
  tab.webview._onMsg({ cmd: 'open', id: ID_PLAN });
  await settle();
  const plan = board(tab)[ID_PLAN];
  t(
    line(plan) === 'c:Leggere il modulo | i:Portare i totali su interi | i:Sistemare i test',
    'il piano scritto con lo strumento nostro non arriva al pannello: ' + line(plan)
  );
  t(
    plan && plan.total === 3 && plan.done === 1 && plan.active === 1,
    'i conti del piano non tornano: ' + JSON.stringify(plan && { ...plan, items: undefined })
  );
  // La stima. Non e' una misura e non pretende di esserlo, ma i due numeri su cui si
  // fa devono esserci: senza, la riga in corso non ha niente da far camminare.
  t(
    plan && typeof plan.activeSince === 'number' && plan.activeSince > 0,
    'il passo in corso non dice da quando lo e’: ' + (plan && plan.activeSince)
  );
  t(
    plan && typeof plan.expectedMs === 'number' && plan.expectedMs > 0,
    'non c’e’ nessuna attesa su cui stimare: ' + (plan && plan.expectedMs)
  );
  // Due passi accesi insieme arrivano accesi tutti e due, ed e' giusto cosi'.
  //
  // Per un pezzo qui si controllava il contrario: che ne arrivasse uno solo, perche'
  // il pannello con quattro righe arancioni diventa un muro. Ma "uno" e' una regola di
  // come si disegna una lista, non di cosa sta succedendo — la CLI i sub-agent li
  // lancia a mazzi — e da quando l'ufficio disegna una persona per sub-agent quella
  // bugia si vedeva: tre impiegati su quattro stavano fermi a guardare. Adesso sul filo
  // passa la verita', e a tenere accesa una riga sola ci pensa il pannello, che e'
  // l'unico che lo vuole. Che lo faccia davvero lo controlla context-check.
  t(
    (plan?.items ?? []).filter((i) => i.status === 'in_progress').length === 2,
    'i passi accesi insieme non arrivano accesi: ' + line(plan)
  );
  // E l'indice attivo resta uno solo: e' il primo acceso, ed e' quello a cui la lista
  // scorre dietro.
  t(plan && plan.active === 1, 'l’indice attivo non e’ il primo acceso: ' + (plan && plan.active));

  // ---- started before it had a number ----
  tab.webview._onMsg({ cmd: 'open', id: ID_EARLY });
  await settle();
  const early = board(tab)[ID_EARLY];
  t(
    line(early) === 'i:Read the file | p:Write the patch',
    'a step Claude started in the same message that created it is still drawn as to-do: ' +
      line(early)
  );
  t(early && early.active === 0, 'the panel does not know which step is running: ' + (early && early.active));

  // ---- TaskList has the last word ----
  tab.webview._onMsg({ cmd: 'open', id: ID_LIST });
  await settle();
  const listed = board(tab)[ID_LIST];
  t(
    line(listed) === 'c:Move the parser out | i:Rename the column | p:Run the tests',
    'the list TaskList printed did not reach the panel: ' + line(listed)
  );
  t(
    listed && listed.total === 3 && listed.done === 1 && listed.active === 1,
    'the counts do not match the list the CLI printed: ' +
      JSON.stringify(listed && { ...listed, items: undefined })
  );

  // ---- a new conversation leaves nothing behind ----
  tab.webview._onMsg({ cmd: 'newSession' });
  await settle();
  t(
    !board(tab)[ID_TODO] && !board(tab)[ID_TASK],
    'the steps of the old conversation stayed on screen: ' + JSON.stringify(Object.keys(board(tab)))
  );

  // ---- two conversations at once, each with its own list -------------------
  //
  // This is the one you hit with three tabs open. Each conversation writes its own
  // steps; the panel used to hand over one list and nothing said whose it was, so the
  // section swapped under you depending on which conversation had moved last. Every
  // list travels now, under the id of the conversation that wrote it.
  tab.webview._onMsg({ cmd: 'open', id: ID_TASK });
  await settle();
  await registered.commands.get('claudeStudio.openNewTab')();
  const tab2 = registered.panels[registered.panels.length - 1];
  tab2.webview._onMsg({ cmd: 'ready' });
  tab2.webview._onMsg({ cmd: 'open', id: ID_TODO });
  await settle();

  const both = board(side);
  t(
    both.items === undefined,
    'the sidebar is still handed one nameless list instead of one per conversation'
  );
  const mine = both[ID_TASK];
  const theirs = both[ID_TODO];
  t(
    line(mine) === 'c:Rename the column | i:Update the three call sites | p:Run the tests',
    'the first conversation lost its own steps: ' + line(mine)
  );
  t(
    line(theirs) === 'c:Read the file | i:Write the patch',
    'the second conversation lost its own steps: ' + line(theirs)
  );

  agents();

  for (const dsp of ctx.subscriptions) dsp.dispose?.();

  if (fails.length) {
    console.error('FAILED:\n- ' + fails.join('\n- '));
    process.exit(1);
  }
  console.log('tasks-check ok — the steps reach the panel, in both dialects the CLI speaks');
  process.exit(0);
})();
