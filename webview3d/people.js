/* Claude Studio — l'ufficio in 3D: le persone.
 *
 * Tonde, con la testa grossa e niente a forma di cubo: una testa con la faccia
 * disegnata, un busto tornito, capsule per braccia e gambe, e un filo d'inchiostro
 * attorno a ogni pezzo (kit.js, «A TRATTO»). E sono le stesse persone della stanza
 * piatta: i tratti escono da `window.NPC.traits(seme)`, lo stesso generatore che
 * disegna lo sprite — pelle, taglio, barba, occhiali, cuffie, stazza, vestito,
 * cravatta, tesserino. Chi passa dal piatto al 3D ritrova la sua gente.
 *
 * Costruita in METRI che guarda verso +z (a sud, verso la camera), dentro un gruppo
 * scalato di U: fuori di qui e' alta una cinquantina di unita' di stanza. Una figura
 * sola fa tutto. Le braccia pendono da due perni, spalla e gomito, e si mettono in
 * posa per PUNTI: dove stanno le mani. Gli angoli li trova lei (due ossa e un
 * triangolo), ed e' quello che tiene le mani sulla tastiera mentre la schiena si
 * appoggia. Le gambe no: sono un tubo solo, dall'anca alla scarpa, senza ginocchio,
 * che gira all'anca e si incurva tutto quando la caviglia le si avvicina; come, lo
 * decide chi la muove (gesti.js), che sa dove la scarpa tocca terra.
 *
 * Qui c'e' il corpo. Cosa fa lo decide gesti.js, e dove sta lo specchio (mirror.js),
 * che lo legge dalla stanza piatta.
 */
import { THREE, Tratto, penna, senzaFilo, G, toon, tazza, TAZZA, U, SEDILE_M, TAU, rnd, clamp } from './kit.js';

/** Le misure del corpo, in metri. In piedi, con la gamba dritta sotto, l'anca sta alta quanto la gamba: dall'anca alla suola. */
export const ANCA = 0.69;
/** Dall'anca alla caviglia, lungo la gamba; e di quanto stanno le due anche a destra e a sinistra del centro del bacino. */
export const CAVIGLIA = 0.62;
export const ANCHE = 0.082;
/**
 * La scarpa: un uovo appeso sotto la caviglia, il tacco poco dietro e la punta molto
 * avanti. `centro` nello spazio della gamba (l'anca e' l'origine, la gamba pende lungo
 * -y, la punta guarda +z) e i tre `raggi`. Di profilo la suola e' un'ellisse, e una
 * gamba senza ginocchio cammina rotolandoci sopra: chi la muove calcola da qui dove
 * tocca terra; chi misura, dove stanno tallone, punta e il punto piu' basso.
 */
export const SCARPA = { centro: [0, 0.055 - ANCA, 0.045], raggi: [0.075, 0.055, 0.125] };
export const OMERO = 0.18;
export const AVAMBRACCIO = 0.2;
export const SPALLA = [0.178, 0.345];
export const COLLO = 0.44;
/** Seduti: la coscia e' appoggiata sul sedile, e la suola arriva giusta a terra. */
export const SEDUTO = SEDILE_M + 0.07;
/** Dall'anca alla cima dei capelli. */
const CIMA = COLLO + 0.46;
/** Quanto e' alta la figura in unita' di stanza, in piedi e seduta: serve a chi le mette addosso il bottone e la targhetta. */
export const ALTA = (ANCA + CIMA) * U;
export const ALTA_SEDUTA = (SEDUTO + CIMA) * U;

const NERO = '#241b14';
const CUFFIE = '#3c4633';
const CREMA = '#f2ede2';

const BIANCO = new THREE.Color('#ffffff');
/** Una tinta color carne: calda (rosso, poi verde, poi blu) e chiara. Pesca, albicocca, avorio, sabbia. */
const carne = (c) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  return r > g && g > b && r - b > 25 && g > 150;
};
const schiarita = (c, k) => '#' + new THREE.Color(c).lerp(BIANCO, k).getHexString();

/** I tratti di npc.js, coi nomi che servono qui. */
function aspetto(seme) {
  const t = window.NPC.traits(seme);
  let [topHi, top, topLo] = t.tessuto.toni;
  /* Una camicia color pesca, albicocca, avorio o sabbia e' — a tinte piatte, vista di
     schiena e da lontano — un torso nudo, di qualunque pelle sia chi la porta: nello
     sprite piatto la separava il disegno, qui e' un volume del colore della carne. Si
     schiarisce verso il bianco finche' si legge come una camicia chiara: resta la sua
     tinta, slavata. (Il bianco e il salvia non sono color carne, e restano com'erano.) */
  if (carne(top)) [topHi, top, topLo] = [schiarita(topHi, 0.75), schiarita(top, 0.62), schiarita(topLo, 0.3)];
  return {
    skin: t.pelle.toni[1],
    skinHi: t.pelle.toni[0],
    hair: t.capelli.toni[1],
    hairLo: t.capelli.toni[2],
    top,
    topHi,
    topLo,
    sotto: t.sotto.toni[1],
    acc: t.accento.toni[1],
    pants: t.pantaloni.toni[1],
    shoes: t.scarpe.toni[1],
    taglio: t.taglio,
    barba: t.barba,
    stoppia: t.stoppia,
    bocca: t.bocca,
    occhiali: t.occhiali,
    cuffie: t.accessorio === 'cuffie',
    badge: t.accessorio === 'badge',
    vestito: t.vestito,
    cravatta: t.cravatta,
    robusta: t.corporatura === 'robusta',
  };
}

/** La testa: il perno e' il collo, la faccia guarda +z. Occhi, sopracciglia e bocca sono pezzi a parte, perche' si muovono. */
function testa(p, o) {
  const s = o.skin;
  const h = o.hair;
  p.sph(0.2, 0, 0.2, 0, s, { s: [1, 0.96, 0.98], n: 14 });
  for (const k of [-1, 1]) p.sph(0.045, k * 0.195, 0.185, 0, s, { s: [0.6, 1, 0.8], filo: 0.01, n: 8 });
  p.sph(0.024, 0, 0.17, 0.197, s, { filo: 0.008, n: 8 });
  const rosa = new THREE.Color(s).lerp(new THREE.Color('#ee5f7c'), 0.38);
  for (const k of [-1, 1]) p.sph(0.036, k * 0.118, 0.135, 0.146, rosa, { s: [1, 0.8, 0.4], filo: 0, n: 8 });

  // I capelli. E' la sagoma che si riconosce da lontano, e la nuca e' quello che si
  // vede di piu': chi lavora da' le spalle alla camera.
  const calotta = (r, dy, dz) => p.sph(r, 0, 0.2 + dy, dz, h, { n: 14 });
  if (o.taglio === 'caschetto') {
    calotta(0.222, 0.04, -0.035);
    p.sph(1, 0, 0.35, 0.11, h, { s: [0.172, 0.062, 0.09], rx: -0.35 });
    for (const k of [-1, 1]) p.sph(1, k * 0.178, 0.12, -0.03, h, { s: [0.075, 0.17, 0.125] });
    p.sph(1, 0, 0.1, -0.13, h, { s: [0.19, 0.19, 0.11] });
  } else if (o.taglio === 'chignon') {
    calotta(0.216, 0.036, -0.032);
    p.sph(0.098, 0, 0.45, -0.09, h, { n: 12 });
    p.sph(1, -0.05, 0.362, 0.1, h, { s: [0.12, 0.05, 0.08], rz: 0.3 });
  } else if (o.taglio === 'ricci') {
    calotta(0.206, 0.03, -0.03);
    for (let i = 0; i < 14; i++) {
      const a = i * 2.4;
      const e = 0.15 + 1.2 * rnd('riccio', i);
      const x = 0.175 * Math.cos(e) * Math.cos(a);
      const y = 0.235 + 0.175 * Math.sin(e);
      const z = -0.03 + 0.175 * Math.cos(e) * Math.sin(a);
      if (z > 0.06 && y < 0.34) continue; // non sulla faccia
      p.sph(0.08 + 0.025 * rnd('r', i), x, y, z, h, { n: 8 });
    }
  } else if (o.taglio === 'coda') {
    calotta(0.214, 0.035, -0.03);
    p.sph(1, 0.02, 0.362, 0.105, h, { s: [0.15, 0.05, 0.085], rz: -0.15 });
    p.sph(0.05, 0, 0.3, -0.225, o.acc, { n: 8 }); // l'elastico
    p.sph(1, 0, 0.17, -0.27, h, { s: [0.07, 0.16, 0.075], rx: -0.25 });
  } else if (o.taglio === 'riga') {
    calotta(0.214, 0.035, -0.03);
    // La scriminatura da una parte: un ciuffo grande pettinato di la', uno piccolo di qua.
    p.sph(1, 0.055, 0.372, 0.09, h, { s: [0.15, 0.058, 0.1], rz: -0.3, ry: -0.2 });
    p.sph(1, -0.125, 0.352, 0.075, h, { s: [0.062, 0.05, 0.085], rz: 0.55 });
    p.cap(0.007, 0.15, -0.078, 0.43, -0.03, o.hairLo, { rx: Math.PI / 2 - 0.22, filo: 0, n: 6 });
  } else if (o.taglio === 'stempiato') {
    // Piu' indietro e piu' bassa: la fronte e' alta, e ai lati restano le tempie.
    calotta(0.207, 0.014, -0.062);
    for (const k of [-1, 1]) p.sph(1, k * 0.168, 0.255, -0.005, h, { s: [0.055, 0.085, 0.11] });
  } else if (o.taglio === 'calvo') {
    // Una corona: dietro le orecchie, la nuca, e il lucido in cima.
    for (const k of [-1, 1]) p.sph(1, k * 0.158, 0.2, -0.085, h, { s: [0.052, 0.085, 0.1] });
    p.sph(1, 0, 0.165, -0.155, h, { s: [0.16, 0.1, 0.07] });
    p.sph(1, -0.055, 0.385, 0.03, o.skinHi, { s: [0.055, 0.012, 0.035], rz: 0.25, filo: 0, n: 8 });
  } else {
    calotta(0.214, 0.035, -0.03);
    p.sph(1, 0.04, 0.395, 0.07, h, { s: [0.13, 0.06, 0.1], rz: -0.2 });
  }

  // La barba: piena e' del colore dei capelli, corta e' una stoppia — la pelle con sotto il pelo.
  if (o.barba === 'piena') p.sph(1, 0, 0.115, 0.045, h, { s: [0.17, 0.12, 0.157] });
  if (o.barba === 'corta') p.sph(1, 0, 0.125, 0.04, o.stoppia, { s: [0.176, 0.105, 0.162], filo: 0.006 });
  if (o.barba === 'piena' || o.barba === 'baffi' || o.barba === 'pizzetto') p.cap(0.017, 0.07, 0, 0.158, 0.2, h, { rz: Math.PI / 2, n: 8, filo: 0.008 });
  if (o.barba === 'pizzetto') p.sph(1, 0, 0.062, 0.168, h, { s: [0.04, 0.045, 0.035], n: 8, filo: 0.008 });

  if (o.occhiali) {
    for (const k of [-1, 1]) {
      p.put(G.torus(0.047, 0.007), NERO, k * 0.08, 0.215, 0.196, { filo: 0 });
      p.cap(0.005, 0.13, k * 0.168, 0.222, 0.105, NERO, { rx: Math.PI / 2, ry: k * -0.3, filo: 0, n: 5 });
    }
    p.cube(0.07, 0.01, 0.008, 0, 0.215, 0.2, NERO, { filo: 0 });
  }
  if (o.cuffie) {
    // L'archetto passa sopra i capelli, qualunque taglio ci sia sotto.
    const r = o.taglio === 'ricci' || o.taglio === 'chignon' ? 0.262 : 0.24;
    p.put(G.torus(r, 0.016, Math.PI, 14), CUFFIE, 0, 0.19, -0.02, { filo: 0.008 });
    for (const k of [-1, 1]) p.sph(1, k * (r - 0.012), 0.185, -0.015, CUFFIE, { s: [0.04, 0.075, 0.062], n: 10 });
    p.cap(0.006, 0.15, -0.2, 0.112, 0.085, CUFFIE, { rx: Math.PI / 2 - 0.55, ry: 0.35, filo: 0, n: 5 });
    p.sph(0.02, -0.165, 0.08, 0.158, '#768a61', { n: 8, filo: 0.006 });
  }
}

/* Il profilo del busto (raggio a ogni quota): serve a sapere dove sta il petto, per
   appoggiarci sopra il colletto, la cravatta, il tesserino. */
const PROFILO = [[0, 0.04], [0.13, 0.04], [0.15, 0.1], [0.155, 0.22], [0.14, 0.32], [0.1, 0.385], [0.055, 0.425], [0, 0.435]];
function petto(y) {
  for (let i = 2; i < PROFILO.length; i++) {
    const [r0, y0] = PROFILO[i - 1];
    const [r1, y1] = PROFILO[i];
    if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0 || 1);
  }
  return 0.05;
}

/** Il busto: il bacino nei pantaloni, il torso nel vestito, il collo — e sopra, quello che dice che vestito e'. */
function busto(p, o, kx, kz) {
  const zf = (y) => petto(y) * 0.82 * kz;
  p.sph(1, 0, 0.01, 0, o.pants, { s: [0.168 * (1 + (kx - 1) * 0.7), 0.115, 0.128 * (1 + (kz - 1) * 0.6)] });
  p.lathe(PROFILO, 0, 0, 0, o.top, { s: [1.12 * kx, 1, 0.82 * kz], n: 14 });
  p.cyl(0.05, 0.055, 0.07, 0, 0.4, 0, o.skin, { filo: 0, n: 10 });
  // Un pezzo steso sul petto: mezzo dentro e mezzo fuori, cosi' segue la curva e il filo lo contorna.
  const su = (w, h, y, x, c, d = 0.018, filo = 0.007) => p.sph(1, x, y, zf(y) - d * 0.35, c, { s: [w, h, d], n: 10, filo });
  const v = o.vestito;
  if (v === 'cardigan') {
    // Aperto davanti sulla camicia di sotto, coi bottoni dell'accento.
    su(0.036, 0.16, 0.225, 0, o.sotto, 0.02);
    for (const y of [0.14, 0.24]) p.sph(0.011, 0.052, y, zf(y) + 0.004, o.acc, { n: 6, filo: 0.005 });
  } else if (v === 'giacca') {
    // La camicia a V fra i risvolti.
    su(0.046, 0.085, 0.3, 0, o.sotto, 0.011);
    for (const k of [-1, 1]) p.box(0.048, 0.15, 0.01, k * 0.06, 0.2, zf(0.27) - 0.003, k < 0 ? o.topHi : o.topLo, { rz: k * 0.42, rx: -0.26, r: 0.005, filo: 0.006 });
  } else if (v === 'maglione') {
    // Il collo a coste.
    p.put(G.torus(0.066, 0.02, TAU, 12), o.topLo, 0, 0.405, 0, { rx: Math.PI / 2, filo: 0.007 });
  } else {
    // Camicia e polo: le due punte del colletto.
    for (const k of [-1, 1]) p.sph(1, k * 0.045, 0.385, zf(0.385) + 0.006, o.topHi, { s: [0.036, 0.026, 0.016], rz: k * -0.5, n: 8, filo: 0.006 });
    if (v === 'polo') p.cube(0.012, 0.07, 0.006, 0, 0.3, zf(0.33), o.topLo, { filo: 0 });
    else if (!o.cravatta) for (const y of [0.13, 0.22, 0.31]) p.sph(0.008, 0, y, zf(y) + 0.002, o.topLo, { n: 6, filo: 0 });
  }
  if (o.cravatta) {
    const lunga = v === 'giacca' ? 0.12 : 0.2;
    p.sph(0.02, 0, 0.375, zf(0.375) + 0.004, o.acc, { n: 8, filo: 0.006 });
    su(0.024, lunga / 2, 0.365 - lunga / 2, 0, o.acc, 0.014, 0.006);
  }
  if (o.badge) {
    // Il cordino dal collo e il tesserino in mezzo al petto.
    for (const k of [-1, 1]) p.cap(0.006, 0.17, k * 0.04, 0.3, zf(0.3) - 0.002, o.acc, { rz: k * 0.27, rx: -0.42, filo: 0, n: 5 });
    p.box(0.075, 0.055, 0.01, 0, 0.165, zf(0.19) + 0.001, CREMA, { r: 0.005, filo: 0.006 });
    p.cube(0.045, 0.008, 0.004, 0, 0.19, zf(0.19) + 0.007, '#8a8272', { filo: 0 });
  }
  // La cintura: senza, la figura e' una tunica.
  p.cyl(0.14, 0.14, 0.028, 0, 0.038, 0, '#2a2119', { s: [1.12 * kx, 1, 0.82 * kz], filo: 0, n: 14 });
}

/* Quello che si tiene in mano. Non sono appesi alla mano ma alla figura: chi li
   regge sa dove sta la mano (gesti.js), e cosi' la stessa tazza puo' stare in mano
   o posata sulla scrivania senza cambiare padrone. Ognuno ha l'origine dove lo si
   appoggia. */
const COSE = {
  /** Una di quelle del bar, la stessa che sta sulla rastrelliera (kit.js): il manico verso +x. */
  tazza(p) {
    tazza(p, CREMA, '#5a3520');
  },
  /** Le altre, per chi ne riporta piu' d'una dopo averle lavate: vuote, infilate una nell'altra, ognuna un po' girata. */
  tazza2: (p) => tazza(p.at(0, 0.034, 0, 0.9), CREMA, '#d8d2c6'),
  tazza3: (p) => tazza(p.at(0, 0.068, 0, 2.1), CREMA, '#d8d2c6'),
  tazza4: (p) => tazza(p.at(0, 0.102, 0, 3.4), CREMA, '#d8d2c6'),
  foglio(p) {
    p.cube(0.12, 0.006, 0.15, 0, 0, 0, '#9ecbf0', { filo: 0.006 });
    for (const z of [-0.04, -0.01, 0.02]) p.cube(0.08, 0.002, 0.008, -0.005, 0.006, z, '#5f93c4', { filo: 0 });
  },
  faldone(p) {
    p.box(0.07, 0.26, 0.2, 0, 0, 0, '#2f4f7a', { r: 0.012 });
    p.cube(0.074, 0.07, 0.1, 0, 0.1, 0, CREMA, { filo: 0 });
  },
  /** Aperto, le pagine in su: il dorso corre lungo z. */
  libro(p, o) {
    for (const k of [-1, 1]) {
      p.cube(0.142, 0.012, 0.21, k * 0.069, -0.005, 0, o.acc, { rz: k * 0.2, filo: 0.007 });
      p.cube(0.13, 0.018, 0.195, k * 0.067, 0.009, 0, '#fff8ea', { rz: k * 0.2, filo: 0.005 });
      for (const z of [-0.06, -0.03, 0, 0.03, 0.06]) p.cube(0.09, 0.002, 0.008, k * 0.069, 0.0265, z, '#b8a890', { rz: k * 0.2, filo: 0 });
    }
  },
  /** Lo schermo in su, il lato lungo lungo z. */
  telefono(p) {
    p.box(0.065, 0.012, 0.125, 0, 0, 0, '#2e2430', { r: 0.005, filo: 0.006 });
    p.cube(0.053, 0.002, 0.105, 0, 0.012, 0, '#9fd8ff', { filo: 0 });
  },
  /** Il becco verso +z. */
  annaffiatoio(p) {
    p.cyl(0.06, 0.065, 0.11, 0, 0, 0, '#9aa7b0', { n: 12 });
    p.cap(0.014, 0.14, 0, 0.085, 0.11, '#9aa7b0', { rx: 0.95, filo: 0.006, n: 6 });
    p.sph(0.026, 0, 0.128, 0.168, '#7d8a93', { s: [1, 0.6, 1], n: 8, filo: 0.006 });
    p.put(G.torus(0.045, 0.01, Math.PI, 10), '#7d8a93', 0, 0.06, -0.06, { ry: Math.PI / 2, rz: -Math.PI / 2, filo: 0.006 });
  },
  /** L'acqua che scende dal becco: l'origine e' in cima. */
  getto(p) {
    p.cap(0.008, 0.2, 0, -0.1, 0, '#5bb7e8', { filo: 0, n: 5 });
    for (const y of [-0.06, -0.15]) p.sph(0.014, 0, y, 0, '#8fd0f2', { filo: 0, n: 6 });
  },
};

/** Le tazze sono un filo piu' grandi del vero, come quelle della stanza. */
const GRANDE = { tazza: TAZZA, tazza2: TAZZA, tazza3: TAZZA, tazza4: TAZZA };

/* La gamba di profilo, dalla caviglia all'anca: un tubo che si stringe verso il basso, con
   un anello a ogni giuntura delle sue ossa (TRATTI pezzi lunghi PEZZO). Sopra finisce
   dentro il bacino, sotto dentro la scarpa: li' e' aperto, tanto non si vede. */
const TRATTI = 4;
const PEZZO = CAVIGLIA / TRATTI;
const GAMBA = [[0.052, -0.615], [0.06, -3 * PEZZO], [0.067, -2 * PEZZO], [0.072, -PEZZO], [0.066, 0.02], [0, 0.05]];

/**
 * Quanto si incurva il tubo perche' dall'anca alla caviglia ci siano `d` metri: e' un arco,
 * TRATTI pezzi dritti girati ognuno di un tratto dell'angolo `φ` (0 dritto), e la corda di
 * quell'arco (`corda`) e' PEZZO·Σ cos. Si cerca φ a meta' (la corda cala sempre, fino a φ = π).
 */
export function corda(f) {
  let s = 0;
  for (let i = 0; i < TRATTI; i++) s += Math.cos(f / 2 - ((i + 0.5) * f) / TRATTI);
  return s * PEZZO;
}
function piega(d) {
  if (d >= CAVIGLIA - 1e-6) return 0;
  let a = 0;
  let b = Math.PI;
  for (let i = 0; i < 22; i++) {
    const m = (a + b) / 2;
    if (corda(m) > d) a = m;
    else b = m;
  }
  return (a + b) / 2;
}

const GIU = new THREE.Vector3(0, -1, 0);
const _n = new THREE.Vector3();
const _p = new THREE.Vector3();
const _su = new THREE.Vector3();
const _gi = new THREE.Vector3();
const _t = new THREE.Vector3();
const _g = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _mt = new THREE.Matrix4();
const _it = new THREE.Matrix4();

/**
 * Due ossa verso un punto: il braccio. `T` e' il bersaglio visto dalla spalla, nello
 * spazio del genitore; `palo` da che parte si piega il gomito. Le ossa pendono lungo
 * -y. Quello che e' troppo lontano si raggiunge a braccio teso; `fine`, se c'e',
 * riceve dove arriva davvero la punta.
 */
function dueOssa(sup, inf, a, b, T, palo, fine) {
  const d0 = T.length() || 1e-6;
  _n.copy(T).multiplyScalar(1 / d0);
  const d = clamp(d0, Math.abs(a - b) + 0.002, a + b - 0.002);
  const cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  _p.copy(palo).addScaledVector(_n, -palo.dot(_n));
  if (_p.lengthSq() < 1e-8) _p.set(_n.y, -_n.x, 0.001);
  _p.normalize();
  _su.copy(_n).multiplyScalar(cosA).addScaledVector(_p, sinA);
  _gi.copy(_n).multiplyScalar(d).addScaledVector(_su, -a).normalize();
  if (fine) fine.copy(sup.position).addScaledVector(_su, a).addScaledVector(_gi, b);
  sup.quaternion.setFromUnitVectors(GIU, _su);
  _q.copy(sup.quaternion).invert();
  inf.quaternion.setFromUnitVectors(GIU, _gi.applyQuaternion(_q));
}

/**
 * Una persona. Il suo materiale se lo fa lei — cosi' sbiadirla quando e' ferma da un
 * pezzo e' un colore su un materiale, non una figura da ricostruire. `mat` sono i
 * materiali della scena: non le servono piu', ma chi la chiama li passa da sempre.
 */
export function persona(seme, mat) {
  const o = aspetto(seme);
  const suo = toon();
  const nodo = (genitore, x = 0, y = 0, z = 0) => {
    const n = new THREE.Group();
    n.position.set(x, y, z);
    genitore.add(n);
    return n;
  };
  /** `ombra`: se il pezzo fa ombra. Gli occhi, la bocca e quello che si tiene in mano no: sono cose di pochi pixel, e ognuna sarebbe un disegno in piu' a ogni fotogramma. */
  const pezzo = (genitore, fn, ombra = true) => {
    const L = new Tratto();
    fn(penna(L));
    const m = L.mesh(suo, ombra);
    genitore.add(m);
    return m;
  };
  const kx = o.robusta ? 1.14 : 1;
  const kz = o.robusta ? 1.3 : 1;
  const kr = o.robusta ? 1.1 : 1;

  const g = new THREE.Group();
  g.scale.setScalar(U);
  const hips = nodo(g, 0, ANCA, 0);
  const torso = nodo(hips);
  hips.rotation.order = torso.rotation.order = 'YXZ';
  const tronco = pezzo(torso, (p) => busto(p, o, kx, kz));
  const head = nodo(torso, 0, COLLO, 0);
  head.rotation.order = 'YXZ';
  pezzo(head, (p) => testa(p, o));
  const occhi = pezzo(nodo(head, 0, 0.215, 0), (p) => {
    for (const k of [-1, 1]) {
      p.sph(1, k * 0.078, 0, 0.18, NERO, { s: [0.027, 0.04, 0.016], filo: 0, n: 10 });
      p.sph(0.009, k * 0.078 + 0.009, 0.015, 0.194, '#ffffff', { filo: 0, n: 6 });
    }
  }, false);
  const ciglia = pezzo(nodo(head, 0, 0.285, 0), (p) => {
    for (const k of [-1, 1]) p.cap(0.008, 0.045, k * 0.078, 0, 0.166, o.hair, { rz: Math.PI / 2 + k * 0.15, filo: 0, n: 6 });
  }, false);
  // La bocca: un arco che sorride (rovesciato e' un broncio), e un tondo scuro quando parla.
  const zb = o.barba === 'piena' || o.barba === 'corta' ? 0.203 : 0.181;
  const rb = o.barba === 'piena' || o.barba === 'corta' ? 0.2 : 0.5;
  const bocca = pezzo(nodo(head, 0, 0.128, zb), (p) => p.put(G.torus(0.034, 0.008, Math.PI, 8), o.bocca, 0, 0, 0, { rz: Math.PI, rx: rb, filo: 0 }), false);
  const voce = pezzo(nodo(head, 0, 0.112, zb + 0.004), (p) => p.sph(1, 0, 0, 0, '#5a1f1a', { s: [0.03, 0.024, 0.01], filo: 0, n: 8 }), false);
  voce.visible = false;

  const maniche = o.vestito === 'polo';
  const polso = o.vestito === 'giacca' ? o.sotto : o.vestito === 'maglione' || o.vestito === 'cardigan' ? o.topLo : o.topHi;
  const braccia = [-1, 1].map((k) => {
    const spalla = nodo(torso, k * SPALLA[0] * (o.robusta ? 1.1 : 1), SPALLA[1], 0);
    pezzo(spalla, (p) => p.cap(0.052 * kr, OMERO, 0, -OMERO / 2, 0, o.top));
    const gomito = nodo(spalla, 0, -OMERO, 0);
    pezzo(gomito, (p) => {
      p.cap(0.046 * kr, 0.15, 0, -0.085, 0, maniche ? o.skin : o.top);
      if (!maniche) p.put(G.torus(0.044 * kr, 0.012, TAU, 10), polso, 0, -0.158, 0, { rx: Math.PI / 2, filo: 0.006 });
      p.sph(0.056, 0, -AVAMBRACCIO, 0, o.skin, { n: 10 });
    });
    return { spalla, gomito };
  });
  // Le gambe: tubi senza ginocchio che si piegano tutti d'un pezzo. Una mesh sola per le
  // due, sul bacino, con le ossa appese alle anche: TRATTI pezzi di tubo e la scarpa. Ogni
  // anello del tubo sta a una giuntura e va a meta' coi due pezzi che lega, cosi' il tubo
  // (e il suo filo d'inchiostro, che ha gli stessi pesi) si incurva senza spigoli.
  const Lg = new Tratto();
  const pg = penna(Lg);
  const scheletro = [];
  const pesi = [];
  const gambe = [-1, 1].map((k, j) => {
    const anca = nodo(hips, k * ANCHE, 0, 0);
    const ossa = [];
    let su = anca;
    for (let i = 0; i <= TRATTI; i++) {
      const b = new THREE.Bone();
      b.position.y = i ? -PEZZO : 0;
      su.add(b);
      ossa.push(b);
      su = b;
    }
    scheletro.push(...ossa);
    const n0 = Lg.p.length / 3;
    pg.lathe(GAMBA, k * ANCHE, 0, 0, o.pants, { s: [kr, 1, kr], n: 10 });
    const n1 = Lg.p.length / 3;
    pg.sph(1, k * ANCHE + SCARPA.centro[0], SCARPA.centro[1], SCARPA.centro[2], o.shoes, { s: SCARPA.raggi, n: 10 });
    const o0 = j * (TRATTI + 1);
    for (let v = n0; v < n1; v++) {
      // Fra il centro di un pezzo e quello dopo il peso passa dall'uno all'altro; l'anello in fondo va a meta' con la scarpa.
      const c = clamp(-Lg.p[3 * v + 1] / PEZZO - 0.5, 0, TRATTI - 0.5);
      const i = Math.min(Math.floor(c), TRATTI - 1);
      pesi[v] = [o0 + i, o0 + i + 1, c - i];
    }
    for (let v = n1; v < Lg.p.length / 3; v++) pesi[v] = [o0 + TRATTI, o0, 0];
    return { anca, ossa: ossa.slice(0, TRATTI), scarpa: ossa[TRATTI], piega: 0 };
  });
  {
    const geo = Lg.geometry();
    const n = pesi.length;
    const si = new Uint16Array(4 * n);
    const sw = new Float32Array(4 * n);
    for (let v = 0; v < n; v++) {
      si[4 * v] = pesi[v][0];
      si[4 * v + 1] = pesi[v][1];
      sw[4 * v] = 1 - pesi[v][2];
      sw[4 * v + 1] = pesi[v][2];
    }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    const m = senzaFilo(new THREE.SkinnedMesh(geo, suo));
    hips.add(m);
    g.updateMatrixWorld(true);
    m.bind(new THREE.Skeleton(scheletro));
  }

  // Le cose nascono solo quando servono la prima volta: quasi nessuno annaffia.
  const cose = {};
  const cosa = (nome) => {
    let n = cose[nome];
    if (!n) {
      n = cose[nome] = nodo(g);
      pezzo(n, (p) => COSE[nome](p, o), false);
      n.visible = false;
    }
    return n;
  };

  /** Dove sono arrivate davvero le mani dopo l'ultima posa, in metri nello spazio della figura. */
  const mani = [new THREE.Vector3(), new THREE.Vector3()];

  return {
    g,
    seme,
    /** I tratti che servono a chi la muove: se e' di stazza. */
    tratti: o,
    mani,
    /** I perni, per chi deve misurare dove sono finiti davvero (i controlli): di ogni gamba l'anca, le ossa del tubo, la scarpa (che sta dove dice SCARPA, spostata alla caviglia) e quanto e' piegata. */
    ossa: { hips, torso, head, braccia, gambe },
    /**
     * Mette la figura in posa. Tutto in metri, nello spazio della figura (x di
     * traverso, y in alto, z in avanti), e gia' ammorbidito da chi chiama:
     *   anca [x, y, z] dove sta il bacino · bacino, busto, capo [rx, ry, rz] come girano
     *   (il busto rispetto al bacino, il capo rispetto al busto)
     *   mani [[x, y, z], [x, y, z]] e gomiti: dove vanno le mani, e da che parte piega il gomito
     *   gambe [[rx, ry, rz, d, s], …] come gira ogni gamba all'anca, nello spazio della figura
     *     (ordine YXZ: ry di dove punta la scarpa, rx in avanti negativo, rz di fianco): e' la
     *     corda dall'anca alla caviglia, lunga `d` metri (CAVIGLIA, o niente, e' dritta; piu'
     *     corta si incurva in avanti); `s` di quanto la scarpa si alza di punta rispetto alla corda
     *   fiato il respiro · chiusi, sx, sy gli occhi · ciglia quanto si alzano
     *   umore -1 broncio … 1 sorriso · voce 0..1 la bocca che parla
     */
    posa(p) {
      hips.position.set(p.anca[0], p.anca[1], p.anca[2]);
      hips.rotation.set(p.bacino[0], p.bacino[1], p.bacino[2]);
      torso.rotation.set(p.busto[0], p.busto[1], p.busto[2]);
      head.rotation.set(p.capo[0], p.capo[1], p.capo[2]);
      const f = p.fiato || 0;
      tronco.scale.set(1 + 0.012 * f, 1 + 0.02 * f, 1 + 0.035 * f);
      hips.updateMatrix();
      torso.updateMatrix();
      _mt.multiplyMatrices(hips.matrix, torso.matrix);
      _it.copy(_mt).invert();
      for (let k = 0; k < 2; k++) {
        // La gamba gira come vuole chi la muove, a prescindere da come e' girato il bacino.
        const r = p.gambe[k];
        const G = gambe[k];
        G.anca.quaternion.copy(hips.quaternion).invert().multiply(_q.setFromEuler(_e.set(r[0], r[1], r[2], 'YXZ')));
        // Il tubo: un arco dall'anca alla caviglia lungo quanto la corda chiesta, che pancia in
        // avanti; la scarpa gira di quanto chiesto rispetto alla corda (0: come lei).
        const fi = (G.piega = piega(r[3] ?? CAVIGLIA));
        G.ossa[0].rotation.x = -fi / 2 + fi / (2 * TRATTI);
        for (let i = 1; i < TRATTI; i++) G.ossa[i].rotation.x = fi / TRATTI;
        G.scarpa.rotation.x = -fi / 2 + fi / (2 * TRATTI) - (r[4] || 0);
        const b = braccia[k];
        const m = p.mani[k];
        const e = p.gomiti[k];
        _t.set(m[0], m[1], m[2]).applyMatrix4(_it).sub(b.spalla.position);
        _g.set(e[0], e[1], e[2]).transformDirection(_it);
        dueOssa(b.spalla, b.gomito, OMERO, AVAMBRACCIO, _t, _g, mani[k]);
        mani[k].applyMatrix4(_mt);
      }
      occhi.scale.y = 1 - 0.9 * clamp(p.chiusi || 0);
      occhi.position.x = 0.012 * (p.sx || 0);
      occhi.position.y = -0.01 * (p.sy || 0);
      ciglia.position.y = 0.02 * (p.ciglia || 0);
      const parla = (p.voce || 0) > 0.03;
      voce.visible = parla;
      bocca.visible = !parla;
      if (parla) voce.scale.set(0.8 + 0.3 * p.voce, 0.35 + 0.9 * p.voce, 1);
      else {
        const u = p.umore == null ? 1 : p.umore;
        // Mai a zero: una bocca schiacciata del tutto sparisce.
        bocca.scale.set(1, Math.abs(u) < 0.14 ? (u < 0 ? -0.14 : 0.14) : u, 1);
      }
    },
    /** Una cosa in mano (o posata): `k` 0..1 quanto c'e', poi dove e come gira, nello spazio della figura. */
    tieni(nome, k, x, y, z, rx = 0, ry = 0, rz = 0) {
      if (k < 0.02) {
        if (cose[nome]) cose[nome].visible = false;
        return;
      }
      const n = cosa(nome);
      n.visible = true;
      n.position.set(x, y, z);
      n.rotation.set(rx, ry, rz);
      n.scale.setScalar(Math.min(1, k) * (GRANDE[nome] || 1));
    },
    /** La cima dei capelli adesso, in unita' di stanza: il bottone arriva fin li'. */
    get alta() {
      return (hips.position.y + CIMA) * U;
    },
    /**
     * Spenta, come chi e' fermo da un pezzo: `k` da 1 (viva) a 0.5. Un velo d'ombra e
     * un filo di grigio, non di piu': deve restare una persona coi suoi colori. (Il
     * grigio si somma in luce lineare: a un terzo, come prima, la sbiancava fino a
     * farne un fantasma.)
     */
    tinta(k) {
      suo.color.setScalar(0.66 + k * 0.34);
      suo.emissive.setScalar((1 - k) * 0.045);
    },
    via() {
      g.traverse((n) => n.geometry && n.geometry.dispose());
      suo.dispose();
    },
  };
}
