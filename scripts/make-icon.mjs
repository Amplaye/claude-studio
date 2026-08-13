// The extension icon (media/icon.png), drawn once and then committed.
//
// It deliberately sits outside the everyday build: it is a PNG that hardly ever
// changes, and making it depend on Chromium at every save would be a pointless toll.
// You remake it by hand with `npm run icon` when the mark changes.
//
// The mark is the same one as in the activity bar and on the empty screen: the
// starburst from media/logo.svg, read straight off disk so the store icon can never
// drift from the mark shipped inside the extension. It sits on near-black, which is
// what lets the rays' own pink → azure sweep be the colour of the icon.
import { chromium } from 'playwright';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
/** 256 is plenty: VS Code asks for 128, and a gradient at 512 weighs for nothing. */
const SIZE = 256;

const svgFile = path.join(root, 'media', 'logo.svg');
const raw = fs.readFileSync(svgFile, 'utf8');
// The tile has no background, so the star at the centre cannot stay white: on the
// Marketplace's light theme it would simply be a hole. It takes the same deep plum as
// media/mark.png, which holds against both themes.
const glyph = raw
  .replace(/^[\s\S]*?<svg[^>]*>/, '')
  .replace(/<\/svg>\s*$/, '')
  .replace('fill="#ffffff"', 'fill="#6d28d9"');
// The rays carry their own colours: a `url(#…)` gradient would not survive being
// pulled through <use> in the webview, so every stroke is a literal hex. If that ever
// regresses to a gradient reference, the icon here would silently render black.
if (/url\(#/.test(raw) || !/<line/.test(raw)) {
  throw new Error('media/logo.svg: expected the ray starburst with literal stroke colours');
}

const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  html,body { margin:0; padding:0; background:transparent; }
  .icon {
    width:${SIZE}px; height:${SIZE}px;
    border-radius:${Math.round(SIZE * 0.22)}px;
    background: transparent;
    display:flex; align-items:center; justify-content:center;
    box-sizing:border-box;
  }
  /* Bigger than the old glyph: the starburst is mostly empty space between rays,
     so at 0.56 it read as a small speck in the middle of the tile. */
  svg { width:${Math.round(SIZE * 0.78)}px; height:${Math.round(SIZE * 0.78)}px; }
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
