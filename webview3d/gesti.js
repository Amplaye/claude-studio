/* Claude Studio — l'ufficio in 3D: i gesti.
 *
 * Lo specchio (mirror.js) guarda la stanza piatta e dice COSA sta facendo ognuno:
 * va fin li', e' fermo sul posto di una sedia, lavora, e' davanti alla macchina del
 * caffe', parla con quello accanto. Qui quella cosa diventa un corpo che la fa.
 * Nessuna regola dell'ufficio e' riscritta: qui non si decide dove va nessuno, si
 * decide solo come ci arriva e cosa fanno le mani nel frattempo.
 *
 * Tre cose reggono tutto il resto.
 *
 *   - La figura SEGUE il suo gemello piatto, non lo copia. Quello va a scatti dritti
 *     da un punto all'altro e si ferma a una spanna dai mobili; questa gli sta dietro
 *     con un filo di ritardo — che arrotonda le curve e fa partire e fermare il passo
 *     — e quando la meta e' una sedia o un mobile va a mettersi dove serve davvero:
 *     di fianco alla sedia, a un braccio dalla macchina.
 *
 *   - I PIEDI stanno per terra. Ogni piede ha un punto della stanza dove e'
 *     appoggiato e ci resta finche' non tocca a lui: il passo e' lungo quanto la
 *     strada fatta, qualunque sia la velocita', e chi gira su se stesso sposta i
 *     piedi invece di ruotare come su un piatto. Le gambe poi le chiude la figura
 *     (people.js): per questo sedersi non e' una posa ma il bacino che scende coi
 *     piedi fermi.
 *
 *   - Niente SCATTA. Ogni gesto dice solo dove dovrebbero stare adesso le mani, la
 *     schiena, la testa; a portarcele e' una molla per ogni numero, senza rimbalzo.
 *     Passare da un gesto all'altro, o lasciarne uno a meta', non ha bisogno di
 *     nessun raccordo scritto a mano.
 *
 * Con le animazioni ridotte (`calmo`) si ferma quello che si muove da solo — il
 * respiro, le dita sui tasti, lo sguardo che gira — e resta quello che succede
 * davvero: camminare, sedersi, prendere una tazza.
 */
import { U, PIANO_M, TAU, clamp, ease, lerp, giro as corto, hash, rnd, smooth, pulse } from './kit.js';
import { ANCA, SEDUTO, COSCIA, STINCO, SUOLA, SPALLA, COLLO } from './people.js';

// ---------------------------------------------------------------------
//  le misure
// ---------------------------------------------------------------------
/** Il passo della stanza piatta, in unita' al secondo (VELOCITA in room.js). */
const PASSO = 32;
/** Da quanto lontano si punta dritto alla sedia o al mobile, invece che al punto della stanza piatta. */
const VICINO = 34;
/** Di quanto resta indietro chi segue: e' quello che arrotonda le curve. */
const RITARDO = 0.14;
/** Dove sta in piedi chi sta per sedersi: davanti alla sedia girata, a questa distanza dal centro del sedile. */
const DAVANTI = 0.34 * U;
/** Di quanto gira la sedia verso chi arriva. */
const DI_LATO = 1.75;
/** A quanto dal fronte di un mobile ci si ferma per usarlo, e a quanto da una pianta o dal cestino. */
export const SBRACCIO = 0.3 * U;
export const ACCANTO = 0.48 * U;
/** I piedi: quanto sono larghi, quanta parte del ciclo stanno a terra, e sotto che velocita' non e' un passo. */
const LARGO = 0.085 * U;
const A_TERRA = 0.62;
const LENTO = 9;
const FUORI_POSTO = 0.06 * U;
/** Dove stanno le cose sul piano davanti a chi siede: di traverso e in avanti, dal centro del sedile. */
const TASTI = 0.31;
const TAZZA_SUA = [0.3, 0.38];
const FOGLIO_POSATO = [-0.33, 0.45];
/** Dalla mano alla base della tazza che regge. */
const PRESA = [0, -0.04, 0.066];
/** Dopo quanto lavoro si tira fuori il libro. */
export const LIBRO_DOPO = 10 * 60 * 1000;

// ---- i canali: ogni numero della posa ha la sua molla
const N = 43;
const ANCA_ = 0;
const BACINO = 3;
const BUSTO = 6;
const CAPO = 9;
const MANO = 12; // due mani, tre numeri l'una
const GOMITO = 18;
const UMORE = 24;
const CIGLIA = 25;
const SX = 26;
const SY = 27;
const K_TAZZA = 28;
const K_SUA = 29;
const K_FOGLIO = 30;
const K_FALDONE = 31;
const K_LIBRO = 32;
const K_TELEFONO = 33;
const K_ANNAFFIA = 34;
const K_GETTO = 35;
const IN_MANO_SUA = 36;
const IN_MANO_FOGLIO = 37;
const INCLINA = 38; // la tazza alla bocca, l'annaffiatoio sulla pianta
const LEGGE = 39;
const VOCE = 40;
const CHIUSI = 41;
const SALTO = 42;
/** Quanto e' svelta ogni molla (rad/s): il corpo piano, le mani un po' di piu', la faccia subito. */
const SVELTA = new Float64Array(N).fill(9);
for (let i = CAPO; i < CAPO + 3; i++) SVELTA[i] = 10;
for (let i = MANO; i < MANO + 6; i++) SVELTA[i] = 12;
for (let i = UMORE; i <= SY; i++) SVELTA[i] = 14;
for (let i = K_TAZZA; i <= K_GETTO; i++) SVELTA[i] = 16;
SVELTA[IN_MANO_SUA] = SVELTA[IN_MANO_FOGLIO] = 11;
SVELTA[LEGGE] = 3.4;
SVELTA[VOCE] = 26;
SVELTA[CHIUSI] = 40;
SVELTA[SALTO] = 22;

const frac = (x) => x - Math.floor(x);
const verso = (v, a, passo) => (v < a ? Math.min(a, v + passo) : Math.max(a, v - passo));

// ---------------------------------------------------------------------
//  chi e'
// ---------------------------------------------------------------------
/** Una persona in movimento: dove sta, i suoi piedi, le sue molle. `x, y` in unita' di stanza. */
export function nuovo(fig, x, y) {
  const piede = () => ({ x, y, z: 0, zt: 0, su: false, aTempo: false, s: 0, x0: x, y0: y });
  return {
    fig,
    x,
    y,
    a: 0,
    fx: x,
    fy: y,
    vx: 0,
    vy: 0,
    vel: 0,
    gir: 0,
    amp: 0,
    sit: 0,
    gira: 0,
    lato: 1,
    posto: null,
    ox: 0,
    oy: 0,
    oa: 0,
    porta: 0,
    cam: 0,
    verso: 0,
    visibile: true,
    sedia: null,
    /** Un numero suo fra 0 e 1, e una fase: perche' dieci persone non facciano la stessa cosa nello stesso istante. */
    n: hash(fig.seme) / 4294967296,
    fase: rnd(fig.seme, 'fase') * TAU,
    passo: rnd(fig.seme, 'passo') * TAU,
    piedi: [piede(), piede()],
    andava: false,
    m: new Float64Array(N * 2),
    primo: true,
    suaDove: null,
    mano: 0,
  };
}

/** Gia' seduto al posto `q`, senza la strada per arrivarci: per chi era li' da prima che si accendesse il 3D. */
export function siediSubito(P, q) {
  const s = Math.sin(q.a);
  const c = Math.cos(q.a);
  P.posto = q;
  P.sit = P.gira = 1;
  P.x = q.x;
  P.y = q.y;
  P.a = q.a;
  P.piedi.forEach((f, k) => {
    const l = k ? 1 : -1;
    f.x = f.x0 = q.x + (l * 0.09 * c + 0.33 * s) * U;
    f.y = f.y0 = q.y + (-l * 0.09 * s + 0.33 * c) * U;
  });
}

/**
 * Quello che lo specchio dice di una persona a ogni fotogramma. Chi la muove da
 * un'altra parte (la pagina di prova) riempie lo stesso foglio.
 */
export function ingressi() {
  return {
    // --- dove sta il gemello piatto, e dove sta andando
    fx: 0,
    fy: 0,
    tx: 0,
    ty: 0,
    /** Fermo sul punto dove stava andando. */
    fermo: true,
    /** La sedia che sta su quel punto, se ce n'e' una: { x, y, a, p2 } di M.B.posti. */
    posto: null,
    /** Il mobile che sta su quel punto: { x, y, a, nome } — dove mettersi per usarlo. */
    sosta: null,
    /** Sulla soglia: dentro la cabina, a `cabina` [x, y]. */
    soglia: false,
    cabina: null,
    /** 2 = a passo svelto (chi va in archivio). */
    passo: 1,
    /** Verso dove si gira chi sta fermo in piedi (radianti, 0 = a sud), o null. */
    fronte: null,
    // --- cosa sta facendo
    /** '' | 'digita' | 'legge' — quello che fa al suo posto. */
    fa: '',
    /** Il gesto che la stanza piatta gli ha messo addosso (`data-gesto`), e da quando (secondi). */
    gesto: '',
    gestoDa: 0,
    /** Quanto lavora fitto, 0..1: chi ha Claude che macina batte senza alzare la testa. */
    ritmo: 1,
    ferma: false,
    festa: false,
    chiede: false,
    parla: false,
    ascolta: false,
    stretta: false,
    // --- cosa ha in mano
    tazza: false,
    foglio: false,
    faldone: false,
    // --- a cosa bada: un punto della stanza [x, y, z] in unita', o null
    guarda: null,
    /** L'animale che gli chiede attenzione: { x, y, z, forza } di pets.js, o null. */
    animale: null,
    calmo: false,
  };
}

// ---------------------------------------------------------------------
//  dove sta: seguire, sedersi, alzarsi
// ---------------------------------------------------------------------
/** Da che parte gira la sedia per farsi trovare: verso il punto (x, y). */
function lato(q, x, y) {
  const dx = x - q.x;
  const dy = y - q.y;
  const p = (s) => dx * Math.sin(q.a + s * DI_LATO) + dy * Math.cos(q.a + s * DI_LATO);
  return p(1) >= p(-1) ? 1 : -1;
}

/** La stanza si e' spostata sotto i piedi (una finestra tirata): ci si sposta con lei, senza un passo. */
function trasla(P, dx, dy) {
  P.x += dx;
  P.y += dy;
  for (const f of P.piedi) {
    f.x += dx;
    f.y += dy;
    f.x0 += dx;
    f.y0 += dy;
  }
}

/**
 * Un fotogramma di strada. Aggiorna `P.x, P.y, P.a`, quanto e' seduto (`sit`) e
 * girato verso il banco (`gira`), i piedi, e `P.sedia`: l'angolo che deve avere la
 * sua sedia adesso, o null se e' libera.
 */
export function sposta(P, I, dt, daUltimo = dt) {
  const x0 = P.x;
  const y0 = P.y;
  const a0 = P.a;
  // Un salto che nessun passo spiega non e' una camminata. (`daUltimo`: quanto e'
  // passato dall'ultima volta che si e' guardato dove sta il gemello piatto.)
  const sx = I.fx - P.fx;
  const sy = I.fy - P.fy;
  P.fx = I.fx;
  P.fy = I.fy;
  if (Math.hypot(sx, sy) > 200 * daUltimo + 8) return trasla(P, sx, sy);

  const q = I.posto;
  const siede = !!q && I.fermo;
  // La sedia e' sua finche' ci sta andando o ci sta sopra.
  if (P.sit <= 0 && q !== P.posto) {
    P.posto = q;
    if (q) P.lato = lato(q, P.x, P.y);
  }
  const s = P.posto;
  // La sedia non c'e' piu' (la stanza e' stata rimontata senza): in piedi, e basta.
  if (!s) P.sit = P.gira = 0;
  let gx = I.fx;
  let gy = I.fy;
  let fronte = I.fronte;
  let inPosto = false;
  P.sedia = null;
  if (s) {
    if (P.sit >= 1 && P.gira >= 1 && !siede) P.lato = lato(s, I.tx, I.ty);
    const aL = s.a + P.lato * DI_LATO;
    const Sx = s.x + Math.sin(aL) * DAVANTI;
    const Sy = s.y + Math.cos(aL) * DAVANTI;
    if (P.sit > 0) {
      // Giu': prima ci si siede, poi ci si gira verso il banco. Su: il contrario.
      if (siede && q === s) {
        if (P.sit < 1) P.sit = Math.min(1, P.sit + dt / 0.8);
        else P.gira = Math.min(1, P.gira + dt / 0.62);
      } else if (P.gira > 0) P.gira = Math.max(0, P.gira - dt / 0.5);
      else P.sit = Math.max(0, P.sit - dt / 0.7);
      const e = ease(P.sit);
      P.x = lerp(Sx, s.x, e) + P.ox * (1 - e);
      P.y = lerp(Sy, s.y, e) + P.oy * (1 - e);
      // Seduto guarda lo schermo; per girarsi verso qualcuno gira la sedia per due
      // terzi e la testa per il resto, che e' come ci si gira davvero.
      const aF = s.a + corto(s.a, P.verso) * 0.62 * ease(P.cam);
      P.a = aL + P.oa * (1 - e) + corto(aL, aF) * ease(P.gira);
      P.sedia = P.a;
      P.vel = 0;
      inPosto = true;
    } else if (q === s && Math.hypot(I.fx - s.p2[0], I.fy - s.p2[1]) < VICINO) {
      gx = Sx;
      gy = Sy;
      fronte = aL;
      P.sedia = aL;
      // Arrivato davanti alla sedia, girato, coi piedi fermi: ci si siede.
      if (siede && Math.hypot(P.x - Sx, P.y - Sy) < 1.6 && Math.abs(corto(P.a, aL)) < 0.3 && !P.piedi[0].su && !P.piedi[1].su) {
        P.sit = 0.001;
        P.gira = 0;
        P.ox = P.x - Sx;
        P.oy = P.y - Sy;
        P.oa = corto(aL, P.a);
      }
    }
  }
  if (!inPosto) {
    P.porta = verso(P.porta, I.soglia ? 1 : 0, dt * 3.5);
    if (P.porta > 0.5 && I.cabina) {
      gx = I.cabina[0];
      gy = I.cabina[1];
      fronte = 0;
    } else if (I.sosta && Math.hypot(I.fx - I.tx, I.fy - I.ty) < VICINO) {
      gx = I.sosta.x;
      gy = I.sosta.y;
      fronte = I.sosta.a;
    }
    const dx = gx - P.x;
    const dy = gy - P.y;
    const d = Math.hypot(dx, dy);
    // Per due passi non ci si volta: ci si sposta di lato. Per una strada si' — e
    // finche' non si e' voltati si va piano, che nessuno parte all'indietro.
    const strada = I.fermo ? d > 8 : d > 1.5;
    const aT = strada ? Math.atan2(dx, dy) : fronte;
    const storto = strada ? Math.max(0, Math.cos(corto(P.a, aT))) : 1;
    // Chi e' rimasto indietro allunga un po', ma non corre; e nessuno parte di scatto.
    let v = Math.min(d / RITARDO, PASSO * I.passo * 1.4 * (0.12 + 0.88 * storto * storto), P.vel + 130 * dt);
    if (v * dt > d) v = d / dt;
    if (d > 1e-4) {
      P.x += (dx / d) * v * dt;
      P.y += (dy / d) * v * dt;
    }
    P.vel = v;
    if (aT != null) P.a += clamp(corto(P.a, aT) * Math.min(1, dt * (strada ? 11 : 6)), -7 * dt, 7 * dt);
    P.visibile = !(P.porta > 0.5 && I.cabina && Math.hypot(P.x - I.cabina[0], P.y - I.cabina[1]) < 5);
  } else P.visibile = true;

  // Quanto si e' mosso davvero: e' da qui che escono i passi, non dalla stanza piatta.
  const k = Math.min(1, dt * 14);
  P.vx += ((P.x - x0) / dt - P.vx) * k;
  P.vy += ((P.y - y0) / dt - P.vy) * k;
  P.gir += (corto(a0, P.a) / dt - P.gir) * k;
  P.amp = clamp(Math.hypot(P.vx, P.vy) / 22);
  passi(P, dt);
}

/** I piedi: dove sono appoggiati, e quando tocca a ognuno alzarsi. */
function passi(P, dt) {
  const sa = Math.sin(P.a);
  const ca = Math.cos(P.a);
  const v = Math.hypot(P.vx, P.vy);
  const seduto = P.sit >= 1;
  const cammina = v > LENTO && P.sit <= 0;
  // Piu' si va svelti piu' il passo e' lungo, ma meno della velocita': anche la cadenza sale.
  const lungo = clamp(0.44 * Math.sqrt(v / PASSO), 0.26, 0.66) * U;
  // Chi parte da fermo comincia alzando un piede, non a meta' di un passo gia' fatto.
  if (cammina && !P.andava) P.passo = A_TERRA * TAU;
  else if (cammina) P.passo += ((v * dt) / lungo) * Math.PI;
  P.andava = cammina;
  const ux = cammina ? P.vx / v : sa;
  const uy = cammina ? P.vy / v : ca;
  for (let k = 0; k < 2; k++) {
    const f = P.piedi[k];
    const altro = P.piedi[1 - k];
    const l = k ? 1 : -1;
    if (P.sit > 0) {
      // Sedendosi restano dove sono; seduti stanno davanti alla sedia, e girano con lei.
      f.su = false;
      if (seduto) {
        const tx = P.x + (l * 0.09 * ca + 0.33 * sa) * U;
        const ty = P.y + (-l * 0.09 * sa + 0.33 * ca) * U;
        const g = Math.min(1, dt * 12);
        f.x += (tx - f.x) * g;
        f.y += (ty - f.y) * g;
      }
      f.zt = seduto ? 0.02 * Math.min(1, Math.abs(P.gir)) : 0;
    } else {
      const rx = P.x + ca * l * LARGO;
      const ry = P.y - sa * l * LARGO;
      if (cammina) {
        let c = frac(P.passo / TAU + k * 0.5);
        // Rimasto troppo indietro (una partenza, un cambio di passo): si alza adesso, senza
        // aspettare il suo turno — e se l'altro e' ancora in aria, quello si sbriga ad atterrare.
        const dietro = ((rx - f.x) * ux + (ry - f.y) * uy) / lungo;
        if (c < A_TERRA && dietro > 0.66) {
          if (altro.su) P.passo += (dietro - 0.66) * 8 * dt * TAU;
          else {
            P.passo += (A_TERRA - c) * TAU;
            c = A_TERRA;
          }
        }
        if (c >= A_TERRA) {
          if (!f.su || f.aTempo) {
            f.su = true;
            f.aTempo = false;
            f.x0 = f.x;
            f.y0 = f.y;
          }
          // In aria: verso il punto dove il corpo sara' quando atterra, mezzo passo piu' avanti.
          const u = (c - A_TERRA) / (1 - A_TERRA);
          const avanti = lungo * (A_TERRA + 2 * (1 - A_TERRA) * (1 - u));
          const e = ease(u);
          f.x = lerp(f.x0, rx + ux * avanti, e);
          f.y = lerp(f.y0, ry + uy * avanti, e);
          f.zt = (0.05 + 0.05 * Math.min(1, v / (2 * PASSO))) * Math.sin(Math.PI * u);
        } else {
          f.su = false;
          f.zt = 0;
        }
      } else if (f.su) {
        // Da fermi: il piede rimasto indietro torna sotto il corpo.
        f.s += dt / 0.24;
        const e = ease(Math.min(1, f.s));
        f.x = lerp(f.x0, rx, e);
        f.y = lerp(f.y0, ry, e);
        f.zt = 0.035 * Math.sin(Math.PI * Math.min(1, f.s));
        if (f.s >= 1) f.su = false;
      } else if (!altro.su && Math.hypot(f.x - rx, f.y - ry) > FUORI_POSTO) {
        f.su = true;
        f.aTempo = true;
        f.s = 0;
        f.x0 = f.x;
        f.y0 = f.y;
      } else f.zt = 0;
    }
    f.z += (f.zt - f.z) * Math.min(1, dt * 30);
  }
}

// ---------------------------------------------------------------------
//  la posa
// ---------------------------------------------------------------------
/** La molla senza rimbalzo, esatta per qualunque passo di tempo: `m[2i]` il valore, `m[2i+1]` la velocita'. */
function molla(m, i, a, w, dt) {
  const e = Math.exp(-w * dt);
  const d = m[2 * i] - a;
  const k = (m[2 * i + 1] + w * d) * dt;
  m[2 * i + 1] = (m[2 * i + 1] - w * k) * e;
  m[2 * i] = a + (d + k) * e;
}

/**
 * Una cosa che succede ogni tanto: in ogni finestra di `ogni` secondi, con
 * probabilita' `prob`, per `dura` secondi. Torna quanto e' dentro (0..1, coi bordi
 * morbidi), a che punto (0..1) e un numero suo, o null. Dipende solo dall'ora e
 * dalla persona: nessun timer da tenere in pari.
 */
const EV = { w: 0, u: 0, r: 0 };
function ogniTanto(P, t, ogni, dura, prob, nome, bordo = 0.4) {
  const tt = t + P.n * ogni;
  const i = Math.floor(tt / ogni);
  if (rnd(P.fig.seme, nome, i) >= prob) return null;
  const da = (0.1 + 0.8 * rnd(P.fig.seme, nome, i, 'q')) * (ogni - dura);
  const x = tt - i * ogni - da;
  if (x <= 0 || x >= dura) return null;
  EV.w = pulse(x, 0, dura, Math.min(bordo, dura / 2));
  EV.u = x / dura;
  EV.r = rnd(P.fig.seme, nome, i, 'r');
  return EV;
}

// Il foglio su cui si scrive la posa di questo fotogramma: si riusa per tutti.
const T = new Float64Array(N);
const POSA = {
  anca: [0, 0, 0],
  bacino: [0, 0, 0],
  busto: [0, 0, 0],
  capo: [0, 0, 0],
  mani: [[0, 0, 0], [0, 0, 0]],
  gomiti: [[0, 0, -1], [0, 0, -1]],
  piedi: [[0, 0, 0], [0, 0, 0]],
  fiato: 0,
  chiusi: 0,
  sx: 0,
  sy: 0,
  ciglia: 0,
  umore: 1,
  voce: 0,
};
const LOC = [0, 0, 0];
/** Un punto della stanza (unita', `h` in metri da terra) visto dalla figura, in metri. */
function locale(P, wx, wy, h, out = LOC) {
  const dx = (wx - P.x) / U;
  const dy = (wy - P.y) / U;
  const s = Math.sin(P.a);
  const c = Math.cos(P.a);
  out[0] = dx * c - dy * s;
  out[1] = h;
  out[2] = dx * s + dy * c;
  return out;
}
/** Un punto davanti a chi siede al posto `q` — `x` di traverso, `z` in avanti, in metri — visto dalla figura. */
function sulBanco(P, q, x, h, z, out = LOC) {
  const s = Math.sin(q.a);
  const c = Math.cos(q.a);
  return locale(P, q.x + (x * c + z * s) * U, q.y + (-x * s + z * c) * U, h, out);
}
const mano = (k, x, y, z) => {
  T[MANO + 3 * k] = x;
  T[MANO + 3 * k + 1] = y;
  T[MANO + 3 * k + 2] = z;
};
const gomito = (k, x, y, z) => {
  T[GOMITO + 3 * k] = x;
  T[GOMITO + 3 * k + 1] = y;
  T[GOMITO + 3 * k + 2] = z;
};
/** Porta la mano `k` verso un punto, di quanto dice `w`. */
const versoMano = (k, x, y, z, w) => {
  T[MANO + 3 * k] += (x - T[MANO + 3 * k]) * w;
  T[MANO + 3 * k + 1] += (y - T[MANO + 3 * k + 1]) * w;
  T[MANO + 3 * k + 2] += (z - T[MANO + 3 * k + 2]) * w;
};
const A = [0, 0, 0];
const B = [0, 0, 0];
/** Le mani che in questo fotogramma stanno su una cosa della stanza (la bestia), e non seguono il corpo. */
const FISSA = [0, 0];
/** Dove sta il libro adesso, davanti a chi legge. */
const LIBRO = [0, 0, 0];

/**
 * Un fotogramma di posa: legge cosa sta facendo, scrive dove dovrebbe stare ogni
 * pezzo, lascia che le molle ce lo portino, e mette in posa la figura.
 */
export function atteggia(P, I, t, dt) {
  const fig = P.fig;
  const o = fig.tratti;
  const m = P.m;
  const vivo = !I.calmo;
  const e = ease(P.sit);
  const inPiedi = 1 - e;
  const amp = P.amp * inPiedi;
  const fermo = (1 - P.amp) * inPiedi;
  const q = P.posto;
  /** Seduto e girato verso il banco: e' li' che le mani trovano la tastiera. */
  const alBanco = q && P.sit >= 1 ? ease(P.gira) * (1 - ease(P.cam)) : 0;
  const f = P.fase;
  T.fill(0);
  FISSA[0] = FISSA[1] = 0;

  // --- i piedi, visti dalla figura
  const piedi = POSA.piedi;
  for (let k = 0; k < 2; k++) locale(P, P.piedi[k].x, P.piedi[k].y, P.piedi[k].z, piedi[k]);
  const dz = (piedi[1][2] - piedi[0][2]) * inPiedi;

  // ====================================================================
  //  il corpo di base: in piedi, in cammino, seduto
  // ====================================================================
  let ay = lerp(ANCA, SEDUTO, e) - 0.012 * amp;
  let ax = 0.3 * (P.piedi[0].z - P.piedi[1].z) * inPiedi;
  let az = 0;
  // Scendendo sulla sedia ci si piega in avanti, e la testa resta dritta.
  const mezzo = Math.sin(Math.PI * P.sit);
  let bx = 0;
  let by = -0.35 * dz;
  let bz = clamp(-P.gir * (Math.hypot(P.vx, P.vy) / PASSO) * 0.075, -0.17, 0.17) * inPiedi;
  let tx = 0.5 * mezzo + (0.07 + (I.passo > 1 ? 0.07 : 0)) * amp + 0.04 * e;
  let ty = 0.8 * dz;
  let tz = -0.4 * bz;
  let cx = -0.28 * mezzo + 0.03;
  let cy = -0.25 * dz;
  let cz = 0;
  let umore = 0.85;
  let ciglia = 0;
  let sx = 0;
  let sy = 0;
  let voce = 0;
  let chiusi = 0;
  let accuccia = 0;
  let salto = 0;
  if (vivo && fermo > 0.5) {
    // Il peso da un piede all'altro: i piedi restano dove sono, le gambe riprendono quello che il bacino da'.
    const peso = Math.sin(0.9 * t + f);
    ax += 0.02 * peso * fermo;
    bz += -0.03 * peso * fermo;
    tz += 0.02 * peso * fermo;
  }

  // --- le braccia: lungo i fianchi e a tempo di passo, o sulle ginocchia
  const larga = o.robusta ? 0.02 : 0;
  for (let k = 0; k < 2; k++) {
    const l = k ? 1 : -1;
    const avanti = -0.5 * l * dz;
    mano(
      k,
      lerp(l * (0.215 + larga), l * 0.11, e),
      lerp(ay + SPALLA[1] - 0.362 + 0.3 * Math.max(0, avanti), SEDUTO + 0.105, e),
      lerp(0.03 + avanti, 0.21, e)
    );
    gomito(k, l * lerp(0.3, 0.8, e), -0.3, lerp(-1, -0.5, e));
  }

  // --- cosa ha in mano, e con quale mano
  const suaInMano = o.tazza && !P.suaDove && !I.tazza;
  const tazzaInMano = I.tazza || suaInMano;
  const mF = tazzaInMano ? 0 : 1; // il foglio sta nella mano che la tazza lascia libera
  let kTazza = I.tazza ? 1 : 0;
  let kFoglio = I.foglio ? 1 : 0;
  let foglioInMano = 1;
  let kTelefono = 0;
  let kAnnaffia = 0;
  let kGetto = 0;
  let inclina = 0;
  let suaPresa = suaInMano ? 1 : 0;
  let occupata0 = I.faldone;
  let occupata1 = tazzaInMano;
  if (I.foglio) mF ? (occupata1 = true) : (occupata0 = true);
  if (inPiedi > 0.5) {
    // La tazza si porta ferma davanti, che non si rovesci; il foglio un po' piu' giu'; il faldone sotto il braccio.
    if (tazzaInMano) {
      mano(1, 0.19, ay + 0.27, 0.2);
      gomito(1, 0.6, -0.5, -0.6);
    }
    if (I.foglio) {
      const l = mF ? 1 : -1;
      mano(mF, l * 0.17, ay + 0.2, 0.22);
      gomito(mF, l * 0.6, -0.5, -0.6);
    }
    if (I.faldone) {
      mano(0, -0.21, ay + 0.17, 0.07);
      gomito(0, -0.5, -0.2, -0.85);
    }
  }
  // Dove sta la testa, per portarci una mano o una tazza.
  const testaY = () => ay + COLLO * Math.cos(tx);
  const testaZ = () => az + COLLO * Math.sin(tx);

  // ====================================================================
  //  al banco: battere, fermarsi a pensare, leggere
  // ====================================================================
  const lib = m[2 * LEGGE];
  let legge = 0;
  if (q && alBanco > 0.5) {
    // La sua tazza sta sul piano, a destra della tastiera: e' li' anche quando lui e' al bar.
    if (o.tazza && P.sit >= 1 && P.gira >= 1) {
      const s = Math.sin(q.a);
      const c = Math.cos(q.a);
      P.suaDove = [q.x + (TAZZA_SUA[0] * c + TAZZA_SUA[1] * s) * U, q.y + (-TAZZA_SUA[0] * s + TAZZA_SUA[1] * c) * U];
    }
    if (I.foglio) foglioInMano = 0;
    const scrive = I.fa === 'digita' || I.fa === 'legge';
    if (scrive) {
      tx = 0.07;
      cx = 0.12;
      umore = 0.5;
      // Le mani sui tasti: ognuna vaga un po' per conto suo, e battono a raffiche.
      for (let k = 0; k < 2; k++) {
        const l = k ? 1 : -1;
        const vx = vivo ? 0.034 * Math.sin(1.7 * t + f + k * 2.1) + 0.018 * Math.sin(3.3 * t + 2 * f + k) : 0;
        const vz = vivo ? 0.012 * Math.sin(2.3 * t + f * 3 + k * 1.3) : 0;
        sulBanco(P, q, l * 0.085 + vx, PIANO_M + 0.062, TASTI + vz, A);
        mano(k, A[0], A[1], A[2]);
        gomito(k, l * 0.9, -0.5, -0.35);
      }
      if (vivo) {
        // Gli occhi seguono la riga e tornano a capo; ogni tanto un'occhiata ai tasti.
        sx = -0.8 + 1.6 * frac(0.4 * t + f);
        cy = 0.05 * sx;
        ty = 0.03 * Math.sin(0.5 * t + f);
        const giu = ogniTanto(P, t, 7, 1.2, 0.5, 'tasti', 0.3);
        if (giu) {
          cx += 0.22 * giu.w;
          sy = giu.w;
        }
      }
    }
    // --- le pause: chi ha Claude che macina ne fa poche, chi sta fra un turno e l'altro di piu'
    const pausa = vivo && I.fa === 'digita' && !I.animale ? ogniTanto(P, t, lerp(9, 15, I.ritmo), 3, lerp(0.8, 0.45, I.ritmo), 'pausa', 0.55) : null;
    if (pausa) {
      const w = pausa.w;
      const cosa = Math.floor(pausa.r * 5);
      if (I.stretta && pausa.r > 0.4) {
        // Il contesto agli sgoccioli: una mano sulla fronte.
        versoMano(1, 0.055, testaY() + 0.27, testaZ() + 0.2, w);
        cx += 0.26 * w;
        chiusi = w;
        umore = lerp(umore, -0.5, w);
      } else if (cosa === 0 && o.tazza && P.suaDove) {
        // Un sorso dalla sua tazza: la prende dal piano, beve, la rimette dov'era.
        const u = pausa.u;
        locale(P, P.suaDove[0], P.suaDove[1], PIANO_M, B);
        const pr = smooth(0.04, 0.2, u) * (1 - smooth(0.82, 0.96, u));
        const su = smooth(0.24, 0.42, u) * (1 - smooth(0.66, 0.82, u));
        A[0] = lerp(B[0] - PRESA[0], 0.035, su);
        A[1] = lerp(B[1] - PRESA[1], testaY() + 0.07, su);
        A[2] = lerp(B[2] - PRESA[2], testaZ() + 0.15, su);
        versoMano(1, A[0], A[1], A[2], pr);
        suaPresa = u > 0.2 && u < 0.84 ? 1 : 0;
        inclina = 0.55 * su;
        cx -= 0.12 * su;
        tx -= 0.06 * su;
      } else if (cosa <= 1) {
        // La mano al mento, lo sguardo altrove.
        const k = pausa.r > 0.1 ? 1 : 0;
        versoMano(k, (k ? 1 : -1) * 0.04, testaY() + 0.065, testaZ() + 0.19, w);
        gomito(k, k ? 0.4 : -0.4, -1, 0.2);
        tx -= 0.07 * w;
        cz = (k ? 0.12 : -0.12) * w;
        sx = lerp(sx, k ? -0.9 : 0.9, w);
        sy = -0.6 * w;
        ciglia = 0.5 * w;
      } else if (cosa === 2) {
        // Ci si stira: le braccia in alto e in fuori, la schiena indietro, uno sbadiglio.
        for (let k = 0; k < 2; k++) {
          const l = k ? 1 : -1;
          versoMano(k, l * 0.31, ay + SPALLA[1] + 0.31, -0.03, w);
          gomito(k, l, 0.3, -0.4);
        }
        tx -= 0.24 * w;
        cx -= 0.22 * w;
        chiusi = smooth(0.3, 0.6, w);
        voce = 0.75 * smooth(0.5, 0.9, w);
      } else if (cosa === 3) {
        // Ci si appoggia allo schienale, le mani in grembo, a rileggere.
        for (let k = 0; k < 2; k++) versoMano(k, (k ? 1 : -1) * 0.1, SEDUTO + 0.11, 0.2, w);
        tx -= 0.2 * w;
        az += 0.03 * w;
        cx += 0.05 * w;
      } else {
        // Il collo: la testa da una spalla all'altra.
        cz = 0.3 * Math.sin(pausa.u * TAU) * w;
        cx += 0.08 * w;
        chiusi = 0.6 * w;
      }
    }

    // --- il libro: dopo dieci minuti che lavora, ci si appoggia e si legge
    if (I.fa === 'legge' || lib > 0.04) {
      legge = I.fa === 'legge' ? 1 : 0;
      const u = ease(lib);
      const quanto = clamp(lib * 8);
      // Dal grembo fin davanti al petto.
      const ly = lerp(SEDUTO + 0.1, ay + 0.37, u);
      const lz = lerp(0.17, 0.3, u);
      LIBRO[1] = ly;
      LIBRO[2] = lz;
      for (let k = 0; k < 2; k++) {
        const l = k ? 1 : -1;
        versoMano(k, l * 0.145, ly - 0.01, lz - 0.02, quanto);
        gomito(k, l * 0.8, -0.6, -0.3);
      }
      tx = lerp(tx, -0.25, u);
      az += 0.035 * u;
      cx = lerp(cx, 0.58, u);
      cy *= 1 - u;
      sx *= 1 - 0.6 * u;
      umore = lerp(umore, 0.8, u);
      if (vivo && lib > 0.9) {
        // Gira pagina: la destra lascia il suo bordo, passa sopra e torna.
        const pg = ogniTanto(P, t, 8, 1.2, 0.9, 'pagina', 0.3);
        if (pg) {
          const a = Math.sin(Math.PI * pg.u);
          versoMano(1, lerp(0.145, -0.02, a), ly + 0.05 * a, lz - 0.03, pg.w);
        }
        // E ogni tanto alza gli occhi allo schermo, a vedere se ha finito.
        const sc = ogniTanto(P, t, 13, 1.8, 0.75, 'schermo', 0.5);
        if (sc) {
          cx = lerp(cx, 0.08, sc.w);
          sy = -0.4 * sc.w;
        }
      }
    }
  } else if (e > 0.9) {
    // Seduto ma non al lavoro: girato verso qualcuno, o fermo da un pezzo.
    if (I.foglio && q) foglioInMano = 0;
    if (I.ferma) {
      // Scivolato sulla sedia, lo sguardo che gira, ogni tanto il telefono.
      tx = -0.17;
      az += 0.045;
      cx = 0.16;
      umore = 0.25;
      if (vivo) {
        cy = 0.55 * Math.sin(0.23 * t + f) * Math.sin(0.11 * t + 2 * f);
        const tel = !occupata1 && ogniTanto(P, t, 16, 7, 0.75, 'telefono', 0.7);
        if (tel) {
          versoMano(1, 0.07, SEDUTO + 0.27, 0.24, tel.w);
          gomito(1, 0.7, -0.6, -0.3);
          kTelefono = smooth(0.05, 0.3, tel.w);
          cx = lerp(cx, 0.44, tel.w);
          cy *= 1 - tel.w;
          sy = tel.w;
          occupata1 = true;
        }
      }
    }
  }

  // ====================================================================
  //  in piedi: i gesti davanti ai mobili, e le soste
  // ====================================================================
  if (inPiedi > 0.5 && I.gesto) {
    const u = t - I.gestoDa;
    const spalla = ay + SPALLA[1];
    const dove = I.sosta ? I.sosta.nome : '';
    const g = I.gesto;
    if (g === 'prende' || g === 'posa' || g === 'stacca' || g === 'appende' || g === 'faldone') {
      // Allungare una mano e tenerla li': la cosa compare o sparisce quando la stanza piatta la da' o la toglie.
      const k = g === 'faldone' ? 0 : g === 'stacca' || g === 'appende' ? mF : 1;
      const l = k ? 1 : -1;
      const alto = g === 'posa' && dove.startsWith('lavandino') ? 0.84 : g === 'stacca' || g === 'appende' ? 1.14 : 1.02;
      const w = smooth(0, 0.32, u);
      versoMano(k, l * 0.06, alto, 0.31, w);
      gomito(k, l * 0.7, -0.6, -0.3);
      if (g === 'faldone') versoMano(1, 0.13, 0.96, 0.28, w);
      tx += 0.1 * w;
      cx = lerp(cx, alto > 1.1 ? -0.1 : 0.16, w);
      cy = lerp(cy, -l * 0.12, w);
    } else if (g === 'caffe') {
      // La tazza sotto il becco, il bottone, l'attesa a guardarla scendere, e la si riprende.
      const posa = smooth(0, 0.45, u) * (1 - smooth(0.55, 0.75, u));
      const preme = smooth(0.6, 0.85, u) * (1 - smooth(1.05, 1.3, u));
      const riprende = smooth(1.85, 2.2, u);
      versoMano(1, 0.2, 0.86, 0.2, smooth(0.5, 0.9, u));
      versoMano(1, 0.03, 0.9, 0.31, Math.max(posa, riprende));
      versoMano(1, 0.14, 1.12, 0.3 + 0.03 * pulse(u, 0.82, 1.08, 0.1), preme);
      gomito(1, 0.7, -0.6, -0.3);
      // In mezzo la tazza e' sulla macchina, non in mano.
      if (u > 0.5 && u < 2.15) kTazza = 0;
      tx += 0.1 * Math.max(posa, preme, riprende);
      cx = lerp(cx, 0.3, smooth(0, 0.4, u));
      cy = lerp(cy, -0.1, preme);
      if (vivo && u > 1.2 && u < 1.9) {
        // Aspettando: il peso su un piede, le dita che tamburellano sul piano.
        ax += 0.02 * Math.sin(3 * u);
        T[MANO + 4] += 0.012 * Math.max(0, Math.sin(19 * u));
      }
    } else if (g === 'lava') {
      // Tutte e due le mani nel lavandino a strofinare; ogni tazza finisce con una scrollata.
      const w = smooth(0, 0.35, u);
      const giro = u % 2.4;
      const scrolla = smooth(1.9, 2.05, giro) * (1 - smooth(2.3, 2.4, giro));
      for (let k = 0; k < 2; k++) {
        const l = k ? 1 : -1;
        versoMano(k, l * 0.07, 0.83 + 0.09 * scrolla, 0.29, w);
        gomito(k, l * 0.9, -0.5, -0.2);
      }
      tx += 0.24 * w;
      cx = lerp(cx, 0.38, w);
    } else if (g === 'broncio') {
      // Nessuna tazza da nessuna parte: le spalle giu', le mani aperte, la testa che dice di no.
      const w = smooth(0, 0.3, u) * (1 - smooth(1.2, 1.6, u));
      for (let k = 0; k < 2; k++) {
        const l = k ? 1 : -1;
        if (!(k ? occupata1 : occupata0)) versoMano(k, l * 0.31, ay + 0.2, 0.15, w);
        gomito(k, l * 0.6, -0.8, -0.2);
      }
      tx += 0.14 * w;
      ay -= 0.025 * w;
      cx = lerp(cx, 0.3, w);
      cy = 0.3 * Math.sin(5 * u) * w;
      umore = lerp(umore, -1, smooth(0, 0.2, u));
      ciglia = -0.8 * w;
    } else if (g === 'annaffia') {
      // L'annaffiatoio sulla pianta: si inclina, versa, si rialza.
      const w = smooth(0, 0.5, u);
      const versa = smooth(0.7, 1.2, u) * (1 - smooth(3.5, 4, u));
      versoMano(1, 0.1 + (vivo ? 0.05 * Math.sin(1.3 * u) : 0) * versa, lerp(0.86, 0.95, versa), 0.26, w);
      gomito(1, 0.7, -0.6, -0.3);
      kAnnaffia = w * (1 - smooth(4.1, 4.45, u));
      inclina = 0.62 * versa;
      kGetto = smooth(0.25, 0.6, versa);
      if (!occupata0) versoMano(0, -0.2, ay + 0.03, 0.03, w);
      tx += 0.1 * versa;
      cx = lerp(cx, 0.3, w);
      occupata1 = true;
    } else if (g === 'dispensa') {
      // Si guarda cosa c'e': un barattolo, quello accanto, poi il ripiano di sotto.
      const w = smooth(0, 0.4, u) * (1 - smooth(2.8, 3.2, u));
      const due = smooth(0.95, 1.25, u);
      const sotto = smooth(1.9, 2.25, u);
      versoMano(1, lerp(lerp(-0.07, 0.13, due), 0.03, sotto), lerp(1.04, 0.66, sotto), 0.3, w);
      gomito(1, 0.7, -0.6, -0.3);
      accuccia = 0.12 * sotto * w;
      tx += (0.08 + 0.28 * sotto) * w;
      cx = lerp(cx, lerp(-0.12, 0.3, sotto), w);
      cy = lerp(cy, lerp(0.15, -0.15, due), w);
      ciglia = 0.5 * w;
    } else if (g === 'bacheca') {
      // Si legge la bacheca col dito: un foglietto, poi un altro.
      const w = smooth(0, 0.4, u) * (1 - smooth(3.5, 4, u));
      const due = smooth(1.5, 1.9, u);
      const tocca = vivo ? 0.02 * Math.max(0, Math.sin(7 * u)) : 0;
      versoMano(1, lerp(-0.05, 0.16, due), lerp(1.2, 1.06, due), 0.29 + tocca, w);
      gomito(1, 0.7, -0.6, -0.3);
      if (!occupata0) {
        versoMano(0, -0.2, ay + 0.03, 0.04, w);
        gomito(0, -0.9, -0.2, -0.5);
      }
      tx += 0.06 * w;
      cx = lerp(cx, lerp(-0.14, 0.02, due), w);
      cy = lerp(cy, lerp(0.14, -0.2, due), w);
    } else if (g === 'cestino') {
      // La carta sopra il cestino, la si lascia cadere, e ci si spolvera le mani.
      const w = smooth(0, 0.35, u);
      const lascia = smooth(0.85, 1.05, u);
      const batte = smooth(1.15, 1.4, u) * (1 - smooth(2.1, 2.5, u));
      versoMano(1, 0.05, lerp(0.64, ay + 0.24, lascia), 0.29, w * (1 - 0.6 * smooth(1.2, 1.6, u)));
      gomito(1, 0.7, -0.6, -0.3);
      if (!I.foglio) kFoglio = w * (1 - lascia);
      for (let k = 0; k < 2; k++) versoMano(k, (k ? 1 : -1) * (0.07 - (vivo ? 0.035 * Math.max(0, Math.sin(13 * u)) : 0)), ay + 0.27, 0.25, batte);
      accuccia = 0.1 * w * (1 - lascia);
      tx += 0.3 * w * (1 - lascia);
      cx = lerp(cx, 0.32, w * (1 - batte));
    }
  } else if (inPiedi > 0.5 && fermo > 0.6 && !q) {
    // (Chi sta andando a sedersi non comincia niente: e' in piedi solo per un attimo.)
    if (I.fa === 'digita' && (I.foglio || !occupata1)) {
      if (I.foglio) {
        // Lavora in piedi: il foglio davanti, e l'altra mano che ci scrive sopra.
        const l = mF ? 1 : -1;
        mano(mF, l * 0.09, ay + 0.31, 0.26);
        gomito(mF, l * 0.8, -0.6, -0.2);
        const k = 1 - mF;
        if (!(k ? occupata1 : occupata0)) {
          const sc = vivo ? ogniTanto(P, t, 3.4, 2.2, 0.8, 'scrive', 0.3) : null;
          mano(k, l * 0.045 + (sc ? 0.022 * Math.sin(17 * t) * sc.w : 0), ay + 0.335, 0.245);
          gomito(k, -l * 0.8, -0.6, -0.2);
        }
      } else {
        // O sul telefono, a due mani.
        mano(1, 0.075, ay + 0.3, 0.25);
        gomito(1, 0.8, -0.6, -0.2);
        if (!occupata0) {
          mano(0, -0.03 + (vivo ? 0.012 * Math.sin(15 * t + f) : 0), ay + 0.3, 0.262);
          gomito(0, -0.8, -0.6, -0.2);
        }
        kTelefono = 1;
        occupata1 = true;
      }
      tx += 0.05;
      cx = 0.38;
      sy = 1;
      umore = 0.5;
      const su = vivo ? ogniTanto(P, t, 9, 1.5, 0.6, 'alza', 0.4) : null;
      if (su) {
        cx = lerp(cx, 0.05, su.w);
        sy = 1 - su.w;
      }
    } else if (I.ferma) {
      // Fermo da un pezzo, in piedi: le spalle giu', lo sguardo in giro, il telefono.
      tx += 0.1;
      cx = 0.14;
      umore = 0.25;
      if (vivo) {
        cy = 0.6 * Math.sin(0.21 * t + f) * Math.sin(0.13 * t + 2 * f);
        const tel = !occupata1 && ogniTanto(P, t, 15, 7, 0.75, 'telefono', 0.7);
        if (tel) {
          versoMano(1, 0.075, ay + 0.3, 0.25, tel.w);
          gomito(1, 0.8, -0.6, -0.2);
          kTelefono = smooth(0.05, 0.3, tel.w);
          cx = lerp(cx, 0.4, tel.w);
          cy *= 1 - tel.w;
          sy = tel.w;
          occupata1 = true;
        }
      }
    } else if (vivo) {
      // In pausa: ci si guarda attorno, una mano sul fianco, e chi ha la tazza beve.
      cy = 0.45 * Math.sin(0.5 * t + f);
      if (!occupata0 && P.n > 0.45) {
        mano(0, -0.2, ay + 0.02, 0.02);
        gomito(0, -1, -0.1, -0.6);
      }
      const sorso = tazzaInMano ? ogniTanto(P, t, 8, 2.6, 0.85, 'sorso', 0.85) : null;
      if (sorso) {
        versoMano(1, 0.035, testaY() + 0.07, testaZ() + 0.15, sorso.w);
        inclina = 0.55 * smooth(0.5, 1, sorso.w);
        cx = lerp(cx, -0.12, sorso.w);
        cy *= 1 - sorso.w;
        tx -= 0.05 * sorso.w;
      }
    }
  }

  // ====================================================================
  //  sopra tutto il resto: parlare, ascoltare, chiamarti, far festa, le bestie
  // ====================================================================
  /** La mano con cui si puo' fare un gesto: la destra se non regge niente, se no la sinistra, o nessuna. */
  const libera = legge || lib > 0.3 ? -1 : occupata1 ? (occupata0 ? -1 : 0) : 1;
  if (I.parla) {
    // Chi parla muove la bocca e la mano libera, a frasi.
    voce = vivo ? 0.3 + 0.7 * Math.abs(Math.sin(11 * t + f)) * (0.55 + 0.45 * Math.sin(3.1 * t + f)) : 0.5;
    ciglia = 0.35 + (vivo ? 0.35 * Math.sin(1.7 * t + f) : 0);
    umore = 1;
    if (vivo) cx += 0.05 * Math.sin(4.3 * t + f);
    if (libera >= 0 && alBanco < 0.5) {
      const l = libera ? 1 : -1;
      const b = vivo ? Math.sin(5.1 * t + f) : 0;
      mano(libera, l * (0.2 + 0.04 * b), ay + 0.29 + (vivo ? 0.045 * Math.sin(3.4 * t + 2 * f) : 0), 0.25 + 0.03 * b);
      gomito(libera, l * 0.7, -0.7, -0.3);
      // Chi ha tutte e due le mani libere a volte le usa tutte e due.
      if (libera === 1 && !occupata0 && frac(P.n * 7 + Math.floor(t / 4)) > 0.5) {
        mano(0, -0.19 - 0.03 * b, ay + 0.27 + (vivo ? 0.04 * Math.sin(3.4 * t + 2 * f + 1.5) : 0), 0.24);
        gomito(0, -0.7, -0.7, -0.3);
      }
    }
  } else if (I.ascolta) {
    // Chi ascolta annuisce, a tratti.
    umore = 0.9;
    const si = vivo ? ogniTanto(P, t, 2.6, 1.3, 0.75, 'annuisce', 0.25) : null;
    if (si) cx += 0.1 * Math.max(0, Math.sin(si.u * TAU * 2)) * si.w;
  }
  if (I.chiede && libera >= 0) {
    // Ti sta aspettando: il braccio alzato, verso di te.
    const l = libera ? 1 : -1;
    mano(libera, l * 0.3, ay + SPALLA[1] + 0.33, 0.09);
    gomito(libera, l, -0.2, -0.3);
    ciglia = 0.9;
    umore = 1;
  }
  if (I.festa && vivo) {
    // Il saltello di chi ha finito, con lo stesso tempo di quello piatto (office.css): le braccia al cielo.
    const g = (t % 1.8) / 1.8;
    const su = smooth(0.46, 0.6, g) * (1 - smooth(0.84, 0.98, g));
    salto = g > 0.58 && g < 0.84 ? Math.sin(((g - 0.58) / 0.26) * Math.PI) * lerp(0.09, 0.035, e) : 0;
    for (let k = 0; k < 2; k++) {
      if (libera < 0 || (k ? occupata1 : occupata0)) continue;
      versoMano(k, (k ? 1 : -1) * 0.27, ay + SPALLA[1] + 0.34, 0.03, su);
      gomito(k, k ? 1 : -1, 0.2, -0.3);
    }
    tx -= 0.1 * su;
    cx -= 0.15 * su;
    chiusi = Math.max(chiusi, 0.85 * su);
    umore = 1;
  }

  // --- a cosa bada: un punto della stanza. La testa per due terzi, il busto per il resto.
  const bada = I.animale && I.animale.forza > 0.01 && !I.chiede && !I.parla ? I.animale : null;
  const punto = bada ? [bada.x, bada.y, bada.z] : I.guarda;
  if (punto) {
    const w = bada ? clamp(bada.forza * 1.6) : 1;
    locale(P, punto[0], punto[1], punto[2] / U, A);
    const occhiY = testaY() + 0.215;
    const lontano = Math.hypot(A[0], A[2]);
    const gy = clamp(Math.atan2(A[0], A[2]), -1.35, 1.35);
    const gx = clamp(Math.atan2(occhiY - A[1], Math.max(0.2, lontano)), -0.5, bada ? 0.5 : 0.75);
    cy = lerp(cy, gy * 0.7 - by - ty, w);
    ty += gy * 0.22 * w * (alBanco > 0.5 ? 0.4 : 1);
    cx = lerp(cx, gx - tx * 0.6, w);
    sx = lerp(sx, clamp(gy * 0.8, -1, 1), w);
  }
  if (bada && libera >= 0 && !legge) {
    // E la carezza, con la mano libera: ci si piega quanto serve per arrivarci.
    const w = bada.forza;
    locale(P, bada.x, bada.y, bada.z / U + 0.04, A);
    const k = P.mano;
    const l = k ? 1 : -1;
    const sp = ay + SPALLA[1];
    const manca = Math.max(0, Math.hypot(A[0] - l * SPALLA[0], A[1] - sp, A[2]) - 0.33);
    const sotto = Math.max(0, sp - 0.3 - A[1]);
    accuccia = Math.max(accuccia, clamp(sotto * 0.7, 0, 0.2) * w * inPiedi);
    tx += clamp(manca * 1.3 + sotto * 0.4, 0, 0.55) * w * clamp(A[2] * 4 + 0.4);
    tz += clamp(-A[0] * 1.3, -0.4, 0.4) * w * clamp(manca * 5);
    const liscia = vivo ? Math.sin(4.2 * t + f) : 0;
    versoMano(k, A[0] + 0.03 * liscia * w, A[1] + 0.012 * Math.abs(liscia), A[2] - 0.045 * liscia * w, clamp(w * 1.3));
    gomito(k, l * 0.8, -0.3, -0.5);
    FISSA[k] = 1;
    umore = lerp(umore, 1, w);
  } else if (!bada || bada.forza < 0.03) {
    // Con quale mano accarezzera' si decide a mani ferme: quella dalla parte della bestia, se e' libera.
    P.mano = libera < 0 ? 1 : occupata1 ? 0 : occupata0 ? 1 : I.animale && locale(P, I.animale.x, I.animale.y, 0, A)[0] < 0 ? 0 : 1;
  }

  // --- il bacino non sale piu' di quanto le gambe arrivino a terra
  const ay0 = ay;
  ay -= accuccia;
  for (let k = 0; k < 2; k++) {
    const dh = Math.hypot(piedi[k][0] - ax - (k ? 0.082 : -0.082), piedi[k][2] - az);
    const tetto = piedi[k][1] + SUOLA + Math.sqrt(Math.max(0.01, (COSCIA + STINCO - 0.006) ** 2 - dh * dh));
    if (inPiedi > 0.5 && ay > tetto) ay = tetto;
  }
  // Un braccio pende dalla spalla, non da un punto per aria: le mani che non stanno su
  // una cosa della stanza seguono la schiena quando si piega e il bacino quando scende.
  if (inPiedi > 0.5 && !I.gesto) {
    for (let k = 0; k < 2; k++) {
      if (FISSA[k]) continue;
      T[MANO + 3 * k] -= SPALLA[1] * Math.sin(tz);
      T[MANO + 3 * k + 1] += ay - ay0 + SPALLA[1] * (Math.cos(tx) - 1);
      T[MANO + 3 * k + 2] += SPALLA[1] * Math.sin(tx);
    }
  }

  // ====================================================================
  //  le molle, e quello che va troppo svelto per una molla
  // ====================================================================
  T[ANCA_] = ax;
  T[ANCA_ + 1] = ay;
  T[ANCA_ + 2] = az;
  T[BACINO] = bx;
  T[BACINO + 1] = by;
  T[BACINO + 2] = bz;
  T[BUSTO] = tx;
  T[BUSTO + 1] = ty;
  T[BUSTO + 2] = tz;
  T[CAPO] = cx;
  T[CAPO + 1] = cy;
  T[CAPO + 2] = cz;
  T[UMORE] = I.ferma && !I.parla ? Math.min(umore, 0.3) : umore;
  T[CIGLIA] = ciglia;
  T[SX] = sx;
  T[SY] = sy;
  T[K_TAZZA] = kTazza;
  T[K_SUA] = o.tazza && !I.tazza ? 1 : 0;
  T[K_FOGLIO] = kFoglio;
  T[K_FALDONE] = I.faldone ? 1 : 0;
  T[K_LIBRO] = smooth(0.03, 0.3, lib);
  T[K_TELEFONO] = kTelefono;
  T[K_ANNAFFIA] = kAnnaffia;
  T[K_GETTO] = kGetto;
  T[IN_MANO_SUA] = suaPresa;
  T[IN_MANO_FOGLIO] = foglioInMano;
  T[INCLINA] = inclina;
  T[LEGGE] = legge;
  T[VOCE] = voce;
  T[CHIUSI] = chiusi;
  T[SALTO] = salto;
  if (P.primo) {
    // Nata adesso: e' gia' dove deve stare, non ci arriva.
    for (let i = 0; i < N; i++) {
      m[2 * i] = T[i];
      m[2 * i + 1] = 0;
    }
    P.primo = false;
  } else for (let i = 0; i < N; i++) molla(m, i, T[i], SVELTA[i], dt);

  const p = POSA;
  // Il bacino segue il tetto delle gambe subito, non con la molla: se no a ogni passo il piede si stacca da terra.
  p.anca[0] = m[0];
  p.anca[1] = Math.min(m[2], ay) + m[2 * SALTO];
  p.anca[2] = m[4];
  for (let i = 0; i < 3; i++) {
    p.bacino[i] = m[2 * (BACINO + i)];
    p.busto[i] = m[2 * (BUSTO + i)];
    p.capo[i] = m[2 * (CAPO + i)];
    for (let k = 0; k < 2; k++) {
      p.mani[k][i] = m[2 * (MANO + 3 * k + i)];
      p.gomiti[k][i] = m[2 * (GOMITO + 3 * k + i)];
    }
  }
  if (vivo) {
    if (alBanco > 0.5 && I.fa === 'digita' && lib < 0.1) {
      // Le dita: a raffiche, una mano e poi l'altra. Solo se le mani sono davvero sui tasti.
      const raffica = 0.5 + 0.5 * Math.sin(1.9 * t + f) > 0.25 ? 1 : 0.15;
      for (let k = 0; k < 2; k++) {
        sulBanco(P, q, 0, PIANO_M + 0.062, TASTI, A);
        if (Math.abs(p.mani[k][1] - A[1]) < 0.03) p.mani[k][1] -= 0.014 * raffica * Math.max(0, Math.sin((23 + 5 * I.ritmo) * t + k * Math.PI + f));
      }
    }
    if (I.gesto === 'lava' && inPiedi > 0.5) {
      // Strofinare: le due mani in tondo, una al contrario dell'altra.
      const u = t - I.gestoDa;
      const giro = u % 2.4;
      const sc = smooth(1.9, 2.05, giro) * (1 - smooth(2.3, 2.4, giro));
      for (let k = 0; k < 2; k++) {
        const l = k ? 1 : -1;
        p.mani[k][0] += l * 0.026 * Math.sin(15 * u) * (1 - sc) + 0.03 * Math.sin(48 * u) * sc;
        p.mani[k][2] += 0.02 * Math.cos(15 * u + k * Math.PI) * (1 - sc);
      }
    }
    if (I.chiede && libera >= 0) p.mani[libera][0] += 0.09 * Math.sin(7 * t + f);
    // Il respiro, e gli occhi che si chiudono un attimo.
    p.fiato = Math.sin(1.9 * t + f);
    const batte = ogniTanto(P, t, 3.3, 0.16, 0.95, 'ciglia', 0.07);
    p.chiusi = Math.max(m[2 * CHIUSI], batte ? batte.w : 0);
  } else {
    p.fiato = 0;
    p.chiusi = m[2 * CHIUSI];
  }
  p.sx = m[2 * SX];
  p.sy = m[2 * SY];
  p.ciglia = m[2 * CIGLIA];
  p.umore = m[2 * UMORE];
  p.voce = m[2 * VOCE];
  fig.posa(p);

  // ====================================================================
  //  le cose: in mano, o posate dove stanno
  // ====================================================================
  const h0 = fig.mani[0];
  const h1 = fig.mani[1];
  const piega = m[2 * INCLINA];
  fig.tieni('tazza', m[2 * K_TAZZA], h1.x + PRESA[0], h1.y + PRESA[1], h1.z + PRESA[2], -piega, 0, 0);
  if (o.tazza) {
    const w = clamp(m[2 * IN_MANO_SUA]);
    if (P.suaDove) locale(P, P.suaDove[0], P.suaDove[1], PIANO_M, B);
    else B[0] = B[1] = B[2] = 0;
    fig.tieni('sua', m[2 * K_SUA], lerp(B[0], h1.x + PRESA[0], w), lerp(B[1], h1.y + PRESA[1], w), lerp(B[2], h1.z + PRESA[2], w), -piega * w, P.suaDove ? (q ? q.a : 0) - P.a + 0.6 : 0, 0);
  }
  if (m[2 * K_FOGLIO] > 0.02) {
    // Il foglio: in mano, o posato sul piano accanto alla tastiera mentre si lavora.
    const h = mF ? h1 : h0;
    const w = clamp(m[2 * IN_MANO_FOGLIO]);
    if (q && w < 0.99) sulBanco(P, q, FOGLIO_POSATO[0], PIANO_M + 0.004, FOGLIO_POSATO[1], B);
    else {
      B[0] = h.x;
      B[1] = h.y;
      B[2] = h.z;
    }
    fig.tieni('foglio', m[2 * K_FOGLIO], lerp(B[0], h.x, w), lerp(B[1], h.y + 0.03, w), lerp(B[2], h.z + 0.07, w), -0.75 * w, lerp(q ? q.a - P.a + 0.25 : 0, 0, w), 0);
  } else fig.tieni('foglio', 0);
  fig.tieni('faldone', m[2 * K_FALDONE], h0.x + 0.035, h0.y - 0.02, h0.z - 0.03, 0.1, 0, 0);
  if (m[2 * K_LIBRO] > 0.02) {
    // Il libro sta fra le due mani, aperto verso la faccia: non segue la mano che gira pagina.
    fig.tieni('libro', m[2 * K_LIBRO], 0, LIBRO[1], LIBRO[2], lerp(-0.25, -0.95, ease(lib)), 0, 0);
  } else fig.tieni('libro', 0);
  fig.tieni('telefono', m[2 * K_TELEFONO], h1.x - 0.025, h1.y + 0.035, h1.z + 0.03, -0.9, 0.25, 0);
  if (m[2 * K_ANNAFFIA] > 0.02) {
    fig.tieni('annaffiatoio', m[2 * K_ANNAFFIA], h1.x, h1.y - 0.07, h1.z + 0.085, piega, 0, 0);
    // L'acqua parte dalla punta del becco, e cade dritta comunque sia girato l'annaffiatoio.
    const c = Math.cos(piega);
    const s = Math.sin(piega);
    fig.tieni('getto', m[2 * K_GETTO], h1.x, h1.y - 0.07 + 0.128 * c - 0.168 * s, h1.z + 0.085 + 0.128 * s + 0.168 * c, 0, 0, 0);
  } else {
    fig.tieni('annaffiatoio', 0);
    fig.tieni('getto', 0);
  }
}
