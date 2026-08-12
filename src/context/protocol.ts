// Il filo fra estensione e pannello del contesto. Come per la chat: un solo posto
// per i tipi, e sul filo passano dati gia' formattati — la webview disegna, non fa
// i conti.
import type { FocusHow } from './focus';

export interface CtxCard {
  id: string;
  shortId: string;
  /** Nome della card: quello che hai dato tu > nome tab > primo prompt > id corto. */
  name: string;
  /** Da dove viene: la nostra chat, oppure una tab dell'estensione ufficiale. */
  own: boolean;
  tabName: string;
  preview: string;
  /** Percentuale di contesto occupato, oppure null se non si sa ancora. */
  pct: number | null;
  tokens: string;
  cost: string;
  lastClock: string;
  lastAgo: string;
  busy: boolean;
  recent: boolean;
  focused: boolean;
}

export interface CtxData {
  project: string;
  limit: string;
  focusHow: FocusHow;
  usage: { session: number | null; week: number | null } | null;
  usageWait: string;
  sessionReset: string;
  weekReset: string;
  cards: CtxCard[];
  branch: string;
  dirty: boolean;
  /** Somma dei costi delle conversazioni vive: e' il dato che la 0.0.6 buttava via. */
  totalCost: string;
}

/** Estensione -> pannello. */
export type CtxWire = { k: 'data'; d: CtxData };

/**
 * Estensione -> chat. Gli stessi dati, ma diretti alla colonna del contesto che la
 * scheda a tutto schermo si tiene di fianco: li' il pannello della barra laterale
 * non c'e', e senza questo la scheda sarebbe l'unica faccia a non vedere niente.
 */
export type CtxToChat = { k: 'ctx'; d: CtxData };

/** Pannello -> estensione. */
export type CtxCmd =
  | { cmd: 'ready' }
  | { cmd: 'refresh' }
  | { cmd: 'rename'; id: string }
  | { cmd: 'focus'; id: string }
  | { cmd: 'diagnose' };
