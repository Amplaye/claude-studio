// Collega l'account Eclipse alla sessione Open VSX e riporta lo stato dell'accordo.
import { ensureBrowser } from './lib/browser.mjs';

const browser = await ensureBrowser();
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes('open-vsx.org')) || (await ctx.newPage());
await page.bringToFront();
await page.goto('https://open-vsx.org/user-settings/profile', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
await page.waitForTimeout(3000);

const link = page.getByRole('button', { name: /Log in with Eclipse/i }).or(page.getByText(/Log in with Eclipse/i)).first();
if (await link.count()) {
  console.log('clicco "Log in with Eclipse"...');
  await link.click({ timeout: 15000 }).catch((e) => console.log('click: ' + e.message.split('\n')[0]));
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(2000);
    if (page.url().includes('open-vsx.org/user-settings')) break;
  }
}
await page.waitForTimeout(3000);
console.log('URL: ' + page.url().slice(0, 120));

const main = await page.evaluate(() => (document.querySelector('main') || document.body).innerText);
const righe = main.split('\n').filter((l) => l.trim());
console.log('--- stato profilo:');
console.log(righe.filter((l) => /Login name|Full name|Agreement|sign|Eclipse|token/i.test(l)).slice(0, 8).join('\n'));
const btns = await page.evaluate(() =>
  [...document.querySelectorAll('button,a[role=button],input[type=checkbox]')]
    .map((e) => (e.type === 'checkbox' ? '[checkbox] ' + (e.name || e.id) : e.innerText.trim()))
    .filter(Boolean)
);
console.log('--- controlli: ' + JSON.stringify([...new Set(btns)].slice(0, 15)));
await page.screenshot({ path: '.publish-last.png' }).catch(() => {});
await browser.close();
