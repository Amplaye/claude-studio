// How a web page gets opened: by the system, not by `openExternal`.
//
// `openExternal` goes through VS Code's link protection without `fromWorkspace`, and
// for every domain you never trusted out comes "Open external website?". The pages
// opened from here are the ones you just asked for ("/upgrade", "/help"), so the
// system opens them, as a double click would. This is the part of that road that
// can go wrong without anyone seeing it: the command for each system, an address
// with `&`, `%`, `,` and `#` arriving whole, and a `javascript:` or a `file:` that
// must never be handed to the system at all. Plus the way back to `openExternal`
// when the command can't start, or when the browser is on the other side of a
// remote connection.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const esbuild = require('esbuild');
const { install } = require('./lib/fake-vscode.cjs');

const root = path.dirname(__dirname);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-browser-'));
const bundle = path.join(tmp, 'browser.cjs');
esbuild.buildSync({
  entryPoints: [path.join(root, 'src', 'shared', 'browser.ts')],
  bundle: true,
  outfile: bundle,
  platform: 'node',
  format: 'cjs',
  external: ['vscode'],
  logLevel: 'warning',
});

// The editor and the process launcher, both fake: nothing here opens a real browser.
const opened = [];
const vscode = {
  env: { remoteName: undefined, openExternal: async (u) => void opened.push(String(u)) },
  Uri: { parse: (s) => ({ toString: () => s }) },
};
const spawned = [];
/** What the next launched child does: nothing, fail to start, or exit with a code. */
let next = { kind: 'ok' };
const childProcess = {
  spawn(file, args, opts) {
    spawned.push({ file, args, opts });
    const child = new EventEmitter();
    child.unref = () => {};
    const how = next;
    setImmediate(() => {
      if (how.kind === 'error') child.emit('error', Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }));
      if (how.kind === 'exit') child.emit('exit', how.code);
    });
    return child;
  },
};
install(vscode, { 'node:child_process': childProcess, child_process: childProcess });

const { browserCommand, openWeb } = require(bundle);

let bad = 0;
function check(name, ok, detail) {
  if (ok) console.log('  ✓ ' + name);
  else {
    bad++;
    console.error('  ✗ ' + name + (detail ? ' — ' + detail : ''));
  }
}

// ---- the command, one per system ----
const plain = 'https://example.com/a';
{
  const w = browserCommand('win32', plain);
  check(
    'Windows: rundll32 from System32, url.dll,FileProtocolHandler, then the address',
    w &&
      w.file === 'C:\\Windows\\System32\\rundll32.exe' &&
      w.args.length === 2 &&
      w.args[0] === 'url.dll,FileProtocolHandler' &&
      w.args[1] === plain,
    JSON.stringify(w)
  );
  const other = browserCommand('win32', plain, 'D:\\WINNT\\');
  check(
    'Windows: the system folder comes from the machine, not from a guess',
    other && other.file === 'D:\\WINNT\\System32\\rundll32.exe',
    JSON.stringify(other)
  );
  const m = browserCommand('darwin', plain);
  check('macOS: open <address>', m && m.file === 'open' && m.args.length === 1 && m.args[0] === plain, JSON.stringify(m));
  const l = browserCommand('linux', plain);
  check('Linux: xdg-open <address>', l && l.file === 'xdg-open' && l.args.length === 1 && l.args[0] === plain, JSON.stringify(l));
  const f = browserCommand('freebsd', plain);
  check('any other system: xdg-open', f && f.file === 'xdg-open', JSON.stringify(f));
  const all = [w, other, m, l, f].map((c) => c && c.file).join(' ');
  check('never through cmd.exe or PowerShell', !/cmd(\.exe)?\b|powershell|pwsh/i.test(all), all);
}

// ---- addresses that a shell would have cut in pieces ----
for (const url of [
  'https://business.facebook.com/settings/apps?business_id=905021967715680&tab=1',
  'https://example.com/report?q=50%25&ratio=1,5#section-2',
  'https://example.com/path,with,commas/?a=%7Bx%7D&b=^caret',
  'http://localhost:3000/?redirect=https%3A%2F%2Fx.com%2F%3Fa%3D1%26b%3D2#/route?x=1',
]) {
  for (const platform of ['win32', 'darwin', 'linux']) {
    const c = browserCommand(platform, url);
    check(`${platform}: ${url} arrives whole`, c && c.args.at(-1) === url, JSON.stringify(c));
  }
}
{
  // A space or a quote would have the address split, or wrapped in quotes that
  // FileProtocolHandler receives as part of it. Put in the form a browser uses, no
  // argument needs quoting.
  const c = browserCommand('win32', 'https://example.com/a b?q="x y"#z w');
  const arg = c && c.args.at(-1);
  check(
    'spaces and quotes become %20 and %22: nothing to quote',
    arg && !/[\s"]/.test(arg) && arg.includes('a%20b') && arg.includes('%22x%20y%22'),
    String(arg)
  );
}

// ---- what must never reach the system ----
for (const url of [
  'javascript:alert(1)',
  'JavaScript:alert(1)',
  'command:workbench.action.terminal.new',
  'file:///C:/Windows/System32/calc.exe',
  'vscode://file/c:/x.ts',
  'data:text/html,<script>alert(1)</script>',
  'ftp://example.com/x',
  '\\\\server\\share\\x.exe',
  'C:\\Windows\\System32\\calc.exe',
  '-a Calculator',
  '',
  'not a url',
]) {
  for (const platform of ['win32', 'darwin', 'linux']) {
    check(`${platform}: refuses ${JSON.stringify(url)}`, browserCommand(platform, url) === null);
  }
}

// ---- openWeb: the system first, openExternal only when it has to ----
const tick = () => new Promise((r) => setTimeout(r, 20));
async function run() {
  const reset = () => {
    opened.length = 0;
    spawned.length = 0;
  };

  reset();
  next = { kind: 'ok' };
  openWeb('https://example.com/?a=1&b=2');
  await tick();
  const s = spawned[0];
  check(
    'local: the system command starts, detached, with nothing attached to it',
    spawned.length === 1 && s.opts.detached === true && s.opts.stdio === 'ignore' && s.args.at(-1) === 'https://example.com/?a=1&b=2',
    JSON.stringify(spawned)
  );
  check(
    'local: no windowsHide, or a browser that was not already open would start hidden',
    s && !s.opts.windowsHide,
    JSON.stringify(s && s.opts)
  );
  check('local: openExternal is not asked (no prompt)', opened.length === 0, JSON.stringify(opened));

  reset();
  next = { kind: 'error' };
  openWeb('https://example.com/x');
  await tick();
  check('the command cannot start: openExternal takes over', spawned.length === 1 && opened.length === 1, JSON.stringify({ spawned, opened }));

  reset();
  next = { kind: 'exit', code: 3 };
  openWeb('https://example.com/y');
  await tick();
  check('the command gives up straight away: openExternal takes over', opened.length === 1, JSON.stringify(opened));

  reset();
  next = { kind: 'exit', code: 0 };
  openWeb('https://example.com/z');
  await tick();
  check('the command went fine: the page is opened once', opened.length === 0, JSON.stringify(opened));

  reset();
  vscode.env.remoteName = 'ssh-remote';
  openWeb('https://example.com/remote');
  await tick();
  check(
    'remote (SSH, WSL, container): openExternal, nothing launched on this side',
    spawned.length === 0 && opened.length === 1 && opened[0] === 'https://example.com/remote',
    JSON.stringify({ spawned, opened })
  );
  vscode.env.remoteName = undefined;

  reset();
  openWeb('javascript:alert(1)');
  openWeb('command:workbench.action.terminal.new');
  await tick();
  check('a non-web address: nothing launched, nothing opened', spawned.length === 0 && opened.length === 0, JSON.stringify({ spawned, opened }));
}

run()
  .catch((e) => {
    bad++;
    console.error(e);
  })
  .finally(() => {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      // a temporary folder: the system gets rid of it anyway
    }
    if (bad) {
      console.error(`\n${bad} case(s) wrong: a page would open with the prompt, twice, broken, or not at all.`);
      process.exit(1);
    }
    console.log('\nbrowser ok — every system has its command, addresses arrive whole, nothing but web pages goes to the system.');
  });
