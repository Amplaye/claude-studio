// Same upload as publish-marketplace.mjs, but narrating every step and leaving a
// screenshot behind at each one. It's here for the day the portal changes its
// buttons: instead of "impossibile confermare", you get to see where it stopped.
import { ensureBrowser } from './lib/browser.mjs';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const VSIX = path.resolve('claude-studio.vsix').replace(/\\/g, '/');
const VERSION = JSON.parse(readFileSync('package.json', 'utf8')).version;
const MANAGE_URL = 'https://marketplace.visualstudio.com/manage/publishers/MrWilson';

const browser = await ensureBrowser({ startUrl: MANAGE_URL });
const ctx = browser.contexts()[0];
let page = ctx.pages().find((p) => p.url().includes('marketplace.visualstudio.com')) || (await ctx.newPage());
page.on('dialog', (d) => d.dismiss().catch(() => {}));
await page.bringToFront();
await page.goto(MANAGE_URL, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
await page.waitForTimeout(6000);

const shot = async (n) => page.screenshot({ path: `.publish-step-${n}.png` }).catch(() => {});
const say = (...a) => console.log(' ', ...a);

await shot('1-manage');
say('url:', page.url());

// the row's "..." menu
const row = page.locator('tr, [role=row]').filter({ hasText: /Claude Studio/i }).first();
say('row found:', await row.count());
const more = row.locator('button, [role=button], i, span').filter({ hasText: '' });
say('buttons in the row:', await more.count());

// the three dots live in their own cell: click whatever is clickable next to the name
await row.locator('td, [role=gridcell]').nth(1).click({ timeout: 8000 }).catch((e) => say('cell click:', e.message.split('\n')[0]));
await page.waitForTimeout(2500);
await shot('2-menu');

const menuTexts = await page.locator('[role=menuitem], .ms-ContextualMenu-item, li').allTextContents().catch(() => []);
say('menu:', JSON.stringify(menuTexts.slice(0, 12)));

const update = page
  .locator('[role=menuitem], .ms-ContextualMenu-link, li, button')
  .filter({ hasText: /^\s*Update\s*$/i })
  .first();
say('update entries:', await update.count());
await update.click({ timeout: 8000 }).catch((e) => say('update click:', e.message.split('\n')[0]));
await page.waitForTimeout(4000);
await shot('3-dialog');

const inputs = page.locator('input[type=file]');
say('file inputs:', await inputs.count());
if (await inputs.count()) {
  await inputs.first().setInputFiles(VSIX);
  say('attached', path.basename(VSIX));
  await page.waitForTimeout(3000);
  await shot('4-attached');

  const buttons = await page.locator('button:visible').allTextContents().catch(() => []);
  say('visible buttons:', JSON.stringify(buttons.slice(0, 20)));

  const go = page.locator('button:visible').filter({ hasText: /^\s*(Upload|Update|Save|Publish)\s*$/i }).last();
  say('upload buttons:', await go.count());
  await go.click({ timeout: 15000 }).catch((e) => say('upload click:', e.message.split('\n')[0]));
  await page.waitForTimeout(6000);
  await shot('5-uploading');
}

for (let i = 0; i < 10; i++) {
  await page.goto(MANAGE_URL, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(4000);
  const t = (await page.locator('body').innerText().catch(() => '')).replace(/[ \t]+/g, ' ');
  const line = t.split('\n').map((l) => l.trim()).filter(Boolean);
  const j = line.findIndex((l) => /Claude Studio/i.test(l));
  say(`round ${i + 1}:`, JSON.stringify(line.slice(j, j + 6)));
  if (t.includes(VERSION)) {
    say('✓ version', VERSION, 'is on the portal');
    break;
  }
  await page.waitForTimeout(4000);
}
await shot('6-final');
await browser.close();
