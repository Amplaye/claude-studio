/* ============================================================================
   Impiegati procedurali — un ufficio Dunder Mifflin da 16x24 pixel.

   La pianta dell'ufficio mette una persona per conversazione aperta. Prima
   erano tre caselle prese da un foglio di sprite, uguali per tutti: da lontano
   otto scrivanie con otto volte lo stesso omino. Qui la persona nasce dal seme
   (il titolo della conversazione), e lo stesso seme rida' sempre la stessa
   faccia — se no la gente cambia testa a ogni render e l'ufficio smette di
   essere un posto.

     window.NPC.traits(seme)  -> i tratti scelti
     window.NPC.sprite(seme)  -> data URL PNG 64x96 (pixel, 4x)
     window.NPC.vector(seme)  -> data URL SVG viewBox 0 0 16 24

   Nessuna dipendenza, nessuna rete: si apre da file://.
   ========================================================================== */
(function () {
  'use strict';

  const L = 16;      // larghezza logica
  const A = 24;      // altezza logica, piedi in fondo
  const ZOOM = 4;    // il PNG esce a 64x96: nitido senza ricampionare

  /* -- caso ripetibile ------------------------------------------------------
     FNV-1a sul seme + mulberry32: due righe, nessuna libreria, e soprattutto
     deterministico anche fra sessioni diverse (Math.random non lo e'). */
  function impronta(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function dado(n) {
    return function () {
      n = (n + 0x6d2b79f5) | 0;
      let t = Math.imul(n ^ (n >>> 15), 1 | n);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pesca = (r, a) => a[Math.floor(r() * a.length)];

  /* Mescola due esadecimali: serve per la stoppia (pelle + pelo) e per la
     bocca, che su una pelle scura non puo' essere lo stesso marrone di una
     chiara. */
  function mescola(a, b, k) {
    const n = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const x = n(a), y = n(b);
    return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join('');
  }

  // Luminanza percepita: serve solo a sapere se due tinte si staccano.
  const luce = (hex) => {
    const [r, v, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return 0.299 * r + 0.587 * v + 0.114 * b;
  };

  /* -- tinte ----------------------------------------------------------------
     Vestiti, pantaloni e accenti escono dalle tre rampe del CRM BaliFlow
     (terracotta, oliva, sabbia) cosi' la gente sta nella stessa stanza dei
     mobili. Pelle e capelli hanno bisogno di tinte in piu': sono tenute calde
     e imparentate con la terracotta, mai grigio-bluastre.
     Ogni materiale ha tre toni: luce, corpo, ombra. E' quello che separa una
     figura piatta da una disegnata. */
  const PELLI = [
    { nome: 'porcellana', toni: ['#FFF7EC', '#F4E4CD', '#DCBFA0'] },
    { nome: 'sabbia',     toni: ['#FBE2C4', '#E9C69F', '#C4986D'] },
    { nome: 'miele',      toni: ['#EEC292', '#D8A374', '#AC7A4C'] },
    { nome: 'ambra',      toni: ['#D49B6C', '#B87A4E', '#8B5531'] },
    { nome: 'noce',       toni: ['#AB6D46', '#8C5433', '#5F3520'] },
    { nome: 'ebano',      toni: ['#7E4C31', '#5C3520', '#3A2013'] },
  ];
  const CAPELLI = [
    { nome: 'corvino',    toni: ['#413327', '#2B2118', '#171008'] },
    { nome: 'cioccolato', toni: ['#5F452F', '#43301F', '#281A0F'] },
    { nome: 'castano',    toni: ['#8E6339', '#6E4A2C', '#452A16'] },
    { nome: 'rame',       toni: ['#C87340', '#A8542A', '#72331A'] },
    { nome: 'biondo',     toni: ['#EFCB86', '#CFA45C', '#987034'] },
    { nome: 'cenere',     toni: ['#C4B39A', '#9E8C74', '#6B5C4A'] },
    { nome: 'brizzolato', toni: ['#CDC5B7', '#A9A296', '#756E5D'] },
    { nome: 'bianco',     toni: ['#F7F2E9', '#DED6C6', '#AA9F8C'] },
  ];
  const CAMICIE = [  // tinte chiare: camicie, polo, quello che si vede sotto
    { nome: 'bianca',      toni: ['#FFFDF8', '#FCF6ED', '#DCC7AC'] },
    { nome: 'avorio',      toni: ['#FCF6ED', '#F4E4CD', '#D2B694'] },
    { nome: 'pesca',       toni: ['#FFF3EC', '#FFE4D2', '#EDB392'] },
    { nome: 'salvia',      toni: ['#F6F7F4', '#EAEDE5', '#C4CEB6'] },
    { nome: 'salvia scura',toni: ['#EAEDE5', '#D6DDCB', '#A8B899'] },
    { nome: 'albicocca',   toni: ['#FFE4D2', '#FFC9A9', '#DF8F66'] },
  ];
  const MAGLIE = [   // tinte piene: cardigan, maglioni, giacche
    { nome: 'terracotta', toni: ['#FB7740', '#F45517', '#BE2E0B'] },
    { nome: 'mattone',    toni: ['#E53F0C', '#BE2E0B', '#7A2211'] },
    { nome: 'ruggine',    toni: ['#BE2E0B', '#972611', '#5E1A0C'] },
    { nome: 'oliva',      toni: ['#768A61', '#5C6C4B', '#3C4633'] },
    { nome: 'salvia',     toni: ['#B8C6A9', '#95A881', '#6B7C58'] },
    { nome: 'muschio',    toni: ['#5C6C4B', '#49563D', '#2B3324'] },
    { nome: 'sabbia',     toni: ['#F4E4CD', '#E1CAB2', '#B0906F'] },
  ];
  const PANTALONI = [
    { nome: 'antracite', toni: ['#49563D', '#3C4633', '#242C1D'] },
    { nome: 'oliva',     toni: ['#6C7E58', '#5C6C4B', '#3C4633'] },
    { nome: 'chino',     toni: ['#E1CAB2', '#C9AE91', '#95795C'] },
    { nome: 'ruggine',   toni: ['#8E3319', '#7A2211', '#4C1408'] },
  ];
  const ACCENTI = [  // cravatte, bottoni, cordino del badge
    { nome: 'terracotta', toni: ['#FB7740', '#F45517', '#972611'] },
    { nome: 'mattone',    toni: ['#E53F0C', '#BE2E0B', '#7A2211'] },
    { nome: 'oliva',      toni: ['#768A61', '#5C6C4B', '#333D2C'] },
    { nome: 'muschio',    toni: ['#5C6C4B', '#3C4633', '#232B1B'] },
    { nome: 'sabbia',     toni: ['#F4E4CD', '#E1CAB2', '#A2856A'] },
  ];
  const SCARPE = [
    { nome: 'cuoio', toni: ['#7A5232', '#4A2F1A'] },
    { nome: 'nere',  toni: ['#3E3629', '#231C13'] },
  ];

  /* -- il corpo -------------------------------------------------------------
     Tutto il disegno e' una griglia 16x24 di caratteri, uno per pixel, e ogni
     carattere e' un ruolo (pelle chiara, tessuto ombra, ...) non un colore:
     il colore arriva dopo dai tratti. Cosi' l'arte si legge e si corregge
     guardandola nel sorgente, invece che a colpi di fillRect.

       . niente     S s d pelle    H h g capelli   C c v tessuto
       I i j sotto  T t y accento  P p n pantaloni O o scarpe
       k scuro      e occhio       m bocca         z stoppia
       f montatura  u U tazza      b B tesserino   x X cuffie

     Vista tre quarti dall'alto: la testa e' grossa apposta (10 righe su 24),
     e' l'unico modo perche' a 16 pixel di larghezza una faccia si legga. */
  const CORPO = [
    '................',
    '.....ssssss.....',
    '....Sssssssd....',
    '....Sssssssd....',
    '....Sssssssd....',
    '....Sssssssd....',
    '...sSssssssdd...',   // le orecchie allargano la testa: senza, e' un uovo
    '...sSssssssdd...',
    '....Sssssssd....',
    '....Sssssssd....',
    '.....ssssdd.....',
    '......sddd......',   // collo in ombra sotto il mento
    '..ss........ss..',   // braccia nude: le maniche le copre il vestito
    '..ss........ss..',
    '..ss........ss..',
    '..ss........ss..',
    '..ss........ss..',
    '..Ss........sd..',   // mani
    '....kkkkkkkk....',   // cintura
    '....Ppn..Ppn....',
    '....Ppn..Ppn....',
    '....Ppn..Ppn....',
    '...Oooo..oooo...',
    '...kkkk..kkkk...',
  ];

  /* Occhi alla riga 7, bocca alla 9: fra frangia e occhi resta una riga di
     fronte, se no la faccia diventa una fessura. */
  const FACCIA = { y: 7, righe: [
    '.....ee..ee.....',
    '........d.......',   // il naso e' un solo pixel d'ombra: di piu' e' sporco
    '.......mm.......',
  ] };

  /* Montatura tonda: la riga intera di sopra faceva una barra da censura sugli
     occhi. Qui il rim tocca solo gli angoli, la riga di mezzo tiene insieme
     ponte e stanghette, e dentro la lente resta un pixel di riflesso. */
  const OCCHIALI = { y: 6, righe: [
    '.....ff..ff.....',
    '...ff..ff..ff...',
    '.....ff..ff.....',
  ] };

  const BARBE = {
    baffi:    { y: 8, righe: ['......hhhh......'] },
    pizzetto: { y: 8, righe: ['......hhhh......',
                              '................',
                              '......hhhh......'] },
    corta:    { y: 8, righe: ['....zzzzzzzz....',
                              '....zzz..zzz....',
                              '.....zzzzzz.....'] },
    piena:    { y: 8, righe: ['....hhhhhhhg....',
                              '....hhh..hhg....',   // la bocca resta scoperta
                              '.....hhhhhg.....'] },
  };

  /* -- capigliature ---------------------------------------------------------
     E' il tratto che si vede da piu' lontano: la sagoma. Due impiegati con lo
     stesso taglio e colore diverso si confondono, con taglio diverso no. */
  const TAGLI = {
    corto:      { y: 1, righe: ['.....HHhhhg.....',
                                '....HHhhhhhg....',
                                '....Hhhhhhgg....',
                                '....hhhhhhhg....',
                                '....h......g....'] },
    riga:       { y: 1, righe: ['.....HHhhhg.....',
                                '....HHghhhhg....',   // la scriminatura e' la riga scura
                                '....Hhghhhhg....',
                                '....hhghhhhg....',
                                '....h.....hg....'] },
    stempiato:  { y: 1, righe: ['.....HHhhhg.....',
                                '....HHhhhhhg....',
                                '.....hhhhhg.....',
                                '....h.hhhh.g....',
                                '....h......g....'] },
    ricci:      { y: 0, righe: ['....hhh.hhh.....',
                                '...hHhhhhhhhg...',
                                '...Hhhhhhhhhg...',
                                '...hhhhhhhhhg...',
                                '...hhhhhhhhhg...',
                                '...hh......hg...'] },
    coda:       { y: 1, righe: ['.....HHhhhg.....',
                                '....HHhhhhhg....',
                                '....Hhhhhhgg....',
                                '....hhhhhhhg....',
                                '....h......g....',
                                '............th..',   // l'elastico
                                '............Hhg.',
                                '............hhg.',
                                '.............hg.'] },
    chignon:    { y: 0, righe: ['......hHhg......',
                                '.....Hhhhhg.....',
                                '....HHhhhhhg....',
                                '....Hhhhhhhg....',
                                '....hh....hg....'] },   // tirati indietro: fronte alta
    caschetto:  { y: 1, righe: ['.....HHhhhg.....',
                                '...HHhhhhhhhg...',
                                '...Hhhhhhhhhg...',
                                '...hhhhhhhhhg...',
                                '...hh......hg...',
                                '...hh......hg...',
                                '...hh......hg...',
                                '...hg......hg...',
                                '....g......g....'] },
    calvo:      { y: 2, righe: ['.....SSss.......',   // il lucido sulla nuca
                                '....SSs.........',
                                '....h......g....',
                                '....h......g....',
                                '...hh......hg...',
                                '...hh......hg...'] },
  };

  /* -- vestiti (righe 11..17) ----------------------------------------------
     Le spalle sono larghe 12 contro una testa larga 8: e' quello che dice
     "persona vestita" invece che "pupazzo". Il colletto e' due pixel chiari
     ai lati del collo, la piega dei bottoni una riga d'ombra a destra del
     centro (la luce viene sempre da sinistra in alto, come per i mobili). */
  const CAMICIA = ['...ccCC..CCcv...',
                   '..CccCCccCCccv..',
                   '..CvCcccvccvcv..',
                   '..CvCcccvccvcv..',
                   '..CvCcccvccvcv..',
                   '..CvCcccvccvCc..',   // polsini
                   '....Ccccvccv....'];
  const VESTITI = {
    camicia:  { righe: CAMICIA, sotto: false, cravatta: 0 },
    cravatta: { righe: CAMICIA, sotto: false, cravatta: 16 },
    polo:     { sotto: false, cravatta: 0, righe:
                ['...ccCC..CCcv...',
                 '..CccCCccCCccv..',
                 '..CvCccvcccvcv..',
                 '..CvCccvcccvcv..',
                 '....Cccccccv....',   // mezze maniche: da qui il braccio e' nudo
                 '....Cccccccv....',
                 '....Cccccccv....'] },
    cardigan: { sotto: true, cravatta: 0, bottoni: true, righe:
                ['...ccII..IIcv...',
                 '..CccIIiiIIccv..',
                 '..CvCciIiicvcv..',
                 '..CvCciIiicvcv..',
                 '..CvCciIiicvcv..',
                 '..CvCciIiicvCc..',
                 '....CciIiicv....'] },
    giacca:   { sotto: true, cravatta: 14, righe:
                ['...ccII..IIcv...',
                 '..CccCIIIICccv..',
                 '..CvCcCIiCcvcv..',   // i risvolti
                 '..CvCccIiccvcv..',
                 '..CvCcccvccvcv..',
                 '..CvCcccvccvCc..',
                 '....Ccccvccv....'] },
    maglione: { sotto: false, cravatta: 0, righe:
                ['...ccvv..vvcv...',
                 '..Ccccvvvvcccv..',   // il collo a coste
                 '..CvCccccccvcv..',
                 '..CvCccccccvcv..',
                 '..CvCccccccvcv..',
                 '..CvCccccccvCc..',
                 '....Cccccccv....'] },
  };

  const ACCESSORI = {
    tazza:  { y: 15, righe: ['.............UUU',
                             '.............uuk',
                             '.............uu.'] },
    badge:  { y: 12, righe: ['.....t....t.....',
                             '......t..t......',
                             '......t..t......',
                             '......bBBb......',
                             '......bkkb......'] },
    // L'archetto passa sopra la testa e non addosso: coprendo tutta la riga dei
    // capelli faceva un casco, e con un caschetto scuro la faccia spariva.
    cuffie: { y: 0, righe: ['.....XXxxxx.....',
                            '....x......x....',
                            '................',
                            '................',
                            '................',
                            '................',
                            '...x........x...',
                            '...x........x...',
                            '...x............',
                            '...x............',
                            '...xX...........'] },   // asta e capsula del microfono
  };

  /* Una riga da 15 caratteri sposta mezzo disegno e non si vede finche' non si
     guarda lo sprite ingrandito: meglio esplodere al caricamento. */
  (function controlla() {
    const tutti = [CORPO, FACCIA.righe, OCCHIALI.righe];
    for (const k in TAGLI) tutti.push(TAGLI[k].righe);
    for (const k in VESTITI) tutti.push(VESTITI[k].righe);
    for (const k in BARBE) tutti.push(BARBE[k].righe);
    for (const k in ACCESSORI) tutti.push(ACCESSORI[k].righe);
    for (const gruppo of tutti)
      for (const riga of gruppo)
        if (riga.length !== L) throw new Error('npc.js: riga da ' + riga.length + ' invece di 16: "' + riga + '"');
  })();

  /* -- tratti --------------------------------------------------------------- */
  const NOMI_TAGLI = Object.keys(TAGLI);
  const NOMI_VESTITI = ['camicia', 'cravatta', 'polo', 'cardigan', 'giacca', 'maglione'];
  // Ripetuto = piu' probabile: la meta' dell'ufficio e' sbarbata, e le
  // sopracciglia non bastano a fare varieta' se tutti hanno la barba.
  const BARBE_PESATE = ['no', 'no', 'no', 'no', 'baffi', 'pizzetto', 'corta', 'corta', 'piena', 'piena'];
  const ACCESSORI_PESATI = ['nessuno', 'nessuno', 'nessuno', 'tazza', 'tazza', 'badge', 'cuffie'];

  const memoT = new Map(), memoP = new Map(), memoV = new Map();

  function tratti(seme) {
    let t = memoT.get(seme);
    if (t) return t;
    const n = impronta(String(seme));
    const r = dado(n);
    const vestito = pesca(r, NOMI_VESTITI);
    const leggero = vestito === 'camicia' || vestito === 'cravatta' || vestito === 'polo';
    const pelle = pesca(r, PELLI);
    // Capelli rame su pelle noce, o bianchi su porcellana: stesso tono, e a
    // sedici pixel la testa diventa una macchia sola. Si scorre la lista
    // finche' non si stacca — sempre in modo ripetibile.
    let capelli = pesca(r, CAPELLI);
    for (let i = 0; i < CAPELLI.length && Math.abs(luce(capelli.toni[1]) - luce(pelle.toni[1])) < 34; i++)
      capelli = CAPELLI[(CAPELLI.indexOf(capelli) + 3) % CAPELLI.length];
    t = {
      seme: String(seme),
      id: n.toString(36),
      pelle,
      capelli,
      taglio: pesca(r, NOMI_TAGLI),
      vestito,
      tessuto: pesca(r, leggero ? CAMICIE : MAGLIE),
      sotto: pesca(r, CAMICIE),          // la camicia sotto cardigan e giacca
      accento: pesca(r, ACCENTI),
      pantaloni: pesca(r, PANTALONI),
      scarpe: pesca(r, SCARPE),
      corporatura: r() < 0.34 ? 'robusta' : 'normale',
      occhiali: r() < 0.36,
      barba: pesca(r, BARBE_PESATE),
      accessorio: pesca(r, ACCESSORI_PESATI),
      // La stoppia non e' un colore a se': e' la pelle con sotto il pelo.
      stoppia: mescola(pelle.toni[2], capelli.toni[2], 0.42),
      bocca: mescola(pelle.toni[2], '#5E2318', 0.74),
      riflesso: mescola(pelle.toni[0], '#FFFFFF', 0.6),   // il vetro degli occhiali
    };
    t.cravatta = VESTITI[vestito].cravatta > 0;
    if (t.accessorio === 'nessuno') t.accessorio = null;
    memoT.set(seme, t);
    return t;
  }

  /* -- disegno a caratteri -------------------------------------------------- */
  const tela = () => Array.from({ length: A }, () => new Array(L).fill('.'));
  function posa(g, righe, y0) {
    for (let i = 0; i < righe.length; i++) {
      const y = y0 + i;
      if (y < 0 || y >= A) continue;
      for (let x = 0; x < L; x++) if (righe[i][x] !== '.') g[y][x] = righe[i][x];
    }
  }

  /* Allarga la figura di un pixel per parte dalle spalle ai fianchi. Costa
     otto righe e raddoppia le sagome: due impiegati con lo stesso taglio e la
     stessa camicia si distinguono lo stesso, da lontano, per la stazza. */
  function allarga(g) {
    for (let y = 11; y <= 18; y++) {
      let a = -1, b = -1;
      for (let x = 0; x < L; x++) if (g[y][x] !== '.') { if (a < 0) a = x; b = x; }
      if (a > 0) g[y][a - 1] = g[y][a];
      if (b >= 0 && b < L - 1 && g[y][b + 1] === '.') g[y][b + 1] = g[y][b];
    }
  }

  /* Contorno: un pixel scuro attorno alla sagoma. Senza, una camicia bianca su
     una persona di pelle chiara e' una macchia sola, e sul pavimento oliva
     dell'ufficio la figura si scioglie. */
  function contorno(g) {
    const bordo = [];
    for (let y = 0; y < A; y++) for (let x = 0; x < L; x++) {
      if (g[y][x] !== '.') continue;
      if ((y > 0 && g[y - 1][x] !== '.') || (y < A - 1 && g[y + 1][x] !== '.') ||
          (x > 0 && g[y][x - 1] !== '.') || (x < L - 1 && g[y][x + 1] !== '.')) bordo.push([y, x]);
    }
    for (const [y, x] of bordo) g[y][x] = 'K';
  }

  function componi(t) {
    const g = tela();
    const v = VESTITI[t.vestito];
    posa(g, CORPO, 0);
    posa(g, v.righe, 11);
    if (v.bottoni) { g[14][5] = 'T'; g[16][5] = 'T'; }
    if (t.cravatta) {
      g[12][7] = 'T'; g[12][8] = 't';                       // il nodo
      for (let y = 13; y <= v.cravatta; y++) { g[y][7] = 't'; g[y][8] = 'y'; }
    }
    posa(g, TAGLI[t.taglio].righe, TAGLI[t.taglio].y);
    // Ombra dell'attaccatura: un pixel di pelle scura sotto ogni pixel di
    // capelli. Vale per tutti i tagli senza doverli ridisegnare, e stacca la
    // fronte anche quando capelli e pelle sono quasi dello stesso tono.
    for (let y = 4; y <= 8; y++) for (let x = 3; x <= 12; x++)
      if ('Ss'.includes(g[y][x]) && 'Hhg'.includes(g[y - 1][x])) g[y][x] = 'd';
    posa(g, FACCIA.righe, FACCIA.y);
    if (t.barba !== 'no') posa(g, BARBE[t.barba].righe, BARBE[t.barba].y);
    if (t.occhiali) {
      // Dentro una lente da due pixel l'occhio grosso diventa un occhiale da
      // sole: si stringe a uno e l'altro pixel fa il riflesso del vetro.
      g[7][5] = 'l'; g[7][6] = 'e'; g[7][9] = 'e'; g[7][10] = 'l';
      posa(g, OCCHIALI.righe, OCCHIALI.y);
    }
    if (t.accessorio) posa(g, ACCESSORI[t.accessorio].righe, ACCESSORI[t.accessorio].y);
    if (t.corporatura === 'robusta') allarga(g);
    contorno(g);
    return g;
  }

  function tavolozza(t) {
    const so = t.sotto.toni;
    return {
      S: t.pelle.toni[0], s: t.pelle.toni[1], d: t.pelle.toni[2],
      H: t.capelli.toni[0], h: t.capelli.toni[1], g: t.capelli.toni[2],
      C: t.tessuto.toni[0], c: t.tessuto.toni[1], v: t.tessuto.toni[2],
      I: so[0], i: so[1], j: so[2],
      T: t.accento.toni[0], t: t.accento.toni[1], y: t.accento.toni[2],
      P: t.pantaloni.toni[0], p: t.pantaloni.toni[1], n: t.pantaloni.toni[2],
      O: t.scarpe.toni[0], o: t.scarpe.toni[1],
      K: 'rgba(30,23,15,.62)', k: '#2A2119', e: '#241B14', m: t.bocca, z: t.stoppia, f: '#3A2E20', l: t.riflesso,
      u: '#F7EEE0', U: '#FFFDF8', b: '#F4E4CD', B: '#FFFDF8',
      x: '#3C4633', X: '#768A61',
    };
  }

  function sprite(seme) {
    let url = memoP.get(seme);
    if (url) return url;
    const t = tratti(seme), g = componi(t), col = tavolozza(t);
    const cv = document.createElement('canvas');
    cv.width = L * ZOOM;
    cv.height = A * ZOOM;
    const cx = cv.getContext('2d');
    for (let y = 0; y < A; y++) for (let x = 0; x < L; x++) {
      const ch = g[y][x];
      if (ch === '.') continue;
      const c = col[ch];
      if (!c) throw new Error('npc.js: carattere senza colore: "' + ch + '"');
      cx.fillStyle = c;
      cx.fillRect(x * ZOOM, y * ZOOM, ZOOM, ZOOM);   // niente drawImage: nessuna interpolazione da spegnere
    }
    url = cv.toDataURL('image/png');
    memoP.set(seme, url);
    return url;
  }

  /* -- la stessa persona, morbida -------------------------------------------
     Non e' il pixel ripassato in SVG: sono gli stessi tratti ridisegnati con
     ellissi e curve. I tre toni diventano una sfumatura a 135 gradi, cosi' la
     luce cade da sinistra in alto come nel pixel e come sui mobili.
     I capelli sono un'ellisse dietro alla testa: la corona che spunta e' il
     taglio, e cambiarne raggio e centro basta a fare mezzo campionario. */
  const CORONE = {
    corto:     { rx: 4.4, ry: 4.9, cy: 5.3, frangia: 1 },
    riga:      { rx: 4.4, ry: 4.9, cy: 5.3, frangia: 2 },
    stempiato: { rx: 4.2, ry: 4.4, cy: 4.9, frangia: 0 },
    ricci:     { rx: 4.9, ry: 5.2, cy: 5.1, frangia: 1, ricci: true },
    coda:      { rx: 4.3, ry: 4.8, cy: 5.2, frangia: 1, coda: true },
    chignon:   { rx: 4.2, ry: 4.7, cy: 5.2, frangia: 0, chignon: true },
    caschetto: { rx: 4.8, ry: 5.0, cy: 5.4, frangia: 1, lati: true },
    calvo:     { rx: 0,   ry: 0,   cy: 0,   frangia: 0, tempie: true },
  };

  function vector(seme) {
    let url = memoV.get(seme);
    if (url) return url;
    const t = tratti(seme);
    const v = VESTITI[t.vestito];
    const pel = t.pelle.toni, cap = t.capelli.toni, tes = t.tessuto.toni;
    const pan = t.pantaloni.toni, sot = t.sotto.toni, acc = t.accento.toni;
    const c = CORONE[t.taglio];
    const g = (n) => 'url(#' + n + t.id + ')';
    const sfuma = (n, toni) =>
      '<linearGradient id="' + n + t.id + '" x1="0" y1="0" x2=".9" y2="1">' +
      '<stop offset="0" stop-color="' + toni[0] + '"/>' +
      '<stop offset=".5" stop-color="' + toni[1] + '"/>' +
      '<stop offset="1" stop-color="' + toni[2] + '"/></linearGradient>';
    const o = [];

    o.push('<defs>', sfuma('p', pel), sfuma('h', cap), sfuma('c', tes),
           sfuma('q', pan), sfuma('i', sot), sfuma('a', acc), '</defs>');
    o.push('<ellipse cx="8" cy="23.1" rx="4.8" ry=".9" fill="#1e160e" opacity=".2"/>');

    // gambe e scarpe
    o.push('<rect x="4.5" y="17" width="2.7" height="5.6" rx="1.2" fill="' + g('q') + '"/>',
           '<rect x="8.8" y="17" width="2.7" height="5.6" rx="1.2" fill="' + g('q') + '"/>',
           '<ellipse cx="5.5" cy="22.5" rx="2.3" ry="1.2" fill="' + t.scarpe.toni[1] + '"/>',
           '<ellipse cx="10.5" cy="22.5" rx="2.3" ry="1.2" fill="' + t.scarpe.toni[1] + '"/>',
           '<ellipse cx="5.2" cy="22.1" rx="1.7" ry=".7" fill="' + t.scarpe.toni[0] + '"/>',
           '<ellipse cx="10.2" cy="22.1" rx="1.7" ry=".7" fill="' + t.scarpe.toni[0] + '"/>');
    // collo e busto: spalle tonde, vita appena stretta
    o.push('<rect x="6.5" y="9.4" width="3" height="3" rx="1" fill="' + pel[2] + '"/>');
    o.push('<path d="M3.3 13.2C3.3 11.2 5.2 10.5 8 10.5s4.7.7 4.7 2.7l.2 5.1c-3.2 1-6.6 1-9.8 0z" fill="' + g('c') + '"/>');
    // braccia: manica lunga per tutti tranne la polo
    const manica = t.vestito === 'polo' ? 3.2 : 5.8;
    o.push('<rect x="1.7" y="11.9" width="2.4" height="' + manica + '" rx="1.2" fill="' + g('c') + '"/>',
           '<rect x="11.9" y="11.9" width="2.4" height="' + manica + '" rx="1.2" fill="' + g('c') + '"/>');
    if (t.vestito === 'polo')
      o.push('<rect x="1.9" y="14.4" width="2" height="3" rx="1" fill="' + pel[1] + '"/>',
             '<rect x="12.1" y="14.4" width="2" height="3" rx="1" fill="' + pel[1] + '"/>');
    // La cintura va sopra il busto, non sotto: dietro spariva e la figura
    // diventava una tunica senza vita.
    o.push('<path d="M3.5 17.3c3 .9 6 .9 9 0l.1 1.2c-3.1.9-6.1.9-9.2 0z" fill="#2A2119"/>',
           '<rect x="7.3" y="17.4" width="1.4" height="1.1" rx=".3" fill="' + acc[0] + '"/>');
    o.push('<circle cx="2.9" cy="17.6" r="1.15" fill="' + pel[1] + '"/>',
           '<circle cx="13.1" cy="17.6" r="1.15" fill="' + pel[2] + '"/>');

    // quello che si porta sopra: il davanti aperto, i risvolti, il collo a coste
    if (t.vestito === 'cardigan')
      // Il davanti aperto si ferma prima della cintura: tirato fino in fondo
      // diventava un bavaglino con gli angoli vivi fuori dal busto.
      o.push('<path d="M6 10.7h4l.2 6.7H5.8z" fill="' + g('i') + '"/>',
             '<circle cx="5.6" cy="13.6" r=".4" fill="' + acc[1] + '"/>',
             '<circle cx="5.6" cy="16" r=".4" fill="' + acc[1] + '"/>');
    else if (t.vestito === 'giacca')
      o.push('<path d="M6 10.7h4v3.1l-2 1.4-2-1.4z" fill="' + g('i') + '"/>',
             '<path d="M6.1 10.7 8 14.4 5.2 12.6z" fill="' + tes[0] + '"/>',
             '<path d="M9.9 10.7 8 14.4l2.8-1.8z" fill="' + tes[2] + '"/>');
    else if (t.vestito === 'maglione')
      o.push('<path d="M5.6 10.7a2.6 2.6 0 0 0 4.8 0" fill="none" stroke="' + tes[2] + '" stroke-width=".7"/>');
    else
      o.push('<path d="M6.2 10.6 8 13.3l1.8-2.7-.9-.5L8 11.7l-.9-1.6z" fill="' + tes[0] + '"/>');
    if (t.cravatta)
      o.push('<path d="M7.3 11.1h1.4l.5 1-1.2.9-1.2-.9z" fill="' + acc[0] + '"/>',
             '<path d="M7.2 13.2h1.6l-.3 ' + (v.cravatta === 14 ? 2.4 : 4.2) + ' -.5.6-.5-.6z" fill="' + acc[1] + '"/>');
    if (t.accessorio === 'badge')
      o.push('<path d="M6.2 10.9 7.6 14.4M9.8 10.9 8.4 14.4" stroke="' + acc[1] + '" stroke-width=".35" fill="none"/>',
             '<rect x="6.6" y="14.3" width="2.8" height="2" rx=".3" fill="#FCF6ED" stroke="' + acc[2] + '" stroke-width=".25"/>',
             '<path d="M7.1 15.3h1.8M7.1 15.9h1.2" stroke="#8a8272" stroke-width=".3"/>');
    if (t.accessorio === 'tazza')
      o.push('<rect x="12.7" y="15.4" width="2.8" height="2.6" rx=".5" fill="#FFFDF8"/>',
             '<rect x="12.7" y="15.4" width="2.8" height=".7" rx=".3" fill="' + acc[1] + '"/>',
             '<circle cx="12.4" cy="16.8" r=".75" fill="none" stroke="#FFFDF8" stroke-width=".45"/>');

    // la capigliatura dietro, poi la testa sopra: la corona che avanza e' il taglio
    if (c.rx) o.push('<ellipse cx="8" cy="' + c.cy + '" rx="' + c.rx + '" ry="' + c.ry + '" fill="' + g('h') + '"/>');
    if (c.ricci) for (const [x, y, r] of [[4.2, 2.9, 1.5], [8, 1.6, 1.6], [11.8, 2.9, 1.5], [3.4, 6, 1.3], [12.6, 6, 1.3]])
      o.push('<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + g('h') + '"/>');
    if (c.chignon) o.push('<circle cx="8" cy="1.7" r="1.8" fill="' + g('h') + '"/>',
                          '<circle cx="7.4" cy="1.2" r=".8" fill="' + cap[0] + '" opacity=".55"/>');
    if (c.coda) o.push('<ellipse cx="12.9" cy="7.6" rx="1.5" ry="2.6" fill="' + g('h') + '"/>',
                       '<rect x="11.4" y="4.6" width="1.6" height="1" rx=".5" fill="' + acc[1] + '"/>');
    o.push('<ellipse cx="8" cy="6" rx="4" ry="4.7" fill="' + g('p') + '"/>');
    o.push('<circle cx="4.1" cy="7" r=".9" fill="' + pel[1] + '"/>',
           '<circle cx="11.9" cy="7" r=".9" fill="' + pel[2] + '"/>');
    if (c.lati) o.push('<path d="M4.2 4.6c-1.5 1.4-1.6 4.6-.9 6l1.9-.5c-.7-1.9-.6-3.9-.1-5z" fill="' + g('h') + '"/>',
                       '<path d="M11.8 4.6c1.5 1.4 1.6 4.6.9 6l-1.9-.5c.7-1.9.6-3.9.1-5z" fill="' + cap[2] + '"/>');
    if (c.tempie) o.push('<path d="M4.1 8.4c-.5-1.8-.2-3.4.6-4.3l1 .7c-.6.9-.8 2.2-.6 3.6z" fill="' + g('h') + '"/>',
                         '<path d="M11.9 8.4c.5-1.8.2-3.4-.6-4.3l-1 .7c.6.9.8 2.2.6 3.6z" fill="' + cap[2] + '"/>',
                         '<ellipse cx="6.6" cy="3.2" rx="1.6" ry=".7" fill="#fff" opacity=".22"/>');
    if (c.frangia === 1) o.push('<path d="M4.1 6.1C4.3 2.7 11.7 2.7 11.9 6.1 10.3 4.2 5.7 4.2 4.1 6.1z" fill="' + g('h') + '"/>');
    if (c.frangia === 2) o.push('<path d="M4.1 6.3C4.3 2.7 11.7 2.7 11.9 5.4 10.4 3.6 6.6 3.5 4.1 6.3z" fill="' + g('h') + '"/>',
                                '<path d="M5.6 3.1 5 5.6" stroke="' + cap[2] + '" stroke-width=".35" fill="none"/>');

    // barba, occhi, bocca
    if (t.barba !== 'no') {
      const pelo = t.barba === 'corta' ? t.stoppia : cap[1];
      if (t.barba === 'piena' || t.barba === 'corta')
        o.push('<path d="M4.2 7.4c0 4.2 7.6 4.2 7.6 0-1.1 1.9-6.5 1.9-7.6 0z" fill="' + pelo + '"/>');
      if (t.barba !== 'corta')
        o.push('<path d="M6.4 8.9c.9-.7 2.3-.7 3.2 0-.9.4-2.3.4-3.2 0z" fill="' + cap[1] + '"/>');
      if (t.barba === 'pizzetto')
        o.push('<ellipse cx="8" cy="10.3" rx="1.2" ry=".9" fill="' + cap[1] + '"/>');
    }
    o.push('<ellipse cx="6.2" cy="7.2" rx=".62" ry=".8" fill="#241B14"/>',
           '<ellipse cx="9.8" cy="7.2" rx=".62" ry=".8" fill="#241B14"/>',
           '<circle cx="6" cy="6.95" r=".22" fill="#fff" opacity=".85"/>',
           '<circle cx="9.6" cy="6.95" r=".22" fill="#fff" opacity=".85"/>');
    o.push('<path d="M8.35 8.1c.3.4.2.7-.25.75" stroke="' + pel[2] + '" stroke-width=".35" fill="none" stroke-linecap="round"/>');
    o.push('<path d="M7.1 9.4c.5.6 1.3.6 1.8 0" stroke="' + t.bocca + '" stroke-width=".45" fill="none" stroke-linecap="round"/>');
    if (t.occhiali)
      o.push('<g fill="#fff" fill-opacity=".18" stroke="#33291E" stroke-width=".38">' +
             '<rect x="4.3" y="6.1" width="3.4" height="2.3" rx=".9"/>' +
             '<rect x="8.3" y="6.1" width="3.4" height="2.3" rx=".9"/></g>' +
             '<path d="M7.7 6.9h.6M4.3 6.7 3 6.9M11.7 6.7 13 6.9" stroke="#33291E" stroke-width=".38" fill="none"/>');
    if (t.accessorio === 'cuffie')
      o.push('<path d="M3.5 6.6C3.5 2.4 12.5 2.4 12.5 6.6" fill="none" stroke="#3C4633" stroke-width=".8"/>',
             '<rect x="2.7" y="5.6" width="1.8" height="2.6" rx=".8" fill="#3C4633"/>',
             '<rect x="11.5" y="5.6" width="1.8" height="2.6" rx=".8" fill="#3C4633"/>',
             '<path d="M3.6 8.2C3.6 10 5 10.4 6.3 10.2" fill="none" stroke="#3C4633" stroke-width=".4"/>',
             '<circle cx="6.5" cy="10.2" r=".6" fill="#768A61"/>');

    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 24" width="' +
      L * ZOOM + '" height="' + A * ZOOM + '" shape-rendering="geometricPrecision">' + o.join('') + '</svg>';
    url = 'data:image/svg+xml,' + encodeURIComponent(svg);
    memoV.set(seme, url);
    return url;
  }

  window.NPC = { traits: tratti, sprite: sprite, vector: vector };
})();
