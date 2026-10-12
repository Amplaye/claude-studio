/* Claude Studio — l'ufficio in 3D, la pelle «Classico»: la stanza di legno.
 *
 * L'interfaccia di una pelle e' scritta in cima a skins/notte.js: qui ci sono solo i
 * valori di questa. Le tinte sono quelle di webview/room.css — il legno di
 * SeasonVale, #e86837 di corpo, #ff9148 di luce, #b64335 d'ombra — cosi' la stanza
 * piatta e questa restano la stessa stanza.
 *
 * Di giorno: niente neon e niente aloni, gli schermi non fanno luce, e il muro di
 * fondo e' una vetrata a montanti di legno sul paese — cielo, nuvole, colline, tetti
 * e alberi. I due muri di fianco restano legno pieno: da qui si guardano di taglio.
 */
import { rnd, TAU } from '../kit.js';

const C = {
  // la stanza
  slab: '#3a2418', vuoto: '#17100f',
  wall: '#cf8c4a', wallHi: '#e8a866', wallLo: '#a4652f', infisso: '#7d4a21',
  // i mobili
  wood: '#e86837', woodTop: '#f07a44', woodHi: '#ff9148', woodLo: '#b64335', woodDk: '#7a2f25',
  chair: '#55424e', chairLo: '#3d2d38',
  leaf: '#7d4a28', leafHi: '#a2673a', leafLo: '#5d3520', porta: '#a4652f', cabina: '#241a16',
  // il computer
  off: '#241c22', bezel: '#4a3a44', monLo: '#3d2d38', ink: '#2e1c2c',
  // il bar, la fontanella, le piante
  cream: '#f2ede2', steel: '#9aa7b0', carta: '#f5f1e6',
  mach: '#55424e', machHi: '#6b5460', machLo: '#3d2d38', spia: '#ff9148',
  jar: '#3f7fd8', jarHi: '#9cc4ff',
  stone: '#b9b2a6', stoneLo: '#8f887c', soil: '#4a3323', steam: '#ffffff',
  acqua: ['#3f8fd0', '#6fc0f0', '#d6f0ff'],
  verde: ['#2e6b3a', '#3c8a47', '#4fa457', '#6cbf6a'], fiore: '#f08ab0',
  vasi: ['#b9b2a6', '#3b4a6b', '#8f5fb8', '#4a8fd0', '#7a4a32', '#7a4a32'],
  faldoni: ['#d04a3a', '#3f7fb8', '#e8c14d', '#f2ede2', '#5c8a4b', '#8a5fb0'],
};

// ---- il pavimento (room.css: lastricato chiaro di sopra, assito caldo nel salone)
const F = { floor: '#8a4e2c', floorHi: '#9c5a34', floorLo: '#6e3d22', sand: '#c9a887', sandHi: '#d9bb9b', sandJo: '#a8825c', gravel: '#e9e2d2', gravelLo: '#c9bfa8' };

function pavimento(g, R) {
  const r = (x, y, w, h, c) => {
    g.fillStyle = c;
    g.fillRect(x, y, w, h);
  };
  r(0, 0, R.W, R.H, F.sandJo);
  // Le due stanze e il corridoio: lastre chiare, con le loro fughe.
  for (let y = 16; y < R.MEZZO; y += 32) {
    for (let x = 16; x < R.W - 16; x += 32) {
      r(x + 0.5, y + 0.5, 31, Math.min(32, R.MEZZO - y) - 1, rnd('lastra', x, y) < 0.3 ? F.sandHi : F.sand);
    }
  }
  // Il salone: assi alte sedici, con le teste sfalsate da una fila all'altra e
  // qualche venatura corta, che e' quello che fa legno e non linoleum.
  r(0, R.MEZZO, R.W, R.H - R.MEZZO, F.floor);
  for (let y = R.MEZZO, j = 0; y < R.H; y += 16, j++) {
    r(0, y, R.W, 0.7, F.floorLo);
    r(0, y + 0.7, R.W, 0.6, F.floorHi);
    for (let x = 16 + ((j * 37) % 64); x < R.W; x += 64 + ((j * 13) % 24)) r(x, y, 0.7, 16, F.floorLo);
    for (let i = 0; i < R.W / 60; i++) r(rnd('v', j, i) * R.W, y + 3 + rnd('vy', j, i) * 10, 18 + rnd('vw', j, i) * 30, 0.4, 'rgba(60,30,15,0.16)');
  }
  r(R.VANO[0], 8, R.VANO[1], 8, C.vuoto);
  for (const q of R.ghiaia) {
    g.fillStyle = F.gravel;
    g.beginPath();
    g.arc(q.x, q.y, q.r, 0, TAU);
    g.fill();
    for (let i = 0; i < 70; i++) {
      const a = rnd('ga', i) * TAU;
      const d = Math.sqrt(rnd('gr', i)) * (q.r - 1);
      r(q.x + Math.cos(a) * d - 0.4, q.y + Math.sin(a) * d - 0.4, 0.8, 0.8, F.gravelLo);
    }
  }
}

/* ---- il paese dalla vetrata ----
 *
 * Il muro di fondo e' alto apposta: visto da qui il pavimento si schiaccia in una
 * striscia, e la meta' alta della scheda e' di quello che c'e' fuori. Di giorno: un
 * cielo chiaro col sole e le nuvole, due file di colline, e in basso una fila di case
 * coi tetti di coppi e di alberi. Tinte piatte, come i mobili. Tutto dal seme e
 * contato da sinistra: allargando la scheda il paese si allunga, non si rimescola.
 *
 * I montanti di legno li mette il motore (`montanti`, C.infisso), cosi' la porta
 * resta fra due vetri interi; qui si dipinge solo il traverso, che e' quello che fa
 * finestra e non vetrina.
 */
const CIELO = ['#7fc1ec', '#cdeaf7'];
const CASE = ['#f0dcc0', '#e6c9a0', '#f2ede2', '#d9b88c'];
const TETTI = ['#c8573a', '#b64335', '#d06a3f', '#9c4a34'];
const CHIOME = ['#3c8a47', '#4fa457', '#2e6b3a'];

function vetrata(g, w, h, lato) {
  if (lato !== 'n') return false;
  // Le misure sono in centesimi dell'altezza del muro, che cambia con la scheda.
  const k = Math.max(0.5, h / 100);
  const r = (x, y, a, b, c) => {
    g.fillStyle = c;
    g.fillRect(x, y, a, b);
  };
  const disco = (x, y, q, c) => {
    g.fillStyle = c;
    g.beginPath();
    g.arc(x, y, q, 0, TAU);
    g.fill();
  };
  const cielo = g.createLinearGradient(0, 0, 0, h);
  cielo.addColorStop(0, CIELO[0]);
  cielo.addColorStop(0.8, CIELO[1]);
  g.fillStyle = cielo;
  g.fillRect(0, 0, w, h);
  // Il sole, a un quarto del muro: un disco e il suo chiarore, piatto anche lui.
  disco(w * 0.24, h * 0.2, 9 * k, 'rgba(255,244,200,0.45)');
  disco(w * 0.24, h * 0.2, 5.5 * k, '#fff6d6');
  // Le nuvole, una ogni settanta: tre gobbe su una base dritta, e sotto la loro ombra.
  for (let i = 0; i * 70 < w; i++) {
    const cx = i * 70 + rnd('nx', i) * 44;
    const cy = h * (0.1 + rnd('ny', i) * 0.28);
    const s = k * (0.8 + rnd('ns', i) * 0.7);
    for (const [c, dy] of [['#d6e8f3', 1.3 * s], ['#ffffff', 0]]) {
      disco(cx - 7 * s, cy + dy, 4 * s, c);
      disco(cx, cy - 2.6 * s + dy, 5.4 * s, c);
      disco(cx + 7.5 * s, cy + dy, 4.4 * s, c);
      r(cx - 11 * s, cy + dy, 23 * s, 4 * s, c);
    }
  }
  // Le colline: quelle lontane piu' chiare, che e' l'aria che c'e' in mezzo.
  const colle = (c, alto, passo, onda) => {
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w + 4; x += 4) g.lineTo(x, h - (alto + Math.sin(x / passo) * onda + Math.sin(x / (passo * 0.37) + 2) * onda * 0.4) * k);
    g.lineTo(w + 4, h);
    g.fill();
  };
  colle('#a8d0a4', 38, 38, 6);
  colle('#7db873', 27, 23, 4);
  // La fila vicina: una casa o un albero, a caso, coi piedi sul prato.
  const terra = h - 6 * k;
  for (let x = -4, i = 0; x < w; i++) {
    const bw = (11 + rnd('cw', i) * 13) * k;
    if (rnd('cosa', i) < 0.45) {
      const a = (13 + rnd('ah', i) * 10) * k;
      const cx = x + bw / 2;
      const c = CHIOME[i % CHIOME.length];
      r(cx - 0.7 * k, terra - a * 0.5, 1.4 * k, a * 0.5, '#7d4a28');
      disco(cx, terra - a * 0.72, a * 0.3, c);
      disco(cx - a * 0.2, terra - a * 0.52, a * 0.25, c);
      disco(cx + a * 0.2, terra - a * 0.52, a * 0.25, c);
      disco(cx - a * 0.08, terra - a * 0.78, a * 0.12, '#6cbf6a');
    } else {
      const bh = (9 + rnd('ch', i) * 9) * k;
      const th = (5 + rnd('th', i) * 3) * k;
      r(x, terra - bh, bw, bh, CASE[i % CASE.length]);
      r(x + bw - 1.6 * k, terra - bh, 1.6 * k, bh, 'rgba(46,28,44,0.14)');
      r(x + bw * 0.68, terra - bh - th * 0.9, 1.6 * k, th * 0.7, '#8f887c');
      g.fillStyle = TETTI[i % TETTI.length];
      g.beginPath();
      g.moveTo(x - 1.2 * k, terra - bh);
      g.lineTo(x + bw / 2, terra - bh - th);
      g.lineTo(x + bw + 1.2 * k, terra - bh);
      g.fill();
      for (let fx = x + 2 * k; fx < x + bw - 3.6 * k; fx += 4.2 * k) r(fx, terra - bh + 2 * k, 2 * k, 2.4 * k, '#5d83a6');
    }
    x += bw + rnd('vuoto', i) * 5 * k;
  }
  r(0, terra, w, h - terra, '#5fa55a');
  r(0, terra, w, 0.8 * k, '#8fcf7c');
  // Il traverso e la testa dell'infisso, con un filo d'ombra sotto.
  r(0, 0, w, 1.6, C.infisso);
  r(0, h * 0.3, w, 1.6, C.infisso);
  r(0, h * 0.3 + 1.6, w, 0.5, 'rgba(46,28,44,0.22)');
}

/** Attorno alla stanza: il buio caldo della scheda (`--of-buio`), con un filo di luce. */
function sfondo(g, w, h) {
  g.fillStyle = '#1d1512';
  g.fillRect(0, 0, w, h);
  const gr = g.createRadialGradient(w / 2, h * 0.5, 0, w / 2, h * 0.5, Math.max(w, h) * 0.6);
  gr.addColorStop(0, 'rgba(150,92,48,0.34)');
  gr.addColorStop(1, 'rgba(150,92,48,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
}

export default {
  nome: 'classico',
  C,
  schermi: {
    on: ['#a1ab3c', '#d8e08a', '#68662b'],
    working: ['#ff9148', '#ffd0a8', '#e86837'],
    luce: 0,
  },
  filo: null,
  aloni: 0,
  portaAccesa: false,
  montanti: 32,
  luci: {
    ambiente: ['#fff1dc', 0.58],
    chiave: ['#ffedc8', 0.9, [-250, 70, 330]],
    riempi: ['#ffe8cc', 0.24],
  },
  sfondo,
  pavimento,
  vetrata,
  // Di suo non ha niente: la luce del giorno la fanno le tre luci qui sopra.
  extra() {},
};
