// The conversations born from the Claude Studio chat.
//
// This is where putting the chat and the context bar in the same extension really
// pays off. For the official extension's tabs, the hook between "what you're looking
// at" and "which session it is" stays a cascade of attempts, and when it fails the
// card says so ("estimated"). Not for ours: we opened the session, so the id, the
// title, whether it's working and where you're looking at it are facts, not riddles.
//
// One entry per chat controller, not one full stop. Every Studio tab opened with "+"
// is a conversation of its own with its own engine; only the first one used to be
// tracked, so with three tabs open the panel drew one card, the "here" badge never
// moved and the tokens you were spending in the other two were nobody's. Now each
// one registers itself under its own key, and the one whose face is in front is the
// one wearing the badge.
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
  /**
   * Ha finito, e tu non stavi guardando.
   *
   * Con tre schede aperte il suono dice che *qualcosa* ha finito, non quale: te le
   * apri a una a una per scoprirlo. Questo e' il segnalino che risponde alla
   * domanda — resta acceso finche' non guardi quella conversazione, e allora si
   * spegne da solo.
   */
  done: boolean;
  /** Quando ha finito: serve solo a ordinare "chi ha finito per ultimo". */
  doneAt: number;
  /** Which chat this belongs to: the key that reveals its face again. */
  key: string;
}

/** Where a conversation is on screen. */
export type Face = 'panel' | 'view';

class OwnedSessions {
  private byKey = new Map<string, OwnSession>();
  /** Where each conversation is on show right now, if it is. */
  private faces = new Map<string, Face>();
  /**
   * The last face to come to the front. Visibility alone isn't enough: with the
   * sidebar open beside a tab, two are on screen and only one is the one you're
   * working in — the one you touched last.
   */
  private front: string | null = null;
  private listeners = new Set<() => void>();

  onChange(fn: () => void): { dispose(): void } {
    this.listeners.add(fn);
    return { dispose: () => this.listeners.delete(fn) };
  }

  /** Every conversation this extension has open, newest activity first. */
  all(): OwnSession[] {
    return [...this.byKey.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /** The one you're in: the face in front, or the only one there is. */
  current(): OwnSession | undefined {
    if (this.front && this.byKey.has(this.front)) return this.byKey.get(this.front);
    const shown = [...this.faces.keys()].find((k) => this.byKey.has(k));
    if (shown) return this.byKey.get(shown);
    return this.byKey.size === 1 ? [...this.byKey.values()][0] : undefined;
  }

  /** Is a chat of ours in front of your eyes right now? */
  looking(): Face | null {
    const cur = this.current();
    return (cur && this.faces.get(cur.key)) ?? null;
  }

  /** Which chat holds this conversation, and where it is: for going back to it. */
  hosting(id: string): { key: string; face: Face | null } | null {
    for (const s of this.byKey.values()) {
      if (s.id && s.id === id) return { key: s.key, face: this.faces.get(s.key) ?? null };
    }
    return null;
  }

  /** A face came on screen, or left it. */
  setFace(key: string, face: Face, on: boolean) {
    const had = this.faces.get(key);
    if (on) {
      // Guardare e' la risposta: il segnalino ha finito il suo mestiere nel
      // momento in cui la conversazione ti torna davanti agli occhi.
      const cleared = this.clearDone(key);
      if (had === face && this.front === key) {
        if (cleared) this.changed();
        return;
      }
      this.faces.set(key, face);
      this.front = key;
    } else {
      if (had !== face) return;
      this.faces.delete(key);
      if (this.front === key) this.front = null;
    }
    this.changed();
  }

  /**
   * Ha finito. Il segnalino si accende solo se non la stavi guardando: se eri li'
   * l'hai vista finire, e un bollino su quello che hai appena letto e' rumore.
   */
  markDone(key: string, looking: boolean) {
    const s = this.byKey.get(key);
    if (!s || looking) return;
    s.done = true;
    s.doneAt = Date.now();
    this.changed();
  }

  /** Spegne il segnalino. Torna true se c'era davvero qualcosa da spegnere. */
  clearDone(key: string): boolean {
    const s = this.byKey.get(key);
    if (!s?.done) return false;
    s.done = false;
    s.doneAt = 0;
    return true;
  }

  /** Questa conversazione ha finito mentre guardavi altrove? */
  isDone(key: string): boolean {
    return !!this.byKey.get(key)?.done;
  }

  /** Quante hanno finito e non le hai ancora viste: e' il numero sul bollino. */
  doneCount(): number {
    return [...this.byKey.values()].filter((s) => s.done).length;
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
  adopt(key: string, id: string, cwd: string, title = '') {
    if (!id) return;
    const now = Date.now();
    this.byKey.set(key, {
      id,
      cwd,
      model: this.byKey.get(key)?.model ?? '',
      startedAt: now,
      updatedAt: now,
      title,
      tokens: 0,
      costUsd: 0,
      busy: false,
      done: false,
      doneAt: 0,
      key,
    });
    this.changed();
  }

  /**
   * The chat hands over everything it sends to the webview: here we keep only what
   * the card needs. That way the controller doesn't have to remember to notify twice.
   */
  observe(key: string, e: Wire, cwd: string) {
    const cur = this.byKey.get(key);
    switch (e.k) {
      case 'session': {
        const now = Date.now();
        // Same session picked up again: we keep what we already knew.
        if (cur?.id === e.id) {
          cur.model = e.model;
          cur.updatedAt = now;
          break;
        }
        this.byKey.set(key, {
          id: e.id,
          cwd: e.cwd || cwd,
          model: e.model,
          startedAt: now,
          updatedAt: now,
          title: cur?.title ?? '',
          tokens: 0,
          costUsd: 0,
          busy: false,
          done: false,
          doneAt: 0,
          key,
        });
        break;
      }
      case 'user': {
        // The card's name is the first thing you wrote, not the last: changing it on
        // every message would make the list dance in front of your eyes.
        const s = cur ?? blank(cwd, key);
        if (!cur) this.byKey.set(key, s);
        if (!s.title) s.title = e.text.replace(/\s+/g, ' ').trim().slice(0, 80);
        s.updatedAt = Date.now();
        break;
      }
      case 'turn_end':
        if (!cur) break;
        if (e.tokens) cur.tokens = e.tokens;
        // Si assegna, non si somma: il motore manda gia' il totale della sessione.
        if (e.totalUsd) cur.costUsd = e.totalUsd;
        cur.updatedAt = Date.now();
        break;
      case 'busy':
        if (!cur) break;
        cur.busy = e.value;
        cur.updatedAt = Date.now();
        break;
      case 'tool_start':
      case 'block_final':
        if (cur) cur.updatedAt = Date.now();
        return; // continuous stuff: not worth a redraw for every piece
      default:
        return;
    }
    this.changed();
  }

  /** Conversation cleared or chat closed: the card has no reason to exist. */
  end(key: string) {
    if (!this.byKey.delete(key)) return;
    this.faces.delete(key);
    if (this.front === key) this.front = null;
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

function blank(cwd: string, key: string): OwnSession {
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
    done: false,
    doneAt: 0,
    key,
  };
}

export const owned = new OwnedSessions();
