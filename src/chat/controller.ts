// Lo stato della chat sta qui, non nelle viste. La stessa conversazione puo' essere
// aperta insieme nel pannello laterale e come scheda a tutto schermo: chi si attacca
// dopo si riprende la storia e vede esattamente quello che vede l'altra faccia.
import * as vscode from 'vscode';
import type { PermissionResult, PermissionUpdate } from '@anthropic-ai/claude-agent-sdk';
import { claudeCliVersion, findClaudeCli } from '../engine/cli';
import type { AskKind, AskQuestion, Mode, Wire } from '../engine/protocol';
import type { AskRequest } from '../engine/session';
import { Session } from '../engine/session';

export interface Surface {
  readonly kind: 'view' | 'panel';
  post(e: Wire): void;
}

/** Oltre questo si buttano via gli eventi piu' vecchi: e' solo materiale da ridisegno. */
const MAX_HISTORY = 4000;

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
  private mode: Mode = 'default';
  /** Permessi in attesa di risposta, per tool_use_id. */
  private pending = new Map<string, Pending>();

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
    for (const e of this.history) s.post(e);
    s.post({ k: 'busy', value: this.busy });
  }

  send(text: string) {
    this.ensureSession().send(text);
  }

  interrupt() {
    void this.session?.interrupt();
  }

  newSession() {
    this.closeAllPending('Sessione azzerata.');
    this.session?.dispose();
    this.session = undefined;
    this.history = [];
    this.busy = false;
    this.broadcast({ k: 'reset' });
    this.broadcast({ k: 'mode', value: this.mode });
  }

  setMode(value: Mode) {
    if (this.mode === value) return;
    this.mode = value;
    void this.session?.setPermissionMode(value);
    this.broadcast({ k: 'mode', value });
  }

  dispose() {
    this.closeAllPending('Estensione chiusa.');
    this.session?.dispose();
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
        this.emit({ k: 'ask_done', id: req.id, ok: false, label: 'Annullato' });
        settle({ behavior: 'deny', message: 'Turno interrotto.', decisionClassification: 'user_reject' });
      });

      this.emit({
        k: 'ask',
        id: req.id,
        kind,
        tool: req.tool,
        title: req.title || `Claude vuole usare ${req.displayName || req.tool}`,
        detail: req.description || summarize(req.input),
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
      this.emit({ k: 'ask_done', id, ok: false, label: p.kind === 'plan' ? 'Continua a pianificare' : 'Rifiutato' });
      p.settle({
        behavior: 'deny',
        message:
          p.kind === 'plan'
            ? 'Il piano non e’ approvato: continua a pianificare, non modificare niente.'
            : 'Permesso negato da chi usa Claude Studio.',
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
        label: choice === 'always' ? 'Approvato, modifiche automatiche' : 'Piano approvato',
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
    this.emit({ k: 'ask_done', id, ok: true, label: always ? 'Consentito sempre' : 'Consentito' });
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
      this.broadcast({ k: 'ask_done', id, ok: false, label: 'Annullato' });
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
          'Non trovo la CLI di Claude Code su questo computer. Installala con "npm i -g @anthropic-ai/claude-code", oppure indica il percorso di cli.js in Impostazioni > Claude Studio > Cli Path.',
      });
    }

    this.session = new Session({
      cwd: currentCwd(),
      cliPath: cli,
      emit: (e) => this.emit(e),
      ask: this.ask,
      permissionMode: this.mode,
    });
    return this.session;
  }

  private emit(e: Wire) {
    this.remember(e);
    this.broadcast(e);
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
    if (e.k === 'hello' || e.k === 'turn_start') return;

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

function currentCwd(): string {
  const f = vscode.workspace.workspaceFolders;
  return f && f.length ? f[0].uri.fsPath : process.cwd();
}

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
  return v.length ? v.join(' · ').slice(0, 80) : 'Risposto';
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
