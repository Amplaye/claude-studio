// Fa recitare alla webview un turno intero — testo in streaming, ragionamento,
// due tool in parallelo che finiscono in ordine invertito — e controlla che ogni
// esito sia finito sotto il tool giusto. E' il bug della terza parte: l'esito
// abbinato per posizione invece che per tool_use_id.
import { chromium } from 'playwright';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const page_url = pathToFileURL(path.join(root, 'dist', 'preview.html')).href;
const shot = process.argv[2] || path.join(root, 'dist', 'preview.png');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 460, height: 900 }, colorScheme: 'dark' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(page_url);

const post = (m) => page.evaluate((x) => window.postMessage(x, '*'), m);

await post({ k: 'hello', cwd: 'C:/Users/Steward/CRM', project: 'CRM', cliVersion: '2.1.79' });
await post({ k: 'session', id: 'abc', model: 'claude-opus-4-6[1m]', cwd: 'C:/Users/Steward/CRM' });
await post({ k: 'busy', value: true });
await post({ k: 'user', text: 'Leggi i due file di configurazione e dimmi che differenza c’è.' });

await post({ k: 'turn_start' });
await post({ k: 'block_start', id: 'b1_0', kind: 'thinking' });
for (const t of ['Devo aprire ', 'tutti e due i file ', 'prima di rispondere.'])
  await post({ k: 'delta', id: 'b1_0', kind: 'thinking', text: t });
await post({ k: 'block_final', id: 'b1_0', kind: 'thinking', text: 'Devo aprire tutti e due i file prima di rispondere.' });

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

await post({ k: 'block_start', id: 'b2_0', kind: 'text' });
for (const t of ['Il primo ', 'usa `esbuild`, ', 'il secondo no:\n\n```json\n{ "build": "esbuild" }\n```\n'])
  await post({ k: 'delta', id: 'b2_0', kind: 'text', text: t });
await post({
  k: 'block_final',
  id: 'b2_0',
  kind: 'text',
  text: 'Il primo usa `esbuild`, il secondo no:\n\n```json\n{ "build": "esbuild" }\n```\n',
});
await post({ k: 'turn_end', ok: true, costUsd: 0.014, durationMs: 4200, tokens: 18234 });
await post({ k: 'busy', value: false });

await page.waitForTimeout(900);

// ---- verifiche ----
const r = await page.evaluate(() => {
  const tools = [...document.querySelectorAll('.tool')].map((t) => ({
    name: t.querySelector('.name')?.textContent,
    arg: t.querySelector('.arg')?.textContent,
    out: t.querySelector('.out')?.textContent,
    cls: t.className,
  }));
  return {
    tools,
    user: document.querySelector('.msg.user')?.textContent,
    model: document.getElementById('modelName')?.textContent,
    think: document.querySelector('.think .body')?.textContent,
    codeBlocks: document.querySelectorAll('.msg.assistant pre code').length,
    inlineCode: document.querySelectorAll('.msg.assistant code').length,
    textMsgs: [...document.querySelectorAll('.msg.assistant')].map((n) => n.textContent),
    carets: document.querySelectorAll('.caret').length,
    stopBtn: document.getElementById('send')?.className,
    html: document.querySelector('.msg.assistant')?.innerHTML.slice(0, 0), // niente dump
  };
});

const fail = [];
const t = (cond, msg) => !cond && fail.push(msg);

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
// nessun doppione: il testo finale non deve comparire due volte
const joined = r.textMsgs.join('\n');
t((joined.match(/Apro i due file insieme\./g) || []).length === 1, 'testo duplicato dopo block_final');

await page.screenshot({ path: shot, fullPage: true });
await browser.close();

if (fail.length) {
  console.error('FALLITO:\n- ' + fail.join('\n- '));
  process.exit(1);
}
console.log('ui-check ok — %d tool, screenshot in %s', r.tools.length, shot);
