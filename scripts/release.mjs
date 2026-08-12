#!/usr/bin/env node
// Rilascio in un comando: bump versione → verify → package → Marketplace + Open VSX → git tag.
//
//   npm run release                 patch (0.5.0 → 0.5.1)
//   npm run release -- minor        0.5.0 → 0.6.0
//   npm run release -- major        0.5.0 → 1.0.0
//   npm run release -- 1.2.3        versione esplicita
//   npm run release -- --same       ripubblica la versione corrente senza bump
//
// Flag:
//   --skip-verify        salta typecheck/ui-check/data-check/host-check
//   --only=ovsx          pubblica solo su Open VSX
//   --only=marketplace   pubblica solo sul VS Code Marketplace
//   --no-git             non committa e non tagga
//   --dry-run            fa tutto tranne pubblicare
//
// Nessun argomento viene passato attraverso una shell e il token Open VSX viaggia
// solo via variabile d'ambiente (non compare nella lista processi).
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (p) => args.find((a) => a.startsWith(p))?.slice(p.length);

const only = val('--only=');
const dryRun = has('--dry-run');
const skipVerify = has('--skip-verify');
const noGit = has('--no-git');
const win = process.platform === 'win32';

const pkgPath = 'package.json';
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const oldVersion = pkg.version;

// ---------- helper di esecuzione (mai shell, mai interpolazione)
const exec = (cmd, cmdArgs, opts = {}) =>
  spawnSync(cmd, cmdArgs, { stdio: 'inherit', shell: false, ...opts });
const execOut = (cmd, cmdArgs) =>
  spawnSync(cmd, cmdArgs, { encoding: 'utf8', shell: false }).stdout ?? '';
const must = (cmd, cmdArgs, opts) => {
  const r = exec(cmd, cmdArgs, opts);
  if (r.status !== 0) {
    console.error(`\n✗ fallito: ${cmd} ${cmdArgs.join(' ')}`);
    process.exit(r.status || 1);
  }
};
// Node >= 18 rifiuta di eseguire .cmd senza shell (CVE-2024-27980), quindi non
// passiamo da npm/npx: invochiamo direttamente gli entrypoint JS con node.
const VSCE = 'node_modules/@vscode/vsce/vsce';
const OVSX = 'node_modules/ovsx/bin/ovsx';
const node = (script, scriptArgs = [], opts) => exec(process.execPath, [script, ...scriptArgs], opts);
const nodeMust = (script, scriptArgs = [], opts) => must(process.execPath, [script, ...scriptArgs], opts);
const step = (n) => console.log(`\n\x1b[1m▸ ${n}\x1b[0m`);

// ---------- versione
const bumpArg = args.find((a) => !a.startsWith('-')) || (has('--same') ? null : 'patch');
let version = oldVersion;
if (bumpArg) {
  if (/^\d+\.\d+\.\d+$/.test(bumpArg)) version = bumpArg;
  else {
    const [ma, mi, pa] = oldVersion.split('.').map(Number);
    if (bumpArg === 'major') version = `${ma + 1}.0.0`;
    else if (bumpArg === 'minor') version = `${ma}.${mi + 1}.0`;
    else if (bumpArg === 'patch') version = `${ma}.${mi}.${pa + 1}`;
    else {
      console.error(`✗ argomento non riconosciuto: ${bumpArg}`);
      process.exit(1);
    }
  }
}

console.log(`\x1b[1mRilascio Claude Studio\x1b[0m  ${oldVersion} → ${version}${dryRun ? '  (DRY RUN)' : ''}`);

if (!noGit) {
  const dirty = execOut('git', ['status', '--porcelain']).trim();
  if (dirty) {
    console.log('\n⚠ modifiche non committate (verranno incluse nel commit di rilascio):');
    console.log(dirty.split('\n').slice(0, 12).map((l) => '   ' + l).join('\n'));
  }
}

// ---------- token Open VSX
let ovsxToken = process.env.OVSX_PAT;
if (!ovsxToken && existsSync('.publish-tokens.json')) {
  ovsxToken = JSON.parse(readFileSync('.publish-tokens.json', 'utf8')).ovsx;
}
const wantOvsx = !only || only === 'ovsx';
const wantMarket = !only || only === 'marketplace';
if (wantOvsx && !ovsxToken && !dryRun) {
  console.error('\n✗ Token Open VSX assente.');
  console.error('  Prepara i login con: node scripts/setup-logins.mjs');
  console.error('  Poi genera il token su https://open-vsx.org/user-settings/tokens e salvalo in .publish-tokens.json');
  console.error('  come {"ovsx":"<token>"}, oppure esporta OVSX_PAT.');
  console.error('  Per pubblicare solo sul Marketplace: npm run release -- --only=marketplace');
  process.exit(1);
}

// ---------- bump
if (version !== oldVersion) {
  step(`Aggiorno package.json a ${version}`);
  pkg.version = version;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

  if (existsSync('CHANGELOG.md')) {
    const ch = readFileSync('CHANGELOG.md', 'utf8');
    if (!ch.includes(`## ${version}`)) {
      const oggi = new Date().toISOString().slice(0, 10);
      const righe = ch.split('\n');
      const idx = righe.findIndex((l) => /^##\s/.test(l));
      righe.splice(idx === -1 ? righe.length : idx, 0, `## ${version} — ${oggi}`, '', '- _da compilare_', '');
      writeFileSync('CHANGELOG.md', righe.join('\n'));
      console.log(`  CHANGELOG.md: aggiunta sezione ${version} — ricordati di descrivere le modifiche`);
    }
  }
}

// ---------- verify + package
if (!skipVerify) {
  step('Verifiche (typecheck, ui-check, data-check, host-check)');
  nodeMust('node_modules/typescript/bin/tsc', ['--noEmit']);
  nodeMust('build.mjs');
  nodeMust('scripts/preview.mjs');
  nodeMust('scripts/ui-check.mjs');
  nodeMust('scripts/context-check.mjs');
  nodeMust('scripts/data-check.cjs');
  nodeMust('scripts/host-check.cjs');
} else {
  console.log('\n⚠ verifiche saltate (--skip-verify)');
}

step('Build e packaging');
nodeMust('build.mjs');
nodeMust(VSCE, ['package', '--no-dependencies', '-o', 'claude-studio.vsix']);

if (dryRun) {
  console.log('\n✓ DRY RUN completato: claude-studio.vsix pronto, niente pubblicato.');
  process.exit(0);
}

// ---------- pubblicazione
const esiti = [];

if (wantMarket) {
  step('VS Code Marketplace (portale web via browser)');
  const r = exec(process.execPath, ['scripts/publish-marketplace.mjs', 'claude-studio.vsix']);
  esiti.push(['Marketplace', r.status === 0]);
}

if (wantOvsx) {
  step('Open VSX');
  const env = { ...process.env, OVSX_PAT: ovsxToken };
  node(OVSX, ['create-namespace', 'MrWilson'], { env, stdio: 'pipe' }); // idempotente
  const r = node(OVSX, ['publish', 'claude-studio.vsix'], { env });
  esiti.push(['Open VSX', r.status === 0]);
}

// ---------- git
const tuttoOk = esiti.length > 0 && esiti.every(([, ok]) => ok);
if (!noGit && tuttoOk) {
  step('Git commit e tag');
  must('git', ['add', '-A']);
  must('git', ['commit', '-q', '-m', `release: v${version}`]);
  must('git', ['tag', '-f', `v${version}`]);
  console.log(`  tag v${version} creato — push con:  git push && git push --tags`);
} else if (!tuttoOk) {
  console.log('\n⚠ pubblicazione non completata: nessun commit/tag creato.');
}

console.log('\n\x1b[1m── Riepilogo ──\x1b[0m');
esiti.forEach(([nome, ok]) => console.log(`  ${ok ? '✓' : '✗'} ${nome}`));
console.log(`\n  Marketplace: https://marketplace.visualstudio.com/items?itemName=MrWilson.claude-studio`);
console.log(`  Open VSX:    https://open-vsx.org/extension/MrWilson/claude-studio`);
process.exit(tuttoOk ? 0 : 1);
