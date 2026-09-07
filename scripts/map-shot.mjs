// Un turno lungo per davvero, solo per guardare la mappa.
//
// I controlli girano su una quindicina di passi, ed e' con quelli che due versioni
// di questa colonna sono sembrate a posto e sono uscite come un codice a barre a
// duecento. Questo recita un turno della lunghezza che si vede in un pomeriggio di
// lavoro — legge, scrive, lancia i test, sbaglia, chiede — e ne salva lo scatto,
// chiusa e aperta, stretta e larga.
//
//   node scripts/map-shot.mjs        -> dist/map-<faccia>.png, dist/map-<faccia>-open.png
import { chromium } from 'playwright';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const url = pathToFileURL(path.join(root, 'dist', 'preview.html')).href;
const out = path.join(root, 'dist');

const FILES = ['src/store.ts', 'src/view.tsx', 'src/api.ts', 'src/util/fmt.ts', 'package.json'];

const browser = await chromium.launch();

for (const surface of ['view', 'panel']) {
  const page = await browser.newPage({
    viewport: { width: surface === 'panel' ? 1180 : 420, height: 900 },
    colorScheme: 'dark',
    // La colonna e' larga undici pixel: per giudicarla serve guardarla ingrandita.
    deviceScaleFactor: 4,
  });
  await page.goto(url);
  const post = (m) => page.evaluate((x) => window.postMessage(x, '*'), m);
  let n = 0;
  const id = () => 'x' + ++n;

  await post({ k: 'hello', cwd: 'C:/proj', project: 'proj', cliVersion: '2.1.79', surface });
  await post({ k: 'busy', value: true });
  await post({ k: 'user', text: 'Porta il modulo dei pagamenti su decimali interi e sistema i test.', cp: 1 });
  await post({ k: 'turn_start' });

  // Sei giri di "leggo un po', penso, dico qualcosa, tocco un file": e' la forma
  // vera di un turno lungo, quella in cui i tipi si alternano e non si fondono mai.
  for (let round = 0; round < 6; round++) {
    const b = id();
    await post({ k: 'block_final', id: b, kind: 'thinking', text: 'Guardo come e’ fatto adesso.' });
    for (let i = 0; i < 5; i++) {
      const r = id();
      await post({ k: 'tool_start', id: r, name: 'Read', input: { file_path: FILES[i % FILES.length] } });
      await post({ k: 'tool_end', id: r, ok: true, text: 'ok' });
    }
    const say = id();
    await post({ k: 'block_final', id: say, kind: 'text', text: 'Trovato. Ora cambio ' + FILES[round % FILES.length] + '.' });
    const w = id();
    await post({
      k: 'tool_start',
      id: w,
      name: 'Edit',
      input: {
        file_path: FILES[round % FILES.length],
        old_string: 'const total = price * qty;',
        new_string: 'const total = cents(price) * qty;',
      },
    });
    await post({ k: 'tool_end', id: w, ok: true, text: 'The file has been updated successfully.' });
    const sh = id();
    await post({ k: 'tool_start', id: sh, name: 'Bash', input: { command: 'npm test -- payments' } });
    await post({ k: 'tool_end', id: sh, ok: round !== 3, text: round === 3 ? 'FAIL 2 tests' : '12 passing' });
    for (let i = 0; i < 4; i++) {
      const g = id();
      await post({ k: 'tool_start', id: g, name: 'Grep', input: { pattern: 'price \\*' } });
      await post({ k: 'tool_end', id: g, ok: true, text: 'src/api.ts:88' });
    }
  }

  await post({
    k: 'ask',
    id: 'ask_x',
    kind: 'tool',
    tool: 'Bash',
    title: 'Claude vuole lanciare un comando',
    detail: 'npm run migrate',
    canAlways: true,
  });
  await post({ k: 'ask_done', id: 'ask_x', ok: true, label: 'Allowed' });
  await post({ k: 'block_final', id: id(), kind: 'text', text: 'Fatto: sei file su interi, i test passano.' });
  await post({
    k: 'turn_end',
    ok: true,
    totalUsd: 0.42,
    turnUsd: 0.11,
    durationMs: 194000,
    tokens: 138000,
    ctx: { input: 900, cacheRead: 132000, cacheCreate: 4200, output: 1900 },
    models: [],
    model: 'claude-opus-5',
    effort: 'high',
  });
  await post({ k: 'busy', value: false });
  await page.waitForTimeout(700);

  const steps = await page.evaluate(() => ({
    steps: document.querySelectorAll('#log > .msg').length,
    marks: document.querySelectorAll('#tmap .tm').length,
    loud: document.querySelectorAll('#tmap .tm.loud').length,
  }));
  console.log(`${surface}: ${steps.steps} passi -> ${steps.marks} tacche, di cui ${steps.loud} in evidenza`);

  await page.screenshot({ path: path.join(out, `map-${surface}.png`) });
  await page.screenshot({ path: path.join(out, `map-${surface}-rail.png`), clip: { x: 0, y: 0, width: 26, height: 900 } });
  await page.hover('#tmap .tm');
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(out, `map-${surface}-open.png`) });
  await page.close();
}

await browser.close();
