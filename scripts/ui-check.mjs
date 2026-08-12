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

  // ---- la pagina sotto la CSP vera ----
  //
  // Nella webview la CSP non ha 'unsafe-inline': gli attributi style scritti nel
  // markup vengono buttati via. Qui si simula togliendoli, perche' un pezzo di
  // interfaccia che sta in piedi solo grazie a uno style inline in anteprima
  // sembra a posto e in VSCode e' rotto. E' successo davvero: lo sprite delle
  // icone si nascondeva con style="display:none", la CSP lo ignorava, e quel
  // <svg> tornava un blocco alto 150px in cima al documento che spingeva il
  // campo di scrittura fuori dallo schermo.
  await page.evaluate(() => {
    for (const n of document.querySelectorAll('[style]')) n.removeAttribute('style');
  });
  const layout = await page.evaluate(() => {
    const sprite = document.querySelector('svg.sprite');
    const comp = document.getElementById('composer').getBoundingClientRect();
    return {
      topY: Math.round(document.querySelector('.top').getBoundingClientRect().top),
      compBottom: Math.round(comp.bottom),
      compH: Math.round(comp.height),
      winH: window.innerHeight,
      sprite: sprite ? getComputedStyle(sprite).display : 'manca',
    };
  });
  t(layout.sprite === 'none', 'lo sprite delle icone si vede (e occupa spazio): display=' + layout.sprite);
  t(layout.topY === 0, 'qualcosa spinge giu’ la testata: comincia a ' + layout.topY + 'px');
  t(
    layout.compH > 20 && layout.compBottom <= layout.winH,
    'il campo di scrittura non ci sta nella finestra: finisce a ' +
      layout.compBottom +
      ' su ' +
      layout.winH
  );

  await post({ k: 'hello', cwd: 'C:/Users/Steward/CRM', project: 'CRM', cliVersion: '2.1.79', surface });

  // ---- lo stato vuoto: e' li' che si imparano le scorciatoie ----
  await page.waitForTimeout(120);
  const vuoto = await page.evaluate(() => {
    const ico = document.querySelector('.empty .ico');
    return {
      keys: [...document.querySelectorAll('.empty .key kbd')].map((n) => n.textContent),
      dash: ico ? getComputedStyle(ico).strokeDasharray : '',
    };
  });
  t(
    vuoto.keys.includes('@') && vuoto.keys.includes('Alt+N') && vuoto.keys.includes('Esc'),
    'lo stato vuoto non dice le scorciatoie: ' + vuoto.keys.join(',')
  );
  t(
    /\d/.test(vuoto.dash),
    'l’icona dello stato vuoto non si disegna da sola (niente stroke-dasharray): ' + vuoto.dash
  );
  // lo scatto si aspetta che l'icona abbia finito di disegnarsi: a meta' strada
  // sembrerebbe un'icona rotta
  await page.waitForTimeout(1100);
  await page.screenshot({ path: path.join(outDir, `preview-${surface}-empty.png`), fullPage: true });

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

  // ---- i tool che si disegnano da soli: todo, diff, sub-agent ----
  await post({
    k: 'tool_start',
    id: 'tu_T',
    name: 'TodoWrite',
    input: {
      todos: [
        { content: 'Leggere i file', status: 'completed', activeForm: 'Leggendo i file' },
        { content: 'Scrivere il diff', status: 'in_progress', activeForm: 'Scrivendo il diff' },
        { content: 'Provare', status: 'pending', activeForm: 'Provando' },
      ],
    },
  });
  await post({ k: 'tool_end', id: 'tu_T', ok: true, text: 'Todos have been modified successfully.' });

  await post({
    k: 'tool_start',
    id: 'tu_E',
    name: 'Edit',
    input: {
      file_path: 'C:/Users/Steward/CRM/src/app.ts',
      old_string: 'const a = 1;\nconst b = 2;',
      new_string: 'const a = 3;',
    },
  });
  await post({ k: 'tool_end', id: 'tu_E', ok: true, text: 'The file has been updated successfully.' });

  // un sub-agent: il suo lavoro va DENTRO la card del Task, non in fondo al discorso
  await post({ k: 'tool_start', id: 'tu_S', name: 'Task', input: { description: 'Conta i file', prompt: 'Conta i file .ts' } });
  await post({ k: 'tool_start', id: 'tu_S1', name: 'Glob', input: { pattern: '**/*.ts' }, parent: 'tu_S' });
  await post({ k: 'tool_end', id: 'tu_S1', ok: true, text: 'src/a.ts\nsrc/b.ts' });
  await post({ k: 'block_start', id: 'sub_0', kind: 'text', parent: 'tu_S' });
  await post({ k: 'delta', id: 'sub_0', kind: 'text', text: 'Ho contato ', parent: 'tu_S' });
  await post({ k: 'block_final', id: 'sub_0', kind: 'text', text: 'Ho contato 2 file.', parent: 'tu_S' });
  await post({ k: 'tool_end', id: 'tu_S', ok: true, text: 'Sono 2 file.' });

  // un output lungo: la card resta chiusa e dichiara quante righe ha
  await post({ k: 'tool_start', id: 'tu_L', name: 'Bash', input: { command: 'git log' } });
  await post({
    k: 'tool_end',
    id: 'tu_L',
    ok: true,
    text: Array.from({ length: 40 }, (_, i) => 'riga ' + i).join('\n'),
  });
  await page.waitForTimeout(200);

  const tr = await page.evaluate(() => {
    const task = document.querySelector('.tool[data-tool="Task"]');
    return {
      todoDone: document.querySelectorAll('.todo.completed').length,
      todoNow: document.querySelector('.todo.in_progress span')?.textContent,
      adds: [...document.querySelectorAll('.diff .add .code')].map((n) => n.textContent),
      dels: [...document.querySelectorAll('.diff .del .code')].map((n) => n.textContent),
      editArg: document.querySelector('.tool[data-tool="Edit"] .arg')?.textContent,
      kidsTools: task ? task.querySelectorAll('.kids .tool').length : -1,
      kidsText: task ? task.querySelector('.kids .msg.assistant')?.textContent : null,
      strayGlob: !!document.querySelector('.log > .tool[data-tool="Glob"]'),
      longOpen: document.querySelector('.tool[data-tool="Bash"][data-tool]:last-of-type')?.open,
      counts: [...document.querySelectorAll('.count')].map((n) => n.textContent),
    };
  });
  t(tr.todoDone === 1, 'i todo completati non sono segnati: ' + tr.todoDone);
  t(tr.todoNow === 'Scrivendo il diff', 'il todo in corso non mostra la forma attiva: ' + tr.todoNow);
  t(tr.dels.join('|') === 'const a = 1;|const b = 2;', 'il "prima" del diff è sbagliato: ' + tr.dels.join('|'));
  t(tr.adds.join('|') === 'const a = 3;', 'il "dopo" del diff è sbagliato: ' + tr.adds.join('|'));
  t(tr.editArg === 'src/app.ts', 'il percorso non è accorciato sulla cartella di lavoro: ' + tr.editArg);
  t(tr.kidsTools === 1, 'il tool del sub-agent non è finito dentro il Task: ' + tr.kidsTools);
  t(/Ho contato 2 file/.test(tr.kidsText || ''), 'il discorso del sub-agent non è annidato: ' + tr.kidsText);
  t(!tr.strayGlob, 'il tool del sub-agent è finito anche in fondo alla conversazione');
  t(tr.counts.includes('40 righe'), 'un output lungo non dichiara quante righe ha: ' + tr.counts.join(','));

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
  // Non e' piu' un menu a tendina ma tre bottoni con lo slider sotto.
  await post({ k: 'mode', value: 'plan' });
  await page.waitForTimeout(80);
  t(
    (await page.locator('#mode .modeseg-btn.on').getAttribute('data-mode')) === 'plan',
    'la testata non segue la modalità decisa dall’estensione'
  );
  await page.locator('#mode .modeseg-btn[data-mode="bypassPermissions"]').click();
  const s4 = await lastSent();
  t(
    s4?.cmd === 'setMode' && s4.value === 'bypassPermissions',
    'il cambio di modalità non arriva all’estensione: ' + JSON.stringify(s4)
  );

  // ---- le impostazioni: modello, impegno, pensiero, avvisi ----
  await post({
    k: 'prefs',
    value: {
      model: '', effort: '', thinking: 'auto',
      sound: 'cozy', volume: 0.6, onlyWhenAway: false, soundOnAsk: true, toast: true,
    },
  });
  // L'elenco e' esattamente quello che dice la CLI, nell'ordine in cui lo dice:
  // il primo e' il consigliato, che qui si chiama "Automatico".
  await post({
    k: 'models',
    items: [
      {
        value: 'default', label: 'Default (recommended)',
        description: 'Opus 5 · Best for everyday, complex tasks',
        resolved: 'claude-opus-5[1m]',
        efforts: ['low', 'medium', 'high', 'xhigh', 'max'], adaptive: true, recommended: true,
      },
      { value: 'opus', label: 'Opus', description: 'Il più bravo.', resolved: 'claude-opus-5', efforts: ['low', 'medium', 'high'], adaptive: true, recommended: false },
      { value: 'haiku', label: 'Haiku', description: 'Il più svelto.', resolved: 'claude-haiku-4-5', efforts: [], adaptive: false, recommended: false },
    ],
  });
  await page.click('#btnCfg');
  await page.waitForTimeout(140);
  t(await page.isVisible('#cfg'), 'il pannello delle impostazioni non si apre');
  // Una card per modello, nessuna inventata e nessuna persa
  const modelCards = await page.locator('#cfgModelList .model-card').count();
  t(modelCards === 3, 'le card dei modelli non arrivano: ' + modelCards);
  const autoName = await page.locator('#cfgModelList .model-card:nth-child(1) .mc-name').textContent();
  t(autoName === 'Automatico', 'il consigliato non si chiama Automatico: ' + autoName);
  // Il consigliato non fissa nessun modello: cosi' domani vale quello nuovo
  await page.locator('#cfgModelList .model-card:nth-child(1)').click();
  const sauto = await lastSent();
  t(sauto?.cmd === 'setPrefs' && sauto.value?.model === '', 'Automatico fissa un modello: ' + JSON.stringify(sauto));
  await page.waitForTimeout(80);
  // Senza scelta valgono i livelli del consigliato: Auto + 5 = 6 bottoni
  t(
    (await page.locator('#cfgEffort .seg-btn').count()) === 6,
    'i livelli del consigliato non arrivano'
  );
  // Clic sulla card Opus
  await page.locator('#cfgModelList .model-card:nth-child(2)').click();
  const sm = await lastSent();
  t(sm?.cmd === 'setPrefs' && sm.value?.model === 'opus', 'il modello scelto non arriva: ' + JSON.stringify(sm));
  await page.waitForTimeout(80);
  // Impegno segue il modello: Auto + 3 livelli = 4 bottoni
  const effortBtns = await page.locator('#cfgEffort .seg-btn').count();
  t(effortBtns === 4, 'i livelli di impegno non seguono il modello: ' + effortBtns);
  // La card Opus deve mostrare la descrizione nella card stessa
  const opusDesc = await page.locator('#cfgModelList .model-card:nth-child(2) .mc-desc').textContent();
  t(opusDesc === 'Il più bravo.', 'il modello scelto non si racconta: ' + opusDesc);
  // Clic su Haiku: impegno si deve spegnere
  await page.locator('#cfgModelList .model-card:nth-child(3)').click();
  await page.waitForTimeout(80);
  const disabledBtn = await page.locator('#cfgEffort .seg-btn:disabled').count();
  t(disabledBtn > 0, 'impegno selezionabile su un modello che non lo accetta');

  // Il pensiero: clic su Spento (il terzo bottone; il primo figlio e' lo slider)
  await page.locator('#cfgThink .seg-btn').nth(2).click();
  const st = await lastSent();
  t(st?.cmd === 'setPrefs' && st.value?.thinking === 'off', 'il pensiero non si spegne: ' + JSON.stringify(st));
  await page.selectOption('#cfgSound', 'harvest');
  const ssnd = await lastSent();
  t(ssnd?.cmd === 'setPrefs' && ssnd.value?.sound === 'harvest', 'il suono scelto non arriva: ' + JSON.stringify(ssnd));
  await page.click('#cfgTest');
  await page.screenshot({ path: path.join(outDir, `preview-${surface}-cfg.png`) });
  // avviso vero: arriva dall'estensione e la pagina lo suona senza lamentarsi
  await post({ k: 'chime', event: 'done', sound: 'cozy', volume: 0.4 });
  await page.waitForTimeout(120);
  await page.click('#cfgClose');
  // il pannello esce con la sua animazione: si aspetta che finisca davvero
  await page.waitForTimeout(360);
  t(await page.locator('#cfg').isHidden(), 'il pannello delle impostazioni non si chiude');

  // ---- gli ingressi: cronologia, "@", "/", selezione dall'editor ----
  // Mentre Claude lavora il tasto e' "ferma", non "manda": per provare l'invio
  // bisogna prima essere fermi davvero.
  await post({ k: 'busy', value: false });
  await post({
    k: 'history',
    items: [
      { id: 's1', summary: 'Sistemare il diff', when: Date.now() - 3600000 },
      { id: 's2', summary: 'Prima prova', when: Date.now() - 86400000 * 2 },
    ],
  });
  await page.waitForTimeout(120);
  t((await page.locator('.hrow').count()) === 2, 'la cronologia non elenca le conversazioni');
  t(
    (await page.locator('.hwhen').first().textContent()) === "un'ora fa",
    'la data della conversazione è scritta male: ' + (await page.locator('.hwhen').first().textContent())
  );
  await page.locator('.hrow').nth(1).locator('.hopen').click();
  const sh = await lastSent();
  t(sh?.cmd === 'open' && sh.id === 's2', 'la conversazione scelta non si riapre: ' + JSON.stringify(sh));
  await page.waitForTimeout(360);
  t(await page.locator('#drawer').isHidden(), 'il cassetto resta aperto dopo aver scelto');

  await post({ k: 'commands', items: [{ name: 'commit', description: 'Fa un commit' }, { name: 'test', description: 'Lancia i test' }] });
  await page.click('#input');
  await page.type('#input', '/com');
  await page.waitForTimeout(120);
  t((await page.locator('.menu .mitem').count()) === 1, 'gli slash command non si filtrano');
  await page.keyboard.press('Enter');
  t((await page.inputValue('#input')) === '/commit ', 'lo slash command non si completa: ' + (await page.inputValue('#input')));

  await page.fill('#input', '');
  await page.type('#input', 'guarda @ap');
  await page.waitForTimeout(250);
  const sf = await lastSent();
  t(sf?.cmd === 'files' && sf.q === 'ap', 'la ricerca dei file non parte: ' + JSON.stringify(sf));
  await post({ k: 'files', items: ['src/app.ts', 'docs/appunti.md'] });
  await page.waitForTimeout(120);
  t((await page.locator('.menu .mitem').count()) === 2, 'i file non compaiono nel menu');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  t(
    (await page.inputValue('#input')) === 'guarda @docs/appunti.md ',
    'il file scelto non finisce nel messaggio: ' + (await page.inputValue('#input'))
  );

  await post({ k: 'selection', file: 'src/app.ts', lines: '12-38' });
  await page.waitForTimeout(120);
  t(await page.isVisible('.attach .att'), 'la selezione dell’editor non compare fra gli allegati');
  await page.fill('#input', 'spiegami questo');
  await page.locator('#send').click();
  const ss = await lastSent();
  t(
    ss?.cmd === 'send' && ss.withSelection === true && ss.text === 'spiegami questo',
    'la selezione non viene allegata al messaggio: ' + JSON.stringify(ss)
  );
  t(await page.locator('.attach').isHidden(), 'gli allegati restano appesi dopo l’invio');

  // e se la togli, non deve piu' partire
  await post({ k: 'selection', file: 'src/app.ts', lines: '12-38' });
  await page.click('.attx');
  await page.fill('#input', 'senza');
  await page.locator('#send').click();
  const ss2 = await lastSent();
  t(!ss2?.withSelection, 'la selezione parte anche dopo che l’hai tolta');

  // clic sul percorso di un tool -> apri il file nell'editor
  await page.click('.tool[data-tool="Edit"] .arg.link');
  const so = await lastSent();
  t(
    so?.cmd === 'openFile' && /app\.ts$/.test(so.path || ''),
    'il percorso nel tool non apre il file: ' + JSON.stringify(so)
  );

  // ---- il contesto di fianco: c'e' solo nella scheda ----
  // Nella barra laterale il contesto ha un pannello suo; in una scheda quello non
  // esiste, e senza questa colonna la faccia larga sarebbe l'unica a non vederlo.
  await post({
    k: 'ctx',
    d: {
      project: 'CRM',
      limit: '1M',
      focusHow: 'studio',
      usage: { session: 34, week: 71 },
      usageWait: 'caricamento…',
      sessionReset: 'tra 2h',
      weekReset: 'tra 3g',
      branch: 'master',
      dirty: false,
      totalCost: '$1.20',
      cards: [
        {
          id: 'aaaa', shortId: 'aaaaaaaa', name: 'Questa conversazione', own: true,
          tabName: 'Studio', preview: '', pct: 22, tokens: '220.0k', cost: '$0.42',
          lastClock: '09:41', lastAgo: 'adesso', busy: false, recent: true, focused: true,
        },
      ],
    },
  });
  await page.waitForTimeout(150);

  const railed = await page.evaluate(() => {
    const rail = document.getElementById('rail');
    const box = rail.getBoundingClientRect();
    const log = document.getElementById('log').getBoundingClientRect();
    return {
      shown: getComputedStyle(rail).display !== 'none',
      btn: getComputedStyle(document.getElementById('btnCtx')).display !== 'none',
      cards: rail.querySelectorAll('.ctxcard').length,
      name: rail.querySelector('.cname')?.textContent,
      cost: rail.querySelector('.ctxcard .ccost')?.textContent,
      // niente sovrapposizioni: la colonna sta a destra del discorso
      apart: box.width === 0 || box.left >= log.right - 1,
      // le classi della chat non devono essere ridipinte dal foglio del contesto
      headerBtn: Math.round(document.getElementById('btnNew').getBoundingClientRect().width),
    };
  });

  t(railed.shown === wide, 'la colonna del contesto e’ nel posto sbagliato: shown=' + railed.shown);
  t(railed.btn === wide, 'il tasto del contesto e’ nel posto sbagliato: btn=' + railed.btn);
  if (wide) {
    t(railed.cards === 1, 'la colonna del contesto non disegna le sessioni: ' + railed.cards);
    t(railed.name === 'Questa conversazione', 'nome sbagliato nella colonna: ' + railed.name);
    t(railed.cost === '$0.42', 'il costo della conversazione non arriva nella colonna: ' + railed.cost);
    t(railed.apart, 'la colonna del contesto si sovrappone al discorso');
    // e si toglie di mezzo quando lo chiedi
    await page.click('#btnCtx');
    await page.waitForTimeout(80);
    t(
      await page.locator('#rail').isHidden(),
      'il tasto non nasconde la colonna del contesto'
    );
    await page.click('#btnCtx');
    await page.waitForTimeout(80);
    t(await page.locator('#rail').isVisible(), 'la colonna del contesto non torna');
  }
  t(railed.headerBtn > 10 && railed.headerBtn < 60, 'il foglio del contesto ha ridipinto i tasti della chat: ' + railed.headerBtn);

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
      tools: [...log.querySelectorAll(':scope > .tool')].map((t) => ({
        name: t.querySelector('.name')?.textContent,
        out: t.querySelector('.out')?.textContent,
        cls: t.className,
      })),
      user: document.querySelector('.msg.user')?.textContent,
      headOverflow: (() => {
        const top = document.querySelector('.top');
        return top.scrollWidth > top.clientWidth + 1;
      })(),
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
      railWidth: Math.round(document.getElementById('rail').getBoundingClientRect().width),
      winWidth: document.documentElement.clientWidth,
    };
  });

  t(errors.length === 0, 'errori JS in pagina: ' + errors.join(' | '));
  t(r.tools.length === 7, 'attesi 7 tool in prima fila, trovati ' + r.tools.length);
  t(r.tools[0]?.name === 'Read' && r.tools[0]?.out === 'RISULTATO-DI-A', 'Read ha preso l’esito sbagliato: ' + r.tools[0]?.out);
  t(r.tools[1]?.name === 'Bash' && r.tools[1]?.out === 'RISULTATO-DI-B', 'Bash ha preso l’esito sbagliato: ' + r.tools[1]?.out);
  t(/\bdone\b/.test(r.tools[0]?.cls || ''), 'Read non è marcato completato');
  t(/\bfail\b/.test(r.tools[2]?.cls || ''), 'Write non è marcato fallito');
  t(!r.headOverflow, 'la testata sfonda: le pillole non ci stanno nella faccia stretta');
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
    // La scheda usa tutta la finestra: quello che non e' discorso e' la colonna
    // del contesto, non spazio buttato.
    t(
      r.logWidth + r.railWidth >= r.winWidth - 2,
      'la scheda non usa la larghezza della finestra: ' + r.logWidth + '+' + r.railWidth + ' su ' + r.winWidth
    );
    t(r.railWidth > 200, 'la colonna del contesto e’ sparita dalla scheda: ' + r.railWidth);
    t(r.colWidth <= 880, 'da scheda le righe sono troppo lunghe: ' + r.colWidth + 'px');
    t(
      Math.abs(r.composerLeft - r.msgLeft) <= 1,
      'campo di scrittura e messaggi non incolonnati: ' + r.composerLeft + ' vs ' + r.msgLeft
    );
  }

  // ---- errori: quello che arriva dal motore, detto in italiano ----
  await post({
    k: 'error',
    message: 'Error: API error 429 rate_limit_error: too many requests\n    at send (/x/sdk.mjs:12:3)',
  });
  await page.waitForTimeout(120);
  const err = await page.evaluate(() => {
    const n = document.querySelector('.err:not(.calm)');
    return {
      title: n?.querySelector('.err-title')?.textContent || '',
      hint: n?.querySelector('.err-hint')?.textContent || '',
      raw: n?.querySelector('.err-raw pre')?.textContent || '',
    };
  });
  t(/limite d’uso/.test(err.title), 'l’errore non è tradotto in una frase leggibile: ' + err.title);
  t(!/at send/.test(err.title + err.hint), 'lo stack tecnico è finito nel titolo dell’errore');
  t(/rate_limit_error/.test(err.raw), 'il messaggio vero del motore non è più raggiungibile');

  // un turno fermato da te non e' un guasto: stesso riquadro, tono diverso
  await post({ k: 'error', message: 'Turno interrotto.' });
  await page.waitForTimeout(120);
  t(await page.isVisible('.err.calm'), 'un turno interrotto viene mostrato come un errore rosso');

  // ---- le scorciatoie ----
  await page.click('#input');
  await post({ k: 'busy', value: true });
  await page.waitForTimeout(120); // Esc ferma solo se la pagina sa gia' di essere occupata
  // e mentre aspetta si vedono tutti e due i movimenti dell'attesa
  const attesa = await page.evaluate(() => {
    const ring = document.querySelector('.pulse .thinking-ring');
    return {
      ring: !!ring,
      halo: !!document.querySelector('.pulse .thinking-halo'),
      spinning: ring ? getComputedStyle(ring).animationName : '',
    };
  });
  t(attesa.ring && attesa.halo, 'all’attesa manca un pezzo: alone=' + attesa.halo + ' anello=' + attesa.ring);
  t(attesa.spinning === 'cs-spin', 'l’anello dell’attesa non gira: ' + attesa.spinning);
  await page.keyboard.press('Escape');
  const sEsc = await lastSent();
  t(sEsc?.cmd === 'interrupt', 'Esc non ferma il turno: ' + JSON.stringify(sEsc));
  await post({ k: 'busy', value: false });

  await page.keyboard.press('Alt+n');
  const sAlt = await lastSent();
  t(sAlt?.cmd === 'newSession', 'Alt+N non apre una sessione nuova: ' + JSON.stringify(sAlt));

  // la freccia in su ripesca l'ultimo messaggio mandato ("senza", qui sopra)
  await page.fill('#input', '');
  await page.keyboard.press('ArrowUp');
  t(
    (await page.inputValue('#input')) === 'senza',
    'la freccia in su non ripesca l’ultimo messaggio: ' + (await page.inputValue('#input'))
  );
  await page.fill('#input', '');

  // gli scatti: la coda del discorso (dove stanno gli errori appena provati)…
  await page.evaluate(() => (document.getElementById('log').scrollTop = 1e6));
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(outDir, `preview-${surface}.png`), fullPage: true });
  // il log scorre dentro di se': per vedere anche la prima meta' serve un secondo scatto
  await page.evaluate(() => (document.getElementById('log').scrollTop = 0));
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(outDir, `preview-${surface}-top.png`), fullPage: true });

  // ---- cambio conversazione: il discorso vecchio esce scorrendo ----
  // Si prova per ultimo, perche' lascia la chat vuota e rovinerebbe gli scatti.
  await page.evaluate(() => (document.getElementById('log').scrollTop = 1e6));
  await post({ k: 'reset' });
  await page.waitForTimeout(60);
  const swap = await page.evaluate(() => {
    const ghost = document.querySelector('.log-ghost');
    const log = document.getElementById('log');
    const gb = ghost?.getBoundingClientRect();
    const lb = log.getBoundingClientRect();
    return {
      ghost: !!ghost,
      // il fantasma sta esattamente sopra il discorso, non altrove nella pagina
      onLog: gb ? Math.abs(gb.top - lb.top) < 2 && Math.abs(gb.width - lb.width) < 2 : false,
      // e porta con se' quello che stavi guardando, non una pagina bianca
      hasKids: ghost ? ghost.querySelectorAll('.msg').length : 0,
      swapping: log.classList.contains('swap-in'),
      // intanto il discorso nuovo e' gia' al suo posto
      empty: !!log.querySelector('.empty'),
      strayInLog: log.querySelectorAll('.msg').length,
    };
  });
  t(swap.ghost && swap.onLog, 'il discorso vecchio non esce di scena sopra il log');
  t(swap.hasKids > 0, 'il fantasma del cambio conversazione è vuoto');
  t(swap.swapping, 'il discorso nuovo non entra con la sua animazione');
  t(swap.empty && swap.strayInLog === 0, 'dopo il cambio la chat non riparte pulita');
  await page.waitForTimeout(500);
  t(
    (await page.locator('.log-ghost').count()) === 0,
    'il fantasma del cambio conversazione resta appeso sopra la chat'
  );
  t(errors.length === 0, 'errori JS in pagina (fase 4): ' + errors.join(' | '));

  await page.close();
}

await browser.close();

if (fails.length) {
  console.error('FALLITO:\n- ' + fails.join('\n- '));
  process.exit(1);
}
console.log('ui-check ok — pannello e scheda, screenshot in dist/preview-*.png');
