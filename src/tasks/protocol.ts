// What travels between the extension and the task panel. Same rule as the context
// panel: the numbers are worked out here, the panel only draws them.

/** One entry of Claude's list, as the TodoWrite tool writes it. */
export interface TaskItem {
  /** "Rename the column" — how it reads when it is not the one being done. */
  content: string;
  /** "Renaming the column" — how it reads while it is the one being done. */
  activeForm?: string;
  status: 'pending' | 'in_progress' | 'completed';
}

/** The list plus the counts, ready to be drawn. */
export interface TaskData {
  items: TaskItem[];
  done: number;
  total: number;
  /** Index of the one in progress, or -1: it's what the panel scrolls to. */
  active: number;
  /** True while the turn is running: the panel says "working", not "finished". */
  busy: boolean;
}

/**
 * Every conversation's list, under the id of the conversation that wrote it.
 *
 * One list used to travel, and nothing on the wire said whose it was: with three tabs
 * open the panel had to guess which one you meant, and the section swapped under you
 * whenever another conversation moved. There is nothing to guess now — each card gets
 * its own steps, and a conversation with none simply has none.
 */
export type TaskBoard = Record<string, TaskData>;

/** Extension -> panel. */
export type TaskWire = { k: 'tasks'; d: TaskBoard } | { k: 'lang'; value: 'en' | 'it' };

/** Extension -> chat tab, where the same lists are drawn in the rail. */
export type TaskToChat = { k: 'tasks'; d: TaskBoard };

/** Panel -> extension. */
export type TaskCmd = { cmd: 'ready' };
