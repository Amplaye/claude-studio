// A che punto arrivano i messaggi `assistant` completi rispetto allo streaming?
// Da questo dipende come si agganciano i blocchi: se l'SDK manda un messaggio
// assistant per OGNI blocco, l'indice dentro quel messaggio non e' l'indice del
// blocco nello stream.
import { query } from '@anthropic-ai/claude-agent-sdk';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';

const root = execFileSync('npm', ['root', '-g'], { shell: true }).toString().trim();
const cli = path.join(root, '@anthropic-ai', 'claude-code', 'cli.js');

async function* input() {
  yield {
    type: 'user',
    message: {
      role: 'user',
      content: 'Leggi package.json e poi scrivimi due righe di commento. Usa il tool Read.',
    },
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
    canUseTool: async () => ({ behavior: 'allow' }),
  },
});

for await (const m of q) {
  if (m.type === 'stream_event') {
    const e = m.event;
    if (e.type === 'message_start') console.log('STREAM message_start id=%s', e.message?.id);
    else if (e.type === 'content_block_start') console.log('STREAM block_start idx=%d type=%s', e.index, e.content_block?.type);
    else if (e.type === 'content_block_stop') console.log('STREAM block_stop idx=%d', e.index);
    else if (e.type === 'message_stop') console.log('STREAM message_stop');
  } else if (m.type === 'assistant') {
    console.log(
      'ASSISTANT id=%s blocchi=[%s]',
      m.message.id,
      m.message.content.map((b) => b.type).join(',')
    );
  } else if (m.type === 'user') {
    const c = m.message.content;
    if (Array.isArray(c)) console.log('USER blocchi=[%s]', c.map((b) => b.type).join(','));
  } else if (m.type === 'result') {
    console.log('RESULT %s', m.subtype);
    break;
  }
}
process.exit(0);
