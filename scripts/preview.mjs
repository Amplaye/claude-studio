// Genera dist/preview.html: la stessa pagina della webview, ma apribile in un
// browser normale. Serve a guardare (e a far guardare a Playwright) la chat senza
// dover ricaricare VSCode a ogni ritocco di CSS.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, 'dist');
const sprite = fs.readFileSync(path.join(root, 'media', 'ionicons.sprite.svg'), 'utf8');

const stub = `<script>
  window.acquireVsCodeApi = () => ({
    postMessage: (m) => { (window.__sent ||= []).push(m); },
    getState: () => ({}), setState: () => {},
  });
</script>`;

const html = fs
  .readFileSync(path.join(root, 'webview', 'chat.html'), 'utf8')
  .replace('<meta http-equiv="Content-Security-Policy" content="{{csp}}" />', stub)
  .replace(/\{\{sprite\}\}/, sprite)
  .replace(/\{\{nonce\}\}/g, 'preview')
  .replace(/\{\{(\w+)Css\}\}/g, (_, k) => `webview/${k}.css`)
  .replace(/\{\{(\w+)Js\}\}/g, (_, k) => `webview/${k}.js`);

fs.writeFileSync(path.join(dist, 'preview.html'), html, 'utf8');
console.log('dist/preview.html');
