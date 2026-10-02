// Le anteprime delle due pelli nuove dell'ufficio, prima di costruirle davvero.
//
//   node build.mjs && node scripts/preview.mjs && node scripts/skin-anteprime.mjs
//
// Fa tre cose, tutte dentro Chromium (come sv-sheet.mjs: nel progetto non c'e' una
// libreria di immagini, e un <canvas> basta):
//   1. ricolora il foglio dei mobili per ogni pelle (docs/skin-anteprime/sv-room-*.png):
//      il legno di SeasonVale ha cinque toni pieni, e scambiarli uno per uno tiene i
//      pixel netti — un filtro CSS li sporcherebbe tutti insieme;
//   2. apre l'ufficio vero (dist/preview.html?office), ci fa entrare qualcuno al
//      lavoro e lo fa parlare;
//   3. cambia pelle nella stessa pagina, senza ricaricare niente — che e' anche la
//      prova che si puo' passare dall'una all'altra mentre la stanza vive — e scatta
//      una foto per pelle, piu' un confronto delle tre stanze affiancate.
import { chromium } from 'playwright';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, 'docs', 'skin-anteprime');
fs.mkdirSync(out, { recursive: true });

/* ---- 1. i fogli ricolorati ---- */

/** Il legno di SeasonVale, dal piu' chiaro al contorno, e cosa diventa in ogni pelle. */
const LEGNO = ['#ffccb0', '#ffa990', '#ff9148', '#e86837', '#b64335', '#8d2c44', '#2e1c2c', '#ff6b08'];
const PELLI = {
  notte: {
    legno: ['#a7b0e6', '#8a93cf', '#6a72ad', '#4a5084', '#363a66', '#272a4c', '#0b0c18', '#5ef1ff'],
    // Tutto il resto (piante, barattoli, libri) al buio: piu' scuro e piu' freddo.
    resto: [0.6, 0.64, 0.78, 10, 12, 30],
  },
  bali: {
    legno: ['#fff3d2', '#ffe6b0', '#f4c97f', '#dba35c', '#b27c40', '#87592d', '#3d2a17', '#ff8a65'],
    resto: [1.03, 1.03, 0.98, 2, 2, 0],
  },
};

const browser = await chromium.launch();
const tela = await browser.newPage();
const foglio = fs.readFileSync(path.join(root, 'webview', 'sv-room.png')).toString('base64');
for (const [nome, p] of Object.entries(PELLI)) {
  const png = await tela.evaluate(
    async ({ src, legno, nuovo, resto }) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + src;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height);
      const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
      const mappa = new Map(legno.map((h, i) => [hex(h).join(','), hex(nuovo[i])]));
      const [kr, kg, kb, ar, ag, ab] = resto;
      for (let i = 0; i < d.data.length; i += 4) {
        if (d.data[i + 3] < 10) continue;
        const k = d.data[i] + ',' + d.data[i + 1] + ',' + d.data[i + 2];
        const m = mappa.get(k);
        if (m) [d.data[i], d.data[i + 1], d.data[i + 2]] = m;
        else {
          d.data[i] = Math.min(255, d.data[i] * kr + ar);
          d.data[i + 1] = Math.min(255, d.data[i + 1] * kg + ag);
          d.data[i + 2] = Math.min(255, d.data[i + 2] * kb + ab);
        }
      }
      x.putImageData(d, 0, 0);
      return c.toDataURL('image/png').split(',')[1];
    },
    { src: foglio, legno: LEGNO, nuovo: p.legno, resto: p.resto }
  );
  fs.writeFileSync(path.join(out, 'sv-room-' + nome + '.png'), Buffer.from(png, 'base64'));
}
await tela.close();

/* ---- i disegni delle finestre: una piastrella 64x16 che si ripete ---- */

const svg = (corpo) =>
  'url("data:image/svg+xml,' +
  encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='64' height='16' shape-rendering='crispEdges'>${corpo}</svg>`) +
  '")';
const r = (x, y, w, h, c) => `<rect x='${x}' y='${y}' width='${w}' height='${h}' fill='${c}'/>`;

// La citta' di notte: cielo blu notte, qualche stella, palazzi a scalini e finestre
// accese — gialle, e qualcuna azzurra di uno schermo rimasto acceso.
const palazzi = [
  [0, 9, 11, '#141a3a'], [9, 6, 7, '#192043'], [15, 10, 13, '#10152f'], [25, 7, 9, '#171d3f'],
  [32, 11, 12, '#121834'], [43, 6, 6, '#1a2146'], [49, 9, 10, '#111630'], [58, 6, 8, '#171d3f'],
];
let citta = r(0, 0, 64, 16, '#0a0d26') + r(0, 0, 64, 4, '#0d1130');
for (const [x, y] of [[5, 2], [23, 1], [41, 3], [58, 1], [30, 2]]) citta += r(x, y, 1, 1, '#cfe8ff');
for (const [x, w, h, c] of palazzi) citta += r(x, 16 - h, w, h, c);
const accese = [[2, 7, 'y'], [5, 9, 'y'], [3, 12, 'c'], [11, 11, 'y'], [17, 5, 'y'], [20, 8, 'y'], [18, 11, 'c'], [22, 13, 'y'], [27, 9, 'y'], [29, 12, 'y'], [34, 6, 'c'], [37, 8, 'y'], [40, 11, 'y'], [35, 13, 'y'], [45, 12, 'y'], [51, 8, 'y'], [54, 10, 'c'], [52, 13, 'y'], [60, 10, 'y'], [61, 13, 'y']];
for (const [x, y, k] of accese) citta += r(x, y, 1, 1, k === 'c' ? '#7ff4ff' : '#ffd36b');
citta += r(0, 0, 1, 16, '#2a2f4d') + r(32, 0, 1, 16, '#2a2f4d');

// Il mare: cielo chiaro con due nuvole, l'orizzonte, il turchese con le creste, e
// i montanti di bambu' della vetrata.
let mare = r(0, 0, 64, 16, '#a6e4f5') + r(0, 0, 64, 3, '#c6f0fb');
mare += r(6, 2, 7, 1, '#ffffff') + r(8, 1, 3, 1, '#ffffff') + r(41, 3, 8, 1, '#ffffff') + r(43, 2, 4, 1, '#ffffff');
mare += r(0, 7, 64, 1, '#2a9fb5') + r(0, 8, 64, 8, '#22b3c4') + r(0, 12, 64, 4, '#1aa0b6');
for (const [x, y, w] of [[3, 10, 4], [20, 12, 5], [37, 9, 4], [52, 11, 6], [12, 14, 3], [45, 14, 4]]) mare += r(x, y, w, 1, '#7fe1e6');
mare += r(0, 0, 2, 16, '#b8964c') + r(2, 0, 1, 16, '#8a6d33') + r(32, 0, 2, 16, '#b8964c') + r(34, 0, 1, 16, '#8a6d33');

/* ---- 2. l'ufficio vero, con qualcuno al lavoro ---- */

const page = await browser.newPage({ viewport: { width: 1500, height: 940 }, colorScheme: 'dark' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(pathToFileURL(path.join(root, 'dist', 'preview.html')).href + '?office');
await page.waitForTimeout(600);
await page.addStyleTag({ path: path.join(out, 'skin.css') });
const post = (m) => page.evaluate((x) => window.postMessage(x, '*'), m);
const ora = Date.now();
const T = (content, status, activeForm) => ({ content, status, activeForm });
const A = (id, title, o = {}) => ({ id, title, status: 'in_progress', parentId: null, depth: 1, since: ora - 20000, ...o });
await post({
  k: 'tasks',
  d: {
    'ufficio-palette': {
      items: [T('Capire perché è vuoto', 'completed'), T('Riportare gli agenti', 'in_progress', 'Riporto gli agenti in ufficio'), T('Le vignette', 'pending'), T('Le skin', 'pending')],
      done: 1,
      total: 4,
      active: 1,
      busy: true,
      doing: 'Edit office.js',
      activeSince: ora - 30000,
      agents: [A('x1', 'Cerca i test', { type: 'Explore', doing: 'Read office-check.mjs' }), A('x2', 'Mappa le stanze', { type: 'general-purpose' })],
    },
  },
});
// Il tempo di entrare dalla porta, staccare il foglietto e sedersi.
await page.waitForTimeout(process.env.RAPIDO ? 1500 : 22000);

/** Veste la stanza: la pelle, il foglio ricolorato, le finestre, e quello che sta per terra. */
async function vesti(nome) {
  const sheet = nome === 'classico' ? '' : pathToFileURL(path.join(out, 'sv-room-' + nome + '.png')).href;
  await page.evaluate(
    ({ nome, sheet, citta, mare }) => {
      const stage = document.querySelector('.of-stage');
      if (nome === 'classico') delete stage.dataset.skin;
      else stage.dataset.skin = nome;
      stage.style.setProperty('--sheet-skin', sheet ? 'url("' + sheet + '")' : '');
      stage.style.setProperty('--skyline', citta);
      stage.style.setProperty('--marina', mare);
      // Il muro di sopra (i primi due pezzi della pianta) e' la vetrata.
      const muri = stage.querySelectorAll('.of-wall');
      muri[0].classList.add('nord');
      muri[1].classList.add('nord');
      // Per terra: le pozze di luce sotto le scrivanie (notte), il tappeto (Bali).
      stage.querySelectorAll('.of-luce, .of-tappeto').forEach((n) => n.remove());
      const R = window.ROOM;
      if (nome === 'notte') {
        for (const d of R.DESKS) {
          const l = document.createElement('i');
          l.className = 'of-luce';
          l.style.left = d.x + R.SW / 2 + 'px';
          l.style.top = d.b - 20 + 'px';
          l.style.zIndex = 2;
          stage.append(l);
        }
      }
      if (nome === 'bali') {
        const D = R.DESKS;
        const t = document.createElement('i');
        t.className = 'of-tappeto';
        const x0 = Math.min(...D.map((d) => d.x)) - 18;
        const x1 = Math.max(...D.map((d) => d.x)) + R.SW + 18;
        const y0 = Math.min(...D.map((d) => d.b)) - R.SH - 24;
        const y1 = Math.max(...D.map((d) => d.b)) + 30;
        Object.assign(t.style, { left: x0 + 'px', top: y0 + 'px', width: x1 - x0 + 'px', height: y1 - y0 + 'px', zIndex: 1 });
        stage.append(t);
      }
    },
    { nome, sheet, citta: svg(citta), mare: svg(mare) }
  );
}

/** Due battute vere, di due persone diverse, perche' nella foto si veda che si parlano. */
async function parlano() {
  await page.evaluate(() => {
    // Solo chi e' sveglio: chi e' fermo da un pezzo nella stanza vera non parla.
    const gente = [...document.querySelectorAll('.of-crowd .of-guy:not(.via):not(.soglia)')].filter((g) => g.matches('.busy, .recent, .done, .of-staff'));
    const staff = gente.filter((g) => g.classList.contains('of-staff'));
    const capi = gente.filter((g) => !g.classList.contains('of-staff'));
    const R = window.ROOM;
    const dice = (el, testo, verso) => el && R.parla({ el }, testo, { verso });
    dice(staff[0], 'Capo, «Riporto gli agenti» è a buon punto', 'dx');
    dice(capi[1], 'Sono al 66%. Comprimo dopo', 'sx');
    dice(capi[2], 'Su che branch siete? main?', 'dx');
  });
  await page.waitForTimeout(450);
}

const foto = {};
for (const nome of ['classico', 'notte', 'bali']) {
  await vesti(nome);
  await page.waitForTimeout(300);
  await parlano();
  const file = path.join(out, nome + '.png');
  await page.screenshot({ path: file });
  foto[nome] = file;
  await page.locator('.of-wrap').screenshot({ path: path.join(out, nome + '-stanza.png') });
  // Le nuvolette se ne vanno da sole: si aspetta che spariscano, per la prossima foto.
  await page.waitForTimeout(5400);
}

/* ---- 3. il confronto: le tre stanze affiancate ---- */
const conf = await browser.newPage({ viewport: { width: 1860, height: 560 } });
const img = (n) => 'data:image/png;base64,' + fs.readFileSync(path.join(out, n + '-stanza.png')).toString('base64');
await conf.setContent(`<body style="margin:0;background:#111;display:flex;gap:12px;padding:12px;font:600 15px system-ui;color:#eee">
  ${[['classico', 'Classico (com’è adesso)'], ['notte', 'Notte in città'], ['bali', 'Bali']]
    .map(([n, t]) => `<figure style="margin:0;flex:1"><img src="${img(n)}" style="width:100%;display:block;border-radius:8px;image-rendering:pixelated"><figcaption style="margin-top:8px;text-align:center">${t}</figcaption></figure>`)
    .join('')}
</body>`);
await conf.waitForTimeout(300);
await conf.screenshot({ path: path.join(out, 'confronto.png'), fullPage: true });
await browser.close();

if (errors.length) {
  console.error('skin-anteprime: la pagina ha protestato\n - ' + errors.join('\n - '));
  process.exit(1);
}
console.log('docs/skin-anteprime: classico.png, notte.png, bali.png, confronto.png');
