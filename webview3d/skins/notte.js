/* Claude Studio — l'ufficio in 3D, la pelle «Notte in città».
 *
 * =====================================================================
 *  L'INTERFACCIA DI UNA PELLE
 * =====================================================================
 * Una pelle e' un file solo, e dentro c'e' tutto quello che e' suo: i colori,
 * come si dipingono il pavimento e il muro di fondo, le luci, e i pochi mobili
 * che ha solo lei. La pianta, i mobili, le persone e la camera sono di tutti e
 * stanno fuori di qui (props.js, people.js, scene.js): chi ritocca una pelle
 * tocca il suo file e basta. Le tinte vengono da webview/skins.css e room.css,
 * cosi' la stanza piatta e questa dicono la stessa cosa.
 *
 *   export default {
 *     nome      'notte' | 'bali' | 'classico' — lo stesso di `data-skin` sul palco
 *               (la stanza di legno non ha l'attributo, e si chiama 'classico').
 *
 *     C         La tavolozza. I nomi sono quelli che usano i costruttori comuni e
 *               vanno dati tutti (l'elenco e' qui sotto: una voce che manca e' un
 *               mobile nero). `vasi` sono i sei vasi nell'ordine delle piante di
 *               room.js, `verde` quattro verdi dal piu' scuro, `faldoni` i dorsi.
 *               Due sono facoltative, e chi non le da' le ha color `cream`: `tasti`
 *               (la tastiera) e `pomello` (quello della porta).
 *
 *     schermi   { on: [corpo, luce, ombra], working: [corpo, luce, ombra],
 *                 luce: quanta luce fa uno schermo acceso sulla scrivania (0 = niente) }
 *               Le tre tinte sono quelle della pagina che lo schermo mostra. La luce
 *               e' una chiazza sommata sul piano, non una lampada: una lampada vera
 *               si paga a ogni pixel della stanza, e sarebbero otto.
 *
 *     filo      Il colore del filo al neon in cima ai muri, o null: allora al suo
 *               posto c'e' un cordolo di C.wallHi.
 *     aloni     0..1 — quanto si vedono i bagliori attorno a quello che fa luce.
 *               Di giorno 0: un alone al sole e' una macchia.
 *     portaAccesa  true se lo stipite della porta e' una luce (C.porta), false se
 *               e' un legno come gli altri.
 *     montanti  Ogni quante unita' un montante sulla vetrata (0 = nessuno).
 *
 *     luci      { ambiente: [colore, forza], chiave: [colore, forza, [x, y, z]],
 *                 riempi: [colore, forza] } — la chiave e' quella che fa le ombre, e
 *               [x, y, z] e' da che parte viene rispetto al centro della stanza
 *               (pianta: x a est, y verso chi guarda, z in alto). Conta la
 *               direzione, non la lunghezza. Il guscio e le postazioni sono a tinte
 *               piatte: l'ambiente e' il colore delle ombre, e ogni luce in piu' e'
 *               una fila di gradini in piu' — un riempimento a forza 0 non si accende.
 *
 *     sfondo(g, w, h)
 *               Dipinge quello che sta dietro la stanza, su una tela w x h. La
 *               stanza riempie la scheda, quindi si vede solo nel fotogramma in cui
 *               la scheda ha cambiato misura e la stanza non ancora.
 *
 *     pavimento(g, R)
 *               Dipinge il pavimento. `g` e' gia' in pixel di stanza. R = { W, H,
 *               MEZZO (la riga dove finiscono le due stanze di sopra), VANO: [x, w]
 *               la soglia della porta, ghiaia: [{ x, y, r }] attorno alla fontanella }.
 *               `H` qui e' fin dove arriva il pavimento, non la stanza: corre verso
 *               chi guarda oltre il bordo di sotto della scheda, e il salone va
 *               dipinto fin li'.
 *
 *     vetrata(g, w, h, lato, info)
 *               Dipinge un vetro, in pixel di stanza: `lato` e' 'n' per il muro di
 *               fondo — il protagonista della meta' alta: va dal davanzale fin
 *               oltre il bordo di sopra della scheda, e in una scheda alta e' alto
 *               parecchi metri — e 'w' / 'e' per i due di fianco, dove il vetro e'
 *               una fascia dal davanzale al traverso. Tornare `false` vuol dire «da
 *               questo lato niente vetro»: il muro resta pieno.
 *               Puo' tornare una funzione `(giro) => bool`: il motore la chiama una
 *               volta al secondo (mai con le animazioni ridotte) e ridisegna la
 *               trama se torna true. E' cosi' che le finestre si accendono.
 *               `info` e' per chi vuole dipingere a misura vera invece che in parti
 *               di `h`, e si puo' ignorare: { z0: quanto sta sopra il pavimento il
 *               bordo di sotto, cima: a che altezza la scheda taglia il vetro (piu'
 *               su non si vede), vetri: [x] il centro di ogni vetro fra due
 *               montanti, da sinistra } — tutto in unita' di stanza (kit.js: U ne fa
 *               un metro).
 *
 *     nuvole(g, w, h, i)
 *               Facoltativa. Dipinge una striscia di cielo con le sue nuvole su una
 *               tela trasparente di w x h PIXEL, che si ripete di fianco: il motore
 *               ne stende qualcuna contro la vetrata di fondo, dietro i montanti,
 *               in corsie una sopra l'altra, e le fa scorrere piano — mai con le
 *               animazioni ridotte. `i` e' il numero della corsia. Chi non la da'
 *               ha il cielo che ha dipinto in `vetrata`, fermo.
 *
 *     extra(K)  Quello che ha solo questa pelle. K e' la cassetta dei costruttori,
 *               e si disegna a tratto come il resto della stanza (kit.js, «A
 *               TRATTO»): K.qui(x, y, ry, z, specchio) e' una penna piantata in un
 *               punto della pianta, che scrive in metri nella stanza ferma, e
 *               K.parte(fn) un pezzo che si muove. Poi: K.decalco(trama, x, y, w,
 *               d, z, opzioni) una cosa stesa per terra — con `somma` e' una luce
 *               che si aggiunge a quella che c'e' —, K.tela(w, h) una tela nuova,
 *               K.R la pianta (DESKS, PROPS, W, H, WH…), K.anima(fn) una funzione
 *               chiamata a ogni fotogramma con il tempo in secondi — mai con le
 *               animazioni ridotte — e K.scena la scena di three. K.Q e' il
 *               quadro: `cima` e `giu` dove la scheda taglia la vetrata e il
 *               pavimento, `lungo` e `alto` fin dove arrivano il pavimento e i due
 *               muri di fianco.
 *   }
 * =====================================================================
 *
 * Qui e' notte, e come le altre due e' un libro illustrato: tinte piatte, forme
 * tonde, il contorno a inchiostro. L'inchiostro e' scuro e caldo, e su un mobile
 * scuro sparirebbe: quindi niente nella stanza e' scuro quanto lui. Il buio lo fa
 * il colore — blu e viola dappertutto — non il nero, e i mobili si staccano dal
 * pavimento perche' sono piu' chiari di lui. Dietro la vetrata la citta': tre file
 * di palazzi, le finestre accese, la luna e qualche nuvola che passa.
 *
 * Calma apposta. Una notte animata — il neon che pulsa, lo skyline fitto, gli aloni
 * grandi — e' gia' stata bocciata una volta: qui il filo al neon sta fermo, la
 * citta' non lampeggia, di aloni non ce ne sono, e di suo si muovono solo le nuvole.
 */
import { rnd, TAU, U } from '../kit.js';

const C = {
  // la stanza
  slab: '#141736', vuoto: '#0a0b20',
  wall: '#3d4375', wallHi: '#59619f', wallLo: '#2b305c', infisso: '#4a5189',
  // i mobili
  wood: '#5b63a6', woodTop: '#757ec2', woodHi: '#9aa4e4', woodLo: '#434a82', woodDk: '#262b56',
  chair: '#6d5899', chairLo: '#4b3d72',
  leaf: '#4d5590', leafHi: '#6871b2', leafLo: '#353b6c', porta: '#39e58c', cabina: '#11132e', pomello: '#ffd36b',
  // il computer
  off: '#11132c', bezel: '#383d6c', monLo: '#23274c', ink: '#2a2440', tasti: '#c3c9f2',
  // il bar, la fontanella, le piante
  cream: '#e4e6f6', steel: '#9aa3c7', carta: '#d6daf0',
  mach: '#34365a', machHi: '#50537c', machLo: '#1f2140', spia: '#ff9a3c',
  jar: '#3f8fe0', jarHi: '#9cc4ff',
  stone: '#737aae', stoneLo: '#525990', soil: '#1c1d36', steam: '#cfd6ff',
  acqua: ['#1d86b0', '#3fd8f2', '#b8fbff'],
  verde: ['#1f6a56', '#2a8468', '#38a07a', '#52bd8c'], fiore: '#ff6ad5',
  vasi: ['#59619f', '#3f7fd8', '#7a5ab8', '#2f9fb8', '#8a5270', '#7a5ab8'],
  faldoni: ['#3fb8d0', '#c552a8', '#7f88c4', '#e4e6f6', '#ffd36b', '#4a5fb0'],
};

// ---- il pavimento (skins.css: cemento lucido di sopra, moquette a quadrotte nel salone)
const F = {
  fuga: '#272c58', lastre: ['#3d4378', '#394072', '#41487e', '#3b4175'], luce: 'rgba(170,190,255,0.16)',
  giunto: '#1d2148', quadrotte: ['#2b305f', '#2f3566', '#282d5a', '#31376a'], pelo: 'rgba(150,165,255,0.08)',
  ghiaia: '#4a5189', ghiaiaHi: '#6a72ad',
};

function pavimento(g, R) {
  const r = (x, y, w, h, c) => {
    g.fillStyle = c;
    g.fillRect(x, y, w, h);
  };
  /** Piastrelle quadrate dagli angoli tondi, contate dalla linea di mezzo: allargando la stanza se ne aggiungono ai lati e nessuna cambia tinta. */
  const piastrelle = (y0, y1, lato, tinte, raggio, sopra) => {
    for (let y = y0, j = 0; y < y1; y += lato, j++) {
      for (let x = R.W / 2 - Math.ceil(R.W / 2 / lato) * lato; x < R.W; x += lato) {
        const i = Math.round((x - R.W / 2) / lato);
        g.fillStyle = tinte[(i & 1) + 2 * (j & 1)];
        g.beginPath();
        g.roundRect(x + 0.4, y + 0.4, lato - 0.8, Math.min(lato, y1 - y) - 0.8, raggio);
        g.fill();
        sopra(x, y, i, j);
      }
    }
  };
  // Le due stanze e il corridoio: lastre di cemento lucido, con un filo di luce in testa.
  r(0, 0, R.W, R.MEZZO, F.fuga);
  piastrelle(16, R.MEZZO, 24, F.lastre, 1, (x, y) => r(x + 1.2, y + 1.2, 21.6, 0.55, F.luce));
  // Il salone: quadrotte di moquette da un metro, e su ognuna qualche trattino di pelo.
  r(0, R.MEZZO, R.W, R.H - R.MEZZO, F.giunto);
  piastrelle(R.MEZZO, R.H, 32, F.quadrotte, 1.8, (x, y, i, j) => {
    for (let k = 0; k < 4; k++) r(x + 3 + rnd('px', i, j, k) * 20, y + 4 + rnd('py', i, j, k) * 24, 3 + rnd('pw', i, k) * 4, 0.4, F.pelo);
  });
  r(R.VANO[0], 8, R.VANO[1], 8, C.vuoto);
  for (const q of R.ghiaia) {
    g.fillStyle = F.ghiaia;
    g.beginPath();
    g.arc(q.x, q.y, q.r, 0, TAU);
    g.fill();
    for (let i = 0; i < 60; i++) {
      const a = rnd('ga', i) * TAU;
      const d = Math.sqrt(rnd('gr', i)) * (q.r - 1);
      r(q.x + Math.cos(a) * d - 0.4, q.y + Math.sin(a) * d - 0.4, 0.8, 0.8, F.ghiaiaHi);
    }
  }
}

/* ---- la citta' dalla vetrata ----
 *
 * Come il paese della stanza di legno (skins/classico.js), si dipinge in METRI dal
 * pavimento e con la x contata dalla linea di mezzo: i tetti non passano mai i
 * quattro metri, tutto quello che la vetrata guadagna in altezza e' cielo, e
 * allargando la scheda la citta' si scopre ai lati senza rimescolarsi.
 *
 * Tre file di palazzi, piu' scure venendo avanti, ognuna coi suoi tetti — a punta,
 * a gradoni, tondi, con la cisterna o l'antenna. Le finestre sono poche e grandi:
 * una citta' che dorme, non un'insegna. E sta ferma: una finestra che si accende e'
 * tutta la trama da rimandare alla scheda grafica, per una cosa che a questa misura
 * non si nota. I montanti e le nuvole li mette il motore.
 */
const CIELO = ['#0d1140', '#1b2163', '#3d4199'];
const PALAZZI = ['#30367f', '#252a6a', '#191d52'];
const LUME = ['#ffd77a', '#ffd77a', '#ffc46b', '#ffd77a', '#fff1c4', '#ffc46b', '#8fe6ff'];
/** Da dove si cominciano a contare i palazzi: piu' a sinistra di qualunque stanza. */
const LONTANO = -40;

function vetrata(g, w, h, lato, info = {}) {
  if (lato !== 'n') return false;
  const z0 = (info.z0 || 0) / U;
  const X = w / U / 2;
  const alto = z0 + h / U;
  // Dove la scheda taglia la vetrata: la luna sta un metro sotto, cosi' si vede
  // sempre — meno, in una scheda larga, dove un metro sotto ci sono gia' i tetti.
  const cima = info.cima ? info.cima / U : alto - 0.5;
  const luna = [0.42 * Math.min(X, 6.2), cima - Math.min(1, Math.max(0.4, (cima - 3.13) * 0.6))];
  g.save();
  g.translate(w / 2, h);
  g.scale(U, -U);
  g.translate(0, -z0);

  // Il cielo: fondo in alto, e sopra i tetti il chiarore della citta'.
  const cielo = g.createLinearGradient(0, 6.5, 0, 2.2);
  cielo.addColorStop(0, CIELO[0]);
  cielo.addColorStop(0.55, CIELO[1]);
  cielo.addColorStop(1, CIELO[2]);
  g.fillStyle = cielo;
  g.fillRect(-X, z0, 2 * X, alto - z0);
  const disco = (x, y, r, c) => {
    g.fillStyle = c;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  };
  // Le stelle: al piu' una per casella di mezzo metro, e una su dieci a quattro punte.
  for (let i = Math.floor(-X / 0.55); i <= X / 0.55; i++) {
    for (let j = 5; j * 0.55 < alto; j++) {
      const k = rnd('stella', i, j);
      if (k > 0.5) continue;
      const x = (i + rnd('sx', i, j)) * 0.55;
      const y = (j + rnd('sy', i, j)) * 0.55;
      g.globalAlpha = Math.min(1, (y - 2.6) / 1.4) * (0.45 + k);
      if (k > 0.05) disco(x, y, 0.011 + 0.03 * k, k < 0.2 ? '#ffffff' : '#c9d6ff');
      else {
        g.fillStyle = '#ffffff';
        g.beginPath();
        for (let p = 0; p < 8; p++) g.lineTo(x + Math.cos((p * TAU) / 8) * (p % 2 ? 0.014 : 0.07), y + Math.sin((p * TAU) / 8) * (p % 2 ? 0.014 : 0.07));
        g.fill();
      }
    }
  }
  g.globalAlpha = 1;
  // La luna: due cerchi di chiarore a tinta piatta, e la falce — due archi, non un disco con un'ombra sopra.
  disco(luna[0], luna[1], 0.8, 'rgba(170,190,255,0.08)');
  disco(luna[0], luna[1], 0.52, 'rgba(170,190,255,0.1)');
  const fi = Math.acos(0.17 / 0.6);
  g.save();
  g.translate(luna[0], luna[1]);
  g.rotate(0.6);
  g.fillStyle = '#fff4cf';
  g.beginPath();
  g.arc(0, 0, 0.3, fi, TAU - fi);
  g.arc(0.17, 0, 0.3, Math.PI + fi, Math.PI - fi, true);
  g.fill();
  g.restore();

  /** Una fila di palazzi spalla a spalla, contati da LONTANO: `fn(x, largo, i)` per quelli che cadono nel muro. */
  const fila = (seme, stretto, gioco, fn) => {
    for (let x = LONTANO, i = 0; x < X; i++) {
      const largo = stretto + rnd(seme, i) * gioco;
      if (x + largo > -X) fn(x, largo, i);
      x += largo;
    }
  };
  /**
   * Un palazzo: il corpo, il suo tetto, lo spigolo che prende la luna e le finestre.
   * `f` = [larga, alta, passo in x, passo in y] di una finestra, `accese` quante su una.
   */
  const palazzo = (seme, x, largo, tetto, c, i, f, accese) => {
    const m = x + largo / 2;
    const r = (a, b, lw, lh) => g.fillRect(a, b, lw, lh);
    g.fillStyle = c;
    r(x, 0, largo + 0.01, tetto);
    const t = rnd(seme, 'tetto', i);
    if (t < 0.16) {
      g.beginPath();
      g.moveTo(x, tetto);
      g.lineTo(m, tetto + largo * 0.36);
      g.lineTo(x + largo, tetto);
      g.fill();
    } else if (t < 0.34) {
      r(x + largo * 0.16, tetto, largo * 0.68, 0.13);
      r(x + largo * 0.33, tetto + 0.13, largo * 0.34, 0.11);
    } else if (t < 0.46) {
      g.beginPath();
      g.arc(m, tetto, largo * 0.42, 0, Math.PI);
      g.fill();
    } else if (t < 0.6) {
      // La cisterna dell'acqua, sulle sue due gambe e col suo cappello.
      const cx = x + largo * 0.3;
      r(cx - 0.07, tetto, 0.02, 0.09);
      r(cx + 0.05, tetto, 0.02, 0.09);
      r(cx - 0.09, tetto + 0.08, 0.18, 0.14);
      g.beginPath();
      g.moveTo(cx - 0.11, tetto + 0.22);
      g.lineTo(cx, tetto + 0.3);
      g.lineTo(cx + 0.11, tetto + 0.22);
      g.fill();
    } else if (t < 0.72) {
      r(m - 0.012, tetto, 0.024, 0.34);
      r(m - 0.06, tetto + 0.2, 0.12, 0.016);
      disco(m, tetto + 0.35, 0.022, '#ff6a7a');
    } else r(x - 0.02, tetto, largo + 0.04, 0.035);
    g.fillStyle = 'rgba(150,170,255,0.13)';
    r(x + largo - 0.035, 0, 0.035, tetto);
    const n = Math.floor((largo - 0.1) / f[2]);
    const sveglio = accese * (0.25 + 1.5 * rnd(seme, 'sveglio', i));
    for (let y = tetto - 0.09 - f[1], j = 0; y > 0.6; y -= f[3], j++) {
      for (let k = 0; k < n; k++) {
        const q = rnd(seme, 'f', i, j, k);
        g.fillStyle = q < sveglio ? LUME[Math.floor(q * 977) % LUME.length] : 'rgba(150,165,255,0.07)';
        r(m - ((n - 1) * f[2]) / 2 - f[0] / 2 + k * f[2], y, f[0], f[1]);
      }
    }
  };
  fila('lontani', 0.42, 0.5, (x, largo, i) => palazzo('lontani', x, largo, 2.55 + rnd('la', i) * 0.75, PALAZZI[0], i, [0.035, 0.05, 0.11, 0.17], 0.07));
  fila('mezzo', 0.55, 0.6, (x, largo, i) => palazzo('mezzo', x, largo, 2.05 + rnd('ma', i) * 0.7 + (i % 5 === 2 ? 0.45 : 0), PALAZZI[1], i, [0.055, 0.075, 0.14, 0.2], 0.16));
  fila('vicini', 0.7, 0.75, (x, largo, i) => palazzo('vicini', x, largo, 1.5 + rnd('va', i) * 0.75, PALAZZI[2], i, [0.08, 0.11, 0.19, 0.25], 0.24));
  // Il vetro: due strisce di luce di sbieco su un vetro si' e uno no, in alto, dove c'e' solo cielo.
  g.fillStyle = 'rgba(190,205,255,0.09)';
  (info.vetri || []).forEach((v, i) => {
    if (i % 2) return;
    const cx = v / U - X;
    const y = Math.min(i % 4 ? 4.6 : 4.1, cima - 0.2);
    for (const [dx, lw] of [[0, 0.2], [0.3, 0.07]]) {
      g.beginPath();
      g.moveTo(cx - 0.25 + dx, y);
      g.lineTo(cx - 0.25 + dx + lw, y);
      g.lineTo(cx - 0.62 + dx + lw, y - 0.62);
      g.lineTo(cx - 0.62 + dx, y - 0.62);
      g.fill();
    }
  });
  g.restore();

  // La grana della carta, come nella stanza di legno: in pixel di tela, non di stanza.
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  const { width: pw, height: ph } = g.canvas;
  for (let i = 0, n = (pw * ph) / 1600; i < n; i++) {
    g.fillStyle = i % 2 ? 'rgba(160,175,255,0.06)' : 'rgba(4,6,30,0.1)';
    g.fillRect(rnd('gx', i) * pw, rnd('gy', i) * ph, 2 + rnd('gw', i) * 3, 2);
  }
  g.restore();
}

/* Una striscia di cielo con la sua nuvola: quella della stanza di legno, ma bassa,
   lunga e color della notte — il corpo chiaro e' quello che prende la luna. Una
   sola per striscia, che di notte il cielo e' delle stelle, e nella meta' alta:
   cosi' la corsia piu' bassa passa sopra i tetti e non davanti. Il motore la ripete
   di fianco e la fa scorrere. */
const NUVOLA = ['#4a52a6', '#2c3380'];
function nuvole(g, w, h, i) {
  g.save();
  g.scale(w / 512, h / 128);
  const una = (cx, cy, s) => {
    for (const [c, dy] of [[NUVOLA[1], 5 * s], [NUVOLA[0], 0]]) {
      g.save();
      g.beginPath();
      g.rect(0, 0, 512, cy + dy + 5 * s);
      g.clip();
      g.fillStyle = c;
      g.beginPath();
      g.roundRect(cx - 58 * s, cy + dy - 6 * s, 114 * s, 11 * s, 5 * s);
      for (const [x, y, r] of [[-38, 0, 10], [-14, -6, 14], [14, -3, 12], [38, 1, 9]]) {
        g.moveTo(cx + x * s + r * s, cy + y * s + dy);
        g.arc(cx + x * s, cy + y * s + dy, r * s, 0, TAU);
      }
      g.fill();
      g.restore();
    }
  };
  g.globalAlpha = 0.9;
  una(130 + rnd('nu', i, 0) * 250, 28 + rnd('nu', i, 1) * 16, 0.8 + rnd('nu', i, 2) * 0.4);
  g.restore();
}

/** Dietro la stanza: non si vede mai, se non nel fotogramma in cui la scheda cambia misura. Il colore dei muri, cosi' non lampeggia. */
function sfondo(g, w, h) {
  g.fillStyle = C.wallLo;
  g.fillRect(0, 0, w, h);
}

/* Quello che ha solo la notte: la pozza di luce sotto ogni scrivania (la `.of-luce`
   della stanza piatta). A tinte piatte anche lei — due ovali uno nell'altro, non
   una sfumatura — e tutte in una trama sola stesa sotto il blocco dei banchi: una
   chiamata al disegno, quante che siano le scrivanie. */
function extra(K) {
  const D = K.R.DESKS;
  if (!D.length) return;
  const x0 = Math.min(...D.map((b) => b.x)) - 30;
  const y0 = Math.min(...D.map((b) => b.b)) - 50;
  const w = Math.max(...D.map((b) => b.x)) + 78 - x0;
  const d = Math.max(...D.map((b) => b.b)) + 20 - y0;
  const PPU = Math.min(2, 2048 / w);
  const { g, tex } = K.tela(w * PPU, d * PPU);
  g.scale(PPU, PPU);
  g.fillStyle = 'rgba(94,241,255,0.05)';
  for (const b of D) {
    for (const [rx, ry] of [[36, 20], [24, 13]]) {
      g.beginPath();
      g.ellipse(b.x + 24 - x0, b.b - 14 - y0, rx, ry, 0, 0, TAU);
      g.fill();
    }
  }
  tex.needsUpdate = true;
  K.decalco(tex, x0, y0, w, d, 0.08, { somma: true });
}

export default {
  nome: 'notte',
  C,
  schermi: {
    on: ['#3fd8f2', '#b8fbff', '#1d86b0'],
    working: ['#ff6ad5', '#ffd0f2', '#b03a92'],
    luce: 36,
  },
  filo: '#5ef1ff',
  // Niente aloni: a tinte piatte un bagliore sfumato e' l'unica cosa non piatta
  // della stanza, e quelli grandi sono gia' stati bocciati. Che uno schermo e'
  // acceso lo dice la luce che fa sul suo piano (`schermi.luce`).
  aloni: 0,
  // Lo stipite non e' una luce ma un legno come gli altri, dipinto del verde della
  // porta della stanza piatta: cosi' ha gli angoli tondi e il contorno, come tutto.
  portaAccesa: false,
  montanti: 45,
  // Due luci, a tinte piatte, come nella stanza di legno. L'ambiente e' il colore
  // di ogni ombra, ed e' lui a fare la notte: un blu che pero' lascia leggere una
  // faccia. La chiave viene dalla parte della luna e ci aggiunge quello che manca
  // per arrivare a un bianco appena freddo: la gente porta i suoi colori, e non
  // deve uscirne ne' nera ne' bruciata.
  luci: {
    ambiente: ['#8a90d8', 1],
    chiave: ['#d3d2a6', 1, [0.6, 0.3, 0.75]],
    riempi: ['#ffffff', 0],
  },
  sfondo,
  pavimento,
  vetrata,
  nuvole,
  extra,
};
