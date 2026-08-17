// The pictures in the README, and the little film that goes with them.
//
// They are taken from the same preview pages Playwright uses for the checks, fed
// with the same events the extension really sends: what you see in the README is
// the interface, not a mock-up of it. Run it after a UI change, so the shop
// window never shows a version that no longer exists:
//
//   node build.mjs && node scripts/preview.mjs && node scripts/shots.mjs
//
// Output: docs/img/*.png and docs/img/demo.mp4 (plus demo.gif if ffmpeg is
// around — the marketplace only shows still images, GitHub plays the video).
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const chatUrl = pathToFileURL(path.join(root, 'dist', 'preview.html')).href;
const ctxUrl = pathToFileURL(path.join(root, 'dist', 'preview-context.html')).href;
const tasksUrl = pathToFileURL(path.join(root, 'dist', 'preview-tasks.html')).href;
const out = path.join(root, 'docs', 'img');
fs.mkdirSync(out, { recursive: true });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- the conversation the pictures are taken from ----------
//
// A real job, small enough to read in one screen: a question with two files, an
// edit, a command to approve, and a recap at the end.

const ASK = 'Add a dark/light switch to the settings page and remember the choice.';

const THINK =
  'The theme lives in two places: the CSS variables and the preferences store. ' +
  'I read both before touching anything.';

const SAY = 'Let me look at how the preferences are saved, then I add the switch.';

const RECAP = `## Done

The switch is in **Settings → Appearance** and the choice survives a restart.

### What changed

| File | What |
| --- | --- |
| \`src/settings.tsx\` | the switch, wired to the store |
| \`src/theme.css\` | \`data-theme\` on the root, two palettes |
| \`src/store.ts\` | \`theme\` saved with the other preferences |

### How it works

- on first run it follows the system theme
- your choice wins from then on, and is written to \`prefs.json\`
- \`prefers-color-scheme\` keeps working for anyone who never touches the switch

\`\`\`ts
const theme = prefs.theme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
document.documentElement.dataset.theme = theme;
\`\`\`

> Tests: \`npm test\` green, 34 passed.`;

// The models the CLI offers today. The pictures have to show the models people
// actually have in the picker — a shop window with last year's names in it reads
// as an extension nobody has touched since last year.
const MODELS = [
  {
    value: 'default',
    label: 'Default',
    description: 'Recommended',
    resolved: 'claude-opus-5[1m]',
    efforts: ['low', 'medium', 'high'],
    adaptive: true,
    recommended: true,
  },
  {
    value: 'claude-opus-5',
    label: 'Opus (1M context)',
    description: 'Most capable for your hardest and longest-running tasks',
    resolved: 'claude-opus-5[1m]',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    adaptive: true,
    recommended: false,
  },
  {
    value: 'claude-fable-5',
    label: 'Fable',
    description: 'The most capable of all, for the very hardest work',
    resolved: 'claude-fable-5',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    adaptive: true,
    recommended: false,
  },
  {
    value: 'claude-sonnet-5',
    label: 'Sonnet',
    description: 'Best for everyday, complex tasks',
    resolved: 'claude-sonnet-5',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    adaptive: true,
    recommended: false,
  },
  {
    value: 'claude-haiku-4-5',
    label: 'Haiku',
    description: 'Fastest for quick answers',
    resolved: 'claude-haiku-4-5',
    efforts: [],
    adaptive: false,
    recommended: false,
  },
];

const CTX = {
  project: 'shop',
  limit: '1M',
  focusHow: 'studio',
  usage: { session: 34, week: 71 },
  usageWait: 'loading…',
  sessionReset: 'in 2h 15m',
  weekReset: 'in 3d 4h',
  branch: 'main',
  dirty: true,
  totalCostUsd: 0,
  cards: [
    {
      id: 'aaaaaaaa-1111-2222-3333-444444444444',
      shortId: 'aaaaaaaa',
      name: 'Dark/light switch in the settings',
      own: true,
      tabName: 'Studio',
      preview: ASK,
      pct: 17,
      tokens: '170.0k',
      costUsd: 0,
      lastClock: '15:39',
      lastAgo: 'just now',
      busy: true,
      done: false,
      recent: true,
      focused: true,
    },
    {
      id: 'bbbbbbbb-5555-6666-7777-888888888888',
      shortId: 'bbbbbbbb',
      name: 'Checkout, VAT rounding',
      own: false,
      tabName: 'shop-2f',
      preview: 'The total is off by one cent',
      pct: 46,
      tokens: '460.0k',
      costUsd: 0,
      lastClock: '14:02',
      lastAgo: '4 min ago',
      busy: false,
      // Ha finito mentre guardavi da un'altra parte: e' quello che dice il
      // segnalino verde sulla carta, ed e' una delle cose da far vedere.
      done: true,
      recent: false,
      focused: false,
    },
  ],
};

/** Lo stesso pannello un attimo prima: l'altra conversazione sta ancora lavorando. */
const CTX_BUSY = {
  ...CTX,
  cards: [
    CTX.cards[0],
    { ...CTX.cards[1], busy: true, done: false, lastAgo: 'just now', pct: 44, tokens: '440.0k' },
  ],
};

/**
 * Gli allegati: la cosa che l'estensione ufficiale non ti lascia fare — e il
 * motivo per cui questa foto esiste. Sei file, sei famiglie diverse, nessuna
 * immagine: un PDF, un foglio di calcolo, un documento, un video, un archivio e
 * un log. Chi guarda la foto deve capire in un secondo che il limite "solo
 * immagini" qui non c'e'.
 */
const ATTACHED = [
  { kind: 'file', path: 'C:/work/shop/docs/brand-guide.pdf', name: 'brand-guide.pdf', size: 2_412_000 },
  { kind: 'file', path: 'C:/work/shop/data/sales-q3.xlsx', name: 'sales-q3.xlsx', size: 486_000 },
  { kind: 'file', path: 'C:/work/shop/docs/contract.docx', name: 'contract.docx', size: 128_000 },
  { kind: 'file', path: 'C:/work/shop/media/walkthrough.mp4', name: 'walkthrough.mp4', size: 41_300_000 },
  { kind: 'file', path: 'C:/work/shop/design/mockups.zip', name: 'mockups.zip', size: 18_900_000 },
  { kind: 'file', path: 'C:/work/shop/logs/build.log', name: 'build.log', size: 91_000 },
];

/** Types a message out one piece at a time, the way it arrives from the engine. */
async function stream(post, id, kind, text, step = 26, pause = 45) {
  await post({ k: 'block_start', id, kind });
  for (let i = 0; i < text.length; i += step) {
    await post({ k: 'delta', id, kind, text: text.slice(i, i + step) });
    await wait(pause);
  }
  await post({ k: 'block_final', id, kind, text });
}

/** The whole turn, from the question to the recap. */
async function act(page, { slow = false, upTo = 'end' } = {}) {
  const post = (m) => page.evaluate((x) => window.postMessage(x, '*'), m);
  const beat = (ms) => wait(slow ? ms : Math.round(ms / 3));

  await post({ k: 'models', items: MODELS });
  await post({ k: 'prefs', value: { model: 'claude-opus-5', effort: 'high', thinking: 'on', sound: 'cozy', volume: 0.6, onlyWhenAway: false, soundOnAsk: true, toast: true, lang: 'en' } });
  await post({ k: 'mode', value: 'default' });
  await post({ k: 'ctx', d: CTX });
  await beat(900);
  if (upTo === 'empty') {
    // The empty screen types itself in, so a fixed pause would photograph it
    // mid-sentence. Wait for the last line to mark itself done — and for the pills
    // that follow it — instead of guessing how long the typing takes.
    await page
      .waitForFunction(
        () => {
          const lines = [...document.querySelectorAll('.empty .typed')];
          const keys = document.querySelector('.empty .keys');
          return lines.length > 0 && lines.every((l) => l.classList.contains('done')) && keys && !keys.classList.contains('waiting');
        },
        { timeout: 15000 }
      )
      .catch(() => {});
    await wait(600); // the pills stagger in after the text is done
    return post;
  }

  await post({ k: 'user', text: ASK });
  await post({ k: 'busy', value: true });
  await post({ k: 'session', id: 'aaaaaaaa', model: 'claude-opus-5', cwd: 'C:/work/shop' });
  await beat(700);

  await post({ k: 'turn_start' });
  await stream(post, 'b0', 'thinking', THINK, slow ? 14 : 40, slow ? 55 : 20);
  if (upTo === 'thinking') return post;
  await beat(400);

  await stream(post, 'b1', 'text', SAY, slow ? 14 : 40, slow ? 55 : 20);
  await beat(500);

  await post({ k: 'tool_start', id: 't1', name: 'Read', input: { file_path: 'C:/work/shop/src/settings.tsx' } });
  await beat(700);
  await post({ k: 'tool_end', id: 't1', ok: true, text: 'export function Settings() {\n  return <Panel>…</Panel>;\n}' });
  await post({ k: 'tool_start', id: 't2', name: 'Read', input: { file_path: 'C:/work/shop/src/store.ts' } });
  await beat(500);
  await post({ k: 'tool_end', id: 't2', ok: true, text: 'export const prefs = load();' });
  if (upTo === 'reading') return post;

  await post({
    k: 'tool_start',
    id: 't3',
    name: 'Edit',
    input: {
      file_path: 'C:/work/shop/src/settings.tsx',
      old_string: '  <Row label="Language">',
      new_string: '  <Row label="Appearance">\n    <Switch value={theme} onChange={setTheme} />\n  </Row>\n  <Row label="Language">',
    },
  });
  await beat(800);
  await post({ k: 'tool_end', id: 't3', ok: true, text: 'File updated' });

  // the permission card: the thing this extension is really for
  await post({
    k: 'ask',
    id: 'p1',
    kind: 'tool',
    tool: 'Bash',
    title: '',
    detail: 'npm test -- --run settings',
    canAlways: true,
  });
  if (upTo === 'permission') return post;
  await beat(1500);
  await page.click('.perm[data-kind="tool"] .btn.ok').catch(() => {});
  await post({ k: 'ask_done', id: 'p1', ok: true, label: 'Allowed' });
  await post({ k: 'tool_start', id: 't4', name: 'Bash', input: { command: 'npm test -- --run settings' } });
  await beat(900);
  await post({ k: 'tool_end', id: 't4', ok: true, text: '✓ 34 passed  (1.２s)' });

  // a question, with the line you write your own answer on
  await post({
    k: 'ask',
    id: 'q1',
    kind: 'question',
    tool: 'AskUserQuestion',
    title: 'How should the switch behave on first run?',
    detail: '',
    canAlways: false,
    questions: [
      {
        question: 'What should it do the first time somebody opens the app?',
        header: 'First run',
        multiSelect: false,
        options: [
          { label: 'Follow the system', description: 'dark if the OS is dark' },
          { label: 'Always light', description: 'the same for everybody' },
          { label: 'Always dark', description: 'the same for everybody' },
        ],
      },
    ],
  });
  if (upTo === 'question') return post;
  await beat(1600);
  await page.click('.perm[data-kind="question"] .opt:nth-child(1)').catch(() => {});
  await beat(500);
  await page.click('.perm[data-kind="question"] .btn.ok').catch(() => {});
  await post({ k: 'ask_done', id: 'q1', ok: true, label: 'Follow the system' });
  await beat(600);

  await stream(post, 'b2', 'text', RECAP, slow ? 26 : 120, slow ? 22 : 6);
  await post({ k: 'turn_end', ok: true, totalUsd: 0.42, turnUsd: 0.21, durationMs: 84000, tokens: 170000, ctx: { input: 1200, cacheRead: 165000, cacheCreate: 2400, output: 1400 }, models: [], model: 'claude-opus-5[1m]', effort: 'high' });
  await post({ k: 'busy', value: false });
  return post;
}

async function shot(browser, { file, width, height, surface, upTo, then }) {
  const page = await browser.newPage({ viewport: { width, height }, colorScheme: 'dark' });
  await page.goto(chatUrl);
  await page.evaluate((s) => window.postMessage({ k: 'hello', cwd: 'C:/work/shop', project: 'shop', cliVersion: '2.1.228', surface: s }, '*'), surface);
  await wait(400);
  const post = await act(page, { upTo });
  if (then) await then(page, post);
  await wait(700);
  await page.screenshot({ path: path.join(out, file) });
  await page.close();
  console.log('docs/img/' + file);
}

const browser = await chromium.launch();

// 1. the empty state: what you meet the first time
await shot(browser, { file: 'inizio.png', width: 480, height: 760, surface: 'view', upTo: 'empty' });

// 2. the whole turn in the full-screen tab, recap included
await shot(browser, { file: 'chat-full.png', width: 1160, height: 900, surface: 'panel' });

// 3. mid-flight: the reasoning with the light going round, and the strip that
//    says what it's doing
await shot(browser, {
  file: 'streaming.png',
  width: 520,
  height: 720,
  surface: 'view',
  upTo: 'reading',
  then: async (page) => {
    await page.evaluate(() => document.querySelector('.think')?.setAttribute('open', ''));
  },
});

// 4. the permission and the question, with the line you write on
await shot(browser, {
  file: 'permessi.png',
  width: 520,
  height: 820,
  surface: 'view',
  upTo: 'question',
  then: async (page) => {
    await page.fill('.perm[data-kind="question"] .own-input', 'Follow the system, but ask me once').catch(() => {});
  },
});

// 5. the settings: one colour and one effect per model, and every choice below
//    them a control of ours — switches that slide, a list that unrolls, a volume
//    bar that fills up to where you put it
await shot(browser, {
  file: 'modelli.png',
  width: 520,
  height: 820,
  surface: 'view',
  upTo: 'empty',
  then: async (page) => {
    await page.click('#btnCfg');
    await wait(700);
    // Two of the three switches on: a panel of switches all in the same position
    // doesn't show that they move.
    await page.click('#cfgAway').catch(() => {});
    await wait(320);
  },
});

// 5b. the sound list open: the one place you can see it's ours and not the
//     operating system's
await shot(browser, {
  file: 'suoni.png',
  width: 520,
  height: 820,
  surface: 'view',
  upTo: 'empty',
  then: async (page) => {
    await page.click('#btnCfg');
    await wait(650);
    await page.click('#cfgSound .sel-btn').catch(() => {});
    await wait(450);
  },
});

// 5c. attachments: the paperclip, and six files, not one of them a picture
await shot(browser, {
  file: 'allegati.png',
  width: 560,
  height: 620,
  surface: 'view',
  upTo: 'empty',
  then: async (page, post) => {
    await post({ k: 'attached', items: ATTACHED });
    await page.click('#input');
    await page.type('#input', 'Read the PDF and the spreadsheet, watch the video, and tell me what does not match.', { delay: 12 });
    await wait(400);
  },
});

// 6. the context panel on its own
{
  const page = await browser.newPage({ viewport: { width: 360, height: 620 }, colorScheme: 'dark' });
  await page.goto(ctxUrl);
  await page.evaluate((d) => window.postMessage({ k: 'data', d }, '*'), CTX);
  await wait(1200);
  await page.screenshot({ path: path.join(out, 'contesto.png') });
  await page.close();
  console.log('docs/img/contesto.png');
}

// 6b. the task list, halfway through a job: two ticked off, one being worked on
{
  const page = await browser.newPage({ viewport: { width: 360, height: 300 }, colorScheme: 'dark' });
  await page.goto(tasksUrl);
  const items = [
    { content: 'Read the invoice and the sheet', status: 'completed' },
    { content: 'Compare the totals', status: 'completed' },
    { content: 'Fix the VAT column', activeForm: 'Fixing the VAT column', status: 'in_progress' },
    { content: 'Write the summary', status: 'pending' },
  ];
  await page.evaluate(
    (d) => window.postMessage({ k: 'tasks', d }, '*'),
    {
      items,
      done: items.filter((i) => i.status === 'completed').length,
      total: items.length,
      active: items.findIndex((i) => i.status === 'in_progress'),
      busy: true,
    }
  );
  await wait(1200);
  await page.screenshot({ path: path.join(out, 'task.png') });
  await page.close();
  console.log('docs/img/task.png');
}

// 7. the sidebar, chat and context one under the other
await shot(browser, { file: 'pannello.png', width: 480, height: 900, surface: 'view', upTo: 'permission' });

// ---------- the film ----------
//
// Twenty seconds, and every single thing this extension does has to be in them,
// one after the other. That's a hard brief: a turn of work alone takes longer than
// that if you let it play at its own pace. So the film isn't a turn — it's a tour.
// Each beat is a real piece of interface, driven by the same events the extension
// really sends, with a line of writing underneath saying what you're looking at.
//
// The captions are put on the page by this script and are not part of the product:
// in twenty seconds nobody works out on their own that the green mark on a card
// means "this one finished while you were somewhere else".
const TOUR = [
  ['Claude Code, where you already work', 'Claude Code, dove già lavori'],
  ['You see it thinking — and what it is doing', 'Lo vedi ragionare — e cosa sta facendo'],
  ['Every edit is a diff you open when you want', 'Ogni modifica è un diff, lo apri quando vuoi'],
  ['Permissions: one click, no terminal', 'Permessi: un clic, senza terminale'],
  ['It asks, and you can answer in your own words', 'Ti chiede, e rispondi con parole tue'],
  ['A recap you can actually read', 'Un riepilogo che si legge davvero'],
  ['Model, effort, thinking — every switch answers back', 'Modello, impegno, ragionamento — ogni switch risponde'],
  ['PDF, Excel, Word, video, zip, logs — any file at all', 'PDF, Excel, Word, video, zip, log — qualunque file'],
  ['Every conversation in sight — and which one finished', 'Tutte le conversazioni — e quale ha finito'],
];

/**
 * The strip of writing at the bottom of the film.
 *
 * It has to clear the composer, and the composer is not always the same height:
 * the moment six attachments arrive it grows a tray two rows tall, and a caption
 * pinned to a fixed offset lands straight on top of the very chips it is pointing
 * at. So the offset isn't fixed — it's measured from the composer, every time.
 */
async function caption(page, text) {
  await page.evaluate((s) => {
    const dock = document.getElementById('composer');
    const clear = (dock ? dock.getBoundingClientRect().height : 60) + 20;
    let box = document.getElementById('cs-cap');
    if (!box) {
      const st = document.createElement('style');
      st.textContent = `
        /* Above the writing field, not on top of it: the last thing a film about
           a chat should hide is the line you type into — or what you attached to it. */
        #cs-cap {
          position: fixed; left: 50%; bottom: 92px; transform: translateX(-50%);
          z-index: 999; padding: 9px 18px; border-radius: 999px;
          background: rgba(20,16,14,.92); color: #fff;
          border: 1px solid rgba(217,119,87,.55);
          box-shadow: 0 18px 40px -18px #000, 0 0 30px -12px rgba(217,119,87,.6);
          font: 600 15px/1.2 var(--sans); letter-spacing: .01em; white-space: nowrap;
          opacity: 0; transition: opacity .28s ease, transform .28s ease;
        }
        #cs-cap.on { opacity: 1; transform: translateX(-50%) translateY(-2px); }`;
      document.head.appendChild(st);
      box = document.createElement('div');
      box.id = 'cs-cap';
      document.body.appendChild(box);
    }
    box.style.bottom = clear + 'px';
    if (!s) {
      box.classList.remove('on');
      return;
    }
    box.classList.remove('on');
    setTimeout(() => {
      box.textContent = s;
      box.classList.add('on');
    }, 120);
  }, text);
}

{
  const dir = path.join(root, 'dist', 'video');
  fs.rmSync(dir, { recursive: true, force: true });
  const ctx = await browser.newContext({
    viewport: { width: 1120, height: 720 },
    colorScheme: 'dark',
    recordVideo: { dir, size: { width: 1120, height: 720 } },
  });
  const page = await ctx.newPage();
  const post = (m) => page.evaluate((x) => window.postMessage(x, '*'), m);
  const cap = (i) => caption(page, TOUR[i][0]);
  const started = Date.now();

  await page.goto(chatUrl);
  await post({ k: 'hello', cwd: 'C:/work/shop', project: 'shop', cliVersion: '2.1.228', surface: 'panel' });
  await post({ k: 'models', items: MODELS });
  await post({ k: 'prefs', value: { model: 'claude-opus-5', effort: 'high', thinking: 'on', sound: 'cozy', volume: 0.6, onlyWhenAway: false, soundOnAsk: true, toast: true, lang: 'en' } });
  await post({ k: 'mode', value: 'default' });
  // The film opens with the other conversation still working: the green mark has
  // to *arrive*, at the end, or nobody reads it as "this one has just finished" —
  // they read it as a decoration that was always there.
  await post({ k: 'ctx', d: CTX_BUSY });
  await wait(500);

  // ---- 1. you write, it starts (0.0 → 2.6) ----
  await cap(0);
  await page.click('#input');
  await page.type('#input', ASK, { delay: 16 });
  await wait(280);
  await page.fill('#input', '');
  await post({ k: 'user', text: ASK });
  await post({ k: 'busy', value: true });
  await post({ k: 'session', id: 'aaaaaaaa', model: 'claude-opus-5', cwd: 'C:/work/shop' });
  await post({ k: 'turn_start' });

  // ---- 2. the reasoning, and the pill in the header (2.6 → 5.4) ----
  await cap(1);
  await stream(post, 'b0', 'thinking', THINK, 26, 16);
  await stream(post, 'b1', 'text', SAY, 26, 14);
  await post({ k: 'tool_start', id: 't1', name: 'Read', input: { file_path: 'C:/work/shop/src/settings.tsx' } });
  await wait(320);
  await post({ k: 'tool_end', id: 't1', ok: true, text: 'export function Settings() {\n  return <Panel>…</Panel>;\n}' });
  await post({ k: 'tool_start', id: 't2', name: 'Read', input: { file_path: 'C:/work/shop/src/store.ts' } });
  await wait(260);
  await post({ k: 'tool_end', id: 't2', ok: true, text: 'export const prefs = load();' });

  // ---- 3. the edit, opened (5.4 → 7.6) ----
  await cap(2);
  await post({
    k: 'tool_start',
    id: 't3',
    name: 'Edit',
    input: {
      file_path: 'C:/work/shop/src/settings.tsx',
      old_string: '  <Row label="Language">',
      new_string: '  <Row label="Appearance">\n    <Switch value={theme} onChange={setTheme} />\n  </Row>\n  <Row label="Language">',
    },
  });
  await wait(340);
  await post({ k: 'tool_end', id: 't3', ok: true, text: 'File updated' });
  await wait(240);
  // Nothing opens by itself: here it gets opened, by hand, because that is exactly
  // the point being made. Not on the path — that one is a link to the editor.
  await page.click('.tool[data-tool="Edit"] summary .name').catch(() => {});
  await wait(1000);

  // ---- 4. the permission (7.6 → 10.0) ----
  await cap(3);
  await post({ k: 'ask', id: 'p1', kind: 'tool', tool: 'Bash', title: '', detail: 'npm test -- --run settings', canAlways: true });
  await wait(1500);
  await page.click('.perm[data-kind="tool"] .btn.ok').catch(() => {});
  await post({ k: 'ask_done', id: 'p1', ok: true, label: 'Allowed' });
  await post({ k: 'tool_start', id: 't4', name: 'Bash', input: { command: 'npm test -- --run settings' } });
  await wait(400);
  await post({ k: 'tool_end', id: 't4', ok: true, text: '✓ 34 passed  (1.2s)' });

  // ---- 5. the question, with the line you write on (10.0 → 12.4) ----
  await cap(4);
  await post({
    k: 'ask',
    id: 'q1',
    kind: 'question',
    tool: 'AskUserQuestion',
    title: 'How should the switch behave on first run?',
    detail: '',
    canAlways: false,
    questions: [
      {
        question: 'What should it do the first time somebody opens the app?',
        header: 'First run',
        multiSelect: false,
        options: [
          { label: 'Follow the system', description: 'dark if the OS is dark' },
          { label: 'Always light', description: 'the same for everybody' },
          { label: 'Always dark', description: 'the same for everybody' },
        ],
      },
    ],
  });
  await wait(1100);
  await page.click('.perm[data-kind="question"] .opt:nth-child(1)').catch(() => {});
  await wait(500);
  await page.click('.perm[data-kind="question"] .btn.ok').catch(() => {});
  await post({ k: 'ask_done', id: 'q1', ok: true, label: 'Follow the system' });

  // ---- 6. the recap (12.4 → 14.4) ----
  await cap(5);
  await stream(post, 'b2', 'text', RECAP, 190, 6);
  await post({ k: 'turn_end', ok: true, totalUsd: 0.42, turnUsd: 0.21, durationMs: 84000, tokens: 170000, ctx: { input: 1200, cacheRead: 165000, cacheCreate: 2400, output: 1400 }, models: [], model: 'claude-opus-5[1m]', effort: 'high' });
  await post({ k: 'busy', value: false });
  await wait(700);

  // ---- 7. the settings, one control after another (14.4 → 17.6) ----
  await cap(6);
  await page.click('#btnCfg');
  await wait(750);
  await page.click('#cfgModelList .model-card.fam-sonnet').catch(() => {});
  await wait(420);
  await page.locator('#cfgEffort .seg-btn').nth(3).click().catch(() => {});
  await wait(380);
  await page.locator('#cfgThink .seg-btn').nth(1).click().catch(() => {});
  await wait(340);
  await page.click('#cfgAway').catch(() => {});
  await wait(260);
  await page.click('#cfgToast').catch(() => {});
  await wait(300);
  await page.click('#cfgSound .sel-btn').catch(() => {});
  await wait(520);
  await page.locator('#cfgSound .sel-opt').nth(3).click().catch(() => {});
  await wait(450);
  await page.click('#cfgClose');
  await wait(280);

  // ---- 8. the paperclip (17.6 → 19.6) ----
  // The caption steps out of the way first. It measures the composer to know how
  // far to sit above it, and the composer only reaches its full height once the
  // tray of attachments is in it — so the order is: hide, attach, re-measure,
  // show. Otherwise the strip spends half a second sitting on top of the very
  // files it is announcing.
  await caption(page, '');
  await post({ k: 'attached', items: ATTACHED });
  await wait(450);
  await cap(7);
  await page.click('#input');
  await page.type('#input', 'Read the PDF and the spreadsheet, watch the video.', { delay: 16 });
  await wait(700);

  // ---- 9. the column beside, and which conversation finished ----
  await cap(8);
  await wait(700);
  // and now the other one finishes, on camera
  await post({ k: 'ctx', d: CTX });
  await wait(1900);
  await caption(page, '');
  await wait(400);

  console.log('  film: ' + ((Date.now() - started) / 1000).toFixed(1) + 's');
  await page.close();
  await ctx.close();

  const webm = fs.readdirSync(dir).find((f) => f.endsWith('.webm'));
  if (webm) {
    const src = path.join(dir, webm);
    const mp4 = path.join(out, 'demo.mp4');
    const gif = path.join(out, 'demo.gif');
    const ff = (args) => spawnSync('ffmpeg', args, { stdio: 'ignore', shell: false });
    ff(['-y', '-i', src, '-vf', 'scale=1120:-2,fps=24', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '26', mp4]);
    // The marketplace only shows still images: the GIF is what gives it motion
    // there, so it has to stay small enough to load on a page nobody asked to
    // download a film from.
    ff([
      '-y', '-i', src,
      '-vf',
      'fps=10,scale=640:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=3',
      gif,
    ]);
    for (const f of [mp4, gif]) {
      if (fs.existsSync(f)) console.log('docs/img/' + path.basename(f), (fs.statSync(f).size / 1e6).toFixed(1) + ' MB');
    }
  }
}

await browser.close();
console.log('shots ok');
