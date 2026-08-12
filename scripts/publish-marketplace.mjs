// Pubblica/aggiorna l'estensione sul VS Code Marketplace tramite il portale web,
// pilotando il browser via CDP. Non richiede PAT né organizzazione Azure DevOps.
//
// Uso: node scripts/publish-marketplace.mjs [percorso.vsix]
import { ensureBrowser } from './lib/browser.mjs';
import { existsSync } from 'node:fs';
import path from 'node:path';

const VSIX = path.resolve(process.argv[2] || 'claude-studio.vsix').replace(/\\/g, '/');
const PUBLISHER = 'MrWilson';
const MANAGE_URL = `https://marketplace.visualstudio.com/manage/publishers/${PUBLISHER}`;

if (!existsSync(VSIX)) {
  console.error(`✗ vsix non trovato: ${VSIX}`);
  process.exit(1);
}

const browser = await ensureBrowser({ startUrl: MANAGE_URL });
const ctx = browser.contexts()[0];
let page = ctx.pages().find((p) => p.url().includes('marketplace.visualstudio.com'));
if (!page) page = await ctx.newPage();
await page.bringToFront();

if (!page.url().includes('/manage/publishers')) {
  await page.goto(MANAGE_URL, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
}
await page.waitForTimeout(5000);

// --- login Microsoft necessario?
if (/login\.microsoft|login\.live|signin/i.test(page.url())) {
  console.error('\n✗ Sessione Microsoft assente nel profilo di publishing.');
  console.error('  Completa il login nella finestra del browser appena aperta, poi rilancia.');
  await browser.close();
  process.exit(2);
}

// chiudi eventuale banner cookie
for (const name of ['Accept', 'Accetta']) {
  const el = page.getByRole('button', { name }).first();
  if ((await el.count()) && (await el.isVisible().catch(() => false))) {
    await el.click().catch(() => {});
    await page.waitForTimeout(1000);
    break;
  }
}

const bodyText = await page.locator('body').innerText();
const esiste = /Claude Studio/i.test(bodyText);
console.log(`  estensione già presente sul publisher: ${esiste ? 'sì → update' : 'no → primo upload'}`);

const fileInput = () => page.locator('input[type=file]');

if (esiste) {
  // menu contestuale della riga → Update
  const more = page
    .locator('[aria-label*="More" i], [title*="More" i], button:has-text("...")')
    .or(page.locator('.ms-Button--icon, [data-icon-name=More], [class*=contextMenu]'))
    .first();
  await more.click({ timeout: 10000 }).catch((e) => console.log('  menu "..." non cliccabile: ' + e.message.split('\n')[0]));
  await page.waitForTimeout(2000);
  await page
    .locator('[role=menuitem], li, button, div')
    .filter({ hasText: /^Update$/i })
    .last()
    .click({ timeout: 8000 })
    .catch((e) => console.log('  voce "Update" non trovata: ' + e.message.split('\n')[0]));
  await page.waitForTimeout(3000);
}

if ((await fileInput().count()) === 0) {
  // fallback: flusso "New extension" → Visual Studio Code
  await page.getByText('New extension', { exact: false }).first().click({ timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await page
    .locator('div,li,a')
    .filter({ hasText: /^Visual Studio Code$/ })
    .last()
    .click({ timeout: 8000 })
    .catch(() => {});
  await page.waitForTimeout(3000);
}

if ((await fileInput().count()) === 0) {
  console.error('✗ Nessun input file trovato: la UI del portale è cambiata.');
  await page.screenshot({ path: '.publish-error.png' }).catch(() => {});
  await browser.close();
  process.exit(3);
}

await fileInput().first().setInputFiles(VSIX);
console.log(`  allegato ${path.basename(VSIX)}`);
await page.waitForTimeout(2000);

await page
  .getByRole('button', { name: /^(Upload|Update)$/ })
  .first()
  .click({ timeout: 15000 })
  .catch(async () => {
    await page
      .locator('button,div[role=button]')
      .filter({ hasText: /^(Upload|Update)$/ })
      .last()
      .click({ timeout: 10000 });
  });
console.log('  upload avviato, attendo esito...');

let stato = '?';
for (let i = 0; i < 10; i++) {
  await page.waitForTimeout(6000);
  const t = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ');
  const m = t.match(/Verifying|Verification failed|Approved|Published|already exists|error/i);
  if (m) {
    stato = m[0];
    if (/failed|already exists|error/i.test(stato)) break;
    if (/Verifying|Approved|Published/i.test(stato)) break;
  }
}
console.log(`  stato riportato dal portale: ${stato}`);
await page.screenshot({ path: '.publish-last.png' }).catch(() => {});
await browser.close();

if (/failed|already exists|error/i.test(stato)) {
  console.error('✗ Marketplace: pubblicazione non riuscita.');
  process.exit(4);
}
console.log('✓ Marketplace: pacchetto accettato.');
