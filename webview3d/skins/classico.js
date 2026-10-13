/* Claude Studio — l'ufficio in 3D, la pelle «Classico»: la stanza di legno.
 *
 * L'interfaccia di una pelle e' scritta in cima a skins/notte.js: qui ci sono solo i
 * valori di questa. Le tinte sono quelle di webview/room.css — il legno di
 * SeasonVale, #e86837 di corpo, #ff9148 di luce, #b64335 d'ombra — cosi' la stanza
 * piatta e questa restano la stessa stanza.
 *
 * E' un libro illustrato: tinte piatte, niente sfumature dove non serve, e fuori
 * dalla vetrata un paese disegnato — colline a file, case coi tetti rossi, cipressi,
 * un sole coi suoi raggi e le nuvole che passano. Di giorno: niente neon e niente
 * aloni, gli schermi non fanno luce. I due muri di fianco sono legno pieno.
 */
import { rnd, TAU, U } from '../kit.js';

const C = {
  // la stanza
  slab: '#3a2418', vuoto: '#17100f',
  wall: '#cf8c4a', wallHi: '#e8a866', wallLo: '#a4652f', infisso: '#7d4a21',
  // i mobili
  wood: '#e86837', woodTop: '#f07a44', woodHi: '#ff9148', woodLo: '#b64335', woodDk: '#7a2f25',
  chair: '#55424e', chairLo: '#3d2d38',
  leaf: '#7d4a28', leafHi: '#a2673a', leafLo: '#5d3520', porta: '#a4652f', cabina: '#241a16', pomello: '#e8c14d',
  // il computer
  off: '#241c22', bezel: '#4a3a44', monLo: '#3d2d38', ink: '#2e1c2c', tasti: '#efe6d6',
  // il bar, la fontanella, le piante
  cream: '#f2ede2', steel: '#9aa7b0', carta: '#f5f1e6', caffe: '#5a3520',
  mach: '#55424e', machHi: '#6b5460', machLo: '#3d2d38', spia: '#ff9148',
  jar: '#3f7fd8', jarHi: '#9cc4ff',
  stone: '#b9b2a6', stoneLo: '#8f887c', soil: '#4a3323', steam: '#ffffff', gravel: '#e9e2d2',
  acqua: ['#3f8fd0', '#6fc0f0', '#d6f0ff'],
  verde: ['#2e6b3a', '#3c8a47', '#4fa457', '#6cbf6a'], fiore: '#f08ab0',
  vasi: ['#b9b2a6', '#3b4a6b', '#8f5fb8', '#4a8fd0', '#7a4a32', '#7a4a32'],
  faldoni: ['#d04a3a', '#3f7fb8', '#e8c14d', '#f2ede2', '#5c8a4b', '#8a5fb0'],
};

// ---- il pavimento: lastre color crema di sopra, assito caldo nel salone
const F = {
  fuga: '#b48c63', lastre: ['#e3c8a6', '#dcbf9b', '#e9d0b0', '#dfc4a2'], luce: 'rgba(255,255,255,0.2)',
  assi: ['#b56c3f', '#aa643a', '#bf7645', '#a35e36', '#b06839'], giunto: '#7a4226', vena: 'rgba(88,44,22,0.22)', riflesso: 'rgba(255,200,140,0.2)',
  gravel: '#e9e2d2', gravelLo: '#c9bfa8',
};

function pavimento(g, R) {
  const r = (x, y, w, h, c) => {
    g.fillStyle = c;
    g.fillRect(x, y, w, h);
  };
  // Le due stanze e il corridoio: lastre da ottanta centimetri, quattro tinte a
  // scacchi, gli angoli appena tondi e un filo di luce in testa. Contate dalla linea
  // di mezzo: allargando la stanza se ne aggiungono ai lati, e la porta resta su una fuga.
  r(0, 0, R.W, R.MEZZO, F.fuga);
  const lato = 24;
  for (let y = 16, j = 0; y < R.MEZZO; y += lato, j++) {
    for (let x = R.W / 2 - Math.ceil(R.W / 2 / lato) * lato, i = 0; x < R.W; x += lato, i++) {
      g.fillStyle = F.lastre[(i & 1) + 2 * (j & 1)];
      g.beginPath();
      g.roundRect(x + 0.4, y + 0.4, lato - 0.8, Math.min(lato, R.MEZZO - y) - 0.8, 1);
      g.fill();
      r(x + 1.2, y + 1.2, lato - 2.4, 0.55, F.luce);
    }
  }
  // Il salone: assi larghe trenta centimetri, tagliate dove capita — giunti che
  // scendono a passo uguale da una fila all'altra si leggono come diagonali — e su
  // ognuna qualche venatura corta, tirata a mano e non a rumore.
  for (let y = R.MEZZO, j = 0; y < R.H; y += 9, j++) {
    for (let x = -rnd('testa', j) * 30, i = 0; x < R.W; i++) {
      const w = 18 + rnd('asse', j, i) * 14;
      r(x, y, w + 0.5, 9, F.assi[Math.floor(rnd('tinta', j, i) * F.assi.length)]);
      for (let k = 0; k < 3; k++) r(x + 2 + rnd('vx', j, i, k) * (w - 9), y + 1.7 + rnd('vy', j, i, k) * 5.6, 3.6 + rnd('vw', j, k) * 6, 0.35, F.vena);
      r(x, y, 0.5, 9, F.giunto);
      x += w;
    }
    r(0, y, R.W, 0.63, F.giunto);
    r(0, y + 0.63, R.W, 0.35, F.riflesso);
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
 * Il muro di fondo e' una vetrata intera, e in una scheda alta sale di parecchi
 * metri: quindi il paese non si dipinge in parti dell'altezza del muro ma in METRI
 * dal pavimento. L'orizzonte sta sempre a meno di tre metri, le colline non si
 * stirano, e tutto quello che la vetrata guadagna in altezza e' cielo. La x si
 * conta dalla linea di mezzo della stanza: allargando la scheda il paese si
 * scopre ai due lati, non si rimescola.
 *
 * I montanti di legno e le nuvole li mette il motore (`montanti`, `nuvole`); qui
 * c'e' quello che sta fermo: il cielo, il sole coi raggi, le montagne, quattro file
 * di colline che vengono avanti sempre piu' verdi, e la grana della carta.
 */
const CIELO = ['#58aee8', '#a5d8f2', '#f7eccb'];
const MURI = ['#f6e6c8', '#edd2a6', '#f8f1e2', '#e6c49a'];
const TETTI = ['#cf5a3b', '#b9463a', '#d86f41', '#a84c36'];
/** Da dove si comincia a contare case e alberi: piu' a sinistra di qualunque stanza. */
const LONTANO = -40;

function vetrata(g, w, h, lato, info = {}) {
  if (lato !== 'n') return false;
  const z0 = (info.z0 || 0) / U;
  const X = w / U / 2;
  const alto = z0 + h / U;
  // Dove la scheda taglia la vetrata: il sole sta un metro sotto, cosi' si vede
  // sempre — meno, in una scheda larga, dove un metro sotto c'e' gia' il traverso.
  const cima = info.cima ? info.cima / U : alto - 0.5;
  const sole = [-0.42 * Math.min(X, 6.2), cima - Math.min(1, Math.max(0.4, (cima - 3.13) * 0.6))];
  g.save();
  g.translate(w / 2, h);
  g.scale(U, -U);
  g.translate(0, -z0);

  const cielo = g.createLinearGradient(0, Math.max(alto, 5), 0, 2.3);
  cielo.addColorStop(0, CIELO[0]);
  cielo.addColorStop(0.6, CIELO[1]);
  cielo.addColorStop(1, CIELO[2]);
  g.fillStyle = cielo;
  g.fillRect(-X, z0, 2 * X, alto - z0);
  // Il sole: il suo tepore, dodici raggi lunghi e corti, il disco.
  const al = g.createRadialGradient(sole[0], sole[1], 0, sole[0], sole[1], 1.5);
  al.addColorStop(0, 'rgba(255,246,204,0.95)');
  al.addColorStop(0.3, 'rgba(255,240,190,0.5)');
  al.addColorStop(1, 'rgba(255,240,190,0)');
  g.fillStyle = al;
  g.fillRect(sole[0] - 1.5, sole[1] - 1.5, 3, 3);
  g.fillStyle = 'rgba(255,244,196,0.62)';
  for (let i = 0; i < 12; i++) {
    const a = (i * TAU) / 12 + 0.12;
    const r = i % 2 ? 0.56 : 0.78;
    g.beginPath();
    g.moveTo(sole[0] + Math.cos(a - 0.085) * 0.33, sole[1] + Math.sin(a - 0.085) * 0.33);
    g.lineTo(sole[0] + Math.cos(a) * r, sole[1] + Math.sin(a) * r);
    g.lineTo(sole[0] + Math.cos(a + 0.085) * 0.33, sole[1] + Math.sin(a + 0.085) * 0.33);
    g.fill();
  }
  const disco = (x, y, r, c) => {
    g.fillStyle = c;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  };
  const ovale = (x, y, rx, ry, c) => {
    g.fillStyle = c;
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, TAU);
    g.fill();
  };
  disco(sole[0], sole[1], 0.3, '#fff8d8');

  const onda = (x, base, amp, fr, ph) => base + amp * Math.sin(x * fr + ph) + amp * 0.45 * Math.sin(x * fr * 2.3 + ph * 1.7);
  /** Una fila di colline: il campo pieno, e un filo piu' chiaro sulla cresta. */
  const colle = (c, cresta, base, amp, fr, ph) => {
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(-X, 0);
    for (let x = -X; x <= X + 0.05; x += 0.05) g.lineTo(x, onda(x, base, amp, fr, ph));
    g.lineTo(X, 0);
    g.fill();
    g.strokeStyle = cresta;
    g.lineWidth = 0.035;
    g.beginPath();
    for (let x = -X; x <= X + 0.05; x += 0.05) g.lineTo(x, onda(x, base, amp, fr, ph) - 0.017);
    g.stroke();
  };
  const albero = (x, y, r, c = '#3c8a47', hi = '#62ad5c') => {
    g.fillStyle = '#7d4a28';
    g.fillRect(x - r * 0.12, y, r * 0.24, r * 1.1);
    disco(x - r * 0.45, y + r * 1.25, r * 0.62, c);
    disco(x + r * 0.45, y + r * 1.25, r * 0.62, c);
    disco(x, y + r * 1.75, r * 0.72, c);
    disco(x - r * 0.2, y + r * 1.95, r * 0.34, hi);
  };
  const cipresso = (x, y, a) => {
    ovale(x, y + a * 0.5, a * 0.13, a * 0.5, '#2e6b3a');
    ovale(x - a * 0.035, y + a * 0.56, a * 0.05, a * 0.36, '#43894a');
  };
  const casa = (x, y, cw, ch, i) => {
    const th = cw * 0.42;
    g.fillStyle = MURI[i % 4];
    g.fillRect(x - cw / 2, y, cw, ch);
    g.fillStyle = 'rgba(58,32,48,0.15)';
    g.fillRect(x + cw * 0.24, y, cw * 0.26, ch);
    g.fillStyle = '#8f887c';
    g.fillRect(x + cw * 0.18, y + ch + th * 0.2, cw * 0.12, th * 0.75);
    g.fillStyle = TETTI[i % 4];
    g.beginPath();
    g.moveTo(x - cw * 0.62, y + ch);
    g.lineTo(x, y + ch + th);
    g.lineTo(x + cw * 0.62, y + ch);
    g.fill();
    g.fillStyle = '#5b86ad';
    for (let f = 0; f < (cw > 0.5 ? 3 : 2); f++) g.fillRect(x - cw * 0.36 + f * cw * 0.27, y + ch * 0.5, cw * 0.13, ch * 0.28);
    g.fillStyle = '#8a5a34';
    g.fillRect(x - cw * 0.07, y, cw * 0.14, ch * 0.36);
  };
  /** Una fila di cose lungo una collina, contate da LONTANO: `fn(x, i)` per quelle che cadono nel muro. */
  const fila = (seme, passo, gioco, fn) => {
    for (let x = LONTANO, i = 0; x < X + 1; x += passo + rnd(seme, i) * gioco, i++) if (x > -X - 1) fn(x, i);
  };

  // Le montagne in fondo, poi quattro file di colline che vengono avanti.
  g.fillStyle = '#b9d6e6';
  g.beginPath();
  g.moveTo(-X, 0);
  for (let x = -X; x <= X + 0.1; x += 0.1) g.lineTo(x, 2.72 + 0.42 * Math.abs(Math.sin(x * 0.47 + 0.8)) + 0.14 * Math.sin(x * 1.9));
  g.lineTo(X, 0);
  g.fill();
  colle('#b4dba6', '#cdeabb', 2.62, 0.17, 0.5, 1.0);
  fila('macchia', 0.21, 0, (x, i) => {
    const r = 0.06 + 0.05 * rnd('mr', i);
    if (rnd('mc', i) < 0.55) disco(x, onda(x, 2.62, 0.17, 0.5, 1.0) + r * 0.5, r, '#86bf85');
  });
  colle('#94cb82', '#b2dd9a', 2.3, 0.16, 0.78, 2.4);
  fila('terza', 0.5, 0.9, (x, i) => {
    const y = onda(x, 2.3, 0.16, 0.78, 2.4) - 0.05;
    if (i % 3 === 0) casa(x, y - 0.04, 0.3, 0.2, i + 1);
    else if (i % 3 === 1) cipresso(x, y - 0.02, 0.42 + rnd('tc', i) * 0.2);
    else albero(x, y - 0.05, 0.11 + rnd('ta', i) * 0.05, '#4d9a52', '#72b96a');
  });
  colle('#78b867', '#9bd183', 1.95, 0.13, 0.62, 0.3);
  // I campi: qualche striscia pettinata sulla collina di mezzo.
  g.strokeStyle = 'rgba(190,225,140,0.55)';
  g.lineWidth = 0.022;
  for (let c = LONTANO + 0.4; c < X; c += 3.3) {
    if (c < -X - 2) continue;
    for (let j = 0; j < 5; j++) {
      g.beginPath();
      for (let s = 0; s <= 1.2; s += 0.1) g.lineTo(c + s + j * 0.05, onda(c + s, 1.95, 0.13, 0.62, 0.3) - 0.1 - j * 0.07 - s * 0.05);
      g.stroke();
    }
  }
  fila('seconda', 0.75, 0.8, (x, i) => {
    const y = onda(x, 1.95, 0.13, 0.62, 0.3) - 0.07;
    if (i % 4 === 1) albero(x, y - 0.1, 0.16 + rnd('sa', i) * 0.06);
    else if (i % 4 === 3) cipresso(x, y - 0.06, 0.6 + rnd('sc', i) * 0.2);
    else casa(x, y - 0.08, 0.42 + rnd('sw', i) * 0.14, 0.3 + rnd('sh', i) * 0.1, i);
  });
  colle('#62a85a', '#86c877', 1.5, 0.09, 0.5, 4.0);
  fila('prima', 0.85, 0.75, (x, i) => {
    const y = onda(x, 1.5, 0.09, 0.5, 4.0) - 0.1;
    if (i % 5 === 2) albero(x, y - 0.25, 0.26 + rnd('pa', i) * 0.08, '#2e6b3a', '#4f9a52');
    else if (i % 5 === 4) {
      cipresso(x - 0.12, y - 0.2, 0.85);
      cipresso(x + 0.14, y - 0.22, 0.7);
    } else casa(x, y - 0.26, 0.6 + rnd('pw', i) * 0.2, 0.42 + rnd('ph', i) * 0.14, i + 2);
  });
  colle('#4f9550', '#74b668', 1.0, 0.05, 0.9, 2.0);
  // Il vetro: due strisce di luce di sbieco su un vetro si' e uno no, una volta in alto e una in basso.
  g.fillStyle = 'rgba(255,255,255,0.17)';
  (info.vetri || []).forEach((v, i) => {
    if (i % 2) return;
    const cx = v / U - X;
    const y = i % 4 ? Math.min(3.95, cima - 0.2) : 2.95;
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

  // La grana della carta: puntini radi, un po' piu' chiari e un po' piu' scuri. In
  // pixel di tela e non di stanza: e' la carta, non il paese.
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  const { width: pw, height: ph } = g.canvas;
  for (let i = 0, n = (pw * ph) / 1600; i < n; i++) {
    g.fillStyle = i % 2 ? 'rgba(255,255,255,0.07)' : 'rgba(70,40,60,0.045)';
    g.fillRect(rnd('gx', i) * pw, rnd('gy', i) * ph, 2 + rnd('gw', i) * 3, 2);
  }
  g.restore();
}

/* Una striscia di cielo con le sue due nuvole: tre gobbe e mezza su una base dritta,
   e sotto la loro ombra azzurra. Il motore la ripete di fianco e la fa scorrere. */
const NUVOLA = ['#ffffff', '#c4dcef'];
function nuvole(g, w, h, i) {
  g.save();
  g.scale(w / 512, h / 128);
  const una = (cx, cy, s) => {
    for (const [c, dy] of [[NUVOLA[1], 6 * s], [NUVOLA[0], 0]]) {
      g.save();
      g.beginPath();
      g.rect(0, 0, 512, cy + dy + 7 * s);
      g.clip();
      g.fillStyle = c;
      g.beginPath();
      g.roundRect(cx - 48 * s, cy + dy - 8 * s, 94 * s, 15 * s, 7 * s);
      for (const [x, y, r] of [[-36, 0, 15], [-15, -11, 21], [11, -6, 18], [33, 1, 13]]) {
        g.moveTo(cx + x * s + r * s, cy + y * s + dy);
        g.arc(cx + x * s, cy + y * s + dy, r * s, 0, TAU);
      }
      g.fill();
      g.restore();
    }
  };
  una(120 + rnd('nu', i, 0) * 40, 62 + rnd('nu', i, 1) * 20, 1.25 + rnd('nu', i, 2) * 0.4);
  una(370 + rnd('nu', i, 3) * 50, 52 + rnd('nu', i, 4) * 36, 0.8 + rnd('nu', i, 5) * 0.35);
  g.restore();
}

/** Dietro la stanza: non si vede mai — la stanza riempie la scheda — se non nel fotogramma in cui la scheda cambia misura. Il colore dei muri, cosi' non lampeggia. */
function sfondo(g, w, h) {
  g.fillStyle = C.wallLo;
  g.fillRect(0, 0, w, h);
}

export default {
  nome: 'classico',
  C,
  schermi: {
    on: ['#a1ab3c', '#e4eb9c', '#68662b'],
    working: ['#ff9148', '#ffe2c4', '#d9562a'],
    luce: 0,
  },
  filo: null,
  aloni: 0,
  portaAccesa: false,
  montanti: 45,
  // Due luci, a tinte piatte. L'ambiente e' il colore di ogni ombra: un viola che
  // raffredda il legno. La chiave, da sinistra e da dietro chi guarda, ci aggiunge
  // quello che manca per arrivare a un bianco caldo. Niente riempimento.
  luci: {
    ambiente: ['#bbaec1', 1],
    chiave: ['#c2cbb3', 1, [-0.6, 0.3, 0.75]],
    riempi: ['#ffffff', 0],
  },
  sfondo,
  pavimento,
  vetrata,
  nuvole,
  // Di suo non ha niente: la luce del giorno la fanno le due luci qui sopra.
  extra() {},
};
