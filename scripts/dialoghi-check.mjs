// Le scene dell'ufficio (webview/dialoghi.js), provate da sole, senza browser.
//
// Quello che a occhio non si vede finche' non succede davanti a qualcuno:
//  - un buco che resta vuoto e finisce in bocca a una persona: «sto leggendo
//    undefined», «{b.mancano} passi», «NaN su 6»;
//  - una battuta troppo lunga per due righe di nuvoletta (la stanza la taglia coi
//    puntini, e una frase tagliata a meta' non fa ridere nessuno);
//  - una scena che non parte mai, perche' chiede un dato che il ritratto non da';
//  - un'occasione che puo' capitare senza nessuno accanto (un aiutante che finisce
//    lontano dal capo, una lettera a chi non c'e') e non ha niente da dire da sola;
//  - le parole col genere: nessuno qui sa se chi e' seduto e' un lui o una lei.
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
await import(pathToFileURL(path.join(root, 'webview', 'dialoghi.js')).href);
const D = globalThis.DIALOGHI;
const fails = [];
const t = (cond, msg) => !cond && fails.push(msg);

/** Due ritratti pieni, come li fa office.js a meta' giornata di lavoro. */
const pieno = (over = {}) => ({
  ruolo: 'capo',
  nome: 'Sito di Susan',
  capo: 'CRM BaliFlow',
  lavoro: 'Riporto gli agenti in ufficio',
  tipo: 'esploratore',
  Tipo: 'Esploratore',
  numero: 3,
  totale: 6,
  fatte: 2,
  mancano: 4,
  aiutanti: 3,
  ctx: 87,
  alCtx: 'all’87%',
  occupato: true,
  finito: true,
  file: 'office.js',
  azione: 'leggo',
  azioneG: 'leggendo',
  azioneP: 'letto',
  comando: 'i test',
  durata: '4m 05s',
  ...over,
});
const stanza = (over = {}) => ({
  progetto: 'claude-studio',
  branch: 'main',
  sporco: true,
  quanti: 4,
  gente: 9,
  ora: '21:40',
  alleOra: 'alle 21:40',
  sonoLe: 'sono le 21:40',
  momento: 'sera',
  giorno: 'lunedì',
  resetSessione: 'in 2h 15m',
  sessione: 82,
  alSessione: 'all’82%',
  settimana: 71,
  alSettimana: 'al 71%',
  fare: 3,
  fatte: 5,
  storte: 1,
  ...over,
});
const extra = { testo: 'Hai finito di contare i file?', nota: 'deploy-venerdi', nome: 'Release 0.22' };

// Le stesse scene in tre momenti diversi della giornata e della settimana, per
// passare anche da quelle che hanno un `se` sull'ora o sul giorno.
const stanze = [
  stanza(),
  stanza({ momento: 'mattina', ora: '9:05', alleOra: 'alle 9:05', sonoLe: 'sono le 9:05', giorno: 'venerdì' }),
  stanza({ momento: 'notte', ora: '1:10', alleOra: 'all’1:10', sonoLe: 'è l’1:10', giorno: 'mercoledì' }),
];

const GENERE = /\b(brav[oa]|benvenut[oa]|pront[oa]|stanc[oa]|content[oa]|sicur[oa]|arrivat[oa]|seduto|seduta|nuov[oa] arrivat[oa])\b/i;
const LUNGA = 50;

// Ogni battuta di ogni scena, riempita coi ritratti pieni: niente buchi, niente
// parole col genere, e dentro le due righe.
let battute = 0;
for (const [tipo, scene] of Object.entries(D.SCENE)) {
  scene.forEach((sc, i) => {
    for (const s of stanze) {
      for (const r of sc.r) {
        t(/^[AB]:/.test(r), `${tipo}#${i}: una battuta senza «A:» o «B:» davanti: ${r}`);
        const testo = D.riempi(r.slice(2), { a: pieno(), b: pieno({ nome: 'CRM BaliFlow', tipo: 'tuttofare', Tipo: 'Tuttofare' }), s, x: extra });
        if (testo == null) {
          fails.push(`${tipo}#${i}: un buco che il ritratto pieno non riempie: ${r}`);
          continue;
        }
        battute++;
        t(!/[{}]|undefined|null|NaN/.test(testo), `${tipo}#${i}: e' rimasto un buco: ${testo}`);
        t(!GENERE.test(testo), `${tipo}#${i}: una parola col genere: ${testo}`);
        t(testo.length <= LUNGA, `${tipo}#${i}: ${testo.length} caratteri, oltre le due righe: ${testo}`);
      }
    }
  });
}

// Ogni tipo trova almeno una scena coi ritratti pieni: un tipo che non parte mai e'
// un'occasione che passa in silenzio.
for (const tipo of Object.keys(D.SCENE)) {
  const ok = stanze.some((s) => D.scena(tipo, pieno(), pieno({ tipo: 'tuttofare', Tipo: 'Tuttofare' }), s, extra));
  t(ok, `il tipo «${tipo}» non recita mai niente, nemmeno coi ritratti pieni`);
}

// Le occasioni che possono capitare con nessuno accanto devono avere qualcosa da
// dire da sole: e senza B, nessuna battuta di B.
const DA_SOLI = [
  'arrivo-passo',
  'arrivo-aiutante',
  'finito-passo',
  'fallito-passo',
  'finito-aiutante',
  'fallito-aiutante',
  'lettera',
  'archivio',
  'turno-iniziato',
  'focus',
  'domanda',
  'contesto-solo',
  'saluto',
  'consumi',
];
for (const tipo of DA_SOLI) {
  for (let k = 0; k < 20; k++) {
    const r = D.scena(tipo, pieno(), null, stanza(), extra);
    t(!!r, `«${tipo}» senza nessuno accanto non ha niente da dire`);
    if (!r) break;
    t(r.every((b) => b.chi === 'a'), `«${tipo}» senza nessuno accanto fa parlare chi non c'e': ${JSON.stringify(r)}`);
  }
}

// Coi ritratti vuoti — appena aperto, niente piano, niente file — nessuna scena
// deve inventarsi i numeri: o recita qualcosa di pulito, o sta zitta.
for (const tipo of Object.keys(D.SCENE)) {
  for (let k = 0; k < 15; k++) {
    const r = D.scena(tipo, { ruolo: 'capo', nome: 'Una conversazione', aiutanti: 0 }, { ruolo: 'capo', nome: 'Altra', aiutanti: 0 }, {}, {});
    if (!r) break;
    for (const b of r) t(!/[{}]|undefined|null|NaN/.test(b.testo), `«${tipo}» coi ritratti vuoti dice: ${b.testo}`);
  }
}

// E le scene non si ripetono a giro stretto: dieci di fila dello stesso tipo, con
// almeno dieci scene buone, sono dieci scene diverse.
const viste = new Set();
for (let k = 0; k < 10; k++) {
  const r = D.scena('vicini', pieno(), pieno(), stanza(), extra);
  viste.add(JSON.stringify(r));
}
t(viste.size === 10, `dieci chiacchiere fra vicini, ma diverse solo ${viste.size}`);

if (fails.length) {
  console.error('dialoghi-check FAIL\n - ' + fails.join('\n - '));
  process.exit(1);
}
console.log(`dialoghi-check ok — ${Object.keys(D.SCENE).length} tipi, ${battute} battute riempite, nessun buco, nessun genere, tutte in due righe`);
