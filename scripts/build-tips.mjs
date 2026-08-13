// Builds media/tips.json — the "Did you know?" library.
//
// The parts under .tips-work/ are written by hand or by agents, one file per subject
// area. This merges them, throws out anything malformed, and refuses to ship a
// duplicate. It is deliberately strict: a tip is a single sentence that will be read
// by somebody who trusted us enough to install the thing, and a library of a few
// thousand is exactly where a bad one hides.
//
// Run with `npm run tips`. The output is committed, so a normal build never needs it.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const workDir = path.join(root, '.tips-work');
const out = path.join(root, 'media', 'tips.json');

const MIN = 40;
const MAX = 260;
/** Openings that mean the writer ignored the brief: the UI prints the label itself. */
const BANNED_OPENERS = /^(did you know|lo sapevi|fun fact|curiosit|sapevi che)/i;

if (!fs.existsSync(workDir)) {
  console.error('no .tips-work/ directory — nothing to build');
  process.exit(1);
}

const files = fs
  .readdirSync(workDir)
  .filter((f) => f.endsWith('.json'))
  .sort();

if (!files.length) {
  console.error('no part-*.json under .tips-work/');
  process.exit(1);
}

const kept = [];
const seenEn = new Set();
const seenIt = new Set();
const rejected = [];
const perFile = [];

/** Same sentence with different punctuation is the same sentence. */
const norm = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

for (const f of files) {
  const full = path.join(workDir, f);
  let arr;
  try {
    arr = JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (e) {
    console.error(`  ${f}: not valid JSON — ${e.message}`);
    process.exitCode = 1;
    continue;
  }
  if (!Array.isArray(arr)) {
    console.error(`  ${f}: top level is not an array`);
    process.exitCode = 1;
    continue;
  }

  let take = 0;
  for (const item of arr) {
    const bad = (why) => rejected.push(`${f}: ${why} — ${String(item?.en || '').slice(0, 60)}`);
    if (!item || typeof item.en !== 'string' || typeof item.it !== 'string') {
      bad('missing en/it');
      continue;
    }
    const en = item.en.trim();
    const it = item.it.trim();
    if (en.length < MIN || en.length > MAX) {
      bad(`en length ${en.length}`);
      continue;
    }
    if (it.length < MIN || it.length > MAX) {
      bad(`it length ${it.length}`);
      continue;
    }
    if (BANNED_OPENERS.test(en) || BANNED_OPENERS.test(it)) {
      bad('banned opener');
      continue;
    }
    // {alt} is the one placeholder the webview expands — Alt+ on a PC, ⌥ on a Mac.
    // Every other brace is a templating accident that would reach the screen raw.
    if (/[<>{}]|https?:\/\//.test((en + it).split('{alt}').join(''))) {
      bad('markup or url');
      continue;
    }
    // The webview draws these as textContent, so a stray quote is harmless — but a
    // newline would break the one-line layout it is drawn into.
    if (/[\r\n\t]/.test(en + it)) {
      bad('line break');
      continue;
    }
    const ke = norm(en);
    const ki = norm(it);
    if (!ke || seenEn.has(ke)) {
      bad('duplicate en');
      continue;
    }
    if (!ki || seenIt.has(ki)) {
      bad('duplicate it');
      continue;
    }
    seenEn.add(ke);
    seenIt.add(ki);
    kept.push({ en, it, cat: typeof item.cat === 'string' ? item.cat : 'misc' });
    take++;
  }
  perFile.push(`  ${f.padEnd(24)} ${String(take).padStart(4)} kept / ${arr.length}`);
}

fs.writeFileSync(out, JSON.stringify(kept, null, 0) + '\n', 'utf8');

const cats = {};
for (const k of kept) cats[k.cat] = (cats[k.cat] || 0) + 1;
const kb = (fs.statSync(out).size / 1024).toFixed(0);

console.log(perFile.join('\n'));
console.log(`\nmedia/tips.json — ${kept.length} tips, ${Object.keys(cats).length} categories, ${kb} KB`);
if (rejected.length) {
  console.log(`\n${rejected.length} rejected:`);
  for (const r of rejected.slice(0, 25)) console.log('  ' + r);
  if (rejected.length > 25) console.log(`  … and ${rejected.length - 25} more`);
}
