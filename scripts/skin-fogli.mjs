// I materiali delle due pelli dell'ufficio, «Notte in città» e «Bali».
//
//   node scripts/skin-fogli.mjs
//
// Si lancia solo quando cambia il foglio dei mobili (`webview/sv-room.png`, che a sua
// volta lo rifa' scripts/sv-sheet.mjs) o quando si ritoccano i colori qui sotto: i
// risultati stanno in git, e la build di tutti i giorni non li tocca.
//
// Fa due cose, tutte e due dentro Chromium (come sv-sheet.mjs: nel progetto non c'e'
// una libreria di immagini, e un <canvas> basta):
//   1. ricolora il foglio dei mobili per ogni pelle (webview/sv-room-notte.png e
//      webview/sv-room-bali.png). Il legno di SeasonVale ha pochi toni pieni, e
//      scambiarli uno per uno tiene i pixel netti — un filtro CSS li sporcherebbe
//      tutti insieme, e il resto (piante, barattoli, libri) si scurisce o si scalda
//      con un ritocco leggero;
//   2. disegna le due vetrate del muro di sopra — lo skyline acceso e il mare — come
//      piastrelle SVG da 64x16, e le riscrive dentro webview/skins.css fra i due
//      segnaposto `@tessere`. Sono data URI: la CSP della webview li lascia passare
//      (`img-src … data:`), e cosi' le vetrate non sono altri due file da spedire.
//
// La pianta non cambia: cambiano solo i colori. Per questo passare da una pelle
// all'altra mentre la stanza vive non sposta nessuno.
import { chromium } from 'playwright';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const webview = path.join(root, 'webview');

/* ---- 1. i fogli ricolorati ---- */

/** Il legno di SeasonVale, dal piu' chiaro al contorno, e cosa diventa in ogni pelle. */
const LEGNO = ['#ffccb0', '#ffa990', '#ff9148', '#e86837', '#b64335', '#8d2c44', '#2e1c2c', '#ff6b08'];
const PELLI = {
  notte: {
    legno: ['#a7b0e6', '#8a93cf', '#6a72ad', '#4a5084', '#363a66', '#272a4c', '#0b0c18', '#5ef1ff'],
    // Tutto il resto al buio: piu' scuro e piu' freddo. [r, g, b] moltiplicati, poi sommati.
    resto: [0.6, 0.64, 0.78, 10, 12, 30],
  },
  bali: {
    legno: ['#fff3d2', '#ffe6b0', '#f4c97f', '#dba35c', '#b27c40', '#87592d', '#3d2a17', '#ff8a65'],
    resto: [1.03, 1.03, 0.98, 2, 2, 0],
  },
};

const browser = await chromium.launch();
const tela = await browser.newPage();
const foglio = fs.readFileSync(path.join(webview, 'sv-room.png')).toString('base64');
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
  fs.writeFileSync(path.join(webview, 'sv-room-' + nome + '.png'), Buffer.from(png, 'base64'));
}
await browser.close();

/* ---- 2. le vetrate: una piastrella 64x16 che si ripete ---- */

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

const css = path.join(webview, 'skins.css');
const testo = fs.readFileSync(css, 'utf8');
const blocco =
  '/* @tessere — le scrive scripts/skin-fogli.mjs, non si toccano a mano */\n' +
  `.of-stage[data-skin='notte'] {\n  --skyline: ${svg(citta)};\n}\n` +
  `.of-stage[data-skin='bali'] {\n  --marina: ${svg(mare)};\n}\n` +
  '/* @tessere-fine */';
const nuovo = testo.replace(/\/\* @tessere [\s\S]*?\/\* @tessere-fine \*\//, blocco);
if (nuovo === testo && !testo.includes(blocco)) {
  console.error('skins.css: non trovo i segnaposto @tessere');
  process.exit(1);
}
fs.writeFileSync(css, nuovo, 'utf8');
console.log('webview/sv-room-notte.png, webview/sv-room-bali.png, le vetrate in webview/skins.css');
