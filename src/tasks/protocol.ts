// What travels between the extension and the task panel. Same rule as the context
// panel: the numbers are worked out here, the panel only draws them.

/** One entry of Claude's list, as the TodoWrite tool writes it. */
export interface TaskItem {
  /**
   * Il "#3" della CLI, quando c'e'.
   *
   * Viaggia perche' l'ufficio disegna una persona per sub-agent, e una persona ha
   * bisogno di restare la stessa: senza un nome proprio l'unica cosa con cui
   * riconoscerla e' la sua posizione nell'elenco, e l'elenco si riordina — un
   * passo che finisce fa scalare tutti gli altri di uno, e mezzo ufficio si
   * cambia faccia in mezzo al corridoio.
   */
  id?: string;
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
  /**
   * Da quando e' in corso quello che sta correndo adesso (epoch ms), e quanto ci si
   * aspetta che duri.
   *
   * Quanto manca a *un* passo non e' una cosa che si sappia: nessuno sa quanto ci
   * vuole a "sistemare i test" finche' non e' sistemato. Quello che si sa e' quanto
   * ci hanno messo i passi gia' fatti in questa stessa lista, ed e' su quello che si
   * fa la stima — come la fa una barra di download, che nemmeno lei conosce il
   * futuro. Finche' non ne e' finito nemmeno uno vale un'attesa di partenza.
   *
   * Le due cose viaggiano crude apposta: e' il pannello a far girare l'orologio, una
   * volta al secondo e in casa sua, invece di far battere il filo sessanta volte al
   * minuto per disegnare una barra che si muove da sola.
   */
  activeSince?: number;
  expectedMs?: number;
  /**
   * Gli ultimi passi di questo turno, dal piu' vecchio al piu' recente.
   *
   * Il piano lo scrive Claude, e "lo scrive" e' una cosa che si spera, non una che si
   * ottiene: provato dal vivo tre volte con la stessa istruzione, due volte l'ha
   * scritto e una no. Un pannello che dipende da quella scelta e' un pannello vuoto un
   * turno su tre, ed e' esattamente il difetto da cui si e' partiti.
   *
   * Questa invece c'e' sempre, perche' non chiede niente a nessuno: sono i passi che
   * il turno ha fatto davvero, gli stessi che scorrono nel discorso. Non e' una
   * previsione e non finge di esserlo — non ha un totale, quindi non ha una
   * percentuale — ma risponde a "cos'hai fatto finora e cosa stai facendo", che senza
   * era una riga sola.
   */
  trail?: string[];
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
