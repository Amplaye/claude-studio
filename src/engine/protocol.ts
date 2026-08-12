// Il filo fra estensione e webview. Un solo posto per i tipi, cosi' la webview e
// l'estensione non possono divergere in silenzio.

export type BlockKind = 'text' | 'thinking';

/** Le quattro modalita' che si scelgono dalla testata. L'SDK ne conosce altre. */
export type Mode = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions';

/**
 * Un permesso non e' sempre la stessa domanda:
 *  - `tool`     "posso usare questo strumento?"
 *  - `plan`     ExitPlanMode: "il piano va bene?"
 *  - `question` AskUserQuestion: domande a scelta multipla
 */
export type AskKind = 'tool' | 'plan' | 'question';

export interface AskOption {
  label: string;
  description?: string;
}

export interface AskQuestion {
  question: string;
  header: string;
  multiSelect?: boolean;
  options: AskOption[];
}

/** Estensione -> webview. */
export type Wire =
  | { k: 'hello'; cwd: string; project: string; cliVersion: string; surface: 'view' | 'panel' }
  | { k: 'session'; id: string; model: string; cwd: string }
  | { k: 'user'; text: string }
  | { k: 'turn_start' }
  | { k: 'block_start'; id: string; kind: BlockKind }
  | { k: 'delta'; id: string; kind: BlockKind; text: string }
  | { k: 'block_final'; id: string; kind: BlockKind; text: string }
  | { k: 'tool_start'; id: string; name: string; input: unknown }
  | { k: 'tool_end'; id: string; ok: boolean; text: string }
  | {
      k: 'ask';
      id: string;
      kind: AskKind;
      tool: string;
      title: string;
      detail: string;
      canAlways: boolean;
      plan?: string;
      questions?: AskQuestion[];
    }
  | { k: 'ask_done'; id: string; ok: boolean; label: string }
  | { k: 'mode'; value: Mode }
  | { k: 'turn_end'; ok: boolean; costUsd: number; durationMs: number; tokens: number }
  | { k: 'busy'; value: boolean }
  | { k: 'error'; message: string }
  | { k: 'reset' };

/** Webview -> estensione. */
export type Cmd =
  | { cmd: 'ready' }
  | { cmd: 'send'; text: string }
  | { cmd: 'interrupt' }
  | { cmd: 'newSession' }
  | { cmd: 'openTab' }
  | { cmd: 'answer'; id: string; choice: 'allow' | 'always' | 'deny'; answers?: Record<string, string> }
  | { cmd: 'setMode'; value: Mode };
