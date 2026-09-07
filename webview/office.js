/* Claude Studio — L'ufficio.
 *
 * La pianta di un ufficio vista dall'alto, e dentro una persona per ogni
 * conversazione aperta: seduta alla sua scrivania, che batte a macchina mentre
 * Claude lavora, con la spunta verde quando ha finito, sbiadita quando e' ferma
 * da un pezzo.
 *
 * E' la stessa roba del pannello del contesto — stesse sessioni, stesso filo,
 * stesso "clicca e ci vai" — detta nell'unico modo che non chiede di leggere
 * niente. Il pannello risponde a "quanto contesto le resta"; questa risponde a
 * "chi c'e' e chi sta lavorando" dall'altra parte della stanza.
 *
 * I mobili e le persone sono sprite di Kenney (kenney.nl, CC0): due fogli da
 * 16 pixel, `sprites-room.png` e `sprites-folk.png`. Pavimento e muri no —
 * quelli sono due gradienti CSS, perche' un pavimento a mattonelle e' una
 * ripetizione e ripeterla e' quello che il CSS sa fare senza chiedere immagini.
 *
 * Tre regole di casa:
 *   - niente innerHTML con dei dati: tutto passa da textContent;
 *   - si costruisce una volta e poi si ridipinge. Rifare i nodi a ogni giro
 *     ammazzerebbe le transizioni, e la camminata verso la scrivania nuova non
 *     partirebbe mai;
 *   - la pianta sta qui sotto come dati in unita' di mattonella, non come CSS.
 *     Spostare una scrivania e' cambiare due numeri.
 *
 * Non chiama acquireVsCodeApi: vive dentro la pagina della chat, che l'ha gia'
 * chiamata lei (una volta sola per pagina, e' l'unica che se ne puo' prendere).
 * Il filo glielo passa chi lo monta.
 */
window.OFFICE = (() => {
  const TILE = 16;
  /** Il passo del foglio: 16 di disegno piu' 1 di margine fra una casella e l'altra. */
  const STEP = 17;
  // Una pianta piccola, non un piano intero. Meno mattonelle vuol dire piu' pixel
  // per mattonella nello stesso spazio: la stessa stanza vista da vicino invece
  // che dall'elicottero.
  const COLS = 24;
  const ROWS = 20;

  const t = (key, vars) => window.I18N.t(key, vars);

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  // ---------- il foglio degli sprite ----------
  //
  // [colonna, riga] dentro sprites-room.png. I nomi sono quello che la casella
  // sembra qui, non quello che era nel pacchetto di Kenney: la cucina di una
  // locanda vista dall'alto e' una scrivania, e la stufa e' la fotocopiatrice.
  const T = {
    deskL: [0, 17],
    deskR: [2, 17],
    runL: [9, 17],
    runM: [10, 17],
    runR: [11, 17],
    tableTL: [0, 0],
    tableTM: [1, 0],
    tableTR: [2, 0],
    tableBL: [0, 1],
    tableBM: [1, 1],
    tableBR: [2, 1],
    stool: [0, 2],
    chairUp: [1, 2],
    chairL: [2, 2],
    chairR: [3, 2],
    plantA: [16, 0],
    plantB: [17, 0],
    copier: [14, 16],
    fridgeT: [11, 15],
    fridgeB: [11, 16],
    counterL: [8, 15],
    counterM: [9, 15],
    counterR: [10, 15],
    sinkT: [8, 12],
    sinkB: [8, 13],
    shelfA: [16, 17],
    shelfB: [17, 17],
    shelfC: [18, 17],
    greenA: [16, 16],
    greenB: [17, 16],
    boardL: [19, 12],
    boardM: [20, 12],
    boardR: [21, 12],
    picA: [16, 12],
    picB: [17, 12],
    picC: [18, 12],
    sofaL: [0, 9],
    sofaM: [1, 9],
    sofaR: [2, 9],
    rugL: [19, 10],
    rugR: [20, 10],
    binA: [22, 4],
    binB: [22, 5],
    // Il bancone del bar: gli stessi mobili della cucina, ma con la roba sopra —
    // ed e' la roba sopra a fare la differenza fra un bancone e un armadio.
    barA: [4, 17],
    barB: [5, 17],
    barC: [6, 17],
    barD: [7, 17],
  };

  /**
   * Le persone si montano a strati, che e' come il pacchetto di Kenney e' fatto:
   * corpo, maglietta, capelli, tutti allineati sulla stessa casella da 16. Otto
   * magliette e otto teste bastano a non vedere due volte la stessa persona in
   * una stanza — e la scelta la fa l'id della conversazione, quindi la stessa
   * conversazione ritrova sempre la sua faccia.
   */
  const BODY = [
    [0, 0],
    [0, 1],
    [0, 2],
    [1, 0],
    [1, 1],
    [1, 2],
  ];
  /**
   * Le magliette. Le righe 1 e 6 sono quelle col colletto bianco — camicia da
   * ufficio; le righe 0 e 5 sono tinta unita.
   *
   * Le righe 4 e 9 no: da lontano sembrano magliette, ma sono corazze con gli
   * spallacci, e mezzo ufficio andava in giro vestito da guerra.
   */
  const SHIRT = [
    [8, 1],
    [12, 1],
    [16, 1],
    [8, 6],
    [12, 6],
    [16, 6],
    [12, 0],
    [16, 0],
    [8, 0],
    [8, 5],
  ];
  /** La divisa di chi non e' nostro: neutra, e uguale per tutti. */
  const SHIRT_GUEST = [12, 5];
  /**
   * I capelli. Nel foglio stanno alle colonne 19-26: un blocco per colore
   * (castano, rosso, biondo, nero, bianco) e una pettinatura per casella.
   *
   * La colonna 3 — dove li avevamo cercati prima — sono le cinture. Per un
   * giorno intero mezzo ufficio ha lavorato con una cintura in testa.
   */
  const HAIR = [
    [20, 0],
    [21, 0],
    [24, 0],
    [25, 0],
    [20, 4],
    [21, 4],
    [24, 4],
    [25, 4],
    [20, 8],
    [21, 8],
  ];

  /** Somma dei caratteri: basta a spargere, e la stessa id da' sempre lo stesso. */
  function hash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }

  /**
   * Una scelta dall'elenco, diversa per ogni strato.
   *
   * Il sale rimescola prima di prendere il resto: con un semplice `h >> 3` due
   * conversazioni con l'id vicino finivano sulla stessa maglietta, e mezzo
   * ufficio si vestiva uguale.
   */
  function pick(list, h, salt) {
    const m = Math.imul(h ^ Math.imul(salt, 0x9e3779b1), 0x85ebca6b) >>> 0;
    return list[(m >>> 13) % list.length];
  }

  // ---------- la pianta, in mattonelle ----------
  //
  // I muri sono bande color panna: `{c, r, w, h}` in mattonelle. I vani delle
  // porte non sono un tipo a parte — sono il pezzo di muro che non c'e'.
  const WALLS = [
    // il muro esterno
    { c: 0, r: 0, w: COLS, h: 1 },
    { c: 0, r: ROWS - 1, w: COLS, h: 1 },
    { c: 0, r: 0, w: 1, h: ROWS },
    { c: COLS - 1, r: 0, w: 1, h: ROWS },

    // sala riunioni, in alto a sinistra. Il buco fra i due pezzi e' la porta.
    { c: 10, r: 1, w: 1, h: 2 },
    { c: 10, r: 5, w: 1, h: 3 },

    // zona bar, in alto a destra
    { c: 15, r: 1, w: 1, h: 2 },
    { c: 15, r: 5, w: 1, h: 3 },

    // il muro che divide le due stanze dal salone, e in mezzo il passaggio
    { c: 1, r: 7, w: 9, h: 1 },
    { c: 14, r: 7, w: 9, h: 1 },
  ];

  /** I mobili che non hanno nessuno seduto: fanno la differenza fra una pianta e un ufficio. */
  const PROPS = [
    // --- sala riunioni, in alto a sinistra ---
    { s: 'boardL', c: 3, r: 1 },
    { s: 'boardM', c: 4, r: 1 },
    { s: 'boardR', c: 5, r: 1 },
    { s: 'plantA', c: 8, r: 1 },
    { s: 'tableTL', c: 3, r: 3 },
    { s: 'tableTM', c: 4, r: 3 },
    { s: 'tableTM', c: 5, r: 3 },
    { s: 'tableTM', c: 6, r: 3 },
    { s: 'tableTR', c: 7, r: 3 },
    { s: 'tableBL', c: 3, r: 4 },
    { s: 'tableBM', c: 4, r: 4 },
    { s: 'tableBM', c: 5, r: 4 },
    { s: 'tableBM', c: 6, r: 4 },
    { s: 'tableBR', c: 7, r: 4 },
    { s: 'chairUp', c: 4, r: 2 },
    { s: 'chairUp', c: 6, r: 2 },
    { s: 'stool', c: 4, r: 5 },
    { s: 'stool', c: 6, r: 5 },
    { s: 'chairL', c: 2, r: 3 },
    { s: 'chairR', c: 8, r: 3 },
    { s: 'plantB', c: 1, r: 5 },

    // --- l'ingresso, fra le due stanze: il divano dove si aspetta, le stampanti ---
    { s: 'sofaL', c: 11, r: 1 },
    { s: 'sofaM', c: 12, r: 1 },
    { s: 'sofaR', c: 13, r: 1 },
    { s: 'rugL', c: 11, r: 3 },
    { s: 'rugR', c: 12, r: 3 },
    { s: 'plantA', c: 11, r: 5 },

    // --- la zona bar: il bancone con sopra la roba, il frigo, e il tavolino dove
    //     ci si siede a non lavorare. Senza quello e' una cucina, non un bar. ---
    { s: 'shelfA', c: 16, r: 1 },
    { s: 'shelfB', c: 17, r: 1 },
    { s: 'shelfC', c: 18, r: 1 },
    { s: 'greenA', c: 20, r: 1 },
    { s: 'barA', c: 16, r: 2 },
    { s: 'barB', c: 17, r: 2 },
    { s: 'barC', c: 18, r: 2 },
    { s: 'barD', c: 19, r: 2 },
    { s: 'sinkT', c: 20, r: 2 },
    { s: 'fridgeT', c: 22, r: 1 },
    { s: 'fridgeB', c: 22, r: 2 },
    { s: 'chairUp', c: 17, r: 3 },
    { s: 'chairUp', c: 19, r: 3 },
    { s: 'tableTL', c: 17, r: 4 },
    { s: 'tableTM', c: 18, r: 4 },
    { s: 'tableTR', c: 19, r: 4 },
    { s: 'stool', c: 17, r: 5 },
    { s: 'stool', c: 19, r: 5 },
    { s: 'plantB', c: 16, r: 5 },
    { s: 'plantA', c: 22, r: 5 },

    // --- il salone: quello che sta fra una scrivania e l'altra ---
    { s: 'plantA', c: 1, r: 8 },
    { s: 'plantB', c: 22, r: 8 },
    { s: 'copier', c: 20, r: 9 },
    { s: 'plantA', c: 22, r: 12 },
    { s: 'shelfA', c: 20, r: 18 },
    { s: 'shelfB', c: 21, r: 18 },
    { s: 'shelfC', c: 22, r: 18 },
    { s: 'binB', c: 1, r: 12 },
    { s: 'plantB', c: 1, r: 18 },
  ];

  /**
   * Le postazioni, nell'ordine in cui si riempiono: prima il salone in basso —
   * che e' dove ci si siede davvero — poi il salone in alto a destra, e
   * l'ufficio del capo per ultimo. Che e' esattamente l'ordine in cui si riempie
   * un ufficio vero.
   *
   * `c`,`r` sono la mattonella in alto a sinistra della scrivania, larga due.
   * Chi ci lavora sta sotto, e sotto ancora c'e' lo sgabello.
   */
  const DESKS = [
    { c: 2, r: 9 },
    { c: 7, r: 9 },
    { c: 12, r: 9 },
    { c: 17, r: 9 },
    { c: 2, r: 14 },
    { c: 7, r: 14 },
    { c: 12, r: 14 },
    { c: 17, r: 14 },
  ];
  /** Quanto sta sotto la scrivania chi ci lavora, in mattonelle. */
  const SEAT_DR = 1.1;
  /** E lo sgabello sotto di lui. */
  const STOOL_DR = 1.8;

  // ---------- la scena ----------
  let root;
  let stage;
  let crowd;
  let empty;
  let count;
  let chips;
  let chipS;
  let chipW;
  let boss;
  let bossLayers;
  let bossName;
  let bossWhat;
  let send = () => {};
  let last = null;
  const people = new Map();
  /** Chi siede dove: una volta preso il posto non lo si cambia a ogni giro. */
  const seats = new Array(DESKS.length).fill(null);

  /** Mette uno sprite del foglio delle stanze su una mattonella. */
  function room(name, c, r, cls) {
    const [sc, sr] = T[name];
    const n = el('div', cls ? 'spr ' + cls : 'spr');
    n.style.backgroundPosition = -sc * STEP + 'px ' + -sr * STEP + 'px';
    n.style.left = c * TILE + 'px';
    n.style.top = r * TILE + 'px';
    return n;
  }

  /** Uno strato di una persona: stesso mestiere, foglio diverso. */
  function folk(sc, sr, cls) {
    const n = el('span', 'spr folk ' + cls);
    n.style.backgroundPosition = -sc * STEP + 'px ' + -sr * STEP + 'px';
    return n;
  }

  function build(container, post) {
    root = container;
    send = post;
    root.textContent = '';

    // Gli sprite arrivano come URI della webview: il CSP non fa passare un
    // <style> scritto nella pagina, quindi la strada e' un data-attributo letto
    // di qui e messo in una variabile CSS. Da li' in poi e' foglio di stile.
    // Assoluti, sempre: un indirizzo relativo dentro una variabile CSS lo risolve
    // il foglio di stile, non la pagina — e il foglio sta in una cartella piu' giu'.
    // Nella webview vera arrivano gia' assoluti e questo non li tocca.
    const abs = (p) => (p ? new URL(p, document.baseURI).href : '');
    root.style.setProperty('--sheet-room', 'url("' + abs(root.dataset.room) + '")');
    root.style.setProperty('--sheet-folk', 'url("' + abs(root.dataset.folk) + '")');

    // --- la fascia in cima ---
    const bar = el('header', 'of-bar');
    const title = el('span', 'of-lab');
    const titleText = document.createTextNode(t('office.title'));
    const ico = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ico.setAttribute('class', 'ico');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#ion-people');
    ico.appendChild(use);
    title.append(ico, titleText);
    count = el('span', 'of-count');
    chips = el('span', 'of-chips');
    chipS = el('span', 'of-chip');
    chipW = el('span', 'of-chip');
    chips.append(chipS, chipW);

    // Il bottone per tornare alla chat classica. Sta qui e non fra i comandi di
    // VS Code perche' l'ufficio riempie la scheda: quando ci sei dentro, questa
    // fascia e' l'unica cosa dell'estensione che vedi.
    const back = el('button', 'of-back');
    back.type = 'button';
    const backText = el('span', null, t('office.toChat'));
    const bico = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    bico.setAttribute('class', 'ico');
    const buse = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    buse.setAttribute('href', '#ion-chatbubble-ellipses');
    bico.appendChild(buse);
    back.append(bico, backText);
    back.onclick = () => send({ cmd: 'view', value: 'chat' });

    // Chi comanda il piano. Non e' un'altra card: e' la stessa persona che sta
    // seduta di la' in mezzo alle altre, disegnata grande abbastanza da vederla
    // in faccia — cosi' sai con chi stai parlando senza doverla cercare fra
    // sedici teste da sedici pixel.
    boss = el('div', 'of-boss');
    const face = el('span', 'of-face');
    bossLayers = [
      folk(0, 0, 'l-body'),
      folk(0, 0, 'l-shirt'),
      folk(0, 0, 'l-hair'),
    ];
    face.append(...bossLayers);
    bossName = el('span', 'of-boss-name');
    bossWhat = el('span', 'of-boss-what');
    const bossText = el('span', 'of-boss-text');
    bossText.append(bossName, bossWhat);
    boss.append(face, bossText);

    bar.append(title, count, el('span', 'of-grow'), boss, chips, back);

    // --- il piano ---
    const wrap = el('div', 'of-wrap');
    stage = el('div', 'of-stage');
    stage.style.width = COLS * TILE + 'px';
    stage.style.height = ROWS * TILE + 'px';

    stage.append(el('div', 'of-floor'));

    for (const w of WALLS) {
      const n = el('div', 'of-wall');
      n.style.left = w.c * TILE + 'px';
      n.style.top = w.r * TILE + 'px';
      n.style.width = w.w * TILE + 'px';
      n.style.height = w.h * TILE + 'px';
      stage.append(n);
    }

    for (const p of PROPS) stage.append(room(p.s, p.c, p.r));

    // Le scrivanie ci sono anche quando non ci siede nessuno: un ufficio con
    // quindici posti vuoti dice quante conversazioni potresti avere aperte, uno
    // con tre scrivanie e basta sembra un ufficio da tre persone.
    for (const d of DESKS) {
      const seat = room('stool', d.c + 0.5, d.r + STOOL_DR, 'of-stool');
      const left = room('deskL', d.c, d.r, 'of-desk');
      const right = room('deskR', d.c + 1, d.r, 'of-desk');
      // Il monitor e' disegnato qui e non preso dal foglio: nel pacchetto non
      // c'e' — e comunque e' l'unico mobile che deve accendersi, il che vuol
      // dire un colore che cambia, non un'immagine.
      const mon = el('div', 'of-mon');
      mon.style.left = (d.c + 0.5) * TILE + 'px';
      mon.style.top = (d.r + 0.05) * TILE + 'px';
      d.nodes = [left, right, mon];
      d.seat = seat;
      stage.append(seat, left, right, mon);
    }

    crowd = el('div', 'of-crowd');
    empty = el('div', 'of-nobody');
    stage.append(crowd, empty);

    wrap.append(stage);
    root.append(bar, wrap);

    new ResizeObserver(fit).observe(wrap);
    fitOn = wrap;
    fit();

    window.I18N.onChange(() => {
      titleText.nodeValue = t('office.title');
      backText.textContent = t('office.toChat');
      if (last) render(last);
    });
  }

  let fitOn;

  /**
   * La pianta e' in pixel fissi e si ingrandisce tutta insieme per riempire la
   * scheda. Il fattore si arrotonda a mezzi: su pixel art un ingrandimento con
   * la virgola lunga fa mattonelle larghe una volta tre e una volta quattro, e
   * il pavimento comincia a ondeggiare.
   */
  function fit() {
    if (!fitOn) return;
    const raw = Math.min(fitOn.clientWidth / (COLS * TILE), fitOn.clientHeight / (ROWS * TILE));
    const k = Math.max(0.5, Math.min(5, Math.floor(raw * 4) / 4));
    stage.style.transform = 'scale(' + k + ')';
  }

  // ---------- le persone ----------

  function buildPerson(s) {
    const b = el('button', 'of-guy');
    b.type = 'button';
    const h = hash(s.id);
    const who = el('span', 'of-body');
    const [bc, br] = pick(BODY, h, 1);
    // Le schede dell'estensione ufficiale vanno in camice bianco: la stessa
    // distinzione che il pannello fa con l'icona sulla card, detta senza parole.
    // Le nostre si vestono come gli pare.
    const [sc, sr] = s.own ? pick(SHIRT, h, 2) : SHIRT_GUEST;
    const [hc, hr] = pick(HAIR, h, 3);
    who.append(folk(bc, br, 'l-body'), folk(sc, sr, 'l-shirt'), folk(hc, hr, 'l-hair'));

    const bubble = el('span', 'of-bubble');
    const dots = el('span', 'of-dots');
    dots.append(el('i'), el('i'), el('i'));
    const tick = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    tick.setAttribute('class', 'ico of-tick');
    const tuse = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    tuse.setAttribute('href', '#ion-checkmark');
    tick.appendChild(tuse);
    bubble.append(dots, tick);

    const plate = el('span', 'of-plate');
    const pname = el('span', 'of-name');
    const pbar = el('span', 'of-bar2');
    const pfill = el('span', 'of-fill');
    pbar.append(pfill);
    plate.append(pname, pbar);

    b.append(el('span', 'of-ring'), who, bubble, plate);
    b.onclick = () => send({ cmd: 'focus', id: s.id });
    b._p = { pname, pfill };
    return b;
  }

  /** Colore della barra: lo stesso semaforo del pannello. */
  const barColor = (p) =>
    p == null ? 'var(--line)' : p >= 80 ? 'var(--bad)' : p >= 60 ? 'var(--warn)' : 'var(--ok)';

  function paintPerson(b, s, c, r) {
    b.style.left = c * TILE + 'px';
    b.style.top = r * TILE + 'px';
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

  function render(d) {
    if (!d || !root) return;
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
        b = buildPerson(s);
        people.set(s.id, b);
        crowd.append(b);
      }
      let seat = seats.indexOf(s.id);
      if (seat < 0) {
        seat = seats.indexOf(null);
        if (seat >= 0) seats[seat] = s.id;
      }
      // Finiti i posti si sta in piedi in fondo al salone, in fila lungo il muro:
      // e' il posto dove uno aspetta davvero che si liberi una scrivania.
      // ponytail: oltre una fila si va a capo, e alla seconda si esce dal muro.
      // Ventidue conversazioni aperte insieme non le ha nessuno.
      const d0 = DESKS[seat];
      const c = seat >= 0 ? d0.c + 0.5 : 2 + (spare % 15) * 1.4;
      const r = seat >= 0 ? d0.r + SEAT_DR : 17.6 + Math.floor(spare++ / 15) * 1.3;
      paintPerson(b, s, c, r);
    }

    // Il monitor acceso e' della scrivania, non della persona: e' quello che si
    // vede per primo entrando, e da lontano dice gia' chi sta lavorando.
    DESKS.forEach((dk, i) => {
      const s = seats[i] ? list.find((x) => x.id === seats[i]) : null;
      const mon = dk.nodes[2];
      mon.classList.toggle('on', !!s);
      mon.classList.toggle('working', !!s?.busy);
      dk.seat.classList.toggle('taken', !!s);
    });

    // Il ritratto in cima: la conversazione che stai guardando, o — se non ne
    // stai guardando nessuna — quella che ha lavorato per ultima, che e' quella
    // a cui torneresti.
    const head = list.find((s) => s.focused) || list.find((s) => s.busy) || list[0];
    boss.hidden = !head;
    if (head) {
      const h = hash(head.id);
      const parts = [
        pick(BODY, h, 1),
        head.own ? pick(SHIRT, h, 2) : SHIRT_GUEST,
        pick(HAIR, h, 3),
      ];
      bossLayers.forEach((n, i) => {
        n.style.backgroundPosition = -parts[i][0] * STEP + 'px ' + -parts[i][1] * STEP + 'px';
      });
      bossName.textContent = head.name;
      bossWhat.textContent = head.busy
        ? t('ctx.busy')
        : head.done
          ? t('ctx.done')
          : head.recent
            ? t('ctx.recent')
            : t('ctx.idle');
      boss.classList.toggle('busy', !!head.busy);
    }

    count.textContent = t('office.count', { n: list.length });
    empty.textContent = t('office.empty');
    empty.hidden = list.length > 0;

    const pct = (v) => (v == null ? '—' : Math.round(v) + '%');
    chipS.textContent = t('office.session', { pct: pct(d.usage?.session) });
    chipW.textContent = t('office.week', { pct: pct(d.usage?.week) });
    chips.hidden = !d.usage;
  }

  return {
    /** Si monta una volta sola, dentro il contenitore che gli da' la pagina. */
    mount(container, post) {
      if (!root) build(container, post);
    },
    render,
    /** Tornato a schermo dopo essere stato via: la misura di prima non vale piu'. */
    resize: fit,
  };
})();
