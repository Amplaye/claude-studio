// L'icona dell'estensione (media/icon.png), disegnata una volta e poi committata.
//
// Non sta nella build di tutti i giorni apposta: e' un PNG che cambia quasi mai, e
// farlo dipendere da Chromium a ogni salvataggio sarebbe un pedaggio inutile. Si
// rifa' a mano con `npm run icon` quando il segno cambia.
//
// Il segno e' lo stesso della barra delle attivita': le sparkles di Ionicons — la
// stessa famiglia di icone che si vede ovunque dentro l'estensione — sul gradiente
// argilla → pesca della palette.
import { chromium } from 'playwright';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
/** 256 basta e avanza: VSCode ne chiede 128, e un gradiente a 512 pesa per niente. */
const SIZE = 256;

const svgFile = path.join(root, 'node_modules', 'ionicons', 'dist', 'svg', 'sparkles.svg');
const raw = fs.readFileSync(svgFile, 'utf8');
// La variante piena e' una forma riempita: e' l'unica che regge la riduzione a
// 24 px senza sparire, esattamente come nel font della barra di stato.
const glyph = raw.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
if (/stroke=/.test(raw) || !/<path/.test(raw)) {
  throw new Error('sparkles.svg: serve la variante piena, non quella a tracciato');
}

const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  html,body { margin:0; padding:0; background:transparent; }
  .icon {
    width:${SIZE}px; height:${SIZE}px;
    border-radius:${Math.round(SIZE * 0.22)}px;
    background:
      radial-gradient(90% 90% at 20% 10%, rgba(255,255,255,.30), transparent 60%),
      linear-gradient(140deg, #e9a97f 0%, #d97757 48%, #b4522f 100%);
    display:flex; align-items:center; justify-content:center;
    box-sizing:border-box;
  }
  svg { width:${Math.round(SIZE * 0.56)}px; height:${Math.round(SIZE * 0.56)}px; fill:#fff;
        filter: drop-shadow(0 ${Math.round(SIZE * 0.02)}px ${Math.round(SIZE * 0.04)}px rgba(80,26,8,.42)); }
</style></head>
<body><div class="icon"><svg viewBox="0 0 512 512">${glyph}</svg></div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: SIZE, height: SIZE },
  deviceScaleFactor: 1,
});
await page.setContent(html);
const out = path.join(root, 'media', 'icon.png');
await page.locator('.icon').screenshot({ path: out, omitBackground: true });
await browser.close();

const kb = (fs.statSync(out).size / 1024).toFixed(1);
console.log(`media/icon.png — ${SIZE}x${SIZE}, ${kb} KB`);
