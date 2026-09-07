// What travels between the extension and the task panel. Same rule as the context
// panel: the numbers are worked out here, the panel only draws them.

/** One entry of Claude's list, as the TodoWrite tool writes it. */
export interface TaskItem {
  /** "Rename the column" — how it reads when it is not the one being done. */
  content: string;
  /** "Renaming the column" — how it reads while it is the one being done. */
  activeForm?: string;
  /**
   * `failed` c'e' perche' una task puo' andare storta, e disegnarla come "fatta"
   * sarebbe una bugia: la CLI dice `failed` e `killed` per i sub-agent che non sono
   * arrivati in fondo, e sono esattamente quelli che devi vedere.
   */
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
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
  /**
   * Cosa sta facendo proprio adesso: "Read package.json", "Bash npm test".
   *
   * Le task esistono solo quando Claude apre un sub-agent, e un turno normale — legge,
   * modifica, lancia i test — non ne apre nessuno: la card restava con una frase fissa
   * addosso per tutta la sessione. Questa riga c'e' sempre, perche' un passo in corso
   * c'e' sempre, ed e' la risposta alla sola domanda che si fa guardando quella card.
   */
  doing?: string;
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
