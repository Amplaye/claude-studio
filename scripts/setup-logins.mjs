// Prepara il profilo di publishing: apre le due pagine di login necessarie.
// Da fare UNA VOLTA. Dopo, le pubblicazioni sono automatiche.
import { ensureBrowser } from './lib/browser.mjs';

const browser = await ensureBrowser();
const ctx = browser.contexts()[0];

const target = [
  ['Eclipse (per firmare il Publisher Agreement di Open VSX)', 'https://open-vsx.org/oauth2/authorization/eclipse'],
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

console.log('\n>>> Completa i due login nelle tab aperte, poi fammelo sapere.');
await browser.close();
