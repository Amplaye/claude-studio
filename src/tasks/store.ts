// The task list Claude is working through, kept in one place so every surface — the
// sidebar panel and the rail inside the chat tab — draws the same thing.
//
// The source is the TodoWrite tool: Claude rewrites the whole list every time it moves
// on, so there is nothing to merge here. We keep the last one, count it, and hand it
// out. The list belongs to the prompt that produced it: a new message wipes it, which
// is why you never see the previous turn's tasks lingering under the current one.
import * as vscode from 'vscode';
import type { TaskData, TaskItem } from './protocol';

const EMPTY: TaskData = { items: [], done: 0, total: 0, active: -1, busy: false };

export class TaskStore {
  private sinks = new Set<(d: TaskData) => void>();
  private last: TaskData = EMPTY;

  /** The panel subscribes and is given the current list straight away. */
  subscribe(fn: (d: TaskData) => void): vscode.Disposable {
    this.sinks.add(fn);
    fn(this.last);
    return { dispose: () => this.sinks.delete(fn) };
  }

  /** A fresh list from TodoWrite. */
  set(items: TaskItem[]) {
    const clean = (Array.isArray(items) ? items : []).filter((i) => i && typeof i.content === 'string');
    this.emit({
      items: clean,
      done: clean.filter((i) => i.status === 'completed').length,
      total: clean.length,
      active: clean.findIndex((i) => i.status === 'in_progress'),
      busy: this.last.busy,
    });
  }

  /**
   * A new prompt: the old list is not this prompt's list. Cleared right away rather
   * than left on screen until the first TodoWrite, which would show the previous
   * turn's tasks next to the new question — the one thing this panel must never do.
   */
  clear() {
    this.emit({ ...EMPTY, busy: this.last.busy });
  }

  /** The turn started or ended: the same list, read differently. */
  setBusy(busy: boolean) {
    if (busy === this.last.busy) return;
    this.emit({ ...this.last, busy });
  }

  private emit(d: TaskData) {
    this.last = d;
    for (const fn of this.sinks) fn(d);
  }
}
