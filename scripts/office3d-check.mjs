// L'ufficio in 3D: lo stesso ufficio di office-check, guardato dalla tela.
//
// La vista in 3D non decide niente — la gente, i posti e il conto delle tazze restano
// della stanza piatta, che continua a vivere sotto la tela — quindi qui non si
// ricontrolla l'ufficio: si controlla che le due viste dicano la stessa cosa, e le
// poche cose che esistono solo di qua. Sono quelle che a occhio si notano per ultime,
// e che una volta notate non si guardano piu' altro:
//  - la stanza riempie la scheda, a qualunque misura: attorno non resta un pixel di
//    vuoto. Si dipinge il vuoto di un colore che nella stanza non c'e' e lo si conta;
//  - chi siede guarda il suo schermo, e gli sta davanti. Le postazioni sono girate
//    verso la camera, e nella prima anteprima sedevano tutti a fissare il retro del
//    proprio monitor: si legge dai pezzi montati, cosi' prende anche uno specchio
//    sbagliato;
//  - le mani di chi batte stanno sulla sua tastiera, alle scrivanie di tutte e due le
//    meta' e ai tavoli col portatile — e non dove la tastiera stava in un'altra
//    stanza;
//  - le tazze sono quelle che conta la stanza piatta: tante sulla rastrelliera, tante
//    nel lavandino, una sulla scrivania di chi se l'e' portata. Una tazza in piu' di
//    qua e' una tazza che nessuno ha lavato;
//  - chi si fa il caffe' lo fa davvero: la macchina versa mentre lui e' li', il
//    rubinetto scorre mentre qualcuno lava, e si fermano quando ha finito;
//  - il gatto e il cane ci sono, e stanno dentro i muri;
//  - la nuvoletta di chi siede nella fila dietro, con la targhetta accanto alla testa,
//    nasce gia' piccola e al suo posto, e da li' non si muove: mai sopra un nome, e lo
//    spostamento che le scrive lo specchio e' quello che si vede;
//  - con le animazioni ridotte le bestie dormono, e la nuvoletta si vede, ferma;
//  - e un fotogramma non costa piu' di quanto regge una scheda grafica integrata:
//    i triangoli e le chiamate al disegno hanno un tetto, che si sfonda senza
//    accorgersene aggiungendo un mobile tondo.
// In tutte e tre le pelli, e senza un errore in console.
//
// Gira sul GL a software del Chromium senza testa, dove un fotogramma dura decimi
// di secondo: per questo non si aspetta mai un tempo, si aspettano dei fotogrammi.
import { chromium } from 'playwright';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const url = pathToFileURL(path.join(root, 'dist', 'preview.html')).href + '?office';
const PELLI = ['classico', 'notte', 'bali'];
/* Le misure della finestra: una tela quasi quadrata, una larga il doppio che alta e
   una piu' alta che larga. Piccole apposta: alla stanza conta la proporzione (e'
   da quella che decide quanto crescere), e a software ogni pixel si paga. */
const MISURE = [
  [840, 660],
  [1220, 460],
  [620, 700],
];
/** Un colore che in nessuna pelle c'e'. */
const VUOTO = '#ff00ff';
/** Quanto puo' costare un fotogramma con l'ufficio di prova (cinque conversazioni, il gatto, il cane), ombre comprese. */
const TETTO = { triangoli: 200000, disegni: 270 };

const fails = [];
const errors = [];
const t = (cond, msg) => !cond && fails.push(msg);

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: MISURE[0][0], height: MISURE[0][1] }, colorScheme: 'dark' });
page.on('pageerror', (e) => errors.push(String(e)));
// L'audio che non parte senza un clic e' della pagina della chat, non di qui.
page.on('console', (m) => m.type() === 'error' && !m.text().includes('AudioContext') && errors.push(m.text()));
/* La stanza piatta qui non manda in giro nessuno: niente bar e niente commissioni. Il
   conto delle tazze lo muove questo controllo, e se nel frattempo uno andasse davvero
   a farsi un caffe' i due conti si confronterebbero a meta' di un gesto. La gente
   entra e si siede lo stesso: quello lo fa office.js. */
await page.addInitScript(() => {
  let R;
  Object.defineProperty(window, 'ROOM', {
    configurable: true,
    get: () => R,
    set: (v) => {
      R = v;
      v.accendi = () => {};
    },
  });
});
await page.goto(url);
await page.waitForTimeout(900);

const post = (m) => page.evaluate((x) => window.postMessage(x, '*'), m);
const stato = () => page.evaluate(() => (window.OFFICE3D && window.OFFICE3D.acceso ? window.OFFICE3D.stato() : null));
/** Aspetta che la tela abbia disegnato `n` fotogrammi da adesso. */
const fotogrammi = async (n = 2) => {
  const da = ((await stato()) || { quadri: 0 }).quadri;
  for (let i = 0; i < 300; i++) {
    const s = await stato();
    if (s && s.quadri >= da + n) return true;
    await page.waitForTimeout(100);
  }
  return false;
};
/** Aspetta che `f(stato)` sia vero. */
const finche = async (f, giri = 300) => {
  for (let i = 0; i < giri; i++) {
    const s = await stato();
    if (s && (await f(s))) return true;
    await page.waitForTimeout(100);
  }
  return false;
};

await post({ k: 'prefs', value: { skin: PELLI[0], office3d: true } });
const acceso = await finche((s) => s.quadri >= 2);
if (!acceso) {
  console.error('office3d-check FAIL\n - il 3D non si e’ acceso: ' + (errors.join(' | ') || 'nessun WebGL?'));
  await browser.close();
  process.exit(1);
}

/**
 * Quello che dice `verifica()`, appena in `campo` ci sono almeno `quanti` nomi. Chi
 * siede non e' sempre al lavoro — legge, si gira verso chi guarda, dice una cosa — e
 * dopo un cambio di misura ci mette un momento a riaccostarsi alla scrivania nuova:
 * si aspetta che almeno qualcuno ci sia, invece di guardare in un istante qualunque.
 */
const verifica = async (campo, quanti, giri = 300) => {
  let v = null;
  for (let i = 0; i < giri; i++) {
    v = await page.evaluate(() => window.OFFICE3D.verifica());
    if (v[campo].length >= quanti) break;
    await page.waitForTimeout(100);
  }
  return v;
};
// --- la gente entra dalla porta e va a sedersi: si aspetta che ci sia arrivata, anche di qua.
const arrivati = (await verifica('seduti', 3, 400)).seduti.length;
t(arrivati >= 3, 'dopo quaranta secondi le figure sedute alle scrivanie sono ' + arrivati + ': la gente non arriva al suo posto');

/**
 * Quanti pixel del colore del vuoto ci sono nella scheda adesso. La tinta dura fino
 * al prossimo rimontaggio: se nel frattempo la stanza e' cambiata ancora si ricomincia,
 * che contare zero su uno sfondo tornato quello di prima sarebbe un via libera falso.
 */
async function vuoti() {
  const firma = async () => {
    const s = await stato();
    return [s.pelle, s.W, s.H, s.largo, s.alto].join();
  };
  for (let k = 0; k < 4; k++) {
    const prima = await firma();
    await page.evaluate((c) => window.OFFICE3D.vuoto(c), VUOTO);
    await fotogrammi(2);
    if ((await firma()) === prima) break;
  }
  const r = await page.evaluate(() => {
    const b = document.querySelector('#office canvas').getBoundingClientRect();
    return { x: b.left, y: b.top, width: b.width, height: b.height };
  });
  const png = (await page.screenshot({ clip: r })).toString('base64');
  return page.evaluate(async (png) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + png;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = img.width;
    cv.height = img.height;
    const g = cv.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 235 && d[i + 1] < 40 && d[i + 2] > 235) n++;
    return n;
  }, png);
}

/** Il conto delle tazze nella stanza piatta, e quello che se ne vede di qua: nello stesso istante. */
const tazze = () =>
  page.evaluate(() => {
    const q = (s) => document.querySelectorAll('.of-stage ' + s).length;
    return { piatte: { pulite: q('.of-tazze:not(.of-sporche) .of-tazza'), sporche: q('.of-sporche .of-tazza'), piene: q('.of-tazza.piena') }, bar: window.OFFICE3D.stato().bar };
  });
const uguali = (c) => c.bar.pulite === c.piatte.pulite && c.bar.sporche === c.piatte.sporche && c.bar.piene.length === c.piatte.piene;

for (const pelle of PELLI) {
  const qui = (msg) => pelle + ': ' + msg;
  await post({ k: 'prefs', value: { skin: pelle, office3d: true } });
  t(await finche((s) => s.pelle === pelle), qui('la stanza non si e’ rimontata con questa pelle'));

  // --- la stanza riempie la scheda, a ogni misura
  for (const [w, h] of MISURE) {
    await page.setViewportSize({ width: w, height: h });
    // La scheda cambia misura, la stanza cresce e si rimonta: si aspetta che la tela e la pianta siano quelle nuove.
    const pronta = await finche(async (s) => {
      const b = await page.evaluate(() => {
        const r = document.querySelector('#office canvas').getBoundingClientRect();
        return [Math.round(r.width), Math.round(r.height), window.ROOM.W, window.ROOM.H];
      });
      return Math.abs(s.largo - b[0]) <= 1 && Math.abs(s.alto - b[1]) <= 1 && s.W === b[2] && s.H === b[3];
    });
    t(pronta, qui(`a ${w}x${h} la tela non ha seguito la scheda`));
    const n = await vuoti();
    const s = await stato();
    t(n === 0, qui(`a ${w}x${h} (tela ${s.largo}x${s.alto}) attorno alla stanza restano ${n} pixel di vuoto`));
    t(s.stanza.su <= 0 && s.stanza.giu >= s.alto, qui(`a ${w}x${h} la stanza non sporge dal quadro: ` + JSON.stringify(s.stanza)));
  }
  await page.setViewportSize({ width: MISURE[0][0], height: MISURE[0][1] });
  await finche((s) => s.largo === MISURE[0][0]);
  await fotogrammi(2);

  // --- chi siede guarda il suo schermo
  const v = await verifica('seduti', 2);
  t(v.banchi.length === 8, qui('le scrivanie montate sono ' + v.banchi.length));
  for (const b of v.banchi) t(b.punto < -0.8 && b.davanti > 0, qui(`alla scrivania ${b.i} chi siede non guarda lo schermo (${b.punto.toFixed(2)}, ${b.davanti.toFixed(1)})`));
  // (Chi legge o si e' girato verso chi guarda qui non si conta: non sta guardando lo schermo, e va bene cosi'.)
  t(v.seduti.length >= 1, qui('non c’e’ una figura seduta a lavorare da controllare'));
  for (const p of v.seduti) t(p.punto < -0.8, qui(`la figura seduta alla scrivania ${p.i} non guarda il suo schermo (${p.punto.toFixed(2)})`));

  // --- le tazze: quante ne conta la stanza piatta, tante se ne vedono
  let c = await tazze();
  t(c.piatte.pulite === 4 && uguali(c), qui('a rastrelliera piena i due conti non tornano: ' + JSON.stringify(c)));
  // Una tazza passa dalla rastrelliera al lavandino, e un'altra sulla prima scrivania: come le sposta room.js.
  await page.evaluate(() => {
    const R = window.ROOM;
    const stage = document.querySelector('.of-stage');
    const n = stage.querySelector('.of-tazze:not(.of-sporche) .of-tazza:last-child');
    n.className = 'of-tazza sporca';
    stage.querySelector('.of-sporche').append(n);
    stage.querySelector('.of-tazze:not(.of-sporche) .of-tazza:last-child').remove();
    const casa = R.posto(0);
    const piena = document.createElement('i');
    piena.className = 'of-tazza piena';
    piena.style.left = casa.x + 20 + 'px';
    piena.style.top = casa.y - 6 + 'px';
    stage.append(piena);
  });
  await fotogrammi(2);
  c = await tazze();
  t(c.piatte.pulite === 2 && c.piatte.sporche === 1 && c.piatte.piene === 1 && uguali(c) && c.bar.piene[0] === 0, qui('spostate due tazze, i due conti non tornano: ' + JSON.stringify(c)));
  // E una tazza piatta non si deve vedere piu': di qua ci sono quelle vere.
  const viste = await page.evaluate(() => [...document.querySelectorAll('.of-stage .of-tazza')].filter((n) => getComputedStyle(n).visibility !== 'hidden').length);
  t(viste === 0, qui(viste + ' tazze della stanza piatta si vedono ancora sopra la tela'));
  await page.evaluate(() => {
    const stage = document.querySelector('.of-stage');
    stage.querySelector('.of-tazza.piena').remove();
    const rack = stage.querySelector('.of-tazze:not(.of-sporche)');
    const [a, b] = rack.children;
    const sporca = stage.querySelector('.of-sporche .of-tazza');
    // Tornano al loro posto: una sotto ognuna delle due rimaste, dieci pixel piu' giu' (SCAFFALI0 in room.js).
    for (const su of [a, b]) {
      const n = document.createElement('i');
      n.className = 'of-tazza';
      n.style.left = su.style.left;
      n.style.top = parseFloat(su.style.top) + 10 + 'px';
      rack.append(n);
    }
    sporca.remove();
  });
  await fotogrammi(2);
  c = await tazze();
  t(c.piatte.pulite === 4 && uguali(c), qui('rimesse a posto le tazze, i due conti non tornano: ' + JSON.stringify(c)));

  // --- il caffe': la macchina versa mentre uno e' li' (il gesto lo dice la stanza piatta
  //     addosso alla persona), e smette quando ha finito. Il getto dura meno di un secondo,
  //     e a software un fotogramma puo' saltarlo: si riprova.
  let versa = false;
  for (let k = 0; k < 5 && !versa; k++) {
    await page.evaluate(() => (document.querySelector('.of-stage .of-guy').dataset.gesto = 'caffe'));
    for (let i = 0; i < 40 && !versa; i++) {
      versa = (await stato()).bar.getto;
      if (!versa) await page.waitForTimeout(60);
    }
    await page.evaluate(() => delete document.querySelector('.of-stage .of-guy').dataset.gesto);
    await fotogrammi(2);
  }
  t(versa, qui('con qualcuno che si fa il caffe’ la macchina non versa'));
  t(!(await stato()).bar.getto && !(await stato()).bar.sotto, qui('finito il caffe’ la macchina versa ancora'));
  await page.evaluate(() => (document.querySelector('.of-stage .of-guy').dataset.gesto = 'lava'));
  t(await finche((s) => s.bar.acqua, 60), qui('con qualcuno che lava il rubinetto non scorre'));
  await page.evaluate(() => delete document.querySelector('.of-stage .of-guy').dataset.gesto);
  t(await finche((s) => !s.bar.acqua, 60), qui('finito di lavare il rubinetto scorre ancora'));

  // --- il gatto e il cane
  const A = await page.evaluate(() => (window.OFFICE3D.animali ? window.OFFICE3D.animali.stato() : null));
  t(!!A, qui('il gatto e il cane non ci sono'));
  if (A) {
    for (const tipo of ['gatto', 'cane']) {
      const b = A[tipo];
      const dentro = Number.isFinite(b.x) && Number.isFinite(b.y) && b.x > 16 && b.y > 16 && b.x < A.W - 16 && b.y < A.H - 16;
      t(b.visibile && dentro, qui(`il ${tipo} non e’ nella stanza: ` + JSON.stringify(b)));
    }
  }

  // --- quanto costa un fotogramma
  const s = await stato();
  t(s.triangoli > 0 && s.triangoli <= TETTO.triangoli, qui(`un fotogramma sono ${s.triangoli} triangoli (il tetto e’ ${TETTO.triangoli})`));
  t(s.disegni <= TETTO.disegni, qui(`un fotogramma sono ${s.disegni} chiamate al disegno (il tetto e’ ${TETTO.disegni})`));
}

/**
 * Una frase detta a chi siede nella fila dietro, dove la targhetta sta sopra lo
 * schermo, accanto alla sua testa. Torna la nuvoletta com'e' appena nata — passato il
 * MutationObserver dello specchio, prima di un fotogramma — e poi a ogni fotogramma
 * della tela (a software sono pochi al secondo, e si contano quelli).
 */
const nuvoletta = () =>
  page.evaluate(async () => {
    const chi = window.OFFICE3D.stato().gente.filter((g) => g.seduto && g.visibile).sort((a, b) => a.y - b.y)[0];
    const el = chi && [...document.querySelectorAll('.of-stage .of-guy')].find((n) => n.getAttribute('aria-label') === chi.nome);
    if (!el) return null;
    // Le altre via: una nuvoletta vicina, o quattro in aria, e la stanza piatta non lo farebbe parlare.
    for (const n of document.querySelectorAll('.of-stage .of-say')) n.remove();
    const ms = window.ROOM.parla({ el }, 'Questa la sistemo dopo pranzo, promesso');
    await null;
    const n = el.querySelector('.of-say');
    if (!n) return { chi: chi.nome, ms };
    const xy = (s) => (s === 'none' ? '' : s).split(' ').filter(Boolean).map(parseFloat).concat(0, 0).slice(0, 2);
    const foto = () => {
      const r = n.getBoundingClientRect();
      const [a, b] = xy(n.style.translate);
      const [c, d] = xy(getComputedStyle(n).translate);
      const nomi = [...document.querySelectorAll('.of-stage .of-plate')].filter((p) => !p.hidden).map((p) => p.getBoundingClientRect());
      return {
        t: r.top,
        b: r.bottom,
        l: r.left,
        // Chi siede e' gia' arrivato: la sua nuvoletta non aspetta nascosta.
        o: getComputedStyle(n).visibility === 'visible' ? +getComputedStyle(n).opacity : -1,
        diverso: Math.abs(a - c) > 0.01 || Math.abs(b - d) > 0.01,
        nome: nomi.some((q) => r.right > q.left + 1 && r.left < q.right - 1 && r.bottom > q.top + 1 && r.top < q.bottom - 1),
      };
    };
    const C = [foto()];
    let q = window.OFFICE3D.stato().quadri;
    while (n.isConnected && C.length < 10) {
      await new Promise((ok) => requestAnimationFrame(ok));
      const s = window.OFFICE3D.stato().quadri;
      if (s === q) continue;
      q = s;
      C.push(foto());
    }
    return { chi: chi.nome.split(' — ')[0], ms, C };
  });
/** La nuvoletta resta dove nasce, gia' della sua misura: un pixel al massimo fra due fotogrammi, e mai sopra un nome. */
function ferma(N, quando = '') {
  if (!N || !N.C || N.C.length < 4) return t(false, `${quando}la nuvoletta di chi siede nella fila dietro non c’e’, o la tela non va avanti: ` + JSON.stringify(N));
  const C = N.C;
  const salto = Math.max(...C.slice(1).map((c, i) => Math.max(Math.abs(c.t - C[i].t), Math.abs(c.b - C[i].b), Math.abs(c.l - C[i].l))));
  t(!C.some((c) => c.o < 0), `${quando}la nuvoletta di ${N.chi}, che e’ seduto, resta nascosta`);
  t(salto <= 1, `${quando}la nuvoletta di ${N.chi} si muove di ${salto.toFixed(1)} px fra due fotogrammi (o nasce grande, e poi si rimpicciolisce)`);
  t(!C.some((c) => c.nome), `${quando}la nuvoletta di ${N.chi} copre un nome`);
  t(!C.some((c) => c.diverso), `${quando}alla nuvoletta di ${N.chi} si vede uno spostamento diverso da quello che le scrive lo specchio`);
}

// --- la nuvoletta di chi siede nella fila dietro: nasce al suo posto, e non si muove piu'.
ferma(await nuvoletta());

// --- le animazioni ridotte: le bestie dormono, e le mani di chi batte stanno ferme sui
//     tasti (e' il momento buono per misurarle: da vivi vagano, e ogni tanto si fermano
//     a pensare con una mano al mento).
await page.emulateMedia({ reducedMotion: 'reduce' });
await page.waitForTimeout(1200);
await fotogrammi(6);
const calmo = { v: await verifica('mani', 2), a: await page.evaluate(() => window.OFFICE3D.animali.stato()) };
t(calmo.a.gatto.stato === 'dorme' && calmo.a.cane.stato === 'dorme', 'con le animazioni ridotte le bestie non dormono: ' + calmo.a.gatto.stato + ', ' + calmo.a.cane.stato);
t(calmo.v.mani.length >= 2, 'a battere sono in ' + calmo.v.mani.length + ': non c’e’ niente da misurare');
for (const p of calmo.v.mani) {
  // Una spanna dal centro della tastiera, e fra tre e dieci centimetri sopra il piano.
  const ok = p.mani.every(([d, h]) => d < 0.15 && h > 0.03 && h < 0.1);
  t(ok, `le mani di chi siede al posto ${p.posto} (${p.tipo}) non stanno sulla tastiera: ` + JSON.stringify(p.mani));
}
// E la nuvoletta compare e sparisce senza sfumare: si vede tutta, e sta ferma lo stesso.
const calma = await nuvoletta();
ferma(calma, 'con le animazioni ridotte ');
if (calma && calma.C) t(calma.C.every((c) => c.o === 1), 'con le animazioni ridotte la nuvoletta non si vede: opacita’ ' + calma.C.map((c) => c.o).join(' '));
await page.emulateMedia({ reducedMotion: 'no-preference' });

// --- e si spegne senza lasciare niente appeso
await post({ k: 'prefs', value: { skin: 'classico', office3d: false } });
await page.waitForTimeout(500);
const spento = await page.evaluate(() => ({
  acceso: window.OFFICE3D.acceso,
  tela: !!document.querySelector('#office canvas'),
  spostati: [...document.querySelectorAll('.of-stage .of-guy, .of-stage .of-plate')].filter((n) => n.style.translate || n.style.scale).length,
}));
t(!spento.acceso && !spento.tela && !spento.spostati, 'spento il 3D resta qualcosa: ' + JSON.stringify(spento));

t(!errors.length, 'la pagina ha protestato: ' + [...new Set(errors)].join(' | '));
await browser.close();

if (fails.length) {
  console.error('office3d-check FAIL\n - ' + fails.join('\n - '));
  process.exit(1);
}
console.log('office3d-check ok — in tre pelli: la stanza che riempie la scheda, chi siede davanti al suo schermo, le tazze contate, il caffe’ e il rubinetto, il gatto e il cane, il costo; la nuvoletta ferma accanto alla targhetta; e le mani sui tasti');
