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

/**
 * Il ragionamento: acceso o spento. Lo decidi tu.
 *
 * C'era anche un "auto", che voleva dire "non dire niente al motore e lascia fare
 * alla CLI". Non era una scelta in piu': la CLI, a cui non dici niente, accende
 * comunque il ragionamento adattivo sui modelli che lo sanno fare — cioe' fa quello
 * che fa gia' "acceso". Due bottoni per la stessa cosa, e uno dei due sembrava
 * cedere la decisione a qualcun altro.
 */
export type Thinking = 'on' | 'off';

/**
 * I livelli d'impegno, nell'ordine che conta.
 *
 * Da `xhigh` in su il ragionamento **deve** essere acceso, e non e' una nostra
 * regola: e' l'API che rifiuta la richiesta, testualmente —
 *
 *   400 output_config.effort 'xhigh' is not supported when thinking is disabled on
 *   this model. Use effort 'high' or below, or enable thinking.
 *
 * Per questo si tiene l'ordine e non un elenco dei due nomi: un livello nuovo che
 * arrivasse sopra questi ci finisce dentro da solo, senza che nessuno se ne ricordi.
 * Il gemello di questa riga sta in `webview/chat.js` — la webview non e' bundlata e
 * non puo' importare da qui (vedi build.mjs).
 */
export const EFFORT_ORDER = ['low', 'medium', 'high', 'xhigh', 'max'] as const;

/** Il primo livello che pretende il ragionamento acceso. */
const THINKING_FROM = EFFORT_ORDER.indexOf('xhigh');

/** Questo impegno obbliga ad accendere il ragionamento? */
export function needsThinking(effort: string): boolean {
  const i = EFFORT_ORDER.indexOf(effort as (typeof EFFORT_ORDER)[number]);
  return i >= 0 && i >= THINKING_FROM;
}

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
  /**
   * Sempre un modello vero. Vuoto solo prima che la CLI abbia detto quali esistono:
   * appena arriva l'elenco diventa quello che la CLI consiglia oggi.
   */
  model: string;
  /**
   * Sempre un livello vero. Vuoto solo in due casi: prima che l'elenco sia
   * arrivato, e sui modelli che i livelli non li prendono affatto.
   */
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
  /**
   * L'editor segue Claude: ogni file che tocca si apre di fianco, scorre alle righe
   * cambiate e le illumina per un attimo.
   *
   * Il fuoco non si sposta mai (`preserveFocus`), che e' l'unico motivo per cui questa
   * puo' stare accesa di serie: vedi il codice muoversi mentre continui a scrivere
   * nella chat. Spegnibile lo stesso — con dieci modifiche di fila in un file solo
   * c'e' chi preferisce leggere il diff a lavoro finito.
   */
  follow: boolean;
  /**
   * Gli errori che l'editor gia' conosce, rimandati indietro da soli.
   *
   * A fine turno si guardano le diagnostiche dei soli file toccati; quelle che prima
   * del turno non c'erano sono roba di questo turno, e vanno sistemate. Il giro si
   * chiude da se' al massimo `FIX_ROUNDS` volte, poi si ferma e te lo dice: un
   * modello che sbaglia due volte di fila la stessa correzione non la indovina alla
   * decima, e nel frattempo spende.
   */
  autofix: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  model: '',
  effort: '',
  thinking: 'on',
  sound: 'cozy',
  volume: 0.6,
  onlyWhenAway: false,
  soundOnAsk: true,
  toast: true,
  lang: 'en',
  follow: true,
  autofix: true,
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

/** I quattro pezzi dell'ultima chiamata API del filo principale. */
export interface TurnCtx {
  input: number;
  cacheRead: number;
  cacheCreate: number;
  output: number;
}

/**
 * Quello che un modello ha consumato in un turno. Non c'e' nessun listino prezzi
 * scritto qui dentro: il costo lo dice il motore (`modelUsage[...].costUSD`), come
 * la finestra di contesto. Un listino a mano invecchia; questo no.
 */
export interface TurnModelUsage {
  /** Come lo chiama il motore, es. "claude-opus-5[1m]". */
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheCreate: number;
  costUsd: number;
  /** 0 se il motore non l'ha detto. */
  contextWindow: number;
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
  // `cp` e' il checkpoint che questo messaggio ha aperto: com'era il codice un attimo
  // prima che partisse. Viaggia fin qui perche' la freccia disegnata accanto al
  // messaggio possa dire "torna a questo punto" — i checkpoint funzionavano da
  // sempre, ma l'unica porta era "/rewind" e un elenco a scelta rapida. Assente
  // quando il messaggio non ne ha uno: una conversazione ripescata dalla cronologia
  // e' fatta di parole gia' dette, e non c'e' nessun codice messo da parte dietro.
  | { k: 'user'; text: string; images?: Pasted[]; files?: SentFile[]; cp?: number }
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
  // Quale delle due facce della scheda si guarda: la chat, o la pianta
  // dell'ufficio. Il bottone nella testata la gira da solo senza passare di qui;
  // questo serve a chi la chiede da fuori — il comando, o la testata della barra
  // laterale, che aprono la scheda gia' sulla faccia giusta.
  | { k: 'view'; value: 'chat' | 'office' }
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
  | { k: 'files'; items: PickItem[] }
  // The files you picked with the paperclip (or dropped on the composer), as the
  // extension found them on disk: images come back with their bytes so the chip can
  // show a thumbnail, everything else with a path Claude opens itself.
  | { k: 'attached'; items: Attachment[] }
  // Il contenuto di un allegato, per guardarlo senza uscire dalla chat. Solo quello
  // che una pagina sa davvero disegnare: un'immagine, o del testo. Tutto il resto —
  // un PDF, un foglio di calcolo, un video — non arriva qui affatto: lo apre il
  // programma che sul computer lo apre gia' (vedi chat/attach.ts).
  | {
      k: 'preview';
      name: string;
      path: string;
      kind: 'image' | 'text';
      /** immagini */
      mime?: string;
      /** immagini: base64 senza il prefisso data: */
      data?: string;
      /** testo */
      text?: string;
      /** Il file era piu' lungo di quanto se ne guarda: si vede l'inizio. */
      clipped?: boolean;
    }
  // empty `file` = there's nothing selected in the editor any more
  | { k: 'selection'; file: string; lines: string }
  | {
      k: 'turn_end';
      ok: boolean;
      /**
       * Quanto e' costata la *sessione* finora. E' `total_cost_usd`, che l'SDK
       * documenta come cumulativo: ogni fine turno riporta il totale corrente, non
       * quello del turno. Si legge, non si somma — sommarlo conta ogni turno tante
       * volte quanti ne sono passati. Il nome dice cumulativo apposta: quando si
       * chiamava `costUsd` qualcuno lo sommava.
       */
      totalUsd: number;
      /** Quanto e' costato *questo* turno: la differenza di `modelUsage` col turno
       *  prima. Sub-agent compresi — sono soldi veri quanto gli altri. */
      turnUsd: number;
      durationMs: number;
      /** Contesto che si porta dietro l'ultima chiamata del filo principale. */
      tokens: number;
      /**
       * Gli stessi token, ma divisi. Il totale da solo non dice la cosa che conta:
       * se `cacheRead` crolla e `cacheCreate` esplode, la cache e' stata buttata via
       * — ed e' l'unico modo per accorgersene.
       */
      ctx: TurnCtx;
      /** Cosa ha consumato questo turno, modello per modello. */
      models: TurnModelUsage[];
      /** Il modello che ha davvero risposto, come lo dichiara lui: "claude-opus-5". */
      model: string;
      /** Il livello d'impegno in vigore per questo turno. '' = quello della CLI. */
      effort: string;
    }
  // Un messaggio scritto mentre Claude lavora. Il motore li mette in fila da sempre,
  // ma la chat lo disegnava come un messaggio gia' spedito: non si capiva che stava
  // aspettando, non lo si poteva togliere, e due in fila erano indistinguibili da due
  // gia' partiti. Finche' e' in coda non entra nel discorso, sta sopra la barra di
  // scrittura; quando parte davvero arriva il suo 'user' come per tutti gli altri.
  | { k: 'queued'; id: string; text: string; images?: Pasted[]; files?: SentFile[] }
  /**
   * Uscito dalla coda. E `sent` dice quale delle due cose e' successa, che non e' un
   * dettaglio: partito e ritirato sono opposti, e finche' la riga usciva con la stessa
   * animazione in tutti e due i casi non c'era modo di sapere se il messaggio era stato
   * preso in carico o buttato via — con la × li' accanto, che e' il posto peggiore in cui
   * avere un dubbio del genere.
   */
  | { k: 'unqueued'; id: string; sent?: boolean }
  /**
   * Una task della CLI, come la racconta il motore.
   *
   * Non e' piu' un tool. TodoWrite, TaskCreate e TaskUpdate — i tre strumenti che
   * questo pannello ascoltava — dalla CLI sono spariti: chiedendoglieli, il modello
   * risponde che non ce l'ha, e infatti l'elenco restava vuoto per sessioni intere.
   * Quello che oggi la CLI chiama task sono i sub-agent, e non li annuncia con una
   * chiamata a un tool: li annuncia con dei messaggi di sistema suoi —
   * `task_started`, `task_progress`, `task_updated` — che e' la sorgente che il suo
   * pannello usa e che qui non ascoltava nessuno.
   */
  | {
      k: 'task';
      id: string;
      /** Come si chiama: "Count .ts files in src". */
      description?: string;
      /** Cosa sta facendo proprio adesso: "Running find …". */
      doing?: string;
      status?: 'pending' | 'running' | 'completed' | 'failed' | 'killed' | 'paused';
    }
  /**
   * Gli errori che l'editor gia' conosceva, rimandati indietro da soli.
   *
   * A fine turno si guardano le diagnostiche dei soli file che quel turno ha toccato,
   * e solo quelle che prima non c'erano: quelle sono roba di adesso, e vanno chiuse
   * prima che tu debba accorgertene tu. Non e' un messaggio tuo — non entra nel
   * discorso come se l'avessi scritto — ed e' una card che si vede, perche' un turno
   * che riparte da solo senza dire niente e' la cosa piu' inquietante che un pannello
   * possa fare.
   *
   * `gaveUp`: i giri sono finiti e gli errori no. Meglio dirlo che riprovare per
   * sempre — un modello che sbaglia due volte la stessa correzione non la indovina
   * alla decima, e nel frattempo spende.
   */
  | { k: 'autofix'; n: number; files: string[]; round: number; gaveUp?: boolean }
  | { k: 'busy'; value: boolean }
  | { k: 'error'; message: string }
  // A new conversation draws the empty screen again, so it gets a new tip with it.
  | { k: 'reset'; tip?: { en: string; it: string } | null };

/**
 * Una riga del menu che si apre scrivendo "@".
 *
 * Quello che entra nel messaggio e' sempre `path`, perche' e' l'unica cosa che "@"
 * sa espandere. Gli altri campi ci sono solo quando la riga arriva da una ricerca
 * fra i simboli — allora la riga dice il nome, il tipo e a che altezza sta, che e'
 * come si riconosce quale dei quattro `parse` si sta allegando.
 */
export interface PickItem {
  /** percorso relativo alla cartella di lavoro */
  path: string;
  /** il simbolo trovato li' dentro: "Session.send" */
  symbol?: string;
  /** "function", "class", "method"… */
  kind?: string;
  /** 1-based */
  line?: number;
}

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
  // "Portami all'ufficio": non gira questa scheda, ne chiede una sua.
  | { cmd: 'openOffice' }
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
  // "Fammelo vedere": l'anteprima di un allegato, di qualunque tipo sia.
  | { cmd: 'preview'; path: string }
  // "Quello che ho scritto mentre lavoravi, lascia perdere": toglie dalla fila un
  // messaggio che non e' ancora partito.
  | { cmd: 'unqueue'; id: string }
  // "Volevo dire un'altra cosa": le parole di un messaggio ancora in fila, cambiate
  // dove sta, senza ritirarlo e riscriverlo da capo — e senza fargli perdere il posto.
  | { cmd: 'editQueued'; id: string; text: string }
  // "Torna a questo messaggio": la freccia accanto a un messaggio tuo. E' lo stesso
  // "/rewind" di sempre, saltato il primo passo — il punto l'hai gia' indicato.
  | { cmd: 'rewind'; id: number }
  // "My audio is awake": a page can only make a sound once you've touched it, and
  // the chime has to go to one that can actually be heard. See chat/sound.ts.
  | { cmd: 'audio'; ok: boolean }
  // A webview's clipboard can be refused; VS Code's never is. The page tries its
  // own first and falls back to here.
  | { cmd: 'copy'; text: string }
  // Links open in the browser: a webview that navigates away from the chat has
  // no way back to it.
  | { cmd: 'openLink'; url: string };
