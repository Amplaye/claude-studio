// Lo stato della chat sta qui, non nelle viste. La stessa conversazione puo' essere
// aperta insieme nel pannello laterale e come scheda a tutto schermo: chi si attacca
// dopo si riprende la storia e vede esattamente quello che vede l'altra faccia.
import * as vscode from 'vscode';
import type { PermissionResult, PermissionUpdate } from '@anthropic-ai/claude-agent-sdk';
import { claudeCliVersion, findClaudeCli } from '../engine/cli';
import type {
  AskKind,
  AskQuestion,
  ModelChoice,
  Mode,
  Pasted,
  Prefs,
  SentFile,
  Wire,
} from '../engine/protocol';
import { pickFiles, stashFile } from './attach';
import { type CommandHost, runLocalCommand } from './commands';
import { Checkpoints } from './checkpoints';
import { DEFAULT_PREFS } from '../engine/protocol';
import { ideServer } from '../engine/ide';
import { setChatBadge } from './badge';
import { owned } from '../context/owned';
import { currentSelection, findFiles, workspaceRoot } from './editor';
import type { AskRequest } from '../engine/session';
import { Session } from '../engine/session';
import { recentSessions, replaySession } from './history';
import { sound } from './sound';
import { forgetSession, readSessionNames, writeSessionName } from '../context/sessions';
import { announceLang, t } from '../shared/i18n';
import type { TaskStore } from '../tasks/store';

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
 * L'ultima conversazione di *questo* progetto. Ricaricando la finestra il processo
 * muore e la cronologia in memoria se ne va con lui, ma la trascrizione resta sul
 * disco: basta ricordarsi quale, e si torna al lavoro dove lo si era lasciato.
 * Sta in workspaceState perche' una sessione appartiene al progetto, non a te.
 */
const LAST_SESSION_KEY = 'claudeStudio.lastSession';

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

/** Un contatore per dare a ogni chat un nome interno che non si ripete. */
let keySeq = 0;

export class ChatController {
  private session?: Session;
  private history: Wire[] = [];
  /** Com'era il codice prima di ogni messaggio: e' quello che "/rewind" rimette. */
  private readonly checkpoints = new Checkpoints();
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
   * Il bollino sull'icona e' uno solo per finestra: lo governa il principale.
   * La barra di contesto invece li ascolta tutti — ogni scheda e' una conversazione
   * vera, con i suoi token, e prima erano tre e se ne vedeva una.
   */
  private readonly primary: boolean;
  /** Chi e' questa chat per la barra di contesto: uno per controller, stabile. */
  readonly key: string;
  private titleFns = new Set<() => void>();

  /** Dove finisce l'elenco delle task, se qualcuno lo sta guardando. */
  private readonly tasks?: TaskStore;

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    opts?: { primary?: boolean; tasks?: TaskStore }
  ) {
    this.primary = opts?.primary !== false;
    this.tasks = opts?.tasks;
    this.key = 'chat' + ++keySeq;
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

  // ---- come si chiama questa conversazione --------------------------------
  //
  // "Claude Studio #2" non dice niente: con tre schede aperte sono tre etichette
  // identiche e per sapere dove sei devi aprirle a una a una. Il nome e' quello
  // della conversazione — quello che le hai dato, o la prima cosa che hai scritto.

  /** Il nome da scrivere sulla scheda. */
  name(): string {
    const mine = owned.all().find((s) => s.key === this.key);
    const given = mine?.id ? readSessionNames()[mine.id] : '';
    const text = (given || mine?.title || '').replace(/\s+/g, ' ').trim();
    if (!text) return 'Claude Studio';
    return text.length > 42 ? text.slice(0, 41).trimEnd() + '…' : text;
  }

  /** Ogni volta che quel nome puo' essere cambiato. */
  onTitle(fn: () => void): vscode.Disposable {
    this.titleFns.add(fn);
    return { dispose: () => this.titleFns.delete(fn) };
  }

  private titleChanged() {
    for (const fn of this.titleFns) {
      try {
        fn();
      } catch {
        /* un titolo non deve poter buttare giu' la chat */
      }
    }
  }

  /** Rinomina la conversazione aperta qui. Il nome resta scritto sul disco. */
  async rename() {
    const mine = owned.all().find((s) => s.key === this.key);
    if (!mine?.id) {
      void vscode.window.showInformationMessage(
        t(this.prefs.lang, 'rename.none')
      );
      return;
    }
    const val = await vscode.window.showInputBox({
      prompt: t(this.prefs.lang, 'rename.prompt'),
      value: readSessionNames()[mine.id] || mine.title || '',
      placeHolder: t(this.prefs.lang, 'rename.placeholder'),
    });
    if (val === undefined) return; // annullato
    writeSessionName(mine.id, val.trim());
    this.titleChanged();
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

  /**
   * Questa conversazione ce l'hai davanti adesso? Serve per decidere se accendere
   * il segnalino di "ha finito": la finestra dev'essere in primo piano *e* questa
   * dev'essere la faccia davanti. Con la scheda dietro a un file aperto, o con VS
   * Code minimizzato, non stai guardando.
   */
  private inFront(): boolean {
    if (!vscode.window.state.focused) return false;
    const cur = owned.current();
    return !!cur && cur.key === this.key && !!owned.looking();
  }

  /** Sei tornato a guardare: il bollino ha finito il suo mestiere. */
  onWindowFocus() {
    // Il segnalino della conversazione che hai davanti si spegne: sei tornato, e
    // quella l'hai vista. Le altre restano accese — non le hai ancora guardate.
    const cur = owned.current();
    if (cur?.key === this.key && owned.clearDone(this.key)) this.titleChanged();
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

    // Il numero sul bollino e' quante hanno finito e non le hai ancora viste, non
    // un "1" fisso: con tre conversazioni in corso dice anche quante ti aspettano.
    if (!focused && this.primary) setChatBadge(Math.max(1, owned.doneCount()));
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

    // Non piu' "una faccia di questa conversazione": una pagina che si senta
    // davvero, in tutta la finestra. Con piu' sessioni aperte la faccia di questa
    // conversazione e' spesso una scheda che non hai mai toccato, e una pagina
    // mai toccata non ha il permesso di suonare (vedi sound.ts).
    sound.play({ k: 'chime', event, sound: p.sound, volume: p.volume });
  }

  /**
   * Il codice selezionato nell'editor si attacca al messaggio vero, non a quello
   * che si legge nella chat: nella chat resta la frase, il muro di codice no.
   */
  send(text: string, images?: Pasted[], withSelection?: boolean, files?: SentFile[]) {
    // I comandi che sono azioni dell'interfaccia si fermano qui: mandarli al
    // motore come testo lascerebbe la chat piena e il contesto intatto — era il
    // difetto di "/clear". Quelli che il motore sa fare passano oltre. Vedi
    // chat/commands.ts.
    if (runLocalCommand(text, this.commandHost())) return;
    let full = text;
    if (withSelection) {
      const sel = currentSelection();
      if (sel) {
        full =
          `${text}\n\n<selection file="${sel.rel}" lines="${sel.lines}">\n${sel.text}\n</selection>`.trim();
      }
    }
    // Gli allegati che non sono immagini si attaccano al messaggio vero come
    // percorsi: e' Claude ad aprirli, con gli strumenti che ha gia'. Un PDF, un
    // CSV, un log da duecento megabyte — nessuno di questi passa di qui dentro,
    // passa solo dove trovarlo. Nella chat resta la frase, come per la selezione.
    if (files?.length) {
      const list = files.map((f) => `- ${f.path}`).join('\n');
      full =
        `${full}\n\n<attachments>\n${list}\n</attachments>\n` +
        `The files above are attached to this message: open them with your tools ` +
        `(Read for text, PDFs and notebooks) before answering.`;
      full = full.trim();
    }
    // Da qui in poi le modifiche appartengono a questo messaggio: e' il punto a
    // cui "/rewind" sa tornare.
    this.checkpoints.begin(text);
    // I file viaggiano a parte dall'eco: nel messaggio vero sono gia' dentro `full`
    // come percorsi, qui servono solo perche' la chat possa disegnarli attaccati al
    // messaggio, esattamente come fa con le immagini.
    this.ensureSession().send(full, images, text, files);
  }

  /** Il fermaglio: il selettore di VS Code, senza filtri. */
  async pickAttachments(s: Surface) {
    const items = await pickFiles(this.prefs.lang);
    if (items.length) s.post({ k: 'attached', items });
  }

  /** Un file arrivato dalla pagina e non dal disco: prima diventa un file vero. */
  async stashAttachment(s: Surface, name: string, data: string) {
    const one = await stashFile(this.ctx, name, data);
    if (one) s.post({ k: 'attached', items: [one] });
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
    // Chiedendo una conversazione nuova, quella vecchia non va piu' riaperta al
    // prossimo avvio: il segnaposto si cancella subito, non alla prima risposta.
    if (this.primary) void this.ctx.workspaceState.update(LAST_SESSION_KEY, undefined);
    this.clear();
  }

  // ---- i comandi che sono azioni dell'interfaccia (vedi chat/commands.ts) ----

  /** Quello che i comandi locali hanno il permesso di toccare, e nient'altro. */
  private commandHost(): CommandHost {
    return {
      lang: this.prefs.lang,
      newSession: () => this.newSession(),
      sendHistory: () => void this.sendHistory(),
      rewind: () => void this.rewind(),
      openMemory: () => void this.openMemory(),
      exportConversation: () => void this.exportConversation(),
      addDirectory: () => void this.addDirectory(),
      closeTab: () => void vscode.commands.executeCommand('workbench.action.closeActiveEditor'),
      showHelp: () => void this.showHelp(),
      showStatus: () => void this.showStatus(),
      // Non ripassa da send(): li' verrebbe riletto come comando e non partirebbe
      // mai. Un checkpoint pero' si apre lo stesso — cambia file come un turno
      // qualsiasi, e "/rewind" deve poterlo disfare.
      askEngine: (prompt) => {
        this.checkpoints.begin(prompt);
        this.ensureSession().send(prompt, undefined, prompt);
      },
    };
  }

  /**
   * "/rewind": si sceglie un messaggio di prima e si torna li'. Il codice torna
   * com'era perche' i checkpoint l'hanno messo da parte prima di ogni modifica
   * (vedi chat/checkpoints.ts); la conversazione torna indietro riaprendola a
   * quel punto. Come nell'originale, si puo' scegliere solo il codice, solo la
   * conversazione, o tutti e due.
   */
  private async rewind() {
    const points = this.checkpoints.entries();
    if (!points.length) {
      void vscode.window.showInformationMessage(t(this.prefs.lang, 'rewind.none'));
      return;
    }
    const lang = this.prefs.lang;
    const pick = await vscode.window.showQuickPick(
      points.map((p) => ({
        label: p.prompt.replace(/\s+/g, ' ').slice(0, 70) || '—',
        description:
          p.files > 0 ? t(lang, 'rewind.files', { n: String(p.files) }) : t(lang, 'rewind.noFiles'),
        detail: new Date(p.at).toLocaleTimeString(),
        index: p.index,
      })),
      { title: t(lang, 'rewind.pick'), matchOnDescription: true }
    );
    if (!pick) return;

    // Le due voci sul codice compaiono solo se c'e' davvero qualcosa da rimettere,
    // esattamente come fa l'originale.
    const hasFiles = this.checkpoints.filesAt(pick.index) > 0;
    type Action = 'both' | 'code' | 'talk';
    const choices: { label: string; action: Action }[] = [
      ...(hasFiles
        ? [
            { label: t(lang, 'rewind.both'), action: 'both' as Action },
            { label: t(lang, 'rewind.code'), action: 'code' as Action },
          ]
        : []),
      { label: t(lang, 'rewind.talk'), action: 'talk' as Action },
    ];
    const what = await vscode.window.showQuickPick(choices, { title: t(lang, 'rewind.what') });
    if (!what) return;

    if (what.action === 'both' || what.action === 'code') {
      const { restored, skipped } = await this.checkpoints.restore(pick.index);
      if (skipped.length) {
        void vscode.window.showWarningMessage(
          t(lang, 'rewind.skipped', { n: String(restored), s: String(skipped.length) })
        );
      } else {
        void vscode.window.showInformationMessage(
          t(lang, 'rewind.done', { n: String(restored) })
        );
      }
    }

    if (what.action === 'both' || what.action === 'talk') {
      // La conversazione torna indietro riaprendo la sessione su un ramo nuovo:
      // quella di prima resta intera, come quando si sceglie un punto passato.
      const mine = owned.all().find((s) => s.key === this.key);
      if (mine?.id) await this.open(mine.id, true);
    }
  }

  /** "/memory": il CLAUDE.md del progetto, aperto come file vero. */
  private async openMemory() {
    const root = workspaceRoot();
    if (!root) {
      void vscode.window.showInformationMessage(t(this.prefs.lang, 'cmd.noProject'));
      return;
    }
    const uri = vscode.Uri.joinPath(vscode.Uri.file(root), 'CLAUDE.md');
    try {
      await vscode.workspace.fs.stat(uri);
    } catch {
      // Non c'e' ancora: si crea vuoto, com'e' piu' utile che un errore.
      await vscode.workspace.fs.writeFile(uri, new Uint8Array());
    }
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri));
  }

  /** "/export": la conversazione come testo, negli appunti. */
  private async exportConversation() {
    // Quello che si e' scritto e quello che ha risposto: i pezzi finiti, non i
    // frammenti dello streaming (quelli ridirebbero la stessa frase a pezzi).
    const lines: string[] = [];
    for (const e of this.history) {
      if (e.k === 'user') lines.push(`> ${e.text}`);
      else if (e.k === 'block_final' && e.kind === 'text' && e.text.trim()) lines.push(e.text);
    }
    if (!lines.length) {
      void vscode.window.showInformationMessage(t(this.prefs.lang, 'cmd.nothingToExport'));
      return;
    }
    await vscode.env.clipboard.writeText(lines.join('\n\n'));
    void vscode.window.showInformationMessage(t(this.prefs.lang, 'cmd.exported'));
  }

  /** "/add-dir": un'altra cartella a cui il motore puo' arrivare. */
  private async addDirectory() {
    const picked = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      openLabel: t(this.prefs.lang, 'cmd.addDir'),
    });
    if (!picked?.length) return;
    // Una cartella in piu' la vede il motore che parte dopo: si riparte da qui.
    await vscode.commands.executeCommand('vscode.openFolder', picked[0], {
      forceNewWindow: true,
    });
  }

  /** "/help": l'elenco di cosa si puo' scrivere. */
  private async showHelp() {
    void vscode.env.openExternal(vscode.Uri.parse('https://code.claude.com/docs/en/commands'));
  }

  /** "/status" e "/cost": com'e' messa questa sessione, in breve. */
  private async showStatus() {
    const cli = findClaudeCli(cliSetting());
    const parts = [
      `${t(this.prefs.lang, 'cmd.model')}: ${this.prefs.model || '—'}`,
      `${t(this.prefs.lang, 'cmd.mode')}: ${this.mode}`,
      `CLI: ${cli ? claudeCliVersion(cli) || '?' : '—'}`,
      `${t(this.prefs.lang, 'cmd.cwd')}: ${currentCwd()}`,
    ];
    void vscode.window.showInformationMessage(parts.join('   ·   '));
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
  async open(id: string, fork = false, past?: Wire[]) {
    this.clear();
    this.resume = { id, fork };
    // La barra di contesto lo sa subito, non al prossimo messaggio: il motore
    // parte solo quando scrivi, e fino ad allora il pannello indicherebbe ancora
    // la conversazione di prima. Un fork non ha ancora un id suo: quello arriva
    // dal motore, e la card compare allora.
    if (!fork) owned.adopt(this.key, id, currentCwd());
    // `past` gia' letto da chi chiama (vedi restoreLast): la trascrizione e' un file
    // solo, e riaprirlo due volte per la stessa conversazione non serve a nessuno.
    for (const e of past ?? (await replaySession(id, currentCwd()))) this.emit(e);
    this.titleChanged();
  }

  /**
   * Ricaricando la finestra ("Developer: Reload Window") il processo riparte da zero:
   * la conversazione era solo in memoria e sparisce, anche se la trascrizione e'
   * ancora sul disco. Qui si riapre l'ultima di questo progetto, cosi' si torna al
   * lavoro senza ricominciare.
   *
   * Non riaccende il motore: `open` prepara il `resume`, e la CLI riprende il filo
   * al primo messaggio che scrivi. Se la trascrizione non c'e' piu' (cancellata, o
   * un altro progetto) si resta sulla schermata vuota, che e' il comportamento giusto.
   */
  async restoreLast() {
    if (!this.primary) return;
    const id = this.ctx.workspaceState.get<string>(LAST_SESSION_KEY);
    if (!id || this.history.length) return;
    // Prima si guarda se c'e' davvero qualcosa da rileggere: `replaySession` non
    // protesta per una trascrizione mancante, torna vuota. Riprendendola lo stesso
    // si resterebbe agganciati a un id che non esiste piu', e il primo messaggio
    // andrebbe a vuoto. Meglio scoprirlo adesso.
    let past: Wire[] = [];
    try {
      past = await replaySession(id, currentCwd());
    } catch {
      past = [];
    }
    if (!past.length) {
      void this.ctx.workspaceState.update(LAST_SESSION_KEY, undefined);
      return;
    }
    await this.open(id, false, past);
  }

  private clear() {
    this.closeAllPending('Switching conversation.');
    this.endEngine();
    this.history = [];
    this.busy = false;
    this.checkpoints.clear(); // i punti di prima appartenevano alla conversazione andata
    owned.end(this.key); // la card della barra di contesto non ha piu' niente da mostrare
    if (this.primary) this.tasks?.clear(); // le task erano di quella conversazione
    this.broadcast({ k: 'reset' });
    this.broadcast({ k: 'mode', value: this.mode });
    this.titleChanged();
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
    owned.end(this.key);
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
      beforeTool: (tool, input) => this.checkpoints.before(tool, input),
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
    // Qual e' la conversazione in corso. Serve solo alla scheda principale: e' quella
    // che si riapre da sola alla prossima finestra.
    if (e.k === 'session' && this.primary) {
      void this.ctx.workspaceState.update(LAST_SESSION_KEY, e.id);
    }
    this.remember(e);
    // La barra di contesto ascolta lo stesso filo delle facce della chat: cosi' sa
    // per certo che sessione e' e a che punto sta, senza andarselo a cercare.
    // Tutte le chat, non solo la principale: ogni scheda e' una conversazione vera
    // e i suoi token sono tuoi quanto quelli della prima.
    owned.observe(this.key, e, currentCwd());
    // Quale ha finito. Il suono e il bollino dicono che *qualcosa* e' pronto; con
    // tre schede aperte, quale sia lo scopri aprendole a una a una. Il segnalino si
    // accende su questa conversazione — sulla sua scheda e sulla sua carta — e resta
    // acceso finche' non la guardi. Se la stavi guardando non si accende affatto:
    // l'hai vista finire.
    //
    // Prima dell'avviso, non dopo: il numero sul bollino dell'icona e' quante hanno
    // finito, e questa deve essere gia' contata.
    if (e.k === 'turn_end') {
      owned.markDone(this.key, this.inFront());
      this.titleChanged();
    }
    // Le due volte in cui il lavoro si ferma e tocca a te: turno finito, o un
    // permesso da dare.
    if (e.k === 'turn_end') this.alert('done');
    if (e.k === 'ask') this.alert('ask');
    // Il nome della scheda e' la prima cosa che hai scritto: si sa da qui.
    if (e.k === 'user' || e.k === 'session') this.titleChanged();
    // L'elenco delle task del pannello. Solo la chat principale lo alimenta: con tre
    // schede aperte, un pannello solo non puo' raccontarne tre insieme, e quella
    // davanti e' quella che stai guardando.
    if (this.tasks && this.primary) {
      // Un messaggio nuovo azzera: l'elenco appartiene al prompt che lo ha prodotto.
      if (e.k === 'user') this.tasks.clear();
      if (e.k === 'busy') this.tasks.setBusy(e.value);
      if (e.k === 'tool_start' && e.name === 'TodoWrite') {
        const todos = (e.input as { todos?: unknown })?.todos;
        if (Array.isArray(todos)) this.tasks.set(todos as never);
      }
    }
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
