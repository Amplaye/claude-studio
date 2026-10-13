/* Claude Studio — l'ufficio in 3D, la pelle «Bali».
 *
 * L'interfaccia di una pelle e' scritta in cima a skins/notte.js: qui ci sono solo i
 * valori di questa. Le tinte sono quelle di `[data-skin='bali']` in webview/skins.css —
 * il miele dei mobili, il teak chiaro, il bambu' dei muri, il turchese del mare —
 * cosi' la stanza piatta e questa dicono la stessa cosa.
 *
 * E' lo stesso libro illustrato della stanza di legno (skins/classico.js), in
 * un'altra pagina: tinte piatte, e fuori dalla vetrata il mare — il vulcano nella
 * foschia, un'isola, una barca, le palme sulla spiaggia, il sole coi suoi raggi e le
 * nuvole che passano. Di giorno: niente neon e niente aloni. Nella stanza piatta
 * mobili, pavimento, muri e tappeto sono tutti dello stesso miele, e li' li stacca
 * il contorno; qui lo fa anche il colore: il pavimento e' il piu' chiaro, i mobili
 * sono piu' carichi, e le sedie hanno il turchese del mare.
 */
import { G, INK, rnd, TAU, U } from '../kit.js';

const C = {
  // la stanza
  slab: '#7d5a2e', vuoto: '#3d2a17',
  wall: '#d8bf76', wallHi: '#f1dea0', wallLo: '#ad9148', infisso: '#9a6b34',
  // i mobili
  wood: '#dc9648', woodTop: '#eeb163', woodHi: '#ffdc98', woodLo: '#b47638', woodDk: '#2f6f72',
  chair: '#3a9ea0', chairLo: '#8a5a2e',
  leaf: '#d6a45c', leafHi: '#ecc98e', leafLo: '#a77a3e', porta: '#a8793c', cabina: '#4a3520', pomello: '#fff6dc',
  // il computer
  off: '#2e2620', bezel: '#5a4632', monLo: '#3d2e20', ink: '#3d2a17', tasti: '#fffaf0',
  // il bar, la fontanella, le piante
  cream: '#fffaf0', steel: '#a9b4b8', carta: '#fffaf0',
  mach: '#4f3f3a', machHi: '#6a5750', machLo: '#352a27', spia: '#ff8a65',
  jar: '#22b3c4', jarHi: '#a6e4f5',
  stone: '#e3dccb', stoneLo: '#b9ae95', soil: '#5a3d24', steam: '#ffffff',
  acqua: ['#1d8f95', '#3ec7c4', '#c9fbf6'],
  verde: ['#1f7a3e', '#2c9a4c', '#44b85c', '#7ad66e'], fiore: '#ff6f91',
  vasi: ['#f3ecdc', '#e0603c', '#22b3c4', '#c8743c', '#3f9fd8', '#ffb347'],
  faldoni: ['#22b3c4', '#ff8a65', '#ffd36b', '#fffaf0', '#4fae5a', '#e0603c'],
};

// ---- il pavimento (skins.css: pietra bianca di sopra, teak chiaro a doghe nel salone)
const F = {
  fuga: '#d6c198', lastre: ['#f6eedb', '#f1e6d0', '#faf4e6', '#eee2c8'], luce: 'rgba(255,255,255,0.45)',
  doghe: ['#ecd3a3', '#e6c995', '#f0d9ad', '#e3c590', '#e9ce9c'], giunto: '#c39a5e', vena: 'rgba(140,95,40,0.16)', riflesso: 'rgba(255,250,225,0.4)',
  ghiaia: '#f3ecdc', ghiaiaLo: '#d2c5a4',
};

function pavimento(g, R) {
  const r = (x, y, w, h, c) => {
    g.fillStyle = c;
    g.fillRect(x, y, w, h);
  };
  // Le due stanze e il corridoio: pietra bianca a lastre da ottanta centimetri, gli
  // angoli appena tondi e un filo di luce in testa. Contate dalla linea di mezzo:
  // allargando la stanza se ne aggiungono ai lati e nessuna cambia tinta.
  r(0, 0, R.W, R.MEZZO, F.fuga);
  const lato = 24;
  for (let y = 16, j = 0; y < R.MEZZO; y += lato, j++) {
    for (let x = R.W / 2 - Math.ceil(R.W / 2 / lato) * lato; x < R.W; x += lato) {
      g.fillStyle = F.lastre[(Math.round((x - R.W / 2) / lato) & 1) + 2 * (j & 1)];
      g.beginPath();
      g.roundRect(x + 0.4, y + 0.4, lato - 0.8, Math.min(lato, R.MEZZO - y) - 0.8, 1);
      g.fill();
      r(x + 1.2, y + 1.2, lato - 2.4, 0.55, F.luce);
    }
  }
  // Il salone: doghe di teak larghe quaranta centimetri e lunghe, tagliate dove
  // capita, e su ognuna qualche venatura corta tirata a mano.
  for (let y = R.MEZZO, j = 0; y < R.H; y += 12, j++) {
    for (let x = -rnd('testa', j) * 60, i = 0; x < R.W; i++) {
      const w = 40 + rnd('doga', j, i) * 34;
      r(x, y, w + 0.5, 12, F.doghe[Math.floor(rnd('tinta', j, i) * F.doghe.length)]);
      for (let k = 0; k < 3; k++) r(x + 3 + rnd('vx', j, i, k) * (w - 22), y + 2.2 + rnd('vy', j, i, k) * 7.6, 6 + rnd('vw', j, k) * 12, 0.35, F.vena);
      r(x, y, 0.5, 12, F.giunto);
      x += w;
    }
    r(0, y, R.W, 0.6, F.giunto);
    r(0, y + 0.6, R.W, 0.4, F.riflesso);
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

/* ---- il mare dalla vetrata ----
 *
 * Come il paese della stanza di legno, si dipinge in METRI dal pavimento e con la x
 * contata dalla linea di mezzo: l'orizzonte sta sempre a due metri e mezzo, tutto
 * quello che la vetrata guadagna in altezza e' cielo, e allargando la scheda la
 * spiaggia si scopre ai lati senza rimescolarsi.
 *
 * Dal fondo venendo avanti: il cielo col sole, un banco di nuvole sull'orizzonte,
 * il vulcano nella foschia, le isole, il mare a fasce che schiarisce verso riva con
 * le sue onde e la barca, la battigia, la sabbia, e davanti le palme. Sta fermo:
 * ridipingere il mare ogni secondo era tutta la trama da rimandare alla scheda
 * grafica, e un mare disegnato le onde le ha gia'. I montanti e le nuvole li mette
 * il motore; i due muri di fianco sono pieni, come nelle altre due pelli.
 */
const CIELO = ['#37abe6', '#93dcf4', '#e9fbff'];
const MARE = ['#1697b4', '#22b3c4', '#55d2d3', '#9ee9e2'];
const SABBIA = ['#f6e7bd', '#e7d19c'];
const FRONDA = ['#17603c', '#1f7a4a', '#2c9a55', '#48b563'];
const ORIZZONTE = 2.5;
/** Da dove si comincia a contare isole, onde e palme: piu' a sinistra di qualunque stanza. */
const LONTANO = -40;

function vetrata(g, w, h, lato, info = {}) {
  if (lato !== 'n') return false;
  const z0 = (info.z0 || 0) / U;
  const X = w / U / 2;
  const alto = z0 + h / U;
  // Dove la scheda taglia la vetrata: il sole sta un metro sotto, cosi' si vede
  // sempre — meno, in una scheda larga, dove un metro sotto c'e' gia' il traverso. E
  // sta appena a sinistra della porta, sul mare aperto, dove di palme non ce ne
  // sono: il suo riflesso scende libero fino a riva.
  const cima = info.cima ? info.cima / U : alto - 0.5;
  const sole = [-1, cima - Math.min(1, Math.max(0.4, (cima - 3.13) * 0.6))];
  g.save();
  g.translate(w / 2, h);
  g.scale(U, -U);
  g.translate(0, -z0);
  g.lineCap = 'round';

  const cielo = g.createLinearGradient(0, Math.max(alto, 5), 0, ORIZZONTE);
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
  /** Una fila di cose contate da LONTANO: `fn(x, i)` per quelle che cadono nel muro. */
  const fila = (seme, passo, gioco, fn) => {
    for (let x = LONTANO, i = 0; x < X + 2; x += passo + rnd(seme, i) * gioco, i++) if (x > -X - 2) fn(x, i);
  };
  /** Tutto quello che sta sotto una riga che ondeggia attorno a `y`. */
  const sotto = (y, c, amp = 0, fr = 1, ph = 0) => {
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(-X, 0);
    for (let x = -X; x <= X + 0.05; x += 0.05) g.lineTo(x, y + amp * Math.sin(x * fr + ph) + amp * 0.4 * Math.abs(Math.sin(x * fr * 2.9 + ph)));
    g.lineTo(X, 0);
    g.fill();
  };
  /** Un monte sull'orizzonte: largo `larga` attorno a `cx`, con la cima un po' spostata. */
  const monte = (cx, larga, alta, c) => {
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(cx - larga / 2, ORIZZONTE);
    g.quadraticCurveTo(cx - larga * 0.16, ORIZZONTE + alta * 0.5, cx - larga * 0.04, ORIZZONTE + alta);
    g.lineTo(cx + larga * 0.03, ORIZZONTE + alta * 0.96);
    g.quadraticCurveTo(cx + larga * 0.2, ORIZZONTE + alta * 0.4, cx + larga / 2, ORIZZONTE);
    g.fill();
  };

  // Il banco di nuvole sull'orizzonte: il mare, dipinto dopo, gli taglia la base.
  fila('banco', 1.5, 2.6, (x, i) => {
    for (const [dx, r] of [[-0.3, 0.16], [0, 0.26], [0.32, 0.19], [0.6, 0.12]]) disco(x + dx, ORIZZONTE + 0.02, r * (0.8 + rnd('br', i) * 0.6), '#f4fcff');
  });
  // Il vulcano nella foschia, con la sua spalla e un filo di nuvola a mezza costa.
  monte(1.7, 5.4, 1.08, '#8fc3e2');
  monte(3.1, 3.2, 0.46, '#7ab4d8');
  for (const [dx, rx] of [[-0.5, 0.5], [0.15, 0.62], [0.8, 0.36]]) ovale(1.5 + dx, ORIZZONTE + 0.52, rx, 0.075, '#f4fcff');
  // Le isole: basse, verdi, con la loro striscia di sabbia e tre palme in cima.
  fila('isole', 7.5, 4, (x, i) => {
    const cx = x + 0.9;
    const rx = 1.1 + rnd('ir', i) * 0.7;
    for (const [dx, a] of [[-0.45, 0.26], [0.1, 0.34], [0.5, 0.22]]) {
      const px = cx + dx * rx;
      const py = ORIZZONTE + 0.2 + a;
      g.strokeStyle = '#3d7d68';
      g.lineWidth = 0.018;
      g.beginPath();
      g.moveTo(px, ORIZZONTE + 0.14);
      g.lineTo(px + 0.03, py);
      g.stroke();
      for (let k = 0; k < 5; k++) ovale(px + 0.03 + Math.cos(0.4 + k * 0.58) * 0.07, py + Math.sin(0.4 + k * 0.58) * 0.035, 0.075, 0.022, '#3d8f6c');
    }
    g.fillStyle = '#4fae8d';
    g.beginPath();
    g.ellipse(cx, ORIZZONTE, rx, 0.3, 0, 0, Math.PI);
    g.fill();
    g.fillStyle = '#6cc39c';
    g.beginPath();
    g.ellipse(cx - rx * 0.15, ORIZZONTE + 0.1, rx * 0.5, 0.15, 0, 0, Math.PI);
    g.fill();
    g.fillStyle = SABBIA[0];
    g.fillRect(cx - rx * 0.9, ORIZZONTE - 0.01, rx * 1.8, 0.035);
  });

  // Il mare: quattro fasce che schiariscono venendo a riva.
  g.fillStyle = MARE[0];
  g.fillRect(-X, 0, 2 * X, ORIZZONTE);
  sotto(2.2, MARE[1], 0.012, 2.2, 0.5);
  sotto(1.93, MARE[2], 0.02, 1.7, 2);
  sotto(1.66, MARE[3], 0.028, 1.3, 4);
  // Il riflesso del sole: una colonna di luccichii che si apre verso riva.
  for (let i = 0; i < 9; i++) {
    const lw = 0.1 + i * 0.05;
    g.fillStyle = 'rgba(255,251,226,0.8)';
    g.beginPath();
    g.roundRect(sole[0] + (rnd('lx', i) - 0.5) * (0.08 + i * 0.05) - lw / 2, ORIZZONTE - 0.07 - i * 0.085, lw, 0.024, 0.012);
    g.fill();
  }
  // Le onde: archetti bianchi, piu' lunghi e piu' radi venendo avanti.
  g.strokeStyle = 'rgba(255,255,255,0.8)';
  for (let j = 0; j < 7; j++) {
    const k = j / 6;
    const y = 2.42 - k * 0.74;
    g.lineWidth = 0.012 + 0.014 * k;
    fila('onde' + j, 0.5 + k * 0.5, 1.2, (x, i) => {
      const l = (0.1 + 0.2 * k) * (0.7 + rnd('ol', j, i) * 0.6);
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + l / 2, y + 0.02 + 0.03 * k, x + l, y);
      g.stroke();
    });
  }
  // La barca: uno scafo bianco e una vela color corallo.
  const [bx, by] = [-1.75, 2.27];
  g.fillStyle = '#ff8a65';
  g.beginPath();
  g.moveTo(bx - 0.01, by + 0.05);
  g.lineTo(bx - 0.01, by + 0.36);
  g.lineTo(bx + 0.2, by + 0.05);
  g.fill();
  g.fillStyle = '#fffaf0';
  g.beginPath();
  g.moveTo(bx - 0.18, by + 0.05);
  g.lineTo(bx + 0.2, by + 0.05);
  g.lineTo(bx + 0.13, by);
  g.lineTo(bx - 0.12, by);
  g.fill();
  // La battigia e la sabbia: la schiuma, la sabbia bagnata, quella asciutta.
  sotto(1.47, '#ffffff', 0.05, 0.8, 1);
  sotto(1.42, SABBIA[1], 0.05, 0.8, 1);
  sotto(1.3, SABBIA[0], 0.04, 0.8, 1.3);

  /* Una palma: il tronco che piega coi suoi anelli, nove fronde che ricadono dalla
     cima, e le noci. Stanno ai lati, mai in mezzo: li' c'e' la porta. E non passano i
     tre metri e mezzo: piu' su ci sono le nuvole, che il motore stende DAVANTI al
     vetro, e una nuvola che passa davanti a una palma e' un errore che si vede. */
  const palma = (x, y, alta, piega, seme) => {
    const cx = x + piega;
    const cy = y + alta;
    const su = (t) => [x + 2 * t * (1 - t) * piega * 0.1 + t * t * piega, y + 2 * t * (1 - t) * alta * 0.6 + t * t * alta];
    for (const [c, lw, dx] of [['#8a5a34', 0.13, 0], ['#b0794a', 0.045, -0.025]]) {
      g.strokeStyle = c;
      g.lineWidth = lw;
      g.beginPath();
      g.moveTo(x + dx, y);
      g.quadraticCurveTo(x + piega * 0.1 + dx, y + alta * 0.6, cx + dx, cy);
      g.stroke();
    }
    g.fillStyle = 'rgba(70,40,20,0.35)';
    for (let t = 0.08; t < 0.95; t += 0.09) g.fillRect(su(t)[0] - 0.06, su(t)[1], 0.12, 0.014);
    const L = 0.56 + alta * 0.18;
    for (let i = 0; i < 9; i++) {
      const a = ((-205 + i * 28.75 + (rnd(seme, 'fa', i) - 0.5) * 14) * Math.PI) / 180;
      const l = L * (0.8 + rnd(seme, 'fl', i) * 0.35);
      const tx = cx + Math.cos(a) * l;
      const ty = cy - Math.sin(a) * l * 0.7 - l * 0.38;
      const mx = cx + Math.cos(a) * l * 0.55;
      const my = cy - Math.sin(a) * l * 0.55 + l * 0.3;
      g.fillStyle = FRONDA[i % FRONDA.length];
      g.beginPath();
      g.moveTo(cx, cy);
      g.quadraticCurveTo(mx, my, tx, ty);
      g.quadraticCurveTo(mx, my - l * 0.3, cx, cy);
      g.fill();
    }
    for (const dx of [-0.05, 0.04, 0]) disco(cx + dx, cy - 0.07 - Math.abs(dx) * 0.4, 0.05, '#5a3a20');
  };
  fila('palme', 1.5, 1.5, (x, i) => {
    if (Math.abs(x) < 1.5) return;
    palma(x, 0.95 + rnd('py', i) * 0.2, 1.45 + rnd('pa', i) * 0.45, (x < 0 ? 1 : -1) * (0.25 + rnd('pp', i) * 0.5) * (rnd('pv', i) < 0.25 ? -1 : 1), 'p' + i);
  });
  // Due gabbiani, dalla parte del sole.
  g.strokeStyle = '#4d6f86';
  g.lineWidth = 0.02;
  for (const [dx, dy, s] of [[1.5, -0.2, 1], [2.05, 0.08, 0.7]]) {
    g.beginPath();
    g.moveTo(sole[0] + dx - 0.11 * s, sole[1] + dy + 0.02 * s);
    g.quadraticCurveTo(sole[0] + dx - 0.05 * s, sole[1] + dy + 0.07 * s, sole[0] + dx, sole[1] + dy);
    g.quadraticCurveTo(sole[0] + dx + 0.05 * s, sole[1] + dy + 0.07 * s, sole[0] + dx + 0.11 * s, sole[1] + dy + 0.02 * s);
    g.stroke();
  }
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

  // La grana della carta, come nella stanza di legno: in pixel di tela, non di stanza.
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  const { width: pw, height: ph } = g.canvas;
  for (let i = 0, n = (pw * ph) / 1600; i < n; i++) {
    g.fillStyle = i % 2 ? 'rgba(255,255,255,0.07)' : 'rgba(20,60,80,0.045)';
    g.fillRect(rnd('gx', i) * pw, rnd('gy', i) * ph, 2 + rnd('gw', i) * 3, 2);
  }
  g.restore();
}

/* Una striscia di cielo con le sue due nuvole: le stesse della stanza di legno, con
   l'ombra color del mare, e nella meta' alta della striscia — cosi' la corsia piu'
   bassa passa sopra le palme e non davanti. Il motore la ripete di fianco e la fa
   scorrere. */
const NUVOLA = ['#ffffff', '#bde8f4'];
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
  una(120 + rnd('nb', i, 0) * 40, 38 + rnd('nb', i, 1) * 12, 0.85 + rnd('nb', i, 2) * 0.25);
  una(370 + rnd('nb', i, 3) * 50, 34 + rnd('nb', i, 4) * 16, 0.65 + rnd('nb', i, 5) * 0.3);
  g.restore();
}

/** Dietro la stanza: non si vede mai, se non nel fotogramma in cui la scheda cambia misura. Il colore dei muri, cosi' non lampeggia. */
function sfondo(g, w, h) {
  g.fillStyle = C.wallLo;
  g.fillRect(0, 0, w, h);
}

/* Quello che ha solo Bali: il tappeto di rattan sotto il blocco delle scrivanie (la
   `.of-tappeto` della stanza piatta). A tratto come i mobili: l'orlo d'inchiostro,
   il bordo scuro, un filo chiaro, il campo — quattro lastre dagli angoli tondi una
   sull'altra, alte un centimetro in tutto, scritte nel lotto della stanza: non e'
   una chiamata al disegno in piu', e prende le ombre come il pavimento. Segue i
   banchi: quando la stanza cresce il tappeto cresce con loro. */
function extra(K) {
  const D = K.R.DESKS;
  if (!D.length) return;
  const xs = D.map((d) => d.x);
  const bs = D.map((d) => d.b);
  const [x0, x1, y0, y1] = [Math.min(...xs) - 18, Math.max(...xs) + 66, Math.min(...bs) - 52, Math.max(...bs) + 22];
  const q = K.qui((x0 + x1) / 2, (y0 + y1) / 2);
  const w = (x1 - x0) / U;
  const d = (y1 - y0) / U;
  /* Una lastra dagli angoli tondi, rientrata di `m` dal bordo del tappeto. Un cubo
     stirato due volte e quattro dischi, cioe' forme che ci sono gia': una lastra
     della sua misura (G.slab) sarebbe una forma nuova tenuta in memoria a ogni
     pixel di finestra tirato. */
  const lastra = (m, h, c) => {
    const [a, b, k] = [w - 2 * m, d - 2 * m, Math.max(0.03, 0.24 - m)];
    for (const [sx, sz] of [[a - 2 * k, b], [a, b - 2 * k]]) q.put(G.cube(1, 1, 1), c, 0, h / 2, 0, { filo: 0, s: [sx, h, sz] });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) q.put(G.cyl(1, 1, 1, 16), c, sx * (a / 2 - k), h / 2, sz * (b / 2 - k), { filo: 0, s: [k, h, k] });
  };
  lastra(-0.022, 0.004, INK);
  lastra(0, 0.007, '#b88b4c');
  lastra(0.1, 0.009, '#f4e4b6');
  lastra(0.15, 0.011, '#dcbd82');
  // L'intreccio: fili di sbieco nei due versi, ognuno lungo quanto il campo gli lascia.
  const [a, b] = [w / 2 - 0.23, d / 2 - 0.23];
  for (const verso of [-1, 1]) {
    for (let k = -a - b + 0.3; k < a + b; k += 0.6) {
      const t0 = Math.max(-b, -a - k);
      const t1 = Math.min(b, a - k);
      if (t1 - t0 < 0.2) continue;
      q.put(G.cube(1, 1, 1), '#cfad70', verso * (k + (t0 + t1) / 2), 0.006, (t0 + t1) / 2, { filo: 0, ry: -verso * (Math.PI / 4), s: [(t1 - t0) * Math.SQRT2, 0.0125, 0.03] });
    }
  }
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
  montanti: 45,
  // Due luci, a tinte piatte, come nella stanza di legno. L'ambiente e' il colore di
  // ogni ombra: l'azzurro del cielo, che sul miele da' un'ombra fresca. La chiave e'
  // il sole dei tropici — da sinistra come quello dipinto, e piu' alto, cosi' le
  // ombre sono corte — e ci aggiunge quello che manca per arrivare a un bianco caldo.
  luci: {
    ambiente: ['#bfb3c6', 1],
    chiave: ['#b8bf9d', 1, [-0.5, 0.3, 0.9]],
    riempi: ['#ffffff', 0],
  },
  sfondo,
  pavimento,
  vetrata,
  nuvole,
  extra,
};
