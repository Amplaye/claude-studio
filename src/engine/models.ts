// Quali modelli offre la CLI installata, chiesto senza aprire una conversazione.
//
// L'elenco arrivava solo col primo messaggio, e fino a li' le carte mostravano quello
// messo da parte dalla CLI di prima. Il 23/09 la CLI si e' aggiornata da sola alla
// versione che chiama «opus» Opus 5.5, e il pannello ha continuato a dire «Opus 5»
// finche' non si e' scritto qualcosa — mentre il motore usava gia' il 5.5.
//
// L'elenco pero' non ha bisogno di un messaggio: `supportedModels()` aspetta solo la
// stretta di mano iniziale. Si accende la CLI, si chiede, si spegne. Nessun turno,
// nessuna conversazione scritta su disco, nessun costo; un paio di secondi, una volta
// per versione della CLI.
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { ModelInfo } from '@anthropic-ai/claude-agent-sdk';
import { versionOf } from './cli';
import type { ModelChoice } from './protocol';

/**
 * L'elenco della CLI nella forma che serve al pannello. Una sola traduzione, usata
 * dalla sessione accesa e dalla domanda a vuoto qui sotto: due copie prima o poi
 * direbbero due cose diverse dello stesso modello.
 */
export function toChoices(list: ModelInfo[]): ModelChoice[] {
  return list
    .map((m) => ({
      value: String(m.value ?? ''),
      label: String(m.displayName || m.value || ''),
      description: String(m.description ?? '').slice(0, 160),
      resolved: String(m.resolvedModel ?? ''),
      efforts: m.supportsEffort ? [...(m.supportedEffortLevels ?? ['low', 'medium', 'high'])] : [],
      adaptive: m.supportsAdaptiveThinking !== false,
      // "default" e' l'alias che segue quello che la CLI consiglia oggi: chi lo
      // sceglie si ritrova il modello nuovo il giorno che esce, senza fare niente.
      recommended: String(m.value ?? '') === 'default',
    }))
    .filter((m) => m.value);
}

/** Oltre questo la CLI non risponde: l'elenco arrivera' col primo messaggio, come prima. */
const PATIENCE_MS = 30_000;

/** Una domanda per versione: con tre schede che tornano al reload si chiede una volta. */
const asked = new Map<string, Promise<ModelChoice[]>>();

/** I modelli che offre la CLI in `cli`, cosi' com'e' adesso sul disco. */
export function askModels(cli: string, cwd: string): Promise<ModelChoice[]> {
  const key = `${cli}@${versionOf(cli)}`;
  let p = asked.get(key);
  if (!p) {
    p = handshake(cli, cwd);
    asked.set(key, p);
    // Andata male si riprova la volta dopo, invece di ricordarsi il fallimento.
    p.catch(() => asked.delete(key));
  }
  return p;
}

async function handshake(cli: string, cwd: string): Promise<ModelChoice[]> {
  const ac = new AbortController();
  let release = () => {};
  const hold = new Promise<void>((r) => (release = r));
  // Un input che non manda niente: la CLI si accende, si presenta e aspetta.
  async function* nothing(): AsyncGenerator<never> {
    await hold;
  }
  const q = query({
    prompt: nothing(),
    options: {
      cwd,
      pathToClaudeCodeExecutable: cli,
      abortController: ac,
      // I server MCP non servono a sapere i modelli: non li si accende per niente.
      strictMcpConfig: true,
      env: { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: 'claude-studio' },
    },
  });
  const timer = setTimeout(() => ac.abort(), PATIENCE_MS);
  try {
    return toChoices(await q.supportedModels());
  } finally {
    clearTimeout(timer);
    release();
    ac.abort();
    // Spegnerla chiude il flusso con un errore: lo si beve qui, se no finisce fra le
    // promesse rifiutate che nessuno ascolta.
    void (async () => {
      try {
        for await (const _ of q) {
          /* niente da leggere */
        }
      } catch {
        /* spenta da noi */
      }
    })();
  }
}
