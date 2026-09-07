// L'autofix: gli errori che l'editor gia' conosce, rimandati indietro da soli.
//
// E' l'unica cosa in tutta l'estensione che fa ripartire un turno **senza che tu
// abbia chiesto niente**, quindi e' anche l'unica che puo' spendere i tuoi soldi in
// un giro infinito. Tutto quello che si prova qui e' il guinzaglio.
//
// Il bundle vero (dist/extension.js) con un `vscode` finto, la CLI vera, e delle
// diagnostiche che scriviamo noi — non serve un TypeScript in funzione per provare
// la regola, serve un editor che dica "qui c'e' un errore" quando decidiamo noi.
//
//   node scripts/autofix-check.cjs
const path = require('node:path');
const { uri, newRegistry, fakeWebview, makeVscode, install, memento } = require('./lib/fake-vscode.cjs');

const root = path.dirname(__dirname);
const registered = newRegistry();
const vscode = makeVscode({ workspaceRoot: root, registered });

// ---- l'editor che sa di un errore, quando lo diciamo noi --------------------
//
// `errors` e' il file (percorso intero) che al momento risulta rotto, o null. La
// finestra e' quella vera: `getDiagnostics()` senza argomento da' tutto a coppie,
// con un uri da' solo il suo elenco.
let broken = null;
let announce = () => {};
const diag = (msg) => [{ severity: 0, message: msg, code: 'TS2304', range: { start: { line: 3, character: 2 } } }];
vscode.languages.getDiagnostics = (u) => {
  if (!broken) return u ? [] : [];
  if (u) return u.fsPath === broken.file ? diag(broken.msg) : [];
  return [[uri(broken.file), diag(broken.msg)]];
};
vscode.languages.onDidChangeDiagnostics = (fn) => {
  announce = fn;
  return { dispose() {} };
};
/** Cambia quello che l'editor sa, e lo dice — come farebbe TypeScript davvero. */
function setErrors(file, msg) {
  broken = file ? { file, msg } : null;
  announce();
}

vscode.window.showWarningMessage = async (_m, _o, ...items) => items[0];
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

const view = { webview: fakeWebview(), visible: true, onDidChangeVisibility: () => ({ dispose() {} }), onDidDispose: () => ({ dispose() {} }) };
registered.views.get('claudeStudio.chat').resolveWebviewView(view);
const got = view.webview.got;
const onMsg = (m) => view.webview._onMsg(m);

const fails = [];
const t = (c, m) => !c && fails.push(m);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Aspetta la fine di `n` turni, contando dall'inizio della prova. */
async function turns(n, ms = 240000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline && got.filter((m) => m.k === 'turn_end').length < n) await wait(200);
  return got.filter((m) => m.k === 'turn_end').length >= n;
}

// Un file di comodo dentro il progetto: l'autofix guarda solo i file che il turno ha
// davvero toccato, quindi ne serve uno che venga toccato per davvero.
const scratch = path.join(root, 'dist', 'autofix-scratch.txt');

(async () => {
  onMsg({ cmd: 'ready' });
  await wait(200);

  // ---- 1. non ha toccato niente: l'autofix non si sveglia ------------------
  //
  // E' la prima cosa da provare perche' e' quella che, sbagliata, fa ripartire un
  // turno a ogni domanda che fai. Gli errori nell'editor ci sono eccome: non sono
  // suoi, e non e' affar suo.
  setErrors(path.join(root, 'src', 'extension.ts'), 'un errore che stava gia li');
  onMsg({ cmd: 'setMode', value: 'bypassPermissions' });
  onMsg({ cmd: 'send', text: 'Rispondi con la sola parola: pronto. Non usare nessuno strumento.' });
  t(await turns(1), 'il primo turno non e mai finito: CLI assente, login, o rete');
  await wait(2500); // il tempo che l'autofix impiegherebbe ad aspettare le diagnostiche
  t(
    got.filter((m) => m.k === 'autofix').length === 0,
    'l autofix e partito su un turno che non ha toccato nessun file'
  );

  // ---- 2. ha scritto, e da li nasce un errore ------------------------------
  //
  // Il turno scrive il file; appena finisce, l'editor "scopre" un errore proprio li'
  // dentro. E' il caso vero, e deve far ripartire un giro con la sua card.
  setErrors(null);
  const before = got.length;
  onMsg({
    cmd: 'send',
    text: `Usa Write per creare il file ${scratch} con dentro la sola riga "uno". Nient'altro.`,
  });
  t(await turns(2), 'il turno che scrive non e mai finito');
  // Adesso l'editor se ne accorge, come farebbe un TypeScript un attimo dopo.
  setErrors(scratch, "Cannot find name 'uno'");
  await wait(3000);
  const cards = got.slice(before).filter((m) => m.k === 'autofix');
  t(cards.length >= 1, 'un errore nato dentro un file appena scritto non ha fatto partire niente');
  t(cards[0] && cards[0].n === 1, 'il conto degli errori nella card e sbagliato: ' + (cards[0] && cards[0].n));
  t(cards[0] && cards[0].round === 1, 'il giro dichiarato non e il primo: ' + (cards[0] && cards[0].round));
  // Il messaggio dell'autofix non e' tuo: nel discorso non ci va.
  const users = got.slice(before).filter((m) => m.k === 'user');
  t(users.length === 1, 'il messaggio dell autofix e entrato nel discorso come se l avessi scritto tu: ' + users.length);

  // ---- 3. il guinzaglio: due giri e basta ----------------------------------
  //
  // L'errore resta li' qualunque cosa faccia. Senza tetto, questo e' il giro infinito.
  const beforeLoop = got.length;
  const ok = await turns(6, 300000); // due giri di correzione, al massimo
  await wait(3000);
  const loop = got.slice(beforeLoop).filter((m) => m.k === 'autofix');
  const gaveUp = loop.filter((m) => m.gaveUp);
  t(ok || loop.length > 0, 'i giri di correzione non sono mai partiti');
  t(
    loop.filter((m) => !m.gaveUp).length <= 2,
    'l autofix ha riprovato piu di due volte: ' + loop.filter((m) => !m.gaveUp).length
  );
  t(gaveUp.length >= 1, 'finiti i tentativi, non ha detto che si arrende');

  // Da qui in poi non deve piu' partire niente da solo.
  const afterGiveUp = got.length;
  await wait(4000);
  t(
    got.slice(afterGiveUp).filter((m) => m.k === 'autofix' && !m.gaveUp).length === 0,
    'dopo essersi arreso ha ricominciato lo stesso'
  );

  try {
    require('node:fs').rmSync(scratch, { force: true });
  } catch {
    /* non c'era */
  }
  for (const d of ctx.subscriptions) d.dispose?.();

  if (fails.length) {
    console.error('FAILED:\n- ' + fails.join('\n- '));
    process.exit(1);
  }
  console.log('autofix-check ok — parte solo su quello che ha toccato, si vede, e si ferma dopo due giri');
  process.exit(0);
})();
