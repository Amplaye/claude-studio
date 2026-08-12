// Bare test of the engine: does the CLI installed on this PC answer in streaming?
// node scripts/smoke-engine.mjs
import { query } from '@anthropic-ai/claude-agent-sdk';
import * as esbuild from 'esbuild';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// The smoke test has to look for the CLI exactly the way the extension does. Its
// own private search used to go looking only for the old `cli.js` under `npm root
// -g`, found nothing, and passed anyway: run from the project folder the SDK falls
// back to the native binary in node_modules, which the installed extension does not
// have. That is the one failure this test exists to catch, so we build the real
// module and ask it.
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const built = path.join(os.tmpdir(), `claude-studio-cli-probe-${process.pid}.cjs`);
await esbuild.build({
  entryPoints: [path.join(root, 'src', 'engine', 'cli.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: built,
  logLevel: 'silent',
});
const { claudeCli } = createRequire(import.meta.url)(built);
fs.rmSync(built, { force: true });

const found = claudeCli();
console.log('cli:', found ? `${found.path} (${found.version || '?'}, ${found.kind})` : undefined);
if (!found) {
  console.error('no claude CLI found on this machine: the installed extension would fail here');
  process.exit(1);
}
const cli = found.path;

async function* input() {
  yield {
    type: 'user',
    message: { role: 'user', content: 'Answer only: hello from the engine.' },
    parent_tool_use_id: null,
    session_id: '',
  };
}

const q = query({
  prompt: input(),
  options: {
    cwd: process.cwd(),
    pathToClaudeCodeExecutable: cli,
    includePartialMessages: true,
    permissionMode: 'default',
    canUseTool: async (name) => {
      console.log('[canUseTool]', name);
      return { behavior: 'deny', message: 'smoke test' };
    },
    stderr: (d) => process.stderr.write('[cli] ' + d),
  },
});

let deltas = 0;
for await (const m of q) {
  if (m.type === 'stream_event') {
    const ev = m.event;
    if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
      deltas++;
      process.stdout.write(ev.delta.text);
    }
    continue;
  }
  if (m.type === 'system' && m.subtype === 'init') {
    console.log('\n[init] model=%s session=%s', m.model, m.session_id);
    continue;
  }
  if (m.type === 'result') {
    console.log('\n[result] subtype=%s deltas=%d cost=%s', m.subtype, deltas, m.total_cost_usd);
    break;
  }
}
process.exit(deltas > 0 ? 0 : 1);
