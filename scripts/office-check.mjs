// L'ufficio: la pianta, con una persona per conversazione aperta.
//
// Non ha piu' una pagina sua — e' l'altra faccia della scheda della chat, e il
// bottone nella testata la gira. Quindi il primo controllo e' proprio quello:
// che il bottone porti di la' e che di la' ci sia il bottone per tornare.
//
// Il resto e' quello che a occhio non si nota finche' non da' fastidio:
//  - una persona per conversazione, ognuna alla sua scrivania e nessuna sopra
//    un'altra (due persone nello stesso punto sono una persona, e l'ufficio ha
//    appena smesso di dire quante conversazioni hai aperte);
//  - il posto e' suo: non cambia scrivania a ogni giro, e le persone si
//    RIDIPINGONO invece di essere rifatte — se no la camminata verso la
//    scrivania libera non parte mai;
//  - chi se ne va libera la scrivania, e quella scrivania si puo' riprendere;
//  - il monitor acceso e' sulla scrivania di chi sta lavorando, e su nessun'altra;
//  - cliccare una persona porta davvero alla sua conversazione;
//  - piu' conversazioni che scrivanie: chi avanza sta in piedi, e comunque
//    dentro i muri;
//  - i mobili e la gente sono sprite che devono essere arrivati davvero: un
//    foglio non caricato lascia una stanza di rettangoli invisibili, e da fuori
//    sembra solo un ufficio vuoto.
import { chromium } from 'playwright';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const url = pathToFileURL(path.join(root, 'dist', 'preview.html')).href;

/** Le scrivanie della pianta: office.js ne mette una per posto, sempre le stesse. */
const DESKS = 16;

const card = (over = {}) => ({
  id: 'aaaa',
  shortId: 'aaaaaaaa',
  name: 'Una conversazione',
  own: true,
  tabName: 'Studio',
  preview: '',
  pct: 18,
  tokens: '182.0k',
  costUsd: 0.4,
  lastClock: '09:41',
  lastAgo: 'just now',
  busy: false,
  done: false,
  recent: false,
  focused: false,
  ...over,
});

const data = (cards) => ({
  project: 'claude-studio',
  limit: '1M',
  focusHow: 'studio',
  usage: { session: 34, week: 71 },
  usageWait: '…',
  usageAgeSec: 12,
  usageStale: false,
  sessionReset: 'in 2h 15m',
  weekReset: 'in 3d 4h',
  cards,
  branch: 'main',
  dirty: false,
  totalCostUsd: 1.2,
});

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 940 }, colorScheme: 'dark' });
const fails = [];
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
// Un foglio di sprite che non arriva non fa protestare nessuno: lascia le stanze
// piene di rettangoli invisibili, e da fuori sembra solo un ufficio vuoto.
page.on('requestfailed', (r) => errors.push('non caricato: ' + r.url()));
await page.goto(url);

const t = (cond, msg) => !cond && fails.push(msg);
const post = (m) => page.evaluate((x) => window.postMessage(x, '*'), m);
const ctx = (d) => post({ k: 'ctx', d });
const lastSent = () => page.evaluate(() => (window.__sent || []).at(-1));
const inOffice = () => page.evaluate(() => document.body.classList.contains('inoffice'));

// La scheda si annuncia come scheda: e' quello che tira fuori il bottone
// dell'ufficio, che nella barra laterale non c'e'.
await post({ k: 'hello', cwd: '/x', project: 'x', cliVersion: '1', surface: 'panel' });
await page.waitForTimeout(150);

// ---- il bottone gira la scheda, e la gira anche indietro ----
t(!(await inOffice()), 'la scheda parte dall\'ufficio invece che dalla chat');
t(!(await page.locator('#btnOffice').isHidden()), "in una scheda il bottone dell'ufficio non c'e'");
await page.click('#btnOffice');
await page.waitForTimeout(200);
t(await inOffice(), "il bottone non porta all'ufficio");
t(
  await page.locator('.office .of-back').isVisible(),
  "dall'ufficio non si vede il bottone per tornare alla chat"
);
t(!(await page.locator('.shell').isVisible()), "la chat resta a schermo sotto l'ufficio");
await page.click('.office .of-back');
await page.waitForTimeout(200);
t(!(await inOffice()), "dall'ufficio non si torna alla chat");
t(await page.locator('.shell').isVisible(), 'tornati dalla chat, la chat non c\'e\'');
// E il comando da fuori ("Claude Studio: L'ufficio") apre la scheda gia' girata.
await post({ k: 'view', value: 'office' });
await page.waitForTimeout(200);
t(await inOffice(), "il comando dell'ufficio non gira la scheda");

// ---- la pianta c'e' anche da vuota ----
await ctx(data([]));
await page.waitForTimeout(150);
const plan = await page.evaluate(() => ({
  desks: document.querySelectorAll('.of-desk').length,
  mons: document.querySelectorAll('.of-mon').length,
  stools: document.querySelectorAll('.of-stool').length,
  props: document.querySelectorAll('.office .spr').length,
  people: document.querySelectorAll('.of-guy').length,
  emptyShown: !document.querySelector('.of-nobody').hidden,
  sheet: getComputedStyle(document.querySelector('.office .spr')).backgroundImage,
}));
// Due mattonelle per scrivania: il piano e il cassetto.
t(plan.desks === DESKS * 2, 'le scrivanie sono ' + plan.desks / 2 + ', non ' + DESKS);
t(plan.mons === DESKS, 'i monitor sono ' + plan.mons + ', le scrivanie ' + DESKS);
t(plan.stools === DESKS, 'gli sgabelli sono ' + plan.stools + ', le scrivanie ' + DESKS);
t(plan.props > 80, 'la stanza e\' spoglia: solo ' + plan.props + ' mobili');
t(/url\(/.test(plan.sheet), 'i mobili non hanno il foglio di sprite: ' + plan.sheet);
t(!plan.people, "c'e' gente in ufficio senza nemmeno una conversazione aperta");
t(plan.emptyShown, "l'ufficio vuoto non dice che e' vuoto");

// ---- quattro conversazioni, quattro persone ----
const four = [
  card({ id: 'a', name: 'Sta lavorando', busy: true, recent: true, focused: true, pct: 40 }),
  card({ id: 'b', name: 'Ha finito', own: false, done: true, recent: true, pct: 66 }),
  card({ id: 'c', name: 'Di recente', recent: true, pct: 12 }),
  card({ id: 'd', name: 'Ferma da un pezzo', pct: 7 }),
];
await ctx(data(four));
await page.waitForTimeout(200);
await page.evaluate(() => document.querySelectorAll('.of-guy').forEach((p) => (p.dataset.stamp = 'first')));

const room = await page.evaluate(() => {
  const ps = [...document.querySelectorAll('.of-guy')];
  const rect = (n) => n.getBoundingClientRect();
  const floor = rect(document.querySelector('.of-floor'));
  let gap = Infinity;
  for (let i = 0; i < ps.length; i++)
    for (let j = i + 1; j < ps.length; j++) {
      const a = rect(ps[i]);
      const b = rect(ps[j]);
      gap = Math.min(gap, Math.hypot(a.left - b.left, a.top - b.top));
    }
  return {
    n: ps.length,
    gap,
    out: ps.filter((p) => {
      const r = rect(p);
      return r.left < floor.left || r.right > floor.right || r.top < floor.top || r.bottom > floor.bottom;
    }).length,
    // Ogni persona e' fatta dei tre strati del pacchetto: corpo, maglietta, capelli.
    layers: ps.map((p) => p.querySelectorAll('.of-body .folk').length),
    busy: document.querySelectorAll('.of-guy.busy').length,
    done: document.querySelectorAll('.of-guy.done').length,
    focused: document.querySelectorAll('.of-guy.focused').length,
    working: document.querySelectorAll('.of-mon.working').length,
    taken: document.querySelectorAll('.of-stool.taken').length,
    names: ps.map((p) => p.querySelector('.of-name').textContent),
    labels: ps.map((p) => p.getAttribute('aria-label')),
    emptyShown: !document.querySelector('.of-nobody').hidden,
  };
});

t(room.n === 4, 'le persone sono ' + room.n + ', le conversazioni quattro');
t(room.gap > 30, 'due persone quasi sovrapposte: ' + Math.round(room.gap) + 'px fra loro');
t(!room.out, room.out + ' persone finiscono fuori dai muri');
t(
  room.layers.every((n) => n === 3),
  'una persona non e\' vestita: strati ' + room.layers.join(',')
);
t(room.busy === 1, 'chi sta lavorando sono ' + room.busy + ', dovrebbe essere una');
t(room.done === 1, 'la spunta verde sta su ' + room.done + ' persone, ne vuole una');
t(room.focused === 1, 'il faretto sta su ' + room.focused + ' persone, ne vuole una');
// Il monitor acceso e' la cosa che si vede da lontano: sulla scrivania sbagliata
// dice una bugia sul chi sta lavorando.
t(room.working === 1, room.working + ' monitor accesi, ne lavora una sola');
t(room.taken === 4, 'gli sgabelli occupati sono ' + room.taken + ', le persone quattro');
t(
  room.names.join('|') === 'Sta lavorando|Ha finito|Di recente|Ferma da un pezzo',
  "le targhette non dicono di chi e' la scrivania: " + room.names.join(' | ')
);
t(
  room.labels.every((l) => / — /.test(l || '')),
  "una persona non dice a voce chi e' e come sta: " + room.labels.join(' | ')
);
t(!room.emptyShown, "l'ufficio dice di essere vuoto con quattro persone dentro");

// ---- si ridipingono, e il posto resta il loro ----
const before = await page.evaluate(() =>
  [...document.querySelectorAll('.of-guy')].map((p) => p.style.left + ',' + p.style.top)
);
await ctx(data(four.map((c) => card({ ...c, busy: false, pct: (c.pct + 5) % 100 }))));
await page.waitForTimeout(200);
const after = await page.evaluate(() => ({
  spots: [...document.querySelectorAll('.of-guy')].map((p) => p.style.left + ',' + p.style.top),
  stamps: [...document.querySelectorAll('.of-guy')].filter((p) => p.dataset.stamp === 'first').length,
  working: document.querySelectorAll('.of-mon.working').length,
}));
t(after.stamps === 4, 'le persone vengono rifatte a ogni giro invece che ridipinte: ' + after.stamps);
t(after.spots.join(' ') === before.join(' '), 'qualcuno ha cambiato scrivania senza motivo');
t(!after.working, 'un monitor resta acceso dopo che ha smesso di lavorare');

// ---- cliccare una persona porta alla sua conversazione ----
await page.locator('.of-guy').first().click();
const go = await lastSent();
t(go?.cmd === 'focus' && go.id === 'a', "cliccare una persona non porta di la': " + JSON.stringify(go));

// ---- chi se ne va libera la scrivania ----
const spotOfB = await page.evaluate(() => {
  const p = [...document.querySelectorAll('.of-guy')][1];
  return p.style.left + ',' + p.style.top;
});
await ctx(data([four[0], four[2], four[3], card({ id: 'e', name: 'Appena arrivata', recent: true })]));
await page.waitForTimeout(200);
const reseat = await page.evaluate(() => ({
  n: document.querySelectorAll('.of-guy').length,
  names: [...document.querySelectorAll('.of-name')].map((n) => n.textContent),
  spots: [...document.querySelectorAll('.of-guy')].map((p) => p.style.left + ',' + p.style.top),
}));
t(reseat.n === 4, 'dopo il cambio le persone sono ' + reseat.n);
t(!reseat.names.includes('Ha finito'), 'chi ha chiuso la conversazione e\' rimasto seduto');
t(reseat.spots.includes(spotOfB), "la scrivania di chi se n'e' andato resta vuota per sempre");

// ---- piu' conversazioni che scrivanie ----
await ctx(
  data(Array.from({ length: DESKS + 6 }, (_, i) => card({ id: 'x' + i, name: 'Conversazione ' + i, recent: true })))
);
await page.waitForTimeout(250);
const full = await page.evaluate(() => {
  const floor = document.querySelector('.of-floor').getBoundingClientRect();
  const ps = [...document.querySelectorAll('.of-guy')];
  return {
    n: ps.length,
    out: ps.filter((p) => {
      const r = p.getBoundingClientRect();
      return r.left < floor.left || r.right > floor.right;
    }).length,
  };
});
t(full.n === DESKS + 6, 'con ' + (DESKS + 6) + ' conversazioni le persone sono ' + full.n);
t(!full.out, full.out + ' persone in piedi finiscono fuori dal muro');

t(!errors.length, 'la pagina ha protestato: ' + errors.join(' | '));

await page.screenshot({ path: path.join(root, 'dist', 'preview-office-full.png') });
await browser.close();

if (fails.length) {
  console.error('office-check FAIL\n - ' + fails.join('\n - '));
  process.exit(1);
}
console.log('office-check ok — il bottone, la pianta, la gente e i posti a sedere');
