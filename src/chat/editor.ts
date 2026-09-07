// The piece that watches the editor: what you selected, which files are around, and
// how to open a file or a native diff. It all sits here so the rest of the chat
// doesn't have to know anything about VSCode.
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { PickItem } from '../engine/protocol';

/** A path can arrive relative or already absolute: here it always becomes absolute. */
function toUri(p: string): vscode.Uri {
  return vscode.Uri.file(/^([a-zA-Z]:[\\/]|\/)/.test(p) ? p : path.join(workspaceRoot(), p));
}

export interface Selected {
  /** path relative to the working folder */
  rel: string;
  /** "12-38" or "12" */
  lines: string;
  text: string;
}

export function workspaceRoot(): string {
  const f = vscode.workspace.workspaceFolders;
  return f && f.length ? f[0].uri.fsPath : process.cwd();
}

/** What is selected right now in the active editor. No selection = nothing. */
export function currentSelection(): Selected | undefined {
  const ed = vscode.window.activeTextEditor;
  if (!ed || ed.selection.isEmpty) return undefined;
  const text = ed.document.getText(ed.selection);
  if (!text.trim()) return undefined;
  const a = ed.selection.start.line + 1;
  const b = ed.selection.end.line + 1;
  return {
    rel: vscode.workspace.asRelativePath(ed.document.uri, false),
    lines: a === b ? String(a) : `${a}-${b}`,
    text,
  };
}

// The file list is re-read rarely: searching on every keystroke while you type
// "@..." means making the disk grind for nothing.
let cache: { at: number; files: string[] } = { at: 0, files: [] };
const CACHE_MS = 30000;

/**
 * Quello che l'editor sa e un elenco di percorsi no: dove sta un nome.
 *
 * "@" cercava solo fra i percorsi, quindi allegare la funzione che si sta guardando
 * voleva dire ricordarsi in quale file vive — e se lo si ricordasse non si starebbe
 * cercando. I simboli li ha gia' indicizzati VSCode: sono gli stessi di Ctrl+T, li
 * calcola il language server del progetto, e chiederli non costa niente.
 *
 * Quello che entra nel messaggio resta il percorso — e' l'unica cosa che "@" sa
 * espandere, e il file intero e' quello che serve leggere. Il simbolo e' la chiave
 * di ricerca, non il carico: nella riga si vede il nome e la riga esatta, cosi' sai
 * quale dei quattro `parse` stai allegando.
 */
export async function findSymbols(q: string, limit = 12): Promise<PickItem[]> {
  const needle = q.trim();
  // Sotto le due lettere il provider risponde con mezzo progetto: e' rumore, non aiuto.
  if (needle.length < 2) return [];
  let found: vscode.SymbolInformation[] | undefined;
  try {
    found = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
      'vscode.executeWorkspaceSymbolProvider',
      needle
    );
  } catch {
    return []; // nessun language server per questo progetto: "@" resta quello di prima
  }
  if (!Array.isArray(found)) return [];
  const out: PickItem[] = [];
  for (const s of found) {
    if (out.length >= limit) break;
    const uri = s.location?.uri;
    if (!uri || uri.scheme !== 'file') continue;
    out.push({
      path: vscode.workspace.asRelativePath(uri, false),
      symbol: s.containerName ? `${s.containerName}.${s.name}` : s.name,
      kind: SYMBOL_KIND[s.kind] || '',
      line: (s.location.range?.start.line ?? 0) + 1,
    });
  }
  return out;
}

/** I nomi dei tipi di simbolo, che l'enum di VSCode tiene solo come numeri. */
const SYMBOL_KIND: Record<number, string> = {
  [vscode.SymbolKind.File]: 'file',
  [vscode.SymbolKind.Module]: 'module',
  [vscode.SymbolKind.Namespace]: 'namespace',
  [vscode.SymbolKind.Class]: 'class',
  [vscode.SymbolKind.Method]: 'method',
  [vscode.SymbolKind.Property]: 'property',
  [vscode.SymbolKind.Field]: 'field',
  [vscode.SymbolKind.Constructor]: 'constructor',
  [vscode.SymbolKind.Enum]: 'enum',
  [vscode.SymbolKind.Interface]: 'interface',
  [vscode.SymbolKind.Function]: 'function',
  [vscode.SymbolKind.Variable]: 'variable',
  [vscode.SymbolKind.Constant]: 'const',
  [vscode.SymbolKind.Struct]: 'struct',
  [vscode.SymbolKind.TypeParameter]: 'type',
};

export async function findFiles(q: string, limit = 40): Promise<string[]> {
  const now = Date.now();
  if (now - cache.at > CACHE_MS) {
    const found = await vscode.workspace.findFiles(
      '**/*',
      '**/{node_modules,.git,dist,out,build,.next,coverage}/**',
      6000
    );
    cache = { at: now, files: found.map((u) => vscode.workspace.asRelativePath(u, false)) };
  }
  const needle = q.trim().toLowerCase();
  if (!needle) return cache.files.slice(0, limit);
  // Whatever has the searched-for bit in the file name comes first: that's almost
  // always the one you're looking for.
  const hits = cache.files.filter((f) => f.toLowerCase().includes(needle));
  hits.sort((a, b) => {
    const an = a.split('/').pop()!.toLowerCase().includes(needle) ? 0 : 1;
    const bn = b.split('/').pop()!.toLowerCase().includes(needle) ? 0 : 1;
    return an - bn || a.length - b.length;
  });
  return hits.slice(0, limit);
}

export async function openFile(rel: string, line?: number) {
  const abs = toUri(rel);
  try {
    const doc = await vscode.workspace.openTextDocument(abs);
    const ed = await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.One });
    if (typeof line === 'number' && line > 0) {
      const pos = new vscode.Position(Math.max(0, line - 1), 0);
      ed.selection = new vscode.Selection(pos, pos);
      ed.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
    }
  } catch (e) {
    void vscode.window.showErrorMessage(`I can't open ${rel}: ${e instanceof Error ? e.message : e}`);
  }
}

// ---- l'editor che segue Claude ---------------------------------------------
//
// Guardare una chat che racconta modifiche a un codice che non vedi e' il modo piu'
// scomodo di stare dentro un IDE: il codice vero e' li' di fianco, fermo. Con questo
// acceso ogni file toccato si apre, scorre alle righe cambiate e le illumina per un
// paio di secondi.
//
// `preserveFocus` e' la riga che rende tutto questo sopportabile: la scheda si apre,
// scorre e si accende senza mai portarsi via il cursore da dove stai scrivendo.
// Senza, sarebbe l'editor che ti strappa la tastiera di mano dieci volte per turno.

/** Il colore resta uno solo per tutta la vita dell'estensione: crearne uno per ogni
    modifica lascia in giro decorazioni che non si spengono piu'. */
let touchDeco: vscode.TextEditorDecorationType | undefined;
function deco(): vscode.TextEditorDecorationType {
  if (!touchDeco) {
    touchDeco = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: new vscode.ThemeColor('diffEditor.insertedLineBackground'),
      overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.addedForeground'),
      overviewRulerLane: vscode.OverviewRulerLane.Left,
    });
  }
  return touchDeco;
}

/** Ogni file ha il suo timer: due modifiche in fila non devono spegnersi a vicenda. */
const fading = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * In quale colonna aprire. Mai "quella attiva": se la chat e' aperta come scheda a
 * schermo intero, quella attiva e' la chat, e il file le prenderebbe il posto. Si
 * usa la colonna di un editor di testo gia' aperto, e solo se non ce n'e' nessuno si
 * apre di fianco.
 */
function column(): vscode.ViewColumn {
  const ed = vscode.window.visibleTextEditors.find((e) => e.viewColumn != null);
  return ed?.viewColumn ?? vscode.ViewColumn.Beside;
}

/**
 * Mostra il file che Claude ha appena toccato e accende le righe.
 *
 * `needle` e' il testo appena scritto: si cerca nel documento perche' gli strumenti
 * di modifica non dicono a che riga hanno scritto — dicono cosa. Se non si trova
 * (riscritture grandi, indentazioni normalizzate) il file si apre lo stesso, in cima:
 * vedere il file giusto senza l'evidenziazione e' meglio che non vedere niente.
 */
export async function follow(rel: string, needle?: string) {
  try {
    const doc = await vscode.workspace.openTextDocument(toUri(rel));
    const ed = await vscode.window.showTextDocument(doc, {
      preview: true,
      preserveFocus: true,
      viewColumn: column(),
    });
    const text = doc.getText();
    const at = needle && needle.length > 2 ? text.indexOf(needle) : -1;
    const range =
      at >= 0
        ? new vscode.Range(doc.positionAt(at), doc.positionAt(at + needle!.length))
        : new vscode.Range(0, 0, 0, 0);
    ed.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    if (at < 0) return; // niente da illuminare: almeno il file giusto e' davanti
    ed.setDecorations(deco(), [range]);
    const key = doc.uri.toString();
    clearTimeout(fading.get(key));
    fading.set(
      key,
      setTimeout(() => {
        fading.delete(key);
        // L'editor puo' essere stato chiuso nel frattempo: si spegne quello che c'e'.
        for (const e of vscode.window.visibleTextEditors) {
          if (e.document.uri.toString() === key) e.setDecorations(deco(), []);
        }
      }, 2200)
    );
  } catch {
    /* file sparito, binario, o su un disco che non risponde: non e' un errore da mostrare */
  }
}

/** Alla chiusura: i timer in volo non devono accendere niente su un editor morto. */
export function stopFollowing() {
  for (const tmr of fading.values()) clearTimeout(tmr);
  fading.clear();
  touchDeco?.dispose();
  touchDeco = undefined;
}

// ---- native diff -----------------------------------------------------------
// The "before" isn't on disk (the disk already holds the "after"), so it's served
// from a fake read-only in-memory document.
const BEFORE = 'claude-studio-before';
const stash = new Map<string, string>();
let seq = 0;

export function registerDiffProvider(): vscode.Disposable {
  return vscode.workspace.registerTextDocumentContentProvider(BEFORE, {
    provideTextDocumentContent: (u) => stash.get(u.path) ?? '',
  });
}

export async function showDiff(rel: string, before: string, after: string, title?: string) {
  const key = `/${++seq}/${rel.split(/[\\/]/).pop() || 'file'}`;
  stash.set(key, before);
  const left = vscode.Uri.from({ scheme: BEFORE, path: key });

  // The "after" is almost always the real file: that way the diff stays editable and
  // alive. If it doesn't exist (a file never written) we fall back to a second fake
  // document.
  const abs = toUri(rel);
  let right = abs;
  try {
    await vscode.workspace.fs.stat(abs);
  } catch {
    const k2 = key + '.after';
    stash.set(k2, after);
    right = vscode.Uri.from({ scheme: BEFORE, path: k2 });
  }
  await vscode.commands.executeCommand('vscode.diff', left, right, title || `${rel} — before ↔ after`);
}

/** Errors and warnings the editor already knows about: nothing needs re-running. */
export function diagnostics(rel?: string): string {
  const rows: string[] = [];
  const all = vscode.languages.getDiagnostics();
  for (const [uri, list] of all) {
    const name = vscode.workspace.asRelativePath(uri, false);
    if (rel && !name.toLowerCase().includes(rel.toLowerCase())) continue;
    for (const d of list) {
      if (d.severity > vscode.DiagnosticSeverity.Warning) continue;
      const sev = d.severity === vscode.DiagnosticSeverity.Error ? 'error' : 'warning';
      rows.push(`${name}:${d.range.start.line + 1}:${d.range.start.character + 1} ${sev}: ${d.message}`);
    }
  }
  return rows.length ? rows.slice(0, 200).join('\n') : 'No open errors or warnings in the editor.';
}

// ---- gli errori che l'editor gia' conosce ----------------------------------
//
// TypeScript, l'ESLint, il linter di turno: le sottolineature rosse le hanno gia'
// calcolate loro. Nel terminale, per sapere se ha rotto qualcosa, un agente deve
// rilanciare una build e aspettare; qui la risposta e' gia' pronta e non costa niente
// andarla a prendere. E' la sola cosa che un IDE puo' dare a un agente e un terminale
// no.

/**
 * La firma di un errore: file, messaggio, codice. **Senza la riga**, ed e' il punto —
 * una modifica sposta tutto quello che c'e' sotto, e con la riga dentro ogni errore
 * di prima sembrerebbe nuovo di zecca.
 */
function sigOf(rel: string, d: vscode.Diagnostic): string {
  const code = typeof d.code === 'object' ? d.code.value : d.code;
  return `${rel} ${code ?? ''} ${d.message}`;
}

/** Solo gli errori veri: un avviso non e' qualcosa per cui svegliare nessuno. */
const isError = (d: vscode.Diagnostic) => d.severity === vscode.DiagnosticSeverity.Error;

/** Com'erano le cose prima. Si scatta su tutto: quali file verranno toccati non si sa ancora. */
export function errorSnapshot(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const [uri, list] of vscode.languages.getDiagnostics()) {
    const rel = vscode.workspace.asRelativePath(uri, false);
    const sigs = new Set(list.filter(isError).map((d) => sigOf(rel, d)));
    if (sigs.size) out.set(uri.fsPath, sigs);
  }
  return out;
}

/**
 * Gli errori comparsi *adesso* nei file che questo turno ha toccato.
 *
 * Due filtri, e servono tutti e due. Solo i file toccati: un progetto con duecento
 * errori suoi non e' una cosa che ti e' stata chiesta di sistemare. E solo le firme
 * che prima non c'erano: un errore che stava li' da ieri, in un file che oggi e'
 * stato modificato per altro, resta roba di ieri.
 */
export function newErrors(
  files: Iterable<string>,
  before: Map<string, Set<string>>
): { text: string; count: number; files: string[] } {
  const rows: string[] = [];
  const hit = new Set<string>();
  for (const fsPath of files) {
    const uri = vscode.Uri.file(fsPath);
    const rel = vscode.workspace.asRelativePath(uri, false);
    const was = before.get(fsPath) ?? new Set<string>();
    for (const d of vscode.languages.getDiagnostics(uri)) {
      if (!isError(d)) continue;
      const sig = sigOf(rel, d);
      if (was.has(sig)) continue;
      hit.add(rel);
      rows.push(`${rel}:${d.range.start.line + 1}:${d.range.start.character + 1} ${d.message}`);
    }
  }
  // Un tetto c'e' perche' una modifica sbagliata in un file di tipi ne accende
  // trecento, e trecento righe dentro un prompt sono solo soldi.
  return { text: rows.slice(0, 40).join('\n'), count: rows.length, files: [...hit] };
}

/**
 * Aspetta che i linguaggi abbiano finito di ricalcolare.
 *
 * Chiedere le diagnostiche appena finisce il turno vuol dire quasi sempre chiederle a
 * un TypeScript che sta ancora masticando: si sta zitti finche' non passano `quiet`
 * millisecondi senza che nessuno cambi piu' niente, con un tetto perche' un progetto
 * grande, o un watcher rumoroso, non ci arriva mai.
 */
export function diagnosticsSettled(quiet = 1200, cap = 8000): Promise<void> {
  return new Promise((done) => {
    let timer: ReturnType<typeof setTimeout>;
    const finish = () => {
      clearTimeout(timer);
      clearTimeout(hard);
      sub.dispose();
      done();
    };
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(finish, quiet);
    };
    const sub = vscode.languages.onDidChangeDiagnostics(arm);
    const hard = setTimeout(finish, cap);
    arm();
  });
}

/** The files open right now, marking which one is active. */
export function openEditors(): string {
  const rows: string[] = [];
  for (const g of vscode.window.tabGroups.all) {
    for (const tab of g.tabs) {
      const input: any = tab.input;
      const uri: vscode.Uri | undefined = input?.uri ?? input?.modified;
      if (!uri) continue;
      rows.push((tab.isActive ? '* ' : '  ') + vscode.workspace.asRelativePath(uri, false));
    }
  }
  const sel = currentSelection();
  if (sel) rows.push(`selection: ${sel.rel} lines ${sel.lines}`);
  return rows.length ? rows.join('\n') : 'No files open in the editor.';
}
