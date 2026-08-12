// Fa recitare alla webview un turno intero — testo in streaming, ragionamento,
// due tool in parallelo che finiscono in ordine invertito — e controlla che ogni
// esito sia finito sotto il tool giusto. E' il bug della terza parte: l'esito
// abbinato per posizione invece che per tool_use_id.
// Si prova due volte: faccia stretta (pannello) e faccia larga (scheda).
import { chromium } from 'playwright';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const url = pathToFileURL(path.join(root, 'dist', 'preview.html')).href;
const outDir = path.join(root, 'dist');

const browser = await chromium.launch();
const fails = [];

for (const surface of ['view', 'panel']) {
  const wide = surface === 'panel';
  const page = await browser.newPage({
    viewport: { width: wide ? 1180 : 460, height: 900 },
    colorScheme: 'dark',
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url);

  const post = (m) => page.evaluate((x) => window.postMessage(x, '*'), m);
  const t = (cond, msg) => !cond && fails.push(`[${surface}] ` + msg);
  /** L'ultimo messaggio che la pagina ha mandato all'estensione. */
  const lastSent = () => page.evaluate(() => (window.__sent || []).at(-1));

  await post({ k: 'hello', cwd: 'C:/Users/Steward/CRM', project: 'CRM', cliVersion: '2.1.79', surface });
  await post({ k: 'session', id: 'abc', model: 'claude-opus-4-6[1m]', cwd: 'C:/Users/Steward/CRM' });
  await post({ k: 'busy', value: true });
  await post({ k: 'user', text: 'Leggi i due file di configurazione e dimmi che differenza c’è.' });

  await post({ k: 'turn_start' });
  await post({ k: 'block_start', id: 'b1_0', kind: 'thinking' });
  for (const t of ['Devo aprire ', 'tutti e due i file ', 'prima di rispondere.'])
    await post({ k: 'delta', id: 'b1_0', kind: 'thinking', text: t });
  await post({
    k: 'block_final',
    id: 'b1_0',
    kind: 'thinking',
    text: 'Devo aprire tutti e due i file prima di rispondere.',
  });

  await post({ k: 'block_start', id: 'b1_1', kind: 'text' });
  for (const t of ['Apro ', 'i due file ', 'insieme.'])
    await post({ k: 'delta', id: 'b1_1', kind: 'text', text: t });
  await post({ k: 'block_final', id: 'b1_1', kind: 'text', text: 'Apro i due file insieme.' });

  // due tool in parallelo, esiti in ordine invertito
  await post({ k: 'tool_start', id: 'tu_A', name: 'Read', input: { file_path: 'package.json' } });
  await post({ k: 'tool_start', id: 'tu_B', name: 'Bash', input: { command: 'git status --porcelain' } });
  await post({ k: 'tool_end', id: 'tu_B', ok: true, text: 'RISULTATO-DI-B' });
  await post({ k: 'tool_end', id: 'tu_A', ok: true, text: 'RISULTATO-DI-A' });

  await post({ k: 'tool_start', id: 'tu_C', name: 'Write', input: { file_path: 'out.txt' } });
  await post({ k: 'tool_end', id: 'tu_C', ok: false, text: 'permesso negato' });

  // ---- permessi: i tre tipi di domanda, cliccati davvero ----
  await post({
    k: 'ask',
    id: 'ask_1',
    kind: 'tool',
    tool: 'Bash',
    title: 'Claude vuole eseguire un comando',
    detail: 'rm -rf dist',
    canAlways: true,
  });
  await page.waitForTimeout(120);
  t(await page.isVisible('.perm[data-kind="tool"]'), 'la scheda del permesso non compare');
  t(
    (await page.locator('.perm[data-kind="tool"] .btn.always').count()) === 1,
    '"Consenti sempre" non c’è quando il motore lo permette'
  );
  await page.click('.perm[data-kind="tool"] .btn.always');
  const s1 = await lastSent();
  t(
    s1?.cmd === 'answer' && s1.id === 'ask_1' && s1.choice === 'always',
    'risposta sbagliata al permesso: ' + JSON.stringify(s1)
  );
  t(
    await page.locator('.perm[data-kind="tool"] .btn.ok').isDisabled(),
    'dopo il clic i tasti restano cliccabili'
  );
  await post({ k: 'ask_done', id: 'ask_1', ok: true, label: 'Consentito sempre' });
  await page.waitForTimeout(120);
  t(await page.isVisible('.perm.resolved.ok .verdict'), 'la scheda non mostra l’esito');
  t((await page.locator('.perm .acts').count()) === 0, 'i tasti restano dopo la risposta');

  // il piano
  await post({
    k: 'ask',
    id: 'ask_2',
    kind: 'plan',
    tool: 'ExitPlanMode',
    title: 'Claude ha finito di pianificare',
    detail: '',
    canAlways: false,
    plan: 'Passo uno: leggere.\nPasso due: scrivere.\n\n```js\nconst a = 1;\n```\n',
  });
  await page.waitForTimeout(120);
  t(
    (await page.locator('.perm[data-kind="plan"] .plan pre code').count()) === 1,
    'il piano non è reso col suo blocco di codice'
  );
  t(
    (await page.locator('.perm[data-kind="plan"] .btn').count()) === 3,
    'al piano mancano le tre scelte'
  );
  await page.click('.perm[data-kind="plan"] .btn.no');
  const s2 = await lastSent();
  t(s2?.cmd === 'answer' && s2.id === 'ask_2' && s2.choice === 'deny', 'il rifiuto del piano non parte: ' + JSON.stringify(s2));
  await post({ k: 'ask_done', id: 'ask_2', ok: false, label: 'Continua a pianificare' });

  // le domande a scelta multipla
  await post({
    k: 'ask',
    id: 'ask_3',
    kind: 'question',
    tool: 'AskUserQuestion',
    title: 'Claude ti chiede una cosa',
    detail: '',
    canAlways: false,
    questions: [
      {
        question: 'Quale motore uso?',
        header: 'Motore',
        options: [
          { label: 'esbuild', description: 'Veloce.' },
          { label: 'tsc', description: 'Lento ma ufficiale.' },
        ],
      },
    ],
  });
  await page.waitForTimeout(120);
  t(
    await page.locator('.perm[data-kind="question"] .btn.ok').isDisabled(),
    '"Manda" è attivo prima che ci sia una risposta'
  );
  await page.click('.perm[data-kind="question"] .opt:nth-child(2)');
  await page.click('.perm[data-kind="question"] .btn.ok');
  const s3 = await lastSent();
  t(
    s3?.cmd === 'answer' && s3.answers?.['Quale motore uso?'] === 'tsc',
    'la risposta scelta non arriva all’estensione: ' + JSON.stringify(s3)
  );
  await post({ k: 'ask_done', id: 'ask_3', ok: true, label: 'tsc' });

  // ---- la modalita' permessi ----
  await post({ k: 'mode', value: 'plan' });
  await page.waitForTimeout(80);
  t(
    (await page.inputValue('#modeSel')) === 'plan',
    'la testata non segue la modalità decisa dall’estensione'
  );
  await page.selectOption('#modeSel', 'acceptEdits');
  const s4 = await lastSent();
  t(
    s4?.cmd === 'setMode' && s4.value === 'acceptEdits',
    'il cambio di modalità non arriva all’estensione: ' + JSON.stringify(s4)
  );

  const finale = 'Il primo usa `esbuild`, il secondo no:\n\n```json\n{ "build": "esbuild" }\n```\n';
  await post({ k: 'block_start', id: 'b2_0', kind: 'text' });
  for (const t of ['Il primo ', 'usa `esbuild`, ', 'il secondo no:\n\n```json\n{ "build": "esbuild" }\n```\n'])
    await post({ k: 'delta', id: 'b2_0', kind: 'text', text: t });
  await post({ k: 'block_final', id: 'b2_0', kind: 'text', text: finale });
  await post({ k: 'turn_end', ok: true, costUsd: 0.014, durationMs: 4200, tokens: 18234 });
  await post({ k: 'busy', value: false });

  await page.waitForTimeout(900);

  const r = await page.evaluate(() => {
    const log = document.getElementById('log');
    const box = log.getBoundingClientRect();
    const first = log.querySelector('.msg.assistant');
    return {
      tools: [...document.querySelectorAll('.tool')].map((t) => ({
        name: t.querySelector('.name')?.textContent,
        out: t.querySelector('.out')?.textContent,
        cls: t.className,
      })),
      user: document.querySelector('.msg.user')?.textContent,
      model: document.getElementById('modelName')?.textContent,
      think: document.querySelector('.think .body')?.textContent,
      codeBlocks: document.querySelectorAll('.msg.assistant pre code').length,
      inlineCode: document.querySelectorAll('.msg.assistant code').length,
      textMsgs: [...document.querySelectorAll('.msg.assistant')].map((n) => n.textContent),
      carets: document.querySelectorAll('.caret').length,
      stopBtn: document.getElementById('send')?.className,
      isWide: document.body.classList.contains('wide'),
      // non basta la proprieta' `hidden`: conta se si vede davvero
      tabBtnHidden: getComputedStyle(document.getElementById('btnTab')).display === 'none',
      composerLeft: Math.round(document.getElementById('composer').getBoundingClientRect().left),
      msgLeft: first ? Math.round(first.getBoundingClientRect().left) : 0,
      // larghezza della colonna di lettura e sfondamento orizzontale
      colWidth: first ? Math.round(first.getBoundingClientRect().width) : 0,
      hOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      // nessun messaggio deve essere schiacciato dal flex quando il log e' pieno
      squashed: [...log.querySelectorAll('.msg')]
        .filter((n) => n.scrollHeight > n.clientHeight + 2 && !n.querySelector('.plan, .out, .detail'))
        .map((n) => n.className),
      logWidth: Math.round(box.width),
    };
  });

  t(errors.length === 0, 'errori JS in pagina: ' + errors.join(' | '));
  t(r.tools.length === 3, 'attesi 3 tool, trovati ' + r.tools.length);
  t(r.tools[0]?.name === 'Read' && r.tools[0]?.out === 'RISULTATO-DI-A', 'Read ha preso l’esito sbagliato: ' + r.tools[0]?.out);
  t(r.tools[1]?.name === 'Bash' && r.tools[1]?.out === 'RISULTATO-DI-B', 'Bash ha preso l’esito sbagliato: ' + r.tools[1]?.out);
  t(/\bdone\b/.test(r.tools[0]?.cls || ''), 'Read non è marcato completato');
  t(/\bfail\b/.test(r.tools[2]?.cls || ''), 'Write non è marcato fallito');
  t(r.model === 'claude-opus-4-6[1m]', 'modello non mostrato: ' + r.model);
  t(/differenza/.test(r.user || ''), 'messaggio utente mancante');
  t(/tutti e due i file/.test(r.think || ''), 'blocco ragionamento mancante');
  t(r.codeBlocks === 1, 'blocco di codice non reso: ' + r.codeBlocks);
  t(r.inlineCode === 2, 'codice inline non reso: ' + r.inlineCode);
  t(r.carets === 0, 'cursore rimasto acceso a turno finito');
  t(!/stop/.test(r.stopBtn || ''), 'il tasto è rimasto su "ferma"');
  t(!r.hOverflow, 'la pagina sfonda in orizzontale');
  t(!r.squashed.length, 'messaggi schiacciati dal flex: ' + r.squashed.join(' | '));
  const joined = r.textMsgs.join('\n');
  t((joined.match(/Apro i due file insieme\./g) || []).length === 1, 'testo duplicato dopo block_final');

  t(r.isWide === wide, 'la faccia non ha riconosciuto se stessa');
  t(r.tabBtnHidden === wide, 'il tasto "apri come scheda" è nel posto sbagliato');
  if (wide) {
    t(r.logWidth > 1000, 'la scheda non usa la larghezza della finestra: ' + r.logWidth);
    t(r.colWidth <= 880, 'da scheda le righe sono troppo lunghe: ' + r.colWidth + 'px');
    t(
      Math.abs(r.composerLeft - r.msgLeft) <= 1,
      'campo di scrittura e messaggi non incolonnati: ' + r.composerLeft + ' vs ' + r.msgLeft
    );
  }

  await page.screenshot({ path: path.join(outDir, `preview-${surface}.png`), fullPage: true });
  await page.close();
}

await browser.close();

if (fails.length) {
  console.error('FALLITO:\n- ' + fails.join('\n- '));
  process.exit(1);
}
console.log('ui-check ok — pannello e scheda, screenshot in dist/preview-*.png');
