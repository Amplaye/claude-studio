// Checks the slash-command menu.
//
// This exists because of a real bug: the menu cut the list at forty entries, and the
// engine appended the built-in commands after the ones the CLI reports. A project with
// enough skills installed therefore pushed /clear and /rewind off the end — they were
// in the data, absent from the screen, and nothing failed. So the fixture here is
// deliberately larger than that old cap.
import { chromium } from 'playwright';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fails = [];
const t = (cond, msg) => !cond && fails.push(msg);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 520, height: 900 }, colorScheme: 'dark' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(pathToFileURL(path.join(root, 'dist', 'preview.html')).href);

const post = (m) => page.evaluate((x) => window.postMessage(x, '*'), m);
await post({ k: 'hello', cwd: '/tmp/p', project: 'p', cliVersion: '1', surface: 'view' });

const claude = [
  ['clear', 'Start a new conversation with empty context'],
  ['rewind', 'Roll code and conversation back to a checkpoint'],
  ['resume', 'Return to an earlier conversation'],
].map(([name, description]) => ({ name, description, group: 'claude' }));

const SKILLS = 60;
const skills = Array.from({ length: SKILLS }, (_, i) => ({
  name: 'skill-' + String(i + 1).padStart(2, '0'),
  description: 'A skill this project brings along, number ' + (i + 1),
  group: 'skill',
  argumentHint: i === 0 ? '<file>' : undefined,
  aliases: i === 0 ? ['zzalias'] : undefined,
}));

await post({ k: 'commands', items: [...claude, ...skills] });
await page.waitForTimeout(150);
await page.click('#input');
await page.type('#input', '/');
await page.waitForTimeout(400);

const seen = await page.evaluate(() => ({
  cats: [...document.querySelectorAll('.menu-cat')].map((n) => n.textContent),
  rows: [...document.querySelectorAll('.mitem-cmd')].map((n) => n.querySelector('.mlabel').textContent),
  args: [...document.querySelectorAll('.marg')].map((n) => n.textContent),
}));

const total = claude.length + SKILLS;
t(seen.rows.length === total, `the menu drew ${seen.rows.length} of ${total} commands — something is capping the list`);
t(
  seen.rows.some((r) => r.startsWith('/clear')),
  '/clear is not in the menu'
);
t(
  seen.rows.some((r) => r.startsWith('/rewind')),
  '/rewind is not in the menu'
);
t(seen.cats.length === 2, `expected two sections, got ${seen.cats.length}: ${seen.cats.join(' | ')}`);
// The classics are what you reach for most: they must not sit below the skills.
t(/claude/i.test(seen.cats[0] || ''), `the built-in commands are not the first section: ${seen.cats.join(' | ')}`);
t(seen.args.includes('<file>'), 'the argument hint is not shown on the command that takes one');

// An alias has to find its command even though the name shares no letters with it.
await page.fill('.menu-search input', 'zzalias');
await page.waitForTimeout(250);
const found = await page.evaluate(() =>
  [...document.querySelectorAll('.mitem-cmd')]
    .filter((n) => !n.hidden)
    .map((n) => n.querySelector('.mlabel').textContent)
);
t(found.length === 1 && found[0].startsWith('/skill-01'), `searching an alias found ${JSON.stringify(found)}`);

t(errors.length === 0, 'the page raised errors: ' + errors.join(' | '));
await browser.close();

if (fails.length) {
  console.log('FAILED:');
  for (const f of fails) console.log('- ' + f);
  process.exit(1);
}
console.log(`menu-check ok — ${total} commands in two sections, aliases and argument hints`);
