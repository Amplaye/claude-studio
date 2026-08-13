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

/** Extension -> panel. */
export type TaskWire = { k: 'tasks'; d: TaskData } | { k: 'lang'; value: 'en' | 'it' };

/** Extension -> chat tab, where the same list is drawn in the rail. */
export type TaskToChat = { k: 'tasks'; d: TaskData };

/** Panel -> extension. */
export type TaskCmd = { cmd: 'ready' };
