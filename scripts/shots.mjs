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

const MODELS = [
  {
    value: 'default',
    label: 'Default',
    description: 'Recommended',
    resolved: 'claude-opus-4-6[1m]',
    efforts: ['low', 'medium', 'high'],
    adaptive: true,
    recommended: true,
  },
  {
    value: 'claude-opus-4-6',
    label: 'Opus (1M context)',
    description: 'Most capable for your hardest and longest-running tasks',
    resolved: 'claude-opus-4-6[1m]',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    adaptive: true,
    recommended: false,
  },
  {
    value: 'claude-fable-1',
    label: 'Fable',
    description: 'Best for everyday, complex tasks',
    resolved: 'claude-fable-1',
    efforts: ['low', 'medium', 'high'],
    adaptive: true,
    recommended: false,
  },
  {
    value: 'claude-sonnet-4-5',
    label: 'Sonnet',
    description: 'Best for everyday, complex tasks',
    resolved: 'claude-sonnet-4-5',
    efforts: ['low', 'medium', 'high'],
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
      lastAgo: '1 hour ago',
      busy: false,
      recent: false,
      focused: false,
    },
  ],
};

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
  await post({ k: 'prefs', value: { model: 'claude-opus-4-6', effort: '', thinking: 'auto', sound: 'cozy', volume: 0.6, onlyWhenAway: false, soundOnAsk: true, toast: true, lang: 'en' } });
  await post({ k: 'mode', value: 'default' });
  await post({ k: 'ctx', d: CTX });
  await beat(900);
  if (upTo === 'empty') return post;

  await post({ k: 'user', text: ASK });
  await post({ k: 'busy', value: true });
  await post({ k: 'session', id: 'aaaaaaaa', model: 'claude-opus-4-6', cwd: 'C:/work/shop' });
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
  await post({ k: 'turn_end', ok: true, costUsd: 0.21, durationMs: 84000, tokens: 170000 });
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

// 5. the settings: one colour and one effect per model
await shot(browser, {
  file: 'modelli.png',
  width: 520,
  height: 760,
  surface: 'view',
  upTo: 'empty',
  then: async (page) => {
    await page.click('#btnCfg');
    await wait(500);
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

// 7. the sidebar, chat and context one under the other
await shot(browser, { file: 'pannello.png', width: 480, height: 900, surface: 'view', upTo: 'permission' });

// ---------- the film ----------
{
  const dir = path.join(root, 'dist', 'video');
  fs.rmSync(dir, { recursive: true, force: true });
  const ctx = await browser.newContext({
    viewport: { width: 1120, height: 720 },
    colorScheme: 'dark',
    recordVideo: { dir, size: { width: 1120, height: 720 } },
  });
  const page = await ctx.newPage();
  await page.goto(chatUrl);
  await page.evaluate(() => window.postMessage({ k: 'hello', cwd: 'C:/work/shop', project: 'shop', cliVersion: '2.1.228', surface: 'panel' }, '*'));
  await wait(900);
  // the question gets typed by hand: the film starts where you start
  await page.click('#input');
  await page.type('#input', ASK, { delay: 34 });
  await wait(600);
  await page.fill('#input', '');
  await act(page, { slow: true });
  await wait(2200);
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
