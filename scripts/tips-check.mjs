// Checks the "Did you know?" library and the one line the webview draws from it.
//
// Two halves, because two different things can go wrong. The library itself is data:
// it can hold a duplicate, a stray brace, an entry translated in one language only.
// And the drawing is code: the tip arrives over the wire as {en, it} and has to come
// out in the right language with {alt} turned into the key this keyboard actually has.
import { chromium } from 'playwright';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fails = [];
const t = (cond, msg) => !cond && fails.push(msg);

// ---- the library ---------------------------------------------------------
const file = path.join(root, 'media', 'tips.json');
t(fs.existsSync(file), 'media/tips.json is missing — run `npm run tips`');

let tips = [];
if (fs.existsSync(file)) {
  try {
    tips = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    fails.push('media/tips.json is not valid JSON: ' + e.message);
  }
}

t(Array.isArray(tips), 'media/tips.json is not an array');
// The whole point of the feature is that you keep meeting new ones.
t(tips.length >= 1000, `only ${tips.length} tips — the library is meant to be in the thousands`);

const seen = new Set();
let dupes = 0;
let badLang = 0;
let braces = 0;
let tooLong = 0;
for (const x of tips) {
  if (!x || typeof x.en !== 'string' || typeof x.it !== 'string' || !x.en || !x.it) {
    badLang++;
    continue;
  }
  const k = x.en.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (seen.has(k)) dupes++;
  seen.add(k);
  // {alt} is the only placeholder the webview knows how to expand.
  if (/[<>{}]/.test((x.en + x.it).split('{alt}').join(''))) braces++;
  if (x.en.length > 260 || x.it.length > 260) tooLong++;
}
t(badLang === 0, `${badLang} tips are missing an en or it string`);
t(dupes === 0, `${dupes} duplicate tips`);
t(braces === 0, `${braces} tips carry markup or an unknown {placeholder}`);
t(tooLong === 0, `${tooLong} tips are longer than the line can hold`);

// A library that is all one subject would defeat the point of having thousands.
const cats = new Set(tips.map((x) => x && x.cat).filter(Boolean));
t(cats.size >= 8, `only ${cats.size} categories — the tips should range widely`);

// ---- the drawing ---------------------------------------------------------
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 460, height: 900 }, colorScheme: 'dark' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(pathToFileURL(path.join(root, 'dist', 'preview.html')).href);

const post = (m) => page.evaluate((x) => window.postMessage(x, '*'), m);
const tipText = () => page.evaluate(() => (document.querySelector('.empty p') || {}).textContent || '');

const TIP = { en: 'Reopen them with {alt}H, the English one.', it: 'Riaprile con {alt}H, quella italiana.' };
await post({ k: 'hello', cwd: '/tmp/p', project: 'p', cliVersion: '1', surface: 'view', tip: TIP });
await page.waitForTimeout(500);

const en = await tipText();
t(en.includes('the English one'), 'the tip sent by the extension is not the one drawn: ' + en);
t(!en.includes('{alt}'), 'the {alt} placeholder reached the screen raw: ' + en);
t(/Alt\+H|⌥H/.test(en), 'the shortcut in the tip did not become a real key name: ' + en);

// Switching language redraws the same fact, it does not change the subject.
await page.evaluate(() => window.I18N.set('it'));
await page.waitForTimeout(400);
const it = await tipText();
t(it.includes('quella italiana'), 'switching to Italian did not redraw the tip in Italian: ' + it);
t(!it.includes('{alt}'), 'the {alt} placeholder survived the language switch: ' + it);

t(errors.length === 0, 'the page raised errors: ' + errors.join(' | '));
await browser.close();

if (fails.length) {
  console.log('FAILED:');
  for (const f of fails) console.log('- ' + f);
  process.exit(1);
}
console.log(`tips-check ok — ${tips.length} tips, ${cats.size} categories, both languages drawn`);
