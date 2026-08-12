// The piece that watches the editor: what you selected, which files are around, and
// how to open a file or a native diff. It all sits here so the rest of the chat
// doesn't have to know anything about VSCode.
import * as path from 'node:path';
import * as vscode from 'vscode';

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
