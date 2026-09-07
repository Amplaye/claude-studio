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
      'to read the errors the editor already knows about without re-running anything, to know ' +
      'which files are open and what is selected, and to put the plan for a long job on screen ' +
      'while you work through it.',
    tools: [
      /**
       * Il piano, a schermo.
       *
       * Il pannello dei passi ha una lista da disegnare solo quando Claude apre un
       * sub-agent, e un turno normale — legge, modifica, lancia i test — non ne apre
       * nessuno: restava la riga di cosa sta facendo *adesso*, che risponde a una
       * domanda sola e non a quella che ci si fa davvero ("quanto manca?"). La CLI
       * un tempo aveva TodoWrite ed e' sparito; qui l'estensione ospita gia' un
       * server MCP suo, quindi lo strumento che manca se lo puo' dare da sola. Stessi
       * nomi di campo di TodoWrite, perche' e' il formato che il modello conosce.
       *
       * Si riscrive intero a ogni chiamata: niente id da tenere in riga, niente
       * aggiornamenti che non trovano la loro riga, e l'ultima chiamata e' sempre la
       * verita' (vedi tasks/store.ts, `set`).
       *
       * Chi legge la lista non e' questo gestore: e' chat/controller.ts, che la
       * prende dalla chiamata mentre passa, come fa con TodoWrite. Il motivo e' la
       * cronologia — riaprendo una conversazione i messaggi vengono ridipinti dal
       * transcript e il gestore non gira affatto, quindi un piano che vivesse solo
       * qui dentro sparirebbe ogni volta che riapri quello a cui stavi lavorando.
       * Qui resta la risposta, che e' l'unica cosa che il modello aspetta.
       */
      tool(
        'plan',
        'Put the plan for this job on the user\'s screen, and keep it current. Send the ' +
          'whole checklist every time: the last call replaces the list. Use it for a job of ' +
          'three steps or more; skip it for something you can just answer or do in one go.',
        {
          steps: z
            .array(
              z.object({
                content: z.string().describe('the step, imperative: "Rename the column"'),
                activeForm: z
                  .string()
                  .optional()
                  .describe('how it reads while it is the one running: "Renaming the column"'),
                status: z.enum(['pending', 'in_progress', 'completed', 'failed']),
              })
            )
            .describe('the whole list, in order. Exactly one step should be in_progress.'),
        },
        async (a) => {
          const done = a.steps.filter((s) => s.status === 'completed').length;
          return text(`Plan on screen: ${done}/${a.steps.length} done.`);
        }
      ),
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
