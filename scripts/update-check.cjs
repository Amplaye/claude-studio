// Where the automatic update is allowed to rebuild from — the one question that,
// answered wrong, has the extension run `git pull` and `npm run package` inside a
// folder that isn't ours. So it is asked here, off the editor: only a folder you
// named, only if it is really Claude Studio's source, with `~` meaning your home
// whichever machine you are on.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');
const { makeVscode, install } = require('./lib/fake-vscode.cjs');

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
install(vscode);

const { sourceRoot, updateCommand } = require(bundle);
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

fs.rmSync(home, { recursive: true, force: true });
if (bad) {
  console.error(`\n${bad} case(s) wrong: the update would go to the wrong place.`);
  process.exit(1);
}
console.log('\nupdate ok — the CLI updated the way it was installed, the extension only from the source you named.');
