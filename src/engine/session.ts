// Il motore. Una sessione = un processo `claude` in ingresso/uscita streaming.
//
// Si usa la modalita' a input streaming (prompt = AsyncIterable): il processo resta
// vivo fra un turno e l'altro, ed e' l'unica in cui funzionano interrupt,
// setPermissionMode e canUseTool. Il generatore di input si sblocca a ogni messaggio
// e si chiude solo con dispose(), altrimenti il processo non morirebbe mai.
import { query } from '@anthropic-ai/claude-agent-sdk';
import type {
  Options,
  PermissionMode,
  PermissionResult,
  Query,
  SDKMessage,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import type { Wire } from './protocol';

export type PermissionAsker = (
  toolName: string,
  input: Record<string, unknown>,
  meta: { title?: string; displayName?: string; subtitle?: string }
) => Promise<PermissionResult>;

export interface SessionOptions {
  cwd: string;
  cliPath?: string;
  emit: (e: Wire) => void;
  ask: PermissionAsker;
  permissionMode?: PermissionMode;
}

export class Session {
  private pending: string[] = [];
  private wake?: () => void;
  private disposed = false;
  private q?: Query;
  private running?: Promise<void>;

  /** id del messaggio API in corso: entra negli id dei blocchi, che restano unici. */
  private msgId = '';
  /** indice del content block -> testo accumulato dallo streaming. */
  private acc = new Map<number, { id: string; kind: 'text' | 'thinking'; text: string }>();
  /** Messaggi che hanno prodotto almeno un blocco in streaming. */
  private streamed = new Set<string>();

  sessionId?: string;
  model = '';
  busy = false;

  constructor(private o: SessionOptions) {}

  /** Manda un messaggio. La prima volta accende anche il processo. */
  send(text: string) {
    if (this.disposed) return;
    this.pending.push(text);
    this.o.emit({ k: 'user', text });
    this.setBusy(true);
    if (!this.running) this.running = this.run();
    this.wake?.();
  }

  async interrupt() {
    try {
      await this.q?.interrupt();
    } catch {
      /* processo gia' andato: non e' un errore da mostrare */
    }
  }

  async setPermissionMode(mode: PermissionMode) {
    try {
      await this.q?.setPermissionMode(mode);
    } catch {
      /* la sessione puo' non essere ancora partita */
    }
  }

  dispose() {
    this.disposed = true;
    this.wake?.();
    void this.interrupt();
  }

  // ---- input streaming --------------------------------------------------

  private async *input(): AsyncGenerator<SDKUserMessage> {
    while (!this.disposed) {
      if (!this.pending.length) {
        await new Promise<void>((r) => {
          this.wake = r;
        });
        this.wake = undefined;
        continue;
      }
      const text = this.pending.shift()!;
      yield {
        type: 'user',
        message: { role: 'user', content: text },
        parent_tool_use_id: null,
        session_id: this.sessionId ?? '',
      };
    }
  }

  private setBusy(v: boolean) {
    if (this.busy === v) return;
    this.busy = v;
    this.o.emit({ k: 'busy', value: v });
  }

  // ---- ciclo principale -------------------------------------------------

  private async run() {
    const options: Options = {
      cwd: this.o.cwd,
      includePartialMessages: true, // e' questo che fa arrivare il testo parola per parola
      permissionMode: this.o.permissionMode ?? 'default',
      canUseTool: this.canUseTool,
      // Chiamiamo la CLI installata sul PC: senza questo l'SDK cerca il proprio
      // binario nativo, che apposta non impacchettiamo.
      ...(this.o.cliPath ? { pathToClaudeCodeExecutable: this.o.cliPath } : {}),
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        NO_COLOR: '1',
        CLAUDE_AGENT_SDK_CLIENT_APP: 'claude-studio/0.1.0',
      },
    };

    try {
      this.q = query({ prompt: this.input(), options });
      for await (const m of this.q) this.onMessage(m);
    } catch (e) {
      if (!this.disposed) {
        this.o.emit({ k: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    } finally {
      this.setBusy(false);
      this.running = undefined;
    }
  }

  private canUseTool = async (
    toolName: string,
    input: Record<string, unknown>,
    opts: { title?: string; displayName?: string; subtitle?: string }
  ): Promise<PermissionResult> =>
    this.o.ask(toolName, input, {
      title: opts.title,
      displayName: opts.displayName,
      subtitle: opts.subtitle,
    });

  // ---- traduzione dei messaggi SDK in eventi per la webview --------------

  private onMessage(m: SDKMessage) {
    switch (m.type) {
      case 'system':
        if (m.subtype === 'init') {
          this.sessionId = m.session_id;
          this.model = m.model;
          this.o.emit({ k: 'session', id: m.session_id, model: m.model, cwd: this.o.cwd });
        }
        return;

      case 'stream_event':
        this.onStreamEvent(m.event as any);
        return;

      case 'assistant':
        this.onAssistant(m.message.id, m.message.content as any[]);
        return;

      case 'user':
        this.onToolResults(m.message.content as any);
        return;

      case 'result': {
        this.acc.clear();
        const ok = m.subtype === 'success';
        const u: any = (m as any).usage ?? {};
        this.o.emit({
          k: 'turn_end',
          ok,
          costUsd: (m as any).total_cost_usd ?? 0,
          durationMs: (m as any).duration_ms ?? 0,
          tokens:
            (u.input_tokens ?? 0) +
            (u.cache_read_input_tokens ?? 0) +
            (u.cache_creation_input_tokens ?? 0) +
            (u.output_tokens ?? 0),
        });
        if (!ok && (m as any).subtype !== 'success') {
          const msg = (m as any).result;
          if (typeof msg === 'string' && msg) this.o.emit({ k: 'error', message: msg });
        }
        this.setBusy(false);
        return;
      }
    }
  }

  private onStreamEvent(ev: any) {
    switch (ev?.type) {
      case 'message_start':
        this.msgId = ev.message?.id || `m${Date.now()}`;
        this.acc.clear();
        if (this.streamed.size > 64) this.streamed.clear();
        this.o.emit({ k: 'turn_start' });
        return;

      case 'content_block_start': {
        const kind = blockKind(ev.content_block?.type);
        if (!kind) return; // tool_use: lo prende il messaggio completo, con l'input gia' valido
        const id = `${this.msgId}_${ev.index}`;
        this.acc.set(ev.index, { id, kind, text: '' });
        this.streamed.add(this.msgId);
        this.o.emit({ k: 'block_start', id, kind });
        return;
      }

      case 'content_block_delta': {
        const b = this.acc.get(ev.index);
        if (!b) return;
        const d = ev.delta;
        const thinking = d?.type === 'thinking_delta';
        const text = d?.type === 'text_delta' ? d.text : thinking ? d.thinking : '';
        if (!text) return;
        b.text += text;
        this.o.emit({ k: 'delta', id: b.id, kind: b.kind, text });
        return;
      }

      // Il confine giusto per chiudere un blocco e' questo, non il messaggio
      // assistant completo: quello arriva PRIMA che il blocco finisca di scorrere,
      // e chiudere li' lasciava per strada i frammenti arrivati dopo.
      case 'content_block_stop': {
        const b = this.acc.get(ev.index);
        if (!b) return;
        this.acc.delete(ev.index);
        this.o.emit({ k: 'block_final', id: b.id, kind: b.kind, text: b.text });
        return;
      }
    }
  }

  /**
   * Del messaggio assistant completo servono i tool: hanno l'input gia' valido,
   * mentre in streaming arriva a pezzi di JSON. Il testo lo possiede lo streaming;
   * si prende da qui solo se per quel messaggio lo streaming non ha prodotto niente.
   */
  private onAssistant(msgId: string, content: any[]) {
    if (!Array.isArray(content)) return;
    const viaStream = this.streamed.has(msgId);
    content.forEach((b, i) => {
      if (b?.type === 'tool_use') {
        this.o.emit({ k: 'tool_start', id: b.id, name: b.name, input: b.input });
        return;
      }
      if (viaStream) return;
      const kind = blockKind(b?.type);
      if (!kind) return;
      const text = kind === 'text' ? b.text ?? '' : b.thinking ?? '';
      this.o.emit({ k: 'block_final', id: `${msgId}_${i}`, kind, text });
    });
  }

  /**
   * Gli esiti dei tool si agganciano per `tool_use_id`, mai per posizione:
   * con piu' tool in parallelo la posizione attacca l'esito al tool sbagliato.
   */
  private onToolResults(content: any) {
    if (!Array.isArray(content)) return;
    for (const b of content) {
      if (b?.type !== 'tool_result') continue;
      this.o.emit({
        k: 'tool_end',
        id: b.tool_use_id,
        ok: !b.is_error,
        text: flatten(b.content),
      });
    }
  }
}

function blockKind(t: unknown): 'text' | 'thinking' | null {
  if (t === 'text') return 'text';
  if (t === 'thinking' || t === 'redacted_thinking') return 'thinking';
  return null;
}

function flatten(c: unknown): string {
  if (typeof c === 'string') return c;
  if (!Array.isArray(c)) return '';
  return c
    .map((p: any) => (typeof p === 'string' ? p : p?.type === 'text' ? p.text : ''))
    .filter(Boolean)
    .join('\n');
}
