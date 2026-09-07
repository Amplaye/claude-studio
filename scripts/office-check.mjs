// L'ufficio: la pianta a tutto schermo, con una persona per conversazione aperta.
// Quello che si controlla qui e' quello che a occhio non si nota finche' non da'
// fastidio:
//  - una persona per conversazione, ognuna alla sua scrivania e nessuna sopra un'altra
//    (due persone nello stesso punto sono una persona, e l'ufficio ha appena smesso di
//    dire quante conversazioni hai aperte);
//  - il posto e' suo: non cambia scrivania a ogni giro, e le persone si RIDIPINGONO
//    invece di essere rifatte — se no la camminata verso il posto libero non parte mai;
//  - chi se ne va libera la scrivania, e quella scrivania si puo' riprendere;
//  - il monitor acceso e' sulla scrivania di chi sta lavorando, e su nessun'altra;
//  - cliccare una persona porta davvero alla sua conversazione;
//  - piu' conversazioni che scrivanie: chi avanza sta in piedi, e comunque dentro i
//    muri.
import { chromium } from 'playwright';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const url = pathToFileURL(path.join(root, 'dist', 'preview-office.html')).href;

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
await page.goto(url);

const t = (cond, msg) => !cond && fails.push(msg);
const post = (d) => page.evaluate((x) => window.postMessage({ k: 'data', d: x }, '*'), d);
const lang = (v) => page.evaluate((x) => window.postMessage({ k: 'lang', value: x }, '*'), v);
const lastSent = () => page.evaluate(() => (window.__sent || []).at(-1));

// La pagina si annuncia: senza, l'estensione non saprebbe quando mandare la prima
// istantanea e l'ufficio resterebbe vuoto per sempre.
t((await lastSent())?.cmd === 'ready', "la pagina non si annuncia all'estensione");

// ---- la pianta c'e' anche da vuota ----
await post(data([]));
await page.waitForTimeout(150);
const plan = await page.evaluate(() => ({
  desks: document.querySelectorAll('.desk').length,
  rooms: [...document.querySelectorAll('.rname')].map((n) => n.textContent),
  chairs: document.querySelectorAll('.chair').length,
  people: document.querySelectorAll('.station').length,
  emptyShown: !document.querySelector('.nobody').hidden,
}));
t(plan.desks === 10, 'le scrivanie sono ' + plan.desks + ', non dieci');
t(plan.chairs === plan.desks, 'una sedia per scrivania: ' + plan.chairs + ' su ' + plan.desks);
t(plan.rooms.length === 6, 'le stanze sono ' + plan.rooms.length + ', non sei');
t(
  plan.rooms.every((r) => r && r.trim()),
  'una stanza non ha nome: ' + plan.rooms.join(' | ')
);
t(!plan.people, "c'e' gente in ufficio senza nemmeno una conversazione aperta");
t(plan.emptyShown, "l'ufficio vuoto non dice che e' vuoto");

// ---- le lingue: le stanze cambiano nome, e nessuna resta indietro ----
await lang('it');
await page.waitForTimeout(120);
const it = await page.evaluate(() => [...document.querySelectorAll('.rname')].map((n) => n.textContent));
await lang('en');
await page.waitForTimeout(120);
const en = await page.evaluate(() => [...document.querySelectorAll('.rname')].map((n) => n.textContent));
t(
  it.some((r, i) => r !== en[i]),
  'le stanze non cambiano lingua: ' + it.join(' | ')
);
t(
  it.every((r) => r && r.trim()) && en.every((r) => r && r.trim()),
  'una stanza resta senza nome dopo il cambio lingua'
);

// ---- quattro conversazioni, quattro persone ----
const four = [
  card({ id: 'a', name: 'Sta lavorando', busy: true, recent: true, focused: true, pct: 40 }),
  card({ id: 'b', name: 'Ha finito', own: false, done: true, recent: true, pct: 66 }),
  card({ id: 'c', name: 'Di recente', recent: true, pct: 12 }),
  card({ id: 'd', name: 'Ferma da un pezzo', pct: 7 }),
];
await post(data(four));
await page.waitForTimeout(200);
await page.evaluate(() => document.querySelectorAll('.station').forEach((p) => (p.dataset.stamp = 'first')));

const room = await page.evaluate(() => {
  const ps = [...document.querySelectorAll('.station')];
  const rect = (n) => n.getBoundingClientRect();
  const floor = rect(document.querySelector('.floor'));
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
    busy: document.querySelectorAll('.station.busy').length,
    done: document.querySelectorAll('.station.done').length,
    focused: document.querySelectorAll('.station.focused').length,
    working: document.querySelectorAll('.desk.working').length,
    taken: document.querySelectorAll('.chair.taken').length,
    names: ps.map((p) => p.querySelector('.pname').textContent),
    labels: ps.map((p) => p.getAttribute('aria-label')),
    emptyShown: !document.querySelector('.nobody').hidden,
  };
});

t(room.n === 4, 'le persone sono ' + room.n + ', le conversazioni quattro');
t(room.gap > 40, 'due persone quasi sovrapposte: ' + Math.round(room.gap) + 'px fra loro');
t(!room.out, room.out + ' persone finiscono fuori dai muri');
t(room.busy === 1, 'chi sta lavorando sono ' + room.busy + ', dovrebbe essere una');
t(room.done === 1, 'la spunta verde sta su ' + room.done + ' persone, ne vuole una');
t(room.focused === 1, 'il faretto sta su ' + room.focused + ' persone, ne vuole una');
// Il monitor acceso e' la cosa che si vede da lontano: sulla scrivania sbagliata dice
// una bugia sul chi sta lavorando.
t(room.working === 1, room.working + ' monitor accesi, ne lavora una sola');
t(room.taken === 4, 'le sedie occupate sono ' + room.taken + ', le persone quattro');
t(
  room.names.join('|') === 'Sta lavorando|Ha finito|Di recente|Ferma da un pezzo',
  'le targhette non dicono di chi e\' la scrivania: ' + room.names.join(' | ')
);
t(
  room.labels.every((l) => / — /.test(l || '')),
  'una persona non dice a voce chi e\' e come sta: ' + room.labels.join(' | ')
);
t(!room.emptyShown, "l'ufficio dice di essere vuoto con quattro persone dentro");

// ---- si ridipingono, e il posto resta il loro ----
const before = await page.evaluate(() =>
  [...document.querySelectorAll('.station')].map((p) => p.style.left + ',' + p.style.top)
);
await post(data(four.map((c) => card({ ...c, busy: false, pct: (c.pct + 5) % 100 }))));
await page.waitForTimeout(200);
const after = await page.evaluate(() => ({
  spots: [...document.querySelectorAll('.station')].map((p) => p.style.left + ',' + p.style.top),
  stamps: [...document.querySelectorAll('.station')].filter((p) => p.dataset.stamp === 'first').length,
  working: document.querySelectorAll('.desk.working').length,
}));
t(after.stamps === 4, 'le persone vengono rifatte a ogni giro invece che ridipinte: ' + after.stamps);
t(after.spots.join(' ') === before.join(' '), "qualcuno ha cambiato scrivania senza motivo");
t(!after.working, 'un monitor resta acceso dopo che ha smesso di lavorare');

// ---- cliccare una persona porta alla sua conversazione ----
await page.locator('.station').first().click();
const go = await lastSent();
t(go?.cmd === 'focus' && go.id === 'a', 'cliccare una persona non porta di la\': ' + JSON.stringify(go));

// ---- chi se ne va libera la scrivania ----
const spotOfB = await page.evaluate(() => {
  const p = [...document.querySelectorAll('.station')][1];
  return p.style.left + ',' + p.style.top;
});
await post(data([four[0], four[2], four[3], card({ id: 'e', name: 'Appena arrivata', recent: true })]));
await page.waitForTimeout(200);
const reseat = await page.evaluate(() => ({
  n: document.querySelectorAll('.station').length,
  names: [...document.querySelectorAll('.pname')].map((n) => n.textContent),
  spots: [...document.querySelectorAll('.station')].map((p) => p.style.left + ',' + p.style.top),
}));
t(reseat.n === 4, 'dopo il cambio le persone sono ' + reseat.n);
t(!reseat.names.includes('Ha finito'), 'chi ha chiuso la conversazione e\' rimasto seduto');
t(reseat.spots.includes(spotOfB), 'la scrivania di chi se n\'e\' andato resta vuota per sempre');

// ---- piu' conversazioni che scrivanie ----
await post(data(Array.from({ length: 14 }, (_, i) => card({ id: 'x' + i, name: 'Conversazione ' + i, recent: true }))));
await page.waitForTimeout(250);
const full = await page.evaluate(() => {
  const floor = document.querySelector('.floor').getBoundingClientRect();
  const ps = [...document.querySelectorAll('.station')];
  return {
    n: ps.length,
    out: ps.filter((p) => {
      const r = p.getBoundingClientRect();
      return r.left < floor.left || r.right > floor.right;
    }).length,
  };
});
t(full.n === 14, 'con quattordici conversazioni le persone sono ' + full.n);
t(!full.out, full.out + ' persone in piedi finiscono fuori dal muro');

t(!errors.length, 'la pagina ha protestato: ' + errors.join(' | '));

await page.screenshot({ path: path.join(root, 'dist', 'preview-office-full.png') });
await browser.close();

if (fails.length) {
  console.error('office-check FAIL\n - ' + fails.join('\n - '));
  process.exit(1);
}
console.log('office-check ok — la pianta, la gente e i posti a sedere');
