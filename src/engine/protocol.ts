// Il filo fra estensione e webview. Un solo posto per i tipi, cosi' la webview e
// l'estensione non possono divergere in silenzio.

export type BlockKind = 'text' | 'thinking';

/** Estensione -> webview. */
export type Wire =
  | { k: 'hello'; cwd: string; project: string; cliVersion: string }
  | { k: 'session'; id: string; model: string; cwd: string }
  | { k: 'user'; text: string }
  | { k: 'turn_start' }
  | { k: 'block_start'; id: string; kind: BlockKind }
  | { k: 'delta'; id: string; kind: BlockKind; text: string }
  | { k: 'block_final'; id: string; kind: BlockKind; text: string }
  | { k: 'tool_start'; id: string; name: string; input: unknown }
  | { k: 'tool_end'; id: string; ok: boolean; text: string }
  | { k: 'turn_end'; ok: boolean; costUsd: number; durationMs: number; tokens: number }
  | { k: 'busy'; value: boolean }
  | { k: 'error'; message: string }
  | { k: 'reset' };

/** Webview -> estensione. */
export type Cmd =
  | { cmd: 'ready' }
  | { cmd: 'send'; text: string }
  | { cmd: 'interrupt' }
  | { cmd: 'newSession' };
