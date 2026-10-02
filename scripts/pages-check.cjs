// La storia a pagine: dove si taglia, cosa parte, cosa resta a casa.
//
// Entrando in una chat arriva solo la coda, e il resto a pezzi scorrendo in su
// (src/chat/pages.ts). Tutto quello che conta e' in quattro funzioni pure, e qui si
// provano da sole, senza VS Code ne' Chromium:
//   - una pagina non comincia mai a meta' di qualcosa: nessun risultato lontano dalla
//     sua card, nessun pezzo di sub-agent fuori dalla card che l'ha lanciato, nessun
//     verdetto senza la sua domanda — e una card rimasta senza risultato girerebbe per
//     sempre;
//   - le pagine, una dopo l'altra, ridanno la storia intera, nell'ordine, senza
//     doppioni ne' buchi;
//   - la riga di fine turno di una pagina tagliata a meta' turno conta tutto il turno
//     (`carry`);
//   - i pezzetti dello streaming di un blocco aperto partono come uno solo, e della
//     fila dei messaggi in attesa resta solo chi aspetta ancora;
//   - un risultato enorme parte accorciato, col conto vero delle righe.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.dirname(__dirname);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-pages-'));
const bundle = path.join(tmp, 'pages.cjs');
esbuild.buildSync({
  entryPoints: [path.join(root, 'src', 'chat', 'pages.ts')],
  bundle: true,
  outfile: bundle,
  platform: 'node',
  format: 'cjs',
  logLevel: 'warning',
});
const P = require(bundle);

let bad = 0;
function check(name, ok, detail) {
  if (ok) return;
  bad++;
  console.error('  ✗ ' + name + (detail ? ' — ' + detail : ''));
}

/* ---- una conversazione finta, lunga, con dentro tutto quello che complica ---- */
let n = 0;
const h = [];
const push = (e) => h.push({ n: ++n, e });
const tool = (id, name, input, parent) => push({ k: 'tool_start', id, name, input: input || {}, parent: parent || null });
const end = (id, text) => push({ k: 'tool_end', id, ok: true, text: text || 'ok' });

for (let turn = 0; turn < 12; turn++) {
  push({ k: 'user', text: 'messaggio ' + turn });
  if (turn === 0) push({ k: 'recalled', notes: [] });
  push({ k: 'block_final', id: 'b' + turn + 'a', kind: 'text', text: 'Comincio.' });
  // Un turno lunghissimo: novanta passi, e in mezzo un sub-agent con i suoi.
  const steps = turn === 7 ? 90 : 14;
  for (let s = 0; s < steps; s++) {
    const id = `t${turn}_${s}`;
    if (s === 20 && turn === 7) {
      tool(id, 'Agent', { prompt: 'cerca' });
      for (let k = 0; k < 30; k++) {
        tool(id + '_k' + k, 'Read', { file_path: 'x' + k }, id);
        end(id + '_k' + k);
      }
      end(id, 'fatto');
      continue;
    }
    if (s === 5) {
      push({ k: 'ask', id: 'ask' + turn, kind: 'tool', tool: 'Bash', title: '', detail: '', canAlways: false });
      push({ k: 'ask_done', id: 'ask' + turn, ok: true, label: 'Allowed' });
    }
    tool(id, s % 3 === 0 ? 'Edit' : 'Read', { file_path: 'src/f' + (s % 4) + '.ts', old_string: 'a', new_string: 'b' });
    end(id);
  }
  push({ k: 'block_final', id: 'b' + turn + 'z', kind: 'text', text: 'Fatto.' });
  push({ k: 'turn_end', ok: true, totalUsd: 0, turnUsd: 0, durationMs: 1000, tokens: 1, ctx: {}, models: [], model: 'x', effort: '' });
}
// Un turno in corso alla fine: un blocco che sta ancora scrivendo, e la fila.
push({ k: 'user', text: 'ultimo' });
push({ k: 'queued', id: 'q1', text: 'gia partito' });
push({ k: 'queued', id: 'q2', text: 'ancora in fila' });
push({ k: 'unqueued', id: 'q1', sent: true });
push({ k: 'block_start', id: 'live', kind: 'text' });
for (let i = 0; i < 40; i++) push({ k: 'delta', id: 'live', kind: 'text', text: 'pezzo' + i + ' ' });
push({ k: 'task', id: 'x', description: 'rumore' });

/* ---- 1. i tagli ---- */
const safe = P.cutPoints(h, h.length);
function apertoA(i) {
  const open = new Set();
  for (let j = 0; j < i; j++) {
    const e = h[j].e;
    if (e.k === 'user' || e.k === 'turn_end') open.clear();
    if (e.k === 'tool_start') open.add(e.id);
    if (e.k === 'tool_end') open.delete(e.id);
    if (e.k === 'ask') open.add(e.id);
    if (e.k === 'ask_done') open.delete(e.id);
  }
  return open.size;
}
let tagliSbagliati = 0;
for (let i = 1; i < h.length; i++) {
  if (!safe[i]) continue;
  const e = h[i].e;
  if (e.k === 'user') continue;
  if (apertoA(i) || e.parent || ['tool_end', 'ask_done', 'recalled', 'plan_ready', 'unqueued', 'delta'].includes(e.k)) tagliSbagliati++;
}
check('nessun taglio a meta’ di qualcosa', tagliSbagliati === 0, tagliSbagliati + ' tagli sbagliati');
check('dentro il turno lungo si taglia (fuori dal sub-agent)', [...safe.keys()].filter((i) => safe[i] && h[i] && h[i].e.k === 'tool_start' && /^t7_/.test(h[i].e.id)).length > 10);
const dentroAgent = [...safe.keys()].filter((i) => safe[i] && h[i] && /^t7_20_k/.test(h[i].e.id || ''));
check('mai dentro il sub-agent', dentroAgent.length === 0, dentroAgent.length + ' tagli dentro');

/* ---- 2. le pagine ridanno la storia intera ---- */
const pagine = [];
let fine = h.length;
let giri = 0;
for (;;) {
  const p = P.page(h, fine, fine === h.length, n + 1);
  pagine.push(p);
  if (!p.more || ++giri > 200) break;
  fine = P.seqIndex(h, p.first);
}
check('le pagine finiscono', giri <= 200, giri + ' giri');
const visti = [];
for (const p of pagine.slice().reverse()) visti.push(...p.events);
const attesi = P.pageEvents(h, 0, h.length, true);
// Le pagine vecchie non portano la fila: dal confronto si toglie.
const senzaFila = (l) => l.filter((e) => e.k !== 'queued');
check(
  'tutte le pagine insieme sono la storia intera, in ordine',
  JSON.stringify(senzaFila(visti)) === JSON.stringify(senzaFila(attesi)),
  visti.length + ' contro ' + attesi.length
);
const coda = pagine[0];
check('la coda non e’ tutta la storia', coda.more && coda.events.length < attesi.length / 3, coda.events.length + ' eventi');
check('la coda ha almeno una pagina di eventi', coda.events.length >= Math.min(P.PAGE_EVENTS, attesi.length));
for (const [i, p] of pagine.entries()) {
  const ids = new Set(p.events.filter((e) => e.k === 'tool_start').map((e) => e.id));
  const orfani = p.events.filter((e) => e.k === 'tool_end' && !ids.has(e.id));
  check('pagina ' + i + ': ogni risultato ha la sua card', !orfani.length, orfani.map((e) => e.id).join(','));
  const figli = p.events.filter((e) => e.parent && !ids.has(e.parent));
  check('pagina ' + i + ': ogni pezzo di sub-agent ha la card del suo capo', !figli.length, figli.map((e) => e.id).join(','));
  const domande = new Set(p.events.filter((e) => e.k === 'ask').map((e) => e.id));
  const verdetti = p.events.filter((e) => e.k === 'ask_done' && !domande.has(e.id));
  check('pagina ' + i + ': ogni verdetto ha la sua domanda', !verdetti.length);
}

/* ---- 3. il turno tagliato si porta dietro i suoi conti ---- */
const meta = pagine.find((p) => p.events.length && p.events[0].k !== 'user');
check('almeno una pagina comincia a meta’ turno', !!meta);
if (meta) {
  const i0 = P.seqIndex(h, meta.first);
  let j = i0 - 1;
  while (j > 0 && h[j].e.k !== 'user') j--;
  const prima = h.slice(j, i0).filter((p) => p.e.k === 'tool_start').length;
  check('il carry conta i passi del turno prima del taglio', meta.carry && meta.carry.steps === prima, JSON.stringify(meta.carry) + ' / ' + prima);
  check('il carry conta i file scritti', meta.carry && meta.carry.files.some(([f]) => /src\/f\d\.ts/.test(f)));
}
check('una pagina che comincia da un messaggio non porta carry', pagine.filter((p) => p.events[0] && p.events[0].k === 'user').every((p) => !p.carry));

/* ---- 4. cosa parte ---- */
const deltas = coda.events.filter((e) => e.k === 'delta');
check('i pezzetti del blocco aperto partono come uno solo', deltas.length === 1 && /pezzo0 .*pezzo39/.test(deltas[0].text), deltas.length + ' delta');
const fila = coda.events.filter((e) => e.k === 'queued').map((e) => e.id);
check('della fila resta solo chi aspetta ancora', fila.join() === 'q2', fila.join());
check('nessun unqueued parte', !coda.events.some((e) => e.k === 'unqueued'));
check('quello che la pagina non disegna resta a casa', !coda.events.some((e) => e.k === 'task'));
check('le pagine vecchie non portano la fila', pagine.slice(1).every((p) => !p.events.some((e) => e.k === 'queued')));

/* ---- 5. il peso ---- */
const grossi = [];
let g = 0;
for (let i = 0; i < 60; i++) {
  grossi.push({ n: ++g, e: { k: 'user', text: 'leggi' } });
  grossi.push({ n: ++g, e: { k: 'tool_start', id: 'r' + i, name: 'Read', input: {} } });
  grossi.push({ n: ++g, e: { k: 'tool_end', id: 'r' + i, ok: true, text: 'x'.repeat(40000) } });
}
const pg = P.page(grossi, grossi.length, true, g + 1);
check('una pagina di risultati enormi si ferma col peso, non col numero', pg.events.length < 40, pg.events.length + ' eventi');

const lungo = Array.from({ length: 3000 }, (_, i) => 'riga ' + i).join('\n') + 'y'.repeat(60000);
const s = P.slimToolEnd({ k: 'tool_end', id: 'x', ok: true, text: lungo });
check('un risultato enorme parte accorciato', s.text.length <= P.OUT_CHARS && s.text.split('\n').length <= P.OUT_LINES, s.text.length + ' caratteri');
check('col conto vero delle righe', s.lines === 3000 && s.clipped === true, s.lines + ' ' + s.clipped);
const corto = { k: 'tool_end', id: 'y', ok: true, text: 'poco' };
check('un risultato normale parte com’e’', P.slimToolEnd(corto) === corto);

check('seqIndex trova il primo con quel numero', P.seqIndex(h, h[10].n) === 10 && P.seqIndex(h, 0) === 0 && P.seqIndex(h, n + 5) === h.length);

fs.rmSync(tmp, { recursive: true, force: true });
if (bad) {
  console.error(`pages-check: ${bad} problemi`);
  process.exit(1);
}
console.log(`pages-check ok — ${h.length} eventi in ${pagine.length} pagine, la coda ${coda.events.length}, nessun taglio a meta’, i conti del turno, la fila, il peso`);
