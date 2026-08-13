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
 * The language the whole extension speaks. It isn't taken from VS Code's own
 * setting on purpose: plenty of people run an English editor and still want to
 * read their tools in Italian, and the other way round.
 */
export type Lang = 'en' | 'it';

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
  /** The language of the interface: it changes on the spot, nothing reloads. */
  lang: Lang;
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
  lang: 'en',
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
  | {
      k: 'hello';
      cwd: string;
      project: string;
      cliVersion: string;
      surface: 'view' | 'panel';
      /** The line for the empty screen, already chosen: see src/chat/tips.ts. */
      tip?: { en: string; it: string } | null;
    }
  | { k: 'session'; id: string; model: string; cwd: string }
  // Quale conversazione sta in *questa* faccia. La pagina non la disegna: se la
  // ricorda con vscode.setState, che e' l'unica memoria che sopravvive a
  // "Developer: Reload Window" restando attaccata alla singola scheda. Al ritorno
  // VS Code la ridà al deserializzatore, e ogni scheda riapre la sua invece di
  // trovarsi davanti quella di qualcun altro — o niente. Vuota = nessuna.
  | { k: 'sid'; id: string }
  // The images come back together with the message: in the chat they stay attached
  // to what you sent, so you can see they really went out. The other files do the
  // same — they leave as a list of paths folded into the prompt, which is stripped
  // from the echo, so without carrying them here a PDF would vanish the moment you
  // pressed Enter while a PNG stayed put.
  | { k: 'user'; text: string; images?: Pasted[]; files?: SentFile[] }
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
  | {
      k: 'commands';
      items: {
        name: string;
        description: string;
        /**
         * Which half of the menu it belongs in. `claude` is the built-in vocabulary —
         * /clear, /rewind, /resume — and `skill` is everything the CLI reports, which
         * is what the SDK's supportedCommands() actually returns.
         */
        group?: 'claude' | 'skill';
        /** e.g. "<file>": shown after the name so you know it wants an argument. */
        argumentHint?: string;
        /** /cost and /stats both reach /usage; typing either should find it. */
        aliases?: string[];
      }[];
    }
  | { k: 'files'; items: string[] }
  // The files you picked with the paperclip (or dropped on the composer), as the
  // extension found them on disk: images come back with their bytes so the chip can
  // show a thumbnail, everything else with a path Claude opens itself.
  | { k: 'attached'; items: Attachment[] }
  // empty `file` = there's nothing selected in the editor any more
  | { k: 'selection'; file: string; lines: string }
  | { k: 'turn_end'; ok: boolean; costUsd: number; durationMs: number; tokens: number }
  | { k: 'busy'; value: boolean }
  | { k: 'error'; message: string }
  // A new conversation draws the empty screen again, so it gets a new tip with it.
  | { k: 'reset'; tip?: { en: string; it: string } | null };

/** Webview -> extension. */
/** An image pasted into the composer. */
export interface Pasted {
  mime: string;
  /** base64 without the data: prefix */
  data: string;
}

/**
 * A file attached to the message.
 *
 * Two kinds, because there are two ways a file can be looked at. An image is
 * *seen*: it travels as bytes and goes into the message as an image block, the
 * same road a pasted screenshot takes. Anything else — a PDF, a spreadsheet, a
 * log, a zip, a video — travels as a path: Claude opens it with its own tools,
 * which is both the only way that works for every format and the only way that
 * doesn't put a 40MB file through a JSON pipe.
 */
export interface Attachment {
  kind: 'image' | 'file';
  /** absolute path on disk; empty only for something pasted, which has no file */
  path: string;
  name: string;
  /** bytes, as the disk reports them */
  size: number;
  /** images only */
  mime?: string;
  /** images only: base64 without the data: prefix */
  data?: string;
}

/** A file that goes along with the message as a path. */
export interface SentFile {
  path: string;
  name: string;
  /** Only for the chip in the chat: 0 when nobody measured it. */
  size?: number;
}

export type Cmd =
  | { cmd: 'ready' }
  // `withSelection` = attach the code selected in the editor; the extension takes the
  // text from the editor itself, it doesn't travel the wire twice.
  | { cmd: 'send'; text: string; images?: Pasted[]; files?: SentFile[]; withSelection?: boolean }
  // The paperclip: VS Code's own picker, with no filter on it at all.
  | { cmd: 'pickFiles' }
  // Something dropped on the composer that isn't on disk anywhere the extension can
  // reach (dragged out of a browser, out of an email). The bytes are put into a file
  // in the extension's own storage and it's that path that gets attached.
  | { cmd: 'stashFile'; name: string; data: string }
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
  | { cmd: 'openFile'; path: string; line?: number }
  // "My audio is awake": a page can only make a sound once you've touched it, and
  // the chime has to go to one that can actually be heard. See chat/sound.ts.
  | { cmd: 'audio'; ok: boolean }
  // A webview's clipboard can be refused; VS Code's never is. The page tries its
  // own first and falls back to here.
  | { cmd: 'copy'; text: string }
  // Links open in the browser: a webview that navigates away from the chat has
  // no way back to it.
  | { cmd: 'openLink'; url: string };
