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

const EMPTY: TaskData = { items: [], done: 0, total: 0, active: -1, busy: false };

/** Una task com'e' tenuta qui: quella che va a schermo piu' il numero per ritrovarla. */
interface Step extends TaskItem {
  /** Il "#3" della CLI. Vuoto finche' la risposta del tool non lo dice. */
  id: string;
}

interface List {
  /**
   * Chi l'ha scritta. TodoWrite riscrive tutto a ogni giro ed e' roba del singolo
   * messaggio; le Task* si accumulano e restano per tutta la conversazione.
   */
  source: 'todo' | 'task';
  steps: Step[];
  /** Le TaskCreate in volo, sotto l'id della chiamata: aspettano il loro numero. */
  waiting: Map<string, Step>;
  /** Le TaskList in volo: la loro risposta e' l'elenco vero, e rimette tutto in riga. */
  asked: Set<string>;
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

  /** A fresh list from TodoWrite. */
  set(key: string, items: TaskItem[]) {
    const l = this.of(key);
    l.source = 'todo';
    l.waiting.clear();
    l.steps = (Array.isArray(items) ? items : [])
      .filter((i) => i && typeof i.content === 'string')
      .map((i) => ({ id: '', content: i.content, activeForm: i.activeForm, status: i.status }));
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
    if (!l || l.source === 'task') return;
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
    const items: TaskItem[] = l.steps.map((s) => ({
      content: s.content,
      activeForm: s.activeForm,
      status: s.status,
    }));
    l.data = {
      items,
      done: items.filter((i) => i.status === 'completed').length,
      total: items.length,
      active: items.findIndex((i) => i.status === 'in_progress'),
      busy: l.busy,
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
      if (l && (l.data.total > 0 || l.busy)) out[s.id] = l.data;
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
