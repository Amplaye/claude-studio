// The conversations born from the Claude Studio chat.
//
// This is where putting the chat and the context bar in the same extension really
// pays off. For the official extension's tabs, the hook between "what you're looking
// at" and "which session it is" stays a cascade of attempts, and when it fails the
// card says so ("estimated"). Not for ours: we opened the session, so the id, the
// title, whether it's working and where you're looking at it are facts, not riddles.
import type { Wire } from '../engine/protocol';

export interface OwnSession {
  id: string;
  cwd: string;
  model: string;
  startedAt: number;
  updatedAt: number;
  /** The first message written: it's the name you read on the card. */
  title: string;
  /** Context of the last turn, exactly as it came from the engine. */
  tokens: number;
  /** Cost the engine declares for the conversation. */
  costUsd: number;
  busy: boolean;
}

class OwnedSessions {
  private cur?: OwnSession;
  /** Where you're looking at the chat: tab in front, sidebar panel open. */
  private panelActive = false;
  private viewVisible = false;
  private listeners = new Set<() => void>();

  onChange(fn: () => void): { dispose(): void } {
    this.listeners.add(fn);
    return { dispose: () => this.listeners.delete(fn) };
  }

  current(): OwnSession | undefined {
    return this.cur;
  }

  /** Is the chat in front of your eyes right now? It decides which session is focused. */
  looking(): 'panel' | 'view' | null {
    if (this.panelActive) return 'panel';
    if (this.viewVisible) return 'view';
    return null;
  }

  setPanelActive(v: boolean) {
    if (this.panelActive === v) return;
    this.panelActive = v;
    this.changed();
  }

  setViewVisible(v: boolean) {
    if (this.viewVisible === v) return;
    this.viewVisible = v;
    this.changed();
  }

  /**
   * The chat hands over everything it sends to the webview: here we keep only what
   * the card needs. That way the controller doesn't have to remember to notify twice.
   */
  observe(e: Wire, cwd: string) {
    switch (e.k) {
      case 'session': {
        const now = Date.now();
        // Same session picked up again: we keep what we already knew.
        if (this.cur?.id === e.id) {
          this.cur.model = e.model;
          this.cur.updatedAt = now;
          break;
        }
        this.cur = {
          id: e.id,
          cwd: e.cwd || cwd,
          model: e.model,
          startedAt: now,
          updatedAt: now,
          title: this.cur?.title ?? '',
          tokens: 0,
          costUsd: 0,
          busy: false,
        };
        break;
      }
      case 'user':
        // The card's name is the first thing you wrote, not the last: changing it on
        // every message would make the list dance in front of your eyes.
        if (!this.cur) {
          this.cur = blank(cwd);
        }
        if (!this.cur.title) this.cur.title = e.text.replace(/\s+/g, ' ').trim().slice(0, 80);
        this.cur.updatedAt = Date.now();
        break;
      case 'turn_end':
        if (!this.cur) break;
        if (e.tokens) this.cur.tokens = e.tokens;
        if (e.costUsd) this.cur.costUsd = e.costUsd;
        this.cur.updatedAt = Date.now();
        break;
      case 'busy':
        if (!this.cur) break;
        this.cur.busy = e.value;
        this.cur.updatedAt = Date.now();
        break;
      case 'tool_start':
      case 'block_final':
        if (this.cur) this.cur.updatedAt = Date.now();
        return; // continuous stuff: not worth a redraw for every piece
      default:
        return;
    }
    this.changed();
  }

  /**
   * A past conversation reopened from the history.
   *
   * The engine doesn't start until you send the next message, so without this the
   * id would stay empty for as long as you sat there reading — and a card with no
   * id isn't drawn at all. You'd have switched conversation and the context panel
   * would still be pointing at the one before, or at somebody else's tab. The id
   * is known the moment you click: there's nothing to wait for.
   */
  adopt(id: string, cwd: string, title = '') {
    if (!id) return;
    const now = Date.now();
    this.cur = {
      id,
      cwd,
      model: this.cur?.model ?? '',
      startedAt: now,
      updatedAt: now,
      title,
      tokens: 0,
      costUsd: 0,
      busy: false,
    };
    this.changed();
  }

  /** Conversation cleared or extension closed: the card has no reason to exist. */
  end() {
    if (!this.cur) return;
    this.cur = undefined;
    this.changed();
  }

  private changed() {
    for (const fn of this.listeners) {
      try {
        fn();
      } catch {
        /* a listener must never be able to bring the chat down */
      }
    }
  }
}

function blank(cwd: string): OwnSession {
  const now = Date.now();
  return {
    id: '',
    cwd,
    model: '',
    startedAt: now,
    updatedAt: now,
    title: '',
    tokens: 0,
    costUsd: 0,
    busy: false,
  };
}

export const owned = new OwnedSessions();
