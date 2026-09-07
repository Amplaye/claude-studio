// Ritaglia i mobili che servono all'ufficio dai fogli di SeasonVale e li impacchetta
// in un foglio solo, `docs/skins/sv-room.png`, con accanto la mappa dei nomi.
//
// Perche' un foglio nostro invece dei due originali: dei due fogli di partenza
// l'ufficio usa una ventina di caselle su quattrocento, e il resto e' roba da
// fattoria. Impacchettare solo quello che si usa tiene il file piccolo e, cosa
// che conta di piu', mette per iscritto quali caselle stiamo prendendo.
//
// Non c'e' nessuna libreria di immagini nel progetto e non ne serve una: c'e'
// gia' Playwright, e un browser sa ritagliare e incollare con <canvas>. Il
// disegno lo fa lui, qui si scrivono solo le coordinate.
//
//   node scripts/sv-sheet.mjs           -> foglio + mappa
//   node scripts/sv-sheet.mjs --contact -> in piu' un provino con i nomi sopra,
//                                          che e' l'unico modo di accorgersi che
//                                          un ritaglio ha preso mezza sedia.
import { chromium } from 'playwright';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PACK = 'C:/Users/Steward/Documents/SeasonVale Materials';

/**
 * Un foglio solo, a caselle da 16.
 *
 * Il pacchetto ne ha tre di famiglie che non si parlano: questa (`All Tileset`,
 * palette Resurrect-64, legno caldo), una piu' scura in `plants/` e una a 48
 * per RPG Maker. Mescolarle si vede subito — due marroni diversi nella stessa
 * stanza — quindi si sta in una corsia sola. Questa, perche' il suo legno
 * arancio e' gia' la terracotta del CRM.
 */
const SRC = {
  a: PACK + '/interiors/All Tileset/16x16.png',
};

/**
 * Cosa prendere, in pixel del foglio di partenza: [foglio, x, y, larghezza, altezza].
 *
 * I mobili di SeasonVale sono disegnati alti — un tavolo occupa una casella per
 * terra ma ne mangia due in altezza, perche' si vede anche il fianco. Le misure
 * qui sotto sono quelle vere del disegno, non arrotondate alla casella: e' la
 * pagina che poi li appoggia per terra dal basso.
 *
 * I nomi sono quello che la roba fa da noi, non quello che era nel pacchetto:
 * il pacchetto e' una fattoria medievale, e li' dentro non esiste nessuna
 * scrivania. La bacheca dei foglietti spillati e' la lavagna delle riunioni, il
 * comodino e' il frigo, la botte e' il cestino.
 */
const CUT = {
  // --- piani d'appoggio ---
  desk: ['a', 433, 209, 47, 27], // tavolo coi cassetti: la scrivania, 3 caselle
  meetTable: ['a', 433, 177, 47, 26], // tavolo lungo liscio: le riunioni
  tableThin: ['a', 433, 243, 47, 14], // tavolo alto e stretto
  tableSmall: ['a', 193, 176, 32, 13], // tavolino da due caselle
  counter: ['a', 1, 208, 47, 50], // bancone grosso: il bar
  bench: ['a', 1, 270, 47, 13], // panca lunga: il divano dell'ingresso

  // --- sedute ---
  chairDown: ['a', 50, 260, 13, 25], // sedia di fronte
  chairUp: ['a', 50, 226, 13, 23], // sedia di spalle
  stoolTall: ['a', 81, 214, 13, 28], // sgabello alto
  stoolRound: ['a', 66, 261, 14, 20], // sgabello tondo

  // --- muro e ripiani ---
  board: ['a', 195, 55, 44, 37], // asse di legno liscia: la lavagna
  cork: ['a', 244, 55, 41, 37], // bacheca coi foglietti spillati
  cabinet: ['a', 259, 98, 26, 41], // armadio a ante
  shelfEmpty: ['a', 291, 98, 28, 41], // scaffale vuoto
  shelfFull: ['a', 323, 98, 28, 41], // scaffale con la roba sopra
  shelfJars: ['a', 163, 131, 28, 42], // scaffale coi barattoli: la dispensa
  nightstand: ['a', 256, 149, 17, 23], // comodino: fa il frigo
  barrel: ['a', 225, 179, 16, 15], // botte: fa il cestino

  // --- verde ---
  plantPurple: ['a', 273, 164, 15, 21], // cespuglio nel vaso viola
  plantBlue: ['a', 288, 164, 16, 21], // cespuglio nel vaso azzurro

  // --- per terra ---
  rugOlive: ['a', 1, 288, 47, 48],
  rugGreen: ['a', 48, 288, 47, 48],
  rugRed: ['a', 96, 288, 47, 48],
};

const b64 = (p) => 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
const sources = Object.fromEntries(Object.entries(SRC).map(([k, p]) => [k, b64(p)]));

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('about:blank');

const out = await page.evaluate(
  async ({ sources, CUT, contact }) => {
    const load = (src) =>
      new Promise((ok, no) => {
        const im = new Image();
        im.onload = () => ok(im);
        im.onerror = () => no(new Error('foglio non caricato'));
        im.src = src;
      });
    const imgs = {};
    for (const [k, src] of Object.entries(sources)) imgs[k] = await load(src);

    const names = Object.keys(CUT);
    // Impacchettamento a scaffali: si riempie una riga finche' ci sta, poi si va
    // a capo. Con venti pezzi il taglio migliore non vale il codice che costa.
    const W = 256;
    const PAD = 1;
    const map = {};
    let x = PAD;
    let y = PAD;
    let rowH = 0;
    for (const n of names) {
      const [, , , w, h] = CUT[n];
      if (x + w + PAD > W) {
        x = PAD;
        y += rowH + PAD;
        rowH = 0;
      }
      map[n] = { x, y, w, h };
      x += w + PAD;
      rowH = Math.max(rowH, h);
    }
    const H = y + rowH + PAD;

    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    for (const n of names) {
      const [k, sx, sy, w, h] = CUT[n];
      const d = map[n];
      g.drawImage(imgs[k], sx, sy, w, h, d.x, d.y, w, h);
    }

    let provino = null;
    if (contact) {
      // Il provino: lo stesso foglio ingrandito, con il nome scritto sopra ogni
      // ritaglio e una cornice attorno. Serve a vedere dove il rettangolo ha
      // tagliato corto, che sul foglio impacchettato non si distingue.
      const Z = 3;
      const c2 = document.createElement('canvas');
      c2.width = W * Z;
      c2.height = H * Z;
      const g2 = c2.getContext('2d');
      g2.imageSmoothingEnabled = false;
      g2.fillStyle = '#f4f4f4';
      g2.fillRect(0, 0, c2.width, c2.height);
      g2.drawImage(cv, 0, 0, c2.width, c2.height);
      g2.font = '10px monospace';
      for (const n of names) {
        const d = map[n];
        g2.strokeStyle = 'rgba(220,0,0,.7)';
        g2.strokeRect(d.x * Z, d.y * Z, d.w * Z, d.h * Z);
        g2.fillStyle = 'rgba(255,255,255,.85)';
        g2.fillRect(d.x * Z, d.y * Z, n.length * 6 + 4, 12);
        g2.fillStyle = '#c00';
        g2.fillText(n, d.x * Z + 2, d.y * Z + 9);
      }
      provino = c2.toDataURL('image/png');
    }
    return { png: cv.toDataURL('image/png'), map, W, H, provino };
  },
  { sources, CUT, contact: process.argv.includes('--contact') }
);

await browser.close();

const bin = (dataUrl) => Buffer.from(dataUrl.split(',')[1], 'base64');
fs.writeFileSync(path.join(root, 'docs', 'skins', 'sv-room.png'), bin(out.png));
// La mappa esce come .js e non come .json apposta: la pagina si apre a doppio
// clic, e da file:// una fetch di un .json la blocca il browser. Un <script>
// invece entra sempre.
fs.writeFileSync(
  path.join(root, 'docs', 'skins', 'sv-room.js'),
  '/* Generato da scripts/sv-sheet.mjs — non si scrive a mano. */\n' +
    'window.SV = ' +
    JSON.stringify(out.map, null, 1) +
    ';\n'
);
console.log(`docs/skins/sv-room.png  ${out.W}x${out.H}  ${Object.keys(out.map).length} pezzi`);
if (out.provino) {
  fs.mkdirSync(path.join(root, 'dist', 'sv'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dist', 'sv', 'contact.png'), bin(out.provino));
  console.log('dist/sv/contact.png');
}
