// Ritaglia i mobili che servono all'ufficio dai fogli di SeasonVale e li impacchetta
// in un foglio solo, `webview/sv-room.png`, con accanto la mappa dei nomi.
//
// Sta in `webview/` e non in `docs/` perche' il foglio e' dell'ufficio vero: la
// pagina di prova se lo va a prendere di la', che e' l'unico modo di essere sicuri
// che stia guardando gli stessi mobili.
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
 * stanza — quindi i mobili stanno in una corsia sola. Questa, perche' il suo
 * legno arancio e' gia' la terracotta del CRM.
 *
 * L'eccezione sono le quattro piante da appartamento, che questa famiglia non
 * ha: ha due cespugli in vaso e basta, e sei angoli con due cespugli sono la
 * stessa pianta tre volte. Vengono da `b`, e la regola regge lo stesso perche'
 * sono oggetti piccoli, appoggiati per terra, senza legno addosso — e' il legno
 * a fare a pugni fra un pacchetto e l'altro, non le foglie.
 */
const SRC = {
  a: PACK + '/interiors/All Tileset/16x16.png',
  // La casa moderna di craftpix: e' l'unico pacchetto con delle piante da
  // appartamento vere — ciotole e vasi, non cespugli di campagna. Palette piu'
  // fredda della fattoria, ma sono oggetti piccoli e appoggiati per terra: sul
  // pavimento scuro del salone stanno accanto ai mobili senza litigarci.
  b: PACK + '/craftpix-net-654184-main-characters-home-free-top-down-pixel-art-asset/PNG/Interior.png',
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
  //
  // Misurati contando i pixel pieni sul foglio, non a caselle: tutti e due
  // cominciano a 432, e a 433 si perdeva la colonna del contorno di sinistra —
  // il piano finiva di netto come tagliato col coltello, e il piede sinistro
  // restava largo quattro pixel invece di cinque.
  desk: ['a', 432, 209, 48, 26], // tavolo coi cassetti: la scrivania, 3 caselle
  meetTable: ['a', 432, 177, 48, 26], // tavolo lungo liscio: le riunioni

  // --- sedute ---
  //
  // Misurate col righello sul foglio, non a occhio: i primi ritagli tagliavano
  // le gambe a meta' e da lontano le sedie sembravano cassette. Il bordo di
  // sotto e' quello vero — e' da li' che la pagina le appoggia per terra —
  // mentre sopra e ai lati c'e' un pixel di margine, che non costa niente e
  // perdona un pixel di errore.
  // Il bordo di sotto e' quello vero: e' da li' che la pagina appoggia per
  // terra. Lo sgabello ne aveva sette di righe vuote sotto, e sette righe vuote
  // vogliono dire uno sgabello che galleggia sette pixel sopra il pavimento.
  chairB: ['a', 49, 260, 14, 28], // sedia a doghe, piu' bassa
  stoolRound: ['a', 65, 261, 14, 20], // sgabello tondo: quello delle scrivanie

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
  // Le piante da appartamento: ciotola di foglie larghe, ciotola d'erba, aloe
  // nel vaso di coccio, fiori nel vaso alto. Quattro sagome diverse, che a
  // sedici pixel e' l'unica cosa che distingue una pianta da un'altra.
  vasoFoglie: ['b', 8, 375, 16, 17],
  vasoErba: ['b', 39, 377, 16, 17],
  vasoAloe: ['b', 145, 378, 14, 15],
  vasoFiori: ['b', 66, 373, 10, 19],

  // --- e quello che sta in mezzo all'atrio ---
  //
  // La fontanella e' tre fotogrammi: l'acqua nella vasca si muove, ed e' l'unica
  // cosa di questa stanza che si muove da sola senza che ci sia nessuno.
  fontana1: ['a', 368, 162, 16, 25],
  fontana2: ['a', 384, 162, 16, 25],
  fontana3: ['a', 400, 162, 16, 25],
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
fs.writeFileSync(path.join(root, 'webview', 'sv-room.png'), bin(out.png));
// La mappa esce come .js e non come .json apposta: la pagina si apre a doppio
// clic, e da file:// una fetch di un .json la blocca il browser. Un <script>
// invece entra sempre.
fs.writeFileSync(
  path.join(root, 'webview', 'sv-room.js'),
  '/* Generato da scripts/sv-sheet.mjs — non si scrive a mano. */\n' +
    'window.SV = ' +
    JSON.stringify(out.map, null, 1) +
    ';\n'
);
console.log(`webview/sv-room.png  ${out.W}x${out.H}  ${Object.keys(out.map).length} pezzi`);
if (out.provino) {
  fs.mkdirSync(path.join(root, 'dist', 'sv'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dist', 'sv', 'contact.png'), bin(out.provino));
  console.log('dist/sv/contact.png');
}
