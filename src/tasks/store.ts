// The task list Claude is working through, kept in one place so every surface — the
// account panel in the sidebar and the rail inside the chat tab — draws the same thing.
//
// The source is the TodoWrite tool: Claude rewrites the whole list every time it moves
// on, so there is nothing to merge here. We keep the last one, count it, and hand it
// out. The list belongs to the prompt that produced it: a new message wipes it, which
// is why you never see the previous turn's tasks lingering under the current one.
//
// One list per conversation, not one full stop. Every tab opened with "+" is a
// conversation with its own engine writing its own todos; with a single list the tab
// you opened second overwrote the steps of the one you opened first, and the panel
// showed a list belonging to a conversation you were not looking at. Worse, only the
// primary chat was allowed to fill it at all — so in any tab from "+" the panel simply
// stayed empty for the whole session. Now each conversation keeps its own, and the
// panel shows the one you have in front of you.
import * as vscode from 'vscode';
import { owned } from '../context/owned';
import type { TaskData, TaskItem } from './protocol';

const EMPTY: TaskData = { items: [], done: 0, total: 0, active: -1, busy: false };

export class TaskStore {
  private sinks = new Set<(d: TaskData) => void>();
  /** Una lista per conversazione, sotto la chiave del suo controller. */
  private lists = new Map<string, TaskData>();
  /**
   * L'ultima conversazione che ha mosso la sua lista. Serve solo quando non ce n'e'
   * nessuna davanti agli occhi — la scheda dietro a un file aperto, la sidebar chiusa:
   * meglio le task di chi sta lavorando che un pannello vuoto.
   */
  private lastTouched: string | null = null;
  /** Cos'e' stato mandato per ultimo, per non ripetere lo stesso disegno. */
  private sent: TaskData | null = null;
  private readonly watch: vscode.Disposable;

  constructor() {
    // Cambi conversazione e cambia la lista: il pannello segue quello che guardi.
    this.watch = owned.onChange(() => this.emit());
  }

  /** The panel subscribes and is given the current list straight away. */
  subscribe(fn: (d: TaskData) => void): vscode.Disposable {
    this.sinks.add(fn);
    fn(this.current());
    return { dispose: () => this.sinks.delete(fn) };
  }

  /** A fresh list from TodoWrite. */
  set(key: string, items: TaskItem[]) {
    const clean = (Array.isArray(items) ? items : []).filter(
      (i) => i && typeof i.content === 'string'
    );
    this.put(key, {
      items: clean,
      done: clean.filter((i) => i.status === 'completed').length,
      total: clean.length,
      active: clean.findIndex((i) => i.status === 'in_progress'),
      busy: this.of(key).busy,
    });
  }

  /**
   * A new prompt: the old list is not this prompt's list. Cleared right away rather
   * than left on screen until the first TodoWrite, which would show the previous
   * turn's tasks next to the new question — the one thing this panel must never do.
   */
  clear(key: string) {
    this.put(key, { ...EMPTY, busy: this.of(key).busy });
  }

  /** The turn started or ended: the same list, read differently. */
  setBusy(key: string, busy: boolean) {
    const cur = this.of(key);
    if (busy === cur.busy) return;
    this.put(key, { ...cur, busy });
  }

  /**
   * La conversazione non c'e' piu' (scheda chiusa, chat azzerata). Senza questo la
   * sua lista resterebbe in memoria per sempre, e tornerebbe a schermo il giorno in
   * cui nessun'altra conversazione e' in primo piano.
   */
  drop(key: string) {
    if (!this.lists.delete(key)) return;
    if (this.lastTouched === key) this.lastTouched = null;
    this.emit();
  }

  private of(key: string): TaskData {
    return this.lists.get(key) ?? EMPTY;
  }

  private put(key: string, d: TaskData) {
    this.lists.set(key, d);
    this.lastTouched = key;
    this.emit();
  }

  /**
   * Quale lista si vede: quella della conversazione che hai davanti. Se ne hai una
   * davanti e non ha task, il pannello e' vuoto — mostrare quelle di un'altra sarebbe
   * peggio del vuoto, perche' sembrerebbero le sue.
   */
  private current(): TaskData {
    const front = owned.current()?.key;
    if (front) return this.of(front);
    return (this.lastTouched && this.lists.get(this.lastTouched)) || EMPTY;
  }

  private emit() {
    const d = this.current();
    // Le conversazioni cambiano stato di continuo (un turno che parte, uno che
    // finisce): senza questo controllo ogni battito ridisegnerebbe una lista identica.
    if (d === this.sent) return;
    this.sent = d;
    for (const fn of this.sinks) fn(d);
  }

  dispose() {
    this.watch.dispose();
    this.sinks.clear();
  }
}

/**
 * Uno per finestra, come `owned` e come il monitor. Passarlo di mano in mano — al
 * controller, alla scheda, al pannello — voleva dire quattro firme allargate perche'
 * un oggetto solo arrivasse in fondo, e bastava dimenticarne una (ed e' successo:
 * ChatPanel.openNew) perche' una conversazione intera restasse senza elenco.
 */
export const tasks = new TaskStore();
