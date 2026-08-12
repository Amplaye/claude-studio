// Il pezzo che guarda l'editor: cosa hai selezionato, che file ci sono, e come si
// apre un file o un diff nativo. Sta tutto qui cosi' il resto della chat non deve
// sapere niente di VSCode.
import * as path from 'node:path';
import * as vscode from 'vscode';

/** Un percorso puo' arrivare relativo o gia' assoluto: qui diventa sempre assoluto. */
function toUri(p: string): vscode.Uri {
  return vscode.Uri.file(/^([a-zA-Z]:[\\/]|\/)/.test(p) ? p : path.join(workspaceRoot(), p));
}

export interface Selected {
  /** percorso relativo alla cartella di lavoro */
  rel: string;
  /** "12-38" oppure "12" */
  lines: string;
  text: string;
}

export function workspaceRoot(): string {
  const f = vscode.workspace.workspaceFolders;
  return f && f.length ? f[0].uri.fsPath : process.cwd();
}

/** Cosa e' selezionato adesso nell'editor attivo. Niente selezione = niente. */
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

// L'elenco dei file si rilegge di rado: cercarli a ogni tasto premuto mentre si
// scrive "@..." vuol dire far grattare il disco per niente.
let cache: { at: number; files: string[] } = { at: 0, files: [] };
const CACHE_MS = 30000;

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
  // Chi ha il pezzo cercato nel nome del file viene prima: e' quasi sempre
  // quello che si sta cercando.
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
    void vscode.window.showErrorMessage(`Non riesco ad aprire ${rel}: ${e instanceof Error ? e.message : e}`);
  }
}

// ---- diff nativo -----------------------------------------------------------
// Il "prima" non sta su disco (sul disco c'e' gia' il "dopo"), quindi si serve da
// un documento finto in memoria, di sola lettura.
const BEFORE = 'claude-studio-prima';
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

  // Il "dopo" e' quasi sempre il file vero: cosi' il diff resta modificabile e
  // vivo. Se non esiste (file mai scritto) si ripiega su un secondo documento finto.
  const abs = toUri(rel);
  let right = abs;
  try {
    await vscode.workspace.fs.stat(abs);
  } catch {
    const k2 = key + '.dopo';
    stash.set(k2, after);
    right = vscode.Uri.from({ scheme: BEFORE, path: k2 });
  }
  await vscode.commands.executeCommand('vscode.diff', left, right, title || `${rel} — prima ↔ dopo`);
}

/** Errori e avvisi che l'editor conosce gia': non serve rieseguire niente. */
export function diagnostics(rel?: string): string {
  const rows: string[] = [];
  const all = vscode.languages.getDiagnostics();
  for (const [uri, list] of all) {
    const name = vscode.workspace.asRelativePath(uri, false);
    if (rel && !name.toLowerCase().includes(rel.toLowerCase())) continue;
    for (const d of list) {
      if (d.severity > vscode.DiagnosticSeverity.Warning) continue;
      const sev = d.severity === vscode.DiagnosticSeverity.Error ? 'errore' : 'avviso';
      rows.push(`${name}:${d.range.start.line + 1}:${d.range.start.character + 1} ${sev}: ${d.message}`);
    }
  }
  return rows.length ? rows.slice(0, 200).join('\n') : 'Nessun errore o avviso aperto nell’editor.';
}

/** I file aperti adesso, con l'indicazione di quello attivo. */
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
  if (sel) rows.push(`selezione: ${sel.rel} righe ${sel.lines}`);
  return rows.length ? rows.join('\n') : 'Nessun file aperto nell’editor.';
}
