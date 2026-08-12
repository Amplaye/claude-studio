import { chromium } from 'playwright';
const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const p = b
  .contexts()
  .flatMap((c) => c.pages())
  .find((x) => x.url().includes('marketplace.visualstudio.com/manage'));
await p.bringToFront();

p.on('response', async (r) => {
  if (r.request().method() === 'GET') return;
  let t = '';
  try {
    t = (await r.text()).slice(0, 500);
  } catch {}
  console.log(`<<< ${r.status()} ${r.request().method()} ${r.url().slice(0, 130)}`);
  if (t) console.log('    ' + t.replace(/\s+/g, ' ').slice(0, 450));
});

await p.getByRole('button', { name: 'Upload' }).first().click({ timeout: 15000 })
  .catch(async (e) => {
    console.log('role click fallito: ' + e.message.split('\n')[0]);
    await p.locator('button,div[role=button]').filter({ hasText: /^Upload$/ }).last().click({ timeout: 10000 }).catch((e2) => console.log('fallback: ' + e2.message.split('\n')[0]));
  });

console.log('--- upload avviato, attendo elaborazione (60s) ---');
for (let i = 0; i < 6; i++) {
  await p.waitForTimeout(10000);
  const txt = (await p.locator('body').innerText()).replace(/\s+/g, ' ');
  console.log(`[t+${(i + 1) * 10}s] ` + (txt.match(/claude-studio|Verif|Pending|Error|error|failed|Published|Approv/gi) || []).join(',').slice(0, 120));
}
console.log('\nURL: ' + p.url().slice(0, 140));
console.log('TEXT:\n' + (await p.locator('body').innerText()).replace(/\n{3,}/g, '\n').slice(0, 1800));
await p.screenshot({ path: 'C:/Users/Steward/claude-studio/.az-shot.png' }).catch(() => {});
await b.close();
