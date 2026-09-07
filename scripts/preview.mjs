// Generates dist/preview.html and dist/preview-context.html: the same pages as the
// two webviews, but openable in a normal browser. They are there to look at (and to
// let Playwright look at) the chat and the context panel without having to reload
// VS Code on every CSS tweak.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, 'dist');
const sprite = fs.readFileSync(path.join(root, 'media', 'ionicons.sprite.svg'), 'utf8');

/**
 * Il finto ponte verso VS Code, e — solo con `?office` nell'indirizzo — un
 * ufficio gia' popolato.
 *
 * Serve perche' l'ufficio senza estensione viva dietro e' una stanza vuota, e
 * una stanza vuota non si puo' confrontare con niente. Le cinque conversazioni
 * qui sotto sono le stesse di docs/office-sv.html, cosi' le due rese si
 * guardano a parita' di contenuto invece che a parita' di fortuna.
 *
 * Sta dietro alla query apposta: senza, la pagina parte dalla chat come deve, e
 * office-check continua a controllare che sia cosi'.
 */
const stub = `<script>
  window.acquireVsCodeApi = () => ({
    postMessage: (m) => { (window.__sent ||= []).push(m); },
    getState: () => ({}), setState: () => {},
  });
  if (location.search.includes('office')) addEventListener('load', () => {
    const card = (o) => Object.assign({
      id: 'x', shortId: 'xxxxxxxx', name: 'Una conversazione', own: true,
      tabName: 'Studio', preview: '', pct: 18, tokens: '182.0k', costUsd: 0.4,
      lastClock: '09:41', lastAgo: 'just now',
      busy: false, done: false, recent: false, focused: false,
    }, o);
    // Nell'ordine, e non tutti nello stesso giro: prima la pagina deve sapere
    // che e' una scheda, poi girarsi sulla pianta, e solo allora le arriva la
    // gente. Sparati insieme, la pianta si rimonta sopra le conversazioni
    // appena consegnate e resta un ufficio vuoto.
    postMessage({ k: 'hello', cwd: '/x', project: 'claude-studio', cliVersion: '1', surface: 'panel' }, '*');
    setTimeout(() => postMessage({ k: 'view', value: 'office' }, '*'), 60);
    setTimeout(() => postMessage({ k: 'ctx', d: {
      project: 'claude-studio', limit: '1M', focusHow: 'studio',
      usage: { session: 34, week: 71 }, usageWait: '...', usageAgeSec: 12, usageStale: false,
      sessionReset: 'in 2h 15m', weekReset: 'in 3d 4h',
      branch: 'main', dirty: false, totalCostUsd: 1.2,
      cards: [
        card({ id: 'ufficio-palette', name: 'Ufficio, palette', pct: 40, busy: true, focused: true }),
        card({ id: 'sito-di-susan', name: 'Sito di Susan', pct: 66, done: true }),
        card({ id: 'crm-baliflow', name: 'CRM BaliFlow', pct: 12, recent: true }),
        card({ id: 'vecchia-sessione', name: 'Vecchia sessione', pct: 78 }),
        card({ id: 'release-022', name: 'Release 0.22', pct: 55, recent: true }),
      ],
    } }, '*'), 140);
  });
</script>`;

function build(page, out) {
  const html = fs
    .readFileSync(path.join(root, 'webview', page), 'utf8')
    .replace('<meta http-equiv="Content-Security-Policy" content="{{csp}}" />', stub)
    .replace(/\{\{sprite\}\}/, sprite)
    .replace(/\{\{nonce\}\}/g, 'preview')
    // La mappa dei ritagli ha il trattino nel nome e va prima della regola
    // generica, che dal nome del segnaposto ricava il file e qui sbaglierebbe.
    .replace(/\{\{svRoomJs\}\}/g, 'webview/sv-room.js')
    .replace(/\{\{(\w+)Css\}\}/g, (_, k) => `webview/${k}.css`)
    .replace(/\{\{(\w+)Js\}\}/g, (_, k) => `webview/${k}.js`)
    // Il foglio dei mobili dell'ufficio. Nella webview vera e' un URI di VS Code;
    // qui e' il file. Le persone non hanno un foglio: le disegna npc.js.
    .replace(/\{\{roomPng\}\}/g, 'webview/sv-room.png');
  fs.writeFileSync(path.join(dist, out), html, 'utf8');
  console.log('dist/' + out);
}

// Due pagine, non tre: l'elenco dei passi non ha piu' una pagina sua. Sta sotto
// l'ultima card del pannello del contesto, e si guarda in preview-context.html.
build('chat.html', 'preview.html');
build('context.html', 'preview-context.html');
// L'ufficio non ha piu' una pagina sua: e' l'altra faccia di preview.html, e si
// accende dal bottone nella testata (o da document.body.classList).
