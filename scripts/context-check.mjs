// Makes the context panel act out a few refresh rounds and checks the things you
// don't notice by eye until they start to bother you:
//  - the cards get REPAINTED, not recreated (otherwise goodbye transitions, and the
//    scroll jumps under your finger on every tick);
//  - the focused card says how sure the match is ("estimated", "last active")
//    instead of pretending to know;
//  - the dollar figure is NOT shown: it was taken out on purpose;
//  - clicks and renames really do travel to the extension.
import { chromium } from 'playwright';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const url = pathToFileURL(path.join(root, 'dist', 'preview-context.html')).href;

const card = (over = {}) => ({
  id: 'aaaaaaaa-1111-2222-3333-444444444444',
  shortId: 'aaaaaaaa',
  name: 'Phase 3 — the context bar',
  own: true,
  tabName: 'Studio',
  preview: 'Carry on with phase 3',
  pct: 18,
  tokens: '182.0k',
  costUsd: 0.42,
  lastClock: '09:41',
  lastAgo: 'just now',
  busy: true,
  done: false,
  recent: true,
  focused: true,
  ...over,
});

const data = (over = {}) => ({
  project: 'claude-studio',
  limit: '1M',
  focusHow: 'studio',
  usage: { session: 34, week: 71 },
  usageWait: 'loading…',
  sessionReset: 'in 2h 15m',
  weekReset: 'in 3d 4h',
  cards: [card()],
  branch: 'master',
  dirty: true,
  totalCostUsd: 1.2,
  ...over,
});

const browser = await chromium.launch();
const fails = [];

for (const width of [320, 620]) {
  const page = await browser.newPage({ viewport: { width, height: 820 }, colorScheme: 'dark' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url);

  const post = (d) => page.evaluate((x) => window.postMessage({ k: 'data', d: x }, '*'), d);
  const t = (cond, msg) => !cond && fails.push(`[${width}px] ` + msg);
  const lastSent = () => page.evaluate(() => (window.__sent || []).at(-1));

  // The page announces itself: without this the extension wouldn't know when to
  // send the first snapshot.
  t((await lastSent())?.cmd === 'ready', 'the page does not announce itself to the extension');

  // ---- a first round ----
  await post(data());
  // Wait for the entry trail to finish: otherwise on the next round you can't tell
  // a re-launched trail from one still in flight.
  await page.waitForTimeout(900);

  const first = await page.evaluate(() => {
    const c = document.querySelector('.ctxcard');
    if (c) c.dataset.stamp = 'first'; // if it survives, the card was not recreated
    document.querySelector('.acell').dataset.stamp = 'first';
    return {
      cells: [...document.querySelectorAll('.acell .av')].map((n) => n.textContent),
      resets: [...document.querySelectorAll('.acell .ar')].map((n) => n.textContent),
      name: document.querySelector('.cname')?.textContent,
      pct: document.querySelector('.cpct')?.textContent,
      tok: document.querySelector('.ctok')?.textContent,
      ccost: !!document.querySelector('.ccost'),
      pill: document.querySelector('.tabpill')?.textContent,
      sub: document.querySelector('.csub')?.textContent,
      badge: !document.querySelector('.badge')?.hidden,
      focused: !!document.querySelector('.ctxcard.focused'),
      own: !!document.querySelector('.ctxcard.own'),
      busyDot: !!document.querySelector('.dot.busy'),
      kind: document.querySelector('.cico use')?.getAttribute('href'),
      fillW: document.querySelector('.ctxcard .fill')?.style.width,
    };
  });

  t(first.cells.join('|') === '34%|71%', 'the account numbers are missing: ' + first.cells.join('|'));
  t(first.resets[0] === 'resets in 2h 15m', 'the reset is not written out: ' + first.resets[0]);
  t(/Phase 3/.test(first.name || ''), 'the card name is missing: ' + first.name);
  t(first.pct === '18%', 'the percentage is missing: ' + first.pct);
  t(first.tok === '182.0k / 1M', 'the tokens are not written against the limit: ' + first.tok);
  t(first.ccost === false, 'the dollar figure is back in the card: it must not be shown');
  t(first.pill === 'Studio', 'the pill does not say where the session comes from: ' + first.pill);
  t(first.badge && first.focused, 'the focused session is not marked');
  t(first.own, 'the card for our own chat is not recognised as ours');
  t(first.busyDot, 'the dot for whoever is working does not pulse');
  t(first.kind === '#ion-sparkles', 'wrong icon for our own conversation: ' + first.kind);
  t(first.fillW === '18%', 'the bar does not follow the percentage: ' + first.fillW);
  // when the match is certain there must be no hint of doubt
  t(!/estimated|last active/.test(first.sub || ''), 'the card doubts a certain match: ' + first.sub);

  // ---- second round: same session, new numbers ----
  await post(
    data({
      cards: [card({ pct: 64, tokens: '640.0k', costUsd: 0.9, busy: false, lastAgo: '2 min ago' })],
      focusHow: 'position',
    })
  );
  await page.waitForTimeout(120);

  const second = await page.evaluate(() => ({
    stamp: document.querySelector('.ctxcard')?.dataset.stamp,
    acctStamp: document.querySelector('.acell')?.dataset.stamp,
    acctGlide: [...document.querySelectorAll('.acell .fill')].filter((f) => f.classList.contains('glide')).length,
    cards: document.querySelectorAll('.ctxcard').length,
    pct: document.querySelector('.cpct')?.textContent,
    fillW: document.querySelector('.ctxcard .fill')?.style.width,
    fillBg: document.querySelector('.ctxcard .fill')?.style.background,
    glide: document.querySelector('.ctxcard .fill')?.classList.contains('glide'),
    busyDot: !!document.querySelector('.dot.busy'),
    sub: document.querySelector('.csub')?.textContent,
  }));

  t(second.stamp === 'first', 'the card was recreated instead of repainted');
  t(second.acctStamp === 'first', 'the account cells are rebuilt on every round');
  // Account numbers hold still: the trail must not restart on its own while you read.
  t(second.acctGlide === 0, 'the account bar replays the trail for no reason');
  t(second.cards === 1, 'duplicated cards: ' + second.cards);
  t(second.pct === '64%', 'the percentage did not update: ' + second.pct);
  t(second.fillW === '64%', 'the bar did not move: ' + second.fillW);
  t(/warn/.test(second.fillBg || ''), 'past 60% the bar does not turn amber: ' + second.fillBg);
  t(second.glide, 'the bar moves without the trail');
  t(!second.busyDot, 'the dot stays on "active now" for an idle session');
  t(/estimated/.test(second.sub || ''), 'an uncertain match is not declared: ' + second.sub);

  // ---- a second session, from the official extension, and the overtake ----
  await post(
    data({
      focusHow: 'tab',
      cards: [
        card({ id: 'bbbb', shortId: 'bbbbbbbb', name: 'CRM — reminder', own: false, tabName: 'crm-e6', pct: 91, tokens: '910.0k', costUsd: 3.1, busy: false, focused: true }),
        card({ focused: false, pct: 64, tokens: '640.0k', costUsd: 0.9, busy: false }),
      ],
    })
  );
  await page.waitForTimeout(120);

  const third = await page.evaluate(() => {
    const cs = [...document.querySelectorAll('.ctxcard')];
    return {
      n: cs.length,
      order: cs.map((c) => c.querySelector('.cname').textContent),
      stampStillThere: cs.some((c) => c.dataset.stamp === 'first'),
      firstOwn: cs[0].classList.contains('own'),
      firstKind: cs[0].querySelector('.cico use')?.getAttribute('href'),
      firstFill: cs[0].querySelector('.fill')?.style.background,
      badges: cs.filter((c) => !c.querySelector('.badge').hidden).length,
      hOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      squashed: cs.filter((c) => c.scrollHeight > c.clientHeight + 2).map((c) => c.className),
    };
  });

  t(third.n === 2, 'the two sessions are not both there: ' + third.n);
  t(third.order[0] === 'CRM — reminder', 'the focused session did not move to the top: ' + third.order.join(' | '));
  t(third.stampStillThere, 'reordering the list rebuilt the cards');
  t(!third.firstOwn, 'a tab from the official extension is marked as ours');
  t(third.firstKind === '#ion-chatbubble-ellipses', 'wrong icon for a tab from the official extension: ' + third.firstKind);
  t(/bad/.test(third.firstFill || ''), 'past 80% the bar does not turn red: ' + third.firstFill);
  t(third.badges === 1, 'the "you are here" badge is on more than one card: ' + third.badges);
  t(!third.hOverflow, 'the panel overflows sideways');
  t(!third.squashed.length, 'cards squashed by the flex: ' + third.squashed.join(' | '));

  // ---- "ha finito": quale conversazione ti aspetta ----
  // Il suono dice che qualcosa e' pronto, non quale. Con due carte sullo schermo
  // il segnalino deve stare su una sola: quella che ha finito mentre guardavi
  // altrove — e mai su quella che stai guardando.
  await post(
    data({
      cards: [
        card({ id: 'bbbb', shortId: 'bbbbbbbb', name: 'CRM — reminder', own: true, busy: false, focused: true, done: false }),
        card({ name: 'Fattura, arrotondamenti', busy: false, focused: false, done: true }),
      ],
    })
  );
  await page.waitForTimeout(160);
  const done = await page.evaluate(() => {
    const cs = [...document.querySelectorAll('.ctxcard')];
    return {
      shown: cs.filter((c) => !c.querySelector('.donebadge').hidden).length,
      onTheDoneOne: !cs
        .find((c) => c.querySelector('.cname').textContent.startsWith('Fattura'))
        .querySelector('.donebadge').hidden,
      onTheOneYouAreIn: !cs
        .find((c) => c.querySelector('.cname').textContent.startsWith('CRM'))
        .querySelector('.donebadge').hidden,
      ring: cs.filter((c) => c.classList.contains('done')).length,
    };
  });
  t(done.shown === 1, 'the "done" mark is on ' + done.shown + ' cards, it should be on one');
  t(done.onTheDoneOne, 'the conversation that finished carries no mark');
  t(!done.onTheOneYouAreIn, 'the one you are looking at is marked as "you missed this"');
  t(done.ring === 1, 'the card that finished is not marked out from the others');

  // ---- clicks, rename, header buttons ----
  await page.locator('.ctxcard').nth(1).locator('.ren').click();
  const ren = await lastSent();
  t(ren?.cmd === 'rename' && ren.id.startsWith('aaaaaaaa'), 'the rename does not fire: ' + JSON.stringify(ren));

  await page.locator('.ctxcard').first().click();
  const go = await lastSent();
  t(go?.cmd === 'focus' && go.id === 'bbbb', 'clicking the card does not take you to the session: ' + JSON.stringify(go));

  // ---- la × chiude quella conversazione, e solo quella ----
  // Chiudere e' un'intenzione, e prima non c'era modo di dirla: una card se ne andava
  // solo quando la sua conversazione moriva per conto suo. La × deve mandare `close`
  // con l'id della card su cui hai premuto, e non deve far scattare il `focus` della
  // card che le sta sotto.
  await page.locator('.ctxcard').nth(1).locator('.shut').click();
  const shut = await lastSent();
  t(
    shut?.cmd === 'close' && shut.id.startsWith('aaaaaaaa'),
    'la × non chiude la conversazione: ' + JSON.stringify(shut)
  );

  // There are no buttons in the header any more: the refresh runs continuously on
  // its own, and the diagnostics live in the command palette. If they show up here
  // again, that's a step backwards and it needs to be seen right away.
  t(
    (await page.locator('.hdr-top .iconbtn').count()) === 0,
    'buttons are back in the context header'
  );

  // ---- lean states: no sessions, account numbers not in yet ----
  await post(data({ cards: [], usage: null, usageWait: 'API limit — retrying in 8m', branch: '' }));
  await page.waitForTimeout(120);
  const empty = await page.evaluate(() => ({
    empty: document.querySelector('.empty')?.textContent,
    wait: document.querySelector('.await')?.textContent,
  }));
  t(/No conversations/.test(empty.empty || ''), 'the empty state is missing: ' + empty.empty);
  t(/API limit/.test(empty.wait || ''), 'you cannot tell waiting from the API limit: ' + empty.wait);

  // and going back the cards rebuild without leaving holes
  await post(data());
  await page.waitForTimeout(120);
  t((await page.locator('.ctxcard').count()) === 1, 'after the empty state the card does not come back');

  // ---- i passi, dentro la card della loro conversazione ----
  // Stavano in un pannello loro, che era un riquadro in piu' da aprire per leggere
  // una cosa che riguarda la conversazione di cui hai gia' la card sotto gli occhi;
  // poi in una sezione sola in fondo alla colonna, che con piu' conversazioni aperte
  // mostrava i passi di una e non diceva di quale. Adesso ogni lista arriva sotto
  // l'id della sua conversazione e finisce dentro la sua card. Da vuoti non devono
  // occupare niente: una riga fissa che dice "ancora nessuna task" e' rumore per il
  // 90% del tempo, e moltiplicata per il numero di card e' rumore tre volte.
  const ID = 'aaaaaaaa-1111-2222-3333-444444444444';
  const steps = (d) =>
    page.evaluate((x) => window.postMessage({ k: 'tasks', d: x }, '*'), d ? { [ID]: d } : {});
  const list = (over = {}) => ({
    items: [
      { content: 'Read the transcript', activeForm: 'Reading the transcript', status: 'completed' },
      { content: 'Fix the counter', activeForm: 'Fixing the counter', status: 'in_progress' },
      { content: 'Run the checks', activeForm: 'Running the checks', status: 'pending' },
    ],
    done: 1,
    total: 3,
    active: 1,
    busy: true,
    ...over,
  });

  await steps(null);
  await page.waitForTimeout(80);
  t(await page.locator('.csteps').isHidden(), 'la sezione dei passi occupa spazio da vuota');

  await steps(list());
  await page.waitForTimeout(500);
  const tk = await page.evaluate(() => {
    const sec = document.querySelector('.csteps');
    const cards = document.querySelector('.cards');
    return {
      shown: !sec.hidden,
      // Dentro la card, non sotto a tutte: e' il posto che le da' un senso — i passi
      // sono di quella conversazione li', e con tre card aperte non c'e' piu' niente
      // da indovinare su di chi siano.
      insideCard: !!sec.closest('.ctxcard'),
      sameScroller: !!cards.contains(sec),
      rows: sec.querySelectorAll('.tk-row').length,
      running: sec.querySelectorAll('.tk-row.in_progress').length,
      ticked: sec.querySelectorAll('.tk-row.completed').length,
      count: sec.querySelector('.tk-count')?.textContent,
      // L'animazione della riga in corso e' l'unica cosa viva del pannello: se
      // sparisce, la lista diventa una tabella e non si vede piu' dove sei.
      beat: getComputedStyle(sec.querySelector('.tk-row.in_progress .ico')).animationName,
    };
  });
  t(tk.shown, 'i passi non compaiono quando ci sono');
  t(tk.insideCard, 'i passi non stanno dentro la card della loro conversazione');
  t(tk.sameScroller, 'i passi scorrono in un riquadro separato dalle card');
  t(tk.rows === 3, 'i passi disegnati sono ' + tk.rows + ' invece di 3');
  t(tk.running === 1, 'il passo in corso non e\' segnato: ' + tk.running);
  t(tk.ticked === 1, 'il passo finito non e\' spuntato: ' + tk.ticked);
  t(/1 of 3/.test(tk.count || ''), 'il conteggio dei passi e\' sbagliato: ' + tk.count);
  t(tk.beat === 'tk-beat', 'il passo in corso non pulsa: ' + tk.beat);

  // Nessun passo va scritto in grigio. La regola sta in cima a tokens.css — il testo
  // e' bianco pieno, la gerarchia la fanno corpo e peso — e questa sezione la
  // rompeva in cinque punti: la riga di attesa, il "ne restano", la parola di stato e
  // ogni riga che non fosse quella in corso stavano fra il 50 e il 70 percento. Su
  // questo fondo e' la differenza fra leggere e indovinare.
  const faded = await page.evaluate(() => {
    const bad = [];
    for (const n of document.querySelectorAll('.csteps .tk-row, .csteps .tk-count, .csteps .tk-left, .csteps .tk-state, .csteps .tk-empty')) {
      const o = parseFloat(getComputedStyle(n).opacity);
      if (o < 0.95) bad.push(n.className + '@' + o);
    }
    return bad;
  });
  t(faded.length === 0, 'testo dei passi scritto in grigio: ' + faded.join(' | '));

  // Lo scatto si fa con i passi a schermo: da vuoti la sezione non c'e', e una
  // sezione che non c'e' non si puo' guardare.
  await page.screenshot({
    path: path.join(root, 'dist', `preview-context-steps-${width}.png`),
    fullPage: true,
  });

  // ---- due conversazioni aperte, due liste ----
  // Il motivo per cui i passi si sono spostati dentro le card. Con una sezione sola
  // in fondo alla colonna, di questi sei passi ne vedevi tre e non sapevi di quale
  // delle due conversazioni fossero — e cambiavano da soli ogni volta che l'altra si
  // muoveva. Ogni lista deve stare nella sua card, e restarci.
  await post(
    data({
      cards: [
        card({ name: 'Studio — i passi' }),
        card({ id: 'bbbb', shortId: 'bbbbbbbb', name: 'CRM — reminder', focused: false, busy: false }),
      ],
    })
  );
  await page.evaluate(
    (x) => window.postMessage({ k: 'tasks', d: x }, '*'),
    {
      [ID]: list(),
      bbbb: {
        items: [{ content: 'Send the reminder', status: 'completed' }],
        done: 1,
        total: 1,
        active: -1,
        busy: false,
      },
    }
  );
  await page.waitForTimeout(200);
  const split = await page.evaluate(() =>
    [...document.querySelectorAll('.ctxcard')].map((c) => ({
      name: c.querySelector('.cname').textContent,
      rows: [...c.querySelectorAll('.csteps .tk-txt')].map((n) => n.textContent).join(' | '),
    }))
  );
  t(split.length === 2, 'le due conversazioni non sono entrambe a schermo: ' + split.length);
  t(
    split[0].rows === 'Read the transcript | Fixing the counter | Run the checks',
    'la prima conversazione non ha i suoi passi: ' + split[0].rows
  );
  t(
    split[1].rows === 'Send the reminder',
    'la seconda conversazione ha i passi di un\'altra: ' + split[1].rows
  );
  await page.screenshot({
    path: path.join(root, 'dist', `preview-context-steps2-${width}.png`),
    fullPage: true,
  });

  // Una lista che se ne va lascia la sua card intatta e non tocca quella accanto.
  await page.evaluate((x) => window.postMessage({ k: 'tasks', d: x }, '*'), { bbbb: { items: [{ content: 'Send the reminder', status: 'completed' }], done: 1, total: 1, active: -1, busy: false } });
  await page.waitForTimeout(120);
  const left = await page.evaluate(() =>
    [...document.querySelectorAll('.ctxcard')].map((c) => c.querySelectorAll('.csteps .tk-row').length)
  );
  t(left[0] === 0, 'i passi della conversazione azzerata sono rimasti: ' + left[0]);
  t(left[1] === 1, 'azzerare una conversazione ha portato via i passi dell\'altra: ' + left[1]);

  // Rimessa a una sola card per quello che viene dopo.
  await post(data({ cards: [card()] }));
  await steps(list());
  await page.waitForTimeout(120);

  // Finita la conversazione la sezione si ritira: le task erano di quel prompt.
  await steps(null);
  await page.waitForTimeout(80);
  t(await page.locator('.csteps').isHidden(), 'i passi restano a schermo dopo essere stati azzerati');

  t(errors.length === 0, 'JS errors on the page: ' + errors.join(' | '));

  await page.screenshot({ path: path.join(root, 'dist', `preview-context-${width}.png`), fullPage: true });
  await page.close();
}

await browser.close();

if (fails.length) {
  console.error('FAILED:\n- ' + fails.join('\n- '));
  process.exit(1);
}
console.log('context-check ok — screenshots in dist/preview-context-*.png');
