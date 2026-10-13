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
 *     extra(K)  I mobili che ha solo questa pelle. K e' la cassetta dei costruttori:
 *               K.box / K.cyl / K.face scrivono nella stanza ferma (vedi kit.js),
 *               K.alone(a, b, raggio, colore, forza) un bagliore, K.decalco(trama,
 *               x, y, w, d, z, opzioni) una cosa stesa per terra, K.tela(w, h) una
 *               tela nuova, K.R la pianta (DESKS, PROPS, W, H, WH…), K.anima(fn) una
 *               funzione chiamata a ogni fotogramma con il tempo in secondi — mai
 *               con le animazioni ridotte — e K.scena la scena di three.
 *               Per chi disegna a tratto come il resto della stanza (kit.js, «A
 *               TRATTO»): K.qui(x, y, ry, z, specchio) e' una penna piantata in un
 *               punto della pianta, che scrive in metri nella stanza ferma, e
 *               K.parte(fn) un pezzo che si muove. K.Q e' il quadro: `cima` e `giu`
 *               dove la scheda taglia la vetrata e il pavimento, `lungo` e `alto`
 *               fin dove arrivano il pavimento e i due muri di fianco.
 *   }
 * =====================================================================
 *
 * Questa e' la pelle approvata: blocchi scuri, il filo al neon che respira, gli
 * schermi che fanno luce e la citta' accesa dietro le vetrate.
 */
import { rnd, TAU } from '../kit.js';

const C = {
  // la stanza
  slab: '#11132a', vuoto: '#05060f',
  wall: '#2a2f4d', wallHi: '#3b4170', wallLo: '#1d2140', infisso: '#232846',
  // i mobili
  wood: '#474c7e', woodTop: '#636aa8', woodHi: '#8a93cf', woodLo: '#343861', woodDk: '#22254a',
  chair: '#2d3157', chairLo: '#1c1f3a',
  leaf: '#2f3358', leafHi: '#4a5080', leafLo: '#22254a', porta: '#39e58c', cabina: '#14162a',
  // il computer
  off: '#0b0c18', bezel: '#2f3352', monLo: '#1a1c34', ink: '#090a14',
  // il bar, la fontanella, le piante
  cream: '#e8e4dc', steel: '#9aa3c7', carta: '#cfd3e6',
  mach: '#33334a', machHi: '#4b4b66', machLo: '#1f1f30', spia: '#ff9a3c',
  jar: '#3f7fd8', jarHi: '#9cc4ff',
  stone: '#6b72a3', stoneLo: '#4b5182', soil: '#191a2c', steam: '#cfd6ff',
  acqua: ['#1d86b0', '#3fd8f2', '#b8fbff'],
  verde: ['#235a47', '#2c6e54', '#368a63', '#44a070'], fiore: '#ff6ad5',
  vasi: ['#4b5182', '#3f6fc0', '#6b4fa0', '#3f6fc0', '#7a4a58', '#6b4fa0'],
  faldoni: ['#3fb8d0', '#c552a8', '#7f88c4', '#e8e4dc', '#ffd36b', '#4a5fb0'],
};

// ---- il pavimento (skins.css: moquette a quadrotte nel salone, cemento lucido di sopra)
const F = { floor: '#1b1e33', floor2: '#20243d', sand: '#262a42', sandHi: '#2d3251', sandJo: '#1a1d31', gravel: '#2b3050', gravelHi: '#454b74' };

function pavimento(g, R) {
  const r = (x, y, w, h, c) => {
    g.fillStyle = c;
    g.fillRect(x, y, w, h);
  };
  r(0, 0, R.W, R.H, F.sandJo);
  // Le due stanze e il corridoio: lastre di cemento scuro, con le loro fughe.
  for (let y = 16; y < R.MEZZO; y += 32) {
    for (let x = 16; x < R.W - 16; x += 32) {
      r(x + 0.4, y + 0.4, 31.2, Math.min(32, R.MEZZO - y) - 0.8, rnd('lastra', x, y) < 0.22 ? F.sandHi : F.sand);
    }
  }
  // Il salone: quadrotte di moquette, una su due un filo piu' chiara.
  for (let y = R.MEZZO, j = 0; y < R.H - 8; y += 16, j++) {
    for (let x = 16, i = 0; x < R.W - 8; x += 16, i++) r(x, y, 16, 16, (i + j) & 1 ? F.floor : F.floor2);
  }
  r(R.VANO[0], 8, R.VANO[1], 8, C.vuoto);
  for (const q of R.ghiaia) {
    g.fillStyle = F.gravel;
    g.beginPath();
    g.arc(q.x, q.y, q.r, 0, TAU);
    g.fill();
    for (let i = 0; i < 60; i++) {
      const a = rnd('ga', i) * TAU;
      const d = Math.sqrt(rnd('gr', i)) * (q.r - 1);
      r(q.x + Math.cos(a) * d - 0.4, q.y + Math.sin(a) * d - 0.4, 0.8, 0.8, F.gravelHi);
    }
  }
}

/* ---- la citta' dalle vetrate ----
 *
 * Il muro di fondo e' alto apposta: visto da qui il pavimento si schiaccia in una
 * striscia, e la meta' alta della scheda e' della citta'. Due file di palazzi — una
 * lontana e spenta, una vicina con le finestre accese — sotto un cielo con le sue
 * stelle e la luna. Tutto dal seme: allargando la scheda la citta' si allunga, non
 * si rimescola.
 *
 * Le finestre accese portano il loro alone gia' dipinto (una passata sfocata
 * sommata sopra): e' il bagliore della citta', e non costa niente a ogni fotogramma.
 */
const CIELO = ['#0b1038', '#141b52', '#222d78'];
const PALAZZI = ['#141a3a', '#192043', '#10152f', '#171d3f', '#121834', '#1a2146', '#111630'];
const LUME = ['#ffd36b', '#ffd36b', '#ffd36b', '#ffb85c', '#b8fbff'];

function vetrata(g, w, h, lato) {
  const cielo = g.createLinearGradient(0, 0, 0, h);
  cielo.addColorStop(0, CIELO[0]);
  cielo.addColorStop(0.55, CIELO[1]);
  cielo.addColorStop(1, CIELO[2]);
  g.fillStyle = cielo;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < w * 0.35; i++) {
    g.fillStyle = rnd(lato, 'sc', i) < 0.2 ? '#ffffff' : '#cfe8ff';
    g.globalAlpha = 0.35 + rnd(lato, 'sa', i) * 0.65;
    const s = rnd(lato, 'ss', i) < 0.15 ? 0.8 : 0.45;
    g.fillRect(rnd(lato, 'sx', i) * w, rnd(lato, 'sy', i) * h * 0.62, s, s);
  }
  g.globalAlpha = 1;
  if (lato === 'n') {
    // La luna, a un terzo del muro: un disco e la sua ombra, che e' piu' luna di un cerchio.
    const mx = w * 0.72;
    const my = h * 0.2;
    const alone = g.createRadialGradient(mx, my, 2, mx, my, 26);
    alone.addColorStop(0, 'rgba(190,215,255,0.35)');
    alone.addColorStop(1, 'rgba(190,215,255,0)');
    g.fillStyle = alone;
    g.fillRect(mx - 26, my - 26, 52, 52);
    g.fillStyle = '#e9f1ff';
    g.beginPath();
    g.arc(mx, my, 6.5, 0, TAU);
    g.fill();
    g.fillStyle = CIELO[0];
    g.beginPath();
    g.arc(mx + 3.2, my - 1.6, 5.6, 0, TAU);
    g.fill();
  }
  // La fila lontana: sagome basse, appena piu' chiare del cielo.
  for (let x = -4, i = 0; x < w; i++) {
    const bw = 9 + rnd(lato, 'lw', i) * 12;
    const bh = h * (0.2 + rnd(lato, 'lh', i) * 0.22);
    g.fillStyle = '#1b2460';
    g.fillRect(x, h - bh, bw, bh);
    x += bw;
  }
  // La fila vicina, con le finestre: ognuna e' un rettangolo che si puo' accendere.
  const finestre = [];
  for (let x = -3, i = 0; x < w; i++) {
    const bw = 12 + rnd(lato, 'w', i) * 15;
    const alto = rnd(lato, 'torre', i) < 0.16;
    const bh = h * (alto ? 0.62 + rnd(lato, 'h', i) * 0.2 : 0.26 + rnd(lato, 'h', i) * 0.3);
    const col = PALAZZI[i % PALAZZI.length];
    g.fillStyle = col;
    g.fillRect(x, h - bh, bw, bh);
    // Lo spigolo che prende la luce della luna, e l'antenna sulle torri.
    g.fillStyle = 'rgba(140,160,255,0.16)';
    g.fillRect(x, h - bh, 0.6, bh);
    if (alto) {
      g.fillStyle = col;
      g.fillRect(x + bw / 2 - 0.3, h - bh - 7, 0.6, 7);
      finestre.push({ x: x + bw / 2 - 0.6, y: h - bh - 8, w: 1.2, h: 1.2, c: '#ff5a6a', col: CIELO[1], spia: true, on: true });
    }
    for (let fy = h - bh + 2.5; fy < h - 2.5; fy += 3.4) {
      for (let fx = x + 1.6; fx < x + bw - 2; fx += 2.9) {
        const k = rnd(lato, 'f', i, fx | 0, fy | 0);
        if (k > 0.42) continue;
        finestre.push({ x: fx, y: fy, w: 1.5, h: 1.9, c: LUME[((k * 97) | 0) % LUME.length], col, on: k < 0.3 });
      }
    }
    x += bw + (rnd(lato, 'vuoto', i) < 0.2 ? 3 : 0);
  }
  const accendi = (f) => {
    g.fillStyle = f.on ? f.c : f.col;
    g.fillRect(f.x, f.y, f.w, f.h);
  };
  finestre.forEach(accendi);
  // Il bagliore: le sole finestre accese, sfocate e sommate sopra.
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.filter = 'blur(1.6px)';
  g.globalAlpha = 0.75;
  for (const f of finestre) {
    if (!f.on) continue;
    g.fillStyle = f.c;
    g.fillRect(f.x - 0.5, f.y - 0.5, f.w + 1, f.h + 1);
  }
  g.restore();
  // Ogni secondo qualcuna si spegne e qualcuna si accende, e le spie delle antenne
  // lampeggiano: una citta' ferma e' un fondale.
  return (giro) => {
    for (let i = 0; i < finestre.length; i++) {
      const f = finestre[i];
      if (f.spia) f.on = giro % 2 === 0;
      else if (rnd(lato, 'giro', giro, i) < 0.012) f.on = !f.on;
      else continue;
      accendi(f);
    }
    return true;
  };
}

/** Attorno alla stanza: il buio, con un filo d'aria blu perche' non galleggi nel nero. */
function sfondo(g, w, h) {
  g.fillStyle = '#06070e';
  g.fillRect(0, 0, w, h);
  const gr = g.createRadialGradient(w / 2, h * 0.56, 0, w / 2, h * 0.56, Math.max(w, h) * 0.62);
  gr.addColorStop(0, 'rgba(40,48,104,0.38)');
  gr.addColorStop(1, 'rgba(40,48,104,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
}

/* Quello che ha solo la notte: la pozza di luce sotto ogni scrivania (la `.of-luce`
   della stanza piatta), e il filo che respira. */
function extra(K) {
  const { g, tex } = K.tela(128, 128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(94,241,255,1)');
  gr.addColorStop(0.6, 'rgba(94,241,255,0.4)');
  gr.addColorStop(1, 'rgba(94,241,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  tex.needsUpdate = true;
  for (const d of K.R.DESKS) K.decalco(tex, d.x - 20, d.b - 24, 88, 52, 0.08, { somma: true, forza: 0.1 });
  // Due respiri ogni otto secondi: e' la sola cosa della stanza che si muove da sola
  // anche quando non c'e' nessuno, insieme all'acqua.
  K.anima((t) => K.mat.neon.color.setScalar(0.62 + 0.38 * (0.5 + 0.5 * Math.sin((TAU * t) / 4))));
}

export default {
  nome: 'notte',
  C,
  schermi: {
    on: ['#3fd8f2', '#b8fbff', '#1d86b0'],
    working: ['#ff6ad5', '#ffd0f2', '#b03a92'],
    luce: 46,
  },
  filo: '#5ef1ff',
  aloni: 1,
  portaAccesa: true,
  montanti: 32,
  luci: {
    ambiente: ['#aab4ff', 0.5],
    chiave: ['#dfe6ff', 0.72, [-250, 70, 330]],
    riempi: ['#c8d0ff', 0.3],
  },
  sfondo,
  pavimento,
  vetrata,
  extra,
};
