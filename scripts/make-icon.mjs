// The extension icon (media/icon.png), drawn once and then committed.
//
// It deliberately sits outside the everyday build: it is a PNG that hardly ever
// changes, and making it depend on Chromium at every save would be a pointless toll.
// You remake it by hand with `npm run icon` when the mark changes.
//
// The mark is the same one as in the activity bar: the Ionicons sparkles — the same
// icon family you see everywhere inside the extension — on the palette's clay →
// peach gradient.
import { chromium } from 'playwright';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
/** 256 is plenty: VS Code asks for 128, and a gradient at 512 weighs for nothing. */
const SIZE = 256;

const svgFile = path.join(root, 'node_modules', 'ionicons', 'dist', 'svg', 'sparkles.svg');
const raw = fs.readFileSync(svgFile, 'utf8');
// The filled variant is a solid shape: it is the only one that survives being cut
// down to 24px without vanishing, exactly like in the status bar font.
const glyph = raw.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
if (/stroke=/.test(raw) || !/<path/.test(raw)) {
  throw new Error('sparkles.svg: the filled variant is needed, not the outline one');
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
