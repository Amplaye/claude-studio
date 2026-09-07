// The task list Claude is working through, kept in one place so every surface — the
// account panel in the sidebar and the rail inside the chat tab — draws the same thing.
//
// There are two ways the list can arrive, and the panel was only listening for the one
// that no longer happens.
//
//   TodoWrite — the old tool. One call, the whole list rewritten every time it moves
//   on: nothing to merge, keep the last one. It belongs to the prompt that produced it,
//   so a new message wipes it.
//
//   TaskCreate / TaskUpdate — what the CLI does now. One call per task, and one more
//   per state change, so the list is *built* here rather than received. The number of a
//   task ("#3") is not in the call that creates it — it comes back in the tool's answer,
//   "Task #3 created successfully: Run the tests" — so a task waits under the id of the
//   call that made it until that line arrives. These belong to the conversation, not to
//   the prompt: the CLI keeps them across messages and so do we.
//
// This is why the section sat on "Working out what to do…" for entire sessions: Claude
// was writing its steps down all along, in a tool this file had never heard of.
//
// One list per conversation, not one full stop. Every tab opened with "+" is a
// conversation with its own engine writing its own steps; with a single list the tab
// you opened second overwrote the steps of the one you opened first, and the panel
// showed a list belonging to a conversation you were not looking at.
//
// And all of them travel, not the one we guessed you meant. Keeping the lists apart
// in here was only half the job: on the wire they were still one list with no name on
// it, so the panel drew whichever conversation had moved last and the section changed
// under your eyes while you were reading it. Each list goes over under the id of the
// conversation that wrote it, and the panel puts it inside that conversation's card —
// where there is nothing left to work out about whose steps these are.
import * as vscode from 'vscode';
import { owned } from '../context/owned';
import type { TaskBoard, TaskData, TaskItem } from './protocol';

const EMPTY: TaskData = { items: [], done: 0, total: 0, active: -1, busy: false, doing: '' };

/** Quanti passi del turno si tengono nella scia. Sei righe stanno in una card. */
const TRAIL = 6;

/** Una task com'e' tenuta qui: quella che va a schermo piu' il numero per ritrovarla. */
interface Step extends TaskItem {
  /** Il "#3" della CLI. Vuoto finche' la risposta del tool non lo dice. */
  id: string;
  /** Da quando e' in corso. Serve alla stima, e si mette una volta sola. */
  startedAt?: number;
  /** Quanto c'e' voluto, una volta chiuso. E' il solo dato vero su cui stimare. */
  ms?: number;
}

/**
 * Quanto si suppone duri un passo prima che ne sia finito uno vero da cui imparare.
 * Mezzo minuto e' quello che ci mette un passo di lavoro qualunque — leggere due
 * file e cambiarne uno — ed e' un numero che si corregge da solo al primo passo
 * chiuso, quindi conta solo per il primo.
 */
const FIRST_GUESS_MS = 30000;

interface List {
  /**
   * Chi l'ha scritta. TodoWrite riscrive tutto a ogni giro ed e' roba del singolo
   * messaggio; le Task* si accumulano e restano per tutta la conversazione.
   */
  /**
   * Chi l'ha scritta.
   *
   *   'todo'  TodoWrite: riscrive tutto a ogni giro, ed e' roba del singolo messaggio
   *   'task'  TaskCreate/TaskUpdate: si accumulano e restano per tutta la conversazione
   *   'cli'   i messaggi di sistema della CLI di oggi — l'unica sorgente ancora viva
   *
   * Le prime due esistono ancora qui dentro solo per le CLI vecchie: nella CLI di
   * adesso quei tre strumenti non ci sono piu' affatto (provato: il modello risponde
   * che non li ha), ed e' il motivo per cui questo pannello e' rimasto vuoto.
   */
  source: 'todo' | 'task' | 'cli';
  steps: Step[];
  /** Le TaskCreate in volo, sotto l'id della chiamata: aspettano il loro numero. */
  waiting: Map<string, Step>;
  /** Le TaskList in volo: la loro risposta e' l'elenco vero, e rimette tutto in riga. */
  asked: Set<string>;
  /** L'ultimo passo annunciato: "Read package.json". Vuoto = fermo. */
  doing: string;
  /** Gli ultimi passi del turno, dal piu' vecchio. Vedi `trail` in protocol.ts. */
  trail: string[];
  /**
   * Il numero piu' alto visto in questa conversazione. La CLI numera da 1 e non
   * riusa mai un numero, nemmeno dopo una cancellazione: contarlo qui e' l'unico
   * modo di indovinare il numero di una task appena creata prima che la risposta
   * del tool lo dica — e "prima" e' una finestra vera, dentro la quale arrivavano
   * TaskUpdate che non trovavano nessuno e sparivano senza dire niente.
   */
  next: number;
  busy: boolean;
  data: TaskData;
}

const blank = (): List => ({
  source: 'todo',
  steps: [],
  waiting: new Map(),
  asked: new Set(),
  doing: '',
  trail: [],
  next: 0,
  busy: false,
  data: EMPTY,
});

/** "Task #3 created successfully: Run the tests" → "3". */
function numberIn(text: string): string {
  const m = /#(\d+)/.exec(text || '');
  return m ? m[1] : '';
}

/**
 * Una riga dell'elenco che stampa TaskList: `#2 [pending] Contare le righe`.
 * Gli stati che non conosciamo valgono "da fare": una task che esiste e non e'
 * ne' in corso ne' finita e' esattamente quello.
 */
const LINE = /^#(\d+)\s*\[([a-z_]+)\]\s*(.+)$/i;

/**
 * Gli stati che dice la CLI, tradotti nei quattro che il pannello sa disegnare.
 * `undefined` vuol dire "questo messaggio non parlava di stato": chi chiama non deve
 * toccare quello che c'era.
 */
function cliStatus(s?: string): TaskItem['status'] | undefined {
  switch (s) {
    case 'running':
      return 'in_progress';
    case 'completed':
      return 'completed';
    case 'failed':
    case 'killed':
      return 'failed';
    case 'pending':
    case 'paused':
      return 'pending';
    default:
      return undefined;
  }
}

/**
 * Quanto ci si aspetta che duri il passo in corso: la **mediana** di quelli gia'
 * chiusi in questa stessa lista.
 *
 * La mediana e non la media, perche' in un elenco di passi ce n'e' quasi sempre uno
 * che e' durato dieci volte gli altri — un `npm install`, una suite intera — e con la
 * media quell'unico passo sposterebbe la stima di tutti quelli dopo. La mediana lo
 * ignora, che e' esattamente quello che vuoi da lui.
 */
function expected(steps: Step[]): number {
  const seen = steps
    .map((s) => s.ms)
    .filter((m): m is number => typeof m === 'number' && m > 0)
    .sort((a, b) => a - b);
  if (!seen.length) return FIRST_GUESS_MS;
  const mid = seen.length >> 1;
  return seen.length % 2 ? seen[mid] : Math.round((seen[mid - 1] + seen[mid]) / 2);
}

function statusOf(word: string): TaskItem['status'] {
  const w = word.toLowerCase();
  if (w === 'completed' || w === 'done') return 'completed';
  if (w === 'in_progress' || w === 'running' || w === 'active') return 'in_progress';
  return 'pending';
}

export class TaskStore {
  private sinks = new Set<(d: TaskBoard) => void>();
  /** Una lista per conversazione, sotto la chiave del suo controller. */
  private lists = new Map<string, List>();
  /** Cos'e' stato mandato per ultimo, per non ripetere lo stesso disegno. */
  private sent = '';
  private readonly watch: vscode.Disposable;

  constructor() {
    // Una conversazione nuova, o una che ha appena saputo il proprio id: le liste si
    // consegnano sotto l'id, e finche' non c'e' non hanno un indirizzo dove andare.
    this.watch = owned.onChange(() => this.emit());
  }

  /** The panel subscribes and is given every list straight away. */
  subscribe(fn: (d: TaskBoard) => void): vscode.Disposable {
    this.sinks.add(fn);
    fn(this.board());
    return { dispose: () => this.sinks.delete(fn) };
  }

  // ---- TodoWrite: la lista arriva intera ----------------------------------

  /**
   * La lista intera, riscritta: dal `plan` che l'estensione mette a disposizione
   * (engine/ide.ts) o dal vecchio TodoWrite di una CLI di prima.
   *
   * Gli orologi si portano dietro dal testo del passo. Senza, ogni chiamata — e ne
   * arriva una a ogni passo che parte o finisce — rifarebbe le righe da zero, e il
   * passo in corso ripartirebbe da "appena cominciato" ogni volta che quello prima
   * viene spuntato: una barra che torna a zero mentre avanzi.
   */
  set(key: string, items: TaskItem[]) {
    const l = this.of(key);
    const before = new Map(l.steps.map((s) => [s.content, s]));
    l.source = 'todo';
    l.waiting.clear();
    l.steps = (Array.isArray(items) ? items : [])
      .filter((i) => i && typeof i.content === 'string')
      .map((i) => {
        const was = before.get(i.content);
        return {
          id: '',
          content: i.content,
          activeForm: i.activeForm,
          status: i.status,
          startedAt: was?.startedAt,
          ms: was?.ms,
        };
      });
    this.settle(key, l);
  }

  // ---- TaskCreate / TaskUpdate: la lista si costruisce ---------------------

  /**
   * Una task nuova. Nasce senza numero: quello lo dice la risposta del tool, e fino
   * ad allora la task sta da parte sotto l'id della chiamata che l'ha creata.
   *
   * A schermo pero' ci va subito. Aspettare la risposta vorrebbe dire un pannello che
   * resta indietro di un giro rispetto a quello che Claude sta gia' facendo, ed e'
   * esattamente il ritardo per cui questo pannello esiste.
   */
  created(key: string, callId: string, input: unknown) {
    const o = (input ?? {}) as { subject?: unknown; description?: unknown; activeForm?: unknown };
    const content = String(o.subject || o.description || '').trim();
    if (!content) return;
    const l = this.of(key);
    // Il primo Task* di una conversazione butta via una lista TodoWrite rimasta li':
    // sono due modi di dire la stessa cosa, e mescolarli darebbe passi doppi.
    if (l.source !== 'task') {
      l.source = 'task';
      l.steps = [];
      l.waiting.clear();
    }
    const step: Step = {
      // Il numero se lo prende subito, contando. La risposta del tool lo confermera'
      // (o lo correggera') fra un istante, ma fino a li' la task era senza numero e
      // una TaskUpdate arrivata nel frattempo non trovava niente da aggiornare: la
      // spunta non compariva, e sembrava che il pannello si fosse perso un passo.
      id: String(++l.next),
      content,
      activeForm: o.activeForm ? String(o.activeForm) : undefined,
      status: 'pending',
    };
    l.steps.push(step);
    l.waiting.set(callId, step);
    this.settle(key, l);
  }

  /**
   * "Sto chiedendo l'elenco". La risposta di TaskList e' l'unica cosa che la CLI dice
   * su tutte le task insieme, ed e' la rete di sicurezza di questo file: qualunque
   * cosa si sia persa per strada — un tool_end mai arrivato, una task creata prima
   * che la conversazione fosse agganciata — li' dentro c'e' scritta com'e' davvero.
   */
  listing(key: string, callId: string) {
    this.of(key).asked.add(callId);
  }

  /**
   * La risposta di una TaskCreate o di una TaskList, che e' l'unico posto dove la CLI
   * dice i numeri delle task.
   *
   * Dalla TaskCreate arriva il numero di quella appena creata; dalla TaskList arriva
   * l'elenco intero, e allora si prende quello e si butta via quello che avevamo —
   * e' l'unica versione che non puo' essere andata fuori sincrono.
   */
  answered(key: string, callId: string, text: string) {
    const l = this.lists.get(key);
    if (!l) return;
    if (l.asked.delete(callId)) {
      this.fromList(key, l, text);
      return;
    }
    const step = l.waiting.get(callId);
    if (!step) return;
    l.waiting.delete(callId);
    const n = numberIn(text);
    if (!n) return; // il numero indovinato alla creazione resta il migliore che abbiamo
    step.id = n;
    l.next = Math.max(l.next, Number(n));
  }

  /**
   * L'elenco stampato da TaskList, preso per buono.
   *
   *   #1 [completed] Leggere il README
   *   #2 [pending] Contare le righe
   *
   * L'unica cosa che non c'e' dentro e' l'`activeForm` ("Leggendo il README"): quella
   * la sa solo la TaskCreate, quindi si porta dietro dalla task che aveva lo stesso
   * numero, se c'era.
   *
   * "No tasks found" su una lista scritta con TodoWrite non e' una notizia su quella
   * lista: sono due contabilita' diverse, e cancellarla sarebbe un pannello che si
   * svuota da solo mentre Claude lavora.
   */
  private fromList(key: string, l: List, text: string) {
    const rows = String(text || '')
      .split(/\r?\n/)
      .map((r) => LINE.exec(r.trim()))
      .filter((m): m is RegExpExecArray => !!m);
    if (!rows.length && l.source !== 'task') return;
    const before = new Map(l.steps.map((s) => [s.id, s]));
    l.source = 'task';
    l.waiting.clear();
    l.steps = rows.map(([, id, state, subject]) => ({
      id,
      content: subject.trim(),
      activeForm: before.get(id)?.activeForm,
      status: statusOf(state),
      // Gli orologi sopravvivono al rimettere in riga, come l'activeForm: e' la
      // stessa task, la stiamo solo ricopiando da una fonte piu' affidabile.
      startedAt: before.get(id)?.startedAt,
      ms: before.get(id)?.ms,
    }));
    for (const [, id] of rows) l.next = Math.max(l.next, Number(id));
    this.settle(key, l);
  }

  /** Una TaskUpdate: cambia stato, testo, o toglie la task di mezzo. */
  updated(key: string, input: unknown) {
    const o = (input ?? {}) as {
      taskId?: unknown;
      status?: unknown;
      subject?: unknown;
      activeForm?: unknown;
    };
    const id = String(o.taskId ?? '').trim();
    if (!id) return;
    const l = this.lists.get(key);
    if (!l) return;
    const at = l.steps.findIndex((s) => s.id === id);
    if (at < 0) return;
    if (o.status === 'deleted') {
      l.steps.splice(at, 1);
    } else {
      const s = l.steps[at];
      if (o.status === 'pending' || o.status === 'in_progress' || o.status === 'completed') {
        s.status = o.status;
      }
      if (typeof o.subject === 'string' && o.subject.trim()) s.content = o.subject.trim();
      if (typeof o.activeForm === 'string' && o.activeForm.trim()) {
        s.activeForm = o.activeForm.trim();
      }
    }
    this.settle(key, l);
  }

  // ---- la CLI di oggi: le task arrivano come messaggi di sistema ------------

  /**
   * Una notizia su una task, da `task_started` / `task_progress` / `task_updated`.
   *
   * Ognuno dei tre dice un pezzo — il nome, cosa sta facendo adesso, com'e' finita —
   * quindi qui si fondono invece di sostituirsi: una `task_progress` che arriva senza
   * stato non deve spegnere lo stato che c'era.
   */
  fromCli(
    key: string,
    id: string,
    d: { description?: string; doing?: string; status?: string }
  ) {
    if (!id) return;
    const l = this.of(key);
    // La prima task della CLI butta via una lista dei vecchi strumenti rimasta li':
    // sono due contabilita' diverse e mescolarle darebbe passi doppi.
    if (l.source !== 'cli') {
      l.source = 'cli';
      l.steps = [];
      l.waiting.clear();
      l.asked.clear();
    }
    let s = l.steps.find((x) => x.id === id);
    if (!s) {
      // Senza un nome non c'e' niente da disegnare: una `task_progress` che arriva
      // prima della sua `task_started` aspetta, invece di aprire una riga vuota.
      if (!d.description) return;
      s = { id, content: d.description, status: 'pending' };
      l.steps.push(s);
    }
    if (d.description) s.content = d.description;
    // "Running find …" e' la riga che si legge mentre e' quella in corso.
    if (d.doing) s.activeForm = d.doing;
    const st = cliStatus(d.status);
    if (st) s.status = st;
    this.settle(key, l);
  }

  // ---- quando la lista va azzerata ----------------------------------------

  /**
   * A new prompt. A TodoWrite list is the old prompt's list and goes, rather than being
   * left on screen next to the new question — the one thing this panel must never do.
   *
   * Le Task* invece restano: la CLI se le tiene per tutta la sessione, e quello che
   * hai chiesto due messaggi fa e non e' ancora stato fatto e' esattamente la cosa che
   * questo pannello deve continuare a mostrarti.
   */
  newTurn(key: string) {
    const l = this.lists.get(key);
    if (!l) return;
    // La scia e' dei passi di *questo* turno: al messaggio dopo riparte, sempre,
    // qualunque sia la sorgente della lista.
    l.trail = [];
    // Le liste dei due sistemi a task (quello vecchio e quello della CLI di oggi) se
    // le tiene il motore per tutta la sessione, e quello che hai chiesto due messaggi
    // fa e non e' ancora finito deve continuare a vedersi. Solo TodoWrite se ne va.
    if (l.source !== 'todo') {
      this.settle(key, l);
      return;
    }
    this.clear(key);
  }

  /** La conversazione riparte da zero: non resta niente di quella di prima. */
  clear(key: string) {
    const busy = this.lists.get(key)?.busy ?? false;
    const l = blank();
    l.busy = busy;
    this.lists.set(key, l);
    this.settle(key, l);
  }

  /**
   * Il passo in corso, come lo si legge nella card.
   *
   * Una lista che non c'e' non e' una notizia; un passo che sta succedendo lo e'
   * sempre. Questa riga e' quello che rispondeva la frase fissa "sto capendo cosa
   * fare", tranne che questa e' vera.
   */
  doing(key: string, text: string) {
    const l = this.of(key);
    const v = String(text || '').slice(0, 90);
    if (l.doing === v) return;
    l.doing = v;
    // La scia. Un passo che comincia si aggiunge in fondo; la riga vuota di fine
    // turno no — quella dice "fermo", non e' un passo, e cancellerebbe l'ultimo.
    if (v && l.trail[l.trail.length - 1] !== v) {
      l.trail.push(v);
      if (l.trail.length > TRAIL) l.trail.splice(0, l.trail.length - TRAIL);
    }
    this.settle(key, l);
  }

  /** The turn started or ended: the same list, read differently. */
  setBusy(key: string, busy: boolean) {
    const l = this.of(key);
    if (busy === l.busy) return;
    l.busy = busy;
    this.settle(key, l);
  }

  /**
   * La conversazione non c'e' piu' (scheda chiusa, chat azzerata). Senza questo la
   * sua lista resterebbe in memoria per sempre, e tornerebbe a schermo il giorno in
   * cui nessun'altra conversazione e' in primo piano.
   */
  drop(key: string) {
    if (!this.lists.delete(key)) return;
    this.emit();
  }

  private of(key: string): List {
    let l = this.lists.get(key);
    if (!l) this.lists.set(key, (l = blank()));
    return l;
  }

  /** Rifa' i conti di una lista che e' cambiata e la manda a schermo. */
  private settle(key: string, l: List) {
    // Uno in corso, non quattro.
    //
    // Tutta la grammatica del pannello dice "uno": una riga accesa, un `active`, una
    // stima. Le sorgenti pero' non lo garantiscono — il piano lo riscrive il modello a
    // ogni giro, e gliene sfugge facilmente piu' d'uno acceso insieme — e allora
    // quattro righe si accendevano tutte, la lista diventava un muro d'arancione e non
    // si capiva piu' dove fosse arrivato. Vale il primo; gli altri tornano a essere
    // quello che sono, cioe' da fare.
    const active = l.steps.findIndex((s) => s.status === 'in_progress');

    // L'orologio di ogni passo, tenuto qui e non altrove perche' e' l'unico punto da
    // cui passa ogni cambiamento di stato, da qualunque delle tre sorgenti arrivi.
    // Non serve sapere com'era prima: "sta correndo e non ha ancora un inizio" e "non
    // corre piu' e non ha ancora una durata" sono le due sole domande.
    //
    // Corre solo quello scelto sopra, e conta: uno degli scartati che prendesse
    // l'orologio adesso, quando poi tocca a lui davvero, ripartirebbe da mezz'ora fa.
    const now = Date.now();
    l.steps.forEach((s, i) => {
      if (i === active) {
        if (!s.startedAt) s.startedAt = now;
      } else if (s.startedAt && !s.ms) {
        s.ms = Math.max(1, now - s.startedAt);
      }
    });

    const items: TaskItem[] = l.steps.map((s, i) => ({
      content: s.content,
      activeForm: s.activeForm,
      status: s.status === 'in_progress' && i !== active ? 'pending' : s.status,
    }));
    l.data = {
      items,
      // Una task andata storta e' chiusa quanto una finita bene: nella barra conta
      // come "non ci si torna piu' sopra", altrimenti resterebbe li' a promettere
      // un avanzamento che non arrivera'.
      done: items.filter((i) => i.status === 'completed' || i.status === 'failed').length,
      total: items.length,
      active,
      busy: l.busy,
      doing: l.busy ? l.doing : '',
      // La scia serve solo quando un elenco non c'e': con un piano a schermo sarebbe
      // la stessa storia raccontata due volte, una in avanti e una all'indietro.
      ...(items.length ? {} : { trail: l.trail.slice() }),
      ...(active >= 0 && l.steps[active].startedAt
        ? { activeSince: l.steps[active].startedAt, expectedMs: expected(l.steps) }
        : {}),
    };
    this.lists.set(key, l);
    this.emit();
  }

  /**
   * Le liste da consegnare, sotto l'id della conversazione che le ha scritte — cioe'
   * l'id che porta scritto la sua card, che e' come il pannello le ritrova.
   *
   * Solo quelle che hanno qualcosa da dire: una conversazione senza passi non manda
   * una lista vuota, manda niente, e la sua card resta una card. Quella che sta
   * lavorando la manda comunque, anche se ancora vuota: e' il "sto capendo cosa fare"
   * — l'unico momento in cui il vuoto e' una notizia.
   */
  private board(): TaskBoard {
    const out: TaskBoard = {};
    for (const s of owned.all()) {
      if (!s.id) continue; // conversazione appena nata: nessun indirizzo ancora
      const l = this.lists.get(s.key);
      // Anche una conversazione ferma con una scia alle spalle: quello che il turno
      // appena finito ha fatto resta leggibile finche' non ne comincia un altro.
      if (l && (l.data.total > 0 || l.busy || l.trail.length > 0)) out[s.id] = l.data;
    }
    return out;
  }

  private emit() {
    const d = this.board();
    // Le conversazioni cambiano stato di continuo (un turno che parte, uno che
    // finisce): senza questo controllo ogni battito ridisegnerebbe una lista identica.
    // Si guarda cosa c'e' scritto, non quale oggetto e': la lista viene rifatta a ogni
    // ritocco, e due oggetti diversi che dicono la stessa cosa sono lo stesso disegno.
    const sig = JSON.stringify(d);
    if (sig === this.sent) return;
    this.sent = sig;
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
