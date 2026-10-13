/* Claude Studio — l'ufficio in 3D: i corpi del gatto e del cane.
 *
 * A tratto come il resto della stanza nuova (kit.js): forme tonde, tre toni piatti,
 * il guscio d'inchiostro. Disegnati in metri dentro un gruppo scalato di U, che
 * guardano a +z coi piedi a y = 0 — come le persone dell'anteprima approvata.
 *
 * Un animale e' una dozzina di pezzi rigidi appesi a dei perni: il bacino, il
 * petto (la schiena si piega a meta': e' cosi' che gira col corpo e che il gatto si
 * arrotola), il collo e la testa, le orecchie, quattro zampe e la coda a segmenti.
 * Le zampe sono un pezzo solo, senza ginocchio: a trenta pixel un ginocchio non si
 * vede, e una zampa corta che si accorcia e si allunga cammina, si siede e salta lo
 * stesso.
 *
 * Qui non si decide niente: dove sta e cosa fa lo dice la testa (pets-cervello.js).
 * Qui c'e' come lo fa. Una posa e' un elenco di numeri (quanto e' alto il bacino,
 * dove punta ogni zampa, quanto e' su la coda…); ogni stato scrive i suoi, e il
 * corpo ci arriva piano: per questo da una posa all'altra non c'e' mai uno scatto,
 * e nessuno ha dovuto disegnare «da seduto a sdraiato». Sopra ci vanno le cose che
 * non devono arrivare piano: il passo, che segue la strada fatta e non l'orologio
 * (se no i piedi pattinano), lo scodinzolio, il respiro.
 */
import { THREE, Tratto, penna, U, TAU, clamp, lerp, ease, smooth, giro as corto } from './kit.js';

/* ---- le misure, in metri ----
 * L       dal perno delle anche a quello delle spalle
 * gamba   dal perno alla pianta: in piedi il bacino sta a quest'altezza
 * largo   mezza carreggiata
 * pancia  a che altezza sta la schiena quando la pancia tocca terra
 * collo   dove comincia il collo, dalle spalle [su, avanti]; `capo` e' da li' al centro della testa
 * occhi, orecchio, coda   dove stanno i loro perni: sulla testa i primi due, sul bacino [su, indietro] la coda
 * nodi, nodo   quanti segmenti ha la coda, e quanto e' lungo ognuno
 * filo    lo spessore del contorno: piu' sottile di quello dei mobili, che su una zampa di tre centimetri e' meta' zampa
 * alza    di quanto alza il piede, al passo e al trotto
 * passo   quanta strada fa in un ciclo di zampe al passo e al trotto, e a che velocita' (m/s) sono l'uno e l'altro
 * scala   di quanto e' ingrandito tutto quanto: accanto a persone dalla testa grande un gatto in scala vera sono
 *         venti pixel che non si leggono. Arrotolato sta ancora nei quarantacinque centimetri del posto libero.
 */
const MISURE = {
  gatto: {
    scala: 1.15,
    L: 0.2,
    gamba: 0.124,
    largo: 0.042,
    pancia: 0.068,
    collo: [0.045, 0.035],
    capo: [0.06, 0.045],
    occhi: 0.012,
    orecchio: [0.048, 0.062, -0.005],
    coda: [0.035, -0.06],
    nodi: 4,
    nodo: 0.078,
    filo: 0.011,
    passo: [0.2, 0.38, 0.4, 0.9],
    alza: [0.016, 0.028],
  },
  cane: {
    scala: 1.1,
    L: 0.32,
    gamba: 0.235,
    largo: 0.07,
    pancia: 0.105,
    collo: [0.075, 0.04],
    capo: [0.105, 0.06],
    occhi: 0.028,
    orecchio: [0.085, 0.07, -0.01],
    coda: [0.06, -0.08],
    nodi: 2,
    nodo: 0.1,
    filo: 0.013,
    passo: [0.33, 0.6, 0.5, 1.15],
    alza: [0.025, 0.045],
  },
};

/** Il pelo. Sono i loro colori, non quelli di una pelle: un gatto grigio resta grigio anche di notte. */
const TINTE = {
  gatto: { pelo: '#8f98b0', scuro: '#5b6480', chiaro: '#f7f2e8', rosa: '#f2a0a6', occhio: '#2e2030' },
  cane: { pelo: '#f6efe1', macchia: '#b8663a', naso: '#3a2a30', occhio: '#2e2030', collare: '#2f9e9a', medaglia: '#f2c75c' },
};

/** I numeri di una posa. Zampe: 0 e 1 davanti (sinistra, destra), 2 e 3 dietro. */
const CHIAVI = [
  // il tronco: l'altezza di anche e spalle, lo stacco da terra, lo scarto in avanti, e come si torce
  ...['hy', 'sy', 'su', 'dz', 'rollio', 'piega', 'arco'],
  // le zampe: dove punta ognuna (in avanti e' positivo), quanto e' lunga, quanto si apre di lato
  ...['g0', 'g1', 'g2', 'g3', 'l0', 'l1', 'l2', 'l3', 'o0', 'o1', 'o2', 'o3'],
  // il collo e la testa (su e' positivo), le orecchie
  ...['colX', 'colY', 'tesX', 'tesY', 'tesZ', 'orX', 'orZ'],
  // la coda: quanto e' su alla base, il ricciolo a ogni nodo, e lo stesso di lato; lo scodinzolio e la punta che batte
  ...['c0', 'c1', 'cy', 'cyy', 'scod', 'punta'],
  // gli occhi aperti, il fiato, quanto si schiaccia a terra, quanto segue con lo sguardo
  ...['occhi', 'fiato', 'schiaccia', 'vede'],
];

/** In piedi, fermo: da qui parte ogni posa. */
function base(p, D, cane) {
  for (const k of CHIAVI) p[k] = 0;
  p.hy = p.sy = D.gamba;
  p.l0 = p.l1 = p.l2 = p.l3 = 1;
  p.tesX = 0.05;
  p.c0 = cane ? 0.8 : 0.7;
  p.c1 = cane ? 0.45 : 0.2;
  p.scod = cane ? 0.1 : 0;
  p.punta = cane ? 0 : 0.25;
  p.occhi = 1;
  p.fiato = cane ? 0.016 : 0.012;
  p.vede = 1;
}
/** La zampa `k` arriva a terra da dove sta il suo perno: quanto deve allungarsi. */
const tocca = (p, D, k) => (p['l' + k] = (k < 2 ? p.sy : p.hy) / (D.gamba * Math.cos(clamp(p['g' + k], -1.2, 1.2))));
const zampe = (p, da, a, g, l, o = 0) => {
  for (let k = da; k <= a; k++) (p['g' + k] = g), (p['l' + k] = l), (p['o' + k] = o);
};

/* ---- le pose ----
 * Ognuna riceve `p` (i numeri a cui arrivare, gia' messi «in piedi»), `o` (quello
 * che si somma di scatto: i tremiti, le leccate), `s` i secondi da quando e' in
 * questa posa, `A` l'animale della testa e `D` le misure. `A.lato` e' da che parte
 * pende tutto quello che non e' simmetrico.
 */
const POSE = {
  gatto: {
    fermo(p) {
      p.c0 = 0.95;
      p.c1 = -0.1;
    },
    /** La coda dritta col ricciolo in cima, se va piano; stesa dietro, se trotta. */
    cammina(p, o, s, A, D, B) {
      p.c0 = lerp(1.25, 0.35, B.trotto);
      p.c1 = lerp(-0.22, 0.08, B.trotto);
      p.colX = -0.06;
      p.punta = 0.3;
    },
    siede(p, o, s, A, D) {
      p.hy = D.pancia + 0.002;
      p.sy = 0.172;
      p.dz = 0.015;
      zampe(p, 2, 3, 1.25, 0.72, 0.3);
      p.g0 = p.g1 = 0.04;
      tocca(p, D, 0);
      tocca(p, D, 1);
      p.colX = 0.12;
      // La coda gira attorno ai piedi, e la punta batte.
      p.c0 = -0.02;
      p.c1 = 0;
      p.cy = 1.35 * A.lato;
      p.cyy = 0.55 * A.lato;
      p.punta = 0.5;
    },
    /** Si lecca una zampa, poi se la passa sul muso: e ricomincia. */
    lecca(p, o, s, A, D) {
      POSE.gatto.siede(p, o, s, A, D);
      const k = A.lato > 0 ? 0 : 1;
      const muso = s % 5 > 3;
      p['g' + k] = muso ? 1.95 : 1.75;
      p['l' + k] = 1.05;
      p['o' + k] = -0.35;
      p.colX = muso ? -0.1 : -0.25;
      p.tesX = muso ? -0.3 : -0.55;
      p.tesY = 0.25 * A.lato;
      p.occhi = muso ? 0.3 : 0.6;
      p.vede = 0;
      if (muso) (o.tesZ = 0.2 * Math.sin(s * 9)), (o['g' + k] = 0.18 * Math.sin(s * 9));
      else (o.tesX = 0.09 * Math.sin(s * 16)), (o['g' + k] = 0.06 * Math.sin(s * 16 + 1));
    },
    /** Prima il davanti giu' e il sedere in aria, poi tutto avanti con le zampe di dietro che restano li'. */
    stira(p, o, s, A, D) {
      p.vede = 0.3;
      if (s < 1.5) {
        p.sy = 0.085;
        p.hy = 0.155;
        p.dz = -0.035;
        zampe(p, 0, 1, 1.05, 1.3);
        p.g2 = p.g3 = -0.2;
        tocca(p, D, 2);
        tocca(p, D, 3);
        p.colX = 0.3;
        p.tesX = 0.35;
        p.c0 = 1.5;
        p.c1 = -0.2;
        p.occhi = 0.25;
      } else if (s < 2.5) {
        p.sy = 0.155;
        p.hy = 0.125;
        p.dz = 0.05;
        zampe(p, 2, 3, -0.95, 1.35);
        p.g0 = p.g1 = 0.2;
        tocca(p, D, 0);
        tocca(p, D, 1);
        p.colX = 0.25;
        p.tesX = 0.2;
        p.c0 = 0.3;
        p.occhi = 0.4;
      }
    },
    /** Prima del salto: giu', gli occhi sulla meta, e alla fine il sedere che ondeggia. */
    acquatta(p, o, s, A, D) {
      p.hy = 0.085;
      p.sy = 0.095;
      p.g0 = p.g1 = 0.3;
      p.g2 = p.g3 = 0.35;
      for (let k = 0; k < 4; k++) tocca(p, D, k);
      p.colX = 0.25;
      p.c0 = 0.05;
      p.c1 = 0.05;
      p.punta = 0.9;
      p.orX = 0.2;
      if (s > A.dur * 0.5) (o.rollio = 0.08 * Math.sin(s * 34)), (o.piega = 0.05 * Math.sin(s * 34));
    },
    /** In aria: lungo e teso finche' sale, raccolto con le zampe davanti in giu' quando scende. */
    vola(p, o, s, A, D) {
      const b = clamp(A.beta, -1, 1);
      const sale = s < A.dur * 0.5;
      p.hy = 0.13 - (D.L / 2) * Math.sin(b);
      p.sy = 0.13 + (D.L / 2) * Math.sin(b);
      zampe(p, 0, 1, (sale ? 1 : 0.55) + b, sale ? 1.2 : 1.15);
      zampe(p, 2, 3, (sale ? -1 : 0.45) + b, sale ? 1.25 : 0.75);
      p.colX = 0.1;
      p.tesX = b * 0.4;
      p.c0 = 0.1 - b;
      p.c1 = 0.1;
      p.orX = -0.5;
      p.vede = 0;
    },
    atterra(p, o, s, A, D) {
      p.hy = 0.09;
      p.sy = 0.085;
      p.g0 = p.g1 = 0.35;
      p.g2 = p.g3 = 0.2;
      for (let k = 0; k < 4; k++) tocca(p, D, k);
      p.colX = 0.25;
      p.c0 = 0.9;
    },
    /** La pagnotta: le zampe sotto, la coda attorno, gli occhi a meta'. */
    giace(p, o, s, A, D) {
      p.hy = p.sy = D.pancia;
      zampe(p, 0, 3, 0.8, 0.3);
      p.schiaccia = 0.6;
      p.c0 = -0.06;
      p.c1 = 0;
      p.cy = 1.5 * A.lato;
      p.cyy = 0.55 * A.lato;
      p.punta = 0.35;
      p.occhi = 0.7;
    },
    /** Arrotolato: la schiena piegata, il muso contro il fianco e la coda che chiude il cerchio. */
    dorme(p, o, s, A, D) {
      p.hy = p.sy = D.pancia - 0.002;
      zampe(p, 0, 3, 0.8, 0.3);
      p.schiaccia = 1;
      p.piega = 1.3 * A.lato;
      // Il muso gira contro il fianco, ma non fin sotto: le orecchie devono restare fuori, o e' una palla.
      p.colY = 0.8 * A.lato;
      p.colX = -0.4;
      p.tesY = 0.35 * A.lato;
      p.tesX = -0.2;
      p.tesZ = 0.2 * A.lato;
      p.c0 = -0.06;
      p.c1 = 0;
      p.cy = 1.75 * A.lato;
      p.cyy = 0.62 * A.lato;
      p.punta = 0.05;
      p.orZ = 0.15;
      p.occhi = 0;
      p.fiato = 0.035;
      p.vede = 0;
    },
    sveglia(p, o, s, A, D) {
      POSE.gatto.giace(p, o, s, A, D);
      p.schiaccia = 0.4;
      p.colX = 0.2;
      p.tesX = 0.1;
      p.orX = 0.15;
      p.occhi = lerp(0.3, 1, smooth(0.2, 1, s));
    },
    /** Davanti a chi lavora: seduto, la coda dritta che trema, una zampata ogni tanto e una testata. */
    chiede(p, o, s, A, D) {
      POSE.gatto.siede(p, o, s, A, D);
      p.colX = 0.2;
      p.dz = 0.03;
      p.c0 = 1.45;
      p.c1 = -0.12;
      p.cy = p.cyy = p.punta = 0;
      o.c1 = 0.05 * Math.sin(s * 38);
      const k = A.lato > 0 ? 0 : 1;
      if (s % 2.4 > 1.3 && s % 2.4 < 2) (p['g' + k] = 1.25), (p['l' + k] = 1), (o['g' + k] = 0.22 * Math.sin(s * 26));
      if (s % 4.8 > 3 && s % 4.8 < 3.9) (p.dz = 0.055), (p.colX = -0.05), (p.tesZ = 0.4 * A.lato), (p.occhi = 0.2);
    },
  },

  cane: {
    fermo(p) {
      p.scod = 0.15;
    },
    cammina(p, o, s, A) {
      p.c0 = 0.95;
      p.scod = 0.22 + 0.5 * A.felice;
      p.colX = -0.04;
    },
    /** Il naso per terra, che lavora: e la testa che va di qua e di la'. */
    annusa(p, o, s, A, D) {
      p.sy = 0.2;
      tocca(p, D, 0);
      tocca(p, D, 1);
      p.colX = -1.9;
      p.tesX = -0.7;
      p.tesY = 0.3 * Math.sin(s * 1.7);
      p.c0 = 0.55;
      p.c1 = 0.2;
      p.scod = 0.2;
      p.orX = 0.25;
      p.vede = 0;
      o.tesX = 0.06 * Math.sin(s * 40);
    },
    siede(p, o, s, A, D) {
      p.hy = D.pancia + 0.003;
      p.sy = 0.3;
      p.dz = 0.02;
      zampe(p, 2, 3, 1.2, 0.62, 0.32);
      p.g0 = p.g1 = 0.03;
      tocca(p, D, 0);
      tocca(p, D, 1);
      p.colX = 0.1;
      // La coda per terra, che spazza.
      p.c0 = -0.3;
      p.c1 = 0.15;
      p.scod = 0.2 + 0.5 * A.felice;
    },
    /** Steso sulla pancia, la testa su. */
    giace(p, o, s, A, D) {
      p.hy = p.sy = D.pancia;
      zampe(p, 0, 1, 1.42, 0.8, 0.06);
      zampe(p, 2, 3, 1.3, 0.7, 0.4);
      p.schiaccia = 0.25;
      p.colX = 0.15;
      p.c0 = -0.35;
      p.c1 = 0.1;
      p.cy = 0.4 * A.lato;
      p.scod = 0.06;
    },
    /** Come sopra, col mento per terra fra le zampe e i fianchi abbandonati di lato. */
    dorme(p, o, s, A, D) {
      POSE.cane.giace(p, o, s, A, D);
      p.sy = D.pancia - 0.005;
      p.colX = -1.55;
      p.tesX = -0.12;
      p.tesZ = 0.3 * A.lato;
      p.tesY = 0.2 * A.lato;
      p.rollio = 0.18 * A.lato;
      p.piega = 0.3 * A.lato;
      p.orZ = 0.25;
      p.occhi = 0;
      p.fiato = 0.04;
      p.scod = 0;
      p.vede = 0;
    },
    sveglia(p, o, s, A, D) {
      POSE.cane.giace(p, o, s, A, D);
      p.colX = 0.3;
      p.tesX = 0.15;
      p.orZ = 0.3;
      p.scod = 0.15;
      p.occhi = lerp(0.3, 1, smooth(0.2, 1, s));
    },
    /** Lo stiracchiarsi dei cani: i gomiti a terra e il sedere in aria, poi tutto in avanti. */
    stira(p, o, s, A, D) {
      p.vede = 0.3;
      if (s < 1.5) {
        p.sy = 0.12;
        p.hy = 0.275;
        p.dz = -0.04;
        zampe(p, 0, 1, 1.1, 1);
        tocca(p, D, 2);
        tocca(p, D, 3);
        p.colX = 0.4;
        p.tesX = 0.35;
        p.c0 = 1.2;
        p.occhi = 0.3;
      } else if (s < 2.3) {
        p.sy = 0.25;
        p.hy = 0.2;
        p.dz = 0.06;
        zampe(p, 2, 3, -0.8, 1.3);
        tocca(p, D, 0);
        tocca(p, D, 1);
        p.colX = 0.2;
      }
    },
    /** Le coccole: seduto, gli occhi addosso, la coda che non sta ferma; da' la zampa, poi piega la testa. */
    chiede(p, o, s, A, D) {
      POSE.cane.siede(p, o, s, A, D);
      p.colX = 0.25;
      p.scod = 0.8;
      p.orZ = 0.45;
      o.rollio = 0.03 * Math.sin(s * 14);
      const w = s % 3.2;
      const k = A.lato > 0 ? 0 : 1;
      if (w > 0.8 && w < 1.9) (p['g' + k] = 1.3), (p['l' + k] = 0.95), (o['g' + k] = 0.3 * Math.sin(s * 20)), (p.sy += 0.012);
      if (w > 2 && w < 3) p.tesZ = 0.38 * (Math.floor(s / 3.2) % 2 ? -1 : 1);
    },
    /** L'invito a giocare: davanti giu', sedere su, e non sta fermo un momento. */
    inchino(p, o, s, A, D) {
      p.sy = 0.115;
      p.hy = 0.285;
      p.dz = -0.03;
      zampe(p, 0, 1, 1.15, 0.95, 0.28);
      tocca(p, D, 2);
      tocca(p, D, 3);
      p.colX = 0.5;
      p.tesX = 0.3;
      p.c0 = 1.3;
      p.c1 = 0.3;
      p.scod = 0.9;
      p.orZ = 0.4;
      o.sy = 0.015 * Math.sin(s * 20);
      o.piega = 0.12 * Math.sin(s * 7);
    },
    /** Contento: due saltelli sul posto. */
    saltella(p, o, s) {
      p.sy += 0.025;
      p.scod = 0.85;
      p.tesX = 0.3;
      p.orZ = 0.4;
      o.su = 0.07 * Math.abs(Math.sin(s * Math.PI * 2.3));
      o.l0 = o.l1 = o.l2 = o.l3 = -0.12 * Math.abs(Math.sin(s * Math.PI * 2.3));
    },
  },
};

/** Quanto in fretta il corpo arriva alla posa (per secondo): il salto di scatto, il sonno piano. */
const FRETTA = { vola: 26, atterra: 20, acquatta: 12, dorme: 4.5, giace: 6, sveglia: 6 };
/** Le pose in cui le zampe possono fare il passo: nelle altre stanno dove le mette la posa. */
const PASSO = { cammina: 1, fermo: 1, annusa: 1 };

// ---------------------------------------------------------------------
//  i pezzi
// ---------------------------------------------------------------------
function monta(tipo, mat) {
  const D = MISURE[tipo];
  const C = TINTE[tipo];
  const F = D.filo;
  const cane = tipo === 'cane';
  const meshes = [];
  const nodo = (par, x = 0, y = 0, z = 0) => {
    const n = new THREE.Group();
    n.position.set(x, y, z);
    par.add(n);
    return n;
  };
  const pezzo = (par, fn, ombra = true) => {
    const L = new Tratto();
    fn(penna(L));
    const m = L.mesh(mat, ombra);
    par.add(m);
    meshes.push(m);
    return m;
  };
  const g = new THREE.Group();
  g.scale.setScalar(U * D.scala);
  const bac = nodo(g, 0, D.gamba, -D.L / 2);
  const dor = nodo(bac, 0, 0, D.L / 2);
  const col = nodo(dor, 0, D.collo[0], D.L / 2 + D.collo[1]);
  const tes = nodo(col, 0, D.capo[0], D.capo[1]);

  // ---- il tronco, in due meta' che si accavallano sul perno di mezzo
  const groppa = pezzo(bac, (p) => {
    if (cane) {
      p.sph(1, 0, 0.005, 0.05, C.pelo, { s: [0.1, 0.1, 0.15], n: 12, filo: F });
      // la sella: una macchia che esce appena dalla schiena
      p.sph(1, 0, 0.042, 0.06, C.macchia, { s: [0.088, 0.072, 0.115], n: 10, filo: 0 });
    } else {
      p.sph(1, 0, 0.004, 0.035, C.pelo, { s: [0.072, 0.07, 0.108], n: 12, filo: F });
      for (const z of [-0.012, 0.045]) p.sph(1, 0, 0.03, z, C.scuro, { s: [0.05, 0.047, 0.013], n: 8, filo: 0 });
    }
  });
  const petto = pezzo(dor, (p) => {
    if (cane) {
      p.sph(1, 0, 0.008, 0.06, C.pelo, { s: [0.098, 0.102, 0.145], n: 12, filo: F });
    } else {
      p.sph(1, 0, 0.004, 0.045, C.pelo, { s: [0.068, 0.07, 0.1], n: 12, filo: F });
      p.sph(1, 0, 0.031, 0.015, C.scuro, { s: [0.047, 0.045, 0.013], n: 8, filo: 0 });
      // la pettorina bianca
      p.sph(1, 0, -0.012, 0.112, C.chiaro, { s: [0.045, 0.05, 0.036], n: 8, filo: 0 });
    }
  });

  // ---- la testa: grande, che e' quella che si deve leggere
  pezzo(tes, (p) => {
    if (cane) {
      p.sph(0.115, 0, 0, 0, C.pelo, { s: [1.04, 0.95, 0.98], n: 14, filo: F });
      p.sph(1, 0, -0.035, 0.105, C.pelo, { s: [0.058, 0.05, 0.075], n: 10, filo: F });
      p.sph(0.024, 0, -0.016, 0.176, C.naso, { s: [1.1, 0.85, 0.9], n: 8, filo: 0 });
      // la macchia attorno a un occhio
      p.sph(1, 0.047, 0.03, 0.083, C.macchia, { s: [0.045, 0.05, 0.024], n: 8, filo: 0 });
      // Il collare e la medaglietta stanno con la testa, sotto la nuca: appesi al
      // petto restavano a mezz'aria ogni volta che il collo si abbassava.
      p.put(TORO(0.072, 0.014), C.collare, 0, -0.082, -0.03, { rx: -1.05, filo: 0.006 });
      p.sph(0.016, 0, -0.118, 0.032, C.medaglia, { n: 8, filo: 0.006 });
    } else {
      p.sph(0.085, 0, 0, 0, C.pelo, { s: [1.1, 0.92, 0.98], n: 14, filo: F });
      p.sph(1, 0, -0.028, 0.066, C.chiaro, { s: [0.042, 0.03, 0.03], n: 8, filo: 0.006 });
      p.sph(0.011, 0, -0.015, 0.094, C.rosa, { n: 6, filo: 0 });
      // le righe sulla fronte
      for (const x of [-0.024, 0, 0.024]) p.sph(1, x, 0.064 - Math.abs(x) * 0.25, 0.022, C.scuro, { s: [0.007, 0.012, 0.03], n: 6, filo: 0 });
    }
  });
  // Gli occhi stanno su un perno loro, all'altezza loro: chiuderli e' schiacciarli in una riga.
  const occhi = pezzo(
    nodo(tes, 0, D.occhi, 0),
    (p) => {
      const [x, z, r] = cane ? [0.045, 0.1, 1.25] : [0.036, 0.074, 1];
      for (const k of [-1, 1]) {
        p.sph(1, k * x, 0, z, C.occhio, { s: [0.013 * r, 0.018 * r, 0.008 * r], n: 8, filo: 0 });
        p.sph(0.0045 * r, k * x + 0.005 * r, 0.007 * r, z + 0.007 * r, '#ffffff', { n: 6, filo: 0 });
      }
    },
    false
  );
  // Le orecchie: 0 la sinistra (+x), 1 la destra. Il gatto le ha a punta, il cane che pendono.
  const orecchie = [1, -1].map((k) => {
    const n = nodo(tes, k * D.orecchio[0], D.orecchio[1], D.orecchio[2]);
    pezzo(n, (p) => {
      if (cane) p.sph(1, k * 0.014, -0.055, 0, C.macchia, { s: [0.022, 0.07, 0.046], n: 8, filo: F * 0.8 });
      else {
        p.cyl(0, 0.033, 0.074, 0, -0.012, 0, C.pelo, { n: 8, s: [1, 1, 0.6], rz: -k * 0.22, filo: F * 0.8 });
        p.cyl(0, 0.02, 0.05, k * 0.002, -0.006, 0.011, C.rosa, { n: 6, s: [1, 1, 0.3], rz: -k * 0.22, filo: 0 });
      }
    });
    return n;
  });

  // ---- le zampe: 0 e 1 davanti (sinistra, destra), 2 e 3 dietro
  const gambe = [
    [dor, 1, D.L / 2],
    [dor, -1, D.L / 2],
    [bac, 1, 0],
    [bac, -1, 0],
  ].map(([par, k, z]) => {
    const n = nodo(par, k * D.largo, 0, z);
    pezzo(n, (p) => {
      if (cane) {
        p.cap(0.04, 0.14, 0, -0.11, 0, C.pelo, { n: 6, filo: F });
        p.sph(1, 0, -0.208, 0.012, C.pelo, { s: [0.046, 0.03, 0.056], n: 8, filo: F });
      } else {
        p.cap(0.027, 0.066, 0, -0.06, 0, C.pelo, { n: 6, filo: F });
        p.sph(1, 0, -0.103, 0.008, C.chiaro, { s: [0.031, 0.022, 0.038], n: 8, filo: F });
      }
    });
    return n;
  });

  // ---- la coda: segmenti in fila, ognuno appeso alla fine del precedente
  const coda = [];
  for (let i = 0, par = bac; i < D.nodi; i++) {
    const n = i ? nodo(par, 0, 0, -D.nodo) : nodo(par, 0, D.coda[0], D.coda[1]);
    const ultimo = i === D.nodi - 1;
    pezzo(n, (p) => {
      const r = (cane ? 0.03 : 0.0165) - i * (cane ? 0.006 : 0.0012);
      // Il gatto ha la punta scura; il cane la punta bianca.
      const tinta = cane ? (ultimo ? C.pelo : C.macchia) : ultimo ? C.scuro : C.pelo;
      p.cap(r, D.nodo - r, 0, 0, -D.nodo / 2, tinta, { rx: Math.PI / 2, n: 6, filo: F * (cane ? 0.9 : 0.8) });
    });
    coda.push(n);
    par = n;
  }
  return { D, g, bac, dor, col, tes, occhi, orecchie, gambe, coda, groppa, petto, meshes };
}
/** Il toro del collare: tenuto per numeri come le altre forme del kit, che pero' non ne ha uno cosi' sottile. */
const tori = new Map();
function TORO(R, r) {
  const k = R + '|' + r;
  if (!tori.has(k)) tori.set(k, new THREE.TorusGeometry(R, r, 6, 14));
  return tori.get(k);
}

/**
 * Un corpo. `mat` e' il materiale a tinte piatte degli animali: e' loro, e la
 * stanza che si rimonta non lo butta.
 */
export function corpo(tipo, mat) {
  const S = monta(tipo, mat);
  const { D, g } = S;
  const cane = tipo === 'cane';
  const P = POSE[tipo];
  /** La posa a cui si va, quella dove si e', e i tremiti (a cui si arriva di scatto). */
  const meta = {};
  const ora = {};
  const scossa = {};
  const svelta = {};
  base(ora, D, cane);
  for (const k of CHIAVI) svelta[k] = 0;
  /** Quello che il corpo si ricorda da un fotogramma all'altro: il passo, dov'era, e i suoi orologi. */
  const B = { fase: Math.random() * TAU, amp: 0, trotto: 0, x: null, y: 0, a: 0, coda: 0, fiato: Math.random() * TAU, ciglia: 2 + Math.random() * 4, scatto: 3 + Math.random() * 4, quale: 0 };
  const v3 = new THREE.Vector3();

  return {
    g,
    tipo,
    meshes: S.meshes.length,
    triangoli: S.meshes.reduce((n, m) => n + m.geometry.index.count / 3, 0),
    /**
     * Mette il corpo dov'e' l'animale `A` della testa, nella sua posa. `dt` i secondi
     * dall'ultima volta; `fermo` (animazioni ridotte): la posa subito, e niente che si muova da solo.
     */
    metti(A, dt, fermo) {
      g.position.set(A.x, A.z, A.y);
      g.rotation.y = A.a;

      // --- quanta strada ha fatto: e' quella a muovere le zampe, non l'orologio.
      //     Anche girarsi sul posto e' strada, per le zampe: mezzo corpo di raggio.
      // In metri del corpo, che e' ingrandito: e' la sua gamba a dover fare il passo.
      const M_ = U * D.scala;
      let strada = 0;
      if (B.x != null) {
        const d = Math.hypot(A.x - B.x, A.y - B.y) / M_;
        // Piu' di un passo intero in un fotogramma non e' camminare: e' la stanza che si e' rimontata.
        strada = (d > 0.25 ? 0 : d) + Math.abs(corto(B.a, A.a)) * D.L * 0.5;
      }
      B.x = A.x;
      B.y = A.y;
      B.a = A.a;
      const vel = strada / Math.max(dt, 1e-3);
      const cammina = PASSO[A.stato] && vel > 0.03 && !fermo;
      B.amp += ((cammina ? 1 : 0) - B.amp) * Math.min(1, dt * 9);
      B.trotto += (smooth(D.passo[2] * 1.2, D.passo[3] * 0.85, vel) - B.trotto) * Math.min(1, dt * 6);
      const falcata = lerp(D.passo[0], D.passo[1], B.trotto);
      B.fase += (TAU * strada) / falcata;

      // --- la posa di questo stato
      base(meta, D, cane);
      for (const k of CHIAVI) scossa[k] = 0;
      (P[A.stato] || P.fermo)(meta, scossa, A.s, A, D, B);

      // --- dove guarda: il collo fa un terzo del giro, la testa il resto
      if (A.guarda && meta.vede > 0) {
        const gx = A.guarda.x - A.x;
        const gy = A.guarda.y - A.y;
        const gira = clamp(corto(A.a, Math.atan2(gx, gy)), -1.05, 1.05) * meta.vede;
        const su = clamp(Math.atan2((A.guarda.z || 0) - A.z - (ora.sy + D.collo[0] + D.capo[0]) * M_, Math.hypot(gx, gy) + 1), -0.4, 0.75) * meta.vede;
        meta.colY += gira * 0.38;
        meta.tesY += gira * 0.62;
        meta.tesX += su * 0.9;
      }

      // --- ci si arriva piano; i tremiti di scatto
      const piano = fermo ? 1 : 1 - Math.exp(-dt * (FRETTA[A.stato] || 9));
      const scatto = fermo ? 1 : 1 - Math.exp(-dt * 30);
      for (const k of CHIAVI) {
        ora[k] += (meta[k] - ora[k]) * piano;
        svelta[k] += ((fermo ? 0 : scossa[k]) - svelta[k]) * scatto;
      }
      const q = (k) => ora[k] + svelta[k];

      // --- quello che e' vivo da solo: il fiato, le ciglia, la coda, le orecchie
      const viv = fermo ? 0 : 1;
      B.fiato += dt * (A.stato === 'dorme' ? 1.7 : 3.1);
      const fiato = q('fiato') * Math.sin(B.fiato) * viv;
      B.ciglia -= dt;
      if (B.ciglia < -0.13) B.ciglia = 2 + Math.random() * 4.5;
      const occhi = fermo ? q('occhi') : q('occhi') * (B.ciglia < 0 ? 0.08 : 1);
      // La coda: il cane scodinzola tanto piu' in fretta quanto piu' forte; al gatto ondeggia la punta.
      const scod = q('scod');
      B.coda += dt * TAU * (cane ? lerp(2, 5.2, clamp(scod * 1.3)) : 0.45);
      const onda = Math.sin(B.coda) * viv;
      // Un orecchio che scatta, ogni tanto (il gatto anche nel sonno, piu' di rado).
      B.scatto -= dt;
      if (B.scatto < -0.16) (B.scatto = (A.stato === 'dorme' ? 6 : 2.5) + Math.random() * 5), (B.quale = Math.random() < 0.5 ? 0 : 1);
      const guizzo = B.scatto < 0 && !fermo ? 1 : 0;

      // --- il passo
      const passo = Math.sin(B.fase);
      const dondola = B.amp * (1 - B.trotto * 0.5);
      const molleggio = B.amp * lerp(0.004, 0.013, B.trotto) * Math.abs(Math.cos(B.fase + (B.trotto > 0.5 ? 0 : 0.6)));
      const hy = q('hy') + q('su') - molleggio;
      const sy = q('sy') + q('su') - molleggio * 0.8;

      // --- sui perni
      const beta = Math.asin(clamp((sy - hy) / D.L, -0.92, 0.92));
      const piega = q('piega') + 0.07 * dondola * passo;
      const arco = q('arco');
      S.bac.position.set(0, hy, (-D.L / 2) * Math.cos(beta) + q('dz'));
      S.bac.rotation.set(-beta, -piega / 2, q('rollio') + 0.035 * dondola * passo);
      S.dor.rotation.set(-arco, piega, 0);
      // Il collo e la testa si contano dal mondo, non dalla schiena: seduto, col
      // corpo a quarantacinque gradi, la testa resta dritta.
      const colX = q('colX') + 0.04 * dondola * Math.cos(B.fase * 2);
      S.col.rotation.set(-colX + beta + arco, q('colY'), 0);
      S.tes.rotation.set(-q('tesX') + colX, q('tesY'), q('tesZ'));
      S.occhi.scale.y = Math.max(0.06, occhi);
      const largo = 1 + 0.14 * q('schiaccia') + fiato;
      const alto = 1 - 0.1 * q('schiaccia') + fiato * 1.6;
      S.groppa.scale.set(largo, alto, 1);
      S.petto.scale.set(largo, alto, 1);

      // Le zampe. A terra il piede va indietro dritto e alla velocita' del corpo,
      // poi torna avanti alzato: l'angolo e la lunghezza si ricavano da dove deve
      // stare il piede, cosi' in appoggio non si stacca e non scivola.
      const carico = lerp(0.62, 0.45, B.trotto);
      const orma = falcata * carico;
      const alza = lerp(D.alza[0], D.alza[1], B.trotto);
      const sfasa = [lerp(0.25, 0.5, B.trotto), lerp(0.75, 1, B.trotto), 0, 0.5];
      for (let k = 0; k < 4; k++) {
        let ang = q('g' + k);
        let lun = q('l' + k);
        if (B.amp > 0.01) {
          const u = (((B.fase / TAU + sfasa[k]) % 1) + 1) % 1;
          const h = (k < 2 ? sy : hy) - q('su');
          const vola = u >= carico;
          const w = vola ? (u - carico) / (1 - carico) : 0;
          const fx = orma * (vola ? ease(w) - 0.5 : 0.5 - u / carico);
          const fy = vola ? alza * Math.sin(Math.PI * w) : 0;
          ang = lerp(ang, Math.atan2(fx, h - fy), B.amp);
          lun = lerp(lun, Math.hypot(fx, h - fy) / D.gamba, B.amp);
        }
        const z = S.gambe[k];
        z.rotation.set(-ang + beta + (k < 2 ? arco : 0), 0, (k % 2 ? -1 : 1) * q('o' + k));
        z.scale.y = Math.max(0.2, lun);
      }

      // La coda: la base si conta dal mondo come la testa; ogni nodo aggiunge il suo
      // ricciolo, e lo scodinzolio arriva in punta un attimo dopo che alla base.
      const punta = q('punta') * onda;
      S.coda.forEach((n, i) => {
        const ritardo = Math.sin(B.coda - i * 0.7) * viv;
        if (!i) n.rotation.set(q('c0') + beta + 0.05 * dondola * Math.cos(B.fase * 2), -q('cy') + scod * ritardo * 0.6 + 0.1 * dondola * passo, 0);
        // La punta che batte e' la punta: gli ultimi due nodi, non tutta la coda.
        else n.rotation.set(q('c1'), -q('cyy') + scod * ritardo * 0.5 + punta * 0.3 * Math.max(0, i - (D.nodi - 3)), 0);
      });

      // Le orecchie: quelle del gatto si girano e scattano, quelle del cane pendono e sbattono col trotto.
      S.orecchie.forEach((n, i) => {
        const k = i ? -1 : 1;
        const lancio = guizzo && B.quale === i ? 1 : 0;
        if (cane) n.rotation.set(-q('orX') * 0.6, 0, k * (q('orZ') + 0.22 * B.amp * B.trotto * Math.abs(passo) + 0.4 * clamp(svelta.su / 0.07) + 0.25 * lancio));
        else n.rotation.set(-q('orX') + 0.5 * lancio, k * 0.35 * lancio, -k * q('orZ'));
      });
    },
    /** Dov'e' la testa adesso, in pianta: [x, y, z] in unita' di stanza, z in alto. */
    capo() {
      g.updateWorldMatrix(true, true);
      S.tes.getWorldPosition(v3);
      return [v3.x, v3.z, v3.y];
    },
    via() {
      for (const m of S.meshes) m.geometry.dispose();
    },
  };
}
