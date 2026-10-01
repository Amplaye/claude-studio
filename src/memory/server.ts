// La memoria, come strumento del modello: un server MCP nel nostro stesso processo,
// sul modello del ponte con l'editor (engine/ide.ts).
//
// `alwaysLoad` perche' uno strumento dietro ToolSearch e' uno strumento che il modello
// deve prima sapere di cercare — ed e' esattamente il caso in cui non lo sa: la nota
// che gli serve e' quella che l'indice non nomina. Le descrizioni restano fisse: stanno
// nel prompt, e cambiarle a ogni sessione butterebbe via la cache.
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { readMemory, searchMemory } from './memory';

const text = (s: string) => ({ content: [{ type: 'text' as const, text: s }] });

export function memoryServer(o: { cwd: string }) {
  return createSdkMcpServer({
    name: 'memoria',
    version: '1.0.0',
    alwaysLoad: true,
    instructions:
      "This project's auto-memory, searchable by topic. MEMORY.md is only an index, and a note " +
      'it does not name is still there: before assuming something about past work, decisions, ' +
      'people or settings of this project, look it up with memory_search, then read the note ' +
      'that fits with memory_read. Notes are dated and may be out of date: check them against ' +
      'the code before relying on them. Secrets in notes come back hidden; open the file if you ' +
      'really need one.',
    tools: [
      tool(
        'memory_search',
        "Search this project's memory notes by topic. Use it whenever the user asks what is known, " +
          'decided or remembered about something ("what do we know about X?", "cosa sappiamo di X?"), ' +
          'and before saying you do not know something about this project: the index (MEMORY.md) ' +
          'names only part of the notes. Accents, plurals and word starts all match. Returns the best ' +
          'notes with their date, the lines that matched and the notes linked to them.',
        {
          query: z.string().describe('what to look for: a topic, a name, a few words'),
          scope: z
            .enum(['project', 'all'])
            .optional()
            .describe('"project" (default) = this project\'s memory; "all" = every project\'s'),
          limit: z.number().int().min(1).max(10).optional().describe('how many notes, 5 by default'),
        },
        async (a) => text(searchMemory(o.cwd, a.query, a.scope ?? 'project', a.limit ?? 5))
      ),
      tool(
        'memory_read',
        'Read one memory note in full, with its date, the notes that cite it and its broken links.',
        { name: z.string().describe('the note, as memory_search names it') },
        async (a) => text(readMemory(o.cwd, a.name))
      ),
    ],
  });
}
