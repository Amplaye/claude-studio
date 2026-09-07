/* Claude Studio — L'ufficio.
 *
 * Una scheda a tutto schermo con la pianta di un ufficio visto dall'alto, e dentro
 * una persona per ogni conversazione aperta: seduta alla sua scrivania, che batte a
 * macchina mentre Claude lavora, in piedi con la spunta verde quando ha finito,
 * sbiadita quando e' ferma da un pezzo.
 *
 * E' la stessa roba del pannello del contesto — stesse sessioni, stesso filo
 * (`CtxWire`/`CtxCmd`), stesso "clicca e ci vai" — detta nell'unico modo che non
 * chiede di leggere niente. Il pannello risponde a "quanto contesto le resta"; questa
 * risponde a "chi c'e' e chi sta lavorando" dall'altra parte della stanza.
 *
 * Due regole di casa, le stesse delle altre due facce:
 *   - niente innerHTML con dei dati: tutto passa da textContent;
 *   - si costruisce una volta e poi si ridipinge. Rifare i nodi a ogni giro
 *     ammazzerebbe le transizioni, e la camminata verso la scrivania nuova non
 *     partirebbe mai.
 *
 * La pianta sta qui sotto come dati, non come CSS: stanze e mobili sono rettangoli
 * con un nome, e il foglio di stile sa disegnare un rettangolo per tipo. Spostare una
 * scrivania e' cambiare due numeri, non riscrivere un selettore.
 */
(() => {
  const vscode = acquireVsCodeApi();
  const SVG = 'http://www.w3.org/2000/svg';
  const t = (key, vars) => window.I18N.t(key, vars);

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  function icon(name, cls) {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('class', cls ? 'ico ' + cls : 'ico');
    const use = document.createElementNS(SVG, 'use');
    use.setAttribute('href', '#ion-' + name);
    svg.appendChild(use);
    return svg;
  }

  /** Mette un rettangolo sul pavimento: tutta la pianta e' fatta di questi. */
  function box(node, x, y, w, h) {
    node.style.left = x + 'px';
    node.style.top = y + 'px';
    if (w != null) node.style.width = w + 'px';
    if (h != null) node.style.height = h + 'px';
    return node;
  }

  // ---------- la pianta ----------
  // Il piano e' grande cosi' e non cambia mai: si rimpicciolisce tutto insieme per
  // stare nella scheda (vedi fit), cosi' la stanza e' la stessa su un portatile e su
  // un monitor grande, invece di riorganizzarsi sotto gli occhi a ogni trascinamento.
  const STAGE = { w: 1320, h: 820 };

  const ROOMS = [
    { k: 'reception', x: 36, y: 36, w: 300, h: 200 },
    { k: 'accounting', x: 36, y: 268, w: 300, h: 300 },
    { k: 'annex', x: 36, y: 600, w: 300, h: 184 },
    { k: 'conference', x: 960, y: 36, w: 324, h: 268, glass: true },
    { k: 'boss', x: 960, y: 336, w: 324, h: 232, glass: true },
    { k: 'kitchen', x: 960, y: 600, w: 324, h: 184 },
  ];

  // I mobili che non hanno nessuno seduto: fanno la differenza fra una pianta e un
  // ufficio. Il tipo dice al foglio di stile come disegnarli.
  const PROPS = [
    { t: 'table oval', x: 1010, y: 96, w: 224, h: 130 },
    { t: 'table', x: 1010, y: 676, w: 224, h: 84 },
    { t: 'counter', x: 1000, y: 634, w: 244, h: 26 },
    { t: 'cabinet', x: 60, y: 620, w: 60, h: 140 },
    { t: 'cabinet', x: 140, y: 620, w: 60, h: 140 },
    { t: 'copier', x: 240, y: 630, w: 76, h: 96 },
    { t: 'cooler', x: 928, y: 320, w: 32, h: 32 },
    { t: 'plant', x: 348, y: 56, w: 40, h: 40 },
    { t: 'plant', x: 348, y: 740, w: 40, h: 40 },
    { t: 'plant', x: 906, y: 740, w: 40, h: 40 },
    { t: 'plant', x: 296, y: 244, w: 40, h: 40 },
    { t: 'sofa', x: 196, y: 48, w: 124, h: 40 },
    // Le sedie intorno al tavolo della sala riunioni: un tavolo senza sedie e' un
    // tavolo in un magazzino.
    { t: 'seat', x: 1237, y: 148, w: 26, h: 26 },
    { t: 'seat', x: 1173, y: 219, w: 26, h: 26 },
    { t: 'seat', x: 1045, y: 219, w: 26, h: 26 },
    { t: 'seat', x: 981, y: 148, w: 26, h: 26 },
    { t: 'seat', x: 1045, y: 77, w: 26, h: 26 },
    { t: 'seat', x: 1173, y: 77, w: 26, h: 26 },
    // Le finestre stanno sul muro in alto, e la luce che entra cade sul salone.
    { t: 'window', x: 392, y: 3, w: 516, h: 9 },
  ];

  /**
   * Le postazioni, nell'ordine in cui si riempiono: prima il salone, poi contabilita',
   * poi la reception, e l'ufficio del capo per ultimo — che e' esattamente l'ordine in
   * cui si riempie un ufficio vero.
   *
   * `x`,`y` sono il centro della scrivania; chi ci siede sta sotto, dalla parte
   * opposta al monitor.
   */
  const DESKS = [
    { x: 470, y: 180 },
    { x: 800, y: 180 },
    { x: 470, y: 400 },
    { x: 800, y: 400 },
    { x: 470, y: 620 },
    { x: 800, y: 620 },
    { x: 186, y: 340 },
    { x: 186, y: 470 },
    { x: 186, y: 140 },
    { x: 1122, y: 430 },
  ];
  const DESK_W = 172;
  const DESK_H = 66;
  /** Quanto sta sotto la scrivania chi ci lavora. */
  const SEAT_DY = 58;

  // ---------- la scena ----------
  const wrap = el('div', 'wrap');
  const stage = el('div', 'stage');
  stage.style.width = STAGE.w + 'px';
  stage.style.height = STAGE.h + 'px';

  const floor = el('div', 'floor');
  const lights = el('div', 'lights');
  for (let i = 0; i < 6; i++) {
    const l = el('div', 'lamp');
    box(l, 360 + (i % 3) * 210, 120 + Math.floor(i / 3) * 380, 260, 260);
    lights.append(l);
  }
  stage.append(floor, lights);

  for (const r of ROOMS) {
    const n = el('div', 'room' + (r.glass ? ' glass' : ''));
    box(n, r.x, r.y, r.w, r.h);
    n.append(el('span', 'rname', t('office.' + r.k)));
    n._key = r.k;
    stage.append(n);
  }
  for (const p of PROPS) {
    stage.append(box(el('div', 'prop ' + p.t), p.x, p.y, p.w, p.h));
  }

  // Le scrivanie ci sono anche quando non ci siede nessuno: un ufficio con sette posti
  // vuoti dice quante conversazioni potresti avere aperte, uno con tre scrivanie e
  // basta sembra un ufficio da tre persone.
  for (const d of DESKS) {
    const n = el('div', 'desk');
    box(n, d.x - DESK_W / 2, d.y - DESK_H / 2, DESK_W, DESK_H);
    const mon = el('div', 'mon');
    const kb = el('div', 'kb');
    const chair = el('div', 'chair');
    box(chair, d.x - 19, d.y + SEAT_DY - 19, 38, 38);
    n.append(mon, kb);
    d.node = n;
    d.chair = chair;
    stage.append(n, chair);
  }

  const crowd = el('div', 'crowd');
  const empty = el('div', 'nobody');
  box(empty, 368, 62, 560, 46);
  stage.append(crowd, empty);

  // ---------- la fascia in cima ----------
  const bar = el('header', 'bar');
  const title = el('span', 'lab');
  const titleText = document.createTextNode(t('office.title'));
  title.append(icon('people'), titleText);
  const count = el('span', 'count');
  const chips = el('span', 'chips');
  const chipS = el('span', 'chip');
  const chipW = el('span', 'chip');
  chips.append(chipS, chipW);
  bar.append(title, count, el('span', 'grow'), chips);

  wrap.append(stage);
  document.body.append(bar, wrap);

  /**
   * La pianta e' in pixel fissi e si rimpicciolisce tutta insieme per stare nella
   * scheda. Non si allarga oltre il vero: ingrandita, una scrivania da 170 pixel
   * diventa una macchia sfocata, e l'ufficio non guadagna niente a essere gigante.
   */
  function fit() {
    const k = Math.min(wrap.clientWidth / STAGE.w, wrap.clientHeight / STAGE.h, 1.35);
    stage.style.transform = 'scale(' + k + ')';
  }
  window.addEventListener('resize', fit);
  new ResizeObserver(fit).observe(wrap);

  // ---------- le persone ----------
  const people = new Map();
  /** Chi siede dove: una volta preso il posto non lo si cambia a ogni giro. */
  const seats = new Array(DESKS.length).fill(null);

  function buildPerson(id) {
    const b = el('button', 'station');
    b.type = 'button';
    const who = el('span', 'guy');
    who.append(el('span', 'shoulders'), el('span', 'head'), el('span', 'hair'));
    const bubble = el('span', 'bubble');
    const dots = el('span', 'dots');
    dots.append(el('i'), el('i'), el('i'));
    bubble.append(dots, icon('checkmark', 'bico'));
    const plate = el('span', 'plate');
    const pname = el('span', 'pname');
    const pbar = el('span', 'pbar');
    const pfill = el('span', 'pfill');
    pbar.append(pfill);
    plate.append(pname, pbar);
    b.append(el('span', 'ring'), who, bubble, plate);
    b.onclick = () => vscode.postMessage({ cmd: 'focus', id });
    b._p = { pname, pfill, plate };
    return b;
  }

  /** Colore della barra: lo stesso semaforo del pannello. */
  const barColor = (p) =>
    p == null ? 'var(--line)' : p >= 80 ? 'var(--bad)' : p >= 60 ? 'var(--warn)' : 'var(--ok)';

  function paintPerson(b, s, spot) {
    b.style.left = spot.x + 'px';
    b.style.top = spot.y + 'px';
    b.classList.toggle('own', !!s.own);
    b.classList.toggle('busy', !!s.busy);
    b.classList.toggle('done', !s.busy && !!s.done);
    b.classList.toggle('recent', !s.busy && !s.done && !!s.recent);
    b.classList.toggle('focused', !!s.focused);
    b._p.pname.textContent = s.name;
    b._p.pfill.style.width = (s.pct == null ? 0 : Math.max(0, Math.min(100, s.pct))) + '%';
    b._p.pfill.style.background = barColor(s.pct);
    const state = s.busy
      ? t('ctx.busy')
      : s.done
        ? t('ctx.done')
        : s.recent
          ? t('ctx.recent')
          : t('ctx.idle');
    const label = t('office.who', { name: s.name, state, pct: s.pct == null ? '—' : s.pct + '%' });
    b.title = label;
    b.setAttribute('aria-label', label);
  }

  let last = null;

  function render(d) {
    if (!d) return;
    last = d;
    const list = d.cards || [];

    // Chi non c'e' piu' libera la scrivania.
    const live = new Set(list.map((s) => s.id));
    seats.forEach((id, i) => {
      if (id && !live.has(id)) seats[i] = null;
    });
    for (const [id, b] of [...people]) {
      if (!live.has(id)) {
        b.remove();
        people.delete(id);
      }
    }

    let spare = 0;
    for (const s of list) {
      let b = people.get(s.id);
      if (!b) {
        b = buildPerson(s.id);
        people.set(s.id, b);
        crowd.append(b);
      }
      let seat = seats.indexOf(s.id);
      if (seat < 0) {
        seat = seats.indexOf(null);
        if (seat >= 0) seats[seat] = s.id;
      }
      // Finiti i posti si sta in piedi in corridoio, in fila lungo il salone.
      // ponytail: oltre una ventina la fila esce dal muro. Venti conversazioni
      // aperte insieme non le ha nessuno; se capita, si va a capo.
      const spot =
        seat >= 0
          ? { x: DESKS[seat].x, y: DESKS[seat].y + SEAT_DY }
          : { x: 410 + spare++ * 66, y: 756 };
      paintPerson(b, s, spot);
    }

    // Il monitor acceso e' della scrivania, non della persona: e' quello che si vede
    // per primo entrando, e da lontano dice gia' chi sta lavorando.
    DESKS.forEach((d, i) => {
      const s = seats[i] ? list.find((c) => c.id === seats[i]) : null;
      d.node.classList.toggle('on', !!s);
      d.node.classList.toggle('working', !!s?.busy);
      d.chair.classList.toggle('taken', !!s);
    });

    count.textContent = t('office.count', { n: list.length });
    empty.textContent = t('office.empty');
    empty.hidden = list.length > 0;

    const pct = (v) => (v == null ? '—' : Math.round(v) + '%');
    chipS.textContent = t('office.session', { pct: pct(d.usage?.session) });
    chipW.textContent = t('office.week', { pct: pct(d.usage?.week) });
    chips.hidden = !d.usage;
  }

  window.I18N.onChange(() => {
    titleText.nodeValue = t('office.title');
    for (const n of stage.querySelectorAll('.room')) {
      n.querySelector('.rname').textContent = t('office.' + n._key);
    }
    if (last) render(last);
  });

  window.addEventListener('message', (e) => {
    if (!e.data) return;
    if (e.data.k === 'lang') window.I18N.set(e.data.value);
    if (e.data.k === 'data') render(e.data.d);
  });

  fit();
  vscode.postMessage({ cmd: 'ready' });
})();
