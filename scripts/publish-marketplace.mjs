// Pubblica/aggiorna l'estensione sul VS Code Marketplace tramite il portale web,
// pilotando il browser via CDP. Non richiede PAT né organizzazione Azure DevOps.
//
// Uso: node scripts/publish-marketplace.mjs [percorso.vsix]
import { ensureBrowser } from './lib/browser.mjs';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const VSIX = path.resolve(process.argv[2] || 'claude-studio.vsix').replace(/\\/g, '/');
const PUBLISHER = 'MrWilson';
/** Versione attesa: l'esito si conferma trovando questa nella riga del portale. */
const VERSION = JSON.parse(readFileSync('package.json', 'utf8')).version;
const MANAGE_URL = `https://marketplace.visualstudio.com/manage/publishers/${PUBLISHER}`;

if (!existsSync(VSIX)) {
  console.error(`✗ vsix non trovato: ${VSIX}`);
  process.exit(1);
}

const browser = await ensureBrowser({ startUrl: MANAGE_URL });
const ctx = browser.contexts()[0];
let page = ctx.pages().find((p) => p.url().includes('marketplace.visualstudio.com'));
if (!page) page = await ctx.newPage();
// Un dialog nativo lasciato aperto blocca il browser e CDP smette di rispondere:
// si chiudono da soli invece di restare in attesa di un click umano.
page.on('dialog', (d) => d.dismiss().catch(() => {}));
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
  // Menu contestuale della riga → Update.
  //
  // Il portale e' una DetailsList di Fluent: i tre puntini sono un
  // `button.vss-ContextualMenuButton` con aria-label "More Actions...", dentro la
  // prima cella, e hanno tabindex -1 (si raggiungono con le frecce, non col tab).
  // La versione precedente cercava un generico [aria-label*=More] e non trovava
  // niente: il menu non si apriva, il dialogo non compariva, e il setInputFiles
  // finiva su un input file di servizio che non porta da nessuna parte — upload
  // "avviato" e mai avvenuto.
  const row = page.locator('[role=row]').filter({ hasText: /Claude Studio/i }).last();
  const more = row
    .locator('button.vss-ContextualMenuButton, button[aria-label*="More Actions" i], button[aria-label*="More" i]')
    .first();
  await more.click({ timeout: 10000, force: true }).catch((e) =>
    console.log('  menu "..." non cliccabile: ' + e.message.split('\n')[0])
  );
  await page.waitForTimeout(2000);
  const voce = page
    .locator('.ms-ContextualMenu-link, [role=menuitem], button.ms-ContextualMenu-link')
    .filter({ hasText: /^\s*Update\s*$/i })
    .first();
  await voce
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

// Il file viaggia mentre questa pagina e' aperta: ricaricarla ADESSO annulla
// l'upload a meta'. E' cosi' che si perdeva un rilascio su due — "upload avviato"
// e poi la riga del portale ferma alla versione di prima, senza un errore da
// nessuna parte. Prima di andare a controllare si aspetta che il dialogo si
// chiuda da solo, che e' il portale che dice "ho finito di ricevere".
const dialogo = page.locator('input[type=file]');
for (let i = 0; i < 40 && (await dialogo.count()) > 0; i++) {
  await page.waitForTimeout(1500);
}
console.log(
  (await dialogo.count()) > 0
    ? '  il dialogo e’ ancora aperto dopo un minuto: proseguo a controllare comunque'
    : '  dialogo chiuso: il file e’ arrivato'
);

/**
 * La galleria pubblica, interrogata senza browser.
 *
 * E' la fonte che conta e l'unica che non puo' sparire a meta' controllo: il portale
 * si legge dentro una finestra che qualcuno puo' chiudere — ed e' successo, con
 * l'upload gia' arrivato e lo script morto su "Target page has been closed" mentre
 * andava a verificarlo. Un rilascio riuscito segnato come fallito e' peggio di uno
 * fallito: ti manda a rifare una cosa che era fatta.
 */
async function inGalleria() {
  try {
    const r = await fetch('https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json;api-version=7.2-preview.1' },
      body: JSON.stringify({
        filters: [
          { criteria: [{ filterType: 7, value: `${PUBLISHER}.claude-studio` }], pageSize: 1, pageNumber: 1 },
        ],
        flags: 0x1,
      }),
      signal: AbortSignal.timeout(20000),
    });
    const j = await r.json();
    const vs = (j?.results?.[0]?.extensions?.[0]?.versions ?? []).map((v) => v.version);
    return vs.includes(VERSION);
  } catch {
    return false;
  }
}

/**
 * Il portale, letto senza poterci morire sopra. Se la finestra e' sparita si torna a
 * chiederne una: la sessione sta nel profilo su disco, non nella finestra.
 */
async function nelPortale() {
  try {
    if (page.isClosed()) {
      const b = await ensureBrowser({ startUrl: MANAGE_URL });
      page = b.contexts()[0].pages().find((p) => p.url().includes('marketplace.visualstudio.com'))
        ?? (await b.contexts()[0].newPage());
    }
    await page.goto(MANAGE_URL, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(3500);
    const t = (await page.locator('body').innerText()).replace(/[ \t]+/g, ' ');
    if (/Verification failed|already exists/i.test(t)) {
      return { esito: 'errore', stato: (t.match(/Verification failed|already exists/i) || [])[0] };
    }
    if (t.includes(VERSION)) {
      return { esito: 'ok', stato: (t.match(/Verifying|Approved|Published/i) || ['presente'])[0] };
    }
  } catch (e) {
    return { esito: 'illeggibile', stato: e.message.split('\n')[0] };
  }
  return { esito: 'assente', stato: 'non ancora' };
}

// L'esito NON si deduce dal modal: si pretende di ritrovare la versione appena
// caricata. Prima si accettava qualunque stato non-errore, cosi' un upload mai
// avvenuto passava per riuscito.
let confermato = false;
let stato = 'sconosciuto';
for (let tentativo = 0; tentativo < 8 && !confermato; tentativo++) {
  await new Promise((r) => setTimeout(r, 7000));
  if (await inGalleria()) {
    confermato = true;
    stato = 'in galleria';
    break;
  }
  const p = await nelPortale();
  if (p.esito === 'errore') {
    stato = p.stato;
    break;
  }
  if (p.esito === 'ok') {
    confermato = true;
    stato = p.stato;
  } else {
    stato = p.stato;
  }
}

console.log(`  versione ${VERSION}: ${confermato ? 'confermata' : 'NON trovata'} — ${stato}`);
await page.screenshot({ path: '.publish-last.png' }).catch(() => {});
await browser.close().catch(() => {});

if (!confermato) {
  console.error(`✗ Marketplace: impossibile confermare la pubblicazione di ${VERSION}.`);
  console.error('  Guarda .publish-last.png e il portale prima di considerarla fatta.');
  process.exit(4);
}
console.log(`✓ Marketplace: ${VERSION} accettata (${stato}).`);
