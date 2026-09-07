// Una foto di docs/office-sv.html, in dist/. Serve a guardare la stanza mentre
// la si monta: una pianta vista dall'alto non si giudica leggendo il CSS.
import { chromium } from 'playwright';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const url = pathToFileURL(path.join(root, 'docs', 'office-sv.html')).href;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 820 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('requestfailed', (r) => errs.push('non caricato: ' + r.url()));
await page.goto(url);
await page.waitForTimeout(400);
await page.locator('.pane').screenshot({ path: path.join(root, 'dist', 'office-sv.png') });
console.log('dist/office-sv.png');
await browser.close();
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
