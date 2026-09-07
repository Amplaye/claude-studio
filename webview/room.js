/* Claude Studio — la stanza.
 *
 * La pianta dell'ufficio e la vita che ci gira dentro, in un posto solo: i muri,
 * i mobili, le scrivanie, dove si puo' mettere i piedi, e il giro di chi ogni
 * tanto si alza e va a prendersi un caffe'.
 *
 * Sta qui e non dentro `office.js` perche' la usano in due: l'ufficio vero
 * dell'estensione e la pagina di prova `docs/office-sv.html`, che e' dove la
 * stanza si monta e si guarda prima di mandarla in produzione. Due copie della
 * stessa pianta si scollano al primo mobile spostato, ed e' proprio la pianta la
 * cosa che si sposta di continuo.
 *
 * Quello che resta di la' e' quello che di qua non c'entra: chi sono le persone,
 * come si chiamano, quanto contesto gli resta, cosa succede se ci clicchi sopra.
 * La stanza non lo sa e non deve saperlo — sa dove sono i muri.
 *
 * I mobili sono ritagli di SeasonVale (`interiors/All Tileset`), impacchettati
 * in un foglio solo da `scripts/sv-sheet.mjs`, che scrive anche la mappa dei
 * nomi in `sv-room.js`. Le persone no: quelle le disegna `npc.js` dal seme.
 *
 * Misure: tutto in pixel di stanza, 384x320. Un mobile non e' grande quanto la
 * sua casella — SeasonVale li disegna alti, perche' si vede anche il fianco —
 * quindi ognuno ha la sua misura vera e si appoggia per terra dal basso.
 */
window.ROOM = (() => {
  const TILE = 16;
  const COLS = 24;
  const ROWS = 20;
  const W = COLS * TILE;
  const H = ROWS * TILE;

  const SV = window.SV;

  const el = (tag, cls) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  };

  /* Chi sta piu' in basso copre chi sta piu' in alto: e' l'unica regola che
     tiene in ordine dei mobili alti, e l'unica che regge mentre la gente si
     sposta. Si ordina sul bordo di sotto, non sulla riga. */
  const depth = (n, bottom) => {
    n.style.zIndex = Math.round(bottom);
    return n;
  };

  // ---------- la pianta ----------
  //
  // I muri sono bande, `{c, r, w, h}` in caselle. I vani delle porte non sono un
  // tipo a parte: sono il pezzo di muro che non c'e'.
  const WALLS = [
    { c: 0, r: 0, w: COLS, h: 1 },
    { c: 0, r: ROWS - 1, w: COLS, h: 1 },
    { c: 0, r: 0, w: 1, h: ROWS },
    { c: COLS - 1, r: 0, w: 1, h: ROWS },
    // I due muri delle stanze in alto. Il buco fra i pezzi e' la porta: righe 3
    // e 4, ed e' da li' che si entra al bar e in riunione.
    { c: 10, r: 1, w: 1, h: 2 },
    { c: 10, r: 5, w: 1, h: 3 },
    { c: 15, r: 1, w: 1, h: 2 },
    { c: 15, r: 5, w: 1, h: 3 },
    // Il muro che divide le due stanze dal salone. Arriva fino a colonna 10,
    // dove trova lo spigolo della sala riunioni: fermandosi a 9 restava un buco
    // quadrato nell'angolo, il pezzo di muro che manca in una pianta disegnata a
    // mano. Il passaggio e' quello fra le due stanze, colonne 11-14.
    { c: 1, r: 7, w: 9, h: 1 },
    { c: 15, r: 7, w: 8, h: 1 },
  ];

  /* Un mobile: `s` il ritaglio, `x` il bordo sinistro e `b` il bordo di sotto,
     in pixel. Il disegno sta in piedi da li' in su, quanto e' alto lui.

     In pixel e non in caselle apposta: i mobili di SeasonVale non sono larghi un
     numero intero di caselle, e allinearli alla griglia li lasciava sbilenchi in
     mezzo alle stanze. Cosi' invece si centrano davvero. */
  const PROPS = [
    // --- sala riunioni: due posti uno di fronte all'altro sui lati lunghi del
    //     tavolo, e la bacheca sul muro. Si siede su sgabelli e basta: la sedia
    //     di SeasonVale ha uno schienale alto che dal davanti copre mezzo
    //     tavolo, e in una stanza vista dall'alto era l'unico mobile di
    //     traverso. ---
    { s: 'cork', x: 67, b: 36 },
    { s: 'board', x: 112, b: 36 },
    { s: 'stoolRound', x: 81, b: 62 },
    { s: 'meetTable', x: 64, b: 84 },
    { s: 'stoolRound', x: 81, b: 100 },
    { s: 'plantPurple', x: 22, b: 110 },

    // --- in mezzo non c'e' niente: e' il passaggio, e serve libero ---

    // --- il bar: la dispensa in fila sul muro, il tavolino e due sgabelli ---
    { s: 'shelfJars', x: 258, b: 48 },
    { s: 'shelfFull', x: 288, b: 48 },
    { s: 'cabinet', x: 318, b: 48 },
    { s: 'nightstand', x: 348, b: 48 },
    { s: 'stoolRound', x: 270, b: 96 },
    { s: 'meetTable', x: 288, b: 96 },
    { s: 'stoolRound', x: 340, b: 96 },
    { s: 'plantBlue', x: 350, b: 112 },

    // --- il salone: il verde sta contro i muri e negli angoli, il mezzo resta
    //     camminabile. Gli angoli in fondo sono l'unico posto di una stanza dove
    //     una pianta non e' mai d'intralcio a nessuno. ---
    { s: 'plantPurple', x: 22, b: 150 },
    { s: 'plantBlue', x: 350, b: 150 },
    { s: 'plantBlue', x: 22, b: 300 },
    { s: 'plantPurple', x: 24, b: 278 },
    { s: 'plantPurple', x: 351, b: 300 },
    { s: 'plantBlue', x: 349, b: 278 },
  ];

  /* Sei scrivanie, due file da tre, centrate sulla larghezza della stanza. Le
     corsie fra una colonna e l'altra sono quelle da cui si sale al passaggio:
     e' il motivo per cui non sono attaccate fra loro. */
  const DESKS = [
    { x: 68, b: 176 },
    { x: 168, b: 176 },
    { x: 268, b: 176 },
    { x: 68, b: 246 },
    { x: 168, b: 246 },
    { x: 268, b: 246 },
  ];

  const SW = SV.desk.w;
  const SH = SV.desk.h;

  /** Dove siede chi lavora alla scrivania `i`: angolo in alto a sinistra della figura. */
  const posto = (i) => ({ x: DESKS[i].x + 16, y: DESKS[i].b + 16 - 24 });

  /* Dove si va quando ci si alza. Sono punti dove si mettono i piedi, non
     tragitti: la strada per arrivarci la trova la stanza, che sa dove sono i
     mobili. Prima erano catene di tappe scritte a mano, e bastava spostare uno
     scaffale perche' qualcuno ci camminasse dentro senza accorgersene.

     Al bar ci sono due posti separati perche' due che ci vanno insieme sono una
     pausa, mentre due fermi nello stesso punto sono una persona sola disegnata
     due volte. Si sta al bancone, fra la dispensa e il tavolino: davanti al
     tavolino la fascia libera e' due pixel e la stanza sigillata. */
  /* La bacheca, e il tavolo dove finisce quello che e' fatto.
   *
   * Un foglietto e' cinque per quattro con la puntina sopra, e non ci sta scritto
   * niente: a questa misura il testo non c'e' e il colore basta. Giallo da fare,
   * azzurro in mano a qualcuno, rosso andato storto, verde archiviato — sono
   * quattro colori e quattro stati, ed e' tutto quello che una bacheca dice
   * davvero anche quando i foglietti sono scritti.
   *
   * Una sola, non tre. Le rosse in cima e le gialle sotto stanno benissimo sullo
   * stesso legno: e' il colore a dividerle, e tre bacheche per una manciata di
   * foglietti sono tre bacheche quasi vuote. La bacheca di sughero li' accanto
   * resta quello che era, cioe' arredamento — ci sono gia' disegnati sopra i suoi
   * fogli, e altri fogli veri sopra quelli finti non si leggerebbero.
   *
   * `griglia` e' l'angolo in alto a sinistra del primo foglietto: da li' in poi
   * quattro per riga, passo otto in orizzontale e sei in verticale. `posto` e'
   * dove ci si ferma davanti, e ci si arriva camminando come dappertutto. `z` e'
   * la profondita' del mobile a cui il foglio e' appeso, piu' uno: la stanza
   * ordina tutto sul bordo di sotto, e un foglio che non lo rispetta finisce
   * dietro al tavolo su cui dovrebbe stare.
   */
  const BACHECHE = {
    muro: { griglia: [117, 10], posto: [134, 56], z: 37 },
    archivio: { griglia: [80, 66], posto: [88, 98], z: 85 },
  };

  const METE = {
    caffe: [280, 62],
    spuntino: [320, 62],
    riunione: [52, 100],
  };
  /* Il bar pesa quattro volte il resto, ed e' giusto cosi': in un ufficio vero
     si va piu' spesso a prendere un caffe' che in sala riunioni. Pesare
     ripetendo il nome e' tutto quello che serve — una tabella di probabilita'
     sarebbe la stessa cosa scritta in dieci righe. */
  const NOMI_METE = ['caffe', 'spuntino', 'caffe', 'spuntino', 'riunione'];

  /* Quello che si dice in ufficio. Frasi corte apposta: a sei pixel una riga
     lunga esce dalla stanza, e comunque in piedi vicino alla macchinetta nessuno
     fa un discorso. Sono le frasi che si sentono davvero, quelle che uno
     riconosce senza doverle leggere due volte. */
  const FRASI = [
    "Vado a fare un caffe'",
    'Prendi qualcosa anche tu?',
    "Il latte e' finito. Di nuovo",
    'Cinque minuti e arrivo',
    'Te la giro per mail',
    'Lo mettiamo a backlog',
    "La stampante s'e' inceppata",
    'Punto veloce alle tre?',
    'Ho la call fra dieci minuti',
    "Venerdi' non si rilascia",
    'In locale funzionava',
    'Chi ha preso la mia tazza?',
    'Domani ci penso',
    'Era una mail, non una call',
    'Due minuti e ho finito',
    'Ci aggiorniamo dopo pranzo',
  ];

  // ---------- dove si puo' mettere i piedi ----------
  //
  // Una griglia da otto pixel su tutta la stanza: la casella e' occupata se ci
  // cade dentro un muro, un mobile o una scrivania. I mobili si contano per
  // tutta la loro sagoma e non solo per la base — sono alti perche' si vede il
  // fianco, ma dietro non ci passa nessuno lo stesso: stanno tutti contro un
  // muro.
  //
  // Gli ostacoli si gonfiano di otto in orizzontale e di due in verticale prima
  // di marcare le caselle. Non e' un margine di sicurezza: e' la persona. Il
  // conto si fa sui piedi, che sono un punto solo, ma la persona e' larga
  // sedici — quindi il punto deve stare almeno a mezza persona da un mobile, o
  // mezza spalla ci entra dentro. In verticale bastano due perche' i piedi
  // stanno gia' in fondo alla figura: la testa che sfiora uno scaffale, vista
  // dall'alto, e' giusto cosi'.
  const CELLA = 8;
  const GC = Math.ceil(W / CELLA);
  const GR = Math.ceil(H / CELLA);
  const MEZZA_PERSONA = 8;
  const MEZZO_PASSO = 2;
  const occupata = new Uint8Array(GC * GR);

  function blocca(x, y, w, h) {
    const x0 = x - MEZZA_PERSONA;
    const x1 = x + w + MEZZA_PERSONA;
    const y0 = y - MEZZO_PASSO;
    const y1 = y + h + MEZZO_PASSO;
    for (let r = 0; r < GR; r++) {
      const cy = r * CELLA + CELLA / 2;
      if (cy < y0 || cy > y1) continue;
      for (let c = 0; c < GC; c++) {
        const cx = c * CELLA + CELLA / 2;
        if (cx >= x0 && cx <= x1) occupata[r * GC + c] = 1;
      }
    }
  }

  for (const w of WALLS) blocca(w.c * TILE, w.r * TILE, w.w * TILE, w.h * TILE);
  for (const p of PROPS) {
    const d = SV[p.s];
    blocca(p.x, p.b - d.h, d.w, d.h);
  }
  for (const d of DESKS) blocca(d.x, d.b - SH, SW, SH);

  const cella = (x, y) =>
    Math.min(GR - 1, Math.max(0, Math.floor(y / CELLA))) * GC +
    Math.min(GC - 1, Math.max(0, Math.floor(x / CELLA)));
  const centro = (n) => [(n % GC) * CELLA + CELLA / 2, ((n / GC) | 0) * CELLA + CELLA / 2];

  /** Il segmento fila dritto senza prendere niente? Si campiona ogni due pixel. */
  function dritto(x0, y0, x1, y1) {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 2));
    for (let i = 0; i <= n; i++) {
      if (occupata[cella(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n)]) return false;
    }
    return true;
  }

  /* La strada da un punto all'altro, in punti dove mettere i piedi.

     Onda a quattro direzioni su tutte le caselle libere, poi si sceglie la piu'
     vicina alla meta' fra quelle a cui si e' arrivati: cosi' una meta' murata —
     o diventata tale spostando un mobile — porta comunque il piu' vicino
     possibile, invece di non portare da nessuna parte. Millenovecento caselle
     non si sentono.

     Il cammino grezzo e' tutto a scalini di otto pixel. Si tira la corda: si va
     avanti finche' si vede il punto in linea retta, e si tiene solo quello piu'
     lontano. Restano tre o quattro tratti lunghi, che e' come attraversa una
     stanza uno che sa dove sta andando. */
  function cammino(x0, y0, x1, y1) {
    const partenza = cella(x0, y0);
    const da = new Int32Array(GC * GR).fill(-1);
    da[partenza] = partenza;
    const coda = [partenza];
    for (let i = 0; i < coda.length; i++) {
      const n = coda[i];
      const c = n % GC;
      const r = (n / GC) | 0;
      for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const c2 = c + dc;
        const r2 = r + dr;
        if (c2 < 0 || r2 < 0 || c2 >= GC || r2 >= GR) continue;
        const m = r2 * GC + c2;
        if (occupata[m] || da[m] >= 0) continue;
        da[m] = n;
        coda.push(m);
      }
    }
    let meglio = partenza;
    let quanto = Infinity;
    for (const n of coda) {
      const [cx, cy] = centro(n);
      const d = Math.hypot(cx - x1, cy - y1);
      if (d < quanto) {
        quanto = d;
        meglio = n;
      }
    }
    const grezzo = [];
    for (let n = meglio; n !== partenza; n = da[n]) grezzo.unshift(centro(n));
    // L'ultimo passo e' la meta' vera e non il centro della casella, quando ci
    // si arriva dritti: se no la gente si ferma sempre sul reticolo.
    const ultimo = grezzo.length ? grezzo[grezzo.length - 1] : [x0, y0];
    if (dritto(ultimo[0], ultimo[1], x1, y1)) grezzo.push([x1, y1]);

    const tirato = [];
    let qui = [x0, y0];
    let i = 0;
    while (i < grezzo.length) {
      let j = grezzo.length - 1;
      while (j > i && !dritto(qui[0], qui[1], grezzo[j][0], grezzo[j][1])) j--;
      tirato.push(grezzo[j]);
      qui = grezzo[j];
      i = j + 1;
    }
    return tirato;
  }

  // ---------- come si costruisce ----------

  /** Appoggia un ritaglio del foglio: bordo sinistro `x`, bordo di sotto `b`. */
  function prop(name, x, b, cls) {
    const d = SV[name];
    const n = el('div', cls ? 'of-prop ' + cls : 'of-prop');
    n.dataset.k = name;
    n.style.left = x + 'px';
    n.style.top = b - d.h + 'px';
    n.style.width = d.w + 'px';
    n.style.height = d.h + 'px';
    n.style.backgroundPosition = -d.x + 'px ' + -d.y + 'px';
    return depth(n, b);
  }

  /**
   * Costruisce la stanza dentro `stage`: pavimento, muri, mobili, scrivanie.
   *
   * Il foglio arriva come indirizzo e non come classe perche' nella webview e'
   * un URI che sa solo l'estensione. Da li' in poi e' foglio di stile.
   *
   * Torna le scrivanie con addosso il loro schermo, che e' l'unica cosa della
   * stanza che poi cambia: chi la usa lo accende e lo spegne.
   */
  function monta(stage, foglio) {
    stage.style.width = W + 'px';
    stage.style.height = H + 'px';
    stage.style.setProperty('--sheet-room', 'url("' + foglio + '")');
    stage.append(el('div', 'of-floor'));

    for (const w of WALLS) {
      const n = el('div', 'of-wall');
      n.style.left = w.c * TILE + 'px';
      n.style.top = w.r * TILE + 'px';
      n.style.width = w.w * TILE + 'px';
      n.style.height = w.h * TILE + 'px';
      stage.append(depth(n, (w.r + w.h) * TILE));
    }
    for (const p of PROPS) stage.append(prop(p.s, p.x, p.b));

    return DESKS.map((d) => {
      stage.append(prop('desk', d.x, d.b, 'of-desk'));
      // Il computer non viene dal foglio: nel pacchetto non c'e' — e' una
      // fattoria medievale — e comunque e' l'unico mobile che deve accendersi,
      // il che vuol dire un colore che cambia e non un'immagine.
      const mon = el('div', 'of-mon');
      mon.append(el('i', 'of-screen'));
      mon.style.left = d.x + 15 + 'px';
      // Il piano della scrivania non e' la cima dello sprite: e' la riga del
      // ripiano, quattro pixel piu' sotto. E' li' che va appoggiato il piede del
      // monitor, se no sembra appeso al muro dietro.
      mon.style.top = d.b - SH + 4 - 16 + 'px';
      // Lo schermo sta SOPRA il piano, non dietro: e' l'unica cosa della stanza
      // che non segue la riga, perche' e' appoggiato sul mobile che la occupa.
      stage.append(depth(mon, d.b + 1));
      return { x: d.x, b: d.b, top: d.b - SH, mon };
    });
  }

  // ---------- come ci si veste ----------
  //
  // Le pose, e quanto ci mette un giro di ciclo. Chi lavora batte a macchina in
  // fretta, chi cammina va a tempo di passo, tutti gli altri respirano piano.
  const DURATA = { fermo: 1700, digita: 420, cammina: 560 };

  /**
   * Veste una figura con la posa che le tocca.
   *
   * Il generatore da' una striscia di fotogrammi affiancati, e il CSS la fa
   * scorrere a scatti interi: nessun timer in JavaScript, e una stanza che si
   * muove anche mentre nessuno la guarda. Se il generatore non sa fare le
   * strisce si ripiega sul disegno fermo — meglio un ufficio immobile che sei
   * scrivanie vuote.
   */
  function vesti(fig, seme, posa) {
    if (fig.dataset.posa === posa && fig.dataset.seme === seme) return;
    fig.dataset.posa = posa;
    fig.dataset.seme = seme;
    const s = window.NPC.strip && window.NPC.strip(seme, posa);
    if (s && s.frames > 1) {
      fig.style.setProperty('--npc', 'url("' + s.url + '")');
      fig.style.setProperty('--nf', s.frames);
      fig.style.setProperty('--nw', s.frames * 16 + 'px');
      fig.style.setProperty('--nd', DURATA[posa] + 'ms');
    } else {
      fig.style.setProperty('--npc', 'url("' + window.NPC.sprite(seme) + '")');
      fig.style.setProperty('--nf', 1);
      fig.style.setProperty('--nw', '16px');
    }
  }

  // ---------- e la vita ----------
  //
  // Ogni tanto uno si alza e va da qualche parte, e ci va per davvero: la strada
  // se la trova, mobile per mobile.
  //
  // Ma solo chi non ha niente da fare. Chi sta lavorando resta alla sua
  // scrivania e batte a macchina: e' l'unica regola che rende l'ufficio
  // leggibile da lontano — se si alzano tutti, il fatto che uno sia in piedi non
  // vuol piu' dire niente. E chi e' fermo da un pezzo non si alza e non parla:
  // sbiadito e in giro sarebbe una contraddizione.
  //
  // E si va in due al massimo, che a questa misura tre che si incrociano per i
  // corridoi sembrano solo confusione.

  /* Pixel al secondo. Due caselle al secondo: il bar sta in fondo alla stanza e
     dall'altra parte di due porte, e a passo di lumaca la pausa caffe' era tutta
     corridoio e mai bar. */
  const VELOCITA = 32;
  /** Due in giro insieme sono una pausa; tre che si incrociano sono confusione. */
  const MAX_FUORI = 2;
  /** Ogni quanto si guarda se Claude e' ripartito, mentre uno e' al bar. */
  const ORECCHIO = 250;

  const attesa = (ms) => new Promise((r) => setTimeout(r, ms));
  const caso = (a) => a[Math.floor(Math.random() * a.length)];
  const piedi = (chi) => [parseFloat(chi.el.style.left) + 8, parseFloat(chi.el.style.top) + 24];

  function muovi(chi, fx, fy) {
    const x = fx - 8;
    const y = fy - 24;
    const dx = x - parseFloat(chi.el.style.left);
    const dy = y - parseFloat(chi.el.style.top);
    const ms = (Math.hypot(dx, dy) / VELOCITA) * 1000;
    chi.el.style.transition = 'left ' + ms + 'ms linear, top ' + ms + 'ms linear';
    chi.el.style.left = x + 'px';
    chi.el.style.top = y + 'px';
    // La profondita' cambia mentre si cammina: chi scende davanti a una
    // scrivania deve passarci davanti, chi risale deve sparirci dietro.
    depth(chi.el, fy);
    return attesa(ms);
  }

  /**
   * Ci va, tratto per tratto.
   *
   * Si ferma per due motivi: la conversazione si e' chiusa mentre lui era in
   * corridoio — e da li' in poi non c'e' piu' nessuno da muovere — oppure Claude
   * e' ripartito, e allora la pausa finisce dov'e'. Il ritorno no: quello non lo
   * ferma niente, perche' tornare a sedersi *e'* la cosa da fare.
   */
  async function vai(chi, fx, fy, ritorno) {
    for (const [x, y] of cammino(...piedi(chi), fx, fy)) {
      if (!chi.el.isConnected) return false;
      if (!ritorno && chi.lavora) return false;
      await muovi(chi, x, y);
    }
    return chi.el.isConnected;
  }

  /**
   * Porta un elemento da dov'e' a `[fx, fy]`, e basta.
   *
   * `vai` qui sopra e' per chi ha una scrivania e una conversazione dietro: si
   * ferma se Claude riparte, e sa dove tornare. Gli impiegati dei sub-agent non
   * hanno niente di tutto questo — entrano dalla porta, si mettono accanto al
   * loro capo e se ne vanno quando hanno finito — e per loro serve solo la
   * strada. Il tragitto e' quello vero: la stanza sa dove sono i mobili.
   */
  async function viaggio(el, fx, fy) {
    const chi = { el };
    for (const [x, y] of cammino(...piedi(chi), fx, fy)) {
      if (!el.isConnected) return false;
      await muovi(chi, x, y);
    }
    return el.isConnected;
  }

  /** Aspetta, ma con un orecchio: se Claude riparte la pausa finisce subito. */
  async function pausa(chi, ms) {
    const fine = Date.now() + ms;
    while (Date.now() < fine && !chi.lavora && chi.el.isConnected) {
      await attesa(Math.min(ORECCHIO, fine - Date.now()));
    }
  }

  /* Uno parla alla volta e per tre secondi: due nuvolette insieme a questa
     misura sono due rettangoli bianchi, e nessuno legge due rettangoli bianchi. */
  function parla(chi) {
    if (chi.dice || !chi.el.isConnected) return;
    const n = el('div', 'of-say');
    n.textContent = caso(FRASI);
    chi.el.append(n);
    chi.dice = n;
    setTimeout(() => {
      n.remove();
      if (chi.dice === n) chi.dice = null;
    }, 3200);
  }

  async function giro(chi, meta) {
    chi.fuori = true;
    chi.meta = meta;
    // Detto anche addosso all'elemento, non solo dentro l'oggetto: da fuori —
    // il foglio di stile, gli attrezzi del browser, i controlli — "e' in
    // corridoio" e' una cosa che si vede, e la posizione di chi cammina non
    // vuol dire niente finche' non e' tornato a sedersi.
    chi.el.classList.add('fuori');
    vesti(chi.fig, chi.seme, 'cammina');
    if (await vai(chi, ...METE[meta])) {
      vesti(chi.fig, chi.seme, 'fermo');
      // Al bar ci si ferma quattro volte tanto. Non e' un vezzo: fra andata e
      // ritorno il tragitto e' mezzo minuto, e con una sosta di due secondi al
      // bar non ci si vede mai nessuno — si vede solo gente nei corridoi.
      const sosta = meta === 'caffe' || meta === 'spuntino' ? 8000 : 2000;
      parla(chi);
      await pausa(chi, sosta + Math.random() * 2500);
      vesti(chi.fig, chi.seme, 'cammina');
    }
    // Si torna sempre, anche se la pausa e' finita a meta' strada: l'unico modo
    // di non tornare e' che la conversazione si sia chiusa, o che nel frattempo
    // il posto non sia piu' suo.
    if (chi.el.isConnected && chi.casa) await vai(chi, chi.casa.x + 8, chi.casa.y + 24, true);
    vesti(chi.fig, chi.seme, chi.posa);
    chi.el.classList.remove('fuori');
    chi.fuori = false;
    chi.meta = null;
    chi.ultimo = Date.now();
  }

  /** A che punto e' il giro delle mete. */
  let prossima = 0;

  /**
   * Il giro, per sempre: `elenco` viene richiamata ogni volta perche' la gente
   * va e viene — una conversazione si chiude e chi la teneva sparisce.
   *
   * Un abitante e': `{ el, fig, seme, casa: {x, y}, posa, ferma, lavora }`. Il
   * resto — `fuori`, `meta`, `dice`, `ultimo` — se lo scrive la stanza addosso.
   */
  async function vita(elenco) {
    for (;;) {
      await attesa(3000 + Math.random() * 4000);
      const tutti = elenco();
      const fuori = tutti.filter((c) => c.fuori);
      if (fuori.length >= MAX_FUORI) continue;
      // Chi lavora resta al suo posto: si va a cazzeggiare solo quando non c'e'
      // niente da fare, come in ufficio.
      const liberi = tutti.filter((c) => !c.fuori && !c.ferma && !c.lavora && c.casa);
      if (!liberi.length) continue;
      // Anche le mete girano, invece di uscire a caso: fra andata, sosta e
      // ritorno un giro dura mezzo minuto, quindi in una stanza guardata per un
      // minuto il caso poteva benissimo non mandare nessuno al bar — ed e' meta'
      // del motivo per cui uno si alza. Quelle gia' occupate si saltano: due
      // fermi nello stesso punto sono una persona sola disegnata due volte.
      const presi = new Set(fuori.map((c) => c.meta));
      let meta = null;
      for (let i = 0; i < NOMI_METE.length && !meta; i++) {
        const m = NOMI_METE[prossima];
        prossima = (prossima + 1) % NOMI_METE.length;
        if (!presi.has(m)) meta = m;
      }
      if (!meta) continue;
      // Tocca a chi e' tornato al posto per primo: cosi' il giro fa il giro
      // davvero, invece di ricadere sempre sugli stessi due. Non si aspetta che
      // rientri — e' proprio l'attesa che teneva l'ufficio a uno in piedi.
      giro(
        liberi.reduce((a, b) => ((a.ultimo || 0) <= (b.ultimo || 0) ? a : b)),
        meta
      );
    }
  }

  /** Le chiacchiere vanno per conto loro: si parla anche da seduti — ma non
      mentre si lavora, che e' il punto di tutto il resto. */
  async function chiacchiere(elenco) {
    for (;;) {
      await attesa(4000 + Math.random() * 5000);
      const vivi = elenco().filter((c) => !c.ferma && !c.lavora && !c.dice);
      if (vivi.length) parla(caso(vivi));
    }
  }

  // ---------- la posta ----------
  //
  // Una busta che vola dalla porta a una scrivania quando parte un turno, e
  // dalla scrivania alla porta quando il turno finisce.
  //
  // Non e' un vezzo: uno schermo acceso e uno che si spegne dicono *com'e'
  // adesso*, e stando dall'altra parte della stanza il momento in cui cambia si
  // perde. La busta dice il momento — e da lontano, prima ancora di leggere un
  // nome, si vede se la stanza sta ricevendo o consegnando.
  //
  // La porta e' il muro in fondo in mezzo: e' da li' che entri tu, ed e' l'unico
  // punto della pianta che non e' di nessuno.
  //
  // Vola per conto suo. Gli estremi si fissano alla partenza — chi la manda puo'
  // benissimo alzarsi e andare al bar mentre lei e' ancora in aria, e una busta
  // che insegue una persona e' una busta che sbanda. L'arco lo fa `offset-path`:
  // una curva di due punti e un'animazione sola, invece di un timer che ridipinge
  // un elemento sessanta volte al secondo per un secondo e mezzo.
  const PORTA = [W / 2, H - TILE];
  /** Quante ne stanno in aria insieme. Oltre, sono coriandoli. */
  const MAX_BUSTE = 8;

  /**
   * Manda una busta fra la porta e `[x, y]`.
   *
   * `verso` e' `'giu''` quando la risposta esce e `'su'` quando il turno entra;
   * decide il colore e da che parte si vola.
   */
  function posta(stage, x, y, verso) {
    // Si contano quelle che ci sono, invece di tenere il conto: la stanza si
    // rimonta da capo quando la scheda si riapre, e un contatore sopravvissuto a
    // un rimontaggio e' un contatore che dice otto per sempre.
    if (stage.querySelectorAll('.of-mail').length >= MAX_BUSTE) return;
    const [px, py] = PORTA;
    const [x0, y0, x1, y1] = verso === 'su' ? [px, py, x, y] : [x, y, px, py];
    const n = el('div', 'of-mail ' + verso);
    // Il punto di controllo sta in mezzo e trentotto pixel piu' in alto: e'
    // quello che fa la campata. Piatta, una busta sembra trascinata per terra.
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2 - 38;
    n.style.offsetPath = `path("M ${x0} ${y0} Q ${cx} ${cy} ${x1} ${y1}")`;
    // La durata viene dalla distanza, non dall'orologio: una busta che attraversa
    // tutta la stanza nello stesso tempo di una che va alla scrivania accanto e'
    // una che vola e una che scatta.
    const ms = Math.min(2000, Math.max(800, (Math.hypot(x1 - x0, y1 - y0) / 230) * 1000));
    n.style.animationDuration = ms + 'ms';
    n.addEventListener('animationend', () => n.remove());
    stage.append(n);
  }

  return {
    TILE,
    COLS,
    ROWS,
    W,
    H,
    SV,
    PROPS,
    DESKS,
    METE,
    BACHECHE,
    PORTA,
    SW,
    SH,
    posto,
    monta,
    posta,
    viaggio,
    vesti,
    cammino,
    occupata,
    cella,
    /** Si accende una volta: da li' in poi la stanza vive da sola. */
    accendi(elenco) {
      vita(elenco);
      chiacchiere(elenco);
    },
  };
})();
