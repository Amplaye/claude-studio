// Il righello. Prima di dire che qualcosa "non peggiora", serve un prima e un dopo.
//
// Fa recitare alla chat vera — lo stesso bundle, la stessa CLI, lo stesso VSCode
// finto di `drive.cjs` — una batteria fissa di conversazioni: banali, medie,
// difficili, con un allegato, con i tool, e una fatta apposta per vedere se
// cambiare l'impegno butta via la cache del prompt. Alla fine stampa i totali e
// lascia un file JSON, cosi' due giri si confrontano a numeri e non a memoria.
//
//   node scripts/router-check.cjs --deny            il giro intero, in sicurezza
//   node scripts/router-check.cjs --only cache      solo la sonda della cache
//   node scripts/router-check.cjs --model opus --effort high --label opus-high
//   node scripts/router-check.cjs --n 3             i primi tre casi, per provare
//   node scripts/router-check.cjs --list            cosa c'e' dentro, senza spendere
//   node scripts/router-check.cjs --diff giro1,giro2   due giri a confronto, gratis
//   node scripts/router-check.cjs --ab effort=low --ab effort=high --only cache
//                                                  il confronto APPAIATO: e' l'unico
//                                                  che regge (vedi --ab piu' sotto)
//
// ⚠️ Costa soldi veri: sono turni veri su modelli veri. Ed e' apposta — un banco di
// prova che non chiama nessuno non misura niente.
//
// Sicurezza, e come funziona davvero. La modalita' e' *sempre* "chiede" (mai yolo:
// li' gli strumenti partono senza domandare). Ma il permesso non passa da qui per
// tutti: la CLI approva da se' quelli di sola lettura, e infatti un giro con 28
// strumenti puo' chiudersi con zero permessi chiesti. Il filtro qui sotto vede solo
// quelli che una domanda la fanno davvero — e li' dentro si dice di si' soltanto a
// chi guarda. Siccome fidarsi di un guardiano che non viene mai interpellato non e'
// fidarsi di niente, c'e' anche un filo d'inciampo: se uno strumento che *scrive*
// arriva a partire, il giro lo dichiara e finisce male.
const fs = require('node:fs');
const path = require('node:path');
const { boot, root } = require('./fake-vscode.cjs');

// ---- riga di comando ---------------------------------------------------------
const argv = process.argv.slice(2);
const on = (name) => {
  const i = argv.indexOf(name);
  if (i < 0) return false;
  argv.splice(i, 1);
  return true;
};
const flag = (name, d) => {
  const i = argv.indexOf(name);
  if (i < 0) return d;
  const v = argv[i + 1];
  argv.splice(i, v === undefined ? 1 : 2);
  return v ?? d;
};
const denyAll = on('--deny');
const allowAll = on('--allow');
const listOnly = on('--list');
const model = flag('--model');
const effort = flag('--effort');
const only = flag('--only');
const diff = flag('--diff');
/**
 * I due bracci del confronto appaiato: `--ab "effort=low" --ab "effort=high"`.
 *
 * Serve perche' due giri separati NON sono confrontabili: fra l'uno e l'altro la
 * cache del prompt della CLI cambia stato per conto suo, e lo stesso identico "ciao"
 * e' costato $0,021 in un giro e $0,170 in quello dopo — otto volte tanto, senza che
 * fosse cambiata una virgola. Un rumore cosi' si mangia qualunque effetto si stia
 * cercando. Appaiando, i due bracci provano ogni caso a pochi secondi di distanza,
 * nello stesso stato, e si alternano di posto cosi' che nemmeno l'ordine avvantaggi
 * sempre lo stesso.
 */
const arms = [];
for (;;) {
  const a = flag('--ab');
  if (!a) break;
  const prefs = {};
  for (const kv of a.split(',')) {
    const [k, ...v] = kv.split('=');
    if (k) prefs[k.trim()] = v.join('=').trim();
  }
  arms.push({ name: a, prefs });
}
if (arms.length === 1) {
  console.error('!! --ab va dato due volte: un braccio non e\' un confronto');
  process.exit(2);
}
const limit = Number(flag('--n', '0')) || 0;
const label = flag('--label', [model || 'default', effort || 'default'].join('-'));

/** Gli strumenti che possono solo guardare. Il resto si rifiuta. */
const READ_ONLY = new Set(['Read', 'Glob', 'Grep', 'LS', 'NotebookRead', 'TodoWrite', 'Task']);
/** Quelli che toccano il disco o la macchina: qui dentro non devono partire mai. */
const MUTATING = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'KillShell']);
/** Se ne parte uno, si scrive qui e il giro finisce con un errore. */
const trespassed = new Set();

// ---- la batteria -------------------------------------------------------------
// Una voce = una conversazione. Ogni turno e' una stringa, o un oggetto quando deve
// portarsi dietro qualcosa: `set` cambia le preferenze *prima* di mandare (ed e'
// l'unico modo per misurare cosa costa cambiarle), `image` allega.
//
// I prompt sono ancorati a questo repo apposta: due giri devono trovare le stesse
// cose da leggere, o non stanno confrontando la stessa fatica.
const BATTERY = [
  // -- banali: la classe che il router dovrebbe poter abbassare senza fare danni --
  { id: 'triv-ciao', tier: 'banale', turns: ['ciao'] },
  { id: 'triv-ok', tier: 'banale', turns: ['ok, grazie'] },
  { id: 'triv-conta', tier: 'banale', turns: ['quanto fa 17 per 23?'] },
  { id: 'triv-nome', tier: 'banale', turns: ['come si chiama questa estensione?'] },
  { id: 'triv-fine', tier: 'banale', turns: ['grazie mille, sei stato utile'] },

  // -- medi: una domanda vera, una o due letture --
  { id: 'med-script', tier: 'medio', turns: ['a che serve lo script scripts/lang-check.mjs?'] },
  { id: 'med-versione', tier: 'medio', turns: ['che versione dichiara package.json, e che engine di VSCode vuole?'] },
  { id: 'med-prefs', tier: 'medio', turns: ['dove vengono salvate le preferenze della chat, e con che chiave?'] },
  { id: 'med-i18n', tier: 'medio', turns: ['quante lingue parla la webview e dove stanno i dizionari?'] },
  { id: 'med-cli', tier: 'medio', turns: ['come fa questa estensione a trovare la CLI di Claude sul computer?'] },

  // -- difficili: piu' file, e una conclusione da tirare --
  {
    id: 'hard-cache',
    tier: 'difficile',
    turns: ['spiegami come src/engine/session.ts tiene il conto del contesto, e perché non usa l\'usage del messaggio result'],
  },
  {
    id: 'hard-permessi',
    tier: 'difficile',
    turns: ['segui il percorso di un permesso da quando il motore lo chiede a quando la pagina risponde: quali file tocca, in che ordine?'],
  },
  {
    id: 'hard-refactor',
    tier: 'difficile',
    turns: ['guarda src/chat/controller.ts: che cosa succede se la CLI smette di offrire il modello che ho scelto?'],
  },
  {
    id: 'hard-debug',
    tier: 'difficile',
    turns: ['perché in questa estensione i risultati dei tool si agganciano per id e non per posizione? cosa si romperebbe altrimenti?'],
  },

  // -- con un allegato: cambia la forma del messaggio, non solo la lunghezza --
  { id: 'img-icona', tier: 'allegato', turns: [{ text: 'che cosa mostra questa immagine?', image: 'media/icon.png' }] },
  { id: 'img-colori', tier: 'allegato', turns: [{ text: 'che colori dominano in questa immagine?', image: 'media/icon.png' }] },

  // -- con i tool: letture esplicite, tante --
  { id: 'tool-grep', tier: 'tool', turns: ['cerca in src/ tutti i posti che parlano di "modelUsage" e dimmi cosa ci fanno'] },
  { id: 'tool-lista', tier: 'tool', turns: ['elenca gli script in scripts/ e per ognuno una riga su cosa controlla'] },

  // -- il seguito: il secondo e il terzo turno non sono il primo --
  {
    id: 'segue',
    tier: 'seguito',
    turns: ['leggi webview/i18n.js e dimmi come funziona il fallback fra le lingue', 'e se una chiave manca in inglese?', 'ok, vai'],
  },

  // -- l'assenso, tenuto in disparte --
  // "sì, vai" e' proprio la parola che il router userebbe per abbassare l'impegno,
  // quindi deve stare nella batteria. Ma non e' una domanda: e' un invito a
  // inventarsi del lavoro, e infatti costava $0,22 un giro e $1,01 quello dopo (2
  // strumenti contro 20) senza che fosse cambiato niente. In mezzo alle altre
  // classi quel rumore copre il segnale, quindi ha una classe sua: si vede, e non
  // sporca i confronti.
  { id: 'assenso', tier: 'assenso', turns: ['quante lingue parla questa estensione?', 'sì, vai'] },

  // -- la sonda: cambiare impegno butta via la cache del prompt? --
  //
  // Due conversazioni con gli stessi identici quattro messaggi. Nella prima
  // l'impegno cambia al terzo turno, nella seconda non cambia mai: e' l'unica
  // differenza fra le due, quindi qualunque cosa succeda solo alla prima l'ha fatta
  // il cambio d'impegno e non il fatto di essere il terzo turno.
  //
  // Se in quel punto `cacheRead` crolla e `cacheCreate` esplode, cambiare impegno
  // non e' gratis — e l'aritmetica su cui poggia la Fase 1 del piano va rifatta.
  {
    id: 'sonda-impegno',
    tier: 'cache',
    turns: [
      { text: 'leggi src/engine/session.ts e riassumi in tre righe cosa fa', set: { effort: 'low' } },
      'e la parte che traduce i messaggi dell\'SDK, cosa fa?',
      { text: 'e la parte dei permessi?', set: { effort: 'high' } },
      'grazie, chiudiamo qui',
    ],
  },
  {
    id: 'sonda-controllo',
    tier: 'cache',
    turns: [
      { text: 'leggi src/engine/session.ts e riassumi in tre righe cosa fa', set: { effort: 'low' } },
      'e la parte che traduce i messaggi dell\'SDK, cosa fa?',
      'e la parte dei permessi?',
      'grazie, chiudiamo qui',
    ],
  },
];

if (listOnly) {
  for (const c of BATTERY) console.log(`${c.tier.padEnd(10)} ${c.id.padEnd(16)} ${c.turns.length} turno/i`);
  console.log(`\n${BATTERY.length} conversazioni, ${BATTERY.reduce((n, c) => n + c.turns.length, 0)} turni`);
  process.exit(0);
}

// ---- il confronto fra due giri ----------------------------------------------
// Non chiama nessuno: legge due registri e li mette a fronte. E' il pezzo che rende
// vera la frase "non peggiora" — a mano, dopo un giro da dieci minuti, quel
// confronto non lo rifa' piu' nessuno.
if (diff) {
  const [aName, bName] = diff.split(/[,:]/);
  if (!aName || !bName) {
    console.error('!! serve --diff giro1,giro2');
    process.exit(2);
  }
  const read = (n) => {
    const p = path.join(root, '.bench', n.endsWith('.json') ? n : n + '.json');
    if (!fs.existsSync(p)) {
      console.error(`!! non trovo ${path.relative(root, p)}`);
      process.exit(2);
    }
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  };
  const A = read(aName);
  const B = read(bName);
  const key = (r) => r.case + '#' + r.n;
  const byKey = new Map(B.turns.map((r) => [key(r), r]));
  const pairs = A.turns.map((r) => [r, byKey.get(key(r))]).filter(([, b]) => b);

  console.log(`${aName} → ${bName}   (${pairs.length} turni in comune)\n`);
  console.log(
    'turno'.padEnd(26) + aName.slice(0, 9).padStart(10) + bName.slice(0, 9).padStart(10) + 'scarto'.padStart(9) + '  tool'
  );
  for (const [a, b] of pairs) {
    const d = a.turnUsd ? Math.round(((b.turnUsd - a.turnUsd) / a.turnUsd) * 100) : 0;
    console.log(
      key(a).padEnd(26) +
        ('$' + (a.turnUsd || 0).toFixed(3)).padStart(10) +
        ('$' + (b.turnUsd || 0).toFixed(3)).padStart(10) +
        ((d > 0 ? '+' : '') + d + '%').padStart(9) +
        '  ' + a.tools + '→' + b.tools
    );
  }
  // Per classe, che e' il livello a cui si decide se una fase si tiene o si butta.
  const tiers = [...new Set(pairs.map(([a]) => a.tier))];
  const tot = (rows, i) => rows.reduce((s, p) => s + (p[i].turnUsd || 0), 0);
  console.log('\n' + 'classe'.padEnd(26) + aName.slice(0, 9).padStart(10) + bName.slice(0, 9).padStart(10) + 'scarto'.padStart(9));
  for (const tier of [...tiers, null]) {
    const rows = tier ? pairs.filter(([a]) => a.tier === tier) : pairs;
    const x = tot(rows, 0);
    const y = tot(rows, 1);
    const d = x ? Math.round(((y - x) / x) * 100) : 0;
    console.log(
      (tier ?? 'TOTALE').padEnd(26) +
        ('$' + x.toFixed(3)).padStart(10) +
        ('$' + y.toFixed(3)).padStart(10) +
        ((d > 0 ? '+' : '') + d + '%').padStart(9)
    );
  }
  process.exit(0);
}

let cases = only ? BATTERY.filter((c) => c.tier === only || c.id === only) : BATTERY;
if (!cases.length) {
  console.error(`!! niente che si chiami "${only}". Prova --list.`);
  process.exit(2);
}
if (limit) cases = cases.slice(0, limit);

// ---- accensione --------------------------------------------------------------
const turns = []; // il registro: una riga per turno
let cur = null; // il turno in volo
let pendingAsks = 0;

const { send, ctx } = boot(onPost);

function onPost(m) {
  switch (m.k) {
    case 'ask': {
      // Sempre "chiede": si dice di si' solo a chi guarda e basta.
      const ok = denyAll ? false : allowAll ? true : READ_ONLY.has(m.tool);
      if (cur) {
        cur.asks++;
        if (!ok) cur.denied++;
      }
      pendingAsks++;
      setTimeout(() => {
        pendingAsks--;
        send({ cmd: 'answer', id: m.id, choice: ok ? 'allow' : 'deny', answers: firstAnswers(m) });
      }, 0);
      return;
    }
    case 'tool_start':
      if (cur) cur.tools++;
      // Partito vuol dire partito: se si legge questo, il permesso non e' passato di
      // qui e il banco ha toccato il repo per davvero.
      if (MUTATING.has(m.name)) trespassed.add(m.name + ' (' + (cur ? cur.case : '?') + ')');
      return;
    case 'delta':
      if (cur && m.kind === 'text') cur.chars += m.text.length;
      if (cur && m.kind === 'thinking') cur.thinkChars += m.text.length;
      return;
    case 'error':
      if (cur) cur.errors.push(String(m.message).slice(0, 200));
      return;
    case 'turn_end':
      if (!cur) return;
      Object.assign(cur, {
        ok: m.ok !== false,
        model: m.model || '',
        effort: m.effort || '',
        durationMs: m.durationMs || 0,
        tokens: m.tokens || 0,
        ctx: m.ctx || { input: 0, cacheRead: 0, cacheCreate: 0, output: 0 },
        turnUsd: m.turnUsd || 0,
        totalUsd: m.totalUsd || 0,
        models: m.models || [],
      });
      cur.done = true;
      return;
  }
}

function firstAnswers(m) {
  if (m.kind !== 'question' || !m.questions) return undefined;
  const a = {};
  for (const q of m.questions) a[q.question] = q.options[0]?.label;
  return a;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Aspetta la fine del turno. Il tempo lungo e' apposta: i difficili ci mettono. */
async function waitTurn(deadlineMs = 300000) {
  const end = Date.now() + deadlineMs;
  while (!cur.done && Date.now() < end) await sleep(150);
  if (!cur.done) cur.errors.push('turno non finito entro il tempo');
  // I permessi rispondono su un setTimeout: si lascia sfilare la coda prima di
  // passare al caso dopo, o l'ultima risposta arriverebbe alla conversazione nuova.
  while (pendingAsks > 0) await sleep(50);
}

const money = (n) => '$' + n.toFixed(4);
const k = (n) => (n >= 1000 ? Math.round(n / 1000) + 'k' : String(n));

(async () => {
  send({ cmd: 'ready' });
  // Mai "yolo": in bypassPermissions gli strumenti partono senza chiedere, e il
  // filtro qui sopra non verrebbe nemmeno interpellato.
  send({ cmd: 'setMode', value: 'default' });
  if (model !== undefined || effort !== undefined) {
    send({
      cmd: 'setPrefs',
      value: { ...(model !== undefined ? { model } : {}), ...(effort !== undefined ? { effort } : {}) },
    });
  }
  await sleep(500);

  const started = Date.now();
  console.log(`banco "${label}" — ${cases.length} conversazioni, ${cases.reduce((n, c) => n + c.turns.length, 0)} turni\n`);

  // Un turno a vuoto, che non entra nei conti. La CLI si scrive la sua cache del
  // prompt al primo messaggio del processo: senza questo il primo caso della
  // batteria paga quindicimila token di cache da creare e gli altri no, e due giri
  // finiscono per differire per come sono partiti invece che per quello che si
  // voleva misurare — che e' il modo piu' facile di avere un righello storto.
  send({ cmd: 'newSession' });
  await sleep(300);
  cur = { case: 'riscaldamento', tier: 'scarto', n: 1, done: false, ok: false, asks: 0, denied: 0, tools: 0, chars: 0, thinkChars: 0, errors: [] };
  send({ cmd: 'send', text: 'rispondi con una parola sola: pronto' });
  await waitTurn();
  console.log(`riscaldamento (fuori dai totali): cache scritta ${k(cur.ctx?.cacheCreate || 0)}, ${money(cur.turnUsd || 0)}\n`);

  /** Un caso, dall'inizio alla fine, sotto un braccio. */
  async function runCase(c, arm) {
    // Conversazione nuova per ogni caso: il contesto di quello prima falserebbe
    // tutto quello che viene dopo.
    send({ cmd: 'newSession' });
    await sleep(300);
    if (arm) {
      send({ cmd: 'setPrefs', value: arm.prefs });
      await sleep(400);
    }

    for (let i = 0; i < c.turns.length; i++) {
      const raw = c.turns[i];
      const turn = typeof raw === 'string' ? { text: raw } : raw;

      // Le preferenze *prima* del messaggio, e con un respiro: il motore le accoda,
      // e mandare subito dopo vuol dire non sapere quale delle due e' arrivata prima.
      if (turn.set) {
        send({ cmd: 'setPrefs', value: turn.set });
        await sleep(400);
      }

      cur = {
        case: c.id,
        tier: c.tier,
        arm: arm ? arm.name : null,
        n: i + 1,
        first: i === 0,
        prompt: turn.text,
        set: turn.set || null,
        done: false,
        ok: false,
        asks: 0,
        denied: 0,
        tools: 0,
        chars: 0,
        thinkChars: 0,
        errors: [],
      };
      turns.push(cur);

      const images = turn.image
        ? [{ mime: 'image/png', data: fs.readFileSync(path.join(root, turn.image)).toString('base64') }]
        : undefined;
      send({ cmd: 'send', text: turn.text, images });
      await waitTurn();

      const x = cur.ctx || {};
      console.log(
        `${(c.tier + '/' + c.id).padEnd(26)} #${cur.n} ${cur.ok ? 'ok ' : 'KO '}` +
          (arm ? `[${arm.name}] `.padEnd(16) : '') +
          `${(cur.model || '?').padEnd(22)} ${(cur.effort || '—').padEnd(7)} ` +
          `${money(cur.turnUsd || 0)}  ctx ${k(cur.tokens || 0).padStart(5)} ` +
          `[in ${k(x.input || 0)} · letta ${k(x.cacheRead || 0)} · scritta ${k(x.cacheCreate || 0)} · out ${k(x.output || 0)}] ` +
          `${cur.tools} tool ${Math.round((cur.durationMs || 0) / 1000)}s` +
          (cur.errors.length ? '  !! ' + cur.errors[0] : '')
      );
    }
  }

  for (let ci = 0; ci < cases.length; ci++) {
    if (!arms.length) {
      await runCase(cases[ci], null);
      continue;
    }
    // I bracci si alternano di posto a ogni caso: chi va per secondo trova la cache
    // gia' scaldata dal primo, e con un ordine fisso quel vantaggio andrebbe sempre
    // allo stesso — che e' il modo di far vincere il braccio sbagliato.
    const order = ci % 2 ? [...arms].reverse() : arms;
    for (const arm of order) await runCase(cases[ci], arm);
  }
  cur = null;

  // ---- i totali ---------------------------------------------------------------
  const sum = (rows, f) => rows.reduce((s, r) => s + (f(r) || 0), 0);
  const tiers = [...new Set(turns.map((r) => r.tier))];
  console.log('\n' + '─'.repeat(96));
  console.log(
    `${'classe'.padEnd(12)}${'turni'.padStart(6)}${'costo'.padStart(11)}${'out tok'.padStart(10)}` +
      `${'cache letta'.padStart(13)}${'cache scritta'.padStart(15)}${'pensiero'.padStart(10)}${'secondi'.padStart(9)}`
  );
  for (const tier of tiers) {
    const rows = turns.filter((r) => r.tier === tier);
    console.log(
      tier.padEnd(12) +
        String(rows.length).padStart(6) +
        money(sum(rows, (r) => r.turnUsd)).padStart(11) +
        k(sum(rows, (r) => r.ctx?.output)).padStart(10) +
        k(sum(rows, (r) => r.ctx?.cacheRead)).padStart(13) +
        k(sum(rows, (r) => r.ctx?.cacheCreate)).padStart(15) +
        k(sum(rows, (r) => r.thinkChars)).padStart(10) +
        String(Math.round(sum(rows, (r) => r.durationMs) / 1000)).padStart(9)
    );
  }
  console.log('─'.repeat(96));
  console.log(
    'TOTALE'.padEnd(12) +
      String(turns.length).padStart(6) +
      money(sum(turns, (r) => r.turnUsd)).padStart(11) +
      k(sum(turns, (r) => r.ctx?.output)).padStart(10) +
      k(sum(turns, (r) => r.ctx?.cacheRead)).padStart(13) +
      k(sum(turns, (r) => r.ctx?.cacheCreate)).padStart(15) +
      k(sum(turns, (r) => r.thinkChars)).padStart(10) +
      String(Math.round(sum(turns, (r) => r.durationMs) / 1000)).padStart(9)
  );

  // ---- il confronto appaiato --------------------------------------------------
  // Questo si', si puo' leggere: i due bracci hanno provato ogni caso a pochi
  // secondi l'uno dall'altro, quindi la differenza fra loro e' la cosa che si e'
  // cambiata e non l'ora del giorno.
  if (arms.length) {
    const [A, B] = arms;
    const armSum = (rows, name) => sum(rows.filter((r) => r.arm === name), (r) => r.turnUsd);
    console.log('\n' + '─'.repeat(96));
    console.log(
      'appaiato'.padEnd(26) + A.name.slice(0, 12).padStart(12) + B.name.slice(0, 12).padStart(12) + 'scarto'.padStart(9)
    );
    for (const tier of [...tiers, null]) {
      const rows = tier ? turns.filter((r) => r.tier === tier) : turns;
      const x = armSum(rows, A.name);
      const y = armSum(rows, B.name);
      const d = x ? Math.round(((y - x) / x) * 100) : 0;
      console.log(
        (tier ?? 'TOTALE').padEnd(26) +
          money(x).padStart(12) +
          money(y).padStart(12) +
          ((d > 0 ? '+' : '') + d + '%').padStart(9)
      );
    }
  }

  const ko = turns.filter((r) => !r.ok);
  if (ko.length) console.log(`\n⚠ ${ko.length} turni non riusciti: ${ko.map((r) => r.case + '#' + r.n).join(', ')}`);
  if (trespassed.size) {
    console.log(`\n‼ HANNO SCRITTO: ${[...trespassed].join(', ')} — controlla \`git status\`, il banco ha toccato il repo`);
  }
  const asked = turns.reduce((n, r) => n + r.asks, 0);
  console.log(`permessi passati dal filtro: ${asked} (${turns.reduce((n, r) => n + r.denied, 0)} rifiutati) su ${turns.reduce((n, r) => n + r.tools, 0)} strumenti — il resto la CLI lo approva da se'`);

  // La sonda si legge da sola: e' l'unica cosa qui che risponde a una domanda
  // invece di misurare e basta. Il terzo turno delle due conversazioni gemelle e'
  // il punto in cui una cambia impegno e l'altra no: si guardano solo quelli.
  const letta = (r) => r.ctx?.cacheRead || 0;
  const terzo = (id) => turns.find((r) => r.case === id && r.n === 3);
  const cambio = terzo('sonda-impegno');
  const controllo = terzo('sonda-controllo');
  if (cambio && controllo) {
    const persa = letta(controllo) > 0 && letta(cambio) < letta(controllo) * 0.7;
    console.log(
      `\nsonda impegno — terzo turno, stesso messaggio: senza cambio cache letta ${k(letta(controllo))}, ` +
        `cambiando impegno ${k(letta(cambio))} → ${persa ? 'CAMBIARE IMPEGNO ROMPE LA CACHE' : 'la cache regge il cambio'}` +
        `\n               e costa: ${money(controllo.turnUsd || 0)} contro ${money(cambio.turnUsd || 0)}`
    );
  }

  // Non in `dist/`: quella cartella la cancella `build.mjs` a ogni build, e una
  // misura che sparisce alla prima `npm run verify` non e' un termine di paragone.
  const out = path.join(root, '.bench', `${label}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(
    out,
    JSON.stringify({ label, model: model ?? null, effort: effort ?? null, at: new Date().toISOString(), seconds: Math.round((Date.now() - started) / 1000), turns }, null, 2)
  );
  console.log(`\nregistro in ${path.relative(root, out)}`);

  for (const d of ctx.subscriptions) d.dispose?.();
  process.exit(ko.length || trespassed.size ? 1 : 0);
})();
