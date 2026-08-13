// Claude Studio build.
//  1. esbuild: src/extension.ts -> dist/extension.js (cjs, `vscode` external).
//     The Agent SDK goes in there too: sdk.mjs is ESM but only imports native node
//     modules, so esbuild converts it to CJS with no loose ends. That way the
//     extension host (CJS) does not have to load ESM at runtime.
//     The `claude` binary does NOT go in: we use the CLI already installed on the PC.
//  2. Ionicons sprite with only the icons listed in icons.json
//  3. Ionicons font for the status bar, where VS Code only accepts font icons
//  4. copy of the webview files (real CSS/JS/HTML, not strings)
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
/** First code point of the private use area: from here on, one per icon, in order. */
const FIRST_CODE = 0xe001;

// ---- 2. Ionicons sprite -------------------------------------------------
function buildSprite() {
  const names = icons.sprite;
  const symbols = [];
  for (const name of names) {
    const file = path.join(svgDir, name + '.svg');
    if (!fs.existsSync(file)) throw new Error('Ionicons icon does not exist: ' + name);
    const raw = fs.readFileSync(file, 'utf8');
    const viewBox = (raw.match(/viewBox="([^"]+)"/) || [, '0 0 512 512'])[1];
    const inner = raw.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
    const id = 'ion-' + name.replace(/-outline$/, '');
    symbols.push(`<symbol id="${id}" viewBox="${viewBox}">${inner}</symbol>`);
  }
  // The brand mark is ours, not an Ionicon: it comes from media/logo.svg and keeps
  // its own colours (the gradients are baked in), so it is copied in verbatim
  // rather than being recoloured with currentColor like everything else.
  const logoFile = path.join(root, 'media', 'logo.svg');
  if (fs.existsSync(logoFile)) {
    const raw = fs.readFileSync(logoFile, 'utf8');
    const viewBox = (raw.match(/viewBox="([^"]+)"/) || [, '0 0 512 512'])[1];
    const inner = raw.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
    symbols.push(`<symbol id="ion-studio-logo" viewBox="${viewBox}">${inner}</symbol>`);
  }

  // The sprite hides itself with a CLASS, never with style="display:none": the real
  // webview runs a CSP without 'unsafe-inline', which throws away style attributes
  // written into the markup. With those thrown away the sprite became a 150px-tall
  // block at the top of the document, and pushed the composer off screen.
  // width/height at zero are presentation attributes (the CSP does not touch
  // those): they hold up even if the stylesheet never arrived.
  const sprite =
    `<svg xmlns="http://www.w3.org/2000/svg" class="sprite" hidden aria-hidden="true" width="0" height="0">` +
    symbols.join('') +
    `</svg>`;
  fs.writeFileSync(path.join(root, 'media', 'ionicons.sprite.svg'), sprite, 'utf8');
  return names.length;
}

// ---- 3. status bar font -------------------------------------------------
//
// In the status bar VS Code only draws icons that come from a font, so the Ionicons
// needed there have to be baked into a .woff2 and declared in `contributes.icons`.
// We use the FILLED variants, not the outlines: a font glyph is a filled shape, and
// an icon made of lines alone would vanish.
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
      if (!fs.existsSync(file)) throw new Error('Ionicons icon does not exist: ' + icon);
      // A glyph is a filled outline: if the SVG draws with a stroke, nothing is left
      // in the font. Better to stop here than ship an invisible icon.
      const raw = fs.readFileSync(file, 'utf8');
      if (/stroke=/.test(raw) || !/<path/.test(raw)) {
        throw new Error(`${icon}: the font needs a filled-shape icon (no stroke)`);
      }
      const glyph = fs.createReadStream(file);
      glyph.metadata = { unicode: [String.fromCodePoint(FIRST_CODE + i)], name: id };
      stream.write(glyph);
    });
    stream.end();
  });

  // A glyph with no path is an empty little box in the status bar, and you would not
  // find out before having the extension installed: better to stop here.
  for (const [id] of names) {
    const g = svgFont.match(new RegExp(`glyph-name="${id}"[\\s\\S]*?d="([^"]*)"`));
    if (!g || g[1].length < 50) throw new Error(`empty glyph in the status bar font: ${id}`);
  }

  const ttf = Buffer.from(svg2ttf(svgFont, { description: 'Ionicons for Claude Studio' }).buffer);
  fs.writeFileSync(path.join(root, 'media', 'ionicons-studio.woff2'), ttf2woff2(ttf));
  return names;
}

/**
 * The font and the manifest have to say the same thing. The build assigns the codes
 * in icons.json order, so here it is enough to check that package.json matches: if
 * someone adds an icon the build stops and says what to write, instead of shipping a
 * status bar full of empty boxes.
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
      'package.json > contributes.icons does not match the generated font. It must be:\n' +
        JSON.stringify(wanted, null, 2)
    );
  }
}

/** The real version of the Agent SDK that ends up in the bundle, not the range
 *  written in package.json: that is what the automatic update has to compare. */
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
  // sdk.mjs uses createRequire(import.meta.url): in the CJS output import.meta does
  // not exist, so it gets replaced with the URL of the bundle file.
  //
  // __CS_SOURCE_ROOT and __CS_SDK_VERSION are for the automatic update: once
  // installed, the extension has no way of knowing where it came from nor which SDK
  // it carries, and those are the two things it has to compare to work out whether
  // it has fallen behind. They are written here, where they are known for sure.
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
 * The extension icon is a committed PNG, not a product of this build: it costs a
 * Chromium run and hardly ever changes (`npm run icon`). Here we only check that it
 * is there, because without it `vsce package` stops halfway with an obscure message.
 */
function checkIcon() {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (!pkg.icon) return;
  if (!fs.existsSync(path.join(root, pkg.icon))) {
    throw new Error(`${pkg.icon} is missing: make it again with "npm run icon"`);
  }
}

const n = buildSprite();
const bar = await buildBarFont();
checkIconContributions(bar);
checkIcon();
copyWebview();

const made = `${n} Ionicons in the sprite, ${bar.length} in the status bar font`;

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  fs.watch(path.join(root, 'webview'), () => copyWebview());
  console.log(`[claude-studio] watch on — ${made}`);
} else {
  await esbuild.build(options);
  console.log(`[claude-studio] build ok — ${made}`);
}
