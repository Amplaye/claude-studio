// Build di Claude Studio.
//  1. esbuild: src/extension.ts -> dist/extension.js (cjs, `vscode` esterno).
//     Dentro ci finisce anche l'Agent SDK: sdk.mjs e' ESM ma importa solo moduli
//     nativi di node, quindi esbuild lo converte in CJS senza strascichi. Cosi'
//     l'extension host (CJS) non deve caricare ESM a runtime.
//     NON entra il binario `claude`: si usa la CLI gia' installata sul PC.
//  2. sprite Ionicons con le sole icone elencate in icons.json
//  3. font Ionicons per la barra di stato, dove VSCode accetta solo icone da font
//  4. copia dei file della webview (CSS/JS/HTML veri, non stringhe)
import * as esbuild from 'esbuild';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SVGIcons2SVGFontStream } from 'svgicons2svgfont';
import svg2ttf from 'svg2ttf';
import ttf2woff2 from 'ttf2woff2';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const watch = process.argv.includes('--watch');

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, 'webview'), { recursive: true });
fs.mkdirSync(path.join(root, 'media'), { recursive: true });

const icons = JSON.parse(fs.readFileSync(path.join(root, 'icons.json'), 'utf8'));
const svgDir = path.join(root, 'node_modules', 'ionicons', 'dist', 'svg');
/** Primo codice della zona a uso privato: da qui in poi, uno per icona, in ordine. */
const FIRST_CODE = 0xe001;

// ---- 2. sprite Ionicons -------------------------------------------------
function buildSprite() {
  const names = icons.sprite;
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
  // Lo sprite si nasconde con una CLASSE, mai con style="display:none": nella
  // webview vera gira una CSP senza 'unsafe-inline', che butta via gli attributi
  // style scritti nel markup. Con quelli buttati via lo sprite tornava un blocco
  // alto 150px in cima al documento, e spingeva fuori schermo il campo di
  // scrittura. width/height a zero sono attributi di presentazione (quelli la CSP
  // non li tocca): reggono anche se il foglio non arrivasse.
  const sprite =
    `<svg xmlns="http://www.w3.org/2000/svg" class="sprite" hidden aria-hidden="true" width="0" height="0">` +
    symbols.join('') +
    `</svg>`;
  fs.writeFileSync(path.join(root, 'media', 'ionicons.sprite.svg'), sprite, 'utf8');
  return names.length;
}

// ---- 3. font della barra di stato ---------------------------------------
//
// Nella barra di stato VSCode disegna solo icone che arrivano da un font, quindi
// le Ionicons che servono li' vanno cotte in un .woff2 e dichiarate in
// `contributes.icons`. Si usano le varianti PIENE, non le outline: un glifo di un
// font e' una forma riempita, e un'icona fatta di sole linee sparirebbe.
async function buildBarFont() {
  const names = Object.entries(icons.bar);
  const stream = new SVGIcons2SVGFontStream({
    fontName: 'ionicons-studio',
    fontHeight: 1000,
    normalize: true,
    log: () => {},
  });

  const svgFont = await new Promise((resolve, reject) => {
    let out = '';
    stream.on('data', (c) => (out += c));
    stream.on('end', () => resolve(out));
    stream.on('error', reject);

    names.forEach(([id, icon], i) => {
      const file = path.join(svgDir, icon + '.svg');
      if (!fs.existsSync(file)) throw new Error('icona Ionicons inesistente: ' + icon);
      // Un glifo e' un contorno riempito: se l'SVG disegna con lo stroke, nel font
      // non resta niente. Meglio fermarsi qui che spedire un'icona invisibile.
      const raw = fs.readFileSync(file, 'utf8');
      if (/stroke=/.test(raw) || !/<path/.test(raw)) {
        throw new Error(`${icon}: serve un'icona a forme piene per il font (niente stroke)`);
      }
      const glyph = fs.createReadStream(file);
      glyph.metadata = { unicode: [String.fromCodePoint(FIRST_CODE + i)], name: id };
      stream.write(glyph);
    });
    stream.end();
  });

  // Un glifo senza tracciato e' un quadratino vuoto nella barra di stato, e non lo
  // scopriresti prima di avere l'estensione installata: meglio fermarsi qui.
  for (const [id] of names) {
    const g = svgFont.match(new RegExp(`glyph-name="${id}"[\\s\\S]*?d="([^"]*)"`));
    if (!g || g[1].length < 50) throw new Error(`glifo vuoto nel font della barra: ${id}`);
  }

  const ttf = Buffer.from(svg2ttf(svgFont, { description: 'Ionicons per Claude Studio' }).buffer);
  fs.writeFileSync(path.join(root, 'media', 'ionicons-studio.woff2'), ttf2woff2(ttf));
  return names;
}

/**
 * Il font e il manifest devono dire la stessa cosa. I codici li assegna la build in
 * ordine di icons.json, quindi qui basta controllare che package.json combaci: se
 * qualcuno aggiunge un'icona la build si ferma e dice cosa scrivere, invece di
 * spedire una barra di stato piena di quadratini.
 */
function checkIconContributions(names) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const declared = pkg.contributes?.icons ?? {};
  const wanted = {};
  names.forEach(([id], i) => {
    wanted[id] = {
      description: 'Ionicons ' + icons.bar[id],
      default: {
        fontPath: 'media/ionicons-studio.woff2',
        fontCharacter: '\\' + (FIRST_CODE + i).toString(16).toUpperCase(),
      },
    };
  });
  if (JSON.stringify(declared) !== JSON.stringify(wanted)) {
    throw new Error(
      'package.json > contributes.icons non combacia col font generato. Deve essere:\n' +
        JSON.stringify(wanted, null, 2)
    );
  }
}

/** La versione vera dell'Agent SDK che finisce nel bundle, non l'intervallo scritto
 *  in package.json: e' quella che l'aggiornamento automatico deve confrontare. */
function sdkVersion() {
  try {
    const p = path.join(root, 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'package.json');
    return JSON.parse(fs.readFileSync(p, 'utf8')).version || '';
  } catch {
    return '';
  }
}

// ---- 4. webview ---------------------------------------------------------
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
  //
  // __CS_SOURCE_ROOT e __CS_SDK_VERSION servono all'aggiornamento automatico: da
  // installata, l'estensione non ha modo di sapere da dove e' uscita ne' che SDK
  // si porta dentro, e sono le due cose che deve confrontare per capire se e'
  // rimasta indietro. Si scrivono qui, dove si sanno per certo.
  define: {
    'import.meta.url': '__claudeStudioModuleUrl',
    __CS_SOURCE_ROOT: JSON.stringify(root),
    __CS_SDK_VERSION: JSON.stringify(sdkVersion()),
  },
  banner: {
    js: "const __claudeStudioModuleUrl = require('node:url').pathToFileURL(__filename).href;",
  },
};

/**
 * L'icona dell'estensione e' un PNG committato, non un prodotto di questa build:
 * costa Chromium e cambia quasi mai (`npm run icon`). Qui si controlla solo che ci
 * sia, perche' senza `vsce package` si ferma a meta' con un messaggio oscuro.
 */
function checkIcon() {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (!pkg.icon) return;
  if (!fs.existsSync(path.join(root, pkg.icon))) {
    throw new Error(`manca ${pkg.icon}: rifallo con "npm run icon"`);
  }
}

const n = buildSprite();
const bar = await buildBarFont();
checkIconContributions(bar);
checkIcon();
copyWebview();

const made = `${n} Ionicons nello sprite, ${bar.length} nel font della barra`;

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  fs.watch(path.join(root, 'webview'), () => copyWebview());
  console.log(`[claude-studio] watch attivo — ${made}`);
} else {
  await esbuild.build(options);
  console.log(`[claude-studio] build ok — ${made}`);
}
