/* Claude Studio — l'ufficio in 3D: i mobili a tratto.
 *
 * I mobili della stanza ridisegnati nello stile illustrato (vedi «A TRATTO» in
 * kit.js). `mobili(K, B)` li costruisce e torna i nomi (`m.s`) di quelli che ha
 * fatto: props.js quelli non li rifa'. Ognuno sta dove sta nella stanza piatta —
 * la pianta e' `K.R` — e lascia in `B` quello che lo specchio ci cerca.
 *
 * Della pianta si tengono il posto e la larghezza, che sono quelli del ritaglio
 * piatto; l'altezza e la profondita' sono di qui, in metri, con le proporzioni
 * dell'anteprima approvata: una persona e' alta un metro e quaranta, uno scaffale
 * uno e settantacinque.
 *
 * Quanto costa: tutto quello che sta fermo finisce nel lotto della stanza
 * (`K.qui`), che e' una mesh sola. Di chiamate in piu' ci sono le foglie (tutte
 * le foglie di tutte le piante sono una mesh a istanze, e dondolano spostando le
 * istanze), le gocce e la spia (un'altra), l'acqua della fontanella, e i pezzi che
 * lo specchio accende e spegne: i portatili e quello che succede al bar.
 *
 * Il bar fa la sua parte: le tazze sulla rastrelliera sono tazze vere, la macchina
 * versa e il lavandino lava. I pezzi stanno in `B.bar`, e a dire quando si vedono
 * e' lo specchio — qui si costruiscono, si mettono al loro posto e si muovono
 * finche' sono accesi.
 */
import { THREE, G, Tratto, qui, mtx, senzaFilo, TAU, U, SEDILE_M, PIANO_M, clamp, rnd, hash } from './kit.js';

/** La faccia del muro di fondo, in unita' di stanza: i mobili alti ci stanno appoggiati. */
const MURO = 16;
/** Quanto e' profondo il piano di un tavolo, in unita': il ritaglio e' piu' alto perche' se ne vede anche il fianco. */
const FONDO_TAVOLO = 14;
/** A quanto dal bordo del tavolo sta il centro di uno sgabello: il sedile sfiora il piano, e le mani ci arrivano. */
const SOTTO = 8;
/** Le tazze sono un filo piu' grandi del vero: a questa distanza una tazza vera e' sei pixel. */
const TAZZA = 1.2;
/** Quanti punti tondi si muovono al massimo: le gocce della fontanella e la spia. */
const PUNTI = 36;

/** Le sei piante della stanza piatta, e che sagoma ha ognuna. */
const PIANTE = { vasoAloe: 'aloe', vasoFiori: 'fiori', plantPurple: 'cespo', plantBlue: 'cespo', vasoFoglie: 'alta', vasoErba: 'erba' };

// I profili che si fanno girare: scritti una volta, cosi' la forma si calcola una volta.
const VASO = [[0, 0], [0.13, 0], [0.17, 0.26], [0.19, 0.3], [0.15, 0.3], [0, 0.28]];
const COCCIO = [[0, 0], [0.034, 0], [0.043, 0.012], [0.046, 0.09], [0, 0.09]];
const BARATTOLO = [[0, 0], [0.07, 0], [0.085, 0.03], [0.085, 0.15], [0.055, 0.18], [0.055, 0.2], [0, 0.2]];
const GAMBA = [[0, 0], [0.16, 0], [0.17, 0.02], [0.06, 0.06], [0.045, 0.24], [0, 0.24]];
const SECCHIO = [[0, 0], [0.125, 0], [0.135, 0.02], [0.165, 0.33], [0.175, 0.36], [0.15, 0.36], [0.125, 0.06], [0, 0.06]];
const VASCA = [[0, 0], [0.15, 0], [0.2, 0.025], [0.215, 0.1], [0.205, 0.115], [0.19, 0.105], [0.175, 0.04], [0, 0.035]];
const CATINO = [[0, 0], [0.25, 0], [0.3, 0.04], [0.31, 0.2], [0.29, 0.25], [0.262, 0.24], [0.245, 0.16], [0, 0.16]];
const FUSTO = [[0, 0.16], [0.085, 0.16], [0.055, 0.25], [0.045, 0.5], [0.07, 0.56], [0, 0.56]];
const COPPA = [[0, 0.54], [0.06, 0.54], [0.155, 0.61], [0.175, 0.675], [0.15, 0.675], [0.13, 0.635], [0, 0.635]];
const PIGNA = [[0, 0.635], [0.035, 0.635], [0.024, 0.7], [0.035, 0.735], [0, 0.75]];

const _a = new THREE.Color();
const _b = new THREE.Color();
const _m = new THREE.Matrix4();
const _r = new THREE.Matrix4();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();
const NIENTE = new THREE.Matrix4().makeScale(0, 0, 0);
/** Una tinta a meta' strada fra due: per quelle a cui la tavolozza non da' un nome. */
const fra = (a, b, k) => '#' + _a.set(a).lerp(_b.set(b), k).getHexString();

export function mobili(K, B) {
  const { C, S, R } = K;
  const SV = R.SV;
  const fatti = new Set();
  /** Tutte le foglie di tutte le piante: diventano una mesh sola, alla fine. */
  const foglie = [];
  /** Chi mette punti tondi che si muovono: `(t, punto) => {}`, una volta a fotogramma. */
  const accesi = [];
  /** Quello che fa luce da se' e sta fermo — l'acqua: un lotto suo, senza ombre e senza toni. */
  const lumi = new Tratto(U);
  /** La pallina di tutto quello che e' tondo e si muove: gocce, spia, sbuffi di vapore. */
  const tondo = new THREE.IcosahedronGeometry(1, 1);
  // Quello che la tavolozza non ha: il caffe' e' la terra dei vasi, il dentro di una
  // tazza pulita la sua ceramica in ombra, e quello di una sporca le due cose insieme.
  const caffe = C.soil;
  const pulita = fra(C.cream, C.chairLo, 0.22);
  const sporca = fra(C.cream, C.soil, 0.55);
  B.bar = { tazze: [], macchina: null, lavandino: null };

  /* Ognuno dice anche dove va a finire, sulla sua faccia, una cosa che nella stanza
     piatta gli sta appesa sopra — un foglietto, una busta, la luce della dispensa.
     `fz` porta da «quanti pixel sopra il bordo di sotto del ritaglio» all'altezza
     vera, in unita': i ritagli sono disegnati alti perche' si vede anche il sopra, e
     la proporzione non e' la stessa per tutti. */
  const appeso = (m, h2, yf, fz) => B.appesi.push({ x0: m.x, x1: m.x + (m.w || SV[m.s].w), y0: m.b - h2, b: m.b, yf, fz });
  const largo = (m) => (m.w || SV[m.s].w) / U;
  /** Una penna piantata contro il muro di fondo, a meta' del mobile. */
  const alMuro = (m) => K.qui(m.x + (m.w || SV[m.s].w) / 2, MURO);
  /** Un pezzo che si muove, messo dove la penna `q` ha il punto (x, y, z). Fuori dal giro delle ombre: sono cose piccole. */
  const pezzo = (q, x, y, z, fn) => {
    const g = K.parte(fn, false);
    g.position.set(x, y, z).applyMatrix4(q.m);
    K.radice.add(g);
    return g;
  };
  /** Un punto della penna `q` in pianta: x, y e l'altezza, in unita' di stanza. */
  const inPianta = (q, x, y, z) => {
    _v.set(x, y, z).applyMatrix4(q.m);
    return { x: _v.x, y: _v.z, z: _v.y };
  };

  // =====================================================================
  //  le cose piccole che tornano: tazze, libri, piante
  // =====================================================================
  /** Una tazza, il manico a destra. `dentro` e' quello che ci si vede guardandola da sopra. */
  function tazza(q, c, dentro) {
    q.lathe(COCCIO, 0, 0, 0, c, { n: 10, filo: 0.008 });
    q.put(G.torus(0.024, 0.008, TAU, 8), c, 0.05, 0.048, 0, { filo: 0.006 });
    q.cyl(0.037, 0.037, 0.004, 0, 0.088, 0, dentro, { filo: 0, n: 10 });
    // Quella da lavare ha il segno del caffe' sotto l'orlo: da fuori e' l'unica cosa che la distingue.
    if (dentro === sporca) q.cyl(0.0468, 0.0462, 0.014, 0, 0.066, 0, sporca, { filo: 0, n: 10 });
  }
  /** Una tazza che lo specchio accende e spegne: un pezzo suo, girata di `ry` e piegata di `rx`. */
  function tazzaVera(q, x, y, z, dentro, ry = 0, rx = 0) {
    const g = pezzo(q, x, y, z, (p) => tazza(p.at(0, 0, 0, ry, rx), C.cream, dentro));
    g.scale.multiplyScalar(TAZZA);
    return g;
  }
  /** Un libro, o un faldone: un cubo solo stirato, cosi' cento dorsi sono una forma. */
  const libro = (q, w, h, d, x, y, z, c, o) => q.put(G.cube(1, 1, 1), c, x, y + h / 2, z, { filo: 0.007, ...o, s: [w, h, d] });
  const barattolo = (q, x, y, z, c) => {
    q.lathe(BARATTOLO, x, y, z, c, { n: 10, filo: 0.008 });
    q.cyl(0.058, 0.062, 0.035, x, y + 0.19, z, C.cream, { n: 10, filo: 0.007 });
  };
  /** Una pila di piattini. */
  const piattini = (q, quanti, r, x, y, z) => {
    for (let k = 0; k < quanti; k++) q.cyl(r, r - 0.012, 0.02, x, y + k * 0.02, z, k % 2 ? C.jarHi : C.cream, { n: 10, filo: 0.006 });
  };

  /* Una pianta: il vaso va nel lotto, e ogni foglia e' un'istanza che dondola. Sei
     sagome per sei piante, come nella stanza piatta: due cespugli uguali in due
     angoli si leggono come lo stesso ritaglio messo due volte. */
  function pianta(q, tipo, seme, vaso, k = 1) {
    q.lathe(VASO, 0, 0, 0, vaso, { n: 14, s: [k, k, k] });
    q.disc(0.15, 0.02, 0, 0.275 * k, 0, C.soil, { filo: 0, n: 12, s: [k, 1, k] });
    const cima = q.at(0, 0.29 * k, 0);
    const r = (...a) => rnd('foglia', seme, ...a);
    const f = (giro, piega, lunga, larga, col, y = 0, punta = 0) =>
      foglie.push({ m: cima.m.clone().multiply(mtx(0, y, 0, 0, giro, 0)), piega, lunga, larga, col, punta, fase: r('f', foglie.length) * TAU, k: 2 + (foglie.length % 2) });
    const V = C.verde;
    if (tipo === 'cespo') for (let i = 0; i < 10; i++) f(i * 2.4 + seme, 0.2 + 0.85 * r('p', i), (0.34 + 0.2 * r('l', i)) * k, 1, V[i % 4]);
    if (tipo === 'alta') {
      // Un fusto, e le foglie che gli salgono attorno: e' la sola che ha un tronco.
      cima.cap(0.024, 0.86, 0, 0.42 * k, 0, C.leaf, { filo: 0.008, s: [k, k, k] });
      for (let i = 0; i < 10; i++) f(i * 2.4 + seme, 0.8 + 0.45 * r('p', i), (0.38 + 0.14 * r('l', i)) * k, 1.2, V[(i + 1) % 4], (0.2 + i * 0.075) * k);
      f(seme, 0.12, 0.42 * k, 1.1, V[3], 0.84 * k);
      f(seme + 2.5, 0.42, 0.36 * k, 1.1, V[2], 0.84 * k);
    }
    if (tipo === 'lingua') for (let i = 0; i < 7; i++) f(i * 2.4 + seme, 0.06 + 0.3 * r('p', i), (0.5 + 0.42 * r('l', i)) * k, 0.62, V[i % 3]);
    // L'aloe: poche lame grasse, aperte a rosa. L'erba: tante, sottili e dritte.
    if (tipo === 'aloe') for (let i = 0; i < 8; i++) f(i * 2.4 + seme, i < 2 ? 0.12 : 0.3 + 0.5 * r('p', i), (0.5 - 0.025 * i + 0.1 * r('l', i)) * k, 0.72, V[(i + 1) % 3]);
    if (tipo === 'erba') for (let i = 0; i < 12; i++) f(i * 2.4 + seme, 0.04 + 0.34 * r('p', i), (0.46 + 0.4 * r('l', i)) * k, 0.3, V[1 + (i % 3)]);
    if (tipo === 'fiori') {
      for (let i = 0; i < 6; i++) f(i * 2.4 + seme, 0.5 + 0.5 * r('p', i), 0.22 * k, 1.05, V[1 + (i % 3)]);
      // Tre steli, e in punta a ognuno il suo fiore: gira e si piega con lo stelo.
      for (let i = 0; i < 3; i++) {
        f(i * 2.1 + seme, 0.1 + 0.2 * i, 0.34 * k, 0.25, V[0]);
        f(i * 2.1 + seme, 0.1 + 0.2 * i, 0.07 * k, 2.4, i === 1 ? fra(C.fiore, C.cream, 0.6) : C.fiore, 0, 0.34 * k);
      }
    }
  }

  // =====================================================================
  //  i mobili contro il muro di fondo
  // =====================================================================
  /** Una scaffalatura con le assi vere: quello che ci sta sopra prende l'ombra dell'asse di sopra. `ys`: dove si appoggia la roba. */
  function scaffali(q, w, h, d, ys) {
    q.cube(w - 0.04, h - 0.04, 0.03, 0, 0.02, 0.035, C.woodLo, { filo: 0 });
    for (const s of [-1, 1]) q.box(0.06, h, d, s * (w / 2 - 0.03), 0, d / 2 + 0.02, C.wood, { r: 0.02 });
    q.box(w + 0.04, 0.07, d + 0.03, 0, h - 0.04, d / 2 + 0.02, C.woodTop, { r: 0.025 });
    q.box(w, ys[0], d, 0, 0, d / 2 + 0.02, C.woodLo, { r: 0.02 });
    ys.slice(1).forEach((y) => q.cube(w - 0.1, 0.04, d - 0.02, 0, y - 0.04, d / 2 + 0.02, C.woodTop, { filo: 0.007 }));
  }

  /** L'archivio: quattro ripiani di faldoni, qualcuno storto nel buco di quello che manca. */
  function libreria(m) {
    const q = alMuro(m);
    const w = largo(m);
    const ys = [0.1, 0.5, 0.92, 1.32];
    scaffali(q, w, 1.75, 0.4, ys);
    ys.forEach((y, j) => {
      let x = 0.09 - w / 2;
      for (let i = 0; x < w / 2 - 0.19; i++) {
        const bw = 0.055 + 0.05 * rnd('bw', j, i);
        const bh = 0.22 + 0.12 * rnd('bh', j, i);
        const c = C.faldoni[hash('bc', j, i) % C.faldoni.length];
        if ((i + j * 2) % 7 === 5) {
          x += 0.1;
          libro(q, bw, bh, 0.24, x + 0.02, y + 0.01, 0.24, c, { rz: 0.3 });
          x += bw + 0.03;
        } else {
          libro(q, bw, bh, 0.24, x + bw / 2, y, 0.24, c);
          x += bw + 0.006;
        }
      }
    });
    pianta(q.at(0.2, 1.78, 0.22), 'cespo', 4, C.vasi[4 % C.vasi.length], 0.5);
    appeso(m, SV[m.s].h, MURO + 0.26 * U, (dy) => 1.3 * dy);
  }

  /** Dove si appoggia la roba nella dispensa e nella rastrelliera, che sono lo stesso mobile: in metri da terra. */
  const RIPIANI = [0.1, 0.56, 1.02];
  /** La dispensa: barattoli, una scatola, qualche latta. */
  function dispensa(m) {
    const q = alMuro(m);
    const w = largo(m);
    const ys = RIPIANI;
    scaffali(q, w, 1.5, 0.38, ys);
    [-0.27, 0, 0.27].forEach((x, i) => barattolo(q, x, ys[2], 0.22, i === 1 ? C.jarHi : C.jar));
    [-0.27, -0.06].forEach((x, i) => barattolo(q, x, ys[1], 0.22, i ? C.jar : C.jarHi));
    [0, 1, 2].forEach((k) => libro(q, 0.26, 0.07, 0.24, 0.24, ys[1] + k * 0.07, 0.22, C.faldoni[(k * 2) % C.faldoni.length], { ry: 0.15 * k - 0.1 }));
    q.box(0.36, 0.24, 0.26, -0.2, ys[0], 0.22, C.cream, { r: 0.03 });
    [0.12, 0.31].forEach((x, i) => libro(q, 0.16, 0.26 + i * 0.05, 0.26, x, ys[0], 0.22, C.faldoni[(i + 3) % C.faldoni.length]));
    pianta(q.at(-0.22, 1.53, 0.2), 'lingua', 2, C.vasi[1 % C.vasi.length], 0.5);
    appeso(m, SV[m.s].h, MURO + 0.22 * U, (dy) => 1.38 * dy + 0.24);
  }

  /* La rastrelliera: gli stessi ripiani, vuoti apposta. Le tazze che ci stanno sono
     quelle che ci sono davvero — quattro pezzi, e lo specchio ne fa vedere quante ne
     conta la stanza piatta. Stanno dove le mette lei (SCAFFALI0 in room.js: due per
     ripiano, a 4 e a 13 dal bordo sinistro del ritaglio, coi piedi a 22 e a 12 sopra
     il suo bordo di sotto), e `fz` porta quelle due righe sui due ripiani di sopra. */
  function rastrelliera(m) {
    const q = alMuro(m);
    const w = largo(m);
    const ys = RIPIANI;
    scaffali(q, w, 1.5, 0.38, ys);
    // Sotto, i piattini e una latta: roba che non si conta.
    piattini(q, 4, 0.085, 0.2, ys[0], 0.22);
    q.box(0.3, 0.2, 0.24, -0.2, ys[0], 0.22, C.jar, { r: 0.03 });
    const fz = (dy) => 1.38 * dy + 0.24;
    for (const [dy, dx] of [[22, 6.5], [22, 15.5], [12, 6.5], [12, 15.5]]) {
      B.bar.tazze.push(tazzaVera(q, dx / U - w / 2, fz(dy) / U, 0.22, pulita, 0.5));
    }
    appeso(m, SV[m.s].h, MURO + 0.22 * U, fz);
  }

  function armadio(m) {
    const q = alMuro(m);
    const w = largo(m);
    q.box(w, 1.05, 0.42, 0, 0.06, 0.23, C.wood, { r: 0.04 });
    q.box(w + 0.05, 0.06, 0.47, 0, 1.09, 0.23, C.woodTop, { r: 0.022 });
    for (const s of [-1, 1]) {
      q.box(w / 2 - 0.055, 0.9, 0.03, s * (w / 4 - 0.012), 0.13, 0.445, C.woodTop, { r: 0.02, filo: 0.007 });
      q.sph(0.028, s * 0.06, 0.62, 0.47, C.cream, { filo: 0.006, n: 10 });
      q.box(0.09, 0.07, 0.09, s * (w / 2 - 0.095), 0, 0.23, C.woodLo, { r: 0.02, filo: 0.008 });
    }
    [0, 1, 2].forEach((k) => libro(q, 0.34, 0.06, 0.26, -0.18, 1.15 + k * 0.06, 0.23, C.faldoni[(k + 1) % C.faldoni.length], { ry: 0.2 - 0.18 * k }));
    pianta(q.at(0.24, 1.15, 0.23), 'fiori', 7, C.vasi[3 % C.vasi.length], 0.55);
    appeso(m, SV[m.s].h, MURO + 0.46 * U + 0.3, (dy) => 0.84 * dy);
  }

  /* La lavagna. Il bottone della bacheca ci si stende sopra (`B.bacheca`) e i
     foglietti ci si appendono: tre righe da quattro, e `fz` le mette nei due terzi
     alti dell'ardesia. Il gesso sta dove i foglietti non arrivano mai — la colonna
     di destra — cosi' una bacheca piena non ci scrive sopra. */
  function bacheca(m) {
    const q = alMuro(m);
    const w = largo(m);
    for (const s of [-1, 1]) {
      q.box(0.06, 1.96, 0.06, s * (w / 2 - 0.13), 0, 0.2, C.wood, { r: 0.02 });
      q.box(0.1, 0.05, 0.38, s * (w / 2 - 0.13), 0, 0.2, C.woodLo, { r: 0.02 });
    }
    q.box(w, 1.06, 0.07, 0, 0.86, 0.23, C.wood, { r: 0.03 });
    q.cube(w - 0.16, 0.9, 0.01, 0, 0.94, 0.266, C.woodDk, { filo: 0 });
    q.box(w - 0.2, 0.03, 0.09, 0, 0.845, 0.29, C.woodTop, { r: 0.012, filo: 0.007 });
    libro(q, 0.1, 0.03, 0.04, -0.3, 0.875, 0.3, C.cream, { filo: 0.006 });
    const gesso = (x0, x1, y) => libro(q, x1 - x0, 0.02, 0.004, (x0 + x1) / 2, y, 0.272, C.cream, { filo: 0 });
    [1.68, 1.52, 1.36].forEach((y, i) => {
      gesso(w / 2 - 0.3, w / 2 - 0.26, y);
      gesso(w / 2 - 0.23, w / 2 - 0.13 - i * 0.02, y);
    });
    gesso(0.14 - w / 2, w / 2 - 0.36, 1.08);
    const yf = MURO + 0.271 * U;
    appeso(m, SV[m.s].h, yf + 0.3, (dy) => dy + 26);
    B.bacheca = { x0: m.x, x1: m.x + SV[m.s].w, z0: 0.86 * U, z1: 1.92 * U, y: yf + 0.1 };
  }

  /* La macchina del caffe', sul suo bancone. Davanti ha quello che serve a leggerla:
     il beccuccio nella nicchia scura, la vaschetta d'acciaio dove si appoggia la
     tazza, il bottone e la spia. La tazza sotto il beccuccio e il getto sono due
     pezzi spenti: li accende lo specchio quando qualcuno il caffe' se lo fa davvero. */
  function macchina(m) {
    const q = alMuro(m);
    const w = largo(m);
    const BANCO = 0.78;
    q.box(w, 0.68, 0.48, 0, 0.04, 0.26, C.wood, { r: 0.04 });
    q.slab(w + 0.05, 0.54, 0.06, 0, BANCO - 0.06, 0.27, C.woodTop, { r: 0.05 });
    for (const s of [-1, 1]) {
      q.box(w / 2 - 0.07, 0.5, 0.025, s * (w / 4 - 0.01), 0.12, 0.5, C.woodTop, { r: 0.02, filo: 0.007 });
      q.sph(0.026, s * 0.06, 0.5, 0.525, C.cream, { filo: 0.006, n: 10 });
    }
    const a = q.at(0, BANCO, 0.25);
    a.box(0.5, 0.46, 0.34, 0, 0, 0, C.mach, { r: 0.07, seg: 2 });
    a.box(0.54, 0.07, 0.38, 0, 0.43, 0, C.cream, { r: 0.03 });
    a.box(0.36, 0.24, 0.03, 0, 0.06, 0.172, C.machLo, { r: 0.03, filo: 0 });
    a.cyl(0.055, 0.045, 0.06, 0, 0.24, 0.185, C.steel, { filo: 0.007, n: 12 });
    a.cyl(0.016, 0.013, 0.04, 0, 0.2, 0.2, C.steel, { filo: 0.006, n: 8 });
    a.box(0.38, 0.035, 0.2, 0, 0, 0.2, C.steel, { r: 0.012, filo: 0.007 });
    a.box(0.19, 0.055, 0.02, -0.11, 0.335, 0.168, C.machHi, { r: 0.01, filo: 0 });
    a.sph(0.026, 0.17, 0.365, 0.178, C.cream, { filo: 0.006, n: 8 });
    // I chicchi e i piattini, ai due lati: un bancone con sopra solo la macchina e' una mensola.
    barattolo(q, 0.335, BANCO, 0.2, caffe);
    piattini(q, 3, 0.07, -0.335, BANCO, 0.34);

    // La spia: un punto che fa luce, e batte piano. Di notte le si vede anche l'alone.
    const spia = new THREE.Vector3(0.07, 0.365, 0.186).applyMatrix4(a.m);
    const [su, giu] = [new THREE.Color(fra(C.spia, C.cream, 0.4)), new THREE.Color(C.spia)];
    accesi.push((t, punto) => punto(spia, 0.022, Math.sin(t * 2.6) > -0.3 ? su : giu));
    if (S.aloni) {
      K.alone([spia.x, spia.z + 0.6, spia.y], [spia.x, spia.z + 0.6, spia.y], 6, C.spia, 0.6 * S.aloni);
      const l = new THREE.PointLight(C.spia, 14, 40, 1.3);
      l.position.set(spia.x, spia.y, spia.z + 5);
      K.radice.add(l);
    }

    // --- quello che succede sotto il beccuccio
    const posto = [0, 0.035, 0.2];
    const sotto = tazzaVera(a, ...posto, caffe, 0.4);
    sotto.visible = false;
    const ALTO = 0.165; // dalla vaschetta alla bocca del beccuccio
    const getto = pezzo(a, ...posto, (p) => p.cyl(0.007, 0.008, ALTO - 0.085, 0, 0.085, 0, caffe, { filo: 0.004, n: 6 }));
    const fumo = new THREE.MeshBasicMaterial({ color: C.steam });
    const sbuffi = [0, 1, 2].map(() => {
      const s = new THREE.Mesh(tondo, fumo);
      getto.add(s);
      return s;
    });
    getto.visible = false;
    const filo = getto.children[0];
    /* Il filo di caffe' trema, e dalla tazza salgono tre sbuffi: ognuno nasce piccolo,
       si gonfia e sparisce prima di scoppiare. Niente che si rifaccia: scale e posti. */
    const versa = (t) => {
      const k = 1 + 0.28 * Math.sin(t * 23) * Math.sin(t * 7.1);
      filo.scale.set(k, 1, k);
      sbuffi.forEach((s, j) => {
        const u = (t * 0.5 + j / 3) % 1;
        s.position.set(0.045 + 0.03 * Math.sin(u * 7 + j * 2), 0.12 + 0.3 * u, 0.03);
        s.scale.setScalar(0.001 + 0.03 * Math.pow(Math.sin(Math.PI * u), 0.8));
      });
    };
    versa(0.4);
    K.anima((t) => getto.visible && versa(t));
    B.bar.macchina = { ...inPianta(a, ...posto), tazza: sotto, getto };
    appeso(m, m.h, MURO + 0.51 * U + 0.3, (dy) => 0.96 * dy);
  }

  /* Il lavandino: un mobiletto con sopra una vasca di ceramica e un rubinetto a collo
     di cigno. La vasca e' larga e bassa apposta — ci stanno due mani e le tazze da
     lavare — e il bordo e' all'altezza del bancone, che e' dove arrivano le mani di
     chi e' alto un metro e quaranta e sta in piedi. L'acqua e le tazze sporche sono
     pezzi spenti, come alla macchina. */
  function lavandino(m) {
    const q = alMuro(m);
    const w = largo(m);
    const SOPRA = 0.66;
    const cz = 0.27;
    q.box(w, 0.6, 0.42, 0, 0.04, 0.23, C.wood, { r: 0.04 });
    q.slab(w + 0.05, 0.47, 0.05, 0, SOPRA - 0.05, 0.24, C.woodTop, { r: 0.05 });
    q.box(w - 0.12, 0.44, 0.025, 0, 0.1, 0.44, C.woodTop, { r: 0.02, filo: 0.007 });
    q.sph(0.026, w / 2 - 0.14, 0.4, 0.465, C.cream, { filo: 0.006, n: 10 });
    q.lathe(VASCA, 0, SOPRA, cz, C.cream, { n: 20, s: [1.2, 1, 0.82] });
    // Il rubinetto: il fusto dietro la vasca, mezzo giro in avanti, e la bocca sopra il centro.
    const BOCCA = 0.925;
    q.cyl(0.028, 0.034, 0.3, 0, SOPRA, 0.055, C.steel, { filo: 0.008, n: 8 });
    q.put(G.torus(0.1, 0.028, Math.PI, 10), C.steel, 0, SOPRA + 0.3, 0.155, { ry: Math.PI / 2, filo: 0.008 });
    q.cyl(0.032, 0.028, 0.04, 0, BOCCA, 0.255, C.steel, { filo: 0.007, n: 8 });
    // Le due manopole, a meta' del fusto: la fredda e la calda.
    for (const s of [-1, 1]) q.sph(0.03, s * 0.062, SOPRA + 0.17, 0.06, s < 0 ? C.jar : C.spia, { filo: 0.006, n: 8 });

    // --- l'acqua che scorre: un filo dalla bocca al fondo, e dove cade una pozza che si allarga
    const fondo = SOPRA + 0.04;
    const acqua = pezzo(q, 0, fondo, 0.255, (p) => p.cyl(0.011, 0.015, BOCCA - fondo, 0, 0, 0, C.acqua[2], { filo: 0.005, ink: C.acqua[0], n: 6 }));
    const pozza = K.parte((p) => p.sph(1, 0, 0.006, 0, C.acqua[1], { s: [0.075, 0.01, 0.06], filo: 0.004, ink: C.acqua[0], n: 8 }), false);
    pozza.scale.setScalar(1);
    acqua.add(pozza);
    acqua.visible = false;
    const filo = acqua.children[0];
    const scorre = (t) => {
      const k = 1 + 0.22 * Math.sin(t * 19) * Math.sin(t * 5.3);
      filo.scale.set(k, 1, k);
      const u = (t * 1.6) % 1;
      pozza.scale.set(0.55 + 0.6 * u, 1, 0.55 + 0.6 * u);
    };
    scorre(0.2);
    K.anima((t) => acqua.visible && scorre(t));
    // --- e le tazze da lavare: due nella vasca ai lati del getto, e le altre due infilate dentro, storte
    const sporche = [
      [-0.125, fondo, cz - 0.02, 2.5, 0],
      [0.13, fondo, cz - 0.01, 0.5, 0],
      [-0.125, fondo + 0.05, cz - 0.02, 1.2, 0.3],
      [0.13, fondo + 0.05, cz - 0.01, 3.6, 0.28],
    ].map(([x, y, z, ry, rx]) => {
      const g = tazzaVera(q, x, y, z, sporca, ry, rx);
      g.visible = false;
      return g;
    });
    B.bar.lavandino = { ...inPianta(q, 0, fondo + 0.035, cz), acqua, sporche };
    appeso(m, m.h, MURO + 0.455 * U + 0.3, (dy) => 0.83 * dy);
  }

  // =====================================================================
  //  quello che sta in mezzo alle stanze
  // =====================================================================
  /** Il tavolo delle riunioni e quello del bar sono lo stesso mobile; cambia cosa c'e' rimasto sopra. */
  function tavolo(m) {
    const w = SV[m.s].w;
    const x = m.x;
    const y = m.b - FONDO_TAVOLO;
    const q = K.qui(x + w / 2, y + FONDO_TAVOLO / 2);
    const lw = w / U;
    const ld = FONDO_TAVOLO / U;
    q.slab(lw, ld, 0.06, 0, PIANO_M - 0.06, 0, C.woodTop, { r: 0.1 });
    for (const s of [-1, 1]) q.box(0.08, PIANO_M - 0.06, ld - 0.12, s * (lw / 2 - 0.2), 0, 0, C.wood, { r: 0.03 });
    q.box(lw - 0.4, 0.07, 0.06, 0, 0.2, 0, C.woodLo, { r: 0.02, filo: 0.007 });
    // Dalla parte del muro, dove nessuno siede e i portatili non arrivano.
    const n = B.tavoli.length;
    if (n % 2) pianta(q.at(0.34, PIANO_M, -0.12), 'cespo', 9, C.vasi[0], 0.36);
    else {
      pianta(q.at(-0.32, PIANO_M, -0.12), 'fiori', 3, C.vasi[2 % C.vasi.length], 0.42);
      libro(q, 0.26, 0.012, 0.16, 0.3, PIANO_M, -0.12, C.carta, { filo: 0.006, ry: 0.25 });
      libro(q, 0.26, 0.012, 0.16, 0.32, PIANO_M + 0.012, -0.125, C.jarHi, { filo: 0.006, ry: 0.08 });
    }
    B.tavoli.push({ x, y, w, d: FONDO_TAVOLO });
  }

  // I portatili hanno tutti lo stesso schermo acceso: una trama sola, senza toni.
  const vetro = new THREE.PlaneGeometry(0.25, 0.155);
  const acceso = new THREE.MeshBasicMaterial({ color: S.schermi.on[0] });
  /** Un portatile aperto. Guarda verso -z, che e' dove siede il suo padrone. */
  function portatile() {
    const PIEGA = 0.3;
    const g = K.parte((p) => {
      p.box(0.3, 0.018, 0.21, 0, 0, 0, C.steel, { r: 0.008, filo: 0.007 });
      p.cube(0.24, 0.003, 0.1, 0, 0.017, -0.02, C.bezel, { filo: 0 });
      p.at(0, 0.014, 0.1, 0, PIEGA).box(0.3, 0.2, 0.014, 0, 0, 0, C.bezel, { r: 0.008, filo: 0.007 });
    }, false);
    const perno = new THREE.Group();
    perno.position.set(0, 0.014, 0.1);
    perno.rotation.x = PIEGA;
    const luce = new THREE.Mesh(vetro, acceso);
    luce.position.set(0, 0.1, -0.0085);
    luce.rotation.y = Math.PI;
    perno.add(luce);
    g.add(perno);
    return g;
  }

  /* Lo sgabello. Nella stanza piatta sta a una spanna dal tavolo, e li' seduti le
     mani non arrivano al piano: qui lo si tira sotto fino a dove ci si lavora
     davvero. Chi sta a capotavola si mette a meta' del lato corto — il piano e'
     profondo quanto un portatile e mezzo, e fuori centro il suo sporgerebbe dal
     bordo. Chi ci si siede guarda il tavolo, e il portatile gli sta davanti. */
  function sgabello(m) {
    const cx = m.x + SV[m.s].w / 2;
    const cy = m.b - 5;
    let v = null;
    for (const t of B.tavoli) {
      const px = clamp(cx, t.x, t.x + t.w);
      const py = clamp(cy, t.y, t.y + t.d);
      const d = Math.hypot(px - cx, py - cy);
      if (d > 0.01 && d < 30 && (!v || d < v.d)) v = { d, t, px, py };
    }
    console.assert(v, '[ufficio 3D] lo sgabello a ' + cx + ', ' + cy + ' non ha un tavolo a cui tirarsi sotto');
    let x = cx;
    let y = cy;
    let ux = 0;
    let uy = 1;
    if (v) {
      const t = v.t;
      const capo = cx < t.x || cx > t.x + t.w;
      ux = capo ? Math.sign(v.px - cx) : 0;
      uy = capo ? 0 : Math.sign(v.py - cy);
      x = capo ? v.px - ux * SOTTO : clamp(cx, t.x + 6, t.x + t.w - 6);
      y = capo ? t.y + t.d / 2 : v.py - uy * SOTTO;
    }
    const a = Math.atan2(ux, uy);
    const q = K.qui(x, y);
    q.lathe(GAMBA, 0, 0, 0, C.woodLo, { n: 12 });
    q.disc(0.19, 0.07, 0, SEDILE_M - 0.095, 0, C.woodTop, { b: 0.025, n: 16 });
    q.disc(0.15, 0.03, 0, SEDILE_M - 0.03, 0, C.woodHi, { b: 0.012, filo: 0, n: 16 });
    // Il portatile: un pezzo suo, e lo accende lo specchio quando nella stanza
    // piatta ce n'e' uno a quel posto.
    const lap = portatile();
    const D = SOTTO + 4.4;
    lap.position.set(x + ux * D, PIANO_M * U, y + uy * D);
    lap.rotation.y = a;
    lap.visible = false;
    K.radice.add(lap);
    B.posti.push({ tipo: 'sgabello', p2: [cx, m.b], x, y, a, lap });
  }

  /** Il cestino: un secchio tondo, col buio dentro, una palla di carta e un foglio che spunta. Due palle uguali erano due occhi. */
  function cestino(m) {
    const q = K.qui(m.x + 6, m.b - 5);
    q.lathe(SECCHIO, 0, 0, 0, C.bezel, { n: 14 });
    q.disc(0.148, 0.01, 0, 0.3, 0, C.off, { filo: 0, n: 14, b: 0.003 });
    q.sph(0.07, -0.045, 0.33, 0.02, C.carta, { filo: 0.007, n: 6 });
    libro(q, 0.15, 0.2, 0.012, 0.06, 0.24, -0.04, C.carta, { rz: -0.35, ry: 0.5 });
  }

  /** Una delle sei piante in vaso: `quale` e' il suo posto nell'elenco, e le da' il vaso. */
  function vaso(m, quale) {
    const w = SV[m.s].w;
    // Il vaso e' largo quanto il suo ritaglio: da li' viene la taglia di tutta la pianta.
    const k = clamp(w / U / 0.42, 0.8, 1.3);
    pianta(K.qui(m.x + w / 2, m.b - 6), PIANTE[m.s], quale * 5 + 1, C.vasi[quale % C.vasi.length], k);
  }

  /* La fontanella in mezzo all'atrio: l'unica cosa che si muove anche a stanza
     vuota. Sedici unita' di ritaglio e non una di piu' — il corridoio non regge un
     ostacolo piu' largo, vedi la nota in room.js — quindi e' stretta e alta: un
     catino, un fusto, una coppa. L'acqua sono due specchi fermi che fanno luce da
     se', due onde che si allargano e sfumano nel colore dell'acqua (niente
     trasparenze), e le gocce: uno zampillo che ricade nella coppa, e sei fili dalla
     coppa al catino. */
  function fontana(m) {
    const cx = m.x + SV[m.s].w / 2;
    const cy = m.b - 6;
    const q = K.qui(cx, cy);
    const [lo, mid, hi] = C.acqua;
    q.lathe(CATINO, 0, 0, 0, C.stone, { n: 24 });
    q.lathe(FUSTO, 0, 0, 0, C.stoneLo, { n: 12 });
    q.lathe(COPPA, 0, 0, 0, C.stone, { n: 18 });
    q.lathe(PIGNA, 0, 0, 0, C.stoneLo, { n: 8, filo: 0.008 });
    const SOTTO_Y = 0.215;
    const SOPRA_Y = 0.662;
    const a = qui(lumi, cx, cy);
    a.cyl(0.256, 0.256, 0.004, 0, SOTTO_Y, 0, lo, { filo: 0, n: 24 });
    a.cyl(0.142, 0.142, 0.004, 0, SOPRA_Y, 0, mid, { filo: 0, n: 18 });
    const anello = new THREE.RingGeometry(0.78, 1, 24).rotateX(-Math.PI / 2);
    const onde = [0, 1].map(() => {
      const o = new THREE.Mesh(anello, new THREE.MeshBasicMaterial());
      o.position.set(cx, (SOTTO_Y + 0.006) * U, cy);
      K.radice.add(o);
      return o;
    });
    const tinte = [new THREE.Color(hi), new THREE.Color(mid), new THREE.Color(lo)];
    let luce = null;
    if (S.aloni) {
      K.alone([cx, cy, 0.4 * U], [cx, cy, 0.4 * U], 16, mid, 0.42 * S.aloni);
      luce = new THREE.PointLight(mid, 30, 90, 1.3);
      luce.position.set(cx, 0.9 * U, cy);
      K.radice.add(luce);
    }
    const goccia = (punto, x, y, z, r, c) => punto(_v.set(x, y, z).applyMatrix4(q.m), r, c);
    accesi.push((t, punto) => {
      onde.forEach((o, i) => {
        const u = (t * 0.55 + i / 2) % 1;
        o.scale.setScalar((0.04 + 0.2 * u) * U);
        o.material.color.copy(tinte[0]).lerp(tinte[2], u * u);
      });
      goccia(punto, 0, 0.785 + 0.012 * Math.sin(t * 9), 0, 0.024, tinte[0]);
      for (let k = 0; k < 6; k++) {
        const ang = (k * TAU) / 6 + 0.3;
        for (let j = 0; j < 2; j++) {
          const u = (t * 1.2 + j / 2 + k * 0.17) % 1;
          goccia(punto, Math.cos(ang) * 0.11 * u, 0.785 + 0.17 * u - 0.29 * u * u, Math.sin(ang) * 0.11 * u, 0.017 - 0.005 * u, tinte[(k + j) % 2]);
        }
        for (let j = 0; j < 2; j++) {
          const u = (t * 1.4 + j / 2 + k * 0.23) % 1;
          const r = 0.178 + 0.035 * u;
          goccia(punto, Math.cos(ang + 0.5) * r, 0.67 - 0.44 * u * u, Math.sin(ang + 0.5) * r, 0.016, tinte[(k + j + 1) % 2]);
        }
      }
      if (luce) luce.intensity = 30 + 4 * Math.sin(TAU * t * 1.5);
    });
  }

  // =====================================================================
  //  si monta
  // =====================================================================
  // I tavoli prima degli sgabelli, che gli si tirano sotto.
  for (const m of R.PROPS) if (m.s === 'meetTable') tavolo(m);
  const FA = { board: bacheca, shelfFull: libreria, shelfJars: dispensa, shelfEmpty: rastrelliera, cabinet: armadio, meetTable: () => {}, stoolRound: sgabello };
  let piante = 0;
  for (const m of R.PROPS) {
    if (FA[m.s]) FA[m.s](m);
    else if (PIANTE[m.s]) vaso(m, piante++);
    else if (m.s.startsWith('fontana')) fontana(m);
    else continue;
    fatti.add(m.s);
  }
  const DIS = { cestino, macchina, lavandino };
  for (const m of R.DISEGNATI) {
    if (!DIS[m.s]) continue;
    DIS[m.s](m);
    fatti.add(m.s);
  }

  // --- quello che fa luce da se'
  if (!lumi.vuoto) K.radice.add(new THREE.Mesh(lumi.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true })));

  /* --- le foglie: una forma sola, col suo contorno dentro, a istanze. Il colore e'
     dell'istanza e si moltiplica anche sul contorno, che cosi' viene di un verde
     scuro e non d'inchiostro. Dondolano di poco, ognuna col suo tempo: si riscrive
     la matrice, la forma non si tocca. */
  if (foglie.length) {
    const L = new Tratto();
    L.add(new THREE.SphereGeometry(1, 6, 4), mtx(0, 0.5, 0, 0, 0, 0, 0.21, 0.5, 0.035), '#ffffff', 0.035, '#5a4a5c');
    const verde = senzaFilo(new THREE.InstancedMesh(L.geometry(), K.toon, foglie.length));
    verde.frustumCulled = false;
    foglie.forEach((f, i) => verde.setColorAt(i, _a.set(f.col)));
    K.radice.add(verde);
    const vento = (t) => {
      foglie.forEach((f, i) => {
        const v = 0.07 * Math.sin(0.63 * f.k * t + f.fase) + 0.03 * Math.sin(4.4 * t + f.fase * 2);
        _m.copy(f.m).multiply(_r.makeRotationX(f.piega + v));
        if (f.punta) _m.multiply(_r.makeTranslation(0, f.punta, 0));
        verde.setMatrixAt(i, _m.scale(_s.set(f.lunga * f.larga, f.lunga, f.lunga)));
      });
      verde.instanceMatrix.needsUpdate = true;
    };
    vento(0);
    K.anima(vento);
  }

  // --- i punti tondi che si muovono: le gocce e la spia, una mesh a istanze
  if (accesi.length) {
    const punti = new THREE.InstancedMesh(tondo, new THREE.MeshBasicMaterial(), PUNTI);
    punti.frustumCulled = false;
    K.radice.add(punti);
    let n = 0;
    const punto = (p, r, c) => {
      if (n >= PUNTI) return;
      punti.setMatrixAt(n, _m.makeScale(r * U, r * U, r * U).setPosition(p));
      punti.setColorAt(n++, c);
    };
    const giro = (t) => {
      n = 0;
      for (const f of accesi) f(t, punto);
      for (let i = n; i < PUNTI; i++) punti.setMatrixAt(i, NIENTE);
      punti.instanceMatrix.needsUpdate = true;
      if (punti.instanceColor) punti.instanceColor.needsUpdate = true;
    };
    giro(0.3);
    K.anima(giro);
  }

  return fatti;
}
