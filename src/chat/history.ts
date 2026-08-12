// Conversations that already happened. Nothing needs inventing: the CLI keeps them
// in ~/.claude/projects and the SDK knows how to read them. Two things come out of
// here — the list for the dropdown, and the redraw of an entire conversation as the
// same events the webview would receive live.
import { getSessionMessages, listSessions } from '@anthropic-ai/claude-agent-sdk';
import type { HistoryItem, Wire } from '../engine/protocol';

export async function recentSessions(cwd: string, limit = 40): Promise<HistoryItem[]> {
  try {
    const list = await listSessions({ dir: cwd, limit });
    return list.map((s) => ({
      id: s.sessionId,
      summary: (s.customTitle || s.summary || 'Untitled').slice(0, 160),
      when: s.lastModified,
    }));
  } catch {
    // No history is a normal case (new project), not an error worth shouting about.
    return [];
  }
}

/**
 * Lines a past conversation back up as if it were arriving right now.
 * Only the final version of the text is taken: the streaming fragments no longer
 * exist and aren't needed.
 */
export async function replaySession(id: string, cwd: string): Promise<Wire[]> {
  const out: Wire[] = [];
  let msgs;
  try {
    msgs = await getSessionMessages(id, { dir: cwd });
  } catch {
    return out;
  }

  for (const m of msgs) {
    const content = (m.message as any)?.content;
    const parent = m.parent_tool_use_id ?? null;

    if (m.type === 'user') {
      if (typeof content === 'string') {
        if (content.trim()) out.push({ k: 'user', text: content });
        continue;
      }
      if (!Array.isArray(content)) continue;
      const said = content
        .filter((b: any) => b?.type === 'text')
        .map((b: any) => b.text)
        .join('\n');
      if (said.trim()) out.push({ k: 'user', text: said });
      for (const b of content as any[]) {
        if (b?.type !== 'tool_result') continue;
        out.push({ k: 'tool_end', id: b.tool_use_id, ok: !b.is_error, text: flatten(b.content) });
      }
      continue;
    }

    if (m.type !== 'assistant' || !Array.isArray(content)) continue;
    (content as any[]).forEach((b, i) => {
      if (b?.type === 'tool_use') {
        out.push({ k: 'tool_start', id: b.id, name: b.name, input: b.input, parent });
        return;
      }
      if (b?.type === 'text' && String(b.text || '').trim()) {
        out.push({ k: 'block_final', id: `${m.uuid}_${i}`, kind: 'text', text: b.text, parent });
      }
    });
  }
  return out;
}

function flatten(c: unknown): string {
  if (typeof c === 'string') return c;
  if (!Array.isArray(c)) return '';
  return c
    .map((p: any) => (typeof p === 'string' ? p : p?.type === 'text' ? p.text : ''))
    .filter(Boolean)
    .join('\n');
}
