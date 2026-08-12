// Stato reale dell'estensione sul publisher: versione e fase di verifica.
import { ensureBrowser } from './lib/browser.mjs';

const browser = await ensureBrowser({ startUrl: 'https://marketplace.visualstudio.com/manage/publishers/MrWilson' });
const page =
  browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes('marketplace.visualstudio.com')) ||
  (await browser.contexts()[0].newPage());
await page.goto('https://marketplace.visualstudio.com/manage/publishers/MrWilson', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
await page.waitForTimeout(6000);

const txt = (await page.locator('body').innerText()).replace(/[ \t]+/g, ' ');
const riga = txt.split('\n').map((l) => l.trim()).filter(Boolean);
const i = riga.findIndex((l) => /Claude Studio/i.test(l));
console.log('righe intorno alla voce:');
console.log(riga.slice(i, i + 8).map((l) => '  ' + l).join('\n'));
const stato = txt.match(/Verifying|Verification failed|Approved|Published|Pending|Failed/i);
console.log('\nSTATO: ' + (stato ? stato[0] : 'nessuna parola di stato trovata'));
await browser.close();
