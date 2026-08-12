// Verifica login Open VSX, firma l'accordo publisher se serve, genera un token.
import { ensureBrowser } from './lib/browser.mjs';

const browser = await ensureBrowser();
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes('open-vsx.org')) || (await ctx.newPage());
await page.bringToFront();
await page.goto('https://open-vsx.org/user-settings/tokens', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
await page.waitForTimeout(4000);

const main = await page.evaluate(() => (document.querySelector('main') || document.body).innerText);
const compact = main.split('\n').filter((l) => l.trim()).slice(0, 20).join('\n');
console.log('URL: ' + page.url());
console.log('--- MAIN:\n' + compact);

if (/Not Logged In/i.test(main)) {
  console.log('\n>>> LOGIN NON EFFETTUATO. Completa il login GitHub nella finestra aperta.');
  await browser.close();
  process.exit(2);
}

const btns = await page.evaluate(() =>
  [...document.querySelectorAll('button,a')].map((e) => e.innerText.trim()).filter(Boolean)
);
console.log('--- bottoni: ' + JSON.stringify([...new Set(btns)].slice(0, 20)));
await page.screenshot({ path: '.publish-last.png' }).catch(() => {});
await browser.close();
