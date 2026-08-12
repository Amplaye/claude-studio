// Le conversazioni nate dalla chat di Claude Studio.
//
// E' qui il vero guadagno dell'aver messo chat e barra di contesto nella stessa
// estensione. Per le tab dell'estensione ufficiale l'aggancio fra "cosa stai
// guardando" e "quale sessione e'" resta una cascata di tentativi, e quando fallisce
// la card lo dice ("stimata"). Per le nostre no: la sessione l'abbiamo aperta noi,
// quindi id, titolo, se sta lavorando e dove la stai guardando sono fatti, non
// indovinelli.
import type { Wire } from '../engine/protocol';

export interface OwnSession {
  id: string;
  cwd: string;
  model: string;
  startedAt: number;
  updatedAt: number;
  /** Il primo messaggio scritto: e' il nome che si legge sulla card. */
  title: string;
  /** Contesto dell'ultimo turno, cosi' com'e' arrivato dal motore. */
  tokens: number;
  /** Costo dichiarato dal motore per la conversazione. */
  costUsd: number;
  busy: boolean;
}

class OwnedSessions {
  private cur?: OwnSession;
  /** Dove stai guardando la chat: scheda in primo piano, pannello laterale aperto. */
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

  /** La chat e' sotto gli occhi adesso? Serve a decidere qual e' la sessione in focus. */
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
   * La chat le passa tutto quello che manda alla webview: qui si tiene solo cio' che
   * serve alla card. Cosi' il controller non deve ricordarsi di avvisare due volte.
   */
  observe(e: Wire, cwd: string) {
    switch (e.k) {
      case 'session': {
        const now = Date.now();
        // Stessa sessione ripresa: si tiene quello che gia' si sapeva.
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
        // Il nome della card e' la prima cosa che hai scritto, non l'ultima: cambiarlo
        // a ogni messaggio farebbe ballare la lista sotto gli occhi.
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
        return; // roba continua: non vale un ridisegno per ogni pezzo
      default:
        return;
    }
    this.changed();
  }

  /** Conversazione azzerata o estensione chiusa: la card non ha piu' motivo di esserci. */
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
        /* chi ascolta non deve poter far cadere la chat */
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
