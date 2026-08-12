// Driver CDP per pilotare la finestra Brave aperta su porta 9222.
// Uso: node scripts/az-drive.mjs <comando> [args...]
//   look                       -> url/title + screenshot
//   goto <url>                 -> naviga
//   click "<testo>"            -> clicca link/bottone per testo
//   fill "<label>" "<valore>"  -> compila input per label/placeholder
//   text                       -> dump testo visibile
import { chromium } from 'playwright';

const SHOT = 'C:/Users/Steward/claude-studio/.az-shot.png';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
let page = ctx.pages().find((p) => !p.url().startsWith('devtools://')) || (await ctx.newPage());
await page.bringToFront();

const [cmd, ...args] = process.argv.slice(2);

const settle = async () => {
  try {
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
  } catch {}
  await page.waitForTimeout(1500);
};

try {
  if (cmd === 'goto') {
    await page.goto(args[0], { waitUntil: 'domcontentloaded', timeout: 45000 });
    await settle();
  } else if (cmd === 'click') {
    const t = args[0];
    const loc = page
      .getByRole('button', { name: t })
      .or(page.getByRole('link', { name: t }))
      .or(page.getByText(t, { exact: false }))
      .first();
    await loc.click({ timeout: 15000 });
    await settle();
  } else if (cmd === 'fill') {
    const loc = page.getByLabel(args[0]).or(page.getByPlaceholder(args[0])).first();
    await loc.fill(args[1], { timeout: 15000 });
    await page.waitForTimeout(400);
  } else if (cmd === 'text') {
    const body = await page.locator('body').innerText();
    console.log(body.replace(/\n{3,}/g, '\n\n').slice(0, 4000));
  }

  console.log('URL:  ' + page.url());
  console.log('TITLE:' + (await page.title()));
  await page.screenshot({ path: SHOT, fullPage: false });
  console.log('SHOT: ' + SHOT);
} catch (e) {
  console.log('ERRORE: ' + e.message.split('\n')[0]);
  console.log('URL:  ' + page.url());
  await page.screenshot({ path: SHOT }).catch(() => {});
}

await browser.close(); // stacca CDP, NON chiude Brave
