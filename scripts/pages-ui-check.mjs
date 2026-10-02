// La chat a pagine, nella pagina vera.
//
// Entrando in una conversazione arriva la coda in un messaggio solo (`replay`), e il
// resto a pezzi scorrendo in su (`older`). Qui si guarda quello che a occhio si nota
// solo quando si rompe:
//   - la coda si disegna senza entrate (erano gia' li') e senza la schermata vuota
//     che lampeggia prima, e si atterra in fondo;
//   - la riga di fine turno di una pagina tagliata a meta' turno conta tutto il turno;
//   - arrivati in cima si chiede la pagina prima, una volta sola, e quando arriva va
//     sopra senza spostare di un pixel quello che stavi leggendo;
//   - una risposta in ritardo per un'altra conversazione si butta;
//   - il turno in corso tiene il suo orologio e il suo battito anche mentre sopra
//     arrivano le pagine vecchie;
//   - e una pagina grossa si disegna in fretta.
import { chromium } from 'playwright';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const url = pathToFileURL(path.join(root, 'dist', 'preview.html')).href;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 820 }, colorScheme: 'dark' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(url);
await page.waitForTimeout(300);

const fails = [];
const t = (cond, msg) => !cond && fails.push(msg);
const post = (m) => page.evaluate((x) => window.postMessage(x, '*'), m);
const sent = () => page.evaluate(() => window.__sent || []);

/* ---- una conversazione finta ---- */
let seq = 1000;
const ev = [];
const turno = (nome, passi, opts = {}) => {
  const out = [];
  if (!opts.senzaUser) out.push({ k: 'user', text: nome });
  out.push({ k: 'block_final', id: nome + '-a', kind: 'text', text: 'Vado: **' + nome + '**.' });
  for (let i = 0; i < passi; i++) {
    const id = nome + '-' + i;
    const scrive = i % 4 === 0;
    out.push({ k: 'tool_start', id, name: scrive ? 'Edit' : 'Read', input: { file_path: 'src/' + nome + (i % 3) + '.ts', old_string: 'a', new_string: 'b' } });
    out.push({ k: 'tool_end', id, ok: true, text: scrive ? 'ok' : 'riga\n'.repeat(20) });
  }
  out.push({ k: 'block_final', id: nome + '-z', kind: 'text', text: 'Fatto ' + nome + '.' });
  if (!opts.aperto) out.push({ k: 'turn_end', ok: true, totalUsd: 0, turnUsd: 0, durationMs: 4000, tokens: 1200, ctx: {}, models: [], model: 'claude-opus-5-5', effort: '' });
  return out;
};

// ---- 1. la coda ----
await post({ k: 'hello', cwd: '/x', project: 'x', cliVersion: '1', surface: 'panel', key: 'chatA', sid: 'sid-a', past: true });
const coda = [...turno('meta', 6, { senzaUser: true }), ...turno('secondo', 18), ...turno('terzo', 22)];
await post({
  k: 'replay',
  key: 'chatA',
  epoch: 7,
  first: 501,
  more: true,
  events: coda,
  // Il turno «meta» era cominciato prima del taglio: 40 passi, e due file scritti.
  carry: { steps: 40, files: [['src/prima.ts', 2], ['src/meta0.ts', 1]] },
});
await page.waitForTimeout(250);
const c = await page.evaluate(() => {
  const log = document.getElementById('log');
  const msgs = [...log.querySelectorAll(':scope > .msg')];
  return {
    vuota: !!log.querySelector('.empty'),
    primo: log.firstElementChild && log.firstElementChild.className,
    tutti: msgs.length,
    replayed: msgs.filter((m) => m.classList.contains('replayed')).length,
    entrate: msgs.reduce((s, m) => s + m.getAnimations().length, 0),
    disegna: [...log.querySelectorAll('.tool-ico:not(.still) path')].length,
    inFondo: Math.round(log.scrollHeight - log.scrollTop - log.clientHeight),
    recap: (log.querySelector('.msg.recap .recap-meta') || {}).textContent || '',
    recapFile: [...(log.querySelector('.msg.recap') || document.createElement('i')).querySelectorAll('.recap-file')].map((b) => b.textContent),
    busy: document.getElementById('activity').hidden === false,
  };
});
t(!c.vuota, 'con una conversazione in arrivo e’ comparsa la schermata vuota');
t(/log-older/.test(c.primo || ''), 'in cima non c’e’ la fila dei messaggi precedenti: ' + c.primo);
t(c.tutti > 40 && c.replayed === c.tutti, 'non tutti i messaggi della coda sono segnati come gia’ visti: ' + c.replayed + '/' + c.tutti);
t(c.entrate === 0, 'i messaggi della coda fanno l’entrata: ' + c.entrate + ' animazioni');
t(c.disegna === 0, 'le spunte della coda si disegnano da sole: ' + c.disegna);
t(c.inFondo <= 2, 'disegnata la coda non si atterra in fondo: ' + c.inFondo + 'px dal fondo');
// 40 portati + 6 della pagina = 46; i file: i due portati e quello della pagina.
t(/46 steps/.test(c.recap), 'la riga di fine turno non conta il pezzo prima del taglio: ' + c.recap);
t(c.recapFile.includes('prima.ts'), 'la riga di fine turno non conta i file scritti prima del taglio: ' + c.recapFile.join(', '));
t(!(await sent()).some((m) => m.cmd === 'older'), 'la pagina prima e’ stata chiesta senza essere scorsi in cima');

// ---- 2. in cima: la pagina prima ----
const ancora = async () =>
  page.evaluate(() => {
    const n = [...document.querySelectorAll('#log > .msg.user')].find((u) => u.textContent.includes('secondo'));
    return n ? Math.round(n.getBoundingClientRect().top) : null;
  });
await page.evaluate(() => (document.getElementById('log').scrollTop = 400));
await page.waitForTimeout(80);
await page.evaluate(() => (document.getElementById('log').scrollTop = 0));
await page.waitForTimeout(250);
const chieste = (await sent()).filter((m) => m.cmd === 'older');
t(chieste.length === 1, 'arrivati in cima la pagina prima e’ stata chiesta ' + chieste.length + ' volte');
t(chieste[0] && chieste[0].before === 501 && chieste[0].epoch === 7, 'la pagina prima chiesta col segnalibro sbagliato: ' + JSON.stringify(chieste[0]));
const carica = await page.evaluate(() => document.querySelector('.log-older-t').textContent);
t(/Loading/.test(carica), 'mentre arriva la pagina prima la fila non lo dice: ' + carica);

// Prima la risposta per un'altra versione della conversazione: si butta.
await page.evaluate(() => (document.getElementById('log').scrollTop = 30));
await page.waitForTimeout(60);
const primaA = await ancora();
await post({ k: 'older', key: 'chatA', epoch: 6, first: 100, more: false, events: turno('estraneo', 3) });
await page.waitForTimeout(150);
t(!(await page.evaluate(() => document.getElementById('log').textContent.includes('estraneo'))), 'una pagina di un’altra versione della conversazione e’ entrata lo stesso');

await post({ k: 'older', key: 'chatA', epoch: 7, first: 301, more: false, events: [...turno('vecchio', 10), ...turno('vecchissimo', 4)] });
await page.waitForTimeout(250);
const dopoA = await ancora();
const o = await page.evaluate(() => {
  const log = document.getElementById('log');
  const users = [...log.querySelectorAll(':scope > .msg.user')].map((u) => u.textContent.trim().slice(0, 12));
  return { users, older: !!log.querySelector('.log-older'), recaps: log.querySelectorAll(':scope > .msg.recap').length };
});
t(o.users[0].startsWith('vecchio') && o.users[1].startsWith('vecchissimo') && o.users[2].startsWith('secondo'), 'la pagina prima non e’ andata sopra, in ordine: ' + o.users.join(' | '));
t(primaA !== null && Math.abs(dopoA - primaA) <= 2, 'la pagina prima ha spostato quello che stavi leggendo: ' + primaA + ' → ' + dopoA);
t(!o.older, 'finita la storia, la fila dei messaggi precedenti resta li’');
// Tre turni nella coda e due nella pagina prima.
t(o.recaps === 5, 'le righe di fine turno non sono cinque: ' + o.recaps);

// ---- 3. un turno in corso ----
await post({ k: 'reset', swap: true });
await page.waitForTimeout(40);
const scambio = await page.evaluate(() => ({ vuota: !!document.querySelector('#log .empty'), fantasma: !!document.querySelector('.log-ghost') }));
t(!scambio.vuota, 'cambiando conversazione la schermata vuota lampeggia prima del saluto');
t(scambio.fantasma, 'cambiando conversazione quella di prima non esce scorrendo');
await post({ k: 'hello', cwd: '/x', project: 'x', cliVersion: '1', surface: 'panel', key: 'chatB', sid: 'sid-b', past: true });
await post({ k: 'replay', key: 'chatB', epoch: 9, first: 801, more: true, events: [...turno('lungo', 25), ...turno('adesso', 5, { aperto: true })] });
await post({ k: 'busy', value: true, since: Date.now() - 65000 });
await page.waitForTimeout(300);
const vivo = await page.evaluate(() => ({
  ora: document.getElementById('actTime').textContent,
  battito: !!document.querySelector('#log .msg.pulse'),
}));
t(/^1:0[5-7]$/.test(vivo.ora), 'attaccandosi a un turno in corso l’orologio riparte da zero: ' + vivo.ora);
t(vivo.battito, 'attaccandosi a un turno in corso non c’e’ il battito');
await page.evaluate(() => (document.getElementById('log').scrollTop = 0));
await page.waitForTimeout(250);
await post({ k: 'older', key: 'chatB', epoch: 9, first: 700, more: false, events: turno('ieri', 8) });
await page.waitForTimeout(250);
const ancoraVivo = await page.evaluate(() => {
  const log = document.getElementById('log');
  return { battito: !!log.querySelector('.msg.pulse'), ultimo: log.lastElementChild.classList.contains('pulse') };
});
t(ancoraVivo.battito && ancoraVivo.ultimo, 'una pagina vecchia arrivata sopra ha spento il battito del turno in corso');
await post({ k: 'busy', value: false });

// ---- 4. la cronologia: niente schermata vuota mentre si legge, e una vuota vera se non c'e' niente ----
await post({ k: 'reset', wait: true });
await page.waitForTimeout(40);
t(!(await page.evaluate(() => !!document.querySelector('#log .empty'))), 'mentre si rilegge una conversazione lampeggia la schermata vuota');
await post({ k: 'replay', key: 'chatB', epoch: 10, first: 1, more: false, events: [] });
await page.waitForTimeout(150);
t(await page.evaluate(() => !!document.querySelector('#log .empty')), 'una conversazione senza niente dentro non mostra la schermata vuota');

// ---- 5. una pagina grossa ----
const grossa = [];
for (let i = 0; i < 12; i++) grossa.push(...turno('g' + i, 60));
await post({ k: 'reset', swap: true });
await post({ k: 'hello', cwd: '/x', project: 'x', cliVersion: '1', surface: 'panel', key: 'chatC', sid: 'sid-c', past: true });
const ms = await page.evaluate(async (events) => {
  const t0 = performance.now();
  window.postMessage({ k: 'replay', key: 'chatC', epoch: 11, first: 1, more: false, events }, '*');
  for (let i = 0; i < 200; i++) {
    await new Promise((r) => setTimeout(r, 10));
    if (document.querySelectorAll('#log > .msg').length > 700) break;
  }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return Math.round(performance.now() - t0);
}, grossa);
const quanti = await page.evaluate(() => document.querySelectorAll('#log > .msg').length);
t(quanti > 700, 'la pagina grossa non si e’ disegnata tutta: ' + quanti);
t(ms < 2500, 'una pagina di ' + grossa.length + ' eventi ci mette ' + ms + ' ms');

t(!errors.length, 'la pagina ha protestato: ' + errors.join(' | '));
await browser.close();

if (fails.length) {
  console.error('pages-ui-check FAIL\n - ' + fails.join('\n - '));
  process.exit(1);
}
console.log(`pages-ui-check ok — la coda senza entrate, i conti del turno, la pagina prima sopra senza spostare niente, le risposte vecchie scartate, l’orologio del turno, ${grossa.length} eventi in ${ms} ms`);
