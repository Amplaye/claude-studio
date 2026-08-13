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

/**
 * The tile is square and the mark has to fill it, because the neighbours on the
 * Marketplace shelf do: Claude Code is a circle that touches all four edges, and
 * beside it a starburst floating in its own margin reads as the smaller product.
 *
 * Two paddings were stacked here. The rays stop short of the 512 viewBox — they span
 * about 481 of it — and the tile then drew that at 78%, so the mark ended up at ~73%
 * of the square. The box is measured off the rays themselves rather than typed in, so
 * redrawing logo.svg cannot silently reintroduce a margin.
 */
function artBox(svg) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const m of svg.matchAll(/<line\b[^>]*>/g)) {
    const at = (n) => {
      const v = m[0].match(new RegExp(`\\b${n}="([-\\d.]+)"`));
      return v ? parseFloat(v[1]) : NaN;
    };
    const w = at('stroke-width');
    // A round linecap is a half-disc past each endpoint: it is part of the drawing.
    const cap = Number.isFinite(w) ? w / 2 : 0;
    for (const [px, py] of [[at('x1'), at('y1')], [at('x2'), at('y2')]]) {
      if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
      x0 = Math.min(x0, px - cap); y0 = Math.min(y0, py - cap);
      x1 = Math.max(x1, px + cap); y1 = Math.max(y1, py + cap);
    }
  }
  if (!Number.isFinite(x0)) throw new Error('media/logo.svg: could not measure the rays');
  // Keep it square and concentric, so the burst stays radially centred.
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const half = Math.max(x1 - x0, y1 - y0) / 2;
  return { x: cx - half, y: cy - half, size: half * 2 };
}

const box = artBox(raw);
const viewBox = `${box.x.toFixed(2)} ${box.y.toFixed(2)} ${box.size.toFixed(2)} ${box.size.toFixed(2)}`;

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
  /* Full-bleed: the viewBox below is already cropped to the rays, so the only margin
     left is the hair that keeps a round cap from being clipped by antialiasing. */
  svg { width:${Math.round(SIZE * 0.98)}px; height:${Math.round(SIZE * 0.98)}px; }
</style></head>
<body><div class="icon"><svg viewBox="${viewBox}">${glyph}</svg></div></body></html>`;

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
