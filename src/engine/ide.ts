// The bridge to the editor.
//
// The official extension opens an MCP server on a socket and leaves a lockfile in
// ~/.claude/ide/. That isn't needed here: the Agent SDK can host an MCP server
// inside our own process, so the bridge is a function, not a network port — and
// above all it doesn't quarrel with the official one, which stays installed.
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { diagnostics, openEditors, openFile, showDiff } from '../chat/editor';

const text = (s: string) => ({ content: [{ type: 'text' as const, text: s }] });

export function ideServer() {
  return createSdkMcpServer({
    name: 'editor',
    version: '1.0.0',
    instructions:
      'Bridge to the VSCode editor of whoever is chatting. Use it to show a before/after diff, ' +
      'to read the errors the editor already knows about without re-running anything, and to know ' +
      'which files are open and what is selected.',
    tools: [
      tool(
        'show_diff',
        'Opens the native before/after comparison of a file in the editor.',
        {
          file: z.string().describe('path of the file, relative to the working folder'),
          before: z.string().describe('previous content'),
          after: z.string().describe('new content'),
        },
        async (a) => {
          await showDiff(a.file, a.before, a.after);
          return text(`Diff of ${a.file} opened in the editor.`);
        }
      ),
      tool(
        'editor_errors',
        'Errors and warnings the editor already knows about (linter, TypeScript, etc.). Re-runs nothing.',
        { file: z.string().optional().describe('limit to one file; empty = all of them') },
        async (a) => text(diagnostics(a.file))
      ),
      tool(
        'open_files',
        'The files open in the editor right now, with the active one and what is selected.',
        {},
        async () => text(openEditors())
      ),
      tool(
        'open_file',
        'Opens a file in the editor, optionally at a precise line.',
        {
          file: z.string().describe('path of the file'),
          line: z.number().optional().describe('line to jump to'),
        },
        async (a) => {
          await openFile(a.file, a.line);
          return text(`Opened ${a.file}${a.line ? ':' + a.line : ''}.`);
        }
      ),
    ],
  });
}
