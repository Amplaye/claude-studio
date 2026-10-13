/* Claude Studio — l'ufficio in 3D: la testa del gatto e del cane.
 *
 * Qui non c'e' un triangolo: solo dove stanno, cosa stanno facendo e cosa faranno
 * dopo. Sta a parte dai corpi (pets-corpo.js) per una ragione sola: cosi' un'ora
 * d'ufficio si fa passare in un secondo, senza scheda e senza tela, e si conta
 * quanto dormono, quanto girano e quanto rompono — e un gatto rimasto incastrato
 * dietro un armadio lo si trova prima che lo veda qualcuno.
 *
 * Un animale non ha uno scopo. Ha una coda di passi (vai li', siediti, salta) e,
 * finita la coda, sceglie a caso la prossima cosa. A caso ma coi conti: tiene la
 * quota di quanto ha riposato, girato e giocato negli ultimi minuti, e quello che
 * ha fatto poco pesa di piu'. E' cosi' che meta' del tempo dorme senza che
 * nessuno glielo scriva in un orario, anche se la stanza cambia o la gente manca.
 *
 * Le misure sono quelle della pianta: unita' di stanza, x a est, y a sud, z in
 * alto; gli angoli come quelli della gente (0 = guarda a sud, verso chi guarda).
 * I secondi sono quelli che gli si danno a `passo`: a scheda nascosta il tempo
 * non passa, e li si ritrova dove li si era lasciati.
 */
const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, u) => a + (b - a) * u;
/** Da un angolo all'altro per la strada corta. */
const corto = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const verso = (v, a, passo) => (v < a ? Math.min(a, v + passo) : Math.max(a, v - passo));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Il lato di una casella della loro griglia: meta' di quella della gente, che un gatto passa dove una persona no. */
export const CELLA = 4;

/* ---- i numeri del carattere: e' qui che si regola quanto fanno e quanto no ----
 *
 * META e' come dovrebbe dividersi la giornata di ognuno: fermo a riposare, in giro
 * per conto suo, alle prese con qualcuno. Per il cane «gioco» e' la gente — le
 * coccole, andare dietro a chi passa, l'inchino al gatto; per il gatto e' la vita
 * attorno alle scrivanie da sveglio: salirci, starci seduto, chiedere a chi lavora.
 * Sono i numeri a cui il collaudo (un'ora, dodici semi) arriva davvero, entro due
 * o tre punti. Il resto sono pause e durate, in secondi.
 */
export const META = {
  gatto: { riposo: 0.5, giro: 0.36, gioco: 0.14 },
  cane: { riposo: 0.5, giro: 0.37, gioco: 0.13 },
};
/** Unita' al secondo, e radianti al secondo per girarsi. La gente cammina a 32. */
const VEL = {
  gatto: { passo: 12, trotto: 27, gira: 3.4 },
  cane: { passo: 15, trotto: 35, gira: 3 },
};
/** Su quanti secondi si fa la media di quello che hanno fatto. */
const MEMORIA = 420;
/** Quanto pesa un punto di quota mancante: a 12, cinque punti sotto raddoppiano la voglia. */
const SPINTA = 12;
/** Il cane: fra una richiesta di coccole e la seguente, e prima di tornare dalla stessa persona. */
const PAUSA_COCCOLE = 65;
const PAUSA_PERSONA = 240;
/** Il gatto: quanto sta giu' prima di risalire su una scrivania, e quanto ci dorme. */
const PAUSA_BANCO = 100;
const SONNO_BANCO = [70, 130];

/** Un punto della pianta nelle misure del piano `t`: [di traverso, in profondita'] dal suo centro. */
const sulPiano = (t, x, y) => [(x - t.x) * Math.cos(t.a) - (y - t.y) * Math.sin(t.a), (x - t.x) * Math.sin(t.a) + (y - t.y) * Math.cos(t.a)];
const dalPiano = (t, u, v) => [t.x + u * Math.cos(t.a) + v * Math.sin(t.a), t.y - u * Math.sin(t.a) + v * Math.cos(t.a)];

/**
 * La stanza come la vedono loro. `ROOM` e' la stanza piatta (la griglia dei passi
 * della gente), `R` la pianta e `B` quello che hanno lasciato i costruttori;
 * `sedile` e' l'altezza delle sedie nuove, in unita'.
 *
 * Dove puo' camminare una persona puo' camminare un animale, meno tre cose che la
 * griglia piatta non sa: le scrivanie girate e le sedie come stanno davvero qui, e
 * la striscia davanti alla porta, dove non devono stare mai.
 */
export function leggi(ROOM, R, B, sedile) {
  const W = ROOM.W;
  const H = ROOM.H;
  const gc = Math.ceil(W / CELLA);
  const gr = Math.ceil(H / CELLA);
  // Il piano di ogni scrivania lo dice lei (`banco.top`, props.js): `a` e' da che parte guarda chi siede, `w` di traverso e `d` lungo lo sguardo.
  const banchi = (B.banchi || []).map((b, i) => ({ i, top: b.top, sedia: b.posto ? { x: b.posto.x, y: b.posto.y, z: sedile, a: b.posto.a } : null }));
  const sedie = (B.posti || []).map((q) => [q.x, q.y]);
  const [vx, vw] = R.VANO;
  const occ = new Uint8Array(gc * gr);
  for (let r = 0; r < gr; r++) {
    for (let c = 0; c < gc; c++) {
      const x = c * CELLA + CELLA / 2;
      const y = r * CELLA + CELLA / 2;
      let pieno = x < 18 || y < 18 || x > W - 18 || y > H - 18 || ROOM.occupata[ROOM.cella(x, y)] || (y < 50 && x > vx - 12 && x < vx + vw + 12);
      for (let k = 0; !pieno && k < banchi.length; k++) {
        const t = banchi[k].top;
        const [u, v] = sulPiano(t, x, y);
        pieno = Math.abs(u) < t.w / 2 + 3 && Math.abs(v) < t.d / 2 + 3;
      }
      for (let k = 0; !pieno && k < sedie.length; k++) pieno = Math.hypot(sedie[k][0] - x, sedie[k][1] - y) < 8;
      occ[r * gc + c] = pieno ? 1 : 0;
    }
  }
  /* Si tiene solo il pezzo di pavimento piu' grande: un angolo chiuso fra tre mobili
     e' libero ma non ci si arriva, e chi ci nascesse dentro non ne uscirebbe piu'. */
  const isola = new Int32Array(gc * gr).fill(-1);
  let meglio = -1;
  let quante = 0;
  for (let n = 0, id = 0; n < occ.length; n++) {
    if (occ[n] || isola[n] >= 0) continue;
    const pila = [n];
    isola[n] = id;
    let conto = 0;
    while (pila.length) {
      const m = pila.pop();
      conto++;
      const c = m % gc;
      for (const v of [c > 0 ? m - 1 : -1, c < gc - 1 ? m + 1 : -1, m - gc, m + gc]) {
        if (v < 0 || v >= occ.length || occ[v] || isola[v] >= 0) continue;
        isola[v] = id;
        pila.push(v);
      }
    }
    if (conto > quante) (quante = conto), (meglio = id);
    id++;
  }
  const liberi = [];
  for (let n = 0; n < occ.length; n++) {
    if (isola[n] === meglio && meglio >= 0) liberi.push(n);
    else occ[n] = 1;
  }
  /* Le corsie. Dove passa la gente lo imparano guardandola, ma i primi minuti non
     hanno visto ancora nessuno: e la stanza piatta le sue strade le sa gia' — da
     ogni scrivania al bar, alla sala riunioni, alla porta. Si segnano prima. */
  const corsie = new Float32Array(gc * gr);
  if (ROOM.cammino && ROOM.posto && ROOM.DESKS) {
    const mete = Object.values(ROOM.METE || {}).concat(ROOM.INGRESSO ? [ROOM.INGRESSO] : []);
    ROOM.DESKS.forEach((_, i) => {
      const p = ROOM.posto(i);
      for (const m of mete) {
        let q = [p.x + 8, p.y + 24];
        for (const w of ROOM.cammino(q[0], q[1], m[0], m[1])) {
          const n = Math.max(1, Math.ceil(Math.hypot(w[0] - q[0], w[1] - q[1]) / CELLA));
          for (let k = 0; k <= n; k++) {
            const x = q[0] + ((w[0] - q[0]) * k) / n;
            const y = q[1] + ((w[1] - q[1]) * k) / n;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
              const c = Math.floor(x / CELLA) + dx;
              const r = Math.floor(y / CELLA) + dy;
              if (c >= 0 && r >= 0 && c < gc && r < gr) corsie[r * gc + c] = 2;
            }
          }
          q = w;
        }
      }
    });
  }
  return {
    corsie,
    W,
    H,
    gc,
    gr,
    occ,
    liberi,
    banchi,
    sedie,
    /** Il corridoio dalla porta al salone: ci si passa, non ci si ferma. */
    soglia: { x0: vx - 28, x1: vx + vw + 28, y1: R.MEZZO + 36 },
  };
}

/**
 * I due cervelli. `opz.seme` fissa il caso (il collaudo vuole la stessa ora due
 * volte); senza, ogni accensione e' un'altra giornata.
 */
export function cervelli(opz = {}) {
  let seme = (opz.seme == null ? Math.random() * 4294967296 : opz.seme) >>> 0;
  const caso = () => {
    seme = (seme + 0x6d2b79f5) | 0;
    let t = Math.imul(seme ^ (seme >>> 15), 1 | seme);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const tra = (a, b) => a + (b - a) * caso();
  /** Una fra le voci [peso, cosa], col suo peso. */
  const una = (voci) => {
    let tot = 0;
    for (const v of voci) tot += v[0];
    let r = caso() * tot;
    for (const v of voci) if ((r -= v[0]) <= 0) return v[1];
    return voci[voci.length - 1][1];
  };

  /** La stanza, la gente di questo fotogramma, e l'orologio. */
  let Mo = null;
  let gente = [];
  let perChiave = new Map();
  let ora = 0;
  /** Chi dei due sta chiedendo attenzione a qualcuno: uno alla volta. */
  let gettone = null;
  /** Di ogni persona: da quando e' ferma, e quando l'hanno cercata l'ultima volta. */
  const ricordi = new Map();
  /** Dove passa la gente: ogni casella ricorda i passi che ha visto, e li dimentica piano. */
  let traffico = new Float32Array(0);
  let sbiadito = 0;
  /** Quello che e' successo, per chi fa i conti (il collaudo): non serve a decidere niente. */
  const conti = { coccole: [], fusa: [], scansi: 0, fughe: 0, salti: 0, visite: [], mollati: {} };
  /** Degli elenchi si tengono le ultime duecento voci: un ufficio resta acceso per giorni. */
  const segna = (lista, voce) => lista.push(voce) > 200 && lista.shift();

  const nuovo = (tipo) => ({
    tipo,
    x: 0,
    y: 0,
    z: 0,
    a: 0,
    /** Quanto va, in unita' al secondo: il corpo ci regola il passo. */
    v: 0,
    /** La posa, da quanti secondi, e per quanti (0 = non si sa). */
    stato: 'fermo',
    s: 0,
    dur: 0,
    /** I passi che restano, l'attivita' a cui appartengono e a quale voce della giornata vanno contati. */
    coda: [],
    att: '',
    cat: 'giro',
    quota: { ...META[tipo] },
    /** La scrivania attorno a cui sta girando (-1: nessuna), quella su cui e' salito, e su cosa poggia. */
    banco: -1,
    su: -1,
    poggia: '',
    visita: null,
    /** Il punto che guarda, chi sta cercando e con quanta forza (0..1, gia' ammorbidita). */
    guarda: null,
    chi: null,
    forza: 0,
    vuole: false,
    /** Contento da 1 a 0, da che parte si arrotola, e la pendenza del salto. */
    felice: 0,
    lato: 1,
    beta: 0,
    ultimo: { banco: -999, coccole: -999, prova: -999, segue: -999, inchino: -999, scansa: -999, fuga: -999 },
    occhio: 0,
    mira: null,
    fermato: false,
  });
  const gatto = nuovo('gatto');
  const cane = nuovo('cane');
  const altro = (A) => (A === gatto ? cane : gatto);

  // ---------------------------------------------------------------------
  //  la griglia: dove si mettono le zampe, e come ci si arriva
  // ---------------------------------------------------------------------
  const cel = (x, y) => clamp(Math.floor(y / CELLA), 0, Mo.gr - 1) * Mo.gc + clamp(Math.floor(x / CELLA), 0, Mo.gc - 1);
  const centro = (n) => [(n % Mo.gc) * CELLA + CELLA / 2, ((n / Mo.gc) | 0) * CELLA + CELLA / 2];
  const libero = (x, y) => x >= 0 && y >= 0 && x < Mo.W && y < Mo.H && !Mo.occ[cel(x, y)];
  const inSoglia = (x, y) => x > Mo.soglia.x0 && x < Mo.soglia.x1 && y < Mo.soglia.y1;
  /** La casella libera piu' vicina a un punto: dove si rimette chi si ritrova dentro un mobile. */
  function vicina(x, y) {
    let m = null;
    let q = Infinity;
    for (const n of Mo.liberi) {
      const [cx, cy] = centro(n);
      const d = (cx - x) * (cx - x) + (cy - y) * (cy - y);
      if (d < q) (q = d), (m = [cx, cy]);
    }
    return m || [x, y];
  }
  /**
   * Il tratto fila dritto senza prendere niente? Si guarda una striscia larga tre
   * unita', non un filo: un animale gira largo e parte storto, e una strada che
   * sfiora uno spigolo la perde al primo passo.
   */
  function dritto(x0, y0, x1, y1, no) {
    const lungo = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.ceil(lungo / 1.5));
    const px = lungo ? (-(y1 - y0) / lungo) * 1.5 : 0;
    const py = lungo ? ((x1 - x0) / lungo) * 1.5 : 0;
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const y = y0 + ((y1 - y0) * i) / n;
      for (let k = -1; k <= 1; k++) {
        const m = cel(x + px * k, y + py * k);
        if (Mo.occ[m] || (no && no[m])) return false;
      }
    }
    return true;
  }

  // Le tavole dell'onda si tengono da un giro all'altro: chi segue qualcuno la
  // rifa' due volte al secondo, e ventimila caselle nuove ogni volta sono spazzatura.
  let da = new Int32Array(0);
  let timbro = new Uint32Array(0);
  let fila = new Int32Array(0);
  let vietato = new Uint8Array(0);
  let giroOnda = 0;
  const DC = [1, -1, 0, 0];
  const DR = [0, 0, 1, -1];
  /**
   * La strada da un punto all'altro: la stessa onda di room.js sulla griglia loro,
   * e poi la corda tirata. Una meta chiusa porta il piu' vicino possibile. `no`
   * sono le caselle prese adesso da qualcuno che sta fermo.
   */
  function strada(x0, y0, x1, y1, no) {
    const { gc, gr, occ } = Mo;
    const partenza = cel(x0, y0);
    const arrivo = cel(x1, y1);
    giroOnda++;
    timbro[partenza] = giroOnda;
    da[partenza] = partenza;
    let testa = 0;
    let fine = 0;
    fila[fine++] = partenza;
    let meglio = partenza;
    let quanto = Infinity;
    while (testa < fine) {
      const n = fila[testa++];
      const c = n % gc;
      const r = (n / gc) | 0;
      const d = (c * CELLA + 2 - x1) ** 2 + (r * CELLA + 2 - y1) ** 2;
      if (d < quanto) (quanto = d), (meglio = n);
      if (n === arrivo) break;
      for (let k = 0; k < 4; k++) {
        const c2 = c + DC[k];
        const r2 = r + DR[k];
        if (c2 < 0 || r2 < 0 || c2 >= gc || r2 >= gr) continue;
        const m = r2 * gc + c2;
        if (timbro[m] === giroOnda || occ[m] || (no && no[m])) continue;
        timbro[m] = giroOnda;
        da[m] = n;
        fila[fine++] = m;
      }
    }
    const grezzo = [];
    for (let n = meglio; n !== partenza; n = da[n]) grezzo.push(centro(n));
    grezzo.reverse();
    const ultimo = grezzo.length ? grezzo[grezzo.length - 1] : [x0, y0];
    if (meglio === arrivo && libero(x1, y1) && dritto(ultimo[0], ultimo[1], x1, y1, no)) grezzo.push([x1, y1]);
    const tirato = [];
    let qui = [x0, y0];
    for (let i = 0; i < grezzo.length; ) {
      let j = grezzo.length - 1;
      while (j > i && !dritto(qui[0], qui[1], grezzo[j][0], grezzo[j][1], no)) j--;
      tirato.push(grezzo[j]);
      qui = grezzo[j];
      i = j + 1;
    }
    return tirato;
  }
  /** La strada di `A`, girando attorno a chi sta fermo in piedi e all'altro animale. */
  function stradaDi(A, x, y) {
    const segnate = [];
    const disco = (px, py, r) => {
      if (r < CELLA / 2) return;
      for (let dy = -r; dy <= r; dy += CELLA) {
        for (let dx = -r; dx <= r; dx += CELLA) {
          if (dx * dx + dy * dy > r * r) continue;
          const m = cel(px + dx, py + dy);
          if (!vietato[m]) (vietato[m] = 1), segnate.push(m);
        }
      }
    };
    // Il disco di chi gli sta gia' addosso si stringe fin dove sta lui: intero lo
    // chiuderebbe dentro, e una strada che non parte passa per una strada gia' arrivata.
    const raggio = (o, r) => Math.min(r, Math.hypot(o.x - A.x, o.y - A.y) - CELLA);
    for (const g of gente) if (g.amp < 0.3 && g.sit < 0.5 && !g.porta) disco(g.x, g.y, raggio(g, 7));
    const B = altro(A);
    if (B.z === 0) disco(B.x, B.y, raggio(B, 9));
    // Dove sta e dove va non sono mai vietati: se no chi va da una persona non ci arriva.
    vietato[cel(A.x, A.y)] = 0;
    vietato[cel(x, y)] = 0;
    const via = strada(A.x, A.y, x, y, vietato);
    for (const m of segnate) vietato[m] = 0;
    return via;
  }

  // ---------------------------------------------------------------------
  //  dove andare
  // ---------------------------------------------------------------------
  /** Quanto e' riparata una casella: quante, nel quadrato di sette attorno, sono muro o mobile. */
  function riparo(x, y) {
    let n = 0;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (!libero(x + dx * CELLA, y + dy * CELLA)) n++;
    return n;
  }
  const lontanoDa = (x, y, lista, quanto) => lista.every((q) => Math.hypot(q[0] - x, q[1] - y) >= quanto);
  const genteVicina = (x, y, quanto) => gente.some((g) => !g.porta && Math.hypot(g.x - x, g.y - y) < quanto);
  /** A che distanza dall'altro si tiene `A` scegliendo dove andare: il gatto larga, il cane quanto basta. */
  const rispetto = (A) => (A === gatto ? 56 : 32);
  const altroVicino = (A, x, y, quanto = rispetto(A)) => altro(A).z === 0 && Math.hypot(altro(A).x - x, altro(A).y - y) < quanto;

  /** Un punto dove andare a zonzo, fra `d0` e `d1` da dove sta (o da `da_`, se parte da un altro posto). */
  function meta(A, d0, d1, da_ = A) {
    for (let k = 0; k < 40; k++) {
      const [x, y] = centro(Mo.liberi[(caso() * Mo.liberi.length) | 0]);
      const d = Math.hypot(x - da_.x, y - da_.y);
      // Dopo venti tentativi ci si accontenta della distanza: in un angolo stretto non c'e' di meglio.
      if (k < 20 && (d < d0 || d > d1)) continue;
      if (inSoglia(x, y) || genteVicina(x, y, 18) || altroVicino(A, x, y)) continue;
      return [x, y];
    }
    return null;
  }
  /**
   * Dove mettersi a dormire per terra: riparato (contro un muro, accanto a un
   * mobile), lontano dalle sedie — li' la gente arriva e si alza — e dove di passi
   * se ne sono visti pochi. E' il conto che li tiene fuori dalle corsie.
   */
  function cuccia(A, da_ = A) {
    let meglio = null;
    let quanto = -Infinity;
    for (let k = 0; k < 60; k++) {
      const n = Mo.liberi[(caso() * Mo.liberi.length) | 0];
      const [x, y] = centro(n);
      if (inSoglia(x, y) || !lontanoDa(x, y, Mo.sedie, 24) || genteVicina(x, y, 24) || altroVicino(A, x, y, rispetto(A) + 10)) continue;
      const p = Math.min(riparo(x, y), 18) / 18 - Math.min(traffico[n], 3) * 0.6 - Math.hypot(x - da_.x, y - da_.y) / 500 + caso() * 0.25;
      if (p > quanto) (quanto = p), (meglio = [x, y]);
    }
    return meglio;
  }
  /** Un punto accanto a un mobile, da annusare: e l'angolo per guardarlo. */
  function daAnnusare(A) {
    for (let k = 0; k < 50; k++) {
      const [x, y] = centro(Mo.liberi[(caso() * Mo.liberi.length) | 0]);
      const d = Math.hypot(x - A.x, y - A.y);
      if (d < 24 || d > 130 || inSoglia(x, y) || genteVicina(x, y, 18) || altroVicino(A, x, y)) continue;
      for (let j = 0; j < 4; j++) if (!libero(x + DC[j] * CELLA * 2, y + DR[j] * CELLA * 2)) return [x, y, Math.atan2(DC[j], DR[j])];
    }
    return null;
  }
  /** Dove si mette il cane per farsi vedere da una persona: di fianco a lei, e dalla parte di chi guarda la stanza. */
  function accanto(A, g) {
    let meglio = null;
    let quanto = -Infinity;
    for (const r of [17, 21]) {
      for (let k = 0; k < 12; k++) {
        const an = (k / 12) * TAU;
        const x = g.x + Math.sin(an) * r;
        const y = g.y + Math.cos(an) * r;
        if (!libero(x, y) || gente.some((o) => o !== g && !o.porta && Math.hypot(o.x - x, o.y - y) < 10)) continue;
        // Dietro la schiena non lo vede lei, dietro di lei non lo vediamo noi.
        const p = Math.abs(Math.sin(an - g.a)) * 0.8 + Math.cos(an - g.a) * 0.4 + Math.cos(an) * 0.7 - Math.hypot(x - A.x, y - A.y) / 300 - (r - 17) * 0.05;
        if (p > quanto) (quanto = p), (meglio = [x, y]);
      }
    }
    return meglio;
  }
  /**
   * Da dove il gatto salta sulla scrivania `b`: per terra, appena fuori dal bordo
   * piu' vicino al posto libero del piano. Torna anche dove atterra, che e' un
   * passo dentro il bordo: gli ultimi li fa camminando.
   */
  function decollo(b) {
    const t = b.top;
    const [lu, lv] = sulPiano(t, t.libero[0], t.libero[1]);
    let meglio = null;
    let quanto = Infinity;
    for (const [u, v, nu, nv] of [
      [clamp(lu, -t.w / 2, t.w / 2), t.d / 2, 0, 1],
      [clamp(lu, -t.w / 2, t.w / 2), -t.d / 2, 0, -1],
      [t.w / 2, clamp(lv, -t.d / 2, t.d / 2), 1, 0],
      [-t.w / 2, clamp(lv, -t.d / 2, t.d / 2), -1, 0],
    ]) {
      const [x, y] = dalPiano(t, u + nu * 13, v + nv * 13);
      if (!libero(x, y) || genteVicina(x, y, 11)) continue;
      const d = Math.hypot(u - lu, v - lv);
      if (d >= quanto) continue;
      quanto = d;
      // Dal bordo verso il posto libero, ma non oltre: se il posto e' sul bordo si atterra li'.
      const k = Math.min(1, 5.5 / (d || 1));
      const [ax, ay] = dalPiano(t, lerp(u, lu, k), lerp(v, lv, k));
      meglio = { x, y, ax, ay };
    }
    return meglio;
  }

  // ---------------------------------------------------------------------
  //  la gente
  // ---------------------------------------------------------------------
  const ricordo = (k) => {
    let m = ricordi.get(k);
    if (!m) ricordi.set(k, (m = { mossa: ora, coccole: -999, fusa: -999 }));
    return m;
  };
  /** Si puo' disturbare? Non chi cammina, non chi parla, non chi sta aspettando una risposta. */
  const gentile = (g) => !!g && !g.porta && !g.parla && !g.chiede && g.amp < 0.3;
  /** La testa di una persona, da guardare: piu' in basso se e' seduta. */
  const testaDi = (g) => ({ x: g.x, y: g.y, z: (g.alta || 34) * 0.86 });

  // ---------------------------------------------------------------------
  //  i passi: le poche cose che una coda sa fare
  // ---------------------------------------------------------------------
  function posa(A, nome, dur = 0) {
    if (A.stato !== nome) (A.stato = nome), (A.s = 0);
    A.dur = dur;
  }
  /** Non e' piu' su una scrivania, ne' ci sta andando: l'unico posto dove lo si dice. */
  function aTerra(A) {
    if (A.su >= 0) {
      A.ultimo.banco = ora;
      if (A.visita) segna(conti.visite, { da: A.visita.da, a: ora, dormito: A.visita.dormito });
    }
    A.su = A.banco = -1;
    A.visita = null;
    if (A.z === 0) A.poggia = '';
  }
  /** Lascia perdere quello che stava facendo: la prossima cosa la sceglie da capo. */
  function molla(A, perche) {
    A.coda.length = 0;
    if (gettone === A) gettone = null;
    // Per terra, quello che lasciava era anche la scrivania a cui stava andando.
    if (A.z === 0 && A.su < 0) aTerra(A);
    if (perche) conti.mollati[perche] = (conti.mollati[perche] || 0) + 1;
    return false;
  }
  /**
   * Un tratto di strada: gira il muso verso il prossimo punto e va dove guarda il
   * muso — mai di lato. Per questo rallenta quando deve girarsi: una curva larga a
   * passo pieno finirebbe dentro lo spigolo di un mobile.
   */
  function avanza(A, p, vel, dt, sciolto) {
    if (p.i >= p.via.length) return true;
    const [tx, ty] = p.via[p.i];
    const dx = tx - A.x;
    const dy = ty - A.y;
    const d = Math.hypot(dx, dy);
    const ultimo = p.i === p.via.length - 1;
    if (d < (ultimo ? 1.2 : 2.5)) {
      p.i++;
      return p.i >= p.via.length;
    }
    const err = corto(A.a, Math.atan2(dx, dy));
    // Chi si scansa lo fa di scatto: si gira e parte al doppio.
    const scatto = p.scanso ? 2 : 1;
    const gira = VEL[A.tipo].gira * scatto;
    A.a += clamp(err, -gira * dt, gira * dt);
    // Girato di piu' di cinquanta gradi non avanza affatto: prima si gira, sul posto.
    let vt = vel * clamp(1 - Math.abs(err) / 0.9);
    if (ultimo) vt = Math.min(vt, 3 + d * 2.5);
    A.v = verso(A.v, vt, (vt > A.v ? 70 * scatto : 160) * dt);
    const fa = Math.min(A.v * dt, d);
    const nx = A.x + Math.sin(A.a) * fa;
    const ny = A.y + Math.cos(A.a) * fa;
    // Sulla scrivania non c'e' griglia. Per terra non si entra in un mobile: lo si
    // striscia, e intanto si conta da quanto: chi chiama, dopo un po', rifa' la strada.
    if (sciolto || libero(nx, ny) || !libero(A.x, A.y)) return (A.x = nx), (A.y = ny), false;
    p.muro = (p.muro || 0) + dt;
    if (libero(nx, A.y)) A.x = nx;
    else if (libero(A.x, ny)) A.y = ny;
    else A.v = 0;
    return false;
  }

  const PASSI = {
    /** Va a un punto. `diretto`: in linea retta, senza griglia (sul piano di una scrivania). */
    va(A, p, dt) {
      if (!p.via) {
        p.via = p.diretto ? [[p.x, p.y]] : stradaDi(A, p.x, p.y);
        p.i = 0;
        p.t = 0;
        p.rifai = 0.7;
        let lunga = 0;
        let q = [A.x, A.y];
        for (const w of p.via) (lunga += Math.hypot(w[0] - q[0], w[1] - q[1])), (q = w);
        p.limite = (lunga / p.vel) * 2.5 + 8;
      }
      posa(A, p.posa || 'cammina');
      p.t += dt;
      if (p.t > p.limite) return molla(A, 'tardi');
      if (p.per) {
        // Andava da qualcuno: se quello nel frattempo si e' mosso, o ha da fare, lascia perdere per strada.
        const g = perChiave.get(p.per);
        if (!gentile(g) || Math.hypot(g.x - p.x, g.y - p.y) > 26) return molla(A, 'se ne va');
      }
      let vel = p.vel;
      if (!p.diretto) {
        p.rifai -= dt;
        for (const g of gente) {
          const rx = g.x - A.x;
          const ry = g.y - A.y;
          const d = Math.hypot(rx, ry);
          if (d > 60 || g.porta || g.k === p.per) continue;
          if (g.amp > 0.5) {
            // Chi cammina: dove saranno lui e lei fra un momento, se vanno avanti cosi'.
            // Se si incrociano a meno di un passo, la lascia passare.
            const wx = Math.sin(g.a) * 32 - Math.sin(A.a) * A.v;
            const wy = Math.cos(g.a) * 32 - Math.cos(A.a) * A.v;
            const t = clamp(-(rx * wx + ry * wy) / (wx * wx + wy * wy || 1), 0, 1.4);
            if (Math.hypot(rx + wx * t, ry + wy * t) < 10) vel = 0;
          } else if (d < 10 && g.sit < 0.5 && rx * Math.sin(A.a) + ry * Math.cos(A.a) > d * 0.3) {
            // Chi si e' fermato in mezzo: gli gira attorno, piano. Mai fermo del tutto:
            // finche' l'ha davanti non ripartirebbe piu'.
            vel = Math.min(vel, p.vel * 0.3);
            if (p.rifai > 0) continue;
            p.rifai = 0.5;
            p.via = null;
            // Se le e' proprio sui piedi non c'e' un giro da fare: prima due passi indietro, via da lei.
            const via = [A.x - (rx / d) * 14, A.y - (ry / d) * 14];
            if (d < 8 && !p.scanso && libero(via[0], via[1])) return A.coda.unshift(va(via, VEL[A.tipo].trotto, p.cat, { scanso: true })), false;
          }
        }
      }
      // Contro un mobile da un quarto di secondo, o con qualcuno fermo davanti: la strada si rifa' da qui.
      if (p.muro > 0.25 || !p.via) (p.muro = 0), (p.via = stradaDi(A, p.x, p.y)), (p.i = 0);
      if (!avanza(A, p, vel, dt, p.diretto)) return false;
      // `preciso`: da qui si salta, o ci si siede accanto a qualcuno. Se la strada si e'
      // fermata prima (c'era chi la chiudeva) non si fa finta di essere arrivati.
      if (p.preciso && Math.hypot(p.x - A.x, p.y - A.y) > 5) return molla(A, 'non ci arriva');
      return true;
    },
    /** Sta in una posa per `dur` secondi, girandosi verso `verso` (un angolo, o un punto). */
    sta(A, p, dt) {
      // Nel corridoio della porta non ci si ferma, qualunque cosa ci abbia portato li' —
      // anche la stanza che si e' allargata sotto chi dormiva: prima ci si toglie.
      if (A.z === 0 && p.dur - (p.t || 0) > 1 && inSoglia(A.x, A.y)) {
        const m = meta(A, 20, 90);
        if (m) return A.coda.unshift(va(m, VEL[A.tipo].passo, p.cat)), false;
      }
      A.v = verso(A.v, 0, 200 * dt);
      if (p.guarda) A.guarda = p.guarda === 'altro' ? { x: altro(A).x, y: altro(A).y, z: altro(A).z + 6 } : p.guarda;
      if (p.verso != null) {
        const w = typeof p.verso === 'number' ? p.verso : Math.atan2(p.verso.x - A.x, p.verso.y - A.y);
        const gira = VEL[A.tipo].gira;
        const err = corto(A.a, w);
        A.a += clamp(err, -gira * dt, gira * dt);
        // Finche' non e' girato fa i passi di chi si gira: da seduti non ci si gira.
        if (Math.abs(err) > 0.25 && !p.t) return posa(A, 'cammina'), false;
      }
      posa(A, p.posa, p.dur);
      p.t = (p.t || 0) + dt;
      return p.t >= p.dur;
    },
    /** Gira su se stesso (`raggio` 0) o in tondo: e' quello che fanno prima di accucciarsi. */
    tondo(A, p, dt) {
      posa(A, 'cammina');
      const w = p.svelto || 2.4;
      A.a += p.lato * w * dt;
      A.v = (p.raggio || 0) * w;
      const nx = A.x + Math.sin(A.a) * A.v * dt;
      const ny = A.y + Math.cos(A.a) * A.v * dt;
      if (A.z > 0 || libero(nx, ny)) (A.x = nx), (A.y = ny);
      p.fatto = (p.fatto || 0) + w * dt;
      return p.fatto >= p.giri * TAU;
    },
    /**
     * Il salto del gatto: si acquatta e prende la mira, vola lungo un arco vero —
     * la z e' una parabola, e il muso ne segue la pendenza — e atterra molleggiando.
     */
    salta(A, p, dt) {
      if (p.f == null) {
        p.f = 0;
        p.t = 0;
        p.x0 = A.x;
        p.y0 = A.y;
        p.z0 = A.z;
        p.q0 = A.poggia;
        p.acq = tra(0.55, 0.9);
      }
      const D = Math.hypot(p.x - p.x0, p.y - p.y0) || 0.001;
      const sale = p.z - p.z0;
      // Piu' di un metro e mezzo non lo salta nessun gatto: vuol dire che non era dove doveva.
      if (p.f === 0 && D > 44) return molla(A, 'salto troppo lungo');
      p.t += dt;
      if (p.f === 0) {
        posa(A, 'acquatta', p.acq);
        A.v = 0;
        const err = corto(A.a, Math.atan2(p.x - p.x0, p.y - p.y0));
        A.a += clamp(err, -5 * dt, 5 * dt);
        A.guarda = { x: p.x, y: p.y, z: p.z + 4 };
        if (p.t >= p.acq && Math.abs(err) < 0.12) (p.f = 1), (p.t = 0), conti.salti++;
        return false;
      }
      if (p.f === 1) {
        // Quanto sta in aria e quanto sale oltre la corda: abbastanza da passare sopra lo spigolo del piano.
        const T = clamp(0.3 + D * 0.011 + Math.abs(sale) * 0.007, 0.36, 0.72);
        const h = Math.max(5, D * 0.3 + Math.abs(sale) * 0.35);
        const u = Math.min(1, p.t / T);
        posa(A, 'vola', T);
        A.x = lerp(p.x0, p.x, u);
        A.y = lerp(p.y0, p.y, u);
        A.z = p.z0 + sale * u + 4 * h * u * (1 - u);
        A.beta = Math.atan2(sale + 4 * h * (1 - 2 * u), D);
        A.v = D / T;
        if (u >= 1) {
          p.f = 2;
          p.t = 0;
          A.z = p.z;
          A.beta = 0;
          A.v = 0;
          A.poggia = p.q || '';
        }
        return false;
      }
      posa(A, 'atterra', 0.28);
      return p.t >= 0.28;
    },
    /** Il cane dietro a chi cammina: un passo indietro e un po' di lato, finche' quella si ferma o lui si stufa. */
    segue(A, p, dt) {
      const g = perChiave.get(p.chi);
      p.t = (p.t || 0) + dt;
      if (!g || g.porta || p.t > p.dur) return true;
      p.ferma = g.amp < 0.3 ? (p.ferma || 0) + dt : 0;
      if (p.ferma > 0.5) return true;
      posa(A, 'cammina');
      A.guarda = testaDi(g);
      // Il suo posto e' un passo dietro di lei. Se le e' finito davanti (quella ha
      // girato) non le taglia la strada: si mette di fianco e la lascia passare.
      const dx = A.x - g.x;
      const dy = A.y - g.y;
      const davanti = dx * Math.sin(g.a) + dy * Math.cos(g.a) > 2;
      const lato = dx * Math.cos(g.a) - dy * Math.sin(g.a);
      const fianco = lato >= 0 ? 1 : -1;
      // Proprio sui suoi piedi: smette di seguirla, e a togliersi ci pensa lo scanso.
      if (davanti && Math.abs(lato) < 9 && Math.hypot(dx, dy) < 40) return true;
      const indietro = davanti ? 0 : 15;
      const largo = davanti ? 15 * fianco : 6 * A.lato;
      const tx = g.x - Math.sin(g.a) * indietro + Math.cos(g.a) * largo;
      const ty = g.y - Math.cos(g.a) * indietro - Math.sin(g.a) * largo;
      p.rifai = (p.rifai || 0) - dt;
      if (p.rifai <= 0 || !p.via) (p.rifai = 0.4), (p.via = stradaDi(A, tx, ty)), (p.i = 0);
      const d = Math.hypot(tx - A.x, ty - A.y);
      if (avanza(A, p, clamp(d * 2.4, 0, VEL.cane.trotto), dt)) (A.v = verso(A.v, 0, 160 * dt)), (p.via = null);
      return false;
    },
    /**
     * Chiede attenzione a `chi`, per `dur` secondi. E' il solo passo che fa salire
     * `forza`; finisce da solo, e subito, se quella si alza, parla o ha da chiedere.
     */
    chiede(A, p, dt) {
      const g = perChiave.get(p.chi);
      if (!gentile(g) || dist(g, A) > 34 || (A.su >= 0 && (g.banco !== A.su || g.sit < 0.5))) return molla(A, 'se ne va');
      const storto = corto(A.a, Math.atan2(g.x - A.x, g.y - A.y));
      // Prima le si gira davanti, coi passi di chi si gira; poi si siede e chiede.
      if (!p.t && Math.abs(storto) > 0.3) {
        posa(A, 'cammina');
        A.v = verso(A.v, 0, 200 * dt);
        A.a += clamp(storto, -VEL[A.tipo].gira * dt, VEL[A.tipo].gira * dt);
        return false;
      }
      if (!p.t) {
        p.t = 0;
        A.chi = p.chi;
        A.ultimo.coccole = ora;
        const m = ricordo(p.chi);
        if (A === cane) (m.coccole = ora), segna(conti.coccole, { t: ora, chi: p.chi });
        else (m.fusa = ora), segna(conti.fusa, { t: ora, chi: p.chi });
      }
      p.t += dt;
      posa(A, 'chiede', p.dur);
      A.v = 0;
      A.vuole = true;
      A.a += clamp(storto, -VEL[A.tipo].gira * dt, VEL[A.tipo].gira * dt);
      A.guarda = testaDi(g);
      return p.t >= p.dur;
    },
    /** Una cosa da segnarsi fra un passo e l'altro: non dura niente. */
    fa(A, p) {
      p.fn();
      return true;
    },
  };

  // ---------------------------------------------------------------------
  //  le attivita': ognuna mette in coda i suoi passi, o niente se adesso non si puo'
  // ---------------------------------------------------------------------
  const va = (m, vel, cat, piu) => ({ k: 'va', x: m[0], y: m[1], vel, cat, ...piu });
  const sta = (posa_, dur, cat, piu) => ({ k: 'sta', posa: posa_, dur, cat, ...piu });
  const fa = (fn) => ({ k: 'fa', fn });

  const COSE = {
    // ---- di tutti e due
    /** Due passi fin la', e poi una sosta: o niente. */
    giro(A) {
      const V = VEL[A.tipo];
      const m = meta(A, 30, A === gatto ? 120 : 150);
      if (!m) return;
      A.coda.push(va(m, caso() < 0.14 ? V.trotto : V.passo, 'giro'));
      const sosta =
        A === gatto
          ? una([[4, ['siede', 4, 10]], [2.4, ['lecca', 5, 9]], [0.9, ['stira', 3, 3]], [1.5, ['fermo', 1, 2.5]], [2, null]])
          : una([[3, ['annusa', 2.5, 5]], [2.2, ['siede', 3, 7]], [1.5, ['fermo', 1, 2.5]], [0.5, ['stira', 2.6, 2.6]], [2, null]]);
      if (sosta) A.coda.push(sta(sosta[0], tra(sosta[1], sosta[2]), 'giro'));
    },
    /** Il sonno per terra: va a cercarsi il posto, ci gira sopra, si stende, dorme, e al risveglio si stira. */
    sonno(A) {
      const c = cuccia(A);
      if (!c) return;
      const V = VEL[A.tipo];
      A.lato = caso() < 0.5 ? -1 : 1;
      A.coda.push(
        va(c, V.passo, 'giro'),
        { k: 'tondo', giri: A === cane ? 1.25 : 0.6, raggio: A === cane ? 3 : 0, lato: A.lato, cat: 'giro' },
        sta('giace', tra(3, 9), 'riposo'),
        sta('dorme', A === cane ? tra(70, 160) : tra(30, 60), 'riposo'),
        sta('sveglia', tra(1.4, 2.6), 'riposo'),
        sta('stira', A === cane ? 2.6 : 3, 'giro')
      );
    },

    // ---- del gatto
    /**
     * Sale su una scrivania. Di solito una vuota; se la sedia e' libera a volte ci
     * passa sopra, che e' la scala di tutti i gatti. Arrivato, cammina fino al
     * posto libero del piano e ci gira sopra: il resto lo sceglie da lassu'.
     */
    sali(A, quale) {
      const seduti = new Set(gente.filter((g) => g.banco >= 0 && g.sit > 0.5).map((g) => g.banco));
      const voci = [];
      for (const b of Mo.banchi) {
        if (quale != null && b.i !== quale) continue;
        const d = decollo(b);
        if (d) voci.push([seduti.has(b.i) ? 0.4 : 1, [b, d]]);
      }
      if (!voci.length) return;
      const [b, d] = una(voci);
      const t = b.top;
      const V = VEL.gatto;
      const piano = { x: t.libero[0], y: t.libero[1], z: t.z };
      A.coda.push(
        va([d.x, d.y], V.passo, 'gioco', { preciso: true }),
        fa(() => ((A.banco = b.i), (A.visita = { da: ora, dormito: false, chiesto: false, pose: 0 }))),
        sta('siede', tra(0.9, 2), 'gioco', { verso: piano, guarda: piano })
      );
      // La sedia: solo se e' vuota, se ci si arriva e se nessuno le sta venendo incontro.
      const s = b.sedia;
      let scala = null;
      if (s && !seduti.has(b.i) && !genteVicina(s.x, s.y, 50) && caso() < 0.5) {
        /* Da dove ci salta: di fianco, mai da dietro — li' c'e' lo schienale, e il salto
           ci passerebbe attraverso. Attorno a una sedia il posto libero e' poco (davanti
           ha la scrivania, e la stanza piatta ci tiene la sua): si fa il giro a passi
           fitti partendo da un punto a caso, e ci si ferma al primo che va. */
        const da = caso() * TAU;
        for (let k = 0; k < 24 && !scala; k++) {
          const an = da + (k / 24) * TAU;
          if (Math.cos(an - s.a) < -0.25) continue;
          const x = s.x + Math.sin(an) * 14;
          const y = s.y + Math.cos(an) * 14;
          if (libero(x, y) && Math.hypot(x - d.x, y - d.y) < 50) scala = [x, y];
        }
      }
      if (scala) {
        A.coda.push(
          va(scala, V.passo, 'gioco', { preciso: true }),
          { k: 'salta', x: s.x, y: s.y, z: s.z, q: 'sedia', cat: 'gioco' },
          sta('siede', tra(0.7, 1.6), 'gioco', { verso: piano, guarda: piano }),
          { k: 'salta', x: d.ax, y: d.ay, z: t.z, q: 'top', cat: 'gioco' }
        );
      } else A.coda.push({ k: 'salta', x: d.ax, y: d.ay, z: t.z, q: 'top', cat: 'gioco' });
      A.lato = caso() < 0.5 ? -1 : 1;
      A.coda.push(
        fa(() => (A.su = b.i)),
        va(t.libero, V.passo * 0.6, 'gioco', { diretto: true }),
        { k: 'tondo', giri: tra(0.5, 1.1), lato: A.lato, svelto: 2.6, cat: 'gioco' },
        sta('siede', tra(2, 5), 'gioco')
      );
    },
    /** Sul piano: si arrotola e dorme, col muso verso la stanza. */
    dormiSu(A) {
      const t = Mo.banchi[A.su].top;
      // Lungo il piano, dalla parte che guarda verso chi guarda: un gatto di schiena e' una palla.
      const lungo = Math.sin(t.a) <= 0 ? t.a + Math.PI / 2 : t.a - Math.PI / 2;
      A.visita.dormito = true;
      A.coda.push(
        sta('giace', tra(3, 7), 'riposo', { verso: lungo + tra(-0.4, 0.4) }),
        sta('dorme', tra(SONNO_BANCO[0], SONNO_BANCO[1]), 'riposo'),
        sta('sveglia', tra(1.5, 3), 'riposo'),
        sta('stira', 3, 'gioco')
      );
    },
    /** Sul piano: seduto a guardare la stanza, o a leccarsi. */
    siediSu(A) {
      A.visita.pose++;
      A.coda.push(caso() < 0.6 ? sta('siede', tra(5, 11), 'gioco') : sta('lecca', tra(5, 9), 'gioco'));
    },
    /** Sul piano, con qualcuno seduto li': gli si mette davanti e chiede. Poi resta o se ne va, come gli gira. */
    fusa(A) {
      const g = gente.find((o) => o.banco === A.su && o.sit > 0.5);
      // Uno alla volta: se il cane sta chiedendo, o ha appena smesso, il gatto aspetta.
      if (!g || (gettone && gettone !== A) || altro(A).forza > 0) return;
      gettone = A;
      A.visita.chiesto = true;
      A.coda.push({ k: 'chiede', chi: g.k, dur: tra(7, 11), cat: 'gioco' }, fa(() => (gettone = null)), sta('siede', tra(1.5, 3), 'gioco'));
    },
    /** Scende: fino al bordo, il salto, e via. */
    scendi(A) {
      const b = Mo.banchi[A.su];
      const d = decollo(b);
      // Sotto non c'e' posto adesso (qualcuno in piedi li'): aspetta seduto e ci riprova.
      if (!d) return A.coda.push(sta('siede', tra(2, 4), 'gioco'));
      const m = meta(A, 30, 110, d);
      A.coda.push(
        va([d.ax, d.ay], VEL.gatto.passo * 0.6, 'gioco', { diretto: true }),
        { k: 'salta', x: d.x, y: d.y, z: 0, q: '', cat: 'gioco' },
        fa(() => aTerra(A))
      );
      if (m) A.coda.push(va(m, VEL.gatto.passo, 'giro'));
    },

    // ---- del cane
    /** Il naso lungo i mobili: un punto, e poi a naso basso fino a un altro li' vicino. */
    annusa(A) {
      const m = daAnnusare(A);
      if (!m) return;
      A.coda.push(va(m, VEL.cane.passo, 'giro'), sta('annusa', tra(2.5, 5), 'giro', { verso: m[2] }));
      const n = meta(A, 14, 44, { x: m[0], y: m[1] });
      if (n) A.coda.push(va(n, 6, 'giro', { posa: 'annusa' }), sta('annusa', tra(1.5, 3.5), 'giro'));
    },
    /**
     * Le coccole: va da qualcuno che sta fermo, gli si siede accanto, scodinzola e
     * da' la zampa. Poi se ne va contento. `quale` (la persona) e' per le prove.
     */
    coccole(A, quale) {
      // Uno alla volta: la regola sta qui e non solo in chi sceglie, cosi' vale anche per chi ordina.
      if ((gettone && gettone !== A) || altro(A).forza > 0) return;
      const voci = [];
      for (const g of gente) {
        if (quale != null ? g.k !== quale : !gentile(g) || ora - ricordo(g.k).coccole < PAUSA_PERSONA || ora - ricordo(g.k).fusa < 30) continue;
        // In piedi vale solo chi e' fermo da un po': chi si e' fermato a meta' strada riparte subito.
        if (quale == null && g.sit < 0.9 && ora - ricordo(g.k).mossa < 3) continue;
        const m = accanto(A, g);
        if (m) voci.push([1 / (1 + dist(g, A) / 150), [g, m]]);
      }
      A.ultimo.prova = ora;
      if (!voci.length) return;
      const [g, m] = una(voci);
      gettone = A;
      A.lato = caso() < 0.5 ? -1 : 1;
      const via = meta(A, 40, 120, { x: m[0], y: m[1] });
      A.coda.push(
        va(m, VEL.cane.trotto, 'gioco', { per: g.k, preciso: true }),
        { k: 'chiede', chi: g.k, dur: tra(8, 13), cat: 'gioco' },
        fa(() => ((gettone = null), (A.felice = 1))),
        sta('saltella', 0.9, 'gioco', { guarda: testaDi(g) })
      );
      if (via) A.coda.push(va(via, VEL.cane.trotto, 'giro'), fa(() => (A.felice = 1)));
    },
    /** Dietro a qualcuno che passa, per qualche secondo; se quello si ferma lo guarda un momento, seduto. */
    segue(A) {
      // Non chi gli sta venendo addosso: a quella ci si toglie di mezzo, non la si segue.
      const diFronte = (g) => (A.x - g.x) * Math.sin(g.a) + (A.y - g.y) * Math.cos(g.a) > 0 && Math.abs((A.x - g.x) * Math.cos(g.a) - (A.y - g.y) * Math.sin(g.a)) < 14;
      const voci = gente.filter((g) => g.amp > 0.8 && !g.porta && !g.chiede && dist(g, A) < 150 && !diFronte(g)).map((g) => [1, g]);
      if (!voci.length) return;
      const g = una(voci);
      A.ultimo.segue = ora;
      A.lato = caso() < 0.5 ? -1 : 1;
      A.coda.push({ k: 'segue', chi: g.k, dur: tra(4, 7), cat: 'gioco' }, sta('siede', tra(1.2, 2.2), 'gioco', { guarda: testaDi(g) }));
    },
    /** L'inchino al gatto: gli va davanti, a distanza, e lo invita a giocare. Il gatto di solito declina. */
    inchino(A) {
      const an = Math.atan2(A.x - gatto.x, A.y - gatto.y);
      let m = null;
      for (const da_ of [0, 0.5, -0.5, 1, -1]) {
        const x = gatto.x + Math.sin(an + da_) * 38;
        const y = gatto.y + Math.cos(an + da_) * 38;
        if (libero(x, y) && !inSoglia(x, y)) {
          m = [x, y];
          break;
        }
      }
      if (!m) return;
      A.ultimo.inchino = ora;
      A.coda.push(
        va(m, VEL.cane.trotto, 'gioco', { preciso: true }),
        sta('inchino', 2.4, 'gioco', { verso: gatto, guarda: 'altro' }),
        sta('fermo', tra(0.8, 1.6), 'gioco', { guarda: 'altro' })
      );
    },
  };

  /** Finita la coda: cosa adesso. I pesi sono il carattere, la quota mancante la spinta. */
  function scegli(A) {
    const peso = (c) => Math.exp(SPINTA * (META[A.tipo][c] - A.quota[c]));
    const B = altro(A);
    const voci = [];
    if (A === gatto && A.su >= 0) {
      const v = A.visita;
      const g = gente.find((o) => o.banco === A.su && o.sit > 0.5);
      if (!v.chiesto && gentile(g) && !gettone && B.forza === 0 && ora - ricordo(g.k).fusa > 200 && ora - ricordo(g.k).coccole > 30) voci.push([2.4 * peso('gioco'), 'fusa']);
      if (!v.dormito) voci.push([1.7 * peso('riposo'), 'dormiSu']);
      if (v.pose < 2) voci.push([0.45, 'siediSu']);
      if (v.dormito || v.pose) voci.push([v.dormito ? 2.5 : 0.3, 'scendi']);
    } else if (A === gatto) {
      voci.push([1 * peso('giro'), 'giro'], [0.15 * peso('riposo'), 'sonno']);
      if (ora - A.ultimo.banco > PAUSA_BANCO && Mo.banchi.length) voci.push([0.7 * peso('riposo') + 0.5 * peso('gioco'), 'sali']);
    } else {
      voci.push([1 * peso('giro'), 'giro'], [0.5 * peso('giro'), 'annusa'], [0.34 * peso('riposo'), 'sonno']);
      if (!gettone && B.forza === 0 && ora - A.ultimo.coccole > PAUSA_COCCOLE && ora - A.ultimo.prova > 15) voci.push([1.8 * peso('gioco'), 'coccole']);
      if (ora - A.ultimo.segue > 45) voci.push([1 * peso('gioco'), 'segue']);
      if (B.z === 0 && B.banco < 0 && B.stato !== 'dorme' && dist(A, B) < 170 && ora - A.ultimo.inchino > 170) voci.push([0.3 * peso('gioco'), 'inchino']);
    }
    // Quella che esce puo' non trovare dove andare (nessuno da seguire, nessun posto
    // libero): la si toglie e si pesca fra le altre. Solo se non ne resta una si aspetta seduti.
    while (voci.length && !A.coda.length) {
      A.att = una(voci);
      COSE[A.att](A);
      voci.splice(voci.findIndex((v) => v[1] === A.att), 1);
    }
    if (!A.coda.length) (A.att = 'attesa'), A.coda.push(sta('siede', tra(2, 4), 'giro'));
  }

  // ---------------------------------------------------------------------
  //  quello che li interrompe
  // ---------------------------------------------------------------------
  /** Per terra, a fare una cosa che si puo' interrompere: fermo in una posa, o in cammino per conto suo. */
  const scansabile = (A) => {
    const p = A.coda[0];
    return A.z === 0 && !!p && ((p.k === 'sta' && p.posa !== 'inchino') || (p.k === 'va' && !p.diretto && !p.per && !p.scanso));
  };

  /**
   * Qualcuno gli sta camminando addosso: si fa da parte, poi riprende da dov'era.
   * La gente la strada non la cambia — nella stanza piatta loro non ci sono —
   * quindi tocca sempre a loro, anche se dormivano.
   */
  function scansa(A) {
    if (!scansabile(A) || ora - A.ultimo.scansa < 1.5) return;
    for (const g of gente) {
      if (g.amp < 0.5 || g.porta) continue;
      const dx = A.x - g.x;
      const dy = A.y - g.y;
      const avanti = dx * Math.sin(g.a) + dy * Math.cos(g.a);
      const lato = dx * Math.cos(g.a) - dy * Math.sin(g.a);
      // Settanta unita' sono due secondi di cammino: il tempo di girarsi e fare tre passi.
      if (avanti < 0 || avanti > 70 || Math.abs(lato) > 9) continue;
      const s = lato >= 0 ? 1 : -1;
      let m = null;
      for (const [k, d] of [[s, 20], [-s, 20], [s, 30], [-s, 30], [s, 40], [-s, 40]]) {
        const x = A.x + Math.cos(g.a) * k * d;
        const y = A.y - Math.sin(g.a) * k * d;
        if (libero(x, y) && dritto(A.x, A.y, x, y) && !inSoglia(x, y) && !altroVicino(A, x, y, 14)) {
          m = [x, y];
          break;
        }
      }
      m = m || meta(A, 24, 70);
      if (!m) return;
      A.ultimo.scansa = ora;
      conti.scansi++;
      // Il passo che stava facendo resta in coda col tempo che gli mancava: chi dormiva torna a dormire.
      const cat = A.coda[0].cat;
      // Chi stava andando da qualche parte, da li' la strada la rifa': ma aspetta che
      // quella sia passata, o le torna fra i piedi.
      if (A.coda[0].k === 'va') (A.coda[0].via = null), A.coda.unshift(sta('fermo', clamp(avanti / 32, 0.5, 1.6), cat, { guarda: testaDi(g) }));
      A.coda.unshift(va(m, VEL[A.tipo].trotto, cat, { scanso: true }));
      // Chi dormiva prima alza la testa: da steso al trotto in un fotogramma non ci passa nessuno.
      if (A.stato === 'dorme') A.coda.unshift(sta('sveglia', 0.3, cat));
      return;
    }
  }

  /** Il gatto e il cane: quando il cane gli arriva troppo vicino, o lo invita a giocare, il gatto se ne va. */
  function fuga() {
    const A = gatto;
    if (A.z > 0 || ora - A.ultimo.fuga < 5 || (A.coda[0] && A.coda[0].k === 'salta')) return;
    const d = dist(A, cane);
    const sveglio = cane.stato !== 'dorme' && cane.stato !== 'giace';
    if (!(d < (sveglio ? 28 : 10) || (cane.stato === 'inchino' && cane.s > 1 && d < 64))) return;
    let meglio = null;
    let quanto = 0;
    for (let k = 0; k < 24; k++) {
      const m = meta(A, 50, 150);
      if (!m) continue;
      const q = Math.hypot(m[0] - cane.x, m[1] - cane.y);
      if (q > quanto) (quanto = q), (meglio = m);
    }
    if (!meglio) return;
    molla(A);
    aTerra(A);
    A.ultimo.fuga = ora;
    conti.fughe++;
    A.att = 'fuga';
    A.coda.push(sta('fermo', 0.4, 'giro', { guarda: 'altro' }), va(meglio, VEL.gatto.trotto, 'giro'), sta('siede', tra(2, 4), 'giro', { verso: cane, guarda: 'altro' }));
  }

  /** Dove guardano quando non hanno altro: chi passa, l'altro animale, un punto qualunque. */
  function occhiata(A, dt) {
    if (A.stato === 'dorme') return;
    A.occhio -= dt;
    if (A.occhio <= 0) {
      A.occhio = tra(1.4, 3.8);
      const B = altro(A);
      const chi = gente.filter((g) => g.amp > 0.5 && !g.porta && dist(g, A) < 120);
      const r = caso();
      if (chi.length && r < 0.5) A.mira = { k: chi[(caso() * chi.length) | 0].k };
      else if (dist(A, B) < 110 && B.v > 2 && r < 0.8) A.mira = 'altro';
      else if (r < 0.9) {
        const an = caso() * TAU;
        A.mira = { x: A.x + Math.sin(an) * 60, y: A.y + Math.cos(an) * 60, z: A.z + tra(0, 14) };
      } else A.mira = null;
    }
    const m = A.mira;
    if (m === 'altro') A.guarda = { x: altro(A).x, y: altro(A).y, z: altro(A).z + 6 };
    else if (m && m.k) A.guarda = perChiave.has(m.k) ? testaDi(perChiave.get(m.k)) : null;
    else A.guarda = m;
  }

  /** Animazioni ridotte: addormentati dove sono, e fermi. Chi era a mezz'aria arriva. */
  function addormenta(A) {
    for (const p of A.coda) {
      if (p.k !== 'salta' || p.f == null) continue;
      A.x = p.x;
      A.y = p.y;
      A.z = p.z;
      A.poggia = p.q || '';
    }
    // Chi e' in alto finisce sul piano, comunque ci stesse arrivando: sul sedile non si resta.
    if (A.banco >= 0 && Mo.banchi[A.banco] && (A.z > 0 || A.su >= 0)) {
      const t = Mo.banchi[A.banco].top;
      A.su = A.banco;
      A.x = t.libero[0];
      A.y = t.libero[1];
      A.z = t.z;
      A.poggia = 'top';
      A.visita = A.visita || { da: ora, dormito: true, chiesto: true, pose: 2 };
    } else {
      aTerra(A);
      // Per terra, e non gia' accucciato: da fermo non si scansa piu' nessuno, quindi
      // si addormenta in un posto dove non passa nessuno, non dove l'ha colto.
      const c = A.stato === 'dorme' || A.stato === 'giace' ? null : cuccia(A);
      if (c) [A.x, A.y] = c;
    }
    molla(A);
    A.v = A.beta = A.forza = 0;
    A.vuole = false;
    A.chi = A.guarda = null;
    A.cat = 'riposo';
    posa(A, 'dorme');
    A.fermato = true;
  }

  function vivi(A, dt) {
    A.s += dt;
    const k = Math.min(1, dt / MEMORIA);
    for (const c of ['riposo', 'giro', 'gioco']) A.quota[c] += k * ((c === A.cat ? 1 : 0) - A.quota[c]);
    A.felice = Math.max(0, A.felice - dt / 7);
    A.guarda = null;
    A.vuole = false;
    scansa(A);
    // Il cane a zonzo, e qualcuno che gli passa vicino: una volta su sette, al secondo, gli va dietro.
    if (A === cane && A.z === 0 && A.cat === 'giro' && ora - A.ultimo.segue > 45 && (A.occhio2 = (A.occhio2 || 0) - dt) <= 0) {
      A.occhio2 = 1;
      if (caso() < 0.14 && gente.some((g) => g.amp > 0.8 && !g.porta && !g.chiede && dist(g, A) < 110)) {
        molla(A);
        A.att = 'segue';
        COSE.segue(A);
      }
    }
    // Qualche passo non dura niente (`fa`): si va avanti finche' uno non prende tempo.
    for (let giri = 0; giri < 8; giri++) {
      if (!A.coda.length) scegli(A);
      const p = A.coda[0];
      if (p.cat) A.cat = p.cat;
      if (!PASSI[p.k](A, p, dt)) break;
      if (A.coda[0] === p) A.coda.shift();
      if (p.k !== 'fa') break;
    }
    A.forza = verso(A.forza, A.vuole ? 1 : 0, dt * 2);
    if (!A.vuole && A.forza === 0) A.chi = null;
    if (!A.guarda) occhiata(A, dt);
  }

  // ---------------------------------------------------------------------
  //  la stanza che cambia
  // ---------------------------------------------------------------------
  /** La prima volta: il gatto e' gia' su una scrivania a dormire, il cane steso in un angolo del salone. */
  function nasci() {
    const b = Mo.banchi.length ? Mo.banchi[(caso() * Mo.banchi.length) | 0] : null;
    if (b) {
      gatto.su = gatto.banco = b.i;
      gatto.x = b.top.libero[0];
      gatto.y = b.top.libero[1];
      gatto.z = b.top.z;
      gatto.poggia = 'top';
      gatto.a = (Math.sin(b.top.a) <= 0 ? b.top.a + Math.PI / 2 : b.top.a - Math.PI / 2) + tra(-0.3, 0.3);
      gatto.visita = { da: 0, dormito: true, chiesto: false, pose: 0 };
      gatto.coda.push(sta('dorme', tra(14, 32), 'riposo'), sta('sveglia', 2, 'riposo'), sta('stira', 3, 'gioco'));
    } else {
      [gatto.x, gatto.y] = meta(gatto, 0, 1e9) || vicina(Mo.W / 2, Mo.H / 2);
    }
    [cane.x, cane.y] = cuccia(cane, { x: Mo.W / 2, y: Mo.H * 0.7 }) || vicina(Mo.W / 2, Mo.H * 0.7);
    cane.a = tra(-0.6, 0.6);
    cane.coda.push(sta('giace', tra(3, 7), 'riposo'), sta('sveglia', 1.5, 'riposo'));
    for (const A of [gatto, cane]) (A.stato = A.coda[0].posa), (A.cat = 'riposo'), (A.lato = caso() < 0.5 ? -1 : 1);
  }

  /**
   * La stanza e' stata rimontata. Chi e' per terra resta dov'e', rimesso dentro i
   * muri nuovi e fuori dai mobili; chi e' su una scrivania (o ci sta saltando) si
   * sposta con lei, che in una stanza che cresce e' l'unica cosa che cammina.
   */
  function stanza(mondo) {
    const prima = Mo;
    Mo = mondo;
    const n = Mo.gc * Mo.gr;
    if (da.length !== n) {
      da = new Int32Array(n);
      timbro = new Uint32Array(n);
      fila = new Int32Array(n);
      vietato = new Uint8Array(n);
      traffico = new Float32Array(n);
      giroOnda = 0;
    }
    // Le strade che la stanza gia' conosce contano da subito come passi visti.
    for (let i = 0; i < n; i++) traffico[i] = Math.max(traffico[i], Mo.corsie[i]);
    if (!prima) return nasci();
    for (const A of [gatto, cane]) {
      const b0 = A.banco >= 0 ? prima.banchi[A.banco] : null;
      const b1 = A.banco >= 0 ? Mo.banchi[A.banco] : null;
      if (b0 && b1) {
        const dx = b1.top.x - b0.top.x;
        const dy = b1.top.y - b0.top.y;
        const quota = (q) => (q === 'top' ? b1.top.z : q === 'sedia' && b1.sedia ? b1.sedia.z : 0);
        A.x += dx;
        A.y += dy;
        if (A.z > 0 && A.poggia) A.z = quota(A.poggia);
        // I punti che i passi si passano l'un l'altro (il piano da guardare) si spostano una volta sola.
        const mossi = new Set([cane, gatto]);
        const sposta = (o) => {
          if (!o || typeof o !== 'object' || mossi.has(o)) return;
          mossi.add(o);
          o.x += dx;
          o.y += dy;
          if (o.z > 0) o.z = b1.top.z;
        };
        for (const p of A.coda) {
          if (p.x != null) (p.x += dx), (p.y += dy);
          if (p.x0 != null) (p.x0 += dx), (p.y0 += dy), (p.z0 = quota(p.q0));
          if (p.k === 'salta') p.z = quota(p.q);
          sposta(p.verso);
          sposta(p.guarda);
          p.via = null;
        }
        // Chi le stava ancora girando attorno per terra puo' ritrovarsi sotto la scrivania di fianco.
        if (A.z === 0 && !libero(A.x, A.y)) [A.x, A.y] = vicina(A.x, A.y);
        continue;
      }
      if (A.banco >= 0) {
        // La scrivania non c'e' piu': si ritrova per terra, e ricomincia.
        molla(A);
        A.z = A.beta = 0;
        aTerra(A);
      }
      A.x = clamp(A.x, 18, Mo.W - 18);
      A.y = clamp(A.y, 18, Mo.H - 18);
      if (!libero(A.x, A.y)) [A.x, A.y] = vicina(A.x, A.y);
      for (const p of A.coda) {
        if (p.k !== 'va') continue;
        p.via = null;
        if (!libero(p.x, p.y)) [p.x, p.y] = vicina(clamp(p.x, 18, Mo.W - 18), clamp(p.y, 18, Mo.H - 18));
      }
    }
  }

  return {
    gatto,
    cane,
    conti,
    stanza,
    get mondo() {
      return Mo;
    },
    get ora() {
      return ora;
    },
    /**
     * Un fotogramma. `persone`: la gente com'e' adesso — { k, x, y, a, sit, amp,
     * parla, chiede, porta, banco, alta }, dove `k` e' una chiave che resta la
     * stessa finche' la persona c'e'. `calmo`: animazioni ridotte.
     */
    passo(dt, persone, calmo) {
      if (!Mo) return;
      ora += dt;
      gente = persone;
      perChiave = new Map();
      for (const g of gente) {
        perChiave.set(g.k, g);
        const m = ricordo(g.k);
        if (g.amp > 0.2) m.mossa = ora;
        // I passi si segnano larghi una persona, non una casella.
        if (g.amp > 0.5 && !g.porta) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) traffico[cel(g.x + i * CELLA, g.y + j * CELLA)] += dt;
      }
      // Ogni dieci secondi: i passi visti sbiadiscono (in cinque minuti si dimezzano, ma
      // mai sotto le corsie che la stanza conosce), e chi non c'e' piu' si dimentica.
      if (ora - sbiadito > 10) {
        sbiadito = ora;
        for (let i = 0; i < traffico.length; i++) traffico[i] = Math.max(traffico[i] * 0.977, Mo.corsie[i]);
        for (const k of ricordi.keys()) if (!perChiave.has(k)) ricordi.delete(k);
      }
      for (const A of [gatto, cane]) {
        if (calmo) {
          if (!A.fermato) addormenta(A);
          continue;
        }
        if (A.fermato) {
          A.fermato = false;
          A.coda.push(sta('sveglia', 2, 'riposo'), sta('stira', A === cane ? 2.6 : 3, 'giro'));
        }
        vivi(A, dt);
      }
      if (!calmo) fuga();
    },
    /** Per le prove: lascia perdere tutto e fa questa cosa adesso (`sali`, `coccole`, `sonno`…), se si puo'. */
    ordina(tipo, cosa, arg) {
      const A = tipo === 'gatto' ? gatto : cane;
      molla(A);
      A.att = cosa;
      COSE[cosa](A, arg);
      return A.coda.length > 0;
    },
  };
}
