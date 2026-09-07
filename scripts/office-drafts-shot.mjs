// Una foto per ogni pelle di docs/office-drafts.html, in dist/.
//
// Serve a guardare una pelle mentre la si scrive: il CSS di una stanza vista
// dall'alto non si giudica leggendolo. Senza argomenti le fa tutte; con
// `node scripts/office-drafts-shot.mjs i n` solo quelle due.
import { chromium } from 'playwright';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const url = pathToFileURL(path.join(root, 'docs', 'office-drafts.html')).href;
const want = process.argv.slice(2);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1660, height: 1000 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('requestfailed', (r) => errs.push('non caricato: ' + r.url()));
await page.goto(url);
await page.waitForTimeout(400);

const classes = await page.$$eval('.card', (ns) =>
  ns.map((n) => [...n.classList].find((c) => c !== 'card'))
);
for (const cls of classes) {
  if (want.length && !want.includes(cls)) continue;
  const card = page.locator('.card.' + cls);
  await card.scrollIntoViewIfNeeded();
  await card.screenshot({ path: path.join(root, 'dist', 'draft-' + cls + '.png') });
  console.log('dist/draft-' + cls + '.png');
}
await browser.close();
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
