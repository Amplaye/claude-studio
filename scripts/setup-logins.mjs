// Prepara il profilo di publishing: apre la pagina di login necessaria.
// Da fare UNA VOLTA. Dopo, le pubblicazioni sono automatiche.
//
// Un negozio solo: il VS Code Marketplace. Quindi un login solo.
import { ensureBrowser } from './lib/browser.mjs';

const browser = await ensureBrowser();
const ctx = browser.contexts()[0];

const target = [
  ['Microsoft (per il portale VS Code Marketplace)', 'https://marketplace.visualstudio.com/manage/publishers/MrWilson'],
];

for (const [etichetta, url] of target) {
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3000);
  console.log(`\n▸ ${etichetta}`);
  console.log(`  tab aperta su: ${page.url().slice(0, 110)}`);
  console.log(`  titolo: ${await page.title().catch(() => '?')}`);
}

console.log('\n>>> Completa il login nella tab aperta, poi fammelo sapere.');
await browser.close();
