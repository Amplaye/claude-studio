// Prova secca del motore: la CLI installata sul PC risponde in streaming?
// node scripts/smoke-engine.mjs
import { query } from '@anthropic-ai/claude-agent-sdk';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';

function findCli() {
  const root = execFileSync('npm', ['root', '-g'], { shell: true }).toString().trim();
  const p = path.join(root, '@anthropic-ai', 'claude-code', 'cli.js');
  return fs.existsSync(p) ? p : undefined;
}

const cli = findCli();
console.log('cli.js:', cli);

async function* input() {
  yield {
    type: 'user',
    message: { role: 'user', content: 'Rispondi solo: ciao dal motore.' },
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
