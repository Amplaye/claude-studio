/* Claude Studio — l'ufficio in 3D, la pelle «Bali».
 *
 * L'interfaccia di una pelle e' scritta in cima a skins/notte.js: qui ci sono solo i
 * valori di questa. Le tinte sono quelle di `[data-skin='bali']` in webview/skins.css —
 * il miele dei mobili (#d9a05a di corpo, #ffe2a6 di luce, #b07a3f d'ombra), il teak
 * chiaro, il bambu' dei muri, il turchese del mare — cosi' la stanza piatta e questa
 * dicono la stessa cosa.
 *
 * Di giorno, e col sole: niente neon e niente aloni. Il muro di fondo e' aperto sul
 * mare, i due di fianco sono canne di bambu', e sotto il blocco delle scrivanie c'e'
 * il tappeto di rattan (la `.of-tappeto` della stanza piatta).
 */
import { rnd, TAU } from '../kit.js';

const C = {
  // la stanza
  slab: '#7d5a2e', vuoto: '#3d2a17',
  wall: '#cdb56a', wallHi: '#e6d38c', wallLo: '#a48a43', infisso: '#b8964c',
  // i mobili
  wood: '#d9a05a', woodTop: '#e9b972', woodHi: '#ffe2a6', woodLo: '#b07a3f', woodDk: '#7d5527',
  chair: '#a9743a', chairLo: '#7d5527',
  leaf: '#d6aa63', leafHi: '#ecd29e', leafLo: '#a77a3e', porta: '#a48a43', cabina: '#4a3520',
  // il computer
  off: '#2e2620', bezel: '#5a4632', monLo: '#3d2e20', ink: '#3d2a17',
  // il bar, la fontanella, le piante
  cream: '#fffaf0', steel: '#a9b4b8', carta: '#fffaf0',
  mach: '#4f3f3a', machHi: '#6a5750', machLo: '#352a27', spia: '#ff8a65',
  jar: '#22b3c4', jarHi: '#a6e4f5',
  stone: '#e3dccb', stoneLo: '#b9ae95', soil: '#5a3d24', steam: '#ffffff',
  acqua: ['#1d8f95', '#3ec7c4', '#c9fbf6'],
  verde: ['#1f7a3e', '#2c9a4c', '#44b85c', '#7ad66e'], fiore: '#ff6f91',
  vasi: ['#e3dccb', '#b064c8', '#3f9fd8', '#c8743c', '#3f9fd8', '#c8743c'],
  faldoni: ['#22b3c4', '#ff8a65', '#ffd36b', '#fffaf0', '#4fae5a', '#e0603c'],
};

// ---- il pavimento (skins.css: pietra bianca di sopra, teak chiaro a doghe nel salone)
const F = { floor: '#e2c38f', floorHi: '#edd3a3', floorLo: '#c99f63', testa: 'rgba(140,95,40,0.35)', sand: '#f1e6d0', sandHi: '#fbf5e8', sandJo: '#d8c6a2', ghiaia: '#efe6d2', ghiaiaLo: '#cdbf9f' };

function pavimento(g, R) {
  const r = (x, y, w, h, c) => {
    g.fillStyle = c;
    g.fillRect(x, y, w, h);
  };
  r(0, 0, R.W, R.H, F.sandJo);
  // Le due stanze e il corridoio: pietra bianca a lastre di ventiquattro, fughe color sabbia.
  for (let y = 16; y < R.MEZZO; y += 24) {
    for (let x = 16; x < R.W - 16; x += 24) {
      r(x + 0.5, y + 0.5, 23, Math.min(24, R.MEZZO - y) - 1, rnd('lastra', x, y) < 0.3 ? F.sandHi : F.sand);
    }
  }
  // Il salone: doghe lunghe di teak alte dodici, con le teste sfalsate da una fila all'altra.
  r(0, R.MEZZO, R.W, R.H - R.MEZZO, F.floor);
  for (let y = R.MEZZO, j = 0; y < R.H; y += 12, j++) {
    for (let x = 16 + ((j * 29) % 48) - 48, i = 0; x < R.W; x += 48, i++) {
      // Una doga su quattro un filo piu' chiara, una su sei piu' scura: e' legno, non vernice.
      const k = rnd('doga', j, i);
      if (k < 0.25) r(x, y, 48, 12, 'rgba(255,245,210,0.2)');
      else if (k > 0.84) r(x, y, 48, 12, 'rgba(140,95,40,0.1)');
      r(x, y, 0.6, 12, F.testa);
    }
    r(0, y, R.W, 0.6, F.floorLo);
    r(0, y + 0.6, R.W, 0.6, F.floorHi);
    for (let i = 0; i < 4; i++) r(rnd('v', j, i) * R.W, y + 3 + rnd('vy', j, i) * 7, 16 + rnd('vw', j, i) * 28, 0.35, 'rgba(140,95,40,0.16)');
  }
  r(R.VANO[0], 8, R.VANO[1], 8, C.vuoto);
  for (const q of R.ghiaia) {
    g.fillStyle = F.ghiaia;
    g.beginPath();
    g.arc(q.x, q.y, q.r, 0, TAU);
    g.fill();
    for (let i = 0; i < 70; i++) {
      const a = rnd('ga', i) * TAU;
      const d = Math.sqrt(rnd('gr', i)) * (q.r - 1);
      r(q.x + Math.cos(a) * d - 0.4, q.y + Math.sin(a) * d - 0.4, 0.8, 0.8, F.ghiaiaLo);
    }
  }
}

/* ---- il mare dalle vetrate ----
 *
 * Il muro di fondo e' alto apposta: visto da qui il pavimento si schiaccia in una
 * striscia, e la meta' alta della scheda e' del mare. Dall'alto in basso: il cielo a
 * fasce col sole e due nuvole, l'orizzonte con il vulcano lontano e un'isola bassa,
 * l'acqua che schiarisce venendo a riva, la battigia, la sabbia. Davanti, le palme.
 * Tinte piatte, e tutto dal seme: allargando la scheda la spiaggia si allunga, non
 * si rimescola.
 *
 * I due muri di fianco restano di bambu' (da qui si guardano di taglio): canne in
 * piedi coi nodi, come `.of-wall` nella stanza piatta.
 */
const CIELO = ['#7fd0ee', '#a6e4f5', '#c6f0fb', '#e6faff'];
const MARE = ['#1aa0b6', '#22b3c4', '#4fd0d2'];
const ONDA = ['#7fe1e6', '#c9fbf6'];
const SABBIA = ['#f3e2b4', '#e2cb94'];
const FRONDA = ['#17603c', '#1f7a4a', '#2c9a55'];

function vetrata(g, w, h, lato) {
  if (lato !== 'n') return canne(g, w, h);
  const r = (x, y, a, b, c) => {
    g.fillStyle = c;
    g.fillRect(x, y, a, b);
  };
  const or = h * 0.5; // l'orizzonte
  const riva = h * 0.87; // dove finisce l'acqua
  const sx = w * 0.22; // il sole sta a sinistra, da dove viene la luce della stanza
  const dipingi = (giro) => {
    // Il cielo: quattro fasce, la piu' chiara sull'orizzonte.
    CIELO.forEach((c, i) => r(0, (or * i) / 4, w, or / 4 + 0.5, c));
    g.fillStyle = 'rgba(255,248,214,0.45)';
    g.beginPath();
    g.arc(sx, h * 0.17, h * 0.115, 0, TAU);
    g.fill();
    g.fillStyle = '#fff6c8';
    g.beginPath();
    g.arc(sx, h * 0.17, h * 0.07, 0, TAU);
    g.fill();
    for (let i = 0; i < w / 80; i++) {
      const cx = rnd('nx', i) * w;
      const cy = h * (0.07 + rnd('ny', i) * 0.26);
      r(cx - 13, cy + 2.2, 26, 1.6, '#e8f8fd');
      r(cx - 9, cy, 18, 2.4, '#ffffff');
      r(cx - 5, cy - 2, 11, 2.2, '#ffffff');
    }
    // Lontano: il vulcano nella foschia, un'isola bassa piu' vicina e una barca a vela.
    monte(g, w * 0.6, or, h * 1.1, h * 0.2, '#8fcbdc');
    monte(g, w * 0.69, or, h * 0.55, h * 0.07, '#5fb39a');
    monte(g, w * 0.03, or, h * 0.7, h * 0.05, '#5fb39a');
    const bx = w * 0.4;
    r(bx - 3, or - 1.2, 6, 1.2, '#fffaf0');
    g.fillStyle = '#ff8a65';
    g.beginPath();
    g.moveTo(bx - 0.3, or - 1.6);
    g.lineTo(bx - 0.3, or - 7.5);
    g.lineTo(bx + 3.4, or - 1.6);
    g.fill();
    // L'acqua: tre fasce che schiariscono venendo a riva, e la riga dell'orizzonte.
    const fondo = riva - or;
    r(0, or, w, fondo * 0.3, MARE[0]);
    r(0, or + fondo * 0.3, w, fondo * 0.4, MARE[1]);
    r(0, or + fondo * 0.7, w, fondo * 0.3, MARE[2]);
    r(0, or, w, 0.7, '#2a9fb5');
    // Le onde: trattini che si allungano venendo avanti. Ognuna si rimescola ogni
    // quattro secondi, sfalsata dalle altre: l'acqua si muove senza che niente scorra.
    for (let i = 0; i < w * 0.45; i++) {
      if (rnd('onda', i, Math.floor((giro + i * 7) / 4)) > 0.72) continue;
      const k = rnd('oy', i);
      r(rnd('ox', i) * w, or + 2 + k * (fondo - 4), 2 + k * 7, 0.5 + k * 0.5, ONDA[k > 0.6 ? 1 : 0]);
    }
    // Il riflesso del sole: una colonna di luccichii che si apre verso riva.
    for (let i = 0; i < 24; i++) {
      if (rnd('lucc', i, Math.floor((giro + i) / 2)) > 0.7) continue;
      const lw = 2.5 + i * 0.35;
      r(sx + (rnd('lx', i) - 0.5) * (5 + i * 1.3) - lw / 2, or + 1.2 + (i * (fondo - 3)) / 24, lw, 0.7, 'rgba(255,252,230,0.85)');
    }
    // La battigia e la sabbia.
    r(0, riva, w, h - riva, SABBIA[0]);
    for (let x = 0; x < w; x += 6) r(x, riva - 0.5 + Math.sin(x / 9) * 0.5, 6.2, 1.1, '#f4fdff');
    r(0, h - 1.4, w, 1.4, SABBIA[1]);
    // Le palme: a passo largo dagli angoli, mai in mezzo — li' c'e' la porta.
    for (const [u, k, piega] of [[0.06, 0.8, 9], [0.15, 0.56, -6], [0.3, 0.68, 7], [0.72, 0.62, -8], [0.86, 0.82, -10], [0.95, 0.6, 6]]) {
      palma(g, w * u, h - 1, h * k, piega * (h / 80), u);
    }
    // La frangia del tetto di paglia, in cima all'apertura.
    for (let x = 0, i = 0; x < w; x += 2.6, i++) r(x, 0, 2.2, 2.6 + rnd('paglia', i) * 2.6, i & 1 ? '#c9a558' : '#b08a3f');
  };
  dipingi(0);
  return (giro) => {
    dipingi(giro);
    return true;
  };
}

/** Un monte sull'orizzonte: largo `w` attorno a `cx`, con la cima un po' spostata. */
function monte(g, cx, y, w, alto, c) {
  g.fillStyle = c;
  g.beginPath();
  g.moveTo(cx - w / 2, y);
  g.quadraticCurveTo(cx - w * 0.16, y - alto * 0.5, cx - w * 0.04, y - alto);
  g.lineTo(cx + w * 0.03, y - alto * 0.96);
  g.quadraticCurveTo(cx + w * 0.2, y - alto * 0.4, cx + w / 2, y);
  g.fill();
}

/** Una palma in controluce: il tronco che piega, e nove fronde che ricadono dalla cima. */
function palma(g, x, y, alta, piega, seme) {
  const cx = x + piega;
  const cy = y - alta;
  g.save();
  g.lineCap = 'round';
  g.strokeStyle = '#6b4a2a';
  g.lineWidth = 1 + alta * 0.035;
  g.beginPath();
  g.moveTo(x, y);
  g.quadraticCurveTo(x + piega * 0.1, y - alta * 0.6, cx, cy);
  g.stroke();
  const L = alta * 0.4;
  for (let i = 0; i < 9; i++) {
    const a = ((-205 + i * 28.75 + (rnd(seme, 'fa', i) - 0.5) * 14) * Math.PI) / 180;
    const l = L * (0.8 + rnd(seme, 'fl', i) * 0.35);
    const tx = cx + Math.cos(a) * l;
    const ty = cy + Math.sin(a) * l * 0.7 + l * 0.38;
    const mx = cx + Math.cos(a) * l * 0.55;
    const my = cy + Math.sin(a) * l * 0.55 - l * 0.3;
    g.fillStyle = FRONDA[i % FRONDA.length];
    g.beginPath();
    g.moveTo(cx, cy);
    g.quadraticCurveTo(mx, my, tx, ty);
    g.quadraticCurveTo(mx, my + l * 0.24, cx, cy);
    g.fill();
  }
  g.fillStyle = '#4a321c';
  for (const dx of [-1.3, 1.1]) {
    g.beginPath();
    g.arc(cx + dx, cy + 1.6, 1.2, 0, TAU);
    g.fill();
  }
  g.restore();
}

/* Un muro di canne: ogni canna larga cinque — fuga, luce, corpo, ombra, come le
   quattro tinte di `.of-wall` — e un nodo ogni tredici, sfalsato da una all'altra. */
function canne(g, w, h) {
  const r = (x, y, a, b, c) => {
    g.fillStyle = c;
    g.fillRect(x, y, a, b);
  };
  r(0, 0, w, h, C.wall);
  for (let x = 0, i = 0; x < w; x += 5, i++) {
    r(x, 0, 1, h, '#7d6a30');
    r(x + 1, 0, 1, h, C.wallHi);
    r(x + 4, 0, 1, h, C.wallLo);
    for (let y = 3 + ((i * 5) % 13); y < h; y += 13) r(x + 1, y, 4, 0.9, 'rgba(110,85,25,0.55)');
  }
}

/** Attorno alla stanza: il blu fondo del mare al largo, con un chiarore turchese in mezzo. */
function sfondo(g, w, h) {
  g.fillStyle = '#0c2f38';
  g.fillRect(0, 0, w, h);
  const gr = g.createRadialGradient(w / 2, h * 0.52, 0, w / 2, h * 0.52, Math.max(w, h) * 0.62);
  gr.addColorStop(0, 'rgba(34,179,196,0.4)');
  gr.addColorStop(1, 'rgba(34,179,196,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
}

/* Quello che ha solo Bali: il tappeto di rattan sotto il blocco delle scrivanie. Le
   misure sono quelle di room.js (diciotto ai lati, ventiquattro sopra il monitor,
   trenta sotto), cosi' quando la stanza cresce il tappeto cresce con i banchi. */
function extra(K) {
  const D = K.R.DESKS;
  if (!D.length) return;
  const { w: SW, h: SH } = (K.R.SV && K.R.SV.desk) || { w: 48, h: 32 };
  const x0 = Math.min(...D.map((d) => d.x)) - 18;
  const x1 = Math.max(...D.map((d) => d.x)) + SW + 18;
  const y0 = Math.min(...D.map((d) => d.b)) - SH - 24;
  const y1 = Math.max(...D.map((d) => d.b)) + 30;
  const w = x1 - x0;
  const d = y1 - y0;
  const PPU = 4;
  const { g, tex } = K.tela(w * PPU, d * PPU);
  g.scale(PPU, PPU);
  g.fillStyle = '#d8b77c';
  g.fillRect(0, 0, w, d);
  // L'intreccio: due passate di fili in diagonale, una scura e una chiara.
  g.lineWidth = 1.4;
  for (const [verso, c] of [[1, 'rgba(120,82,36,0.28)'], [-1, 'rgba(255,245,220,0.3)']]) {
    g.strokeStyle = c;
    g.beginPath();
    for (let k = -d; k < w + d; k += 6) {
      g.moveTo(k, verso > 0 ? 0 : d);
      g.lineTo(k + d, verso > 0 ? d : 0);
    }
    g.stroke();
  }
  // L'orlo: scuro, chiaro, e un filo scuro dentro.
  for (const [m, s, c] of [[0, 2, '#b88b4c'], [2, 2, '#ecd29e'], [4, 1, '#b88b4c']]) {
    g.fillStyle = c;
    g.fillRect(m, m, w - m * 2, s);
    g.fillRect(m, d - m - s, w - m * 2, s);
    g.fillRect(m, m, s, d - m * 2);
    g.fillRect(w - m - s, m, s, d - m * 2);
  }
  tex.needsUpdate = true;
  K.decalco(tex, x0, y0, w, d, 0.12);
}

export default {
  nome: 'bali',
  C,
  schermi: {
    on: ['#3ec7c4', '#c9fbf6', '#1d8f95'],
    working: ['#ff8a65', '#ffe0cf', '#e0603c'],
    luce: 0,
  },
  filo: null,
  aloni: 0,
  portaAccesa: false,
  montanti: 48,
  // Il sole di meta' mattina, da sinistra: la chiave e' calda e forte, l'ambiente
  // e' il cielo — cosi' le ombre restano nette e un filo azzurre.
  luci: {
    ambiente: ['#eaf4ff', 0.46],
    chiave: ['#ffe6b0', 0.82, [-220, 70, 330]],
    riempi: ['#fff1d6', 0.2],
  },
  sfondo,
  pavimento,
  vetrata,
  extra,
};
