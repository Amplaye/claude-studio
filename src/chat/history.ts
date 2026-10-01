// Conversations that already happened. Nothing needs inventing: the CLI keeps them
// in ~/.claude/projects and the SDK knows how to read them. Two things come out of
// here — the list for the dropdown, and the redraw of an entire conversation as the
// same events the webview would receive live.
import * as fs from 'node:fs';
import { getSessionMessages, listSessions } from '@anthropic-ai/claude-agent-sdk';
import type { HistoryItem, Wire } from '../engine/protocol';
import { planName, savedPlanPath } from './planReady';

export async function recentSessions(cwd: string, limit = 24): Promise<HistoryItem[]> {
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

  /** Le ExitPlanMode di questa conversazione, con quello che si portavano dietro. */
  const exits = new Map<string, Record<string, unknown>>();

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
        const text = flatten(b.content);
        out.push({ k: 'tool_end', id: b.tool_use_id, ok: !b.is_error, text });
        // Un piano chiuso in plan mode: la risposta dice dove sta, e la scheda «Piano
        // pronto» torna com'era (vedi chat/planReady.ts).
        const input = exits.get(b.tool_use_id);
        const file = input ? savedPlanPath(text) : '';
        if (file) out.push(planReady(b.tool_use_id, file, input!));
      }
      continue;
    }

    if (m.type !== 'assistant' || !Array.isArray(content)) continue;
    (content as any[]).forEach((b, i) => {
      if (b?.type === 'tool_use') {
        if (b.name === 'ExitPlanMode') exits.set(b.id, b.input ?? {});
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

/**
 * La scheda del piano, ridisegnata. Il testo e' quello del file se c'e' ancora — e'
 * la versione che verra' eseguita — altrimenti quello che la chiamata si portava
 * dietro.
 */
function planReady(id: string, file: string, input: Record<string, unknown>): Wire {
  let plan = typeof input.plan === 'string' ? input.plan : '';
  try {
    plan = fs.readFileSync(file, 'utf8');
  } catch {
    /* il file non c'e' piu': resta quello che c'era nella chiamata */
  }
  return { k: 'plan_ready', id, name: planName(file), path: file, plan };
}

function flatten(c: unknown): string {
  if (typeof c === 'string') return c;
  if (!Array.isArray(c)) return '';
  return c
    .map((p: any) => (typeof p === 'string' ? p : p?.type === 'text' ? p.text : ''))
    .filter(Boolean)
    .join('\n');
}
