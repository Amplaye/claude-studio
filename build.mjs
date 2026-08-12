// Build di Claude Studio.
//  1. esbuild: src/extension.ts -> dist/extension.js (cjs, `vscode` esterno).
//     Dentro ci finisce anche l'Agent SDK: sdk.mjs e' ESM ma importa solo moduli
//     nativi di node, quindi esbuild lo converte in CJS senza strascichi. Cosi'
//     l'extension host (CJS) non deve caricare ESM a runtime.
//     NON entra il binario `claude`: si usa la CLI gia' installata sul PC.
//  2. sprite Ionicons con le sole icone elencate in icons.json
//  3. copia dei file della webview (CSS/JS/HTML veri, non stringhe)
import * as esbuild from 'esbuild';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const watch = process.argv.includes('--watch');

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, 'webview'), { recursive: true });
fs.mkdirSync(path.join(root, 'media'), { recursive: true });

// ---- 2. sprite Ionicons -------------------------------------------------
function buildSprite() {
  const names = JSON.parse(fs.readFileSync(path.join(root, 'icons.json'), 'utf8'));
  const svgDir = path.join(root, 'node_modules', 'ionicons', 'dist', 'svg');
  const symbols = [];
  for (const name of names) {
    const file = path.join(svgDir, name + '.svg');
    if (!fs.existsSync(file)) throw new Error('icona Ionicons inesistente: ' + name);
    const raw = fs.readFileSync(file, 'utf8');
    const viewBox = (raw.match(/viewBox="([^"]+)"/) || [, '0 0 512 512'])[1];
    const inner = raw.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
    const id = 'ion-' + name.replace(/-outline$/, '');
    symbols.push(`<symbol id="${id}" viewBox="${viewBox}">${inner}</symbol>`);
  }
  const sprite =
    `<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">` +
    symbols.join('') +
    `</svg>`;
  fs.writeFileSync(path.join(root, 'media', 'ionicons.sprite.svg'), sprite, 'utf8');
  return names.length;
}

// ---- 3. webview ---------------------------------------------------------
function copyWebview() {
  const src = path.join(root, 'webview');
  for (const f of fs.readdirSync(src)) {
    fs.copyFileSync(path.join(src, f), path.join(dist, 'webview', f));
  }
}

const options = {
  entryPoints: [path.join(root, 'src', 'extension.ts')],
  bundle: true,
  outfile: path.join(dist, 'extension.js'),
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['vscode'],
  sourcemap: watch,
  minify: !watch,
  logLevel: 'info',
  // sdk.mjs usa createRequire(import.meta.url): in uscita CJS import.meta non
  // esiste, quindi lo si sostituisce con l'URL del file bundle.
  define: { 'import.meta.url': '__claudeStudioModuleUrl' },
  banner: {
    js: "const __claudeStudioModuleUrl = require('node:url').pathToFileURL(__filename).href;",
  },
};

const n = buildSprite();
copyWebview();

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  fs.watch(path.join(root, 'webview'), () => copyWebview());
  console.log(`[claude-studio] watch attivo — ${n} Ionicons nello sprite`);
} else {
  await esbuild.build(options);
  console.log(`[claude-studio] build ok — ${n} Ionicons nello sprite`);
}
