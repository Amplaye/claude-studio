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
 *     di un passo e mezzo — che arrotonda le curve, fa partire in due passi e fermare
 *     in uno e mezzo — si scosta per non urtare chi incrocia, e quando la meta e' una
 *     sedia o un mobile va a mettersi dove serve davvero: di fianco alla sedia, a un
 *     braccio dalla macchina.
 *
 *   - I PIEDI stanno per terra, e il bacino sta dove le gambe lo tengono. La gamba e'
 *     un tubo senza ginocchio (people.js): appoggiata e' dritta, e la scarpa ci rotola
 *     sopra dal tacco alla punta senza strisciare finche' non tocca a lei; in aria si
 *     accorcia e si incurva, e passa sopra il pavimento. Il bacino e' un pendolo
 *     rovesciato sul piede a terra: alto con la gamba dritta sotto, piu' basso coi
 *     piedi lontani. Chi gira su se stesso sposta i piedi invece di ruotare come su
 *     un piatto.
 *
 *   - Niente SCATTA. Ogni gesto dice solo dove dovrebbero stare adesso le mani, la
 *     schiena, la testa; a portarcele e' una molla per ogni numero, senza rimbalzo.
 *     Passare da un gesto all'altro, o lasciarne uno a meta', non ha bisogno di
 *     nessun raccordo scritto a mano.
 *
 * Con le animazioni ridotte (`calmo`) si ferma quello che si muove da solo — il
 * respiro, le dita sui tasti, lo sguardo che gira — e resta quello che succede
 * davvero: camminare (braccia e bacino compresi), sedersi, prendere una tazza.
 */
import { U, TAU, clamp, ease, lerp, giro as corto, hash, rnd, smooth, pulse } from './kit.js';
import { ANCA, ANCHE, CAVIGLIA, SCARPA, SEDUTO, SPALLA, COLLO, OMERO, AVAMBRACCIO, corda } from './people.js';

/**
 * La gamba e' un tubo morbido: a meta' passo quella in aria si accorcia di tanto (metri) e
 * si incurva in avanti; quella di chi sta seduto e' incurvata di un angolo retto, la coscia
 * in piano e lo stinco giu'. La corda di quell'arco, e quanto sta alta la caviglia con la
 * suola piatta per terra.
 */
const IN_ARIA = 0.045;
const CORDA_SEDUTA = corda(Math.PI / 2);
const CAVIGLIA_SU = -(SCARPA.centro[1] + CAVIGLIA) + SCARPA.raggi[1];
/**
 * La gamba di chi ha il bacino a `ay` metri e la suola piatta per terra, avanti quanto basta
 * perche' il tubo faccia l'angolo retto (piu' in alto, la caviglia resta sotto e il tubo si
 * incurva meno): `th` com'e' inclinata la corda, `d` quanto e' lunga, `X` quanto avanti
 * all'anca la scarpa tocca terra.
 */
const SEDE = { th: 0, d: CAVIGLIA, X: 0 };
function inSeduta(ay) {
  const giu = ay - CAVIGLIA_SU;
  const X = Math.sqrt(Math.max(0, CORDA_SEDUTA * CORDA_SEDUTA - giu * giu));
  SEDE.th = Math.atan2(X, giu);
  SEDE.d = Math.min(CAVIGLIA, Math.hypot(X, giu));
  SEDE.X = SEDE.d * Math.sin(SEDE.th) + SCARPA.centro[2];
  return SEDE;
}

// ---------------------------------------------------------------------
//  le misure
// ---------------------------------------------------------------------
/** Il passo della stanza piatta, in unita' al secondo (VELOCITA in room.js). */
const PASSO = 32;
/** Quanto e' lungo un passo a quella velocita', in metri. La cadenza e' quella che ne viene, e non cambia: chi va piu' svelto allunga il passo. */
const FALCATA = 0.5;
/** Da quanto lontano si punta dritto alla sedia o al mobile, invece che al punto della stanza piatta. */
const VICINO = 34;
/**
 * Si segue il gemello piatto alla velocita' che basta per fermarsi giusto dove sta lui
 * adesso, frenando di FRENA unita' al secondo ogni secondo. Camminando gli si sta cosi'
 * un passo e mezzo indietro, ed e' quello che arrotonda le curve; e quando lui si ferma
 * ci si ferma in un passo e mezzo. Chi parte arriva al passo in due passi (PARTE); in
 * cammino non si gira piu' svelti di GIRA radianti al secondo, da fermi di GIRA_FERMO.
 */
const FRENA = 46;
const PARTE = 36;
const GIRA = 3;
const GIRA_FERMO = 6;
/** Gli incroci: chi sta per passare a meno di INCROCIO da un altro in piedi si scosta a destra, fino a SCOSTA, e chi gli va dietro rallenta. */
const INCROCIO = 0.45 * U;
const SCOSTA = 0.25 * U;
/**
 * Sedersi senza ginocchia. Il sedile sta a due dita dal piano, e una gamba senza ginocchio
 * non ci passa in mezzo: ne' scendendo di fianco alla sedia, ne' girando la sedia con le
 * gambe gia' avanti (passerebbero dentro il fianco della scrivania). Quindi la sedia si
 * tira indietro di tanto, ci si mette in piedi dove stava, girati verso il banco, ci si
 * siede e la sedia rientra; ci si alza al contrario. Le gambe vanno sotto il piano
 * dall'apertura davanti.
 */
const FUORI = 0.45 * U;
/** Quanto ci si mette a sedersi, ad alzarsi, e a far rientrare o uscire la sedia. */
const SIEDE_IN = 0.95;
const ALZA_IN = 0.85;
const RIENTRA_IN = 0.6;
/**
 * Seduti si sta verso il bordo del sedile, di tanto (metri): la coscia esce dal bacino
 * quasi in piano e ci passa sopra, poi la gamba scende morbida a terra. Le gambe un po'
 * aperte, di tanto per parte (radianti).
 */
const SUL_BORDO = 0.17;
const DIVARICA = 0.2;
/** Quanto puo' girare la sedia con chi ci siede (i piedi restano dove sono, sotto il piano): il resto lo fanno busto e testa. */
const GIRA_SEDUTO = 0.25;
/** A quanto ci si ferma dal fronte di uno scaffale per usarlo, da quello di un bancone, e dall'orlo di una pianta o del cestino. */
export const SBRACCIO = 0.26 * U;
export const AL_BANCONE = 0.2 * U;
export const ACCANTO = 0.27 * U;
/** E di quanto ci si mette di fianco a quello che si tocca, invece che davanti: chi guarda sta alle spalle. */
export const DI_FIANCO = 0.33 * U;
/** I piedi: quanto sono larghi, quanta parte del ciclo stanno a terra (meta': uno si stacca quando l'altro atterra), e sotto che velocita' non e' un passo. */
const LARGO = 0.085 * U;
const A_TERRA = 0.5;
const LENTO = 3;
const FUORI_POSTO = 0.06 * U;
/** Quanto passa sopra il pavimento il piede in aria, a meta' strada, in metri; e quanto dura un passetto da fermi. */
const SOPRA = 0.014;
const PASSETTO = 0.24;
/** Col passo, in fase: di quanto il bacino ondeggia sul piede a terra (metri) e gira (radianti); le spalle girano al contrario per tre quarti. */
const ONDA = 0.012;
const GIRO_BACINO = 0.07;
const SPALLE = 0.75;
/** Le braccia col passo: di quanto vanno avanti e indietro alla spalla, e il gomito, piu' piegato davanti che dietro. */
const BRACCIO_VA = 0.3;
const GOMITO_DIETRO = 0.26;
const GOMITO_AVANTI = 0.7;
/** Dalla mano alla base della tazza che regge. */
const PRESA = [0, -0.045, 0.075];
/** Fin dove arriva una mano dalla spalla, col gomito appena piegato. */
const BRACCIO = OMERO + AVAMBRACCIO - 0.015;
/**
 * Il giro del caffe', in secondi da quando comincia il gesto: quando la tazza sta
 * sotto il becco invece che in mano, e quando la macchina versa. Lo specchio accende
 * la tazza e il getto della macchina su questi stessi tempi (mirror.js).
 */
export const CAFFE = { sotto: [0.5, 2.15], versa: [1.05, 1.9] };
/** Dopo quanto la mano allungata verso la rastrelliera ha la tazza: fino a li' resta sul ripiano. */
export const PRESA_DOPO = 0.34;
/** Quanto ci si mette a posare sul piano la tazza che ci si e' portati, e a riprenderla per tornare al bar. */
const POSA_IN = 0.55;
export const RIPRENDE_IN = 0.35;
/** Dopo quanto lavoro si tira fuori il libro. */
export const LIBRO_DOPO = 10 * 60 * 1000;

// ---- i canali: ogni numero della posa ha la sua molla
const N = 41;
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
const K_FOGLIO = 29;
const K_FALDONE = 30;
const K_LIBRO = 31;
const K_TELEFONO = 32;
const K_ANNAFFIA = 33;
const K_GETTO = 34;
const IN_MANO_FOGLIO = 35;
const INCLINA = 36; // la tazza alla bocca, l'annaffiatoio sulla pianta
const LEGGE = 37;
const VOCE = 38;
const CHIUSI = 39;
const SALTO = 40;
/** Quanto e' svelta ogni molla (rad/s): il corpo piano, le mani un po' di piu', la faccia subito. */
const SVELTA = new Float64Array(N).fill(9);
for (let i = CAPO; i < CAPO + 3; i++) SVELTA[i] = 10;
for (let i = MANO; i < MANO + 6; i++) SVELTA[i] = 12;
for (let i = UMORE; i <= SY; i++) SVELTA[i] = 14;
for (let i = K_TAZZA; i <= K_GETTO; i++) SVELTA[i] = 16;
// La tazza del bar non sfuma: passa dalla mano al ripiano, al becco, al lavandino, alla
// scrivania, e in quei posti c'e' la sua gemella della stanza che si accende nello stesso istante.
SVELTA[K_TAZZA] = 400;
SVELTA[IN_MANO_FOGLIO] = 11;
SVELTA[LEGGE] = 3.4;
SVELTA[VOCE] = 26;
SVELTA[CHIUSI] = 40;
SVELTA[SALTO] = 22;
/* L'altezza e il traverso del bacino non hanno molla: li tengono le gambe. I loro canali
   vanno svelti quanto le mani e dicono di quanto la molla delle mani resta indietro al
   passo: chi ha le mani appese al corpo le ritrova dove deve, e non dove il bacino era. */
SVELTA[ANCA_ + 1] = SVELTA[MANO];

const frac = (x) => x - Math.floor(x);
const verso = (v, a, passo) => (v < a ? Math.min(a, v + passo) : Math.max(a, v - passo));

// ---------------------------------------------------------------------
//  la scarpa che rotola
// ---------------------------------------------------------------------
/*
 * Appoggiata, la gamba e' dritta, e di profilo la suola e' un'ellisse (SCARPA in people.js):
 * per ogni inclinazione θ della gamba (in avanti positiva) la scarpa tocca terra in un
 * punto solo — verso il tacco con la gamba avanti, verso la punta con la gamba
 * dietro — e passando dall'uno all'altro ci rotola sopra senza strisciare. Qui, per
 * ogni θ, una volta sola: quanto sta alta l'anca (`ALTEZZA`), quanto avanti all'anca sta
 * il punto che tocca (`TOCCA`), e dove sta l'anca rispetto all'inizio della suola
 * srotolata per terra (`ROTOLA`). Servono a decidere dove atterra un piede; quello a
 * terra rotola esatto, in avanti e di fianco insieme (`terra`).
 */
const NR = 250;
const MR = 1.25;
const ALTEZZA = new Float64Array(NR + 1);
const TOCCA = new Float64Array(NR + 1);
const ROTOLA = new Float64Array(NR + 1);
{
  const [, cy, cz] = SCARPA.centro;
  const [, ry, rz] = SCARPA.raggi;
  const curva = (th) => (ry * ry * rz * rz) / Math.hypot(rz * Math.sin(th), ry * Math.cos(th)) ** 3;
  let s = 0;
  for (let i = 0; i <= NR; i++) {
    const th = MR - (2 * MR * i) / NR;
    const sn = Math.sin(th);
    const cs = Math.cos(th);
    const q = Math.hypot(rz * sn, ry * cs);
    // Il punto che tocca, nello spazio della gamba: `b` in avanti, `a` in su.
    const b = cz - (rz * rz * sn) / q;
    const a = cy - (ry * ry * cs) / q;
    if (i) s +=((curva(th) + curva(th + (2 * MR) / NR)) * MR) / NR;
    ALTEZZA[i] = -(a * cs + b * sn);
    TOCCA[i] = b * cs - a * sn;
    ROTOLA[i] = s - TOCCA[i];
  }
}
/** Dov'e' θ nella tabella, come indice con la virgola. */
const indice = (th) => clamp(((MR - th) * NR) / (2 * MR), 0, NR - 1e-9);
/** Il valore della tabella `Y` all'inclinazione θ. */
function tab(Y, th) {
  const f = indice(th);
  const i = Math.floor(f);
  return Y[i] + (Y[i + 1] - Y[i]) * (f - i);
}
/** L'inclinazione a cui la tabella `Y`, che cresce (o cala, `cala`) fra gli indici `da` e `a`, vale `y`. */
function inclina(Y, y, da = 0, a = NR, cala = false) {
  const k = cala ? -1 : 1;
  if (k * (y - Y[da]) <= 0) return MR - (2 * MR * da) / NR;
  if (k * (y - Y[a]) >= 0) return MR - (2 * MR * a) / NR;
  while (a - da > 1) {
    const m = (da + a) >> 1;
    if (k * (Y[m] - y) <= 0) da = m;
    else a = m;
  }
  return MR - (2 * MR * (da + (y - Y[da]) / (Y[a] - Y[da]))) / NR;
}
/** Dove l'anca sta piu' alta: da li' in avanti la gamba atterra sul tacco. */
const IN_CIMA = ALTEZZA.indexOf(Math.max(...ALTEZZA));
/** La gamba avanti che tiene l'anca a quell'altezza, poggiata sul tacco. */
const sulTacco = (h) => inclina(ALTEZZA, h, 0, IN_CIMA);
/**
 * E di fianco. La gamba inclinata di θ in avanti e φ di traverso: quanto sta alta l'anca
 * quando la scarpa tocca (`h`), e di quanto il punto che tocca sta di fianco all'anca
 * (`lat`). Esatto sull'uovo: di traverso la suola e' tonda, e la scarpa che si inclina
 * ci rotola sopra come fa in avanti.
 */
const SU = { h: 0, lat: 0 };
function suola(th, fi) {
  const ct = Math.cos(th);
  const cf = Math.cos(fi);
  const sf = Math.sin(fi);
  const [rx, ry, rz] = SCARPA.raggi;
  const [, cy, cz] = SCARPA.centro;
  const a = ct * sf * rx;
  const b = ct * cf * ry;
  const n = Math.hypot(a, b, Math.sin(th) * rz);
  SU.h = n - ct * cf * cy - Math.sin(th) * cz;
  SU.lat = sf * (-cy + (ry * b) / n) - (cf * rx * a) / n;
  return SU;
}
/** Quanta suola si e' srotolata di traverso inclinando la gamba di φ (in metri, verso -x quando φ cresce): come `ROTOLA` in avanti. */
function traverso(fi) {
  const [rx, ry] = SCARPA.raggi;
  const r = (p) => (rx * rx * ry * ry) / Math.hypot(rx * Math.sin(p), ry * Math.cos(p)) ** 3;
  return (-fi / 12) * (r(0) + 4 * r(fi / 4) + 2 * r(fi / 2) + 4 * r((3 * fi) / 4) + r(fi));
}
/** L'inclinazione di traverso per cui, con la gamba inclinata di θ in avanti, il punto che tocca sta `lat` metri di fianco all'anca: dove atterra il piede in aria. */
function fianco(th, lat) {
  const y = (fi) => suola(th, fi).lat;
  let fi = clamp(lat / 0.69, -0.6, 0.6);
  for (let i = 0; i < 3; i++) {
    const d = y(fi);
    fi = clamp(fi - ((d - lat) * 1e-4) / (y(fi + 1e-4) - d), -0.7, 0.7);
  }
  return fi;
}
/**
 * Il passo che torna su se stesso. Per un passo lungo `s` metri: la gamba che atterra
 * inclinata di θ, quando l'anca ha fatto il passo, e' inclinata dietro quanto basta a
 * tenerla alta come quando era atterrata — e li' si stacca, mentre l'altra atterra uguale.
 * E' a quell'inclinazione che conviene atterrare: anche un passo zoppo, uno lungo e uno
 * corto, terrebbe le altezze pari, ma non sarebbe un passo.
 */
const PARI = new Float64Array(101);
for (let i = 0; i <= 100; i++) {
  let da = MR - (2 * MR * IN_CIMA) / NR;
  let a = MR;
  for (let j = 0; j < 30; j++) {
    const th = (da + a) / 2;
    if (tab(ALTEZZA, th) > tab(ALTEZZA, inclina(ROTOLA, tab(ROTOLA, th) + i / 100))) da = th;
    else a = th;
  }
  PARI[i] = (da + a) / 2;
}
const pari = (s) => {
  const f = clamp(s * 100, 0, 100 - 1e-9);
  const i = Math.floor(f);
  return PARI[i] + (PARI[i + 1] - PARI[i]) * (f - i);
};

// ---------------------------------------------------------------------
//  chi e'
// ---------------------------------------------------------------------
/**
 * Un piede. `x, y` e' il punto della stanza dove la scarpa tocca terra (o la
 * toccherebbe, se e' in aria), `z` quanto la suola sta sopra il pavimento, in metri.
 * Appoggiato ha un'ancora per terra (`ox, oy`: dove comincerebbe la sua suola
 * srotolata) e un verso `a`, e la sua gamba e' inclinata di `th` in avanti e `fi` di
 * fianco; `h` e' quanto alta deve stare la sua anca perche' la scarpa tocchi con la gamba
 * dritta, e `d` quanto e' lunga la gamba adesso, dall'anca alla caviglia (piu' corta, il tubo si incurva). In aria,
 * `u` (o `s`, da fermi) dice a che punto e' del passo, e `th0, fi0, a0` com'era la
 * gamba quando si e' alzato. `giu` e `via`: atterra, si stacca, adesso.
 */
const piede = (x, y) => ({ x, y, z: 0, su: false, aTempo: false, s: 0, u: 0, ox: x, oy: y, a: 0, th: 0, fi: 0, h: ANCA, d: CAVIGLIA, corto: 0, vth: 0, vfi: 0, sp: 0, L: [0, 0, 0], W: [x, y], th0: 0, fi0: 0, a0: 0, giu: false, via: false });

/** Una persona in movimento: dove sta, i suoi piedi, le sue molle. `x, y` in unita' di stanza. */
export function nuovo(fig, x, y) {
  const P = {
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
    /** Quanto e' tirata indietro la sua sedia (0..1), e quale. */
    fuori: 0,
    tirata: null,
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
    piedi: [piede(x, y), piede(x, y)],
    /** Dove e' passato il gemello (per non tagliare gli spigoli), e di quanto ci si scosta a destra per non urtare qualcuno. */
    scia: [],
    scosta: 0,
    evita: null,
    evitaDi: 0,
    /** Verso dove va la strada (radianti): gira ad arco, non a spigolo. */
    dir: 0,
    andava: false,
    sedeva: false,
    /** Il passo adesso (unita'), e quanto sono larghi i piedi da fermi. */
    lungo: FALCATA * U,
    largo: LARGO,
    /** Il bacino come lo tengono le gambe: di traverso, in avanti e come gira (`bac`), quanto e' alto e quanto si inclina (`hy`, `rollio`). */
    bac: [0, 0, 0],
    hy: ANCA,
    rollio: 0,
    offY: 0,
    offR: 0,
    /** Le gambe com'erano quando ci si e' cominciati a sedere. */
    seduta: null,
    m: new Float64Array(N * 2),
    primo: true,
    mano: 0,
    /** La tazza del bar fra la mano e il piano della scrivania: la regge ancora anche se la stanza piatta l'ha gia' posata, la sta riprendendo, ce l'ha in mano (vedi atteggia). */
    regge: false,
    reggeT: 0,
    riprende: 0,
    beve: false,
    avevaTazza: false,
    avevaPiena: false,
  };
  P.piedi.forEach((f, k) => appoggia(f, riposo(P, k), 0, P.a));
  return P;
}

/** Il piede si appoggia nel punto `c` [x, y], col verso `a` e la gamba inclinata di `th` in avanti e `fi` di traverso: da li' in poi ci rotola sopra. */
function appoggia(f, c, th, a, fi = 0) {
  f.x = c[0];
  f.y = c[1];
  f.a = a;
  f.th = th;
  f.fi = fi;
  ancora(f);
  // Il punto della scarpa che tocca, e dove tocca: da qui la scarpa ci rotola sopra (`terra`).
  sotto(a, th, fi, f.L);
  f.W[0] = c[0];
  f.W[1] = c[1];
  f.su = f.aTempo = false;
}

/** Dove comincerebbe la suola srotolata (`ox, oy`): serve a chi indovina dove atterrera' l'altro piede (`aria`). */
function ancora(f) {
  const S = (tab(ROTOLA, f.th) + tab(TOCCA, f.th)) * U;
  const T = traverso(f.fi) * U;
  const ux = Math.sin(f.a);
  const uy = Math.cos(f.a);
  f.ox = f.x - ux * S - uy * T;
  f.oy = f.y - uy * S + ux * T;
}

/**
 * La gamba dritta girata di `a` (verso del piede), `th` in avanti e `fi` di fianco: dove
 * va un punto `L` della gamba (metri, l'anca e' l'origine), nella stanza. E' la stessa
 * rotazione della figura: Ry(a)·Rx(-th)·Rz(fi).
 */
function gira3(a, th, fi, L, out) {
  const cf = Math.cos(fi);
  const sf = Math.sin(fi);
  const ct = Math.cos(th);
  const st = Math.sin(th);
  const x = cf * L[0] - sf * L[1];
  const y1 = sf * L[0] + cf * L[1];
  const y = y1 * ct + L[2] * st;
  const z = -y1 * st + L[2] * ct;
  out[0] = x * Math.cos(a) + z * Math.sin(a);
  out[1] = y;
  out[2] = -x * Math.sin(a) + z * Math.cos(a);
  return out;
}
/** Il punto piu' basso della scarpa con la gamba girata cosi', nello spazio della gamba: lo scrive in `L`, e torna quanto sta sotto l'anca. */
const V3 = [0, 0, 0];
function sotto(a, th, fi, L) {
  // in giu', visto dalla gamba
  const ct = Math.cos(th);
  const g = [-ct * Math.sin(fi), -ct * Math.cos(fi), -Math.sin(th)];
  const R = SCARPA.raggi;
  const n = Math.sqrt(g[0] * g[0] * R[0] * R[0] + g[1] * g[1] * R[1] * R[1] + g[2] * g[2] * R[2] * R[2]);
  for (let i = 0; i < 3; i++) L[i] = SCARPA.centro[i] + (R[i] * R[i] * g[i]) / n;
  return -gira3(a, th, fi, L, V3)[1];
}

/** Dove tocca terra, da fermo, il piede `k`: sotto la sua anca, coi piedi larghi `P.largo`. */
const RIPOSO = [0, 0];
function riposo(P, k) {
  const x = (k ? 1 : -1) * P.largo;
  const z = tab(TOCCA, 0) * U;
  const s = Math.sin(P.a);
  const c = Math.cos(P.a);
  RIPOSO[0] = P.x + x * c + z * s;
  RIPOSO[1] = P.y - x * s + z * c;
  return RIPOSO;
}

/** Dove tocca terra, seduto al posto `q`, il piede `k`: avanti dal bordo del sedile, sotto il piano. */
function sottoIlPiano(q, k, out) {
  const l = k ? 1 : -1;
  const X = inSeduta(SEDUTO).X;
  const x = l * ANCHE + X * Math.sin(l * DIVARICA);
  const z = SUL_BORDO + X * Math.cos(l * DIVARICA);
  const s = Math.sin(q.a);
  const c = Math.cos(q.a);
  out[0] = q.x + (x * c + z * s) * U;
  out[1] = q.y + (-x * s + z * c) * U;
  return out;
}

/** Gia' seduto al posto `q`, senza la strada per arrivarci: per chi era li' da prima che si accendesse il 3D. */
export function siediSubito(P, q) {
  P.posto = q;
  P.sit = P.gira = 1;
  P.x = q.x;
  P.y = q.y;
  P.a = q.a;
  P.piedi.forEach((f, k) => appoggia(f, sottoIlPiano(q, k, [0, 0]), inSeduta(SEDUTO).th, q.a + (k ? 1 : -1) * DIVARICA));
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
    /** Gli altri (le persone dello specchio, per non urtarli) e i piani delle scrivanie (per non tagliarne gli spigoli). */
    gente: null,
    banchi: null,
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
    /** Quante tazze porta (chi le ha appena lavate, piu' d'una), e con che mano: quella dalla parte dove la posa sulla sua scrivania. */
    tazze: 0,
    manoTazza: 1,
    /** Sulla sua scrivania c'e' la tazza che si e' portato dal bar. */
    piena: false,
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
/**
 * La strada dritta da un punto all'altro taglia il piano della scrivania `t`
 * (`banco.top`)? Le postazioni sono girate, e uno spigolo sporge verso la corsia: chi
 * punta dritto al fianco della sedia da lontano ci passa attraverso con le gambe.
 * Si guarda il piano allargato di mezza persona.
 */
function taglia(x0, y0, x1, y1, t) {
  if (!t || !t.w) return false;
  const s = Math.sin(t.a);
  const c = Math.cos(t.a);
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 3);
  for (let i = 0; i <= n; i++) {
    const dx = x0 + ((x1 - x0) * i) / (n || 1) - t.x;
    const dy = y0 + ((y1 - y0) * i) / (n || 1) - t.y;
    if (Math.abs(dx * c - dy * s) < t.w / 2 + 4.5 && Math.abs(dx * s + dy * c) < t.d / 2 + 4.5) return true;
  }
  return false;
}

/** La stanza si e' spostata sotto i piedi (una finestra tirata): ci si sposta con lei, senza un passo. */
function trasla(P, dx, dy) {
  P.x += dx;
  P.y += dy;
  P.scia.length = 0;
  for (const f of P.piedi) {
    f.x += dx;
    f.y += dy;
    f.ox += dx;
    f.oy += dy;
    f.W[0] += dx;
    f.W[1] += dy;
  }
}

/**
 * Un fotogramma di strada. Aggiorna `P.x, P.y, P.a`, quanto e' seduto (`sit`) e
 * sistemato al banco (`gira`), i piedi, e `P.sedia`: l'angolo che deve avere la sua
 * sedia adesso, o null se e' libera.
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

  // Il posto dove va c'e' gia' seduto un altro (la stanza piatta ne mette due alla stessa
  // scrivania): non gli si siede in braccio, ci si ferma accanto, in piedi, girati verso di lui.
  const altro = P.sit <= 0 && I.posto && I.gente ? I.gente.find((Q) => Q !== P && Q.posto === I.posto && Q.sit > 0) : null;
  const q = altro ? null : I.posto;
  const siede = !!q && I.fermo;
  // La sedia e' sua finche' ci sta andando o ci sta sopra.
  if (P.sit <= 0 && q !== P.posto) P.posto = q;
  const s = P.posto;
  // La sedia non c'e' piu' (la stanza e' stata rimontata senza): in piedi, e basta.
  if (!s) P.sit = P.gira = 0;
  let gx = I.fx;
  let gy = I.fy;
  let fronte = I.fronte;
  if (altro && Math.hypot(I.fx - I.tx, I.fy - I.ty) < VICINO) {
    const o = I.posto;
    const l = Math.sign((P.x - o.x) * Math.cos(o.a) - (P.y - o.y) * Math.sin(o.a)) || 1;
    gx = o.x + Math.cos(o.a) * l * 0.6 * U;
    gy = o.y - Math.sin(o.a) * l * 0.6 * U;
    fronte = Math.atan2(altro.x - gx, altro.y - gy);
  }
  let inPosto = false;
  let tira = 0;
  P.sedia = null;
  // La sedia di cui occuparsi: la sua, o quella da cui si e' appena alzato, ancora tirata indietro.
  const sd = s || P.tirata;
  if (sd) {
    // In piedi dove sta la sedia quando e' al banco (un palmo piu' indietro, che le scarpe non
    // tocchino il banco), girati verso il banco; la sedia, tirata indietro.
    const Sx = sd.x - Math.sin(sd.a) * 0.06 * U;
    const Sy = sd.y - Math.cos(sd.a) * 0.06 * U;
    // Fra il banco e la sedia tirata indietro si entra e si esce di lato: chi viene da dietro,
    // passando dritto, ci finirebbe addosso. (`Lx`, `Ly`) e' il punto accanto, dalla parte giusta.
    const sa = Math.sin(sd.a);
    const ca = Math.cos(sd.a);
    const avanti = (P.x - Sx) * sa + (P.y - Sy) * ca;
    const fianco = (P.x - Sx) * ca - (P.y - Sy) * sa;
    const varco = avanti > -0.12 * U && Math.abs(fianco) < 0.55 * U;
    const parte = Math.sign(P.sit > 0 || varco ? (I.tx - Sx) * ca - (I.ty - Sy) * sa : fianco) || 1;
    const Lx = Sx + ca * parte * 0.6 * U;
    const Ly = Sy - sa * parte * 0.6 * U;
    if (P.sit > 0) {
      // Giu': ci si siede sulla sedia tirata indietro, e la sedia rientra. Su: il contrario.
      if (siede && q === s) {
        if (P.sit < 1) P.sit = Math.min(1, P.sit + dt / SIEDE_IN);
        else P.gira = Math.min(1, P.gira + dt / RIENTRA_IN);
      } else if (P.gira > 0) P.gira = Math.max(0, P.gira - dt / RIENTRA_IN);
      else P.sit = Math.max(0, P.sit - dt / ALZA_IN);
      if (P.sit >= 1) P.ox = P.oy = P.oa = 0;
      tira = 1 - ease(P.gira);
      const e = ease(P.sit);
      // (Uno sgabello non ha una sedia che si sposta: ci si siede dove sta.)
      const fuori = s.sedia ? FUORI * tira : 0;
      P.x = lerp(Sx, s.x - sa * fuori, e) + P.ox * (1 - e);
      P.y = lerp(Sy, s.y - ca * fuori, e) + P.oy * (1 - e);
      // Seduto guarda lo schermo. Per girarsi verso qualcuno la sedia gira di poco — i
      // piedi stanno sotto il piano — e il resto lo fanno il busto e la testa.
      const giro = clamp(corto(s.a, P.verso) * 0.62, -GIRA_SEDUTO, GIRA_SEDUTO) * ease(P.cam);
      P.a = s.a + P.oa * (1 - e) + giro * ease(P.gira);
      P.sedia = P.a;
      P.vel = 0;
      inPosto = true;
      // (Finche' la strada dritta taglia lo spigolo della scrivania si resta dietro al gemello piatto, che gira al largo.)
    } else if (s && q === s && Math.hypot(I.fx - s.p2[0], I.fy - s.p2[1]) < VICINO && (I.fermo || !taglia(P.x, P.y, Sx, Sy, s.top))) {
      // Chi arriva si fa posto: la sedia esce prima che ci arrivi, e si entra di lato.
      const dentro = varco || avanti > -0.12 * U;
      gx = dentro ? Sx : Lx;
      gy = dentro ? Sy : Ly;
      fronte = s.a;
      P.sedia = s.a;
      tira = 1;
      // Arrivato dove stava la sedia, girato, coi piedi fermi, la sedia fuori: ci si siede.
      if (siede && (P.fuori >= 1 || !s.sedia) && Math.hypot(P.x - Sx, P.y - Sy) < 1.6 && Math.abs(corto(P.a, s.a)) < 0.3 && !P.piedi[0].su && !P.piedi[1].su) {
        P.sit = 0.001;
        P.gira = 0;
        P.ox = P.x - Sx;
        P.oy = P.y - Sy;
        P.oa = corto(s.a, P.a);
        // Le gambe partono da come sono: il primo pezzo della seduta le prende da li'.
        P.seduta = P.piedi.map((f) => [f.th, corto(P.a, f.a), f.fi]);
      }
    } else if (Math.hypot(P.x - Sx, P.y - Sy) < (q && q === sd ? 1.3 : 0.5) * U) {
      // Chi arriva se la fa uscire per tempo. Chi si e' appena alzato esce di lato, e la sedia
      // rientra quando si e' fatto da parte.
      tira = 1;
      if (q !== sd && varco && P.fuori > 0.3) (gx = Lx), (gy = Ly);
    }
  }
  // La sedia tirata indietro: la si sposta di qua (lo specchio la gira soltanto), e rientra da sola.
  if (s && s.sedia && P.fuori <= 0) P.tirata = s;
  P.fuori = P.sit > 0 ? tira : verso(P.fuori, sd && P.tirata === sd ? tira : 0, dt / 0.4);
  const t = P.tirata;
  if (t && t.sedia) t.sedia.position.set(t.x - Math.sin(t.a) * FUORI * P.fuori, 0, t.y - Math.cos(t.a) * FUORI * P.fuori);
  if (P.fuori <= 0) P.tirata = null;
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
    // La scia del gemello: se la strada dritta verso di lui taglia una scrivania (ha appena
    // girato attorno a uno spigolo), si punta all'ultimo punto della scia che si vede.
    const scia = P.scia;
    if (!scia.length || Math.hypot(gx - scia[scia.length - 1][0], gy - scia[scia.length - 1][1]) > 2) {
      scia.push([gx, gy]);
      if (scia.length > 40) scia.shift();
    }
    // (i punti dove si e' gia' arrivati non servono piu')
    while (scia.length > 1 && Math.hypot(scia[0][0] - P.x, scia[0][1] - P.y) < 4) scia.shift();
    const d = Math.hypot(gx - P.x, gy - P.y);
    // Per due passi non ci si volta: ci si sposta di lato. Per una strada si' — e
    // finche' non si e' voltati si va piano, che nessuno parte all'indietro.
    const strada = I.fermo ? d > 8 : d > 1.5;
    let px = gx;
    let py = gy;
    if (strada && I.banchi && I.banchi.some((t) => taglia(P.x, P.y, gx, gy, t))) {
      for (let i = scia.length - 1; i >= 0; i--) {
        const [x, y] = scia[i];
        if (I.banchi.some((t) => taglia(P.x, P.y, x, y, t))) continue;
        px = x;
        py = y;
        scia.splice(0, i);
        break;
      }
    }
    const dp = Math.hypot(px - P.x, py - P.y);
    let ux = dp > 1e-4 ? (px - P.x) / dp : Math.sin(P.a);
    let uy = dp > 1e-4 ? (py - P.y) / dp : Math.cos(P.a);
    // Gli incroci: dove passera' piu' vicino a ognuno degli altri in piedi, nei prossimi due
    // secondi e mezzo. Se e' troppo vicino: chi arriva da dietro o di fianco a uno che gli passa
    // davanti rallenta e lo lascia passare; chi se lo trova di fronte, o fermo sulla
    // strada, si scosta a destra. E chi va nello stesso verso, piu' piano, lo si segue.
    let scosta = 0;
    let vMax = Infinity;
    // Lo scarto si misura di fianco alla strada del gemello, non a quella di chi lo segue
    // (che, scostato, gli punta di sbieco): (`hx`, `hy`) e' il suo verso.
    const hn = Math.hypot(I.tx - I.fx, I.ty - I.fy);
    const hx = hn > 1 ? (I.tx - I.fx) / hn : ux;
    const hy = hn > 1 ? (I.ty - I.fy) / hn : uy;
    if (strada && I.gente)
      for (const Q of I.gente) {
        if (Q === P || Q.sit > 0 || !Q.visibile) continue;
        const rx = Q.x - P.x;
        const ry = Q.y - P.y;
        if (rx * rx + ry * ry > 9 * U * U) continue;
        // (le velocita' che si avranno a momenti: chi parte adesso fra un attimo cammina)
        const vio = Math.max(P.vel, 0.5 * PASSO);
        const vlui = Q.vel > 0.5 ? Math.max(Q.vel, 0.5 * PASSO) : 0;
        const wx = Math.sin(Q.dir) * vlui - ux * vio;
        const wy = Math.cos(Q.dir) * vlui - uy * vio;
        const w2 = wx * wx + wy * wy;
        const tc = w2 > 1e-6 ? clamp(-(rx * wx + ry * wy) / w2, 0, 2.5) : 0;
        const avanti = rx * ux + ry * uy;
        const vq = vlui;
        if (Math.hypot(rx + wx * tc, ry + wy * tc) < INCROCIO) {
          // Due strade che si tagliano di sbieco: chi arriva per secondo all'incrocio rallenta.
          const qx = Math.sin(Q.dir);
          const qy = Math.cos(Q.dir);
          const x = ux * qy - uy * qx;
          const fronte = ux * qx + uy * qy < -0.7;
          // Girargli attorno dalla parte dove c'e' piu' posto, quanto basta (al piu' `fino`).
          // (di fianco a dove sarei senza lo scarto che ho gia')
          const attorno = (fino) => {
            const lat = ry * hx - rx * hy + P.scosta;
            const lato = P.evita === Q && P.evitaDi ? Math.sign(P.evitaDi) : lat > 0.1 * U ? -1 : 1;
            const vuole = lato * clamp(INCROCIO + 0.05 * U + lato * lat, 0, fino);
            if (Math.abs(vuole) > Math.abs(scosta)) (scosta = vuole), (P.evita = Q), (P.evitaDi = vuole);
          };
          if (vq > LENTO && !fronte && Math.abs(x) > 0.2) {
            // chi passa per primo gli gira un po' attorno
            const mio = (rx * qy - ry * qx) / x / vio;
            const suo = (rx * uy - ry * ux) / x / vlui;
            if (mio > suo || (mio === suo && P.n < Q.n)) vMax = Math.min(vMax, 0.1 * PASSO);
            else attorno(SCOSTA);
          } else if (vq > LENTO && !fronte && avanti > 0) vMax = Math.min(vMax, 0.3 * PASSO);
          else if (vq > LENTO) {
            // Di fronte ci si scosta a destra, tutti e due.
            if (SCOSTA > Math.abs(scosta)) (scosta = SCOSTA), (P.evita = Q), (P.evitaDi = SCOSTA);
          } else attorno(0.55 * U);
        }
        const suo = Q.vx * ux + Q.vy * uy;
        if (avanti > 0 && suo > LENTO && Math.abs(rx * uy - ry * ux) < INCROCIO) vMax = Math.min(vMax, suo + Math.max(0, avanti - 0.6 * U) * 2);
      }
    // Scostati, lo si resta finche' l'altro non e' alle spalle (se no, appena scostati,
    // sembrerebbe che non serva piu'). Lo scarto entra ed esce morbido, mezzo metro al
    // secondo, e si fa di lato, passo dopo passo; la meta non cambia.
    const E = P.evita;
    // (Il gemello fermo: si e' arrivati, niente scarti.)
    const va = strada && hn > 1 && !I.fermo;
    if (E && !scosta) {
      if (va && E.sit <= 0 && (E.x - P.x) * hx + (E.y - P.y) * hy > -0.25 * U && Math.hypot(E.x - P.x, E.y - P.y) < 3 * U) scosta = P.evitaDi;
      else P.evita = null;
    }
    const prima = P.scosta;
    P.scosta = verso(P.scosta, va ? scosta : 0, 0.5 * U * dt);
    P.x -= hy * (P.scosta - prima);
    P.y += hx * (P.scosta - prima);
    if (P.scosta) {
      px -= hy * P.scosta;
      py += hx * P.scosta;
      const n = Math.hypot(px - P.x, py - P.y) || 1;
      ux = (px - P.x) / n;
      uy = (py - P.y) / n;
    }
    // In cammino la strada gira ad arco: mai piu' svelta di GIRA, ne' piu' stretta di mezzo
    // metro, se non andando piano. (Da fermi si parte dritti dove si deve.)
    if (strada && P.vel > LENTO) {
      const w = Math.min(GIRA, Math.max(1.5, P.vel / (0.5 * U))) * dt;
      P.dir += clamp(corto(P.dir, Math.atan2(ux, uy)), -w, w);
    } else P.dir = Math.atan2(ux, uy);
    const aT = strada ? Math.atan2(ux, uy) : fronte;
    // Finche' non si e' voltati, e finche' la strada non ha finito di girare, si va piano.
    const storto = strada ? Math.max(0, Math.cos(corto(P.a, aT))) * Math.max(0, Math.cos(corto(P.dir, aT))) : 1;
    ux = Math.sin(P.dir);
    uy = Math.cos(P.dir);
    // Chi e' rimasto indietro allunga un po', ma non corre; chi parte arriva al passo in due passi.
    // (per voltarsi o lasciar passare qualcuno si rallenta, non si inchioda)
    const cap = Math.max(Math.min(PASSO * I.passo * 1.2 * storto * storto, vMax), P.vel - 2 * FRENA * dt);
    let v = Math.min(Math.sqrt(2 * FRENA * I.passo * I.passo * d), cap, P.vel + PARTE * I.passo * dt);
    if (v * dt > d) v = d / dt;
    if (d > 1e-4) {
      P.x += ux * v * dt;
      P.y += uy * v * dt;
    }
    P.vel = v;
    if (aT != null) P.a += strada ? clamp(corto(P.a, aT) * Math.min(1, dt * 11), -GIRA * dt, GIRA * dt) : clamp(corto(P.a, aT) * Math.min(1, dt * 12), -GIRA_FERMO * dt, GIRA_FERMO * dt);
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

/** Un piede appoggiato che non sta dove starebbe da fermo, o che guarda da un'altra parte. */
function fuori(P, f, k) {
  const r = riposo(P, k);
  return Math.hypot(f.x - r[0], f.y - r[1]) > FUORI_POSTO || Math.abs(corto(f.a, P.a)) > 0.4;
}

/**
 * I piedi: quando tocca a ognuno staccarsi e appoggiarsi. Camminando lo dice la fase
 * del passo, che va avanti con la strada fatta: meta' ciclo a terra e meta' in aria, e
 * un piede si stacca quando l'altro atterra. Da fermi, un piede rimasto fuori posto — o
 * girato male, per chi si e' voltato — fa un passetto, uno alla volta. Come stanno le
 * gambe, e quindi il bacino, lo dice `gambe`.
 */
function passi(P, dt) {
  const v = Math.hypot(P.vx, P.vy);
  const cammina = v > LENTO && P.sit <= 0;
  if (P.sit > 0) {
    // Seduti, o a meta': i piedi li muove la seduta (`gambeSedute`).
    P.andava = false;
    P.sedeva = true;
    return;
  }
  if (P.sedeva) {
    // Appena in piedi: i piedi si appoggiano dove la seduta li ha lasciati.
    P.sedeva = false;
    for (const f of P.piedi) appoggia(f, [f.x, f.y], f.th, f.a);
  }
  // Il passo e' lungo quanto chiede la velocita' a cadenza ferma: corto chi parte, lungo
  // chi rincorre — un quinto in piu', poi sale anche la cadenza (chi va in archivio).
  P.lungo = P.falcata = clamp((FALCATA * U * v) / PASSO, 0.12 * U, 1.2 * FALCATA * U);
  if (cammina && !P.andava) {
    // Chi parte da fermo comincia alzando il piede che sta piu' indietro (o quello gia' in
    // aria), non a meta' di un passo gia' fatto.
    const dietro = (f) => (f.su ? -1e9 : (f.x - P.x) * P.vx + (f.y - P.y) * P.vy);
    const k = dietro(P.piedi[1]) < dietro(P.piedi[0]) ? 1 : 0;
    P.passo = (k ? 0 : A_TERRA) * TAU;
    P.piedi[k].via = true;
  } else if (cammina) {
    P.passo += ((v * dt) / P.lungo) * Math.PI;
    // La gamba a terra rimasta troppo dietro (un cambio di passo): l'altra si sbriga ad atterrare.
    for (const f of P.piedi) if (!f.su && f.th < -0.55) P.passo += (-0.55 - f.th) * 10 * dt * TAU;
  }
  P.andava = cammina;
  for (let k = 0; k < 2; k++) {
    const f = P.piedi[k];
    const altro = P.piedi[1 - k];
    if (cammina) {
      const c = frac(P.passo / TAU + k * 0.5);
      if (c < A_TERRA) {
        if (f.su && !f.via) f.giu = true;
      } else {
        // Si stacca; o, se faceva un passetto da fermo, quel passetto diventa un passo.
        if (!f.su || f.aTempo) f.via = true;
        f.aTempo = false;
        f.u = (c - A_TERRA) / (1 - A_TERRA);
      }
    } else if (f.su) {
      // Da fermi: il passo a meta' finisce come un passetto, verso dove il piede sta a riposo.
      if (!f.aTempo) (f.via = true), (f.aTempo = true);
      f.s += dt / PASSETTO;
      if (f.s >= 1) f.giu = true;
    } else if (!altro.su && !altro.via && fuori(P, f, k) && !(fuori(P, altro, 1 - k) && altro.h < f.h)) {
      // (Se sono fuori posto tutti e due, prima quello che tiene meno: e' quello che si alza senza far scendere il bacino.)
      f.via = true;
      f.aTempo = true;
    }
  }
  gambe(P, dt);
}

// ---------------------------------------------------------------------
//  le gambe: il bacino sta dove lo tengono
// ---------------------------------------------------------------------
/** Le due anche, nella stanza: il bacino ondeggia sul piede a terra e gira col passo, in fase con le gambe. */
const ANCHE_QUI = [
  [0, 0],
  [0, 0],
];
function anche(P) {
  const w = P.sit > 0 ? 0 : P.amp;
  const c0 = frac(P.passo / TAU);
  const s = Math.sin(P.a);
  const c = Math.cos(P.a);
  const b = P.bac;
  // Il bacino si sposta sul piede che e' a terra (il primo nella prima meta' del ciclo) e
  // gira portando avanti l'anca della gamba che sta avanti.
  b[0] = P.m[2 * ANCA_] - ONDA * Math.sin(TAU * c0) * w;
  b[1] = P.m[2 * (ANCA_ + 2)];
  b[2] = P.m[2 * (BACINO + 1)] + GIRO_BACINO * Math.cos(TAU * c0) * w;
  for (let k = 0; k < 2; k++) {
    const l = k ? 1 : -1;
    const x = b[0] + l * ANCHE * Math.cos(b[2]);
    const z = b[1] - l * ANCHE * Math.sin(b[2]);
    ANCHE_QUI[k][0] = P.x + (x * c + z * s) * U;
    ANCHE_QUI[k][1] = P.y + (-x * s + z * c) * U;
  }
}

/**
 * Una gamba appoggiata. La scarpa rotola senza strisciare: il punto della suola che
 * toccava terra (`L`, nello spazio della gamba) resta dove toccava (`W`), e la gamba si
 * inclina — in avanti e di fianco insieme — quanto serve perche' ci resti, ovunque sia
 * andata l'anca. Poi tocca il punto accanto: il nuovo piu' basso. Da li', quanto alta
 * tiene l'anca.
 */
const E2 = [0, 0, 0];
function terra(k, f) {
  const H = ANCHE_QUI[k];
  const scarto = (th, fi, o) => {
    gira3(f.a, th, fi, f.L, E2);
    o[0] = H[0] + E2[0] * U - f.W[0];
    o[1] = H[1] + E2[2] * U - f.W[1];
    return o;
  };
  let th = f.th;
  let fi = f.fi;
  const e = [0, 0];
  const a = [0, 0];
  const b = [0, 0];
  for (let i = 0; i < 4; i++) {
    scarto(th, fi, e);
    if (Math.abs(e[0]) + Math.abs(e[1]) < 1e-4) break;
    scarto(th + 1e-4, fi, a);
    scarto(th, fi + 1e-4, b);
    const j00 = (a[0] - e[0]) / 1e-4;
    const j10 = (a[1] - e[1]) / 1e-4;
    const j01 = (b[0] - e[0]) / 1e-4;
    const j11 = (b[1] - e[1]) / 1e-4;
    const det = j00 * j11 - j01 * j10;
    if (Math.abs(det) < 1e-9) break;
    th = clamp(th - (e[0] * j11 - e[1] * j01) / det, -MR, MR);
    fi = clamp(fi - (j00 * e[1] - j10 * e[0]) / det, -0.7, 0.7);
  }
  f.th = th;
  f.fi = fi;
  f.h = sotto(f.a, th, fi, f.L);
  gira3(f.a, th, fi, f.L, E2);
  f.x = f.W[0] = H[0] + E2[0] * U;
  f.y = f.W[1] = H[1] + E2[2] * U;
  ancora(f);
}

/**
 * Una gamba in aria, a che punto e' del passo (`fine`: all'ultimo istante, quando
 * atterra). Va da com'era quando si e' staccata a dove deve appoggiarsi: da fermi,
 * sotto la sua anca; camminando, avanti quanto basta perche', nell'istante in cui
 * l'altra si stacca, tenga l'anca alla stessa altezza — ed e' per questo che il bacino
 * passa da una gamba all'altra senza un salto.
 */
function aria(P, k, f, fine) {
  const hj = ANCHE_QUI[k];
  let u;
  let th1;
  let fi1;
  let a1;
  const g = P.piedi[1 - k];
  if (f.aTempo || g.su) {
    u = fine || Math.min(1, f.s);
    a1 = P.a;
    const r = riposo(P, k);
    const ux = Math.sin(a1);
    const uy = Math.cos(a1);
    const dx = (r[0] - hj[0]) / U;
    const dy = (r[1] - hj[1]) / U;
    th1 = inclina(TOCCA, dx * ux + dy * uy, 0, NR, true);
    fi1 = fianco(th1, dx * uy - dy * ux);
  } else {
    u = fine || f.u;
    const v = Math.hypot(P.vx, P.vy) || 1;
    a1 = Math.atan2(P.vx, P.vy);
    // Dove sara' l'anca dell'altra gamba quando questa atterra: ancora la strada del
    // corpo, e quella che le toglie il bacino girando dall'altra parte.
    const ls = k ? -1 : 1;
    const by = P.m[2 * (BACINO + 1)] + GIRO_BACINO * (k ? -1 : 1) * P.amp;
    const resta = Math.max(0, A_TERRA - frac(P.passo / TAU + (1 - k) * 0.5)) * 2 * P.lungo;
    const giro = -ls * ANCHE * (Math.sin(by) - Math.sin(P.bac[2])) * U;
    const px = ANCHE_QUI[1 - k][0] + (P.vx / v) * resta + Math.sin(P.a) * giro - g.ox;
    const py = ANCHE_QUI[1 - k][1] + (P.vy / v) * resta + Math.cos(P.a) * giro - g.oy;
    const gu = Math.sin(g.a);
    const gv = Math.cos(g.a);
    const thG = inclina(ROTOLA, (px * gu + py * gv) / U);
    const H = suola(thG, fianco(thG, (py * gu - px * gv) / U)).h;
    // Si atterra dove il passo torna pari; piu' avanti solo se l'altra gamba, a quel punto,
    // terra' l'anca piu' bassa: un piede non atterra mai sotto il pavimento.
    th1 = Math.max(pari(P.lungo / U), sulTacco(H));
    fi1 = fianco(th1, (k ? 1 : -1) * (P.largo / U - ANCHE));
  }
  const e = ease(u);
  f.th = lerp(f.th0, th1, e);
  f.fi = lerp(f.fi0, fi1, e);
  f.a = f.a0 + corto(f.a0, a1) * e;
  const { h, lat } = suola(f.th, f.fi);
  f.h = h;
  // Dove toccherebbe, se si appoggiasse adesso.
  const ux = Math.sin(f.a);
  const uy = Math.cos(f.a);
  const X = tab(TOCCA, f.th) * U;
  const Y = lat * U;
  f.x = hj[0] + ux * X + uy * Y;
  f.y = hj[1] + uy * X - ux * Y;
  return u;
}

/**
 * Le gambe in piedi, e da loro il bacino. Lo tiene la gamba appoggiata che lo tiene
 * piu' in alto: e' il pendolo rovesciato, alto sopra la gamba dritta e piu' basso coi
 * piedi lontani. Se a meta' passo la scarpa in aria sfiorerebbe il pavimento, la sua
 * anca si alza quanto serve: il bacino si inclina da quella parte.
 */
function gambe(P, dt) {
  anche(P);
  let cambia = false;
  // Prima chi atterra, poi chi si stacca: per un istante sono giu' tutti e due, mai su.
  for (let k = 0; k < 2; k++) {
    const f = P.piedi[k];
    if (!f.giu) continue;
    f.giu = false;
    aria(P, k, f, 1);
    appoggia(f, [f.x, f.y], f.th, f.a, f.fi);
    cambia = true;
  }
  for (let k = 0; k < 2; k++) {
    const f = P.piedi[k];
    if (!f.su) {
      // Il corpo gira molto sopra un piede a terra (una curva stretta): il piede ruota sul
      // punto che tocca, come si fa, invece di torcere la gamba.
      const torce = corto(f.a, P.a);
      if (Math.abs(torce) > 0.35) appoggia(f, [f.x, f.y], f.th, f.a + clamp(torce - Math.sign(torce) * 0.35, -2 * dt, 2 * dt), f.fi);
      terra(k, f);
    }
    if (!f.via) continue;
    // Si stacca da com'e' adesso: appoggiato, o gia' in aria che cambia passo.
    f.via = false;
    f.su = true;
    f.th0 = f.th;
    f.fi0 = f.fi;
    f.a0 = f.a;
    f.s = 0;
    cambia = true;
  }
  let alto = -1;
  for (const f of P.piedi) if (!f.su && f.h > alto) alto = f.h;
  let y = alto < 0 ? P.hy - P.offY : alto;
  let r = 0;
  for (let k = 0; k < 2; k++) {
    const f = P.piedi[k];
    const cs = Math.cos(f.th) * Math.cos(f.fi);
    if (!f.su) {
      // Appoggiata e' dritta.
      f.d = CAVIGLIA;
      f.z = alto - f.h;
      f.corto = 0;
      continue;
    }
    const u = aria(P, k, f, 0);
    // In aria il tubo si accorcia e si incurva, e la scarpa sale di tanto: senza scatti, anche
    // quando il passo diventa un passetto (e ricomincia da capo).
    f.corto = clamp(IN_ARIA * Math.sin(Math.PI * u), f.corto - 0.4 * dt, f.corto + 0.4 * dt);
    f.d = CAVIGLIA - f.corto;
    const sale = (CAVIGLIA - f.d) * cs;
    if (alto < 0) continue;
    const serve = f.h - sale + SOPRA * Math.sin(Math.PI * u) - alto;
    const al = serve > 0 ? Math.asin(Math.min(0.5, serve / (2 * ANCHE))) : 0;
    r = (k ? 1 : -1) * al;
    y = alto + ANCHE * Math.sin(al);
    f.z = alto + 2 * ANCHE * Math.sin(al) - f.h + sale;
  }
  // Niente scatta: quando il bacino cambia gamba, il salto che resta si scioglie in un attimo.
  const k = Math.exp(-dt / 0.06);
  P.offY = P.primo ? 0 : cambia ? P.hy - y : P.offY * k;
  P.offR = P.primo ? 0 : cambia ? P.rollio - r : P.offR * k;
  P.hy = y + P.offY;
  P.rollio = r + P.offR;
  // Se intanto il bacino sta piu' basso di quanto la gamba lo terrebbe (sta cambiando gamba),
  // la gamba si incurva quel tanto: la scarpa non entra mai nel pavimento. Quella a terra
  // senza muovere la caviglia: la corda si rifa' dall'anca abbassata alla caviglia di prima
  // (`vth`, `vfi`, lunga `d`), e la scarpa resta girata com'era (`sp`).
  for (let k = 0; k < 2; k++) {
    const f = P.piedi[k];
    f.vth = f.th;
    f.vfi = f.fi;
    f.sp = 0;
    const cs = Math.cos(f.th) * Math.cos(f.fi);
    const z = P.hy + (k ? 1 : -1) * ANCHE * Math.sin(P.rollio) - f.h + (CAVIGLIA - f.d) * cs;
    if (z >= 0) continue;
    if (f.su) {
      f.d += z / cs;
      continue;
    }
    const vx = f.d * Math.sin(f.fi);
    const vy = f.d * cs + z;
    const vz = f.d * Math.cos(f.fi) * Math.sin(f.th);
    f.d = Math.hypot(vx, vy, vz);
    f.vfi = Math.asin(vx / f.d);
    f.vth = Math.atan2(vz, vy);
    f.sp = f.th - f.vth;
  }
}

/**
 * Le gambe di chi si siede, sta seduto o si alza: `P.sit` e' quanto e' seduto (0 in
 * piedi dove stava la sedia, 1 sul bordo del sedile), `P.gira` quanto la sedia e'
 * rientrata, (`ax`, `ay`, `az`) il bacino. Il bacino scende, i tubi si incurvano e le
 * scarpe, piatte, scivolano avanti (`inSeduta`); poi la sedia rientra, e strisciano fin
 * sotto il piano. Seduti i piedi stanno dove sono arrivati, e se la sedia gira un poco la
 * gamba li cerca. Scrive le gambe della posa, e tiene in pari i piedi per quando ci si alza.
 */
const SOTTO = [0, 0];
const LOC2 = [0, 0, 0];
function gambeSedute(P, q, ax, ay, az) {
  const u = P.sit;
  const { th: tt, d: dd } = inSeduta(ay);
  const da = P.seduta ? smooth(0, 0.15, u) : 1;
  const s = Math.sin(P.a);
  const c = Math.cos(P.a);
  for (let k = 0; k < 2; k++) {
    const l = k ? 1 : -1;
    const f = P.piedi[k];
    const hx = ax + l * ANCHE;
    let psi = l * DIVARICA * smooth(0.3, 1, u);
    if (u >= 1 && P.gira >= 1 && q) {
      locale(P, ...sottoIlPiano(q, k, SOTTO), 0, LOC2);
      psi = Math.atan2(LOC2[0] - hx, LOC2[2] - az);
    }
    const p0 = P.seduta && P.seduta[k];
    const tk = p0 ? lerp(p0[0], tt, da) : tt;
    const pk = p0 ? lerp(p0[1], psi, da) : psi;
    const fk = p0 ? lerp(p0[2], 0, da) : 0;
    const dk = lerp(CAVIGLIA, dd, da);
    const g = POSA.gambe[k];
    g[0] = -tk;
    g[1] = pk;
    g[2] = fk;
    g[3] = f.d = dk;
    // la suola piatta
    g[4] = -tk;
    f.th = tk;
    f.fi = fk;
    f.a = P.a + pk;
    f.h = dk * Math.cos(tk) + CAVIGLIA_SU;
    f.z = Math.max(0, ay - f.h);
    f.su = f.z > 0.003;
    const X = dk * Math.sin(tk) + SCARPA.centro[2];
    const x = hx + X * Math.sin(pk);
    const z = az + X * Math.cos(pk);
    f.x = P.x + (x * c + z * s) * U;
    f.y = P.y + (-x * s + z * c) * U;
  }
  if (u >= 1) P.seduta = null;
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
  gambe: [[0, 0, 0, CAVIGLIA, 0], [0, 0, 0, CAVIGLIA, 0]],
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
/**
 * Un punto del piano davanti a chi siede al posto `q`, visto dalla figura. `p` e'
 * uno dei posti che il piano dice di se' (`q.top`: i tasti, la tazza, il foglio),
 * spostato di `x` di traverso e `z` in avanti nel verso della sedia, `h` metri
 * sopra il piano. Chi siede non sa a memoria dove stanno le cose: glielo dice la
 * scrivania, ed e' per questo che le mani cadono sui tasti anche nella meta' a specchio.
 */
function sulPiano(P, q, p, x, h, z, out = LOC) {
  const s = Math.sin(q.a);
  const c = Math.cos(q.a);
  return locale(P, p[0] + (x * c + z * s) * U, p[1] + (-x * s + z * c) * U, q.top.z / U + h, out);
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
/** Dove sta quello che si tocca davanti a un mobile, visto dalla figura: la cosa, e la seconda (il bottone, il ripiano di sotto). */
const M1 = [0, 0, 0];
const M2 = [0, 0, 0];
const IMPILATE = ['tazza2', 'tazza3', 'tazza4'];
/** Le mani che in questo fotogramma stanno su una cosa della stanza (la bestia), e non seguono il corpo. */
const FISSA = [0, 0];
/** Dove sta il libro adesso, davanti a chi legge. */
const LIBRO = [0, 0, 0];
/**
 * Dove sta la mano rispetto alla spalla quando il braccio va avanti di `al` col passo
 * (indietro se negativo): pende accanto alla coscia, col gomito piu' piegato davanti
 * che dietro. [_, giu, avanti], in metri.
 */
function pendolo(al, out) {
  const be = lerp(GOMITO_DIETRO, GOMITO_AVANTI, clamp((al + BRACCIO_VA) / (2 * BRACCIO_VA)));
  out[1] = -OMERO * Math.cos(al) - AVAMBRACCIO * Math.cos(al + be);
  out[2] = OMERO * Math.sin(al) + AVAMBRACCIO * Math.sin(al + be);
  return out;
}
const PENDE = pendolo(0, [0, 0, 0]);
const OSCILLA = [0, 0, 0];

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
  /** Il passo: +1 quando la prima gamba e' avanti (appena atterrata), -1 quando lo e' l'altra. Muove bacino, spalle e braccia in fase, senza molle (vedi sotto). */
  const onda = P.sit > 0 ? 0 : Math.cos(TAU * frac(P.passo / TAU)) * P.amp;

  // ====================================================================
  //  il corpo di base: in piedi, in cammino, seduto
  // ====================================================================
  // In piedi il bacino sta dove lo tengono le gambe (`gambe`); seduti, sul bordo del sedile.
  let ay = P.sit > 0 ? lerp(ANCA, SEDUTO, smooth(0.2, 1, P.sit)) : P.hy;
  let ax = 0;
  let az = 0;
  // Scendendo sulla sedia ci si piega in avanti, e la testa resta dritta.
  const mezzo = Math.sin(Math.PI * P.sit);
  let bx = 0;
  let by = 0;
  let tx = 0.5 * mezzo + (0.07 + (I.passo > 1 ? 0.07 : 0)) * amp + 0.04 * e;
  let ty = 0;
  // In curva ci si piega verso dentro col busto: il bacino lo tengono le gambe.
  let tz = clamp(-P.gir * (Math.hypot(P.vx, P.vy) / PASSO) * 0.05, -0.12, 0.12) * inPiedi;
  let cx = -0.28 * mezzo + 0.03;
  let cy = 0;
  let cz = 0;
  let umore = 0.85;
  let ciglia = 0;
  let sx = 0;
  let sy = 0;
  let voce = 0;
  let chiusi = 0;
  let salto = 0;
  if (vivo && fermo > 0.5) {
    // Il peso da un piede all'altro: il bacino va di traverso, i piedi restano dove sono e le gambe si inclinano appena.
    const peso = Math.sin(0.9 * t + f);
    ax += 0.02 * peso * fermo;
    tz += 0.02 * peso * fermo;
  }

  // --- le braccia: pendono accanto alle cosce, o sulle ginocchia. A tempo di passo le muove il passo, dopo le molle.
  const larga = o.robusta ? 0.02 : 0;
  for (let k = 0; k < 2; k++) {
    const l = k ? 1 : -1;
    mano(k, lerp(l * (0.215 + larga), l * 0.11, e), lerp(ay + SPALLA[1] + PENDE[1], SEDUTO + 0.105, e), lerp(PENDE[2], 0.21, e));
    gomito(k, l * lerp(0.3, 0.8, e), -0.3, lerp(-1, -0.5, e));
  }

  // --- cosa ha in mano, e con quale mano
  /* La tazza del bar sul piano di una scrivania la disegna la stanza (`banco.tazza`),
     e quando la stanza piatta ce la posa il suo gemello e' appena arrivato al posto:
     qui lui e' ancora in piedi accanto alla sedia. Quindi la regge finche' non e'
     seduto e girato, e la posa lui; e quando riparte per il bar prima allunga la mano
     e la riprende. `P.beve` dice allo specchio che e' in mano sua e sul piano non
     c'e'; `P.riprende` che sul piano c'e' ancora un attimo. */
  if (!I.piena || I.tazza) P.regge = false;
  else if (P.avevaTazza && P.sit < 1) (P.regge = true), (P.reggeT = 0);
  if (I.tazza && P.avevaPiena && !P.avevaTazza && q && P.sit > 0.5) P.riprende = RIPRENDE_IN;
  P.avevaTazza = I.tazza;
  P.avevaPiena = I.piena;
  P.beve = P.regge;
  const riprende = P.riprende > 0;
  if (riprende) P.riprende -= dt;
  // La mano della tazza e' quella dalla parte dove la si posa: a destra nelle scrivanie di sinistra, a sinistra nelle loro gemelle.
  const mT = I.faldone ? 1 : I.manoTazza;
  const lT = mT ? 1 : -1;
  const tazzaInMano = (I.tazza && !riprende) || P.regge;
  const mF = tazzaInMano ? 1 - mT : 1; // il foglio sta nella mano che la tazza lascia libera
  let kTazza = tazzaInMano ? 1 : 0;
  let kFoglio = I.foglio ? 1 : 0;
  let carteInMano = 1;
  let kTelefono = 0;
  let kAnnaffia = 0;
  let kGetto = 0;
  let inclina = 0;
  // Seduti, foglio e faldone stanno sul piano: le mani sono libere.
  const carteGiu = !!q && e > 0.9;
  let occupata0 = (I.faldone && !carteGiu) || (tazzaInMano && !mT);
  let occupata1 = tazzaInMano && !!mT;
  if (I.foglio && !carteGiu) mF ? (occupata1 = true) : (occupata0 = true);
  if (inPiedi > 0.5) {
    // La tazza si porta ferma, bassa e vicino al corpo: il braccio lungo il fianco, l'avambraccio in avanti. Il foglio un po' piu' su; il faldone sotto il braccio.
    if (tazzaInMano) {
      mano(mT, lT * 0.15, ay + 0.14, 0.17);
      gomito(mT, lT * 0.25, -0.4, -1);
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
  /**
   * Porta la mano `k` su un punto visto dalla figura, e il corpo quanto serve perche'
   * ci arrivi: le gambe restano dritte e si piega la schiena, fino a `china` radianti
   * (mezzo radiante in piu' per le cose in basso). E' quello che mette la mano SULLA
   * cosa — la tazza sul ripiano, il bottone — a qualunque altezza l'abbia messa chi ha
   * disegnato il mobile.
   */
  const arriva = (k, x, y, z, w, china) => {
    const l = k ? 1 : -1;
    let p = 0;
    for (const fino = china + 0.5; p < fino; p += 0.05) {
      if (Math.hypot(x - l * SPALLA[0], y - (ay + SPALLA[1] * Math.cos(tx + p)), z - az - SPALLA[1] * Math.sin(tx + p)) < BRACCIO) break;
    }
    tx += p * w;
    versoMano(k, x, y, z, w);
  };
  /** Gira la testa verso un punto visto dalla figura. */
  const occhiSu = (p, w) => {
    cy = lerp(cy, 0.7 * clamp(Math.atan2(p[0], Math.max(0.1, p[2])), -0.9, 0.9), w);
    cx = lerp(cx, clamp(Math.atan2(testaY() + 0.215 - p[1], Math.max(0.2, Math.hypot(p[0], p[2]))), -0.45, 0.7) - tx * 0.6, w);
  };

  // ====================================================================
  //  al banco: battere, fermarsi a pensare, leggere
  // ====================================================================
  const lib = m[2 * LEGGE];
  let legge = 0;
  if (q && alBanco > 0.5) {
    const top = q.top;
    carteInMano = 0;
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
        sulPiano(P, q, top.tasti, l * 0.085 + vx, 0.062, vz, A);
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
    if (P.regge && top.tazza) {
      // Seduto: posa la tazza che si e' portato dal bar, e da li' in poi sta sul piano.
      P.reggeT += dt;
      sulPiano(P, q, top.tazza, 0, 0, 0, B);
      versoMano(mT, B[0] - PRESA[0], B[1] - PRESA[1], B[2] - PRESA[2], smooth(0, POSA_IN - 0.12, P.reggeT));
      if (P.reggeT > POSA_IN) (P.regge = P.beve = false), (kTazza = 0);
    }
    // --- le pause: chi ha Claude che macina ne fa poche, chi sta fra un turno e l'altro di piu'
    const pausa = vivo && I.fa === 'digita' && !I.animale && !P.regge ? ogniTanto(P, t, lerp(9, 15, I.ritmo), 3, lerp(0.8, 0.45, I.ritmo), 'pausa', 0.55) : null;
    if (pausa) {
      const w = pausa.w;
      const cosa = Math.floor(pausa.r * 5);
      if (I.stretta && pausa.r > 0.4) {
        // Il contesto agli sgoccioli: una mano sulla fronte.
        versoMano(1, 0.055, testaY() + 0.27, testaZ() + 0.2, w);
        cx += 0.26 * w;
        chiusi = w;
        umore = lerp(umore, -0.5, w);
      } else if (cosa === 0 && top.tazza && I.piena) {
        // Un sorso: prende dal piano la tazza che si e' portato dal bar, beve, la rimette dov'era.
        const u = pausa.u;
        sulPiano(P, q, top.tazza, 0, 0, 0, B);
        const pr = smooth(0.04, 0.2, u) * (1 - smooth(0.82, 0.96, u));
        const su = smooth(0.24, 0.42, u) * (1 - smooth(0.66, 0.82, u));
        A[0] = lerp(B[0] - PRESA[0], lT * 0.035, su);
        A[1] = lerp(B[1] - PRESA[1], testaY() + 0.07, su);
        A[2] = lerp(B[2] - PRESA[2], testaZ() + 0.15, su);
        versoMano(mT, A[0], A[1], A[2], pr);
        const presa = u > 0.2 && u < 0.84;
        P.beve = presa;
        kTazza = presa ? 1 : 0;
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
    if (q) carteInMano = 0;
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
  if (riprende && q && q.top.tazza) {
    // Riparte per il bar: prima la mano va alla tazza, che e' ancora sul piano.
    sulPiano(P, q, q.top.tazza, 0, 0, 0, B);
    versoMano(mT, B[0] - PRESA[0], B[1] - PRESA[1], B[2] - PRESA[2], 1);
  }
  if (inPiedi > 0.5 && I.gesto) {
    const u = t - I.gestoDa;
    const g = I.gesto;
    const S = I.sosta;
    /* Quello che si tocca sta dove l'ha messo chi ha disegnato il mobile, e lo dice
       la sosta (`p`, `p2`: mirror.js). Senza un mobile davanti il gesto si fa lo
       stesso, a memoria: una mensola all'altezza del petto. */
    if (S && S.p) locale(P, S.p[0], S.p[1], S.p[2] / U, M1);
    else (M1[0] = 0), (M1[1] = 0.98), (M1[2] = 0.33);
    if (S && S.p2) locale(P, S.p2[0], S.p2[1], S.p2[2] / U, M2);
    else (M2[0] = M1[0]), (M2[1] = M1[1] - 0.4), (M2[2] = M1[2]);
    // Davanti a uno scaffale basso ci si china un po' di piu'; su un bancone meno.
    const basso = !!S && S.alto === false;
    const china = basso ? 0.5 : 0.4;
    if (g === 'prende' || g === 'posa' || g === 'stacca' || g === 'appende' || g === 'faldone') {
      // Allungare una mano fin li' e tenercela: la cosa compare o sparisce quando la stanza piatta la da' o la toglie.
      const k = g === 'faldone' ? 0 : g === 'stacca' || g === 'appende' ? mF : mT;
      const l = k ? 1 : -1;
      const w = smooth(0, 0.32, u);
      // Chi prende o posa una tazza la tiene per il fianco: la mano sta un palmo prima.
      const t0 = g === 'prende' || g === 'posa' ? 1 : 0;
      arriva(k, M1[0] - t0 * PRESA[0], M1[1] - t0 * PRESA[1], M1[2] - (t0 ? PRESA[2] : 0.03), w, china);
      gomito(k, l * 0.7, -0.6, -0.3);
      if (g === 'faldone') arriva(1, M1[0] + 0.12, M1[1] - 0.05, M1[2] - 0.03, w, china);
      occhiSu(M1, w);
      // La tazza e' in mano da quando la mano ci e' arrivata: fino a li' sta sul ripiano (lo specchio la tiene accesa).
      if (g === 'prende' && u > PRESA_DOPO) kTazza = 1;
    } else if (g === 'caffe') {
      // La tazza sotto il becco, il bottone con l'altra mano, l'attesa a guardarla riempirsi, e la si riprende.
      const posa = smooth(0, 0.45, u) * (1 - smooth(0.55, 0.75, u));
      const preme = smooth(0.6, 0.85, u) * (1 - smooth(1.05, 1.3, u));
      const riprendi = smooth(1.85, 2.2, u);
      // Tutto con la mano della tazza, che e' quella dalla parte della macchina: la posa, preme, e fra una cosa e l'altra si appoggia al bordo del bancone.
      versoMano(mT, lT * 0.2, M1[1] + 0.02, M1[2] - 0.07, smooth(0.5, 0.9, u));
      gomito(mT, lT * 0.7, -0.6, -0.3);
      arriva(mT, M1[0] - PRESA[0], M1[1] - PRESA[1], M1[2] - PRESA[2], Math.max(posa, riprendi), china);
      arriva(mT, M2[0], M2[1], M2[2] - 0.05 + 0.02 * pulse(u, 0.82, 1.08, 0.1), preme, china);
      // In mezzo la tazza e' sulla macchina, non in mano.
      if (u > CAFFE.sotto[0] && u < CAFFE.sotto[1]) kTazza = 0;
      occhiSu(M1, smooth(0, 0.4, u));
      if (vivo && u > 1.3 && u < 1.85) {
        // Aspettando: il peso su un piede, le dita che tamburellano sul bordo.
        ax += 0.02 * Math.sin(3 * u);
        T[MANO + 3 * mT + 1] += 0.012 * Math.max(0, Math.sin(19 * u));
      }
    } else if (g === 'lava') {
      // Tutte e due le mani nella vasca, a strofinare la tazza sotto il rubinetto; ognuna finisce con una scrollata.
      const w = smooth(0, 0.35, u);
      const giro = u % 2.4;
      const scrolla = smooth(1.9, 2.05, giro) * (1 - smooth(2.3, 2.4, giro));
      for (let k = 0; k < 2; k++) {
        const l = k ? 1 : -1;
        arriva(k, M1[0] + l * 0.075 - lT * 0.03, M1[1] + 0.05 + 0.09 * scrolla, M1[2] - 0.085, w, china);
        gomito(k, l * 0.9, -0.5, -0.2);
      }
      // Quella che lava ce l'ha fra le mani (lo specchio la toglie dalla vasca).
      if (u > 0.3) kTazza = 1;
      occhiSu(M1, w);
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
      // L'annaffiatoio sopra la pianta — il becco sporge un quarto di metro oltre la mano —: si inclina, versa, si rialza.
      const w = smooth(0, 0.5, u);
      const versa = smooth(0.7, 1.2, u) * (1 - smooth(3.5, 4, u));
      const sopra = S && S.p ? Math.max(0.86, M1[1] + 0.5) : 0.86;
      versoMano(1, (S && S.p ? M1[0] : 0.1) + (vivo ? 0.05 * Math.sin(1.3 * u) : 0) * versa, sopra + 0.09 * versa, S && S.p ? Math.max(0.18, M1[2] - 0.26) : 0.26, w);
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
      A[0] = lerp(lerp(M1[0] - 0.07, M1[0] + 0.13, due), M2[0] + 0.03, sotto);
      A[1] = lerp(M1[1], M2[1], sotto);
      A[2] = M1[2];
      arriva(1, A[0], A[1], A[2], w, china);
      gomito(1, 0.7, -0.6, -0.3);
      occhiSu(A, w);
      ciglia = 0.5 * w;
    } else if (g === 'bacheca') {
      // Si legge la bacheca col dito: un foglietto, poi un altro.
      const w = smooth(0, 0.4, u) * (1 - smooth(3.5, 4, u));
      const due = smooth(1.5, 1.9, u);
      const tocca = vivo ? 0.02 * Math.max(0, Math.sin(7 * u)) : 0;
      A[0] = M1[0] + lerp(-0.05, 0.16, due);
      A[1] = M1[1] + lerp(0, -0.14, due);
      A[2] = M1[2] - 0.05 + tocca;
      arriva(1, A[0], A[1], A[2], w, china);
      gomito(1, 0.7, -0.6, -0.3);
      if (!occupata0) {
        versoMano(0, -0.2, ay + 0.03, 0.04, w);
        gomito(0, -0.9, -0.2, -0.5);
      }
      occhiSu(A, w);
    } else if (g === 'cestino') {
      // La carta sopra il cestino — proprio sopra, che ci cada dentro —, la si lascia, e ci si spolvera le mani.
      const w = smooth(0, 0.35, u);
      const lascia = smooth(0.85, 1.05, u);
      const batte = smooth(1.15, 1.4, u) * (1 - smooth(2.1, 2.5, u));
      const su = S && S.p ? 1 : 0;
      arriva(
        1,
        lerp(su ? M1[0] : 0.05, 0.05, lascia),
        lerp(su ? M1[1] + 0.26 : 0.64, ay + 0.24, lascia),
        lerp(su ? M1[2] - 0.07 : 0.29, 0.27, lascia),
        w * (1 - 0.6 * smooth(1.2, 1.6, u)),
        0.45 * (1 - lascia)
      );
      gomito(1, 0.7, -0.6, -0.3);
      if (!I.foglio) kFoglio = w * (1 - lascia);
      for (let k = 0; k < 2; k++) versoMano(k, (k ? 1 : -1) * (0.07 - (vivo ? 0.035 * Math.max(0, Math.sin(13 * u)) : 0)), ay + 0.27, 0.25, batte);
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
        versoMano(mT, lT * 0.035, testaY() + 0.07, testaZ() + 0.15, sorso.w);
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
    // Per un cane basso ci si china con la schiena, le gambe dritte.
    tx += clamp(manca * 1.3 + sotto * 1.1, 0, 1.15) * w * clamp(A[2] * 4 + 0.4);
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

  // Un braccio pende dalla spalla, non da un punto per aria: le mani che non stanno su
  // una cosa della stanza seguono la schiena quando si piega.
  if (inPiedi > 0.5 && !I.gesto) {
    for (let k = 0; k < 2; k++) {
      if (FISSA[k]) continue;
      T[MANO + 3 * k] -= SPALLA[1] * Math.sin(tz);
      T[MANO + 3 * k + 1] += SPALLA[1] * (Math.cos(tx) - 1);
      T[MANO + 3 * k + 2] += SPALLA[1] * Math.sin(tx);
    }
  }

  // ====================================================================
  //  le molle, e quello che va troppo svelto per una molla
  // ====================================================================
  // (Del bacino le molle tengono solo quello che ci mettono i gesti: il resto lo dicono le gambe.)
  T[ANCA_] = ax;
  T[ANCA_ + 1] = ay;
  T[ANCA_ + 2] = az;
  T[BACINO] = bx;
  T[BACINO + 1] = by;
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
  T[K_FOGLIO] = kFoglio;
  T[K_FALDONE] = I.faldone ? 1 : 0;
  T[K_LIBRO] = smooth(0.03, 0.3, lib);
  T[K_TELEFONO] = kTelefono;
  T[K_ANNAFFIA] = kAnnaffia;
  T[K_GETTO] = kGetto;
  T[IN_MANO_FOGLIO] = carteInMano;
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
  for (let i = 0; i < 3; i++) {
    p.bacino[i] = m[2 * (BACINO + i)];
    p.busto[i] = m[2 * (BUSTO + i)];
    p.capo[i] = m[2 * (CAPO + i)];
    for (let k = 0; k < 2; k++) {
      p.mani[k][i] = m[2 * (MANO + 3 * k + i)];
      p.gomiti[k][i] = m[2 * (GOMITO + 3 * k + i)];
    }
  }
  if (P.sit > 0) {
    // Seduto, o a meta': il bacino sul bordo del sedile, e le gambe che cercano i piedi.
    p.anca[0] = m[0];
    p.anca[1] = ay + m[2 * SALTO];
    p.anca[2] = m[4] + SUL_BORDO * smooth(0.25, 1, P.sit);
    gambeSedute(P, q, p.anca[0], ay, p.anca[2]);
  } else {
    // In piedi il bacino sta dove lo tengono le gambe, gia' messo e girato col passo (`gambe`):
    // subito, non con una molla, se no a ogni passo un piede si stacca da terra.
    p.anca[0] = P.bac[0];
    p.anca[1] = P.hy + m[2 * SALTO];
    p.anca[2] = P.bac[1];
    p.bacino[1] = P.bac[2];
    p.bacino[2] = P.rollio;
    for (let k = 0; k < 2; k++) {
      const pf = P.piedi[k];
      const g = p.gambe[k];
      g[0] = -pf.vth;
      g[1] = corto(P.a, pf.a);
      g[2] = pf.vfi;
      g[3] = pf.d;
      g[4] = pf.sp;
    }
    // Il passo, senza molle che lo mettano in ritardo: le spalle girano al contrario del
    // bacino, la testa resta dritta, le mani appese al corpo salgono e scendono con lui, e
    // le braccia vanno avanti e indietro opposte alle gambe.
    const gb = GIRO_BACINO * onda;
    p.busto[1] -= (1 + SPALLE) * gb;
    p.capo[1] += SPALLE * gb;
    p.busto[2] -= 0.8 * P.rollio;
    p.capo[2] -= 0.2 * P.rollio;
    const indietro = ay - m[2 * (ANCA_ + 1)];
    for (let k = 0; k < 2; k++) {
      if (FISSA[k] || I.gesto) continue;
      p.mani[k][1] += indietro;
      if ((k ? occupata1 : occupata0) || (I.chiede && libera === k)) continue;
      pendolo((k ? 1 : -1) * BRACCIO_VA * onda, OSCILLA);
      p.mani[k][1] += OSCILLA[1] - PENDE[1];
      p.mani[k][2] += OSCILLA[2] - PENDE[2];
    }
  }
  if (vivo) {
    if (alBanco > 0.5 && I.fa === 'digita' && lib < 0.1) {
      // Le dita: a raffiche, una mano e poi l'altra. Solo se le mani sono davvero sui tasti.
      const raffica = 0.5 + 0.5 * Math.sin(1.9 * t + f) > 0.25 ? 1 : 0.15;
      for (let k = 0; k < 2; k++) {
        sulPiano(P, q, q.top.tasti, 0, 0.062, 0, A);
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
  const hT = fig.mani[mT];
  const piega = m[2 * INCLINA];
  // Al suo posto la tazza in mano gira come quella posata sul piano: fra l'una e l'altra non c'e' uno scatto.
  const manico = q && q.top.manico != null && P.sit >= 1 ? q.top.manico - P.a : 0;
  const kT = m[2 * K_TAZZA];
  fig.tieni('tazza', kT, hT.x + PRESA[0], hT.y + PRESA[1], hT.z + PRESA[2], -piega, manico, 0);
  // Chi le ha appena lavate ne riporta piu' d'una, impilate.
  for (let i = 0; i < 3; i++) fig.tieni(IMPILATE[i], I.tazze > i + 1 ? kT : 0, hT.x + PRESA[0], hT.y + PRESA[1], hT.z + PRESA[2], 0, 0, 0);
  // Foglio e faldone: in mano, o posati sul piano oltre il mouse mentre si sta seduti.
  const giu = clamp(m[2 * IN_MANO_FOGLIO]);
  const posati = q && q.top.foglio && giu < 0.99;
  const gira = q ? q.a - P.a : 0;
  if (m[2 * K_FOGLIO] > 0.02) {
    const h = mF ? h1 : h0;
    if (posati) sulPiano(P, q, q.top.foglio, 0, 0.004 + (I.faldone ? 0.07 : 0), 0, B);
    else (B[0] = h.x), (B[1] = h.y), (B[2] = h.z);
    fig.tieni('foglio', m[2 * K_FOGLIO], lerp(B[0], h.x, giu), lerp(B[1], h.y + 0.03, giu), lerp(B[2], h.z + 0.07, giu), -0.75 * giu, lerp(gira + 0.25, 0, giu), 0);
  } else fig.tieni('foglio', 0);
  if (m[2 * K_FALDONE] > 0.02) {
    // In mano sta in piedi sotto il braccio; sul piano e' sdraiato sul dorso, lungo la scrivania.
    if (posati) {
      sulPiano(P, q, q.top.foglio, 0, 0.035, 0, B);
      B[0] += 0.13 * Math.cos(gira);
      B[2] -= 0.13 * Math.sin(gira);
    } else (B[0] = h0.x + 0.035), (B[1] = h0.y - 0.02), (B[2] = h0.z - 0.03);
    fig.tieni('faldone', m[2 * K_FALDONE], lerp(B[0], h0.x + 0.035, giu), lerp(B[1], h0.y - 0.02, giu), lerp(B[2], h0.z - 0.03, giu), 0.1 * giu, gira * (1 - giu), (Math.PI / 2) * (1 - giu));
  } else fig.tieni('faldone', 0);
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
