// Lo stato della chat sta qui, non nelle viste. La stessa conversazione puo' essere
// aperta insieme nel pannello laterale e come scheda a tutto schermo: chi si attacca
// dopo si riprende la storia e vede esattamente quello che vede l'altra faccia.
import * as vscode from 'vscode';
import type { PermissionResult, PermissionUpdate } from '@anthropic-ai/claude-agent-sdk';
import { claudeCliVersion, findClaudeCli } from '../engine/cli';
import type { AskKind, AskQuestion, ModelChoice, Mode, Pasted, Prefs, Wire } from '../engine/protocol';
import { DEFAULT_PREFS } from '../engine/protocol';
import { ideServer } from '../engine/ide';
import { setChatBadge } from './badge';
import { owned } from '../context/owned';
import { currentSelection, findFiles, workspaceRoot } from './editor';
import type { AskRequest } from '../engine/session';
import { Session } from '../engine/session';
import { recentSessions, replaySession } from './history';
import { forgetSession } from '../context/sessions';
import { announceLang, t } from '../shared/i18n';

export interface Surface {
  readonly kind: 'view' | 'panel';
  post(e: Wire): void;
}

/** Oltre questo si buttano via gli eventi piu' vecchi: e' solo materiale da ridisegno. */
const MAX_HISTORY = 4000;

/** Le scelte restano fra una finestra e l'altra: sono tue, non del progetto. */
const PREFS_KEY = 'claudeStudio.prefs';
/**
 * L'elenco dei modelli lo dice la CLI a sessione accesa. Si tiene da parte l'ultimo
 * che ha detto, cosi' il menu ha gia' qualcosa da mostrare prima del primo messaggio.
 */
const MODELS_KEY = 'claudeStudio.models';
const COMMANDS_KEY = 'claudeStudio.commands';

/**
 * Il modello da mettere quando non ce n'e' uno scelto. Non essendoci piu'
 * l'"automatico", qualcuno deve pur essere acceso: si prende quello che la CLI
 * indica come consigliato — ma il suo nome vero, non l'alias 'default', se no
 * sulla carta non si vedrebbe quale sta lavorando. Se l'alias non si sa
 * sciogliere si ripiega sul primo modello vero dell'elenco.
 */
function pickDefaultModel(items: ModelChoice[]): string {
  const real = items.filter((m) => m.value && m.value !== 'default');
  const rec = items.find((m) => m.recommended);
  if (rec?.resolved) {
    // "claude-sonnet-4-5[1m]" → si cerca il modello vero che gli somiglia
    const hit = real.find(
      (m) => m.value === rec.resolved || rec.resolved.startsWith(m.value)
    );
    if (hit) return hit.value;
  }
  return real[0]?.value ?? '';
}

interface Pending {
  req: AskRequest;
  kind: AskKind;
  settle: (r: PermissionResult) => void;
}

export class ChatController {
  private session?: Session;
  private history: Wire[] = [];
  private surfaces = new Set<Surface>();
  private busy = false;
  private mode: Mode = 'bypassPermissions';
  /** Conversazione da riprendere alla prossima accensione del motore. */
  private resume?: { id: string; fork: boolean };
  /** Permessi in attesa di risposta, per tool_use_id. */
  private pending = new Map<string, Pending>();
  private prefs: Prefs;
  private models: ModelChoice[];
  private commands: { name: string; description: string }[];
  /**
   * Solo il controller principale interagisce con la barra di contesto
   * (`owned`) e col bollino. Le schede secondarie hanno un controller loro
   * che non deve pestare i piedi al principale.
   */
  private readonly primary: boolean;

  constructor(private readonly ctx: vscode.ExtensionContext, opts?: { primary?: boolean }) {
    this.primary = opts?.primary !== false;
    this.prefs = { ...DEFAULT_PREFS, ...(ctx.globalState.get<Partial<Prefs>>(PREFS_KEY) ?? {}) };
    // Migrazione: suoni rimossi → si torna a coccola
    if ((this.prefs.sound as string) === 'bell' || (this.prefs.sound as string) === 'soft') {
      this.prefs.sound = 'cozy';
    }
    // L'elenco messo da parte da una versione precedente puo' parlare di modelli
    // che non esistono piu': si tiene solo se e' nel formato di oggi, tanto al
    // primo messaggio la CLI lo ridice comunque.
    this.models = (ctx.globalState.get<ModelChoice[]>(MODELS_KEY) ?? []).filter(
      (m) => typeof m?.resolved === 'string'
    );
    this.commands = ctx.globalState.get<{ name: string; description: string }[]>(COMMANDS_KEY) ?? [];
  }

  attach(s: Surface) {
    this.surfaces.add(s);
  }

  detach(s: Surface) {
    this.surfaces.delete(s);
  }

  /** Il saluto e' per forza per singola faccia: dice anche quale faccia e'. */
  hello(s: Surface) {
    const cwd = currentCwd();
    const cli = findClaudeCli(cliSetting());
    s.post({
      k: 'hello',
      cwd,
      project: cwd.split(/[\\/]/).pop() || cwd,
      cliVersion: cli ? claudeCliVersion(cli) : '',
      surface: s.kind,
    });
    s.post({ k: 'mode', value: this.mode });
    s.post({ k: 'prefs', value: this.prefs });
    if (this.models.length) s.post({ k: 'models', items: this.models });
    if (this.commands.length) s.post({ k: 'commands', items: this.commands });
    for (const e of this.history) s.post(e);
    s.post({ k: 'busy', value: this.busy });
  }

  // ---- le scelte della testata (modello, impegno, pensiero, avvisi) --------

  /**
   * Arriva un pezzo di preferenze per volta: si fondono con quelle che ci sono,
   * si mettono da parte e si passano al motore gia' acceso, cosi' valgono dal
   * turno dopo senza buttare via la conversazione.
   */
  setPrefs(patch: Partial<Prefs>) {
    const before = this.prefs;
    const next = { ...before, ...patch };
    // Cambiando modello, il livello d'impegno di prima puo' non esistere piu' —
    // "massimo" su un modello che arriva ad "alto" e' una parola che il motore non
    // conosce. In quel caso si torna ad Auto, che vale per tutti: e' l'unico modo
    // perche' "automatico" resti una scelta vera e non una che si rompe da sola.
    if (patch.model !== undefined && next.model !== before.model) {
      next.effort = this.effortFor(next.model, next.effort);
    }
    this.prefs = next;
    void this.ctx.globalState.update(PREFS_KEY, this.prefs);
    // The context panel is a webview of its own: it doesn't see this wire, so it
    // gets told separately.
    if (next.lang !== before.lang) announceLang(next.lang);

    if (this.session) {
      if (this.prefs.model !== before.model) void this.session.setModel(this.prefs.model);
      if (this.prefs.effort !== before.effort) void this.session.setEffort(this.prefs.effort);
      if (this.prefs.thinking !== before.thinking) void this.session.setThinking(this.prefs.thinking);
    }
    this.broadcast({ k: 'prefs', value: this.prefs });
  }

  // ---- l'avviso di fine lavoro -------------------------------------------

  /** Sei tornato a guardare: il bollino ha finito il suo mestiere. */
  onWindowFocus() {
    if (!this.primary) return;
    setChatBadge(0);
  }

  /**
   * Il "suona adesso" lo decide qui, non la pagina: solo l'estensione sa se la
   * finestra e' in primo piano. E si dice a una faccia sola — col pannello e la
   * scheda aperti insieme, dirlo a tutte suonerebbe due volte.
   */
  private alert(event: 'done' | 'ask') {
    const p = this.prefs;
    const focused = vscode.window.state.focused;

    if (!focused && this.primary) setChatBadge(1);
    if (event === 'done' && p.toast && !focused) {
      const cwd = currentCwd();
      const open = t(p.lang, 'toast.open');
      void vscode.window
        .showInformationMessage(
          t(p.lang, 'toast.done', { project: cwd.split(/[\\/]/).pop() || cwd }),
          open
        )
        .then((a) => {
          if (a) void vscode.commands.executeCommand('claudeStudio.openTab');
        });
    }

    if (p.sound === 'off') return;
    if (event === 'ask' && !p.soundOnAsk) return;
    if (p.onlyWhenAway && focused) return;

    const s = [...this.surfaces].find((x) => x.kind === 'panel') ?? [...this.surfaces][0];
    s?.post({ k: 'chime', event, sound: p.sound, volume: p.volume });
  }

  /**
   * Il codice selezionato nell'editor si attacca al messaggio vero, non a quello
   * che si legge nella chat: nella chat resta la frase, il muro di codice no.
   */
  send(text: string, images?: Pasted[], withSelection?: boolean) {
    let full = text;
    if (withSelection) {
      const sel = currentSelection();
      if (sel) {
        full =
          `${text}\n\n<selection file="${sel.rel}" lines="${sel.lines}">\n${sel.text}\n</selection>`.trim();
      }
    }
    this.ensureSession().send(full, images, text);
  }

  /** L'elenco per il menu che si apre scrivendo "@". */
  async sendFiles(q: string, s?: Surface) {
    const e: Wire = { k: 'files', items: await findFiles(q) };
    if (s) s.post(e);
    else this.broadcast(e);
  }

  /** Cambia la selezione nell'editor: la chat lo fa sapere, non lo indovina. */
  pushSelection() {
    const sel = currentSelection();
    this.broadcast({ k: 'selection', file: sel?.rel ?? '', lines: sel?.lines ?? '' });
  }

  interrupt() {
    void this.session?.interrupt();
  }

  newSession() {
    this.resume = undefined;
    this.clear();
  }

  // ---- cronologia --------------------------------------------------------

  async sendHistory(s?: Surface) {
    const items = await recentSessions(currentCwd());
    const e: Wire = { k: 'history', items };
    if (s) s.post(e);
    else this.broadcast(e);
  }

  /**
   * Apre una conversazione passata: prima si ridipinge com'era, poi si dice al
   * motore di riprenderla al prossimo messaggio. `fork` la lascia intatta e
   * lavora su un ramo nuovo.
   */
  async open(id: string, fork = false) {
    this.clear();
    this.resume = { id, fork };
    for (const e of await replaySession(id, currentCwd())) this.emit(e);
  }

  private clear() {
    this.closeAllPending('Switching conversation.');
    this.endEngine();
    this.history = [];
    this.busy = false;
    if (this.primary) owned.end(); // la card della barra di contesto non ha piu' niente da mostrare
    this.broadcast({ k: 'reset' });
    this.broadcast({ k: 'mode', value: this.mode });
  }

  setMode(value: Mode) {
    if (this.mode === value) return;
    this.mode = value;
    void this.session?.setPermissionMode(value);
    this.broadcast({ k: 'mode', value });
    // Passando a yolo si approvano automaticamente i permessi in attesa:
    // l'utente ha appena detto "fa' tutto da solo".
    if (value === 'bypassPermissions') this.allowAllPending();
  }

  /** Approva tutti i permessi in attesa (usato dal passaggio a yolo). */
  private allowAllPending() {
    for (const [id, p] of [...this.pending]) {
      if (p.kind === 'question') continue; // le domande vanno risposte dall'utente
      this.emit({ k: 'ask_done', id, ok: true, label: 'Allowed (Yolo)' });
      p.settle(allow(p.req.input, {}, 'user_temporary'));
    }
  }

  dispose() {
    this.closeAllPending('Extension closed.');
    this.endEngine();
    if (this.primary) owned.end();
  }

  /**
   * Turns the engine off and takes its announcement out of ~/.claude/sessions.
   * The CLI writes one file per process and doesn't always get to clear it away;
   * whatever is left there becomes a card in the context panel — a conversation
   * nobody has open any more, still saying "here". We opened this one, so we're
   * the ones who know it's over.
   */
  private endEngine() {
    const id = this.session?.sessionId;
    this.session?.dispose();
    this.session = undefined;
    if (id) forgetSession(id);
  }

  // ---- permessi ----------------------------------------------------------

  /**
   * La domanda arriva dal motore e si ferma qui finche' non risponde una delle due
   * facce. La promessa e' una sola anche se le facce sono due: la prima che risponde
   * chiude la partita, e l'altra vede la scheda chiudersi da sola.
   */
  private ask = (req: AskRequest): Promise<PermissionResult> => {
    const kind = askKind(req.tool);
    return new Promise<PermissionResult>((resolve) => {
      let done = false;
      const settle = (r: PermissionResult) => {
        if (done) return;
        done = true;
        this.pending.delete(req.id);
        resolve(r);
      };
      this.pending.set(req.id, { req, kind, settle });

      // Se il turno viene interrotto la domanda non ha piu' senso: si toglie di
      // mezzo la scheda invece di lasciarla appesa per sempre.
      req.signal.addEventListener('abort', () => {
        if (done) return;
        this.emit({ k: 'ask_done', id: req.id, ok: false, label: 'Cancelled' });
        settle({ behavior: 'deny', message: 'Turn interrupted.', decisionClassification: 'user_reject' });
      });

      this.emit({
        k: 'ask',
        id: req.id,
        kind,
        // The display name, not the bare tool id: the card shows it, and when the
        // engine hasn't written a title of its own the page builds one around it —
        // in whichever language the interface is set to. That's why the default
        // title isn't composed here any more.
        tool: req.displayName || req.tool,
        title: req.title || '',
        // Per il piano e per le domande il corpo lo disegna la scheda: qui dentro
        // ci finirebbe solo il JSON dell'input, che non serve a nessuno.
        detail: req.description || (kind === 'tool' ? summarize(req.input) : ''),
        canAlways: kind === 'tool' && !!req.suggestions?.length,
        ...(kind === 'plan' ? { plan: planText(req.input) } : {}),
        ...(kind === 'question' ? { questions: questionsOf(req.input) } : {}),
      });
    });
  };

  answer(id: string, choice: 'allow' | 'always' | 'deny', answers?: Record<string, string>) {
    const p = this.pending.get(id);
    if (!p) return;

    if (choice === 'deny') {
      this.emit({ k: 'ask_done', id, ok: false, label: p.kind === 'plan' ? 'Keep planning' : 'Rejected' });
      p.settle({
        behavior: 'deny',
        message:
          p.kind === 'plan'
            ? 'The plan is not approved: keep planning, do not change anything.'
            : 'Permission denied by whoever is using Claude Studio.',
        decisionClassification: 'user_reject',
      });
      return;
    }

    // Il piano approvato deve poter essere eseguito: restare in "plan" bloccherebbe
    // ogni scrittura subito dopo aver detto di si'.
    if (p.kind === 'plan') {
      this.setMode(choice === 'always' ? 'acceptEdits' : 'default');
      this.emit({
        k: 'ask_done',
        id,
        ok: true,
        label: choice === 'always' ? 'Approved, automatic edits' : 'Plan approved',
      });
      p.settle(allow(p.req.input, {}, 'user_temporary'));
      return;
    }

    if (p.kind === 'question') {
      this.emit({ k: 'ask_done', id, ok: true, label: labelOf(answers) });
      p.settle(allow({ ...p.req.input, answers: answers ?? {} }, {}, 'user_temporary'));
      return;
    }

    const always = choice === 'always';
    const updates: PermissionUpdate[] = always
      ? p.req.suggestions?.length
        ? p.req.suggestions
        : [
            {
              type: 'addRules',
              rules: [{ toolName: p.req.tool }],
              behavior: 'allow',
              destination: 'session',
            },
          ]
      : [];
    this.emit({ k: 'ask_done', id, ok: true, label: always ? 'Always allowed' : 'Allowed' });
    p.settle(
      allow(
        p.req.input,
        updates.length ? { updatedPermissions: updates } : {},
        always ? 'user_permanent' : 'user_temporary'
      )
    );
  }

  private closeAllPending(why: string) {
    for (const [id, p] of [...this.pending]) {
      this.pending.delete(id);
      this.broadcast({ k: 'ask_done', id, ok: false, label: 'Cancelled' });
      p.settle({ behavior: 'deny', message: why, decisionClassification: 'user_reject' });
    }
  }

  // ---- motore -----------------------------------------------------------

  private ensureSession(): Session {
    if (this.session) return this.session;

    const cli = findClaudeCli(cliSetting());
    if (!cli) {
      this.emit({
        k: 'error',
        message:
          'Cannot find the Claude Code CLI on this computer. Install it with "npm i -g @anthropic-ai/claude-code", or point to the claude command path in Settings > Claude Studio > Cli Path.',
      });
    }

    this.session = new Session({
      cwd: currentCwd(),
      cliPath: cli,
      emit: (e) => this.emit(e),
      ask: this.ask,
      permissionMode: this.mode,
      model: this.prefs.model,
      effort: this.prefs.effort,
      thinking: this.prefs.thinking,
      ide: { editor: ideServer() },
      ...(this.resume ? { resume: this.resume.id, fork: this.resume.fork } : {}),
    });
    // La ripresa vale per l'accensione, non per sempre: se poi si azzera la
    // conversazione non deve tornare fuori quella di prima.
    this.resume = undefined;
    return this.session;
  }

  private emit(e: Wire) {
    // L'elenco dei modelli lo dice la CLI: si tiene da parte, cosi' il menu non e'
    // vuoto la prossima volta che apri la chat prima di scrivere.
    if (e.k === 'models') {
      this.models = e.items;
      void this.ctx.globalState.update(MODELS_KEY, e.items);
      this.dropStaleModel(e.items);
    }
    if (e.k === 'commands') {
      this.commands = e.items;
      void this.ctx.globalState.update(COMMANDS_KEY, e.items);
    }
    // Le due volte in cui il lavoro si ferma e tocca a te: turno finito, o un
    // permesso da dare.
    if (e.k === 'turn_end') this.alert('done');
    if (e.k === 'ask') this.alert('ask');

    this.remember(e);
    // La barra di contesto ascolta lo stesso filo delle facce della chat: cosi' sa
    // per certo che sessione e' e a che punto sta, senza andarselo a cercare.
    if (this.primary) owned.observe(e, currentCwd());
    this.broadcast(e);
  }

  /**
   * Un modello scelto mesi fa resta scritto nelle preferenze anche quando la CLI
   * ha smesso di offrirlo: e' cosi' che ci si ritrova a lavorare con un modello
   * vecchio senza accorgersene. Quando arriva l'elenco vero, una scelta che non
   * c'e' piu' si butta via e si torna al consigliato — che e' sempre l'ultimo.
   */
  /**
   * Il livello d'impegno buono per un modello: quello che hai scelto se lui lo
   * accetta, altrimenti '' — cioe' "decidi tu". Finche' l'elenco dei modelli non
   * e' arrivato non si tocca niente: meglio la scelta di prima che una cancellata
   * per ignoranza.
   */
  private effortFor(model: string, effort: string): string {
    if (!effort || !this.models.length) return effort;
    const m = this.models.find((x) => (model ? x.value === model : x.recommended));
    if (!m) return effort;
    return m.efforts.includes(effort) ? effort : '';
  }

  private dropStaleModel(items: ModelChoice[]) {
    if (!items.length) return;
    let model =
      this.prefs.model && !items.some((m) => m.value === this.prefs.model) ? '' : this.prefs.model;
    // Il modello adesso si sceglie sempre a mano: "nessuna scelta" (che prima
    // voleva dire "automatico") e l'alias 'default' diventano il modello vero che
    // la CLI consiglia oggi, cosi' sulla carta si vede quale sta lavorando.
    if (!model || model === 'default') model = pickDefaultModel(items);
    // Caduto il modello cade anche il livello, se quello nuovo non lo accetta.
    const effort = this.effortFor(model, this.prefs.effort);
    if (model === this.prefs.model && effort === this.prefs.effort) return;

    const modelChanged = model !== this.prefs.model;
    const effortChanged = effort !== this.prefs.effort;
    this.prefs = { ...this.prefs, model, effort };
    void this.ctx.globalState.update(PREFS_KEY, this.prefs);
    if (modelChanged) void this.session?.setModel(model);
    if (effortChanged) void this.session?.setEffort(effort);
    this.broadcast({ k: 'prefs', value: this.prefs });
  }

  private broadcast(e: Wire) {
    for (const s of this.surfaces) s.post(e);
  }

  /**
   * La storia serve solo a ridisegnare. Quando arriva il testo definitivo di un
   * blocco si buttano via i pezzetti dello streaming: chi apre la scheda a meta'
   * conversazione non deve rivedere mille frammenti, ma il testo gia' composto.
   */
  private remember(e: Wire) {
    if (e.k === 'busy') {
      this.busy = e.value;
      return;
    }
    // Roba che si ridice per intero a chi si attacca (hello), o che non ha senso
    // ripetere: un `chime` rimesso in storia suonerebbe di nuovo ogni volta che
    // apri una seconda faccia.
    if (e.k === 'hello' || e.k === 'turn_start' || e.k === 'chime') return;
    if (e.k === 'prefs' || e.k === 'models' || e.k === 'commands') return;

    if (e.k === 'block_final') {
      this.history = this.history.filter(
        (h) => !((h.k === 'delta' || h.k === 'block_start') && h.id === e.id)
      );
    }
    this.history.push(e);
    if (this.history.length > MAX_HISTORY) this.history.splice(0, this.history.length - MAX_HISTORY);
  }
}

function cliSetting(): string {
  return vscode.workspace.getConfiguration('claudeStudio').get<string>('cliPath', '') || '';
}

const currentCwd = workspaceRoot;

/**
 * Il "si'" va sempre confezionato qui.
 * `updatedInput` non e' facoltativo: la CLI 2.1.79 rifiuta un `allow` senza, e lo
 * fa in silenzio — la scheda dice "consentito" e il tool torna fallito con un
 * ZodError dentro il risultato. Si rimanda indietro l'input com'e' arrivato.
 */
function allow(
  input: Record<string, unknown>,
  extra: { updatedPermissions?: PermissionUpdate[] },
  why: 'user_temporary' | 'user_permanent'
): PermissionResult {
  return { behavior: 'allow', updatedInput: input, ...extra, decisionClassification: why };
}

function askKind(tool: string): AskKind {
  if (tool === 'ExitPlanMode') return 'plan';
  if (tool === 'AskUserQuestion') return 'question';
  return 'tool';
}

function planText(input: Record<string, unknown>): string {
  const p = input?.plan;
  return typeof p === 'string' ? p : '';
}

/** Si tiene solo cio' che la scheda sa disegnare: il resto e' rumore da non passare. */
function questionsOf(input: Record<string, unknown>): AskQuestion[] {
  const raw = (input as any)?.questions;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((q: any) => ({
      question: String(q?.question ?? ''),
      header: String(q?.header ?? ''),
      multiSelect: !!q?.multiSelect,
      options: Array.isArray(q?.options)
        ? q.options.map((o: any) => ({
            label: String(o?.label ?? ''),
            description: typeof o?.description === 'string' ? o.description : undefined,
          }))
        : [],
    }))
    .filter((q) => q.question && q.options.length);
}

function labelOf(answers?: Record<string, string>): string {
  const v = answers ? Object.values(answers).filter(Boolean) : [];
  // The bare word goes through the page's dictionary (key `label.Answered`): the
  // extension writes these labels in English and the page says them in yours.
  return v.length ? v.join(' · ').slice(0, 80) : 'Answered';
}

function summarize(input: Record<string, unknown>): string {
  for (const k of ['command', 'file_path', 'path', 'pattern', 'query', 'url']) {
    const v = input?.[k];
    if (typeof v === 'string' && v.trim()) return v.slice(0, 400);
  }
  try {
    return JSON.stringify(input).slice(0, 400);
  } catch {
    return '';
  }
}
