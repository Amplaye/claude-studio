// The wire between the extension and the context panel. Same as the chat: one
// single place for the types, and what travels the wire is already formatted — the
// webview draws, it doesn't do the math.
import type { FocusHow } from './focus';
import type { TaskData } from '../tasks/protocol';

export interface CtxCard {
  id: string;
  shortId: string;
  /** The card's name: the one you gave it > tab name > first prompt > short id. */
  name: string;
  /** Where it comes from: our chat, or a tab of the official extension. */
  own: boolean;
  tabName: string;
  preview: string;
  /** Percentage of context used, or null if we don't know yet. */
  pct: number | null;
  tokens: string;
  /**
   * Costo in dollari, tenuto come dato ma non mostrato: nel pannello non serve
   * e faceva solo rumore accanto alla percentuale di contesto.
   */
  costUsd: number;
  lastClock: string;
  lastAgo: string;
  busy: boolean;
  /**
   * Ha finito e non l'hai ancora vista. Il suono dice che qualcosa e' pronto: questo
   * dice quale. Si spegne appena guardi quella conversazione.
   */
  done: boolean;
  recent: boolean;
  focused: boolean;
}

export interface CtxData {
  project: string;
  limit: string;
  focusHow: FocusHow;
  usage: { session: number | null; week: number | null } | null;
  usageWait: string;
  /** Da quanti secondi sono fermi i consumi: la cache sopravvive ai riavvii. */
  usageAgeSec: number | null;
  /** I numeri restano a schermo, ma smettono di spacciarsi per attuali. */
  usageStale: boolean;
  sessionReset: string;
  weekReset: string;
  cards: CtxCard[];
  branch: string;
  dirty: boolean;
  /** Somma dei costi delle conversazioni vive. Dato interno, non mostrato. */
  totalCostUsd: number;
}

/** Extension -> panel. */
export type CtxWire =
  | { k: 'data'; d: CtxData }
  // I passi che Claude sta spuntando, sotto l'ultima card. Stavano in un pannello
  // loro, che era un terzo riquadro da aprire per vedere una cosa che riguarda la
  // conversazione di cui hai gia' la card sotto gli occhi.
  | { k: 'tasks'; d: TaskData }
  // The panel has no settings of its own: the language is picked in the chat, and
  // this is how it gets here.
  | { k: 'lang'; value: 'en' | 'it' };

/**
 * Extension -> chat. The same data, but aimed at the context column the fullscreen
 * tab keeps beside itself: over there the sidebar panel doesn't exist, and without
 * this the tab would be the only face that sees nothing.
 */
export type CtxToChat = { k: 'ctx'; d: CtxData } | { k: 'tasks'; d: TaskData };

/** Panel -> extension. */
export type CtxCmd =
  | { cmd: 'ready' }
  | { cmd: 'refresh' }
  | { cmd: 'rename'; id: string }
  | { cmd: 'focus'; id: string }
  // Questa conversazione hai finito di guardarla: via la card, e con lei quello che
  // la teneva viva. Vedi ContextMonitor.close.
  | { cmd: 'close'; id: string }
  | { cmd: 'diagnose' };
