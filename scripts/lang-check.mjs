// The language switch, and the order of the model cards.
//
// Two things that only show up on a page that is actually running: that flipping to
// Italian rewrites the chrome — the parts declared in the HTML and the parts built
// by hand — and that with four models on a two-column grid the heavyweights land on
// the top row. A screenshot of each language comes out at the end, because "it says
// the right words" and "it still fits" are different questions.
import { chromium } from 'playwright';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const url = pathToFileURL(path.join(root, 'dist', 'preview.html')).href;
const outDir = path.join(root, 'dist');

const MODELS = [
  { value: 'haiku', label: 'Haiku 4.5', description: 'x · Fastest for quick answers', resolved: 'claude-haiku-4-5', efforts: [], adaptive: true, recommended: false },
  { value: 'sonnet', label: 'Sonnet 4.5', description: 'x · Best for everyday, complex tasks', resolved: 'claude-sonnet-4-5', efforts: ['low', 'medium', 'high'], adaptive: true, recommended: false },
  { value: 'fable', label: 'Fable', description: 'x · Efficient for routine tasks', resolved: 'claude-fable-1', efforts: [], adaptive: true, recommended: false },
  { value: 'opus', label: 'Opus (1M context)', description: 'x · Most capable for your hardest and longest-running tasks', resolved: 'claude-opus-5', efforts: ['high', 'max'], adaptive: true, recommended: false },
];

const browser = await chromium.launch();
const fails = [];
const page = await browser.newPage({ viewport: { width: 460, height: 900 }, colorScheme: 'dark' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(url);

const post = (m) => page.evaluate((x) => window.postMessage(x, '*'), m);
const t = (cond, msg) => !cond && fails.push(msg);

await post({ k: 'hello', cwd: 'C:/x/CRM', project: 'CRM', cliVersion: '2.1.79', surface: 'view' });
await post({ k: 'models', items: MODELS });
await post({ k: 'prefs', value: { model: 'opus', effort: '', thinking: 'auto', sound: 'cozy', volume: 0.6, lang: 'en' } });
await page.click('#btnCfg');
await page.waitForTimeout(250);

// ---- the grid: two columns, the heavyweights on the first row ----
const grid = await page.evaluate(() => {
  const list = document.getElementById('cfgModelList');
  const cards = [...list.querySelectorAll('.model-card')];
  return {
    cols: getComputedStyle(list).gridTemplateColumns.split(' ').length,
    order: cards.map((c) => c.querySelector('.mc-name').textContent),
    rows: cards.map((c) => Math.round(c.getBoundingClientRect().top)),
    families: cards.map((c) => [...c.classList].find((x) => x.startsWith('fam-'))),
  };
});
t(grid.cols === 2, 'the model grid is not on two columns: ' + grid.cols);
t(grid.order.length === 4, 'expected four cards, got ' + grid.order.length);
const topRow = grid.rows.filter((y) => y === grid.rows[0]).length;
t(topRow === 2, 'the top row does not hold exactly two cards: ' + topRow);
t(
  grid.families[0] === 'fam-opus' && grid.families[1] === 'fam-fable',
  'Opus and Fable are not the top row: ' + grid.families.join(', ')
);

// ---- Fable must not reuse Opus's spinning ring ----
const effects = await page.evaluate(() => {
  const of = (sel, pseudo) => {
    const el = document.querySelector(sel);
    const s = getComputedStyle(el, pseudo);
    return { name: s.animationName, image: s.backgroundImage.slice(0, 40) };
  };
  document.querySelector('.model-card.fam-fable').classList.add('on');
  document.querySelector('.model-card.fam-opus').classList.add('on');
  return { fable: of('.model-card.fam-fable', '::before'), opus: of('.model-card.fam-opus', '::before') };
});
t(
  effects.opus.name !== effects.fable.name,
  'Fable and Opus still run the same animation: ' + effects.opus.name
);
t(effects.fable.name === 'cs-aurora', 'Fable is not running its aurora: ' + effects.fable.name);
t(/conic/.test(effects.opus.image), 'Opus lost its spinning gradient: ' + effects.opus.image);

// ---- the stop icon has to be bigger than the arrow ----
await post({ k: 'busy', value: true });
await page.waitForTimeout(120);
const stop = await page.evaluate(() => {
  const i = document.querySelector('#send .ico');
  const r = i.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height) };
});
t(stop.w >= 20, 'the stop icon is still small: ' + stop.w + 'px');
await post({ k: 'busy', value: false });

await page.screenshot({ path: path.join(outDir, 'preview-lang-en.png'), fullPage: false });
const en = await page.evaluate(() => ({
  cfg: document.querySelector('.pop-head span').textContent,
  ph: document.getElementById('input').placeholder,
  effort: document.querySelector('#cfgEffort .seg-btn').textContent,
  purpose: document.querySelector('.model-card .mc-desc').textContent,
}));

// ---- flip to Italian ----
await post({ k: 'prefs', value: { lang: 'it' } });
await page.waitForTimeout(250);
const it = await page.evaluate(() => ({
  cfg: document.querySelector('.pop-head span').textContent,
  ph: document.getElementById('input').placeholder,
  effort: document.querySelector('#cfgEffort .seg-btn').textContent,
  purpose: document.querySelector('.model-card .mc-desc').textContent,
  mode: document.querySelector('.modeseg-btn[data-mode="plan"] span').textContent,
  lang: document.documentElement.lang,
  langBtn: document.querySelector('#cfgLang .seg-btn.on')?.textContent,
}));

t(it.cfg === 'Impostazioni', 'the settings heading did not switch: ' + it.cfg);
t(it.cfg !== en.cfg, 'the heading is identical in both languages');
t(/Scrivi a Claude/.test(it.ph), 'the composer placeholder did not switch: ' + it.ph);
t(it.ph !== en.ph, 'the placeholder is identical in both languages');
t(it.mode === 'Piano', 'the header buttons did not switch: ' + it.mode);
t(it.lang === 'it', 'the <html lang> was not updated: ' + it.lang);
t(it.langBtn === 'Italiano', 'the language control does not show the choice: ' + it.langBtn);
t(it.purpose !== en.purpose, 'the model descriptions did not switch: ' + it.purpose);

// The slider has to follow the buttons, which changed width in the other language.
// It arrives on a spring that takes 320ms: measured any earlier than that you are
// measuring the journey, not the destination, and the check fails at random.
await page.waitForTimeout(500);
const slider = await page.evaluate(() => {
  const box = document.getElementById('mode');
  const on = box.querySelector('.modeseg-btn.on');
  const s = box.querySelector('.modeseg-slider');
  return {
    gap: Math.abs(s.getBoundingClientRect().left - on.getBoundingClientRect().left),
    wgap: Math.abs(s.getBoundingClientRect().width - on.getBoundingClientRect().width),
  };
});
t(slider.gap <= 1.5 && slider.wgap <= 1.5, 'the mode slider drifted off its button: ' + JSON.stringify(slider));

await page.screenshot({ path: path.join(outDir, 'preview-lang-it.png'), fullPage: false });

t(!errors.length, 'JS errors on the page: ' + errors.join(' | '));
await browser.close();

if (fails.length) {
  console.error('FAILED:\n- ' + fails.join('\n- '));
  process.exit(1);
}
console.log('lang-check ok — EN/IT switch, 2x2 grid with Opus and Fable on top, distinct effects');
