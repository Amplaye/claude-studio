// Fa recitare al pannello del contesto qualche giro di aggiornamento e controlla le
// cose che a occhio non si notano finche' non danno fastidio:
//  - le card si RIDIPINGONO, non si ricreano (altrimenti addio transizioni, e lo
//    scorrimento salta sotto il dito a ogni tick);
//  - la card in focus dice quanto e' sicuro l'aggancio ("stimata", "ultima attiva")
//    invece di far finta di saperlo;
//  - il costo si vede — nella 0.0.6 veniva raccolto e buttato via;
//  - clic e rinomina partono davvero verso l'estensione.
import { chromium } from 'playwright';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const url = pathToFileURL(path.join(root, 'dist', 'preview-context.html')).href;

const card = (over = {}) => ({
  id: 'aaaaaaaa-1111-2222-3333-444444444444',
  shortId: 'aaaaaaaa',
  name: 'Fase 3 — la barra di contesto',
  own: true,
  tabName: 'Studio',
  preview: 'Continua con la fase 3',
  pct: 18,
  tokens: '182.0k',
  cost: '$0.42',
  lastClock: '09:41',
  lastAgo: 'adesso',
  busy: true,
  recent: true,
  focused: true,
  ...over,
});

const data = (over = {}) => ({
  project: 'claude-studio',
  limit: '1M',
  focusHow: 'studio',
  usage: { session: 34, week: 71 },
  usageWait: 'caricamento…',
  sessionReset: 'tra 2h 15m',
  weekReset: 'tra 3g 4h',
  cards: [card()],
  branch: 'master',
  dirty: true,
  totalCost: '$1.20',
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

  // La pagina si annuncia da sola: senza questo l'estensione non saprebbe quando
  // mandare la prima fotografia.
  t((await lastSent())?.cmd === 'ready', 'la pagina non si annuncia all’estensione');

  // ---- un primo giro ----
  await post(data());
  // Si aspetta che la scia di entrata finisca: altrimenti al giro dopo non si
  // distingue una scia rilanciata da una ancora in volo.
  await page.waitForTimeout(900);

  const first = await page.evaluate(() => {
    const c = document.querySelector('.ctxcard');
    if (c) c.dataset.stamp = 'primo'; // se sopravvive, la card non e' stata ricreata
    document.querySelector('.acell').dataset.stamp = 'primo';
    return {
      cells: [...document.querySelectorAll('.acell .av')].map((n) => n.textContent),
      resets: [...document.querySelectorAll('.acell .ar')].map((n) => n.textContent),
      name: document.querySelector('.cname')?.textContent,
      pct: document.querySelector('.cpct')?.textContent,
      tok: document.querySelector('.ctok')?.textContent,
      cost: document.querySelector('.ccost')?.textContent,
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

  t(first.cells.join('|') === '34%|71%', 'i numeri dell’account non ci sono: ' + first.cells.join('|'));
  t(first.resets[0] === 'reset tra 2h 15m', 'il reset non e’ scritto: ' + first.resets[0]);
  t(/Fase 3/.test(first.name || ''), 'il nome della card manca: ' + first.name);
  t(first.pct === '18%', 'la percentuale non c’e’: ' + first.pct);
  t(first.tok === '182.0k / 1M', 'i token non sono scritti sul limite: ' + first.tok);
  t(first.cost === '$0.42', 'il costo della conversazione non si vede: ' + first.cost);
  t(first.pill === 'Studio', 'la pillola non dice da dove viene la sessione: ' + first.pill);
  t(first.badge && first.focused, 'la sessione in focus non e’ marcata');
  t(first.own, 'la card della nostra chat non e’ riconosciuta come nostra');
  t(first.busyDot, 'il pallino di chi sta lavorando non pulsa');
  t(first.kind === '#ion-sparkles', 'icona sbagliata per la nostra conversazione: ' + first.kind);
  t(first.fillW === '18%', 'la barra non segue la percentuale: ' + first.fillW);
  // con l'aggancio certo non si deve leggere nessun dubbio
  t(!/stimata|ultima attiva/.test(first.sub || ''), 'la card dubita di un aggancio certo: ' + first.sub);

  // ---- secondo giro: stessa sessione, numeri nuovi ----
  await post(
    data({
      cards: [card({ pct: 64, tokens: '640.0k', cost: '$0.90', busy: false, lastAgo: '2 min fa' })],
      focusHow: 'posizione',
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

  t(second.stamp === 'primo', 'la card e’ stata ricreata invece che ridipinta');
  t(second.acctStamp === 'primo', 'le celle dell’account vengono ricostruite a ogni giro');
  // Numeri dell'account fermi: la scia non deve ripartire da sola mentre leggi.
  t(second.acctGlide === 0, 'la barra dell’account rilancia la scia senza motivo');
  t(second.cards === 1, 'card duplicate: ' + second.cards);
  t(second.pct === '64%', 'la percentuale non si e’ aggiornata: ' + second.pct);
  t(second.fillW === '64%', 'la barra non si e’ mossa: ' + second.fillW);
  t(/warn/.test(second.fillBg || ''), 'oltre il 60% la barra non passa all’ambra: ' + second.fillBg);
  t(second.glide, 'la barra si muove senza la scia');
  t(!second.busyDot, 'il pallino resta "attiva ora" su una sessione ferma');
  t(/stimata/.test(second.sub || ''), 'un aggancio incerto non viene dichiarato: ' + second.sub);

  // ---- una seconda sessione, dell'estensione ufficiale, e il sorpasso ----
  await post(
    data({
      focusHow: 'tab',
      cards: [
        card({ id: 'bbbb', shortId: 'bbbbbbbb', name: 'CRM — reminder', own: false, tabName: 'crm-e6', pct: 91, tokens: '910.0k', cost: '$3.10', busy: false, focused: true }),
        card({ focused: false, pct: 64, tokens: '640.0k', cost: '$0.90', busy: false }),
      ],
    })
  );
  await page.waitForTimeout(120);

  const third = await page.evaluate(() => {
    const cs = [...document.querySelectorAll('.ctxcard')];
    return {
      n: cs.length,
      order: cs.map((c) => c.querySelector('.cname').textContent),
      stampStillThere: cs.some((c) => c.dataset.stamp === 'primo'),
      firstOwn: cs[0].classList.contains('own'),
      firstKind: cs[0].querySelector('.cico use')?.getAttribute('href'),
      firstFill: cs[0].querySelector('.fill')?.style.background,
      badges: cs.filter((c) => !c.querySelector('.badge').hidden).length,
      hOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      squashed: cs.filter((c) => c.scrollHeight > c.clientHeight + 2).map((c) => c.className),
    };
  });

  t(third.n === 2, 'le due sessioni non ci sono entrambe: ' + third.n);
  t(third.order[0] === 'CRM — reminder', 'la sessione in focus non e’ salita in cima: ' + third.order.join(' | '));
  t(third.stampStillThere, 'riordinando la lista le card sono state ricostruite');
  t(!third.firstOwn, 'una tab dell’ufficiale e’ marcata come nostra');
  t(third.firstKind === '#ion-chatbubble-ellipses', 'icona sbagliata per una tab dell’ufficiale: ' + third.firstKind);
  t(/bad/.test(third.firstFill || ''), 'oltre l’80% la barra non passa al rosso: ' + third.firstFill);
  t(third.badges === 1, 'il badge "qui" e’ su piu’ di una card: ' + third.badges);
  t(!third.hOverflow, 'il pannello sfonda in orizzontale');
  t(!third.squashed.length, 'card schiacciate dal flex: ' + third.squashed.join(' | '));

  // ---- clic, rinomina, tasti della testata ----
  await page.locator('.ctxcard').nth(1).locator('.ren').click();
  const ren = await lastSent();
  t(ren?.cmd === 'rename' && ren.id.startsWith('aaaaaaaa'), 'la rinomina non parte: ' + JSON.stringify(ren));

  await page.locator('.ctxcard').first().click();
  const go = await lastSent();
  t(go?.cmd === 'focus' && go.id === 'bbbb', 'il clic sulla card non porta alla sessione: ' + JSON.stringify(go));

  await page.click('.btnRefresh');
  t((await lastSent())?.cmd === 'refresh', 'il tasto aggiorna non fa niente');
  await page.click('.btnDiag');
  t((await lastSent())?.cmd === 'diagnose', 'il tasto della diagnostica non fa niente');

  // ---- stati di magra: nessuna sessione, numeri dell'account non ancora arrivati ----
  await post(data({ cards: [], usage: null, usageWait: 'limite API — riprovo tra 8m', branch: '' }));
  await page.waitForTimeout(120);
  const empty = await page.evaluate(() => ({
    empty: document.querySelector('.empty')?.textContent,
    wait: document.querySelector('.await')?.textContent,
  }));
  t(/Nessuna conversazione/.test(empty.empty || ''), 'manca lo stato vuoto: ' + empty.empty);
  t(/limite API/.test(empty.wait || ''), 'non si distingue l’attesa dal limite API: ' + empty.wait);

  // e tornando indietro le card si ricostruiscono senza lasciare buchi
  await post(data());
  await page.waitForTimeout(120);
  t((await page.locator('.ctxcard').count()) === 1, 'dopo lo stato vuoto la card non torna');

  t(errors.length === 0, 'errori JS in pagina: ' + errors.join(' | '));

  await page.screenshot({ path: path.join(root, 'dist', `preview-context-${width}.png`), fullPage: true });
  await page.close();
}

await browser.close();

if (fails.length) {
  console.error('FALLITO:\n- ' + fails.join('\n- '));
  process.exit(1);
}
console.log('context-check ok — screenshot in dist/preview-context-*.png');
