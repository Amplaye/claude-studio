// Where the automatic update is allowed to rebuild from — the one question that,
// answered wrong, has the extension run `git pull` and `npm run package` inside a
// folder that isn't ours. So it is asked here, off the editor: only a folder you
// named, only if it is really Claude Studio's source, with `~` meaning your home
// whichever machine you are on.
//
// And, once it is rebuilding: that it leaves the source exactly as git has it. It used
// to leave behind its own SDK bump, and then refuse to go on because the source had
// changes in it — for good, on a machine where nobody commits them.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const esbuild = require('esbuild');
const semver = require('semver');
const { makeVscode, install, memento } = require('./lib/fake-vscode.cjs');

const root = path.dirname(__dirname);

// A home of its own, with a genuine source inside and a stranger next to it.
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-update-'));
process.env.HOME = home;
process.env.USERPROFILE = home;
const mine = path.join(home, 'claude-studio');
const notMine = path.join(home, 'altro');
for (const [dir, name] of [
  [mine, 'claude-studio'],
  [notMine, 'qualcos-altro'],
]) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, version: '9.9.9' }), 'utf8');
}

// The updater as it really is, taken out of the bundle so it can be called directly.
const bundle = path.join(home, 'updater.cjs');
esbuild.buildSync({
  entryPoints: [path.join(root, 'src', 'update', 'updater.ts')],
  bundle: true,
  outfile: bundle,
  platform: 'node',
  format: 'cjs',
  external: ['vscode'],
  define: { __CS_SDK_VERSION: '"0.0.0"' },
  logLevel: 'warning',
});

let setting = '';
const vscode = makeVscode({ workspaceRoot: root });
vscode.workspace.getConfiguration = () => ({
  get: (k, d) => (k === 'updateSourcePath' ? setting : k === 'autoUpdate' ? 'off' : d),
});
// What the updater writes in its Output channel, and what it asks VS Code to install.
const logged = [];
vscode.window.createOutputChannel = () => ({ appendLine: (l) => logged.push(l), show() {}, dispose() {} });
const installed = [];
vscode.commands.executeCommand = async (id, arg) => {
  if (id === 'workbench.extensions.installExtension') installed.push(arg.fsPath);
};
install(vscode);

const { sourceRoot, updateCommand, leftovers, sdkBuildVersion, newer, updateExtension } = require(bundle);
const ctx = { extension: { packageJSON: { name: 'claude-studio' } } };

// ---- how the CLI gets updated, one way per kind of installation ----
// The one that matters for everybody: a CLI left behind means old models and old
// fixes, whatever the extension does.
const runs = [
  [
    'npm install: the package gets reinstalled',
    { kind: 'npm', path: '/usr/lib/node_modules/@anthropic-ai/claude-code/bin/claude' },
    { cmd: 'npm', args: ['install', '-g', '@anthropic-ai/claude-code@latest'], shell: true },
  ],
  [
    'native installer: it updates itself, npm never asked',
    { kind: 'native', path: '/home/tizio/.local/bin/claude' },
    { cmd: '/home/tizio/.local/bin/claude', args: ['update'], shell: false },
  ],
  [
    'a path with a space stays whole (no shell)',
    { kind: 'manual', path: 'C:\\Program Files\\claude\\claude.exe' },
    { cmd: 'C:\\Program Files\\claude\\claude.exe', args: ['update'], shell: false },
  ],
  ['an old cli.js outside npm: nothing can update it', { kind: 'manual', path: '/opt/claude/cli.js' }, undefined],
];

let bad = 0;
for (const [what, cli, want] of runs) {
  const got = updateCommand(cli);
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'NO  '}${what}: ${got ? got.cmd + ' ' + got.args.join(' ') : '—'}`);
}

const cases = [
  ['empty: nothing gets rebuilt', '', undefined],
  ['~ is your home, on any machine', '~/claude-studio', mine],
  ['a plain path works too', mine, mine],
  ['a folder that does not exist', path.join(home, 'boh'), undefined],
  ["somebody else's repository", notMine, undefined],
];

for (const [what, value, want] of cases) {
  setting = value;
  const got = sourceRoot(ctx);
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'NO  '}${what}: ${got ?? '—'}`);
}

// ---- npm that broke halfway ----
// An interrupted install leaves its own hidden copy next to the package, and from
// then on every update dies on it: the same error every six hours until somebody
// goes and looks. Those copies get swept away, the package never does.
const scope = path.join(home, 'node_modules', '@anthropic-ai');
const pkgDir = path.join(scope, 'claude-code');
const junk = [path.join(scope, '.claude-code-cFVBZYCB'), path.join(scope, '.claude-code-Qb12xY')];
for (const d of [pkgDir, ...junk]) {
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'package.json'), '{}', 'utf8');
}
const enotempty = [
  'npm error code ENOTEMPTY',
  'npm error syscall rename',
  'npm error path ' + pkgDir,
  'npm error dest ' + junk[0],
  'npm error errno -66',
].join('\n');

const sweeps = [
  ["npm's leftovers go, the package stays", enotempty, junk],
  ['another failure sweeps nothing', 'npm error code EACCES\nnpm error path ' + pkgDir, []],
  ['nothing to read into: no crash', 'npm error code ENOTEMPTY\nnpm error path /nowhere/at/all/claude-code', []],
];
for (const [what, out, want] of sweeps) {
  const got = leftovers(out).sort();
  const ok = JSON.stringify(got) === JSON.stringify([...want].sort());
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'NO  '}${what}: ${got.length} to remove`);
}

// ---- the version of a build made here for a newer SDK ----
// Two judges have to agree on it: `newer()`, which decides whether the updater
// rebuilds, and semver, which is how vsce and VS Code decide whether a package is a
// valid one and whether it replaces the one installed.
{
  const v = sdkBuildVersion('0.31.1', '0.3.270');
  const ok = v === '0.31.2-sdk.0.3.270' && semver.valid(v) === v;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'NO  '}an SDK build is a pre-release of the next patch: ${v}`);
}
const order = [
  ['above the source it is built on', sdkBuildVersion('0.31.1', '0.3.270'), '0.31.1'],
  ['below the next real release, which then gets in', '0.31.2', sdkBuildVersion('0.31.1', '0.3.270')],
  ['a newer SDK goes above the older one', sdkBuildVersion('0.31.1', '0.3.271'), sdkBuildVersion('0.31.1', '0.3.270')],
  ['and so does a new minor of the SDK', sdkBuildVersion('0.31.1', '0.4.0'), sdkBuildVersion('0.31.1', '0.3.999')],
];
for (const [what, hi, lo] of order) {
  const ok = newer(hi, lo) && !newer(lo, hi) && semver.gt(hi, lo);
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'NO  '}${what}: ${hi} > ${lo}`);
}

// ---- a rebuild leaves the source as git has it ----
// A real git repository, and an `npm` of our own first in the PATH. It does to the
// files what the real one does — an install without --no-save writes the dependency
// into package.json and the lockfile, as it did on 13 September — and it writes down
// every call, with the version package.json carried at that moment.
function fakeNpm() {
  const fs = require('node:fs');
  const args = process.argv.slice(2);
  const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
  let version;
  try {
    version = read('package.json').version;
  } catch {
    // `npm view` runs wherever it happens to be: no package.json needed there
  }
  fs.appendFileSync(process.env.CS_FAKE_NPM_LOG, JSON.stringify({ args, version }) + '\n');
  if (args[0] === 'view') {
    console.log(process.env.CS_FAKE_SDK);
  } else if (args[0] === 'install' && !args.includes('--no-save')) {
    const spec = args[args.length - 1];
    const at = spec.lastIndexOf('@');
    const [name, v] = [spec.slice(0, at), spec.slice(at + 1)];
    const pkg = read('package.json');
    pkg.dependencies = { ...pkg.dependencies, [name]: '^' + v };
    fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
    const lock = read('package-lock.json');
    lock.packages['node_modules/' + name] = { version: v };
    fs.writeFileSync('package-lock.json', JSON.stringify(lock, null, 2) + '\n');
  } else if (args[0] === 'run' && args[1] === 'package') {
    if (process.env.CS_FAKE_BUILD === 'fail') {
      console.error('the build broke');
      process.exit(1);
    }
    fs.writeFileSync('claude-studio.vsix', 'a package');
  }
}
const bin = path.join(home, 'bin');
const npmLog = path.join(home, 'npm.log');
fs.mkdirSync(bin);
fs.writeFileSync(path.join(bin, 'fake-npm.cjs'), `(${fakeNpm})();\n`, 'utf8');
if (process.platform === 'win32') {
  fs.writeFileSync(path.join(bin, 'npm.cmd'), `@"${process.execPath}" "%~dp0fake-npm.cjs" %*\r\n`, 'utf8');
} else {
  fs.writeFileSync(path.join(bin, 'npm'), `#!/bin/sh\nexec "${process.execPath}" "$(dirname "$0")/fake-npm.cjs" "$@"\n`, 'utf8');
  fs.chmodSync(path.join(bin, 'npm'), 0o755);
}
process.env.PATH = bin + path.delimiter + process.env.PATH;
process.env.CS_FAKE_NPM_LOG = npmLog;
process.env.CS_FAKE_SDK = '0.3.999';

const SDK = '@anthropic-ai/claude-agent-sdk';
const repo = path.join(home, 'studio-src');
const pkgFile = path.join(repo, 'package.json');
const pkgText = JSON.stringify({ name: 'claude-studio', version: '9.9.9', dependencies: { [SDK]: '^0.3.1' } }, null, 2) + '\n';
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
fs.mkdirSync(repo);
fs.writeFileSync(pkgFile, pkgText, 'utf8');
fs.writeFileSync(
  path.join(repo, 'package-lock.json'),
  JSON.stringify({ name: 'claude-studio', version: '9.9.9', lockfileVersion: 3, packages: { ['node_modules/' + SDK]: { version: '0.3.1' } } }, null, 2) + '\n',
  'utf8'
);
fs.writeFileSync(path.join(repo, '.gitignore'), '*.vsix\n', 'utf8');
git('init', '-q');
git('add', '-A');
git('-c', 'user.name=update-check', '-c', 'user.email=update-check@localhost', 'commit', '-q', '-m', 'the source');

async function rebuilds() {
  setting = repo;
  const check = (what, ok, detail) => {
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'NO  '}${what}${detail ? ': ' + detail : ''}`);
  };
  const status = () => git('status', '--porcelain') || 'clean';
  const untouched = () => status() === 'clean' && fs.readFileSync(pkgFile, 'utf8') === pkgText;
  // A globalState that remembers, and shows what the updater wrote into it.
  const writes = [];
  const state = () => {
    const m = memento();
    const update = m.update;
    m.update = (k, v) => {
      if (v !== undefined) writes.push([k, v]);
      return update(k, v);
    };
    return m;
  };
  const once = async (here, globalState = state()) => {
    fs.rmSync(npmLog, { force: true });
    installed.length = 0;
    logged.length = 0;
    const ctx = { extension: { packageJSON: { name: 'claude-studio', version: here } }, globalState };
    const said = await updateExtension(ctx, true);
    const calls = fs.existsSync(npmLog)
      ? fs.readFileSync(npmLog, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
      : [];
    return { said, calls };
  };

  {
    const { said, calls } = await once('9.9.9');
    const inst = calls.find((c) => c.args[0] === 'install');
    const pack = calls.find((c) => c.args[0] === 'run');
    check('a newer SDK goes into node_modules only', inst?.args.includes('--no-save'), inst && 'npm ' + inst.args.join(' '));
    check('the build carries the pre-release version', pack?.version === '9.9.10-sdk.0.3.999', pack?.version);
    check('and it gets installed', installed.length === 1 && /9\.9\.10-sdk\.0\.3\.999/.test(said ?? ''), said);
    check('the source is left as git has it', untouched(), status());
  }

  {
    process.env.CS_FAKE_BUILD = 'fail';
    const { said } = await once('9.9.9');
    delete process.env.CS_FAKE_BUILD;
    check('a build that breaks puts package.json back all the same', said === undefined && !installed.length && untouched(), status());
  }

  // VS Code closed in the middle of the build: `finally` never ran, and package.json
  // still says what the build wrote into it.
  const [key, left] = writes.find(([, v]) => typeof v?.temp === 'string') ?? [];
  if (!left) {
    check('a build cut short: something written down to put back', false, 'nothing was');
  } else {
    fs.writeFileSync(pkgFile, left.temp, 'utf8');
    const cut = state();
    await cut.update(key, left);
    await once('9.9.9', cut);
    const back = logged.some((l) => l.includes('put back'));
    check('a build cut short: the next check puts package.json back and goes on', back && installed.length === 1 && untouched(), status());
  }

  // Somebody's own work, and a note from a build cut short that no longer matches the
  // file: that work is theirs, and nothing at all happens.
  {
    const theirs = pkgText.replace('"version": "9.9.9",', '"version": "9.9.9",\n  "description": "work in progress",');
    fs.writeFileSync(pkgFile, theirs, 'utf8');
    const stale = state();
    await stale.update(key, { file: pkgFile, original: pkgText, temp: 'what a build wrote, before somebody edited it' });
    const { calls } = await once('9.9.9', stale);
    const waits = logged.some((l) => l.includes('we wait'));
    check("somebody's own work: nothing gets touched", waits && !calls.length && fs.readFileSync(pkgFile, 'utf8') === theirs, `${calls.length} npm call(s)`);
    fs.writeFileSync(pkgFile, pkgText, 'utf8');
  }

  {
    const { said, calls } = await once('9.9.8');
    const pack = calls.find((c) => c.args[0] === 'run');
    const ok = !calls.some((c) => c.args[0] === 'install') && pack?.version === '9.9.9' && installed.length === 1;
    check('a higher version from git: built as it is, nothing written', ok && untouched(), said);
  }
}

rebuilds()
  .catch((e) => {
    bad++;
    console.error(e);
  })
  .finally(() => {
    try {
      fs.rmSync(home, { recursive: true, force: true });
    } catch {
      // a temporary folder: the system gets rid of it anyway
    }
    if (bad) {
      console.error(`\n${bad} case(s) wrong: the update would go to the wrong place, or leave the source dirty.`);
      process.exit(1);
    }
    console.log(
      '\nupdate ok — the CLI updated the way it was installed, the extension only from the source you named, and that source left as git has it.'
    );
  });
