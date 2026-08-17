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
  PermissionUpdate,
  Query,
  SDKMessage,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import type { SentFile, Thinking, TurnCtx, TurnModelUsage, Wire } from './protocol';
import { LOCAL_COMMANDS } from '../shared/localCommands';

/**
 * Tutto quello che serve per chiedere il permesso. `id` e' il `tool_use_id`:
 * lo stesso che arriva col `tool_start`, cosi' la scheda si aggancia al tool giusto
 * anche con piu' richieste in volo insieme.
 */
export interface AskRequest {
  id: string;
  tool: string;
  input: Record<string, unknown>;
  /** Frase gia' pronta dal motore ("Claude vuole leggere foo.txt"): meglio ricostruirla. */
  title?: string;
  displayName?: string;
  description?: string;
  /** Regole da rimandare indietro come `updatedPermissions` per "consenti sempre". */
  suggestions?: PermissionUpdate[];
  /** Scatta se il turno viene interrotto: la scheda va tolta di mezzo. */
  signal: AbortSignal;
}

export type PermissionAsker = (r: AskRequest) => Promise<PermissionResult>;

export interface SessionOptions {
  cwd: string;
  cliPath?: string;
  emit: (e: Wire) => void;
  ask: PermissionAsker;
  permissionMode?: PermissionMode;
  /** Il ponte con l'editor, se c'e' un editor vero da questa parte. */
  ide?: Options['mcpServers'];
  /** Id di una conversazione da riprendere. */
  resume?: string;
  /** Riprendi su un ramo nuovo, lasciando intatta quella originale. */
  fork?: boolean;
  /** '' = il modello predefinito della CLI, quello che useresti da terminale. */
  model?: string;
  /** '' solo se il modello non prende livelli d'impegno. */
  effort?: string;
  /** Acceso o spento: non c'e' piu' un "decidi tu" da passare al motore. */
  thinking?: Thinking;
  /**
   * Suona prima che uno strumento tocchi un file, e si aspetta: e' li' che i
   * checkpoint mettono da parte com'era. Dopo, il contenuto di prima non esiste
   * piu' da nessuna parte. Chi non tiene checkpoint non lo passa.
   */
  beforeTool?: (tool: string, input: Record<string, unknown>) => Promise<void>;
}

/**
 * "Sempre acceso" su un modello vecchio vuole un tetto di token, non una parola:
 * si passa un budget largo, che sui modelli nuovi vale comunque come "pensa".
 */
const THINK_BUDGET = 31999;

type Outgoing = { text: string; images?: { mime: string; data: string }[] };

export class Session {
  private pending: Outgoing[] = [];
  private wake?: () => void;
  private disposed = false;
  private q?: Query;
  private running?: Promise<void>;

  /**
   * Con un sub-agent al lavoro ci sono piu' messaggi in volo insieme, e i loro
   * blocchi hanno indici che ripartono da zero: tenere un solo "messaggio in corso"
   * li farebbe accavallare. Si tiene quindi un filo per ciascuno, con chiave il
   * sub-agent che lo produce ('' per il discorso principale).
   */
  private msgOf = new Map<string, string>();
  /** "<filo>#<indice del blocco>" -> testo accumulato dallo streaming. */
  private acc = new Map<string, { id: string; kind: 'text' | 'thinking'; text: string }>();
  /** Messaggi che hanno prodotto almeno un blocco in streaming. */
  private streamed = new Set<string>();
  /**
   * Quanto contesto occupa l'ultima chiamata API del filo principale, tenuto a
   * pezzi invece che sommato.
   *
   * NON si puo' usare l'usage del messaggio 'result': quello e' cumulativo su
   * tutto il turno, e siccome ogni chiamata API rilegge la cache i
   * cache_read_input_tokens si sommano ad ogni tool-use. Un turno con dieci
   * round trip arrivava a dichiarare milioni di token su una finestra da 1M,
   * da cui le percentuali sopra il 100%. L'usage dei singoli messaggi
   * assistant, invece, e' per chiamata: e' quello che misura il contesto.
   *
   * A pezzi e non solo sommati perche' il totale nasconde la cosa che si vuole
   * sapere: una cache buttata via si vede come `cacheRead` che crolla e
   * `cacheCreate` che esplode, mentre il totale resta li' dov'era.
   */
  private ctx: TurnCtx = { input: 0, cacheRead: 0, cacheCreate: 0, output: 0 };
  /**
   * Il modello che ha davvero risposto, come lo dichiara il messaggio. Non e'
   * detto sia quello chiesto: la CLI puo' risolvere un alias, o servire altro.
   */
  private served = '';
  /**
   * `result.modelUsage` com'era alla fine del turno prima. E' cumulativo sulla
   * sessione, quindi il consumo del turno e' la differenza fra i due.
   */
  private usedBefore: Record<string, any> = {};

  sessionId?: string;
  model = '';
  busy = false;

  constructor(private o: SessionOptions) {}

  /** Manda un messaggio. La prima volta accende anche il processo. */
  send(text: string, images?: { mime: string; data: string }[], echo?: string, files?: SentFile[]) {
    if (this.disposed) return;
    // `files` non entra in `pending`: i percorsi sono gia' dentro `text`, rimandarli
    // al motore vorrebbe dire scriverli due volte nello stesso messaggio.
    this.pending.push({ text, images });
    // `echo` e' quello che si vede nella chat: il messaggio vero puo' portarsi
    // dietro anche il codice selezionato, che nella chat sarebbe un muro.
    this.o.emit({ k: 'user', text: echo ?? text, images, files });
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

  /**
   * Modello, impegno e pensiero si cambiano a sessione accesa: valgono dal turno
   * dopo, senza buttare via la conversazione. Se il motore non e' ancora partito
   * non c'e' niente da dire a nessuno — le stesse scelte gli arrivano come opzioni
   * quando si accende.
   */
  async setModel(model: string) {
    this.o.model = model;
    try {
      await this.q?.setModel(model || undefined);
    } catch {
      /* CLI vecchia o sessione non ancora partita */
    }
  }

  async setEffort(effort: string) {
    this.o.effort = effort;
    try {
      // `null` toglie la scelta dallo strato dei flag e rimette quella di sotto:
      // e' cosi' che si torna ad "automatico" senza riaccendere il processo.
      await this.q?.applyFlagSettings({ effortLevel: (effort || null) as any });
    } catch {
      /* idem */
    }
  }

  async setThinking(v: Thinking) {
    this.o.thinking = v;
    try {
      await this.q?.setMaxThinkingTokens(v === 'off' ? 0 : THINK_BUDGET);
    } catch {
      /* idem */
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
      const out = this.pending.shift()!;
      // Le immagini incollate viaggiano come blocchi, prima del testo: e' l'ordine
      // in cui si guardano.
      const content: any = out.images?.length
        ? [
            ...out.images.map((i) => ({
              type: 'image',
              source: { type: 'base64', media_type: i.mime, data: i.data },
            })),
            { type: 'text', text: out.text },
          ]
        : out.text;
      yield {
        type: 'user',
        message: { role: 'user', content },
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
      // senza questo del sub-agent arrivano solo i tool: il suo discorso resta muto
      forwardSubagentText: true,
      permissionMode: this.o.permissionMode ?? 'default',
      canUseTool: this.canUseTool,
      // Le istruzioni di Claude Code, chieste per nome.
      //
      // Non chiederle non voleva dire "prendi quelle di serie": l'SDK, quando questa
      // riga manca, manda alla CLI un prompt di sistema *vuoto* — `if (s === void 0)
      // p = ""` — cioe' le dice esplicitamente "non hai istruzioni". Che oggi la CLI
      // ignori una stringa vuota e si comporti lo stesso da Claude Code e' un
      // dettaglio della sua implementazione, non una promessa: le si stava dicendo una
      // cosa e contando su un'altra, e il giorno in cui prendesse quel vuoto alla
      // lettera il pannello resterebbe con un modello senza mestiere, senza che qui
      // dentro sia cambiata una virgola. Un prompt di sistema personalizzato lo
      // rispetta eccome — provato — quindi la stringa vuota vive solo di clemenza.
      //
      // Il preset e' la strada documentata per dire "voglio Claude Code": si paga
      // pieno una volta per sessione — sta in testa alla richiesta, dentro la cache
      // del prompt — e da li' in poi si rilegge, che costa una frazione.
      systemPrompt: { type: 'preset', preset: 'claude_code' },
      // Vuoto vuol dire "non dire niente": la CLI usa quello che useresti da
      // terminale. Si passa solo cio' che hai scelto apposta.
      ...(this.o.model ? { model: this.o.model } : {}),
      ...(this.o.effort ? { effort: this.o.effort as Options['effort'] } : {}),
      // Sempre detto, mai sottinteso. Prima, con "auto", questa riga spariva e la
      // CLI faceva di testa sua — che per i modelli capaci vuol dire comunque
      // ragionamento adattivo, cioe' la stessa cosa di "acceso", ma decisa altrove.
      thinking:
        this.o.thinking === 'off' ? { type: 'disabled' as const } : { type: 'adaptive' as const },
      ...(this.o.resume ? { resume: this.o.resume, forkSession: !!this.o.fork } : {}),
      ...(this.o.ide ? { mcpServers: this.o.ide } : {}),
      // Chiamiamo la CLI installata sul PC: senza questo l'SDK cerca il proprio
      // binario nativo, che apposta non impacchettiamo.
      ...(this.o.cliPath ? { pathToClaudeCodeExecutable: this.o.cliPath } : {}),
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        NO_COLOR: '1',
        CLAUDE_AGENT_SDK_CLIENT_APP: 'claude-studio',
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

  /**
   * Gli slash command veri della CLI — skill, comandi del progetto, plugin —
   * piu' quelli che fa l'interfaccia da se' (vedi chat/commands.ts). Nel menu
   * stanno insieme: da qui dentro sono la stessa cosa, si scrivono uguale.
   */
  private async publishCommands() {
    try {
      const list = (await this.q?.supportedCommands()) ?? [];
      // Quello che risponde la CLI sono le skill: il tipo del SDK lo dice a chiare
      // lettere ("Information about an available skill"). I comandi classici non
      // stanno in quell'elenco, e per questo vanno aggiunti qui sotto.
      const fromCli = list
        .map((c: any) => ({
          name: String(c.name ?? ''),
          description: String(c.description ?? '').slice(0, 200),
          group: 'skill' as const,
          argumentHint: c.argumentHint ? String(c.argumentHint).slice(0, 60) : undefined,
          aliases: Array.isArray(c.aliases) ? c.aliases.map(String).slice(0, 8) : undefined,
        }))
        .filter((c) => c.name);
      // Il motore vince sui doppioni: "clear" e' suo di nome, ma a eseguirlo e'
      // l'interfaccia — il menu pero' deve mostrarne uno solo.
      const seen = new Set(fromCli.map((c) => c.name));
      const mine = LOCAL_COMMANDS.filter((c) => !seen.has(c.name)).map((c) => ({
        ...c,
        group: 'claude' as const,
      }));
      // I classici per primi. Prima venivano in coda e il menu ne mostrava solo i
      // primi quaranta: con abbastanza skill installate, /clear e /rewind cadevano
      // fuori dall'elenco pur essendo i due che si cercano piu' spesso.
      const items = [...mine, ...fromCli];
      if (!items.length) return;
      this.o.emit({ k: 'commands', items });
    } catch {
      /* una CLI piu' vecchia puo' non saperlo dire: si resta senza elenco */
    }
  }

  /**
   * L'elenco dei modelli lo dice la CLI installata, non una lista scritta a mano
   * qui dentro: cosi' non invecchia, e si porta dietro anche quali livelli di
   * impegno accetta ciascuno.
   */
  private async publishModels() {
    try {
      const list = await this.q?.supportedModels();
      if (!list) return;
      this.o.emit({
        k: 'models',
        items: list.map((m) => ({
          value: String(m.value ?? ''),
          label: String(m.displayName || m.value || ''),
          description: String(m.description ?? '').slice(0, 160),
          resolved: String((m as { resolvedModel?: string }).resolvedModel ?? ''),
          efforts: m.supportsEffort ? [...(m.supportedEffortLevels ?? ['low', 'medium', 'high'])] : [],
          adaptive: m.supportsAdaptiveThinking !== false,
          // "default" e' l'alias che segue quello che la CLI consiglia oggi: chi lo
          // sceglie si ritrova il modello nuovo il giorno che esce, senza fare niente.
          recommended: String(m.value ?? '') === 'default',
        })).filter((m) => m.value),
      });
    } catch {
      /* una CLI piu' vecchia puo' non saperlo dire: resta la scelta predefinita */
    }
  }

  private canUseTool = async (
    toolName: string,
    input: Record<string, unknown>,
    opts: {
      signal: AbortSignal;
      toolUseID: string;
      suggestions?: PermissionUpdate[];
      title?: string;
      displayName?: string;
      description?: string;
    }
  ): Promise<PermissionResult> => {
    // Com'era prima si prende adesso: qui il file e' ancora quello di partenza.
    // Prima di chiedere il permesso, non dopo — a permesso dato lo strumento
    // scrive subito, e chi arrivasse dopo copierebbe gia' il lavoro fatto.
    await this.o.beforeTool?.(toolName, input);
    return this.o.ask({
      id: opts.toolUseID,
      tool: toolName,
      input,
      title: opts.title,
      displayName: opts.displayName,
      description: opts.description,
      suggestions: opts.suggestions,
      signal: opts.signal,
    });
  };

  // ---- traduzione dei messaggi SDK in eventi per la webview --------------

  private onMessage(m: SDKMessage) {
    switch (m.type) {
      case 'system':
        if (m.subtype === 'init') {
          this.sessionId = m.session_id;
          this.model = m.model;
          this.o.emit({ k: 'session', id: m.session_id, model: m.model, cwd: this.o.cwd });
          void this.publishCommands();
          void this.publishModels();
        }
        // La lista degli slash command puo' cambiare a meta' sessione (skill trovate
        // per strada): quando cambia si rilegge, non si tiene quella vecchia.
        if ((m as any).subtype === 'commands_changed') void this.publishCommands();
        return;

      case 'stream_event':
        this.onStreamEvent(m.event as any, m.parent_tool_use_id ?? null);
        return;

      case 'assistant': {
        // Solo il filo principale: un sub-agente ha una finestra sua, e prenderla
        // per buona farebbe crollare la percentuale del discorso principale.
        if (!m.parent_tool_use_id) {
          const said = String((m as any).message?.model ?? '');
          if (said) this.served = said;
          const u: any = (m as any).message?.usage;
          if (u) {
            const c: TurnCtx = {
              input: u.input_tokens ?? 0,
              cacheRead: u.cache_read_input_tokens ?? 0,
              cacheCreate: u.cache_creation_input_tokens ?? 0,
              output: u.output_tokens ?? 0,
            };
            if (c.input + c.cacheRead + c.cacheCreate + c.output > 0) this.ctx = c;
          }
        }
        this.onAssistant(m.message.id, m.message.content as any[], m.parent_tool_use_id ?? null);
        return;
      }

      case 'user':
        this.onToolResults(m.message.content as any);
        return;

      case 'result': {
        this.acc.clear();
        this.msgOf.clear();
        const ok = m.subtype === 'success';
        const models = this.turnUsage((m as any).modelUsage);
        const c = this.ctx;
        this.o.emit({
          k: 'turn_end',
          ok,
          totalUsd: (m as any).total_cost_usd ?? 0,
          turnUsd: models.reduce((s, u) => s + u.costUsd, 0),
          durationMs: (m as any).duration_ms ?? 0,
          // Contesto occupato dall'ultima chiamata, non la somma del turno.
          tokens: c.input + c.cacheRead + c.cacheCreate + c.output,
          ctx: c,
          models,
          model: this.served,
          effort: this.o.effort ?? '',
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

  /**
   * Cosa ha consumato *questo* turno, modello per modello.
   *
   * `result.modelUsage` e' cumulativo sulla sessione — e comprende sub-agent,
   * sidechain e compattazioni, che `result.usage` invece lascia fuori — quindi il
   * turno e' la differenza col turno prima. Un `/clear` a meta' sessione azzera il
   * conteggio del motore: si vede da un numero che va all'indietro, e in quel caso
   * il valore grezzo *e'* gia' il turno.
   */
  private turnUsage(now: unknown): TurnModelUsage[] {
    const cur = (now ?? {}) as Record<string, any>;
    const out: TurnModelUsage[] = [];
    for (const [model, u] of Object.entries(cur)) {
      const p = this.usedBefore[model];
      const reset = !p || (u.inputTokens ?? 0) < (p.inputTokens ?? 0);
      const was = reset ? undefined : p;
      const d: TurnModelUsage = {
        model,
        input: (u.inputTokens ?? 0) - (was?.inputTokens ?? 0),
        output: (u.outputTokens ?? 0) - (was?.outputTokens ?? 0),
        cacheRead: (u.cacheReadInputTokens ?? 0) - (was?.cacheReadInputTokens ?? 0),
        cacheCreate: (u.cacheCreationInputTokens ?? 0) - (was?.cacheCreationInputTokens ?? 0),
        costUsd: (u.costUSD ?? 0) - (was?.costUSD ?? 0),
        contextWindow: u.contextWindow ?? 0,
      };
      // Un modello che questo turno non ha toccato resta nell'elenco cumulativo: la
      // sua differenza e' zero, e una riga di zeri non e' una notizia.
      if (d.input || d.output || d.cacheRead || d.cacheCreate || d.costUsd) out.push(d);
    }
    this.usedBefore = cur;
    return out;
  }

  private onStreamEvent(ev: any, parent: string | null) {
    const thread = parent ?? '';
    const key = `${thread}#${ev?.index}`;

    switch (ev?.type) {
      case 'message_start':
        this.msgOf.set(thread, ev.message?.id || `m${Date.now()}`);
        // si azzera solo il proprio filo: quello del sub-agent va avanti per conto suo
        for (const k of [...this.acc.keys()]) if (k.startsWith(thread + '#')) this.acc.delete(k);
        if (this.streamed.size > 64) this.streamed.clear();
        if (!parent) this.o.emit({ k: 'turn_start' });
        return;

      case 'content_block_start': {
        const kind = blockKind(ev.content_block?.type);
        if (!kind) return; // tool_use: lo prende il messaggio completo, con l'input gia' valido
        const msgId = this.msgOf.get(thread) || 'm';
        const id = `${msgId}_${ev.index}`;
        this.acc.set(key, { id, kind, text: '' });
        this.streamed.add(msgId);
        this.o.emit({ k: 'block_start', id, kind, parent });
        return;
      }

      case 'content_block_delta': {
        const b = this.acc.get(key);
        if (!b) return;
        const d = ev.delta;
        const thinking = d?.type === 'thinking_delta';
        const text = d?.type === 'text_delta' ? d.text : thinking ? d.thinking : '';
        if (!text) return;
        b.text += text;
        this.o.emit({ k: 'delta', id: b.id, kind: b.kind, text, parent });
        return;
      }

      // Il confine giusto per chiudere un blocco e' questo, non il messaggio
      // assistant completo: quello arriva PRIMA che il blocco finisca di scorrere,
      // e chiudere li' lasciava per strada i frammenti arrivati dopo.
      case 'content_block_stop': {
        const b = this.acc.get(key);
        if (!b) return;
        this.acc.delete(key);
        this.o.emit({ k: 'block_final', id: b.id, kind: b.kind, text: b.text, parent });
        return;
      }
    }
  }

  /**
   * Del messaggio assistant completo servono i tool: hanno l'input gia' valido,
   * mentre in streaming arriva a pezzi di JSON. Il testo lo possiede lo streaming;
   * si prende da qui solo se per quel messaggio lo streaming non ha prodotto niente.
   */
  private onAssistant(msgId: string, content: any[], parent: string | null) {
    if (!Array.isArray(content)) return;
    const viaStream = this.streamed.has(msgId);
    content.forEach((b, i) => {
      if (b?.type === 'tool_use') {
        this.o.emit({ k: 'tool_start', id: b.id, name: b.name, input: b.input, parent });
        return;
      }
      if (viaStream) return;
      const kind = blockKind(b?.type);
      if (!kind) return;
      const text = kind === 'text' ? b.text ?? '' : b.thinking ?? '';
      this.o.emit({ k: 'block_final', id: `${msgId}_${i}`, kind, text, parent });
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
