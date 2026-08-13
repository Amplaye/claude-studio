// Il cuore della barra di contesto: raccoglie, disegna la barra di stato e passa i
// dati al pannello. Uno solo per finestra di VSCode.
//
// Due regole ereditate dalla 0.0.6, ed e' quello che le permetteva un tick da un
// secondo e mezzo senza far girare la ventola:
//  - i dati si ricalcolano solo se qualcosa e' cambiato sul disco (transcript letti
//    in coda, git in cache);
//  - al pannello si mandano dati, non HTML: le card si aggiornano, non si rifanno.
import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as vscode from 'vscode';
import { workspaceRoot } from '../chat/editor';
import { fmtAgo, fmtClock, fmtLimit, fmtReset, fmtTokens } from './format';
import {
  activeClaudeTab,
  claudeTabs,
  matchTabToSession,
  normLabel,
  revealTab,
  studioTabActive,
  type FocusHow,
} from './focus';
import { ChatPanel } from '../chat/panel';
import { chats } from '../chat/controller';
import { owned } from './owned';
import { projectsDirFor, sessionsDir, transcriptPath } from './paths';
import type { CtxCard, CtxData } from './protocol';
import { forgetSession, liveSessions, readSessionNames, writeSessionName } from './sessions';
import { scanTranscript } from './transcript';
import {
  currentUsage,
  loadSharedUsage,
  refreshUsage,
  usageAgeMs,
  usageIsStale,
  usageWaitText,
} from './usage';

/** Ha scritto entro venti secondi: sta lavorando adesso. */
const BUSY_MS = 20000;
const RECENT_MS = 120000;

export class ContextMonitor {
  private status?: vscode.StatusBarItem;
  private timer?: NodeJS.Timeout;
  private watchers: fs.FSWatcher[] = [];
  private sinks = new Set<(d: CtxData) => void>();
  private disposables: vscode.Disposable[] = [];
  private queued = false;
  private lastText = '';
  private last?: CtxData;

  /** Sticky: se sposti lo sguardo su un file, l'ultima sessione nota resta quella. */
  private focusedId: string | null = null;
  private how: FocusHow = 'recency';
  /** L'ultima conversazione nostra vista: serve ad accorgersi che e' cambiata. */
  private mineId: string | null = null;

  start(ctx: vscode.ExtensionContext) {
    this.status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.status.name = 'Claude Studio';
    this.status.command = 'claudeStudio.context.show';
    ctx.subscriptions.push(this.status);

    // Il cambio di tab e' un evento, non qualcosa da controllare a ripetizione.
    const soon = () => this.tickSoon();
    try {
      this.disposables.push(
        vscode.window.tabGroups.onDidChangeTabs(soon),
        vscode.window.tabGroups.onDidChangeTabGroups(soon)
      );
    } catch {
      /* API delle tab assente: si resta col solo timer */
    }
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(soon),
      vscode.window.onDidChangeWindowState((s) => s.focused && soon()),
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.watch();
        soon();
      }),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('claudeStudio')) {
          this.restartTimer();
          soon();
        }
      }),
      // La chat e' nello stesso processo: quando succede qualcosa lo sappiamo
      // subito, senza aspettare che il transcript arrivi sul disco.
      owned.onChange(soon)
    );

    this.watch();
    loadSharedUsage(); // finestra appena aperta: mostra subito l'ultimo valore buono
    this.restartTimer();
    this.tick();
  }

  /** Quando il prossimo giro deve chiedere i consumi anche se il TTL non e' scaduto. */
  private forceUsage = false;
  /** Le conversazioni gia' viste: serve a riconoscere quella appena nata. */
  private seenIds = new Set<string>();
  /** C'era qualcosa al lavoro nel giro precedente: serve a vedere quando si ferma. */
  private wasBusy = false;

  /** Il pannello si iscrive e riceve subito l'ultima fotografia. */
  subscribe(fn: (d: CtxData) => void): vscode.Disposable {
    this.sinks.add(fn);
    if (this.last) fn(this.last);
    // La fotografia in cache si vede all'istante, ma puo' essere di ieri: la cache
    // dei consumi sopravvive ai riavvii. Aprire il pannello chiede comunque il numero
    // vero, altrimenti il primo sguardo e' su percentuali vecchie che sembrano fresche.
    this.refreshNow();
    return { dispose: () => this.sinks.delete(fn) };
  }

  /**
   * Ridisegna scavalcando il TTL dei consumi. Serve dove aspettare il minuto pieno
   * vuol dire guardare numeri vecchi: pannello aperto, pannello tornato visibile,
   * sessione nuova. Il cooldown dopo un 429 resta valido: quello non si scavalca.
   */
  refreshNow() {
    this.forceUsage = true;
    this.tickSoon();
  }

  dispose() {
    if (this.timer) clearInterval(this.timer);
    for (const w of this.watchers) {
      try {
        w.close();
      } catch {
        /* gia' chiuso */
      }
    }
    for (const d of this.disposables) d.dispose();
    this.watchers = [];
    this.disposables = [];
  }

  // ---- giro di disegno ---------------------------------------------------

  tick() {
    try {
      const d = this.collect();
      this.last = d;
      this.paintStatus(d);
      for (const fn of this.sinks) fn(d);
    } catch {
      /* un giro saltato non e' un motivo per spegnere tutto */
    }
  }

  /** Dieci eventi ravvicinati fanno un solo ridisegno. */
  tickSoon() {
    if (this.queued) return;
    this.queued = true;
    setTimeout(() => {
      this.queued = false;
      this.tick();
    }, 40);
  }

  private restartTimer() {
    if (this.timer) clearInterval(this.timer);
    const secs = cfg<number>('refreshSeconds', 1.5);
    this.timer = setInterval(() => this.tick(), Math.max(0.5, secs) * 1000);
  }

  /** Le sessioni che nascono e i transcript che crescono si vedono subito. */
  private watch() {
    for (const w of this.watchers) {
      try {
        w.close();
      } catch {
        /* gia' chiuso */
      }
    }
    this.watchers = [];
    for (const dir of [sessionsDir(), projectsDirFor(workspaceRoot())]) {
      try {
        this.watchers.push(fs.watch(dir, { persistent: false }, () => this.tickSoon()));
      } catch {
        /* cartella non ancora esistente: ci pensa il timer */
      }
    }
  }

  // ---- raccolta ----------------------------------------------------------

  private collect(): CtxData {
    const cwd = workspaceRoot();
    const limit = Math.max(1, cfg<number>('contextLimit', 1000000));
    const names = readSessionNames();
    const now = Date.now();

    const official = liveSessions(cwd);
    // Tutte le nostre, non solo quella davanti: ogni scheda di Studio e' una
    // conversazione con i suoi token, e vederne una sola su tre era il motivo per
    // cui il bollino "sei qui" non si spostava mai.
    const mineAll = owned.all().filter((s) => s.id);
    const mineIds = new Set(mineAll.map((s) => s.id));
    const rows: { card: CtxCard; mtimeMs: number; costUsd: number }[] = [];

    // Le nostre: niente da indovinare, le conversazioni le ha aperte questa estensione.
    for (const mine of mineAll) {
      const scan = scanTranscript(transcriptPath(mine.cwd || cwd, mine.id));
      // I numeri del motore arrivano prima di quelli del disco: si preferiscono,
      // ma solo se sono plausibili. Il contesto non puo' superare la finestra: se
      // succede, quel numero e' una somma di piu' chiamate e non una misura del
      // contesto, e allora vince il transcript, che si legge per singola chiamata.
      const fresh = mine.tokens;
      const tokens = fresh && fresh <= limit ? fresh : scan.usedTokens || fresh || 0;
      const cost = mine.costUsd || scan.costUsd;
      rows.push({
        mtimeMs: mine.updatedAt,
        costUsd: cost,
        card: {
          id: mine.id,
          shortId: mine.id.slice(0, 8),
          name: names[mine.id] || mine.title || mine.id.slice(0, 8),
          own: true,
          tabName: 'Studio',
          preview: mine.title,
          pct: tokens ? Math.round((tokens * 100) / limit) : null,
          tokens: fmtTokens(tokens),
          costUsd: cost,
          lastClock: fmtClock(mine.updatedAt),
          lastAgo: fmtAgo(mine.updatedAt, now),
          busy: mine.busy,
          // Ha finito mentre guardavi altrove. Solo le nostre lo sanno dire: di una
          // scheda dell'estensione ufficiale non sappiamo nemmeno se qualcuno la
          // stesse guardando.
          done: mine.done,
          recent: now - mine.updatedAt < RECENT_MS,
          focused: false,
        },
      });
    }

    for (const s of official) {
      if (mineIds.has(s.id)) continue; // stessa conversazione: la nostra sa di piu'
      const scan = scanTranscript(s.file);
      const idle = now - s.mtimeMs;
      rows.push({
        mtimeMs: s.mtimeMs,
        costUsd: scan.costUsd,
        card: {
          id: s.id,
          shortId: s.id.slice(0, 8),
          name: names[s.id] || s.tabName || scan.prompt || s.id.slice(0, 8),
          own: false,
          tabName: s.tabName,
          preview: scan.prompt,
          pct: scan.usedTokens ? Math.round((scan.usedTokens * 100) / limit) : null,
          tokens: fmtTokens(scan.usedTokens),
          costUsd: scan.costUsd,
          lastClock: fmtClock(s.mtimeMs),
          lastAgo: fmtAgo(s.mtimeMs, now),
          busy: idle < BUSY_MS,
          done: false,
          recent: idle < RECENT_MS,
          focused: false,
        },
      });
    }

    const focusId = this.resolveFocus(official, names, owned.current()?.id, mineIds);
    for (const r of rows) r.card.focused = r.card.id === focusId;
    // La sessione in cui sei sta sempre in cima, poi si va per recenza.
    rows.sort((a, b) => Number(b.card.focused) - Number(a.card.focused) || b.mtimeMs - a.mtimeMs);

    // Una conversazione che prima non c'era e' il momento in cui i consumi contano di
    // piu': si parte sapendo quanto resta. Legare la forzatura alla nascita di una
    // sessione, e non a ogni evento della chat, tiene le chiamate rare — un turno che
    // finisce ridisegna, ma non interroga l'API.
    const ids = new Set(rows.map((r) => r.card.id));
    for (const id of ids) {
      if (!this.seenIds.has(id)) {
        this.forceUsage = true;
        break;
      }
    }
    this.seenIds = ids;

    // I consumi si muovono solo mentre un turno gira: chiederli a orologio voleva dire
    // numeri vecchi proprio mentre stai spendendo, e chiamate a vuoto mentre non fai
    // niente. Finche' qualcosa lavora si chiede a ogni giro — il pavimento in usage.ts
    // tiene comunque le chiamate a una ogni dieci secondi — e una volta ancora appena
    // si ferma, che e' quando il numero smette di salire.
    const anyBusy = rows.some((r) => r.card.busy);
    if (anyBusy || anyBusy !== this.wasBusy) this.forceUsage = true;
    this.wasBusy = anyBusy;

    const g = gitInfo(cwd);
    const usage = currentUsage();
    const force = this.forceUsage;
    this.forceUsage = false;
    refreshUsage(() => this.tick(), force); // asincrono: quando torna, si ridisegna

    return {
      project: cwd.split(/[\\/]/).pop() || cwd,
      limit: fmtLimit(limit),
      focusHow: this.how,
      usage: usage ? { session: usage.session, week: usage.week } : null,
      usageWait: usageWaitText(now),
      usageAgeSec: (() => {
        const ms = usageAgeMs(now);
        return ms === null ? null : Math.round(ms / 1000);
      })(),
      usageStale: usageIsStale(now),
      sessionReset: fmtReset(usage?.sessionResetAt, now),
      weekReset: fmtReset(usage?.weekResetAt, now),
      cards: rows.map((r) => r.card),
      branch: g?.branch ?? '',
      dirty: g?.dirty ?? false,
      totalCostUsd: rows.reduce((sum, r) => sum + r.costUsd, 0),
    };
  }

  /**
   * L'ordine dei tentativi va dal certo all'incerto, e si ferma al primo che
   * risponde. La nostra scheda davanti batte tutto: e' l'unico caso in cui sappiamo
   * per davvero cosa stai guardando.
   */
  private resolveFocus(
    official: ReturnType<typeof liveSessions>,
    names: Record<string, string>,
    mineId: string | undefined,
    mineIds: Set<string>
  ): string | null {
    // Hai cambiato conversazione nella chat: l'appunto di prima parla di una
    // sessione in cui non sei piu'. Si sposta subito, poi la cascata qui sotto
    // resta libera di correggere se stai davvero guardando un'altra tab.
    if (mineId && mineId !== this.mineId) {
      this.mineId = mineId;
      this.settle(mineId, 'studio');
    } else if (!mineId) {
      this.mineId = null;
    }

    if (mineId && studioTabActive()) return this.settle(mineId, 'studio');

    const tabs = claudeTabs();
    const m = matchTabToSession(activeClaudeTab(tabs), official, names, tabs);
    if (m) return this.settle(m.id, m.how);

    // Nessuna tab dell'ufficiale in primo piano ma la chat e' aperta di lato:
    // e' comunque piu' informato che tirare a indovinare per recenza.
    if (mineId && owned.looking()) return this.settle(mineId, 'studio');

    // Stai guardando un file: si tiene l'ultima nota, se e' ancora viva.
    const alive = (id: string) => mineIds.has(id) || official.some((s) => s.id === id);
    if (this.focusedId && alive(this.focusedId)) return this.focusedId;

    this.how = 'recency';
    this.focusedId = mineId ?? (official.length ? official[0].id : null);
    return this.focusedId;
  }

  private settle(id: string, how: FocusHow): string {
    this.focusedId = id;
    this.how = how;
    return id;
  }

  // ---- barra di stato ----------------------------------------------------

  private paintStatus(d: CtxData) {
    const bar = this.status;
    if (!bar) return;
    if (!cfg<boolean>('statusBar', true)) {
      bar.hide();
      return;
    }
    const f = d.cards.find((c) => c.focused) ?? null;
    const pct = f?.pct ?? null;
    const u = d.usage;
    const use = u
      ? `$(studio-gauge) ${asPct(u.session)}/${asPct(u.week)}`
      : '$(studio-gauge) —';
    const ctx = pct === null ? '' : ` $(${levelIcon(pct)}) ctx ${pct}%`;
    const more = d.cards.length > 1 ? ` $(studio-layers) ${d.cards.length}` : '';
    const text = `$(studio-chat) ${use}${ctx}${more}`;

    // Riassegnare .text a ogni tick fa ridisegnare la barra: si scrive solo se cambia.
    if (text !== this.lastText) {
      bar.text = text;
      this.lastText = text;
    }
    bar.tooltip = tooltip(d, f);
    bar.backgroundColor =
      pct !== null && pct >= 80
        ? new vscode.ThemeColor('statusBarItem.errorBackground')
        : pct !== null && pct >= 60
          ? new vscode.ThemeColor('statusBarItem.warningBackground')
          : undefined;
    bar.show();
  }

  // ---- comandi -----------------------------------------------------------

  async rename(id: string) {
    if (!id) return;
    const val = await vscode.window.showInputBox({
      prompt: 'Card name (empty = back to the starting name)',
      value: readSessionNames()[id] || '',
      placeHolder: 'e.g. Picnic — fixing the reminders',
    });
    if (val === undefined) return; // annullato
    writeSessionName(id, val.trim());
    // Se la conversazione e' nostra, la scheda porta lo stesso nome: rinominare la
    // card rinomina la scheda, che e' l'unico posto dove il nome si vede sempre.
    const host = owned.hosting(id);
    if (host) ChatPanel.byKey(host.key)?.refreshName();
    this.tickSoon();
  }

  /** Clic su una card: ci si va davvero. */
  async focus(id: string) {
    // Una delle nostre: si va esattamente alla scheda che la tiene, non "a Studio".
    // Con piu' schede aperte "apri Studio" ti portava alla prima, cioe' quasi mai a
    // quella su cui avevi appena cliccato; e guardando la sidebar ti apriva la chat
    // nella sidebar, lasciando la scheda dov'era.
    const host = owned.hosting(id);
    if (host) {
      if (!ChatPanel.revealKey(host.key)) {
        await vscode.commands.executeCommand(
          ChatPanel.exists() ? 'claudeStudio.openTab' : 'claudeStudio.openSidebar'
        );
      }
      this.tickSoon();
      return;
    }
    const s = liveSessions(workspaceRoot()).find((x) => x.id === id);
    if (!s) return;
    const target = claudeTabs().find(
      (t) =>
        (s.tabName && normLabel(t.label) === normLabel(s.tabName)) ||
        normLabel(t.label).includes(id.slice(0, 8))
    );
    if (!target) {
      // Nessuna tab dell'ufficiale a cui portarti: la conversazione pero' esiste,
      // e' sul disco, e possiamo aprirla noi. Un clic che finiva in un avviso ora
      // finisce dentro la sessione, che e' quello che volevi facendolo.
      await vscode.commands.executeCommand('claudeStudio.openConversation', id);
      this.tickSoon();
      return;
    }
    await revealTab(target);
    this.tickSoon();
  }

  /**
   * La × sulla card: questa conversazione hai finito di guardarla.
   *
   * Fino a ieri una card se ne andava solo quando la sua conversazione moriva per
   * conto suo, e non c'era modo di dirlo: chiusa la scheda principale la card restava
   * (la conversazione era ancora in memoria), e di una sessione della CLI lasciata a
   * meta' non ci si liberava affatto. Chiudere e' un'intenzione, e l'intenzione ha
   * bisogno di un bottone.
   *
   * Cosa vuol dire "chiudere" dipende da dove sta la conversazione:
   *  - in una scheda aperta col "+": si chiude la scheda, e il controller muore con lei;
   *  - nella chat della sidebar o nella scheda principale: la scheda non si butta via
   *    (e' la tua chat), quindi si azzera la conversazione — che e' esattamente cio'
   *    che fa "nuova conversazione", card compresa;
   *  - una sessione della CLI: si cancella il suo annuncio in ~/.claude/sessions.
   */
  async close(id: string) {
    if (!id) return;
    const host = owned.hosting(id);
    if (host) {
      // La scheda secondaria se ne va tutta intera: dispose() toglie la card, spegne
      // il motore e cancella l'annuncio, in quest'ordine.
      if (!ChatPanel.closeKey(host.key)) {
        const chat = chats.get(host.key);
        // newSession, non owned.end: togliere la card e lasciare la conversazione
        // accesa la farebbe ricomparire al primo evento successivo — e nel frattempo
        // avresti una chat piena davanti e un pannello che dice che non c'e' niente.
        if (chat) chat.newSession();
        else owned.end(host.key);
      }
    } else {
      forgetSession(id);
    }
    this.tickSoon();
  }

  /** Cosa vede davvero l'estensione: serve quando il focus sbaglia bersaglio. */
  async diagnose() {
    const cwd = workspaceRoot();
    const tabs = claudeTabs();
    const official = liveSessions(cwd);
    const mine = owned.current();
    const lines = [
      `Project: ${cwd}`,
      `Transcripts folder: ${projectsDirFor(cwd)}`,
      ``,
      `Studio chat: ${mine ? `${mine.id || '(starting up)'} — "${mine.title}"` : 'none'}`,
      `  in sight: ${owned.looking() ?? 'no'}${studioTabActive() ? ' (tab in front)' : ''}`,
      ``,
      `Official extension tabs in this window: ${tabs.length}`,
      ...tabs.map(
        (t) => `  [${t.viewColumn}.${t.index}]${t.isActive ? ' <- ACTIVE' : '        '} "${t.label}"`
      ),
      ``,
      `Live official sessions in the project: ${official.length}`,
      ...official.map((s) => `  pid ${s.pid}  "${s.tabName}"  id ${s.id.slice(0, 8)}`),
      ``,
      `Current hook: ${this.focusedId?.slice(0, 8) ?? '—'} (via ${this.how})`,
    ];
    const doc = await vscode.workspace.openTextDocument({
      content: lines.join('\n'),
      language: 'text',
    });
    await vscode.window.showTextDocument(doc, { preview: true });
  }
}

// ---- pezzi di contorno ---------------------------------------------------

function cfg<T>(key: string, fallback: T): T {
  return vscode.workspace.getConfiguration('claudeStudio').get<T>(key, fallback);
}

function asPct(v: number | null): string {
  return v == null ? '—' : Math.round(v) + '%';
}

function levelIcon(pct: number | null): string {
  if (pct === null) return 'studio-pulse';
  if (pct >= 80) return 'studio-alert';
  if (pct >= 60) return 'studio-warn';
  return 'studio-pulse';
}

function tooltip(d: CtxData, f: CtxCard | null): vscode.MarkdownString {
  const rows = d.cards
    .map(
      (c) =>
        `- ${c.focused ? '**▶**' : '&nbsp;&nbsp;&nbsp;'} **${c.pct === null ? '—' : c.pct + '%'}** ` +
        `(${c.tokens}) — ${c.name.slice(0, 50)}${c.own ? ' _· Studio_' : ''}` +
        `${c.busy ? ' _· active now_' : ''}`
    )
    .join('\n');
  const u = d.usage;
  return new vscode.MarkdownString(
    (f ? `### ▶ You're in: ${f.name}\n\n` : '') +
      `**Sessions** — ${d.cards.length}\n\n` +
      (rows || '_no session open_') +
      '\n' +
      (u
        ? `\n**Account**\n- Session (5h): **${asPct(u.session)}**${d.sessionReset ? ` _(reset ${d.sessionReset})_` : ''}\n` +
          `- Week (7d): **${asPct(u.week)}**${d.weekReset ? ` _(reset ${d.weekReset})_` : ''}\n`
        : `\n- Account usage: _(${d.usageWait})_\n`) +
      `\n- Project: **${d.project}**\n` +
      (d.branch ? `- Branch: **${d.branch}${d.dirty ? ' (changes)' : ''}**\n` : '') +
      `\n\nClick to open the context panel.`
  );
}

// `git status --porcelain` su una repo grossa costa: al massimo una volta ogni
// cinque secondi, altrimenti il tick veloce lancerebbe due git al secondo.
let gitCache: { ts: number; cwd: string; val: { branch: string; dirty: boolean } | null } = {
  ts: 0,
  cwd: '',
  val: null,
};

function gitInfo(cwd: string) {
  const now = Date.now();
  if (gitCache.cwd === cwd && now - gitCache.ts < 5000) return gitCache.val;
  let val: { branch: string; dirty: boolean } | null = null;
  try {
    // execFile senza shell: gli argomenti sono costanti e non c'e' niente da citare.
    const git = (args: string[]) =>
      cp.execFileSync('git', args, { cwd, timeout: 1500, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    val = {
      branch: git(['branch', '--show-current']).trim(),
      dirty: git(['status', '--porcelain']).trim().length > 0,
    };
  } catch {
    val = null; // non e' una repo, o git non c'e': si tace
  }
  gitCache = { ts: now, cwd, val };
  return val;
}
