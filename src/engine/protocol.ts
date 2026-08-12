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

/** Il pensiero: lo decide il motore ("auto"), o lo decidi tu. */
export type Thinking = 'auto' | 'on' | 'off';

/** I suoni di fine lavoro. `off` = muto. */
export type SoundName = 'cozy' | 'harvest' | 'levelup' | 'starlit' | 'chest' | 'off';

/**
 * Le preferenze che si cambiano dalla testata e restano fra una sessione e
 * l'altra. Model/effort/thinking valgono per il motore, il resto per l'avviso
 * di fine lavoro.
 */
export interface Prefs {
  /** '' = quello predefinito della CLI. */
  model: string;
  /** '' = lo decide il motore. */
  effort: string;
  thinking: Thinking;
  sound: SoundName;
  /** 0..1 */
  volume: number;
  /** Suona solo se la finestra di VSCode non e' in primo piano. */
  onlyWhenAway: boolean;
  /** Suona anche quando serve un permesso: anche li' il lavoro e' fermo. */
  soundOnAsk: boolean;
  /** Avviso di VSCode quando finisce mentre stai altrove. */
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
 * Un modello fra quelli che la CLI dice di saper usare. L'elenco non sta scritto
 * da nessuna parte qui dentro: arriva dalla CLI installata, quindi il giorno che
 * esce un modello nuovo compare da solo, senza toccare l'estensione.
 */
export interface ModelChoice {
  value: string;
  label: string;
  description: string;
  /** Il modello vero dietro l'alias, es. "claude-opus-5[1m]". Serve solo a mostrarlo. */
  resolved: string;
  /** Livelli di impegno accettati da questo modello; vuoto = non li accetta. */
  efforts: string[];
  /** Sa decidere da solo quanto pensare. */
  adaptive: boolean;
  /** E' la scelta che la CLI consiglia: quella che avresti da terminale. */
  recommended: boolean;
}

/** Una conversazione gia' avvenuta, come appare nella cronologia. */
export interface HistoryItem {
  id: string;
  summary: string;
  /** millisecondi, ultimo tocco */
  when: number;
}

/** Estensione -> webview. */
export type Wire =
  | { k: 'hello'; cwd: string; project: string; cliVersion: string; surface: 'view' | 'panel' }
  | { k: 'session'; id: string; model: string; cwd: string }
  // Le immagini tornano indietro insieme al messaggio: nella chat restano
  // attaccate a quello che hai mandato, cosi' si vede che sono partite davvero.
  | { k: 'user'; text: string; images?: Pasted[] }
  | { k: 'turn_start' }
  // `parent` c'e' quando il pezzo arriva da un sub-agent: e' il tool_use_id del
  // Task che lo ha lanciato, ed e' li' sotto che va disegnato.
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
  // Il "suona adesso" lo decide l'estensione, non la pagina: e' l'unica a sapere
  // se la finestra e' in primo piano, e va detto a una faccia sola — due facce
  // aperte suonerebbero due volte.
  | { k: 'chime'; event: 'done' | 'ask'; sound: SoundName; volume: number }
  | { k: 'history'; items: HistoryItem[] }
  | { k: 'commands'; items: { name: string; description: string }[] }
  | { k: 'files'; items: string[] }
  // `file` vuoto = non c'e' piu' niente di selezionato nell'editor
  | { k: 'selection'; file: string; lines: string }
  | { k: 'turn_end'; ok: boolean; costUsd: number; durationMs: number; tokens: number }
  | { k: 'busy'; value: boolean }
  | { k: 'error'; message: string }
  | { k: 'reset' };

/** Webview -> estensione. */
/** Un'immagine incollata nel campo di scrittura. */
export interface Pasted {
  mime: string;
  /** base64 senza il prefisso data: */
  data: string;
}

export type Cmd =
  | { cmd: 'ready' }
  // `withSelection` = attacca il codice selezionato nell'editor; il testo lo prende
  // l'estensione dall'editor stesso, non viaggia due volte sul filo.
  | { cmd: 'send'; text: string; images?: Pasted[]; withSelection?: boolean }
  | { cmd: 'interrupt' }
  | { cmd: 'newSession' }
  | { cmd: 'openTab' }
  | { cmd: 'newTab' }
  | { cmd: 'answer'; id: string; choice: 'allow' | 'always' | 'deny'; answers?: Record<string, string> }
  | { cmd: 'setMode'; value: Mode }
  | { cmd: 'setPrefs'; value: Partial<Prefs> }
  | { cmd: 'history' }
  // `fork` = riprendi ma su un ramo nuovo, senza toccare la conversazione originale
  | { cmd: 'open'; id: string; fork?: boolean }
  | { cmd: 'files'; q: string }
  | { cmd: 'openFile'; path: string; line?: number };
