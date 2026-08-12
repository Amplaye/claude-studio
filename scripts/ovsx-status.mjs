// Stato account Open VSX: login, Publisher Agreement, token.
import { ensureBrowser } from './lib/browser.mjs';

const browser = await ensureBrowser();
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes('open-vsx.org')) || (await ctx.newPage());
await page.bringToFront();

for (const url of ['https://open-vsx.org/user-settings/profile', 'https://open-vsx.org/user-settings/tokens']) {
  await page.goto(url, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3500);
  const main = await page.evaluate(() => (document.querySelector('main') || document.body).innerText);
  console.log(`\n=== ${url.split('/').pop().toUpperCase()}  (${page.url().slice(0, 70)})`);
  console.log(
    main
      .split('\n')
      .filter((l) => l.trim())
      .filter((l) => !/^(RESOURCES|COMMUNITY|LEGAL|Documentation|Status|Commercial|Report a|Sponsor|About This|Members|Adopters|OSS Access|Privacy|Terms|Security Policy|Compliance|Legal Resources|Copyright|Manage Cookies|Keyboard)/.test(l))
      .slice(0, 16)
      .join('\n')
  );
  const btns = await page.evaluate(() =>
    [...document.querySelectorAll('button,a[role=button]')].map((e) => e.innerText.trim()).filter(Boolean)
  );
  console.log('--- bottoni: ' + JSON.stringify([...new Set(btns)].slice(0, 12)));
}
await browser.close();
