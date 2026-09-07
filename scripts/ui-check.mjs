// Makes the webview act out a whole turn — streaming text, reasoning, two tools in
// parallel that finish in reverse order — and checks that every result ended up
// under the right tool. That's the third-party bug: the result matched by position
// instead of by tool_use_id.
// It runs twice: narrow face (panel) and wide face (tab).
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
  /** The last message the page sent to the extension. */
  const lastSent = () => page.evaluate(() => (window.__sent || []).at(-1));

  // ---- the page under the real CSP ----
  //
  // In the webview the CSP has no 'unsafe-inline': style attributes written into
  // the markup get thrown away. Here we simulate that by removing them, because a
  // piece of interface that only stands up thanks to an inline style looks fine in
  // the preview and is broken in VS Code. It really happened: the icon sprite hid
  // itself with style="display:none", the CSP ignored it, and that <svg> became a
  // 150px-tall block at the top of the document that pushed the composer off screen.
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
      sprite: sprite ? getComputedStyle(sprite).display : 'missing',
    };
  });
  t(layout.sprite === 'none', 'the icon sprite is visible (and takes up space): display=' + layout.sprite);
  t(layout.topY === 0, 'something is pushing the header down: it starts at ' + layout.topY + 'px');
  t(
    layout.compH > 20 && layout.compBottom <= layout.winH,
    'the composer does not fit in the window: it ends at ' +
      layout.compBottom +
      ' out of ' +
      layout.winH
  );

  await post({ k: 'hello', cwd: 'C:/Users/Steward/CRM', project: 'CRM', cliVersion: '2.1.79', surface });

  // ---- the empty state: the brand mark, "Ready.", the blurb and the five pills ----
  await page.waitForTimeout(120);
  const empty = await page.evaluate(() => {
    const mark = document.querySelector('.empty .ico.brandmark use');
    return {
      // The five shortcut pills are the point of the screen: each one has to carry a
      // key and its label, or it teaches nothing.
      pills: [...document.querySelectorAll('.empty .key')].map((k) => ({
        key: (k.querySelector('kbd') || {}).textContent || '',
        label: (k.querySelector('span') || {}).textContent || '',
      })),
      body: (document.querySelector('.empty p') || {}).textContent || '',
      mark: mark ? mark.getAttribute('href') : '',
      title: (document.querySelector('.empty h2') || {}).textContent || '',
    };
  });
  t(empty.pills.length === 5, 'the empty state should show 5 shortcut pills, not ' + empty.pills.length);
  t(
    empty.pills.every((p) => p.key.trim() && p.label.trim()),
    'a shortcut pill is missing its key or its label: ' + JSON.stringify(empty.pills)
  );
  t(!!empty.body.trim(), 'the empty state lost the line about what this is');
  t(empty.mark === '#ion-studio-logo', 'the empty state is not showing the Claude Studio mark: ' + empty.mark);
  t(!!empty.title.trim(), 'the empty state lost its title');
  // the screenshot waits for the icon to finish drawing: halfway through it would
  // look like a broken icon
  await page.waitForTimeout(1100);
  await page.screenshot({ path: path.join(outDir, `preview-${surface}-empty.png`), fullPage: true });

  await post({ k: 'session', id: 'abc', model: 'claude-opus-4-6[1m]', cwd: 'C:/Users/Steward/CRM' });
  await post({ k: 'busy', value: true });
  // `cp` = il checkpoint che questo messaggio ha aperto: e' quello che accende la
  // freccia "torna a un attimo prima di qui" accanto al messaggio.
  await post({ k: 'user', text: 'Read the two config files and tell me what the difference is.', cp: 7 });

  await post({ k: 'turn_start' });
  await post({ k: 'block_start', id: 'b1_0', kind: 'thinking' });
  for (const t of ['I need to open ', 'both files ', 'before answering.'])
    await post({ k: 'delta', id: 'b1_0', kind: 'thinking', text: t });
  await post({
    k: 'block_final',
    id: 'b1_0',
    kind: 'thinking',
    text: 'I need to open both files before answering.',
  });

  await post({ k: 'block_start', id: 'b1_1', kind: 'text' });
  for (const t of ['Opening ', 'the two files ', 'together.'])
    await post({ k: 'delta', id: 'b1_1', kind: 'text', text: t });
  await post({ k: 'block_final', id: 'b1_1', kind: 'text', text: 'Opening the two files together.' });

  // two tools in parallel, results in reverse order
  await post({ k: 'tool_start', id: 'tu_A', name: 'Read', input: { file_path: 'package.json' } });
  await post({ k: 'tool_start', id: 'tu_B', name: 'Bash', input: { command: 'git status --porcelain' } });
  await post({ k: 'tool_end', id: 'tu_B', ok: true, text: 'RESULT-OF-B' });
  await post({ k: 'tool_end', id: 'tu_A', ok: true, text: 'RESULT-OF-A' });

  await post({ k: 'tool_start', id: 'tu_C', name: 'Write', input: { file_path: 'out.txt' } });
  await post({ k: 'tool_end', id: 'tu_C', ok: false, text: 'permission denied' });

  // ---- the tools that draw themselves: todo, diff, sub-agent ----
  await post({
    k: 'tool_start',
    id: 'tu_T',
    name: 'TodoWrite',
    input: {
      todos: [
        { content: 'Read the files', status: 'completed', activeForm: 'Reading the files' },
        { content: 'Write the diff', status: 'in_progress', activeForm: 'Writing the diff' },
        { content: 'Test it', status: 'pending', activeForm: 'Testing it' },
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

  // a sub-agent: its work goes INSIDE the Task card, not at the end of the thread
  await post({ k: 'tool_start', id: 'tu_S', name: 'Task', input: { description: 'Count the files', prompt: 'Count the .ts files' } });
  await post({ k: 'tool_start', id: 'tu_S1', name: 'Glob', input: { pattern: '**/*.ts' }, parent: 'tu_S' });
  await post({ k: 'tool_end', id: 'tu_S1', ok: true, text: 'src/a.ts\nsrc/b.ts' });
  await post({ k: 'block_start', id: 'sub_0', kind: 'text', parent: 'tu_S' });
  await post({ k: 'delta', id: 'sub_0', kind: 'text', text: 'I counted ', parent: 'tu_S' });
  await post({ k: 'block_final', id: 'sub_0', kind: 'text', text: 'I counted 2 files.', parent: 'tu_S' });
  await post({ k: 'tool_end', id: 'tu_S', ok: true, text: 'That is 2 files.' });

  // a long output: the card stays closed and says how many lines it has
  await post({ k: 'tool_start', id: 'tu_L', name: 'Bash', input: { command: 'git log' } });
  await post({
    k: 'tool_end',
    id: 'tu_L',
    ok: true,
    text: Array.from({ length: 40 }, (_, i) => 'line ' + i).join('\n'),
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
  t(tr.todoDone === 1, 'the completed todos are not marked: ' + tr.todoDone);
  t(tr.todoNow === 'Writing the diff', 'the todo in progress does not show the active form: ' + tr.todoNow);
  t(tr.dels.join('|') === 'const a = 1;|const b = 2;', 'the "before" of the diff is wrong: ' + tr.dels.join('|'));
  t(tr.adds.join('|') === 'const a = 3;', 'the "after" of the diff is wrong: ' + tr.adds.join('|'));
  t(tr.editArg === 'src/app.ts', 'the path is not shortened against the working folder: ' + tr.editArg);
  t(tr.kidsTools === 1, 'the sub-agent tool did not end up inside the Task: ' + tr.kidsTools);
  t(/I counted 2 files/.test(tr.kidsText || ''), 'the sub-agent thread is not nested: ' + tr.kidsText);
  t(!tr.strayGlob, 'the sub-agent tool also ended up at the end of the conversation');
  t(tr.counts.includes('40 lines'), 'a long output does not say how many lines it has: ' + tr.counts.join(','));

  // ---- a diff longer than what fits: the rest has to be reachable ----
  await post({
    k: 'tool_start',
    id: 'tu_BIG',
    name: 'Write',
    input: {
      file_path: 'C:/Users/Steward/CRM/src/big.ts',
      content: Array.from({ length: 80 }, (_, i) => 'row ' + i).join('\n'),
    },
  });
  await post({ k: 'tool_end', id: 'tu_BIG', ok: true, text: 'The file has been created.' });
  await page.waitForTimeout(150);
  const bigSel = '.tool[data-tool="Write"]:last-of-type .diff';
  t(
    (await page.locator(bigSel + ' .row').count()) === 60,
    'the long diff does not stop at sixty rows: ' + (await page.locator(bigSel + ' .row').count())
  );
  // Le carte nascono chiuse: per arrivare al bottone la si apre, come faresti tu.
  await page.evaluate(() => {
    const cards = document.querySelectorAll('.tool[data-tool="Write"]');
    cards[cards.length - 1].open = true;
  });
  await page.waitForTimeout(150);
  t(await page.isVisible(bigSel + ' .more-btn'), 'the rest of a long diff has no way in');
  await page.click(bigSel + ' .more-btn');
  await page.waitForTimeout(80);
  t(
    (await page.locator(bigSel + ' .row').count()) === 80,
    'clicking does not open the rest of the diff: ' + (await page.locator(bigSel + ' .row').count())
  );
  t((await page.locator(bigSel + ' .more-btn').count()) === 0, 'the button stays once there is nothing left');
  t(await page.isVisible(bigSel), 'opening the rest folded the card shut');

  // ---- the map of the turn: a ruler, not a barcode ----
  //
  // The failure this guards against is the one that happened twice. A mark whose
  // position means "how many steps came before me" turns a real turn into confetti
  // and disagrees with the scrollbar about where everything is. So: every mark has
  // to sit where its card really sits, they have to go down the rail in order, and
  // the ones you would scroll back to have to be drawn heavier than the hum.
  for (const f of ['src/one.ts', 'src/two.ts', 'src/three.ts']) {
    await post({ k: 'tool_start', id: 'tu_R_' + f, name: 'Read', input: { file_path: f } });
    await post({ k: 'tool_end', id: 'tu_R_' + f, ok: true, text: 'ok' });
  }
  await page.waitForTimeout(300);
  const map = await page.evaluate(() => {
    const rail = document.getElementById('tmap');
    const bands = [...rail.querySelectorAll('.tm')];
    const num = (b, p) => parseFloat(getComputedStyle(b).getPropertyValue(p));
    const last = bands[bands.length - 1];
    const view = rail.querySelector('.tm-view');
    const log = document.getElementById('log');
    // dove il discorso dice davvero che sta l'ultimo passo
    const real =
      last && log.scrollHeight
        ? (last._nodes[0].getBoundingClientRect().top -
            (log.getBoundingClientRect().top - log.scrollTop)) /
          log.scrollHeight
        : -1;
    return {
      bands: bands.length,
      steps: document.querySelectorAll('#log > .msg').length,
      lastKind: last ? last.className : '',
      lastCount: last?.querySelector('.tm-n')?.textContent || '',
      tops: bands.map((b) => num(b, '--t')),
      heights: bands.map((b) => num(b, '--h')),
      lastTop: last ? num(last, '--t') : -1,
      real,
      // il nastro sottile e le tacche che ne escono non sono larghi uguale
      quietW: bands.filter((b) => !b.classList.contains('loud')).map((b) => b.offsetWidth)[0],
      loudW: bands.filter((b) => b.classList.contains('loud')).map((b) => b.offsetWidth)[0],
      loudN: bands.filter((b) => b.classList.contains('loud')).length,
      viewShown: view ? !view.hidden : false,
      viewH: view ? num(view, '--vh') : -1,
      named: bands.every((b) => (b.querySelector('.tm-name')?.textContent || '').trim().length > 0),
      labelled: bands.every((b) => !!b.getAttribute('aria-label')),
      hidden: rail.getAttribute('aria-hidden'),
    };
  });
  t(map.steps > 4, 'not enough steps to have a shape: ' + map.steps);
  t(/tm-read/.test(map.lastKind), 'three reads in a row are not one read band: ' + map.lastKind);
  t(map.lastCount === '3', 'the band does not say how many steps it holds: ' + map.lastCount);
  // the ruler and the thread have to agree about where things are
  t(
    map.tops.every((v, i, a) => i === 0 || v >= a[i - 1] - 0.001),
    'the marks do not go down the rail in order: ' + map.tops.join(',')
  );
  t(
    map.heights.every((h) => h > 0) && map.tops.every((v) => v >= 0 && v <= 1),
    'the marks are not placed against the scroll height: ' + map.tops.join(',')
  );
  t(
    Math.abs(map.lastTop - map.real) < 0.01,
    'the last mark is not where its card is: ' + map.lastTop + ' vs ' + map.real
  );
  t(map.loudN > 0 && map.loudW > map.quietW, 'the steps that matter are drawn like the hum: ' + map.loudW + ' vs ' + map.quietW);
  t(map.viewShown && map.viewH > 0 && map.viewH < 1, 'the slice you are looking at is not marked: ' + map.viewH);
  t(map.named, 'the bands have no name to read when the rail opens');
  t(map.labelled, 'the bands say nothing to a screen reader');
  t(map.hidden !== 'true', 'the map is still hidden from assistive tech');

  // …and opening it turns the colours into words. This is the answer to "a coloured
  // stripe with no key anywhere", so it is the half worth guarding.
  const railClosed = await page.evaluate(
    () => Math.round(document.getElementById('tmap').getBoundingClientRect().width)
  );
  await page.hover('#tmap .tm');
  await page.waitForTimeout(900); // half a second of delay before it opens, then the slide
  const open = await page.evaluate(() => {
    const rail = document.getElementById('tmap');
    const first = rail.querySelector('.tm .tm-name');
    return {
      w: Math.round(rail.getBoundingClientRect().width),
      nameShown: first ? getComputedStyle(first).display !== 'none' : false,
      nameWidth: first ? Math.round(first.getBoundingClientRect().width) : 0,
      // aperte sono righe, non piu' bande: l'altezza proporzionale ha finito il suo
      // lavoro, e una riga di testo tre volte piu' alta di quella sopra non e' un elenco
      grows: [...rail.querySelectorAll('.tm')].map((b) => getComputedStyle(b).flexGrow),
    };
  });
  t(open.w > railClosed + 80, 'the map does not open when you point at it: ' + railClosed + ' -> ' + open.w);
  t(open.nameShown && open.nameWidth > 0, 'the map opens but still says nothing in words');
  t(
    open.grows.every((g) => g === '0'),
    'the open rows still stretch with the run they hold: ' + open.grows.join(',')
  );
  await page.screenshot({ path: path.join(outDir, `preview-${surface}-map.png`) });
  // and it has to shut again, or it would sit on top of the thread for good
  await page.hover('#input');
  await page.waitForTimeout(400);
  t(
    (await page.evaluate(() => Math.round(document.getElementById('tmap').getBoundingClientRect().width))) ===
      railClosed,
    'the map stays open once you have left it'
  );

  // ---- back to just before a message ----
  const back = await page.locator('.msg.user .rewind').first();
  t((await page.locator('.msg.user .rewind').count()) === 1, 'the message with a checkpoint has no way back');
  await back.click();
  const rw = await lastSent();
  t(
    rw?.cmd === 'rewind' && rw.id === 7,
    'the arrow does not ask to go back to its own checkpoint: ' + JSON.stringify(rw)
  );

  // ---- what you write while it is still working ----
  //
  // It has to say three things a turning clock cannot: that it is waiting, when it
  // stops waiting, and what it is carrying. That last one is the one that was
  // missing — the photo and the spreadsheet you hung on it are exactly the things
  // you forget you attached, and a message that shows a line of text and nothing
  // else gives you no way of remembering.
  const PNG =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  await page.fill('#input', '');
  await post({
    k: 'queued',
    id: 'q1',
    text: 'e poi controlla il foglio dei conti',
    images: [{ mime: 'image/png', data: PNG }],
    files: [{ path: 'C:/proj/conti.xlsx', name: 'conti.xlsx', size: 48210 }],
  });
  await post({ k: 'queued', id: 'q2', text: 'infine committa tutto' });
  await page.waitForTimeout(200);
  const q = await page.evaluate(() => {
    const box = document.getElementById('queued');
    const rows = [...box.querySelectorAll('.qmsg')];
    return {
      shown: !box.hidden,
      rows: rows.length,
      head: (box.querySelector('.qhead-text') || {}).textContent || '',
      // quello che si porta dietro, disegnato come lo disegnera' il discorso
      imgs: rows[0] ? rows[0].querySelectorAll('.uimg').length : -1,
      chip: rows[0] ? (rows[0].querySelector('.att-name') || {}).textContent : null,
      // il posto in fila si vede solo quando una fila c'e' davvero
      numbered: rows.map((r) => getComputedStyle(r.querySelector('.qn')).display),
      nums: rows.map((r) => r.querySelector('.qn').textContent),
    };
  });
  t(q.shown && q.rows === 2, 'the queued messages are not there: ' + JSON.stringify(q));
  t(/\b2\b/.test(q.head), 'the queue does not say in words what is happening: ' + q.head);
  t(q.imgs === 1, 'an image attached to a queued message is not shown: ' + q.imgs);
  t(q.chip === 'conti.xlsx', 'a file attached to a queued message is not shown: ' + q.chip);
  t(q.numbered.every((d) => d !== 'none') && q.nums.join('') === '12', 'two queued messages are not numbered: ' + q.nums.join(','));

  // taking one back must not throw away what you wrote in it
  // .nth(1), non :nth-of-type(2): la frase in testa e' un div anche lei, e il
  // selettore CSS conta i fratelli dello stesso tipo, non quelli con la stessa classe.
  await page.locator('.qmsg .qx').nth(1).click();
  const un = await lastSent();
  t(un?.cmd === 'unqueue' && un.id === 'q2', 'the × does not take the message back: ' + JSON.stringify(un));
  t(
    (await page.inputValue('#input')) === 'infine committa tutto',
    'what you had written is lost when you take it back: ' + (await page.inputValue('#input'))
  );
  await post({ k: 'unqueued', id: 'q2' });
  await page.waitForTimeout(320);
  const q1 = await page.evaluate(() => {
    const box = document.getElementById('queued');
    const n = box.querySelector('.qmsg .qn');
    return { rows: box.querySelectorAll('.qmsg').length, num: n ? getComputedStyle(n).display : '?' };
  });
  t(q1.rows === 1 && q1.num === 'none', 'the last one in the queue is still numbered: ' + JSON.stringify(q1));
  await post({ k: 'unqueued', id: 'q1' });
  await page.fill('#input', '');
  await page.waitForTimeout(320);
  t(await page.locator('#queued').isHidden(), 'the empty queue leaves its box behind');

  // ---- permissions: the three kinds of question, really clicked ----
  await post({
    k: 'ask',
    id: 'ask_1',
    kind: 'tool',
    tool: 'Bash',
    title: 'Claude wants to run a command',
    detail: 'rm -rf dist',
    canAlways: true,
  });
  await page.waitForTimeout(120);
  t(await page.isVisible('.perm[data-kind="tool"]'), 'the permission card does not appear');
  t(
    (await page.locator('.perm[data-kind="tool"] .btn.always').count()) === 1,
    '"Always allow" is missing when the engine allows it'
  );
  await page.click('.perm[data-kind="tool"] .btn.always');
  const s1 = await lastSent();
  t(
    s1?.cmd === 'answer' && s1.id === 'ask_1' && s1.choice === 'always',
    'wrong answer to the permission: ' + JSON.stringify(s1)
  );
  t(
    await page.locator('.perm[data-kind="tool"] .btn.ok').isDisabled(),
    'after the click the buttons are still clickable'
  );
  await post({ k: 'ask_done', id: 'ask_1', ok: true, label: 'Always allowed' });
  await page.waitForTimeout(120);
  t(await page.isVisible('.perm.resolved.ok .verdict'), 'the card does not show the outcome');
  t((await page.locator('.perm .acts').count()) === 0, 'the buttons stay after the answer');

  // the plan
  await post({
    k: 'ask',
    id: 'ask_2',
    kind: 'plan',
    tool: 'ExitPlanMode',
    title: 'Claude is done planning',
    detail: '',
    canAlways: false,
    plan: 'Step one: read.\nStep two: write.\n\n```js\nconst a = 1;\n```\n',
  });
  await page.waitForTimeout(120);
  t(
    (await page.locator('.perm[data-kind="plan"] .plan pre code').count()) === 1,
    'the plan is not rendered with its code block'
  );
  t(
    (await page.locator('.perm[data-kind="plan"] .btn').count()) === 3,
    'the plan is missing its three choices'
  );
  await page.click('.perm[data-kind="plan"] .btn.no');
  const s2 = await lastSent();
  t(s2?.cmd === 'answer' && s2.id === 'ask_2' && s2.choice === 'deny', 'denying the plan does not fire: ' + JSON.stringify(s2));
  await post({ k: 'ask_done', id: 'ask_2', ok: false, label: 'Keep planning' });

  // the multiple-choice questions
  await post({
    k: 'ask',
    id: 'ask_3',
    kind: 'question',
    tool: 'AskUserQuestion',
    title: 'Claude is asking you something',
    detail: '',
    canAlways: false,
    questions: [
      {
        question: 'Which bundler should I use?',
        header: 'Bundler',
        options: [
          { label: 'esbuild', description: 'Fast.' },
          { label: 'tsc', description: 'Slow but official.' },
        ],
      },
    ],
  });
  await page.waitForTimeout(120);
  t(
    await page.locator('.perm[data-kind="question"] .btn.ok').isDisabled(),
    '"Send" is active before there is an answer'
  );
  await page.click('.perm[data-kind="question"] .opt:nth-child(2)');
  await page.click('.perm[data-kind="question"] .btn.ok');
  const s3 = await lastSent();
  t(
    s3?.cmd === 'answer' && s3.answers?.['Which bundler should I use?'] === 'tsc',
    'the chosen answer does not reach the extension: ' + JSON.stringify(s3)
  );
  await post({ k: 'ask_done', id: 'ask_3', ok: true, label: 'tsc' });

  // ---- the permission mode ----
  // It's no longer a dropdown but three buttons with the slider underneath.
  await post({ k: 'mode', value: 'plan' });
  await page.waitForTimeout(80);
  t(
    (await page.locator('#mode .modeseg-btn.on').getAttribute('data-mode')) === 'plan',
    'the header does not follow the mode decided by the extension'
  );
  await page.locator('#mode .modeseg-btn[data-mode="bypassPermissions"]').click();
  const s4 = await lastSent();
  t(
    s4?.cmd === 'setMode' && s4.value === 'bypassPermissions',
    'the mode change does not reach the extension: ' + JSON.stringify(s4)
  );

  // ---- what it's doing, in the header ----
  // The pill moved next to the mode switch: state and clock, nothing else. The
  // header in the narrow face is already tight, so the thing to watch is that it
  // doesn't push the pills off the edge — and that the step counter, which used to
  // change every couple of seconds, has really gone (it lives in the recap).
  // We're still busy here: the pill is on screen.
  const act = await page.evaluate(() => {
    const a = document.getElementById('activity');
    const top = document.querySelector('.top');
    const mode = document.getElementById('mode');
    return {
      inHeader: top.contains(a),
      shown: !a.hidden && a.getBoundingClientRect().width > 0,
      leftOfMode: a.getBoundingClientRect().right <= mode.getBoundingClientRect().left + 1,
      time: document.getElementById('actTime').textContent,
      steps: !!document.getElementById('actSteps'),
      overflow: top.scrollWidth > top.clientWidth + 1,
      // one row, one height: pill, mode switch and icon buttons
      heights: [a, mode, document.getElementById('btnCfg')].map((n) =>
        Math.round(n.getBoundingClientRect().height)
      ),
      // and the state is readable in full, not cut down to one letter
      whatCut: (() => {
        const n = document.getElementById('actWhat');
        return n.scrollWidth > n.clientWidth + 1;
      })(),
    };
  });
  t(act.inHeader, 'the activity pill is no longer in the header');
  t(act.shown, 'the activity pill does not show while it is working');
  t(act.leftOfMode, 'the activity pill is not to the left of the mode switch');
  t(!act.steps, 'the step counter is back in the pill: it belongs to the recap');
  t(/^\d+:\d\d$/.test(act.time), 'the pill has lost its clock: ' + act.time);
  t(!act.overflow, 'with the activity pill on, the header overflows: ' + surface);
  t(
    new Set(act.heights).size === 1,
    'the header controls are not all the same height: ' + act.heights.join('/')
  );
  t(!act.whatCut, 'the state in the pill is cut off instead of fitting');
  await page.locator('.top').screenshot({ path: path.join(outDir, `preview-${surface}-act.png`) });

  // ---- one column: every box lines up with the writing field ----
  // Not just the left edge — the right one too. The scrollbar lives inside the
  // thread and used to eat ten pixels off every card on that side.
  //
  // First the boxes have to stop moving: every message arrives with a scale, and
  // measured mid-flight the last one is always a couple of pixels narrower than it
  // will be. That is the animation, not the layout — waiting for it to end is the
  // difference between measuring the column and measuring the entrance.
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('#log > .msg, #log > .perm')].every((n) =>
        n.getAnimations().every((a) => a.playState !== 'running')
      ),
    null,
    { timeout: 5000 }
  );
  const col = await page.evaluate(() => {
    const box = (n) => {
      const r = n.getBoundingClientRect();
      return { l: Math.round(r.left), r: Math.round(r.right) };
    };
    const comp = box(document.getElementById('composer'));
    const rows = [...document.querySelectorAll('#log > .msg, #log > .perm')].map((n) => ({
      cls: n.className,
      ...box(n),
    }));
    return { comp, rows };
  });
  const offL = col.rows.filter((r) => Math.abs(r.l - col.comp.l) > 1);
  const offR = col.rows.filter((r) => Math.abs(r.r - col.comp.r) > 1);
  t(col.rows.length > 3, 'no boxes to line up: ' + col.rows.length);
  t(!offL.length, 'boxes not aligned to the writing field on the left: ' + offL.map((r) => r.cls + '@' + r.l).join(', ') + ' vs ' + col.comp.l);
  t(!offR.length, 'boxes not aligned to the writing field on the right: ' + offR.map((r) => r.cls + '@' + r.r).join(', ') + ' vs ' + col.comp.r);

  // ---- the settings: model, effort, thinking, alerts ----
  await post({
    k: 'prefs',
    value: {
      model: '', effort: 'high', thinking: 'on',
      sound: 'cozy', volume: 0.6, onlyWhenAway: false, soundOnAsk: true, toast: true,
    },
  });
  // The list is exactly what the CLI says, in the order it says it — minus the
  // recommended one ('default'), which is no longer shown: you always pick the
  // model by hand.
  await post({
    k: 'models',
    items: [
      {
        value: 'default', label: 'Default (recommended)',
        description: 'Opus 5 · Best for everyday, complex tasks',
        resolved: 'claude-opus-5[1m]',
        efforts: ['low', 'medium', 'high', 'xhigh', 'max'], adaptive: true, recommended: true,
      },
      { value: 'opus', label: 'Opus', description: 'The smartest.', resolved: 'claude-opus-5', efforts: ['low', 'medium', 'high'], adaptive: true, recommended: false },
      { value: 'sonnet', label: 'Sonnet', description: 'The balanced one.', resolved: 'claude-sonnet-4-5', efforts: ['low', 'medium', 'high'], adaptive: true, recommended: false },
      { value: 'haiku', label: 'Haiku', description: 'The fastest.', resolved: 'claude-haiku-4-5', efforts: [], adaptive: false, recommended: false },
    ],
  });
  await page.click('#btnCfg');
  await page.waitForTimeout(140);
  t(await page.isVisible('#cfg'), 'the settings panel does not open');
  // One card per real model. The recommended one ('default') is not shown: it was
  // the "automatic" choice, and now you pick the model yourself.
  const modelCards = await page.locator('#cfgModelList .model-card').count();
  t(modelCards === 3, 'the model cards do not arrive: ' + modelCards);
  t(
    !(await page.locator('#cfgModelList .model-card .mc-name').allTextContents()).includes('Automatic'),
    'the "Automatic" card is still there: the model is picked by hand'
  );
  // Click the Opus card (the first one, now that the recommended one is gone)
  await page.locator('#cfgModelList .model-card:nth-child(1)').click();
  const sm = await lastSent();
  t(sm?.cmd === 'setPrefs' && sm.value?.model === 'opus', 'the chosen model does not arrive: ' + JSON.stringify(sm));
  await page.waitForTimeout(80);
  // Effort follows the model, and only real levels: no "Auto" among them — there is
  // no such level in the engine, and a button claiming one was a promise nothing kept.
  const effortBtns = await page.locator('#cfgEffort .seg-btn').allTextContents();
  t(effortBtns.length === 3, 'the effort levels do not follow the model: ' + effortBtns.join(', '));
  t(
    !effortBtns.some((b) => /auto|default|predefinito/i.test(b)),
    'there is still a non-level among the effort buttons: ' + effortBtns.join(', ')
  );
  // The Opus card must show the description in the card itself
  const opusDesc = await page.locator('#cfgModelList .model-card:nth-child(1) .mc-desc').textContent();
  t(opusDesc === 'The smartest.', 'the chosen model does not describe itself: ' + opusDesc);
  // "Opus" on its own does not say which one: the number comes from the resolved model.
  const opusName = await page.locator('#cfgModelList .model-card:nth-child(1) .mc-name').textContent();
  t(opusName === 'Opus 5', 'the model name does not carry its version: ' + opusName);
  const haikuName = await page.locator('#cfgModelList .model-card:nth-child(3) .mc-name').textContent();
  t(haikuName === 'Haiku 4.5', 'the Haiku version does not arrive: ' + haikuName);
  // Each family gets its own effect: Opus, Sonnet and Haiku have different classes.
  t(
    (await page.locator('#cfgModelList .model-card.fam-opus.on').count()) === 1,
    'Opus does not get its family effect'
  );
  t(
    (await page.locator('#cfgModelList .model-card.fam-sonnet').count()) === 1,
    'Sonnet does not get its family effect'
  );
  // Thinking: click Off (the second button; the first child is the slider)
  await page.locator('#cfgThink .seg-btn').nth(1).click();
  const st = await lastSent();
  t(st?.cmd === 'setPrefs' && st.value?.thinking === 'off', 'thinking does not turn off: ' + JSON.stringify(st));

  // ---- from "very thorough" up, thinking is not optional ----
  //
  // Not our rule: the API refuses the request outright — "output_config.effort
  // 'xhigh' is not supported when thinking is disabled on this model. Use effort
  // 'high' or below, or enable thinking." So raising the effort turns thinking on
  // (the extension does that, and it lands here as a new prefs), and while you are
  // up there Off has to be out of reach instead of taking a click that would earn
  // you a 400 on the very next message.
  await post({ k: 'prefs', value: { model: 'default', effort: 'xhigh', thinking: 'on' } });
  await page.waitForTimeout(120);
  const forced = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('#cfgThink .seg-btn')];
    return {
      on: btns.find((b) => b.classList.contains('on'))?.textContent,
      offDisabled: btns[1]?.disabled,
      hint: document.getElementById('cfgThinkHint').textContent,
    };
  });
  t(forced.on === 'On', 'at xhigh the thinking is not on: ' + forced.on);
  t(forced.offDisabled === true, 'at xhigh "Off" is still clickable: it would earn a 400');
  t(/very thorough/i.test(forced.hint), 'the panel does not say who turned thinking on: ' + forced.hint);

  // Back down to a level that does not demand it, and Off is available again.
  await post({ k: 'prefs', value: { effort: 'high' } });
  await page.waitForTimeout(120);
  t(
    (await page.locator('#cfgThink .seg-btn:disabled').count()) === 0,
    'coming back down to "high", thinking is still locked'
  );

  // A model that takes no levels at all: the panel says so instead of showing
  // buttons nobody can press.
  await post({ k: 'prefs', value: { model: 'haiku', effort: '', thinking: 'on' } });
  await page.waitForTimeout(120);
  t(
    (await page.locator('#cfgModelList .model-card.fam-haiku.on').count()) === 1,
    'Haiku does not get its family effect'
  );
  const haikuHint = await page.locator('#cfgEffortHint').textContent();
  t(/nothing to set/i.test(haikuHint), 'with no levels the panel does not explain itself: ' + haikuHint);
  // The sound list is ours, not the operating system's: a button that opens a
  // listbox, so it can unroll and tick the one in force like everything else in
  // this panel. Which means it has to be driven like one.
  await page.click('#cfgSound .sel-btn');
  await page.waitForTimeout(160);
  t(await page.isVisible('#cfgSound .sel-list'), 'the sound list does not open');
  const soundOpts = await page.locator('#cfgSound .sel-opt').count();
  t(soundOpts === 6, 'the sounds are not all there: ' + soundOpts);
  t(
    (await page.locator('#cfgSound .sel-opt.on .opt-check').count()) === 1,
    'the sound in force does not carry its tick'
  );
  await page.locator('#cfgSound .sel-opt').nth(1).click();
  const ssnd = await lastSent();
  t(ssnd?.cmd === 'setPrefs' && ssnd.value?.sound === 'harvest', 'the chosen sound does not arrive: ' + JSON.stringify(ssnd));
  // It leaves in two beats: the option finishes its punch (160ms), then the list
  // plays its own way out (150ms) before it stops existing.
  await page.waitForTimeout(600);
  t(await page.locator('#cfgSound .sel-list').count() === 0, 'the sound list does not close after a choice');
  t(
    (await page.locator('#cfgSound .sel-val').textContent()) === 'Harvest',
    'the button does not show the sound that was chosen'
  );

  // ---- every switch in the panel is a switch, and it moves ----
  // The knob has to be somewhere else when the thing is on than when it is off:
  // that displacement is the whole answer to the click.
  const knob = async () =>
    page.evaluate(() => {
      const box = document.getElementById('cfgAway');
      return getComputedStyle(box, '::before').transform;
    });
  const knobOff = await knob();
  await page.click('#cfgAway');
  const saway = await lastSent();
  t(saway?.cmd === 'setPrefs' && saway.value?.onlyWhenAway === true, 'the switch does not arrive: ' + JSON.stringify(saway));
  await page.waitForTimeout(420);
  const knobOn = await knob();
  t(knobOff !== knobOn, 'the switch does not move when it comes on: ' + knobOn);
  t(
    await page.evaluate(() => getComputedStyle(document.getElementById('cfgAway')).appearance === 'none'),
    'the switch is still the browser default'
  );
  // The volume track fills up to the handle: the JS writes where that is.
  t(
    await page.evaluate(() => (document.getElementById('cfgVol').style.getPropertyValue('--v') || '').endsWith('%')),
    'the volume bar does not say how full it is'
  );
  await page.click('#cfgTest');
  await page.screenshot({ path: path.join(outDir, `preview-${surface}-cfg.png`) });
  // a real alert: it comes from the extension and the page plays it without complaining
  await post({ k: 'chime', event: 'done', sound: 'cozy', volume: 0.4 });
  await page.waitForTimeout(120);
  await page.click('#cfgClose');
  // the panel leaves with its animation: wait for it to actually finish
  await page.waitForTimeout(360);
  t(await page.locator('#cfg').isHidden(), 'the settings panel does not close');

  // ---- the inputs: history, "@", "/", selection from the editor ----
  // While Claude works the button says "stop", not "send": to test sending you have
  // to be idle first.
  await post({ k: 'busy', value: false });
  await post({
    k: 'history',
    items: [
      { id: 's1', summary: 'Fix the diff', when: Date.now() - 3600000 },
      { id: 's2', summary: 'First test', when: Date.now() - 86400000 * 2 },
    ],
  });
  await page.waitForTimeout(120);
  t((await page.locator('.hrow').count()) === 2, 'the history does not list the conversations');
  t(
    (await page.locator('.hwhen').first().textContent()) === 'an hour ago',
    'the conversation date is written wrong: ' + (await page.locator('.hwhen').first().textContent())
  );
  await page.locator('.hrow').nth(1).locator('.hopen').click();
  const sh = await lastSent();
  t(sh?.cmd === 'open' && sh.id === 's2', 'the chosen conversation does not reopen: ' + JSON.stringify(sh));
  await page.waitForTimeout(360);
  t(await page.locator('#drawer').isHidden(), 'the drawer stays open after choosing');

  await post({ k: 'commands', items: [{ name: 'commit', description: 'Makes a commit' }, { name: 'test', description: 'Runs the tests' }] });
  await page.click('#input');
  await page.type('#input', '/com');
  await page.waitForTimeout(120);
  t((await page.locator('.menu .mitem').count()) === 1, 'the slash commands do not filter');
  await page.keyboard.press('Enter');
  t((await page.inputValue('#input')) === '/commit ', 'the slash command does not complete: ' + (await page.inputValue('#input')));

  await page.fill('#input', '');
  await page.type('#input', 'look at @ap');
  await page.waitForTimeout(250);
  const sf = await lastSent();
  t(sf?.cmd === 'files' && sf.q === 'ap', 'the file search does not fire: ' + JSON.stringify(sf));
  // Two kinds of row, one insertion. A path arrives bare; a symbol arrives with the
  // name, the kind and the line it sits on — and picking either puts the *path* in
  // the message, because a path is the only thing "@" knows how to expand.
  await post({
    k: 'files',
    items: [
      { path: 'src/app.ts' },
      { path: 'docs/appunti.md' },
      { path: 'src/apply.ts', symbol: 'applyPatch', kind: 'function', line: 42 },
    ],
  });
  await page.waitForTimeout(120);
  t((await page.locator('.menu .mitem').count()) === 3, 'the files do not show up in the menu');
  t((await page.locator('.menu .mitem-sym').count()) === 1, 'the symbol row is not told apart from a file');
  t(
    (await page.locator('.menu .mitem-sym .mkind').textContent()) === 'function',
    'the symbol row does not say what kind of symbol it is'
  );
  t(
    (await page.locator('.menu .mitem-sym .mhint').textContent()) === 'src/apply.ts:42',
    'the symbol row does not say where the symbol lives'
  );
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  t(
    (await page.inputValue('#input')) === 'look at @docs/appunti.md ',
    'the chosen file does not end up in the message: ' + (await page.inputValue('#input'))
  );

  // and picking the symbol hands over the file it was found in
  await page.fill('#input', '');
  await page.type('#input', '@applyP');
  await page.waitForTimeout(250);
  await post({
    k: 'files',
    items: [{ path: 'src/apply.ts', symbol: 'applyPatch', kind: 'function', line: 42 }],
  });
  await page.waitForTimeout(120);
  await page.keyboard.press('Enter');
  t(
    (await page.inputValue('#input')) === '@src/apply.ts ',
    'picking a symbol does not attach its file: ' + (await page.inputValue('#input'))
  );

  await post({ k: 'selection', file: 'src/app.ts', lines: '12-38' });
  await page.waitForTimeout(120);
  t(await page.isVisible('.attach .att'), 'the editor selection does not show among the attachments');
  await page.fill('#input', 'explain this to me');
  await page.locator('#send').click();
  const ss = await lastSent();
  t(
    ss?.cmd === 'send' && ss.withSelection === true && ss.text === 'explain this to me',
    'the selection is not attached to the message: ' + JSON.stringify(ss)
  );
  t(await page.locator('.attach').isHidden(), 'the attachments hang around after sending');

  // and if you remove it, it must not travel any more
  await post({ k: 'selection', file: 'src/app.ts', lines: '12-38' });
  await page.click('.attx');
  await page.fill('#input', 'without');
  await page.locator('#send').click();
  const ss2 = await lastSent();
  t(!ss2?.withSelection, 'the selection travels even after you removed it');

  // ---- the paperclip: files of any kind ----
  // The whole point is that nothing is filtered out. A PDF and a zip are not
  // pictures, and the original extension will not take them: here they attach as
  // paths, and it is the path that goes into the message.
  await page.click('#btnAttach');
  const sp = await lastSent();
  t(sp?.cmd === 'pickFiles', 'the paperclip does not open the picker: ' + JSON.stringify(sp));
  await post({
    k: 'attached',
    items: [
      { kind: 'file', path: 'C:/work/shop/docs/contract.pdf', name: 'contract.pdf', size: 421_000 },
      { kind: 'file', path: 'C:/work/shop/data/sales.xlsx', name: 'sales.xlsx', size: 2_400_000 },
      { kind: 'file', path: 'C:/work/shop/dump.zip', name: 'dump.zip', size: 48_000_000 },
    ],
  });
  await page.waitForTimeout(200);
  const chips = await page.locator('.attach .att-file').count();
  t(chips === 3, 'the attached files do not show up: ' + chips);
  t(
    (await page.locator('.attach .att-file .att-name').first().textContent()) === 'contract.pdf',
    'the chip does not carry the file name'
  );
  t(
    (await page.locator('.attach .att-file .att-size').first().textContent()) === '411 KB',
    'the chip does not say how big the file is: ' +
      (await page.locator('.attach .att-file .att-size').first().textContent())
  );
  // ---- looking at what you attached, and getting back out ----
  //
  // An image had a thumbnail you could click; every other file was a name and a size,
  // so "is this the right contract.pdf?" meant sending it and finding out. The chip is
  // the way in now, whatever the file is.
  await page.click('.attach .att-file');
  const spv = await lastSent();
  t(
    spv?.cmd === 'preview' && /contract\.pdf$/.test(spv.path || ''),
    'clicking an attached file does not ask for its preview: ' + JSON.stringify(spv)
  );
  await post({
    k: 'preview',
    kind: 'text',
    name: 'contract.pdf',
    path: 'C:/work/shop/docs/contract.pdf',
    text: 'FIRST LINE\nsecond line',
    clipped: true,
  });
  await page.waitForTimeout(160);
  const lb = await page.evaluate(() => {
    const o = document.querySelector('.lightbox');
    return {
      open: !!o,
      name: o?.querySelector('.lb-name')?.textContent || '',
      text: o?.querySelector('.lb-pre')?.textContent || '',
      clipped: !!o?.querySelector('.lb-clip'),
    };
  });
  t(lb.open, 'the preview of a file does not open');
  t(lb.name === 'contract.pdf', 'the preview does not say which file it is: ' + lb.name);
  t(/FIRST LINE/.test(lb.text), 'the preview shows no contents: ' + lb.text.slice(0, 40));
  t(lb.clipped, 'a preview cut short does not say so');

  // Esc closes the preview and nothing else. It used to do both: the page-wide
  // shortcut is registered before this one, so it read the key first and took it as
  // "stop" — you shut a preview and killed the turn you were watching.
  await post({ k: 'busy', value: true });
  await page.waitForTimeout(80);
  const mark = await page.evaluate(() => (window.__sent || []).length);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  const after = await page.evaluate((n) => (window.__sent || []).slice(n), mark);
  t((await page.locator('.lightbox').count()) === 0, 'Esc does not close the preview');
  t(
    !after.some((m) => m?.cmd === 'interrupt'),
    'Esc on a preview also stopped the session: ' + JSON.stringify(after)
  );
  // And with nothing open it still stops the turn: the fix must not have cost the
  // shortcut its day job.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  const sesc = await lastSent();
  t(sesc?.cmd === 'interrupt', 'Esc no longer stops a running turn: ' + JSON.stringify(sesc));
  await post({ k: 'busy', value: false });
  await page.waitForTimeout(80);

  // A file with nothing written: attaching one and pressing send has to work — it
  // is a perfectly good message on its own ("look at this").
  await page.fill('#input', '');
  await page.locator('#send').click();
  const sfile = await lastSent();
  t(
    sfile?.cmd === 'send' && sfile.files?.length === 3 && /contract\.pdf$/.test(sfile.files[0].path),
    'the attached files do not travel with the message: ' + JSON.stringify(sfile?.files)
  );
  t(await page.locator('.attach').isHidden(), 'the attachments hang around after sending');
  // An attached image still travels as an image, not as a path: it is the one kind
  // the model looks at directly.
  await post({
    k: 'attached',
    items: [{ kind: 'image', path: 'C:/work/shop/shot.png', name: 'shot.png', size: 900, mime: 'image/png', data: 'iVBORw0KGgo=' }],
  });
  await page.waitForTimeout(160);
  t((await page.locator('.attach .att .thumb').count()) === 1, 'the attached image has no thumbnail');
  await page.fill('#input', 'what is this');
  await page.locator('#send').click();
  const simg = await lastSent();
  t(
    simg?.images?.length === 1 && !simg.files,
    'an attached image should travel as an image: ' + JSON.stringify(simg)
  );

  // click a tool path -> open the file in the editor
  await page.click('.tool[data-tool="Edit"] .arg.link');
  const so = await lastSent();
  t(
    so?.cmd === 'openFile' && /app\.ts$/.test(so.path || ''),
    'the path in the tool does not open the file: ' + JSON.stringify(so)
  );

  // ---- the context alongside: only in the tab ----
  // In the sidebar the context has its own panel; in a tab that doesn't exist, and
  // without this column the wide face would be the only one that can't see it.
  await post({
    k: 'ctx',
    d: {
      project: 'CRM',
      limit: '1M',
      focusHow: 'studio',
      usage: { session: 34, week: 71 },
      usageWait: 'loading…',
      sessionReset: 'in 2h',
      weekReset: 'in 3d',
      branch: 'master',
      dirty: false,
      totalCostUsd: 1.2,
      cards: [
        {
          id: 'aaaa', shortId: 'aaaaaaaa', name: 'This conversation', own: true,
          tabName: 'Studio', preview: '', pct: 22, tokens: '220.0k', cost: '$0.42',
          lastClock: '09:41', lastAgo: 'just now', busy: false, recent: true, focused: true,
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
      ccost: !!rail.querySelector('.ctxcard .ccost'),
      // no overlap: the column sits to the right of the thread
      apart: box.width === 0 || box.left >= log.right - 1,
      // the chat classes must not be repainted by the context stylesheet
      headerBtn: Math.round(document.getElementById('btnNew').getBoundingClientRect().width),
    };
  });

  t(railed.shown === wide, 'the context column is in the wrong place: shown=' + railed.shown);
  t(railed.btn === wide, 'the context button is in the wrong place: btn=' + railed.btn);
  if (wide) {
    t(railed.cards === 1, 'the context column does not draw the sessions: ' + railed.cards);
    t(railed.name === 'This conversation', 'wrong name in the column: ' + railed.name);
    t(railed.ccost === false, 'the dollar figure is back in the context column: it must not be shown');
    t(railed.apart, 'the context column overlaps the thread');
    // and it gets out of the way when you ask
    await page.click('#btnCtx');
    await page.waitForTimeout(80);
    t(
      await page.locator('#rail').isHidden(),
      'the button does not hide the context column'
    );
    await page.click('#btnCtx');
    await page.waitForTimeout(80);
    t(await page.locator('#rail').isVisible(), 'the context column does not come back');
  }
  t(railed.headerBtn > 10 && railed.headerBtn < 60, 'the context stylesheet repainted the chat buttons: ' + railed.headerBtn);

  const ending = 'The first one uses `esbuild`, the second does not:\n\n```json\n{ "build": "esbuild" }\n```\n';
  await post({ k: 'block_start', id: 'b2_0', kind: 'text' });
  for (const t of ['The first one ', 'uses `esbuild`, ', 'the second does not:\n\n```json\n{ "build": "esbuild" }\n```\n'])
    await post({ k: 'delta', id: 'b2_0', kind: 'text', text: t });
  await post({ k: 'block_final', id: 'b2_0', kind: 'text', text: ending });
  await post({
    k: 'turn_end',
    ok: true,
    totalUsd: 0.031,
    turnUsd: 0.014,
    durationMs: 4200,
    tokens: 18234,
    ctx: { input: 412, cacheRead: 16800, cacheCreate: 620, output: 402 },
    models: [{ model: 'claude-opus-5[1m]', input: 412, output: 402, cacheRead: 16800, cacheCreate: 620, costUsd: 0.014, contextWindow: 1000000 }],
    model: 'claude-opus-5[1m]',
    effort: 'high',
  });
  await post({ k: 'busy', value: false });

  await page.waitForTimeout(900);

  // Who actually answered has to be readable at the end of the turn. It is the one
  // promise the automatic mode rests on — a model picked for you and not shown is
  // exactly the thing this must never become — so it is checked here, not by eye.
  const recap = await page.evaluate(() => {
    const chip = document.querySelector('.msg.recap .recap-chip.model');
    if (!chip) return null;
    return { text: chip.textContent, fam: [...chip.classList].find((c) => c.startsWith('fam-')) };
  });
  t(!!recap, 'the end of turn does not say which model answered');
  t(/Opus 5/.test(recap?.text || ''), 'the model chip does not name the model: ' + recap?.text);
  t(/Thorough/.test(recap?.text || ''), 'the model chip does not name the effort: ' + recap?.text);
  t(recap?.fam === 'fam-opus', 'the model chip is not in its family colour: ' + recap?.fam);

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
      // the `hidden` property is not enough: what counts is whether it really shows
      tabBtnHidden: getComputedStyle(document.getElementById('btnTab')).display === 'none',
      composerLeft: Math.round(document.getElementById('composer').getBoundingClientRect().left),
      msgLeft: first ? Math.round(first.getBoundingClientRect().left) : 0,
      // width of the reading column and horizontal overflow
      colWidth: first ? Math.round(first.getBoundingClientRect().width) : 0,
      hOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      // no message should be squashed by the flex when the log is full
      squashed: [...log.querySelectorAll('.msg')]
        .filter((n) => n.scrollHeight > n.clientHeight + 2 && !n.querySelector('.plan, .out, .detail'))
        .map((n) => n.className),
      // The thread and the map of the turn beside it: together they are the column
      // that isn't the context, and it's their sum that has to fill the window.
      logWidth: Math.round(document.querySelector('.logwrap').getBoundingClientRect().width),
      railWidth: Math.round(document.getElementById('rail').getBoundingClientRect().width),
      winWidth: document.documentElement.clientWidth,
    };
  });

  t(errors.length === 0, 'JS errors on the page: ' + errors.join(' | '));
  t(r.tools.length === 11, 'expected 11 top-level tools, found ' + r.tools.length);
  t(r.tools[0]?.name === 'Read' && r.tools[0]?.out === 'RESULT-OF-A', 'Read took the wrong result: ' + r.tools[0]?.out);
  t(r.tools[1]?.name === 'Bash' && r.tools[1]?.out === 'RESULT-OF-B', 'Bash took the wrong result: ' + r.tools[1]?.out);
  t(/\bdone\b/.test(r.tools[0]?.cls || ''), 'Read is not marked as completed');
  t(/\bfail\b/.test(r.tools[2]?.cls || ''), 'Write is not marked as failed');
  t(!r.headOverflow, 'the header overflows: the pills do not fit in the narrow face');
  t(/difference/.test(r.user || ''), 'user message missing');
  t(/both files/.test(r.think || ''), 'reasoning block missing');
  t(r.codeBlocks === 1, 'code block not rendered: ' + r.codeBlocks);
  t(r.inlineCode === 2, 'inline code not rendered: ' + r.inlineCode);
  t(r.carets === 0, 'caret left switched on after the turn ended');
  t(!/stop/.test(r.stopBtn || ''), 'the button is still on "stop"');
  t(!r.hOverflow, 'the page overflows sideways');
  t(!r.squashed.length, 'messages squashed by the flex: ' + r.squashed.join(' | '));
  const joined = r.textMsgs.join('\n');
  t((joined.match(/Opening the two files together\./g) || []).length === 1, 'text duplicated after block_final');

  t(r.isWide === wide, 'the face did not recognise itself');
  t(r.tabBtnHidden === wide, 'the "open as tab" button is in the wrong place');
  if (wide) {
    // The tab uses the whole window: whatever is not thread is the context column,
    // not wasted space.
    t(
      r.logWidth + r.railWidth >= r.winWidth - 2,
      'the tab does not use the width of the window: ' + r.logWidth + '+' + r.railWidth + ' out of ' + r.winWidth
    );
    t(r.railWidth > 200, 'the context column has vanished from the tab: ' + r.railWidth);
    t(r.colWidth <= 880, 'in the tab the lines are too long: ' + r.colWidth + 'px');
    t(
      Math.abs(r.composerLeft - r.msgLeft) <= 1,
      'composer and messages are not aligned in a column: ' + r.composerLeft + ' vs ' + r.msgLeft
    );
  }

  // ---- links you can click, blocks you can copy ----
  // Claude writes addresses bare, in the middle of a numbered list and inside code
  // blocks. Copying one out by hand to paste it in a browser is a tax you pay ten
  // times a day; so is selecting a block of text to copy it.
  const linky =
    'Open https://business.facebook.com/settings/apps?business_id=905021967715680 and then read [the docs](https://docs.claude.com/x) (see https://example.com).\n\n' +
    '```\n1. https://business.facebook.com/settings/apps\n2. Done\n```\n';
  await post({ k: 'block_start', id: 'b3_0', kind: 'text' });
  await post({ k: 'block_final', id: 'b3_0', kind: 'text', text: linky });
  await page.waitForTimeout(160);

  const links = await page.evaluate(() => {
    const last = [...document.querySelectorAll('.msg.assistant')].at(-1);
    return {
      hrefs: [...last.querySelectorAll('a.mdlink')].map((a) => a.getAttribute('href')),
      inCode: last.querySelectorAll('pre code a.mdlink').length,
      copyBtns: last.querySelectorAll('.code-wrap .copybtn').length,
    };
  });
  t(
    links.hrefs.includes('https://business.facebook.com/settings/apps?business_id=905021967715680'),
    'a bare address does not become a link: ' + links.hrefs.join(' | ')
  );
  t(links.hrefs.includes('https://docs.claude.com/x'), 'a markdown link got lost: ' + links.hrefs.join(' | '));
  t(
    links.hrefs.includes('https://example.com'),
    'the full stop and the bracket stayed stuck to the address: ' + links.hrefs.join(' | ')
  );
  t(links.inCode === 1, 'an address inside a code block is not clickable: ' + links.inCode);
  t(links.copyBtns === 1, 'the code block has no copy button: ' + links.copyBtns);

  await page.locator('.msg.assistant').last().locator('a.mdlink').first().click();
  const sl = await lastSent();
  t(
    sl?.cmd === 'openLink' && /business\.facebook\.com/.test(sl.url || ''),
    'clicking a link does not ask the extension to open it: ' + JSON.stringify(sl)
  );

  const copyBtn = page.locator('.msg.assistant').last().locator('.copybtn').first();
  await copyBtn.click();
  await page.waitForTimeout(80);
  t(await copyBtn.evaluate((n) => n.classList.contains('ok')), 'the copy button does not confirm');
  const copied = await page.evaluate(() =>
    (window.__sent || []).filter((s) => s.cmd === 'copy').at(-1)
  );
  const clip = await page
    .evaluate(() => navigator.clipboard.readText().catch(() => null))
    .catch(() => null);
  t(
    /business\.facebook\.com/.test(copied?.text || clip || ''),
    'the copied text does not reach anybody: ' + JSON.stringify(copied)
  );

  // ---- errors: whatever the engine sends, said in plain words ----
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
  t(/usage limit/.test(err.title), 'the error is not turned into a readable sentence: ' + err.title);
  t(!/at send/.test(err.title + err.hint), 'the technical stack ended up in the error title');
  t(/rate_limit_error/.test(err.raw), 'the engine\u2019s real message is no longer reachable');

  // a turn you stopped yourself is not a fault: same box, different tone
  await post({ k: 'error', message: 'Turn interrupted.' });
  await page.waitForTimeout(120);
  t(await page.isVisible('.err.calm'), 'an interrupted turn is shown as a red error');

  // ---- the shortcuts ----
  await page.click('#input');
  await post({ k: 'busy', value: true });
  await page.waitForTimeout(120); // Esc only stops if the page already knows it is busy
  // and while it waits you should see both movements of the wait
  const waiting = await page.evaluate(() => {
    const ring = document.querySelector('.pulse .thinking-ring');
    return {
      ring: !!ring,
      halo: !!document.querySelector('.pulse .thinking-halo'),
      spinning: ring ? getComputedStyle(ring).animationName : '',
    };
  });
  t(waiting.ring && waiting.halo, 'the wait is missing a piece: halo=' + waiting.halo + ' ring=' + waiting.ring);
  t(waiting.spinning === 'cs-spin', 'the waiting ring does not spin: ' + waiting.spinning);
  await page.keyboard.press('Escape');
  const sEsc = await lastSent();
  t(sEsc?.cmd === 'interrupt', 'Esc does not stop the turn: ' + JSON.stringify(sEsc));
  await post({ k: 'busy', value: false });

  await page.keyboard.press('Alt+n');
  const sAlt = await lastSent();
  // A new session opens in a tab of its own: the one you're in keeps working, and
  // whatever is running in it is not interrupted.
  t(sAlt?.cmd === 'newTab', 'Alt+N does not open a new session in a new tab: ' + JSON.stringify(sAlt));

  // …and the same keystroke as a Mac reports it. Option is a compose key over
  // there: Option+N arrives with key "˜", Option+M with "µ", Option+C with "ç".
  // Anything reading `e.key` sees a tilde and does nothing, which is exactly how
  // every one of these shortcuts came to be dead on macOS. Only `e.code` survives
  // it, so that is what gets tested — with the real characters a Mac sends.
  for (const [ch, code, cmd] of [
    ['˜', 'KeyN', 'newTab'],
    ['µ', 'KeyM', 'setMode'],
  ]) {
    // Empty the outbox first. Alt+N above already sent a "newTab", so a handler
    // that did nothing at all would leave that one sitting there and the check
    // would pass on the previous test's result.
    await page.evaluate(() => (window.__sent = []));
    await page.evaluate(
      ([key, code]) =>
        document.dispatchEvent(
          new KeyboardEvent('keydown', { key, code, altKey: true, bubbles: true, cancelable: true })
        ),
      [ch, code]
    );
    const sMac = await lastSent();
    t(sMac?.cmd === cmd, `Option+${code.slice(3)} is dead on macOS (key "${ch}"): ` + JSON.stringify(sMac));
  }
  // Option+M really did cycle the mode: put it back where the rest of the run
  // expects to find it, or the screenshots below show a header nobody asked for.
  await post({ k: 'mode', value: 'bypassPermissions' });

  // the up arrow fishes back the last message sent ("what is this", just above)
  await page.fill('#input', '');
  await page.keyboard.press('ArrowUp');
  t(
    (await page.inputValue('#input')) === 'what is this',
    'the up arrow does not fish back the last message: ' + (await page.inputValue('#input'))
  );
  await page.fill('#input', '');

  // the screenshots: the tail of the thread (where the errors we just tested are)…
  await page.evaluate(() => (document.getElementById('log').scrollTop = 1e6));
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(outDir, `preview-${surface}.png`), fullPage: true });
  // the log scrolls inside itself: to see the first half too you need a second shot
  await page.evaluate(() => (document.getElementById('log').scrollTop = 0));
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(outDir, `preview-${surface}-top.png`), fullPage: true });

  // ---- the light themes ----
  //
  // This panel was drawn on a dark surface, where "full contrast" means white: white
  // text, white borders at 14%, a white wash at 4% for a hover. On a light theme
  // every one of those is the colour of the paper — which is to say, not there. The
  // neutral is one token now (--ink), and this checks the flip actually lands rather
  // than that the stylesheet claims to do it. Contrast is measured on what the
  // browser computed, composited over what is really behind it.
  await page.evaluate(() => {
    document.body.classList.add('vscode-light');
    const s = document.documentElement.style;
    // the values VS Code injects with a light theme
    s.setProperty('--vscode-foreground', '#3b3b3b');
    s.setProperty('--vscode-editor-background', '#ffffff');
    s.setProperty('--vscode-sideBar-background', '#f8f8f8');
    s.setProperty('--vscode-editorWidget-background', '#f3f3f3');
  });
  await page.waitForTimeout(150);
  const light = await page.evaluate(() => {
    const rgba = (v) => {
      const m = String(v).match(/[\d.]+/g) || [];
      return { r: +m[0] || 0, g: +m[1] || 0, b: +m[2] || 0, a: m[3] === undefined ? 1 : +m[3] };
    };
    // what you actually see when a colour with alpha sits on top of another
    const over = (fg, bg) => ({
      r: fg.r * fg.a + bg.r * (1 - fg.a),
      g: fg.g * fg.a + bg.g * (1 - fg.a),
      b: fg.b * fg.a + bg.b * (1 - fg.a),
      a: 1,
    });
    const lum = (c) => {
      const f = (v) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const ratio = (a, b) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    // the real backdrop of the panel, whatever the theme made it
    const paper = rgba(getComputedStyle(document.body).backgroundColor);
    const at = (sel, prop) => {
      const n = document.querySelector(sel);
      if (!n) return null;
      return ratio(over(rgba(getComputedStyle(n)[prop]), paper), paper);
    };
    return {
      ink: getComputedStyle(document.body).getPropertyValue('--ink').trim(),
      // text has to be readable…
      userText: at('.msg.user .utext', 'color'),
      mode: at('.modeseg-btn', 'color'),
      mapName: at('.tm .tm-name', 'color'),
      queue: at('.qhead', 'color'),
      // …and the lines that draw the boxes have to be there at all
      iconBorder: at('.iconbtn', 'borderTopColor'),
      // non .slim: quelle il bordo non ce l'hanno per scelta, e' il loro sfondo a dirle
      cardBorder: at('.tool:not(.slim)', 'borderTopColor'),
    };
  });
  t(light.ink !== '#fff', 'the light theme did not turn the ink over: --ink is ' + light.ink);
  t(light.userText > 4.5, 'your own message is unreadable on a light theme: ' + light.userText);
  t(light.mode > 4.5, 'the mode switch is unreadable on a light theme: ' + light.mode);
  t(light.mapName > 4.5, 'the map bands are unreadable on a light theme: ' + light.mapName);
  t(light.queue > 4.5, 'the line that explains the queue is unreadable on a light theme: ' + light.queue);
  t(light.iconBorder > 1.2, 'the header buttons have no edge on a light theme: ' + light.iconBorder);
  t(light.cardBorder > 1.2, 'the cards have no edge on a light theme: ' + light.cardBorder);
  await page.screenshot({ path: path.join(outDir, `preview-${surface}-light.png`), fullPage: true });
  await page.evaluate(() => document.body.classList.remove('vscode-light'));
  await page.waitForTimeout(80);

  // ---- switching conversation: the old thread slides out ----
  // Tested last, because it leaves the chat empty and would ruin the screenshots.
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
      // the ghost sits exactly on top of the thread, not somewhere else on the page
      onLog: gb ? Math.abs(gb.top - lb.top) < 2 && Math.abs(gb.width - lb.width) < 2 : false,
      // and it carries along what you were looking at, not a blank page
      hasKids: ghost ? ghost.querySelectorAll('.msg').length : 0,
      swapping: log.classList.contains('swap-in'),
      // meanwhile the new thread is already in place
      empty: !!log.querySelector('.empty'),
      strayInLog: log.querySelectorAll('.msg').length,
    };
  });
  t(swap.ghost && swap.onLog, 'the old thread does not exit above the log');
  t(swap.hasKids > 0, 'the ghost of the conversation switch is empty');
  t(swap.swapping, 'the new thread does not come in with its animation');
  t(swap.empty && swap.strayInLog === 0, 'after the switch the chat does not restart clean');
  await page.waitForTimeout(500);
  t(
    (await page.locator('.log-ghost').count()) === 0,
    'the ghost of the conversation switch hangs around above the chat'
  );
  t(errors.length === 0, 'JS errors on the page (phase 4): ' + errors.join(' | '));

  await page.close();
}

// ---- the header at every sidebar width ----
//
// The one check the two fixed viewports above cannot make. A sidebar is whatever
// width you dragged it to, and everything in that row has a fixed size except the
// activity pill — so the pill was the only thing that could give, and at 300px it
// gave everything: a dot with no words next to it, which is the same as not being
// there. The breakpoints in chat.css are the widths where the row stops fitting;
// this is what says so. If it fails, the numbers there are the thing to move.
{
  const bad = [];
  for (let w = 260; w <= 560; w += 5) {
    const page = await browser.newPage({ viewport: { width: w, height: 700 }, colorScheme: 'dark' });
    await page.goto(url);
    await page.evaluate(() =>
      window.postMessage({ k: 'hello', cwd: 'C:/x', project: 'x', cliVersion: '1', surface: 'view' }, '*')
    );
    await page.evaluate(() => window.postMessage({ k: 'busy', value: true }, '*'));
    await page.waitForTimeout(140);
    const r = await page.evaluate(() => {
      const top = document.querySelector('.top');
      const pill = document.getElementById('activity');
      const what = document.getElementById('actWhat');
      const time = document.getElementById('actTime');
      return {
        pill: Math.round(pill.getBoundingClientRect().width),
        cut: what.scrollWidth > what.clientWidth + 1,
        time: Math.round(time.getBoundingClientRect().width),
        overflow: top.scrollWidth - top.clientWidth,
      };
    });
    if (r.cut) bad.push(`${w}px: the state is clipped (pill ${r.pill}px)`);
    if (r.time < 20) bad.push(`${w}px: the clock has been squeezed away (${r.time}px)`);
    if (r.overflow > 1) bad.push(`${w}px: the header overflows by ${r.overflow}px`);
    await page.close();
  }
  for (const b of bad.slice(0, 8)) fails.push('[widths] ' + b);
  if (bad.length > 8) fails.push(`[widths] …and ${bad.length - 8} more`);
}

await browser.close();

if (fails.length) {
  console.error('FAILED:\n- ' + fails.join('\n- '));
  process.exit(1);
}
console.log('ui-check ok — panel and tab, screenshots in dist/preview-*.png');
