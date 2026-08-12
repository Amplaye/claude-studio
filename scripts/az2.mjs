// Driver mirato su una tab scelta per substring di URL.
// Uso: node scripts/az2.mjs <match-url> <cmd> [args...]
import { chromium } from 'playwright';
const SHOT = 'C:/Users/Steward/claude-studio/.az-shot.png';
const [match, cmd, ...args] = process.argv.slice(2);

const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const pages = b.contexts().flatMap((c) => c.pages()).filter((p) => !p.url().startsWith('devtools://'));
const page = pages.find((p) => p.url().includes(match));
if (!page) {
  console.log('tab non trovata. disponibili:');
  pages.forEach((p) => console.log('  ' + p.url().slice(0, 120)));
  await b.close();
  process.exit(1);
}
await page.bringToFront();

try {
  if (cmd === 'goto') await page.goto(args[0], { waitUntil: 'domcontentloaded', timeout: 45000 });
  else if (cmd === 'click') {
    await page.getByRole('button', { name: args[0] })
      .or(page.getByRole('link', { name: args[0] }))
      .or(page.locator(`text=${args[0]}`)).first().click({ timeout: 15000 });
  } else if (cmd === 'fill') {
    await page.getByLabel(args[0]).or(page.getByPlaceholder(args[0]))
      .or(page.locator(args[0])).first().fill(args[1], { timeout: 15000 });
  } else if (cmd === 'press') await page.keyboard.press(args[0]);
  if (cmd !== 'text') await page.waitForTimeout(2500);

  console.log('TEXT:\n' + (await page.locator('body').innerText()).replace(/\n{3,}/g, '\n').slice(0, 2500));
  console.log('\n--- inputs/buttons:');
  for (const sel of ['input:visible', 'button:visible', 'select:visible']) {
    for (const el of await page.locator(sel).all()) {
      const id = (await el.getAttribute('id')) || (await el.getAttribute('name')) || '';
      const ph = (await el.getAttribute('placeholder')) || '';
      const val = (await el.inputValue().catch(() => '')) || (await el.innerText().catch(() => ''));
      console.log(`  ${sel.split(':')[0]} id="${id}" ph="${ph}" val="${val.trim().slice(0, 50)}"`);
    }
  }
  console.log('URL: ' + page.url());
} catch (e) {
  console.log('ERRORE: ' + e.message.split('\n')[0] + '\nURL: ' + page.url());
}
await page.screenshot({ path: SHOT, timeout: 15000 }).catch((e) => console.log('shot fail: ' + e.message.split('\n')[0]));
await b.close();
