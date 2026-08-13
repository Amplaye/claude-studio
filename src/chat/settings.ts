// I comandi che nel terminale aprono una schermata interattiva.
//
// "/permissions", "/hooks", "/plugin", "/statusline", "/output-style",
// "/sandbox": nel Claude Code vero aprono una TUI in cui si guarda cosa c'e' e
// si cambia. Una webview non ha una TUI, ma VS Code ha i suoi elenchi a scelta
// rapida — e sono la stessa cosa: vedi cosa c'e', scegli, cambia.
//
// Tutta questa roba vive in ~/.claude/settings.json, non nelle impostazioni
// dell'estensione: e' il file che legge la CLI. Si scrive li', preservando il
// resto del contenuto — nessuno vuole perdere i propri hook per aver guardato
// i permessi.
import * as vscode from 'vscode';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

const FILE = path.join(os.homedir(), '.claude', 'settings.json');

type Settings = Record<string, any>;

async function read(): Promise<Settings> {
  try {
    return JSON.parse(await fs.readFile(FILE, 'utf8'));
  } catch {
    return {}; // non c'e' ancora, o e' illeggibile: si riparte da vuoto
  }
}

/**
 * Si riscrive il file intero, ma solo dopo aver riletto quello che c'e' adesso:
 * fra l'apertura del menu e la scelta puo' averlo toccato qualcun altro, e non
 * si buttano via le sue modifiche.
 */
async function edit(change: (s: Settings) => void) {
  const now = await read();
  change(now);
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(now, null, 2) + '\n', 'utf8');
}

/** Il file vero, aperto nell'editor: per quello che un menu non sa dire. */
async function openFile() {
  await vscode.window.showTextDocument(
    await vscode.workspace.openTextDocument(vscode.Uri.file(FILE))
  );
}

/** Una voce in fondo a ogni elenco: quando il menu non basta, c'e' il file. */
const EDIT_ROW = '$(go-to-file) Edit settings.json…';

// ---- /permissions ---------------------------------------------------------

const MODES: { label: string; value: string; detail: string }[] = [
  { label: 'default', value: 'default', detail: 'Ask before each tool that needs permission' },
  { label: 'acceptEdits', value: 'acceptEdits', detail: 'File edits go through without asking' },
  { label: 'plan', value: 'plan', detail: 'Read and plan only: nothing gets changed' },
  {
    label: 'bypassPermissions',
    value: 'bypassPermissions',
    detail: 'Everything is allowed, nothing is asked',
  },
];

export async function permissions() {
  const s = await read();
  const p = s.permissions ?? {};
  const mode = p.defaultMode ?? 'default';
  const count = (k: string) => (Array.isArray(p[k]) ? p[k].length : 0);

  const pick = await vscode.window.showQuickPick(
    [
      { label: `$(shield) Default mode: ${mode}`, id: 'mode' },
      { label: `$(check) Allow rules: ${count('allow')}`, id: 'allow' },
      { label: `$(question) Ask rules: ${count('ask')}`, id: 'ask' },
      { label: `$(circle-slash) Deny rules: ${count('deny')}`, id: 'deny' },
      { label: EDIT_ROW, id: 'file' },
    ],
    { title: 'Permissions' }
  );
  if (!pick) return;
  if (pick.id === 'file') return openFile();

  if (pick.id === 'mode') {
    const chosen = await vscode.window.showQuickPick(MODES, { title: 'Default permission mode' });
    if (!chosen) return;
    await edit((n) => {
      n.permissions = { ...(n.permissions ?? {}), defaultMode: chosen.value };
    });
    void vscode.window.showInformationMessage(`Default permission mode: ${chosen.value}`);
    return;
  }

  // Le regole si guardano una per una, e da qui si tolgono: aggiungerne una a
  // mano vuole la sintassi giusta, e per quella c'e' il file.
  const key = pick.id as 'allow' | 'ask' | 'deny';
  const rules: string[] = Array.isArray(p[key]) ? p[key] : [];
  if (!rules.length) {
    const go = await vscode.window.showQuickPick([EDIT_ROW], { title: `No ${key} rules yet` });
    if (go) await openFile();
    return;
  }
  const chosen = await vscode.window.showQuickPick(
    [...rules.map((r) => ({ label: r, rule: r })), { label: EDIT_ROW, rule: '' }],
    { title: `${key} rules — pick one to remove` }
  );
  if (!chosen) return;
  if (!chosen.rule) return openFile();
  const yes = await vscode.window.showWarningMessage(
    `Remove this ${key} rule?\n${chosen.rule}`,
    { modal: true },
    'Remove'
  );
  if (yes !== 'Remove') return;
  await edit((n) => {
    const list: string[] = n.permissions?.[key] ?? [];
    n.permissions = { ...(n.permissions ?? {}), [key]: list.filter((r) => r !== chosen.rule) };
  });
  void vscode.window.showInformationMessage('Rule removed.');
}

// ---- /hooks ---------------------------------------------------------------

export async function hooks() {
  const s = await read();
  const h: Record<string, any[]> = s.hooks ?? {};
  const events = Object.keys(h);
  if (!events.length) {
    const go = await vscode.window.showQuickPick([EDIT_ROW], { title: 'No hooks configured' });
    if (go) await openFile();
    return;
  }
  const pick = await vscode.window.showQuickPick(
    [
      ...events.map((e) => ({
        label: `$(zap) ${e}`,
        description: `${(h[e] ?? []).length} matcher(s)`,
        event: e,
      })),
      { label: EDIT_ROW, event: '' },
    ],
    { title: 'Hooks' }
  );
  if (!pick) return;
  if (!pick.event) return openFile();

  // Cosa fa davvero questo hook: i comandi che lancia, in chiaro.
  const lines: string[] = [];
  for (const m of h[pick.event] ?? []) {
    const who = m?.matcher ? `[${m.matcher}] ` : '';
    for (const one of m?.hooks ?? []) lines.push(`${who}${one?.command ?? one?.type ?? '?'}`);
  }
  const go = await vscode.window.showQuickPick(
    [...lines.map((l) => ({ label: l })), { label: EDIT_ROW }],
    { title: `${pick.event} — what it runs` }
  );
  if (go?.label === EDIT_ROW) await openFile();
}

// ---- /plugin --------------------------------------------------------------

export async function plugins() {
  const s = await read();
  const p: Record<string, boolean> = s.enabledPlugins ?? {};
  const names = Object.keys(p);
  if (!names.length) {
    const go = await vscode.window.showQuickPick([EDIT_ROW], { title: 'No plugins installed' });
    if (go) await openFile();
    return;
  }
  const pick = await vscode.window.showQuickPick(
    [
      ...names.map((n) => ({
        label: `${p[n] ? '$(check)' : '$(circle-slash)'} ${n}`,
        description: p[n] ? 'enabled' : 'disabled',
        name: n,
      })),
      { label: EDIT_ROW, name: '' },
    ],
    { title: 'Plugins — pick one to turn on or off' }
  );
  if (!pick) return;
  if (!pick.name) return openFile();
  await edit((n) => {
    n.enabledPlugins = { ...(n.enabledPlugins ?? {}), [pick.name]: !p[pick.name] };
  });
  void vscode.window.showInformationMessage(
    `${pick.name} ${p[pick.name] ? 'disabled' : 'enabled'} — restart the conversation to apply.`
  );
}

// ---- /statusline ----------------------------------------------------------

export async function statusline() {
  const s = await read();
  const cur = s.statusLine;
  const pick = await vscode.window.showQuickPick(
    [
      {
        label: cur ? `$(terminal) ${cur.command ?? cur.type}` : '$(circle-slash) No status line',
        id: 'show',
      },
      { label: '$(edit) Set a command…', id: 'set' },
      ...(cur ? [{ label: '$(trash) Remove it', id: 'off' }] : []),
      { label: EDIT_ROW, id: 'file' },
    ],
    { title: 'Status line' }
  );
  if (!pick || pick.id === 'show') return;
  if (pick.id === 'file') return openFile();
  if (pick.id === 'off') {
    await edit((n) => {
      delete n.statusLine;
    });
    void vscode.window.showInformationMessage('Status line removed.');
    return;
  }
  const cmd = await vscode.window.showInputBox({
    title: 'Status line command',
    value: cur?.command ?? '',
    placeHolder: 'e.g. bash ~/.claude/statusline.sh',
  });
  if (cmd === undefined) return;
  await edit((n) => {
    if (cmd.trim()) n.statusLine = { type: 'command', command: cmd.trim() };
    else delete n.statusLine;
  });
  void vscode.window.showInformationMessage('Status line saved.');
}

// ---- /output-style --------------------------------------------------------

export async function outputStyle() {
  const s = await read();
  const cur = s.outputStyle ?? 'default';
  const pick = await vscode.window.showQuickPick(
    [
      { label: 'default', detail: 'How Claude normally writes' },
      { label: 'Explanatory', detail: 'Explains what it is doing as it goes' },
      { label: 'Learning', detail: 'Teaches while it works, asks you to try things' },
      { label: EDIT_ROW, detail: '' },
    ].map((o) => ({ ...o, description: o.label === cur ? 'current' : undefined })),
    { title: 'Output style' }
  );
  if (!pick) return;
  if (pick.label === EDIT_ROW) return openFile();
  await edit((n) => {
    if (pick.label === 'default') delete n.outputStyle;
    else n.outputStyle = pick.label;
  });
  void vscode.window.showInformationMessage(`Output style: ${pick.label}`);
}

// ---- /sandbox -------------------------------------------------------------

export async function sandbox() {
  const s = await read();
  const on = s.sandbox === true || s.sandbox?.enabled === true;
  const pick = await vscode.window.showQuickPick(
    [
      { label: `$(shield) Sandbox is ${on ? 'on' : 'off'}`, id: 'show' },
      { label: on ? '$(circle-slash) Turn it off' : '$(check) Turn it on', id: 'flip' },
      { label: EDIT_ROW, id: 'file' },
    ],
    { title: 'Sandbox' }
  );
  if (!pick || pick.id === 'show') return;
  if (pick.id === 'file') return openFile();
  await edit((n) => {
    n.sandbox = !on;
  });
  void vscode.window.showInformationMessage(`Sandbox ${!on ? 'on' : 'off'}.`);
}
