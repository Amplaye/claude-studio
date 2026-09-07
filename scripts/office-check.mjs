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
//    sembra solo un ufficio vuoto;
//  - e nei mobili non ci si passa dentro. La stanza tiene una griglia di dove
//    si possono mettere i piedi, e nessuno deve mai trovarsi su una casella
//    occupata: ne' da seduto, ne' in piedi in fondo al salone;
//  - la posta: una busta per turno che comincia e una per turno che finisce,
//    nessuna al primo giro (se no aprire la scheda e' una raffica di buste), e
//    tutte se ne vanno da sole quando sono atterrate;
//  - i capi e i loro impiegati: ogni conversazione e' un capo, i sub-agent che
//    apre sono i suoi, e ognuno deve stare accanto AL SUO — due capi vicini con
//    gli impiegati mescolati sono due capi senza nessuno;
//  - la bacheca: un foglietto per cosa da fare, e il colore dice quale. Quello
//    che conta e' che il foglio sia UNO — quello che sta camminando in mano a
//    qualcuno non deve stare anche appeso al muro, se no la bacheca conta due
//    volte lo stesso lavoro;
//  - l'aura del capo: chi ce l'ha a due passi ogni tanto gli tira una battuta, e
//    il numero dentro la battuta e' vero — viene dal quadro delle task di quel
//    capo li'. Un numero sbagliato in bocca a qualcuno e' peggio di nessun numero;
//  - e le tazze: sono quattro e restano quattro, comunque girino fra la
//    rastrelliera, le mani e le scrivanie. Una tazza persa non si vede finche'
//    non sono finite tutte, e a quel punto e' finito il caffe' in un ufficio
//    dove nessuno ha bevuto niente.
import { chromium } from 'playwright';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const url = pathToFileURL(path.join(root, 'dist', 'preview.html')).href;

/** Le scrivanie della pianta: room.js ne mette una per posto, sempre le stesse. */
const DESKS = 6;

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
const tasks = (d) => post({ k: 'tasks', d });
const lastSent = () => page.evaluate(() => (window.__sent || []).at(-1));
const sent = (cmd) => page.evaluate((c) => (window.__sent || []).some((m) => m.cmd === c), cmd);
const inOffice = () => page.evaluate(() => document.body.classList.contains('inoffice'));

// La scheda si annuncia come scheda: e' quello che tira fuori il bottone
// dell'ufficio, che nella barra laterale non c'e'.
await post({ k: 'hello', cwd: '/x', project: 'x', cliVersion: '1', surface: 'panel' });
await page.waitForTimeout(150);

// ---- il bottone chiede la scheda dell'ufficio, e di la' si torna indietro ----
t(!(await inOffice()), 'la scheda parte dall\'ufficio invece che dalla chat');
t(!(await page.locator('#btnOffice').isHidden()), "in una scheda il bottone dell'ufficio non c'e'");
// Il bottone non gira piu' questa scheda. Girarla voleva dire mettere la chat
// accanto alla pianta, e la chat si prendeva la larghezza che le serviva: la
// stanza si rimpiccioliva per far posto alla conversazione. L'ufficio ha una
// scheda sua, con dentro la sua chat, e il bottone la chiede all'estensione.
await page.click('#btnOffice');
await page.waitForTimeout(200);
t(!(await inOffice()), "il bottone gira questa scheda invece di chiedere quella dell'ufficio");
t(await sent('openOffice'), "il bottone non chiede la scheda dell'ufficio");
// E quella scheda nasce gia' girata: gliela gira l'host appena e' in piedi.
await post({ k: 'view', value: 'office' });
await page.waitForTimeout(200);
t(await inOffice(), "la scheda dell'ufficio non nasce sulla pianta");
t(
  await page.locator('.office .of-back').isVisible(),
  "dall'ufficio non si vede il bottone per tornare alla chat"
);
// La chat non sparisce: sta accanto alla pianta, ed e' il punto — l'ufficio e'
// un posto dove si lavora, non un quadro da guardare.
t(await page.locator('.shell').isVisible(), "dall'ufficio la chat non si vede: non ci si puo' lavorare");
t(await page.locator('#input').isVisible(), "dall'ufficio non si puo' scrivere a Claude");
t(!(await page.locator('.rail').isVisible()), "la colonna del contesto ripete a parole quello che la stanza dice a figure");
// Il guaio da cui e' nata la scheda a parte: la colonna della chat non scendeva
// sotto la larghezza del suo contenuto — una testata piena di bottoni — e se la
// prendeva tutta alla pianta, che restava una striscia. La stanza e' la parte
// grande, se no non e' una stanza.
const split = await page.evaluate(() => ({
  office: document.querySelector('.office').getBoundingClientRect().width,
  shell: document.querySelector('.shell').getBoundingClientRect().width,
}));
t(
  split.office > split.shell,
  'la chat si prende piu\' spazio della pianta: ' +
    Math.round(split.shell) +
    ' contro ' +
    Math.round(split.office)
);
// ---- e la testata della chat, adesso che e' una colonna stretta ----
//
// Con l'ufficio aperto la scheda e' larga ma la colonna della chat no: sta fra
// 340 e 520 pixel, la stessa misura della barra laterale. La scaletta del "si fa
// da parte" in chat.css era scritta per la barra laterale e si riconosceva da
// `body:not(.wide)`, quindi qui non scattava: la pillola dell'attivita' — l'unica
// cosa della riga che puo' stringersi — si stringeva fino all'orologio, mentre
// l'interruttore delle modalita' teneva tutte e tre le parole. Qui si guarda che
// la riga stia dentro a ogni larghezza e che la pillola dica ancora qualcosa.
//
// E che non ripeta l'ufficio: dentro l'ufficio il bottone dell'ufficio non serve,
// e quello del contesto accende una colonna che qui e' spenta per scelta.
t(
  await page.locator('.top .brand-t').isHidden(),
  "la testata ripete il nome della scheda accanto a quello dell'ufficio"
);
for (const b of ['#btnOffice', '#btnCtx']) {
  t(
    await page.locator('.top ' + b).isHidden(),
    "la testata ripete un comando che l'ufficio ha gia': " + b
  );
}
await post({ k: 'busy', value: true });
const strette = [];
for (const w of [1100, 1300, 1500, 1800]) {
  await page.setViewportSize({ width: w, height: 940 });
  await page.waitForTimeout(160);
  const r = await page.evaluate(() => {
    const top = document.querySelector('.top');
    const pill = document.getElementById('activity');
    const time = document.getElementById('actTime');
    return {
      overflow: top.scrollWidth - top.clientWidth,
      pill: Math.round(pill.getBoundingClientRect().width),
      clock: Math.round(time.getBoundingClientRect().width),
    };
  });
  if (r.overflow > 1) strette.push(w + 'px: la testata sborda di ' + r.overflow);
  if (r.pill < 110) strette.push(w + "px: la pillola si e' ridotta a " + r.pill + "px");
  if (r.clock < 20) strette.push(w + "px: l'orologio e' stato schiacciato via");
}
await page.setViewportSize({ width: 1500, height: 940 });
await post({ k: 'busy', value: false });
await page.waitForTimeout(160);
t(!strette.length, "la testata della chat non ci sta accanto all'ufficio: " + strette.join(' | '));

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
  props: document.querySelectorAll('.office .of-prop').length,
  people: document.querySelectorAll('.of-guy').length,
  emptyShown: !document.querySelector('.of-nobody').hidden,
  sheet: getComputedStyle(document.querySelector('.office .of-prop')).backgroundImage,
}));
// Una scrivania e' un ritaglio solo: i mobili di SeasonVale non stanno dentro
// una casella, hanno la loro misura vera.
t(plan.desks === DESKS, 'le scrivanie sono ' + plan.desks + ', non ' + DESKS);
t(plan.mons === DESKS, 'i monitor sono ' + plan.mons + ', le scrivanie ' + DESKS);
// La soglia serve a dire "la stanza non e' spoglia", non a contare i mobili uno
// per uno: le scrivanie contano, i muri e il pavimento no.
t(plan.props > 20, 'la stanza e\' spoglia: solo ' + plan.props + ' mobili');
t(/url\(/.test(plan.sheet), 'i mobili non hanno il foglio di sprite: ' + plan.sheet);
t(!plan.people, "c'e' gente in ufficio senza nemmeno una conversazione aperta");
t(plan.emptyShown, "l'ufficio vuoto non dice che e' vuoto");

// ---- e da ogni scrivania si arriva a ogni meta' senza passare nei mobili ----
//
// Qui non si guarda la gente che cammina: si guarda la strada. Il conto e'
// immediato e non dipende da chi si alza in quel momento, quindi becca il
// mobile spostato di traverso anche se in quel minuto nessuno ci passava.
// Due modi di sbagliare: non arrivarci — e allora la strada finisce dove ha
// potuto invece che sulla meta' — o arrivarci attraversando un tavolo.
const strade = await page.evaluate(() => {
  const guai = [];
  for (const [nome, [gx, gy]] of Object.entries(ROOM.METE)) {
    for (let i = 0; i < ROOM.DESKS.length; i++) {
      const casa = ROOM.posto(i);
      let qui = [casa.x + 8, casa.y + 24];
      const via = ROOM.cammino(qui[0], qui[1], gx, gy);
      let sporco = 0;
      for (const t of via) {
        const n = Math.max(1, Math.ceil(Math.hypot(t[0] - qui[0], t[1] - qui[1]) / 2));
        for (let k = 0; k <= n; k++) {
          const x = qui[0] + ((t[0] - qui[0]) * k) / n;
          const y = qui[1] + ((t[1] - qui[1]) * k) / n;
          if (ROOM.occupata[ROOM.cella(x, y)]) sporco++;
        }
        qui = t;
      }
      if (sporco) guai.push(nome + " dalla scrivania " + i + ": passa dentro un mobile");
      else if (Math.hypot(qui[0] - gx, qui[1] - gy) > 1)
        guai.push(nome + " dalla scrivania " + i + ": si ferma prima");
    }
  }
  return guai;
});
t(!strade.length, 'la strada non porta dove deve: ' + strade.join(' | '));

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
    // Ogni persona e' disegnata dal generatore, e il seme e' il suo id: quattro
    // conversazioni devono dare quattro facce, non quattro volte la stessa.
    facce: ps.map((p) => getComputedStyle(p.querySelector('.of-body')).backgroundImage),
    busy: document.querySelectorAll('.of-guy.busy').length,
    done: document.querySelectorAll('.of-guy.done').length,
    focused: document.querySelectorAll('.of-guy.focused').length,
    working: document.querySelectorAll('.of-mon.working').length,
    // La targhetta non sta piu' dentro la persona: sta sulla scrivania, e ci
    // resta anche quando chi ci lavora e' andato al bar.
    names: [...document.querySelectorAll('.of-plate .of-name')].map((n) => n.textContent),
    // Nessuno dentro un mobile: la posizione si legge dal rettangolo disegnato,
    // perche' durante una camminata style.left e' gia' l'arrivo.
    dentro: ps.filter((p) => {
      const s = p.getBoundingClientRect();
      const k = s.width / 16;
      const fx = (s.left - floor.left) / k + 8;
      const fy = (s.top - floor.top) / k + 24;
      return ROOM.occupata[ROOM.cella(fx, fy)];
    }).length,
    labels: ps.map((p) => p.getAttribute('aria-label')),
    emptyShown: !document.querySelector('.of-nobody').hidden,
  };
});

t(room.n === 4, 'le persone sono ' + room.n + ', le conversazioni quattro');
t(room.gap > 30, 'due persone quasi sovrapposte: ' + Math.round(room.gap) + 'px fra loro');
t(!room.out, room.out + ' persone finiscono fuori dai muri');
t(
  room.facce.every((f) => f.startsWith('url("data:image/png')),
  'una persona non ha la faccia del generatore: ' + room.facce.map((f) => f.slice(0, 24)).join(' | ')
);
// Il generatore esiste proprio per questo: prima erano otto scrivanie con otto
// volte lo stesso omino, e da lontano l'ufficio non diceva piu' niente.
t(new Set(room.facce).size === room.facce.length, 'due conversazioni hanno la stessa faccia');

// ---- e l'ufficio non sta mai fermo ----
//
// La stanza deve muoversi anche quando non la stai usando: chi lavora batte a
// macchina, tutti gli altri respirano. Non basta guardare che il CSS ci sia —
// una striscia da un fotogramma solo, o un'animazione che non parte, danno
// esattamente lo stesso foglio di stile e una stanza imbalsamata. Quindi si
// guarda il disegno: quanti fotogrammi ha la striscia, e se la posizione di
// sfondo cambia davvero da sola.
const anim = await page.evaluate(() => {
  const n = document.querySelector('.of-guy .of-body');
  const c = getComputedStyle(n);
  return { fotogrammi: Number(c.getPropertyValue('--nf')), animazione: c.animationName };
});
t(anim.fotogrammi > 1, "la striscia di chi lavora ha un fotogramma solo: l'ufficio e' imbalsamato");
t(anim.animazione !== 'none', "nessuna animazione sulla figura: l'ufficio e' imbalsamato");

// Si campiona fitto e si contano i valori distinti. Due letture sole non
// bastano: con `steps(2)` su un ciclo lungo cascano spesso nella stessa meta',
// e sembrerebbe fermo mentre invece sta girando.
const sfondi = new Set();
for (let i = 0; i < 14; i++) {
  sfondi.add(
    await page.evaluate(() => getComputedStyle(document.querySelector('.of-guy .of-body')).backgroundPositionX)
  );
  await page.waitForTimeout(120);
}
t(sfondi.size > 1, 'la figura non cambia mai fotogramma: ' + [...sfondi].join(' '));
t(room.busy === 1, 'chi sta lavorando sono ' + room.busy + ', dovrebbe essere una');
t(room.done === 1, 'la spunta verde sta su ' + room.done + ' persone, ne vuole una');
t(room.focused === 1, 'il faretto sta su ' + room.focused + ' persone, ne vuole una');
// Il monitor acceso e' la cosa che si vede da lontano: sulla scrivania sbagliata
// dice una bugia sul chi sta lavorando.
t(room.working === 1, room.working + ' monitor accesi, ne lavora una sola');
t(!room.dentro, room.dentro + ' persone stanno dentro un mobile');
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
//
// Chi e' in corridoio non ha una posizione da confrontare: la sua cambia da sola
// a ogni tratto, e nel mezzo di una prova di due minuti prima o poi qualcuno al
// bar c'e'. Quindi si guarda dov'e' chi e' seduto, e in piu' la mappa dei posti,
// che sono gli schermi accesi: quella non dipende da chi in quel momento e' in
// piedi, e se qualcuno cambiasse davvero scrivania cambierebbe anche lei.
const posti = () =>
  page.evaluate(() => ({
    spots: [...document.querySelectorAll('.of-guy')].map((p) =>
      p.classList.contains('fuori') ? 'fuori' : p.style.left + ',' + p.style.top
    ),
    banchi: [...document.querySelectorAll('.of-mon')].map((m) => (m.classList.contains('on') ? 1 : 0)).join(''),
  }));
/** Uguali se ogni persona seduta sta dov'era: chi cammina non si conta. */
const stessiPosti = (a, b) =>
  a.banchi === b.banchi &&
  a.spots.length === b.spots.length &&
  a.spots.every((s, i) => s === 'fuori' || b.spots[i] === 'fuori' || s === b.spots[i]);

const before = await posti();
await ctx(data(four.map((c) => card({ ...c, busy: false, pct: (c.pct + 5) % 100 }))));
await page.waitForTimeout(200);
const after = await posti();
const stamps = await page.evaluate(
  () => [...document.querySelectorAll('.of-guy')].filter((p) => p.dataset.stamp === 'first').length
);
const working = await page.evaluate(() => document.querySelectorAll('.of-mon.working').length);
t(stamps === 4, 'le persone vengono rifatte a ogni giro invece che ridipinte: ' + stamps);
t(stessiPosti(before, after), 'qualcuno ha cambiato scrivania senza motivo');
t(!working, 'un monitor resta acceso dopo che ha smesso di lavorare');

// ---- cliccare una persona porta alla sua conversazione ----
await page.locator('.of-guy').first().click();
const go = await lastSent();
t(go?.cmd === 'focus' && go.id === 'a', "cliccare una persona non porta di la': " + JSON.stringify(go));

// ---- chi se ne va libera la scrivania ----
//
// La mappa degli schermi accesi dice quali posti sono occupati. Se ne esce una e
// ne entra un'altra la mappa deve restare identica: vuol dire che la nuova si e'
// seduta dove sedeva quella andata via, invece di lasciare il buco e prendersi
// una scrivania in fondo. Si guarda la mappa e non la posizione delle persone
// perche' chi in quel momento e' al bar sta camminando, e la sua posizione
// cambia da sola.
const banchiPrima = (await posti()).banchi;
await ctx(data([four[0], four[2], four[3], card({ id: 'e', name: 'Appena arrivata', recent: true })]));
await page.waitForTimeout(200);
const reseat = await page.evaluate(() => ({
  n: document.querySelectorAll('.of-guy').length,
  names: [...document.querySelectorAll('.of-name')].map((n) => n.textContent),
}));
t(reseat.n === 4, 'dopo il cambio le persone sono ' + reseat.n);
t(!reseat.names.includes("Ha finito"), "chi ha chiuso la conversazione e' rimasto seduto");
t(
  (await posti()).banchi === banchiPrima,
  "la scrivania di chi se n'e' andato resta vuota per sempre"
);

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

// ---- e chi lavora, lavora ----
//
// La regola che tiene in piedi tutto il resto: al bar ci si va quando non c'e'
// niente da fare, non mentre Claude sta macinando. Si guarda il comportamento e
// non il codice, perche' e' un giro di attese: la pausa fra un giro e l'altro va
// da tre secondi a sette, quindi in nove ne passa almeno uno — se qualcuno
// doveva alzarsi, in nove secondi si e' alzato.
//
// Le due meta' vanno insieme. Da sola, "nessuno si e' mosso" la passerebbe anche
// un ufficio morto, e un ufficio morto e' il modo piu' facile di far lavorare
// tutti.
const seduti = () =>
  page.evaluate(() => [...document.querySelectorAll('.of-guy')].map((p) => p.style.left + ',' + p.style.top));
const cinque = (over) =>
  Array.from({ length: 5 }, (_, i) => card({ id: 'w' + i, name: 'Conversazione ' + i, recent: true, ...over }));

await ctx(data(cinque()));
await page.waitForTimeout(400);
const fermiA = await seduti();
await page.waitForTimeout(9000);
const dopoA = await seduti();
t(
  dopoA.some((p, i) => p !== fermiA[i]),
  "in nove secondi non si e' alzato nessuno: l'ufficio non vive piu'"
);

// Si svuota prima di rifare: chi era in corridoio sparisce con la sua
// conversazione, e le cinque nuove nascono tutte sedute al posto loro.
await ctx(data([]));
await page.waitForTimeout(400);
await ctx(data(cinque({ busy: true })));
await page.waitForTimeout(400);
const fermiB = await seduti();
await page.waitForTimeout(9000);
const dopoB = await seduti();
t(
  dopoB.join(' ') === fermiB.join(' '),
  'qualcuno lascia la scrivania mentre sta lavorando: ' +
    dopoB.filter((p, i) => p !== fermiB[i]).length +
    ' su ' +
    dopoB.length
);

// ---- la posta ----
//
// Una busta per ogni turno che comincia e per ogni turno che finisce, e nessuna
// al primo giro: le conversazioni gia' avviate arrivano tutte insieme all'apertura
// della scheda, e sarebbero cinque buste in faccia per niente. Il conto e' un
// buco facile da rifare — basta segnare "gia' visto" solo quando qualcosa cambia,
// e chi nasce fermo la sua prima busta non la manda mai.
const buste = () => page.locator('.of-mail').count();

await ctx(data([]));
await page.waitForTimeout(1400);
await ctx(data(cinque({ busy: true })));
await page.waitForTimeout(200);
t((await buste()) === 0, "all'apertura partono le buste delle conversazioni gia' avviate");

// Cinque che si fermano: cinque buste verso la porta.
await ctx(data(cinque({ busy: false, done: true })));
await page.waitForTimeout(200);
t((await buste()) === 5, 'i turni finiti non mandano una busta a testa: ' + (await buste()) + ' su 5');

// E cinque che ripartono, dopo che le prime sono atterrate.
await page.waitForTimeout(2400);
await ctx(data(cinque({ busy: true })));
await page.waitForTimeout(200);
t((await buste()) === 5, 'i turni che ripartono non mandano una busta a testa: ' + (await buste()) + ' su 5');

// E le buste si tolgono di mezzo da sole: una stanza che ne accumula una per
// turno diventa, dopo mezz'ora, una nuvola di rettangoli.
await page.waitForTimeout(2400);
t((await buste()) === 0, 'le buste restano appese in aria: ' + (await buste()));

// ---- i capi e i loro impiegati ----
//
// Una conversazione e' un capo, e i sub-agent che apre sono i suoi impiegati. Due
// conversazioni sono due capi, ognuno coi suoi: e' la gerarchia vera, non una
// inventata per fare scena. Gli impiegati entrano dalla porta, si mettono nella
// corsia accanto al capo che li ha chiamati, e riescono dalla porta quando hanno
// finito — e' l'unica cosa che fa vedere che un sub-agent e' finito invece che
// sparito.
//
// Qui si guarda quello che a occhio non si nota finche' non da' fastidio: che
// arrivino, che siano quelli giusti (solo quelli in corso), che stiano vicini al
// loro capo e non a un altro, e che se ne vadano davvero.
const staff = () => page.locator('.of-staff').count();
const T = (id, content, status) => ({ id, content, status });

await ctx(data([]));
await page.waitForTimeout(300);
await ctx(
  data([
    card({ id: 'capo-a', name: 'Prima conversazione', busy: true }),
    card({ id: 'capo-b', name: 'Seconda conversazione', busy: true }),
  ])
);
await page.waitForTimeout(300);
await tasks({
  'capo-a': {
    items: [
      T('1', 'Leggere', 'in_progress'),
      T('2', 'Cercare', 'in_progress'),
      T('3', 'Poi', 'pending'),
      T('4', 'Dopo', 'pending'),
      T('5', 'Andata male', 'failed'),
      T('6', 'Fatta', 'completed'),
      T('7', 'Fatta anche questa', 'completed'),
    ],
    done: 3,
    total: 7,
    active: 0,
    busy: true,
  },
  'capo-b': { items: [T('9', 'Impaginare', 'in_progress')], done: 0, total: 1, active: 0, busy: true },
});
// Il tempo di attraversare la stanza: entrano dalla porta, non compaiono al posto.
await page.waitForTimeout(9000);
t((await staff()) === 3, 'gli impiegati arrivati sono ' + (await staff()) + ' invece di 3');

// Ognuno accanto al SUO capo: due capi vicini e gli impiegati mescolati sono due
// capi senza nessuno.
const vicini = await page.evaluate(() => {
  const p = (n) => [parseFloat(n.style.left) + 8, parseFloat(n.style.top) + 24];
  const capi = [...document.querySelectorAll('.of-guy:not(.of-staff)')].map(p);
  return [...document.querySelectorAll('.of-staff')].map((s) => {
    const [x, y] = p(s);
    return Math.round(Math.min(...capi.map(([cx, cy]) => Math.hypot(cx - x, cy - y))));
  });
});
t(
  vicini.every((d) => d <= 48),
  'un impiegato sta a ' + Math.max(...vicini) + ' pixel dal capo piu\' vicino'
);

// Dentro i muri, come tutti gli altri.
const fuoriStaff = await page.evaluate(() => {
  const r = document.querySelector('.of-floor').getBoundingClientRect();
  return [...document.querySelectorAll('.of-staff')].filter((s) => {
    const b = s.getBoundingClientRect();
    return b.left < r.left || b.right > r.right || b.top < r.top || b.bottom > r.bottom;
  }).length;
});
t(!fuoriStaff, 'ci sono ' + fuoriStaff + ' impiegati fuori dai muri');

// ---- la bacheca ----
//
// Un foglietto per ogni cosa da fare, e il colore dice quale: giallo da fare,
// rosso andato storto, verde archiviato, azzurro in mano a chi la sta facendo.
//
// La cosa che conta e' che il foglio sia UNO: quello che sta camminando per la
// stanza in mano a qualcuno non deve stare anche appeso al muro, se no la
// bacheca conta due volte lo stesso lavoro. E' l'unica ragione per cui il
// registro e quello che si vede possono divergere, ed e' anche il motivo per cui
// qui non serve tenerli in pari: il foglio sta dove sta chi lo porta.
const fogli = async () => ({
  muro: await page.locator('.of-bacheche .of-note').count(),
  fare: await page.locator('.of-bacheche .of-note.fare').count(),
  storte: await page.locator('.of-bacheche .of-note.storta').count(),
  fatte: await page.locator('.of-bacheche .of-note.fatta').count(),
  mano: await page.locator('.of-guy > .of-note').count(),
});
const f = await fogli();
t(f.fare === 2, 'i foglietti da fare sono ' + f.fare + ' invece di 2');
t(f.storte === 1, 'i foglietti andati storti sono ' + f.storte + ' invece di 1');
t(f.fatte === 2, 'la pila dell’archivio e’ di ' + f.fatte + ' invece di 2');
t(f.mano === 3, 'i foglietti in mano sono ' + f.mano + ' invece di 3');
t(
  f.muro === f.fare + f.storte + f.fatte,
  'sulla bacheca c’e’ un foglietto che non e’ di nessuno stato: ' + f.muro
);

// ---- l'aura del capo ----
//
// Chi lavora per qualcuno, se quel qualcuno ce l'ha a due passi, ogni tanto gli
// tira una battuta — e il numero dentro la battuta e' vero, viene dal quadro
// delle task di quel capo li'. Con tre impiegati fermi al loro posto e una
// possibilita' su due ogni secondo e mezzo, in dieci secondi qualcuno parla:
// se non parla nessuno, l'aura non gira affatto.
//
// Il conto dei fatti di capo-a e' tre, e la battuta col numero puo' dire solo
// quello: un numero sbagliato in bocca a qualcuno e' peggio di nessun numero.
// Le nuvolette durano tre secondi e mezzo: guardare la stanza alla fine
// dell'attesa vuol dire vedere solo chi sta parlando in quell'istante. Si
// raccolgono mentre compaiono.
await page.evaluate(() => {
  window.__dette = [];
  new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n.classList && n.classList.contains('of-say') && n.parentElement.classList.contains('of-staff')) {
          window.__dette.push(n.textContent);
        }
      }
    }
  }).observe(document.querySelector('.of-crowd'), { childList: true, subtree: true });
});
await page.waitForTimeout(10000);
const dette = await page.evaluate(() => window.__dette);
t(dette.length > 0, 'nessuno ha aperto bocca in dieci secondi: l’aura del capo non gira');
t(
  dette.every((s) => !/\d/.test(s) || s.includes('3')),
  'una battuta dice un numero che non e’ quello vero: ' + dette.join(' | ')
);

// E chi ha finito se ne va: per la porta, e ci mette il tempo di arrivarci.
await tasks({
  'capo-a': {
    items: [
      T('1', 'Leggere', 'completed'),
      T('2', 'Cercare', 'completed'),
      T('3', 'Poi', 'pending'),
      T('4', 'Dopo', 'pending'),
      T('5', 'Andata male', 'failed'),
      T('6', 'Fatta', 'completed'),
      T('7', 'Fatta anche questa', 'completed'),
    ],
    done: 5,
    total: 7,
    active: -1,
    busy: false,
  },
  'capo-b': { items: [T('9', 'Impaginare', 'in_progress')], done: 0, total: 1, active: 0, busy: true },
});
// Ventidue secondi e non undici: chi se ne va passa dal tavolo dell'archivio, e
// il tavolo sta nella stanza in cima, dall'altra parte dell'unica porta. Da una
// scrivania in fondo a sinistra sono trecentosettanta pixel di strada.
await page.waitForTimeout(22000);
t((await staff()) === 1, 'chi ha finito non se n’e’ andato: restano ' + (await staff()) + ' invece di 1');
// E il foglio che portava e' finito dov'e' andato a finire: due in piu' nella
// pila, e nessuno rimasto in mano a un fantasma.
const g = await fogli();
t(g.fatte === 4, 'i foglietti archiviati sono ' + g.fatte + ' invece di 4');
t(g.mano === 1, 'restano ' + g.mano + ' foglietti in mano invece di 1');

// ---- le tazze ----
//
// Quattro, e sono quelle: girano fra la rastrelliera, la mano di chi le porta e
// la scrivania di chi se l'e' riportata indietro, ma sono sempre quattro. E'
// l'unica cosa che rende il bar un posto invece che un'animazione — quando
// finiscono, la rastrelliera e' vuota davvero e chi arriva torna a mani vuote.
//
// Il conto e' anche l'unico modo in cui questa scena si rompe in silenzio: una
// tazza persa non si vede finche' non sono finite tutte, e a quel punto e'
// finito il caffe' in un ufficio dove nessuno ha bevuto niente. Qui si guarda
// alla fine di tutto, quando la stanza ha gia' avuto un minuto per girare.
const tazze = await page.evaluate(() => ({
  scaffale: document.querySelectorAll('.of-tazze .of-tazza').length,
  mano: document.querySelectorAll('.of-tazza.addosso').length,
  scrivania: document.querySelectorAll('.of-tazza.piena').length,
}));
t(
  tazze.scaffale + tazze.mano + tazze.scrivania === 4,
  'le tazze non sono piu\' quattro: ' + JSON.stringify(tazze)
);

t(!errors.length, 'la pagina ha protestato: ' + errors.join(' | '));

await page.screenshot({ path: path.join(root, 'dist', 'preview-office-full.png') });
await browser.close();

if (fails.length) {
  console.error('office-check FAIL\n - ' + fails.join('\n - '));
  process.exit(1);
}
console.log(
  'office-check ok — il bottone, la pianta, la gente, i posti a sedere, la posta, gli impiegati, la bacheca, l’aura del capo e le tazze'
);
