// Il ponte con l'editor.
//
// L'estensione ufficiale apre un server MCP su socket e lascia un lockfile in
// ~/.claude/ide/. Qui non serve: l'Agent SDK sa ospitare un server MCP dentro il
// nostro stesso processo, quindi il ponte e' una funzione, non una porta di rete —
// e soprattutto non litiga con quello dell'ufficiale, che resta installata.
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { diagnostics, openEditors, openFile, showDiff } from '../chat/editor';

const text = (s: string) => ({ content: [{ type: 'text' as const, text: s }] });

export function ideServer() {
  return createSdkMcpServer({
    name: 'editor',
    version: '1.0.0',
    instructions:
      "Ponte con l'editor VSCode di chi sta chattando. Usalo per mostrare un diff prima/dopo, " +
      'per leggere gli errori che l’editor gia’ conosce senza rieseguire niente, e per sapere ' +
      'quali file sono aperti e cosa e’ selezionato.',
    tools: [
      tool(
        'mostra_diff',
        "Apre nell'editor il confronto nativo fra il prima e il dopo di un file.",
        {
          file: z.string().describe('percorso del file, relativo alla cartella di lavoro'),
          prima: z.string().describe('contenuto precedente'),
          dopo: z.string().describe('contenuto nuovo'),
        },
        async (a) => {
          await showDiff(a.file, a.prima, a.dopo);
          return text(`Diff di ${a.file} aperto nell'editor.`);
        }
      ),
      tool(
        'errori_editor',
        "Errori e avvisi che l'editor conosce gia' (linter, TypeScript, ecc.). Non riesegue niente.",
        { file: z.string().optional().describe('limita a un file; vuoto = tutti') },
        async (a) => text(diagnostics(a.file))
      ),
      tool(
        'file_aperti',
        "I file aperti adesso nell'editor, con quello attivo e cosa e' selezionato.",
        {},
        async () => text(openEditors())
      ),
      tool(
        'apri_file',
        "Apre un file nell'editor, eventualmente su una riga precisa.",
        {
          file: z.string().describe('percorso del file'),
          riga: z.number().optional().describe('riga su cui portarsi'),
        },
        async (a) => {
          await openFile(a.file, a.riga);
          return text(`Aperto ${a.file}${a.riga ? ':' + a.riga : ''}.`);
        }
      ),
    ],
  });
}
