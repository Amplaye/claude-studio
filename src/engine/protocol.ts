// The wire between the extension and the webview. One single place for the types, so
// the webview and the extension can't silently drift apart.

export type BlockKind = 'text' | 'thinking';

/** The four modes you pick from the header. The SDK knows others. */
export type Mode = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions';

/**
 * A permission isn't always the same question:
 *  - `tool`     "may I use this tool?"
 *  - `plan`     ExitPlanMode: "is the plan alright?"
 *  - `question` AskUserQuestion: multiple-choice questions
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

/** The thinking: the engine decides it ("auto"), or you do. */
export type Thinking = 'auto' | 'on' | 'off';

/** The end-of-work sounds. `off` = muted. */
export type SoundName = 'cozy' | 'harvest' | 'levelup' | 'starlit' | 'chest' | 'off';

/**
 * The preferences you change from the header and that survive from one session to
 * the next. Model/effort/thinking are for the engine, the rest for the end-of-work
 * notice.
 */
export interface Prefs {
  /** '' = the CLI's default one. */
  model: string;
  /** '' = the engine decides. */
  effort: string;
  thinking: Thinking;
  sound: SoundName;
  /** 0..1 */
  volume: number;
  /** Only plays if the VSCode window isn't in front. */
  onlyWhenAway: boolean;
  /** Plays when a permission is needed too: the work is stopped there as well. */
  soundOnAsk: boolean;
  /** VSCode notification when it finishes while you're elsewhere. */
  toast: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  model: '',
  effort: '',
  thinking: 'auto',
  sound: 'cozy',
  volume: 0.6,
  onlyWhenAway: false,
  soundOnAsk: true,
  toast: true,
};

/**
 * One of the models the CLI says it knows how to use. The list isn't written
 * anywhere in here: it comes from the installed CLI, so the day a new model ships it
 * appears on its own, without touching the extension.
 */
export interface ModelChoice {
  value: string;
  label: string;
  description: string;
  /** The real model behind the alias, e.g. "claude-opus-5[1m]". Only used for display. */
  resolved: string;
  /** Effort levels this model accepts; empty = it doesn't accept them. */
  efforts: string[];
  /** It can decide by itself how much to think. */
  adaptive: boolean;
  /** It's the choice the CLI recommends: the one you'd get from the terminal. */
  recommended: boolean;
}

/** A conversation that already happened, as it appears in the history. */
export interface HistoryItem {
  id: string;
  summary: string;
  /** milliseconds, last touch */
  when: number;
}

/** Extension -> webview. */
export type Wire =
  | { k: 'hello'; cwd: string; project: string; cliVersion: string; surface: 'view' | 'panel' }
  | { k: 'session'; id: string; model: string; cwd: string }
  // The images come back together with the message: in the chat they stay attached
  // to what you sent, so you can see they really went out.
  | { k: 'user'; text: string; images?: Pasted[] }
  | { k: 'turn_start' }
  // `parent` is there when the piece comes from a sub-agent: it's the tool_use_id of
  // the Task that launched it, and that's where underneath it has to be drawn.
  | { k: 'block_start'; id: string; kind: BlockKind; parent?: string | null }
  | { k: 'delta'; id: string; kind: BlockKind; text: string; parent?: string | null }
  | { k: 'block_final'; id: string; kind: BlockKind; text: string; parent?: string | null }
  | { k: 'tool_start'; id: string; name: string; input: unknown; parent?: string | null }
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
  | { k: 'prefs'; value: Prefs }
  | { k: 'models'; items: ModelChoice[] }
  // The "play now" is decided by the extension, not the page: it's the only one that
  // knows whether the window is in front, and it has to be told to a single face —
  // two open faces would play twice.
  | { k: 'chime'; event: 'done' | 'ask'; sound: SoundName; volume: number }
  | { k: 'history'; items: HistoryItem[] }
  | { k: 'commands'; items: { name: string; description: string }[] }
  | { k: 'files'; items: string[] }
  // empty `file` = there's nothing selected in the editor any more
  | { k: 'selection'; file: string; lines: string }
  | { k: 'turn_end'; ok: boolean; costUsd: number; durationMs: number; tokens: number }
  | { k: 'busy'; value: boolean }
  | { k: 'error'; message: string }
  | { k: 'reset' };

/** Webview -> extension. */
/** An image pasted into the composer. */
export interface Pasted {
  mime: string;
  /** base64 without the data: prefix */
  data: string;
}

export type Cmd =
  | { cmd: 'ready' }
  // `withSelection` = attach the code selected in the editor; the extension takes the
  // text from the editor itself, it doesn't travel the wire twice.
  | { cmd: 'send'; text: string; images?: Pasted[]; withSelection?: boolean }
  | { cmd: 'interrupt' }
  | { cmd: 'newSession' }
  | { cmd: 'openTab' }
  | { cmd: 'newTab' }
  // The page has already played its exit animation: here it really closes.
  | { cmd: 'closeTab' }
  | { cmd: 'answer'; id: string; choice: 'allow' | 'always' | 'deny'; answers?: Record<string, string> }
  | { cmd: 'setMode'; value: Mode }
  | { cmd: 'setPrefs'; value: Partial<Prefs> }
  | { cmd: 'history' }
  // `fork` = resume but on a new branch, without touching the original conversation
  | { cmd: 'open'; id: string; fork?: boolean }
  | { cmd: 'files'; q: string }
  | { cmd: 'openFile'; path: string; line?: number };
