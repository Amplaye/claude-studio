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

const stub = `<script>
  window.acquireVsCodeApi = () => ({
    postMessage: (m) => { (window.__sent ||= []).push(m); },
    getState: () => ({}), setState: () => {},
  });
</script>`;

function build(page, out) {
  const html = fs
    .readFileSync(path.join(root, 'webview', page), 'utf8')
    .replace('<meta http-equiv="Content-Security-Policy" content="{{csp}}" />', stub)
    .replace(/\{\{sprite\}\}/, sprite)
    .replace(/\{\{nonce\}\}/g, 'preview')
    .replace(/\{\{(\w+)Css\}\}/g, (_, k) => `webview/${k}.css`)
    .replace(/\{\{(\w+)Js\}\}/g, (_, k) => `webview/${k}.js`);
  fs.writeFileSync(path.join(dist, out), html, 'utf8');
  console.log('dist/' + out);
}

build('chat.html', 'preview.html');
build('context.html', 'preview-context.html');
build('tasks.html', 'preview-tasks.html');
