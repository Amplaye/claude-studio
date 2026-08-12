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
import { fmtAgo, fmtClock, fmtCost, fmtLimit, fmtReset, fmtTokens } from './format';
import {
  activeClaudeTab,
  claudeTabs,
  matchTabToSession,
  normLabel,
  revealTab,
  studioTabActive,
  type FocusHow,
} from './focus';
import { owned } from './owned';
import { projectsDirFor, sessionsDir, transcriptPath } from './paths';
import type { CtxCard, CtxData } from './protocol';
import { liveSessions, readSessionNames, writeSessionName } from './sessions';
import { scanTranscript } from './transcript';
import { currentUsage, loadSharedUsage, refreshUsage, usageWaitText } from './usage';

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

  /** Il pannello si iscrive e riceve subito l'ultima fotografia. */
  subscribe(fn: (d: CtxData) => void): vscode.Disposable {
    this.sinks.add(fn);
    if (this.last) fn(this.last);
    else this.tickSoon();
    return { dispose: () => this.sinks.delete(fn) };
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
    const mine = owned.current();
    const rows: { card: CtxCard; mtimeMs: number; costUsd: number }[] = [];

    // La nostra: niente da indovinare, la conversazione l'ha aperta questa estensione.
    if (mine?.id) {
      const scan = scanTranscript(transcriptPath(mine.cwd || cwd, mine.id));
      // I numeri del motore arrivano prima di quelli del disco: si preferiscono.
      const tokens = mine.tokens || scan.usedTokens;
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
          cost: fmtCost(cost),
          lastClock: fmtClock(mine.updatedAt),
          lastAgo: fmtAgo(mine.updatedAt, now),
          busy: mine.busy,
          recent: now - mine.updatedAt < RECENT_MS,
          focused: false,
        },
      });
    }

    for (const s of official) {
      if (mine?.id === s.id) continue; // stessa conversazione: la nostra sa di piu'
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
          cost: fmtCost(scan.costUsd),
          lastClock: fmtClock(s.mtimeMs),
          lastAgo: fmtAgo(s.mtimeMs, now),
          busy: idle < BUSY_MS,
          recent: idle < RECENT_MS,
          focused: false,
        },
      });
    }

    const focusId = this.resolveFocus(official, names, mine?.id);
    for (const r of rows) r.card.focused = r.card.id === focusId;
    // La sessione in cui sei sta sempre in cima, poi si va per recenza.
    rows.sort((a, b) => Number(b.card.focused) - Number(a.card.focused) || b.mtimeMs - a.mtimeMs);

    const g = gitInfo(cwd);
    const usage = currentUsage();
    refreshUsage(() => this.tick()); // asincrono: quando torna, si ridisegna

    return {
      project: cwd.split(/[\\/]/).pop() || cwd,
      limit: fmtLimit(limit),
      focusHow: this.how,
      usage: usage ? { session: usage.session, week: usage.week } : null,
      usageWait: usageWaitText(now),
      sessionReset: fmtReset(usage?.sessionResetAt, now),
      weekReset: fmtReset(usage?.weekResetAt, now),
      cards: rows.map((r) => r.card),
      branch: g?.branch ?? '',
      dirty: g?.dirty ?? false,
      totalCost: fmtCost(rows.reduce((sum, r) => sum + r.costUsd, 0)),
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
    mineId?: string
  ): string | null {
    if (mineId && studioTabActive()) return this.settle(mineId, 'studio');

    const tabs = claudeTabs();
    const m = matchTabToSession(activeClaudeTab(tabs), official, names, tabs);
    if (m) return this.settle(m.id, m.how);

    // Nessuna tab dell'ufficiale in primo piano ma la chat e' aperta di lato:
    // e' comunque piu' informato che tirare a indovinare per recenza.
    if (mineId && owned.looking()) return this.settle(mineId, 'studio');

    // Stai guardando un file: si tiene l'ultima nota, se e' ancora viva.
    const alive = (id: string) => id === mineId || official.some((s) => s.id === id);
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
    this.tickSoon();
  }

  /** Clic su una card: ci si va davvero. */
  async focus(id: string) {
    const mine = owned.current();
    if (mine?.id === id) {
      // La nostra: si apre la faccia che gia' c'e', senza aprirne una nuova.
      await vscode.commands.executeCommand(
        owned.looking() === 'panel' ? 'claudeStudio.openTab' : 'claudeStudio.openSidebar'
      );
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
      void vscode.window.showInformationMessage(
        `Cannot find the tab "${s.tabName || id.slice(0, 8)}" in this VSCode window.`
      );
      return;
    }
    await revealTab(target);
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
        `(${c.tokens} · ${c.cost}) — ${c.name.slice(0, 50)}${c.own ? ' _· Studio_' : ''}` +
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
      `- Spent in total: **${d.totalCost}**\n` +
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
