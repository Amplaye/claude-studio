// I comandi che sono azioni dell'interfaccia, non domande per il motore.
//
// Nel terminale "/clear" o "/resume" non sono messaggi: sono cose che fa il
// programma. Qui vale lo stesso. Mandarli al motore come testo lascerebbe la
// chat piena di schede vuote e il contesto intatto — era il difetto di "/clear".
//
// Quelli che il motore sa gia' eseguire (compact, model, context, config,
// agents, doctor, init, mcp, usage) non passano di qui: li fa lui, e meglio.
//
// La corrispondenza e' esatta, come si legge nel menu: "/resume" pulisce,
// "/resume qualcosa" no. Chi vuole il comando lo scrive com'e' scritto.
import * as vscode from 'vscode';
import { LOCAL_COMMANDS } from '../shared/localCommands';
import * as settings from './settings';

/** Cosa puo' fare un comando locale: il minimo che serve, non tutto il controller. */
export interface CommandHost {
  newSession(): void;
  sendHistory(): void;
  openMemory(): void;
  exportConversation(): void;
  addDirectory(): void;
  closeTab(): void;
  showHelp(): void;
  showStatus(): void;
  rewind(): void;
  /** Manda una richiesta al motore come se l'avessi scritta tu. */
  askEngine(prompt: string): void;
  lang: string;
}

/** Un indirizzo esterno: il browser lo apre, l'estensione non lo imita. */
function open(url: string) {
  void vscode.env.openExternal(vscode.Uri.parse(url));
}

/**
 * Il nome del comando (senza "/") e cosa fa. Chi non e' qui dentro va al motore.
 */
const LOCAL: Record<string, (h: CommandHost) => void> = {
  // ---- la conversazione ----
  clear: (h) => h.newSession(),
  resume: (h) => h.sendHistory(),
  rewind: (h) => h.rewind(),
  export: (h) => h.exportConversation(),

  // ---- la sessione ----
  exit: (h) => h.closeTab(),
  quit: (h) => h.closeTab(),

  // ---- quello che si guarda ----
  help: (h) => h.showHelp(),
  status: (h) => h.showStatus(),
  cost: (h) => h.showStatus(), // alias di /usage: qui la spesa e' nella barra
  memory: (h) => h.openMemory(),
  'add-dir': (h) => h.addDirectory(),

  // ---- quello che vive fuori da qui ----
  // Sono pagine e impostazioni vere: l'estensione non ne rifa' una copia finta.
  login: () => void vscode.commands.executeCommand('claudeStudio.update'),
  logout: () => open('https://claude.ai/logout'),
  upgrade: () => open('https://claude.ai/upgrade'),
  'privacy-settings': () => open('https://claude.ai/settings/data-privacy-controls'),
  'release-notes': () => open('https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md'),
  feedback: () => open('https://github.com/anthropics/claude-code/issues/new'),
  bug: () => open('https://github.com/anthropics/claude-code/issues/new'),

  // ---- le impostazioni: si guardano e si cambiano da qui ----
  // Nel terminale aprono una schermata interattiva; qui sono gli elenchi a
  // scelta rapida di VS Code, che fanno la stessa cosa. Scrivono in
  // ~/.claude/settings.json, il file che legge la CLI. Vedi chat/settings.ts.
  permissions: () => void settings.permissions(),
  hooks: () => void settings.hooks(),
  plugin: () => void settings.plugins(),
  statusline: () => void settings.statusline(),
  'output-style': () => void settings.outputStyle(),
  sandbox: () => void settings.sandbox(),

  // ---- quello che qui non ha un corpo ----
  // VS Code ha gia' il suo Vim e il suo terminale: fingere di configurarli da
  // qui sarebbe peggio che dire dove stanno davvero.
  vim: () => void vscode.commands.executeCommand('workbench.extensions.search', 'vim'),
  'terminal-setup': () => void vscode.commands.executeCommand('workbench.action.terminal.new'),
  todos: () => void vscode.commands.executeCommand('workbench.actions.view.problems'),

  // "/review" non e' un'azione dell'interfaccia: e' un lavoro, e lo fa il
  // motore. Aprire il pannello Git sarebbe mostrare il diff a chi ha chiesto
  // che lo si leggesse.
  review: (h) =>
    h.askEngine(
      'Review the pending changes on this branch for correctness bugs and ' +
        'cleanup. Start by running `git diff` (and `git diff --staged`) to see ' +
        'what changed, then report what you find.'
    ),
};

/**
 * Il nome di ognuno sta in shared/localCommands.ts, senza `vscode` intorno: lo
 * legge anche il motore, che deve metterli nel menu ma non sa aprire finestre.
 * Se i due elenchi divergono, il controllo qui sotto se ne accorge subito.
 */
const missing = LOCAL_COMMANDS.filter((c) => !LOCAL[c.name]).map((c) => c.name);
if (missing.length) {
  // Un comando annunciato nel menu e senza corpo finirebbe al motore come testo:
  // esattamente il difetto che questo file esiste per togliere.
  throw new Error(`local commands listed but not implemented: ${missing.join(', ')}`);
}

/**
 * Se il testo e' un comando locale lo esegue e dice di si'. Chi chiama, allora,
 * non manda niente al motore.
 */
export function runLocalCommand(text: string, host: CommandHost): boolean {
  const line = text.trim();
  if (!line.startsWith('/')) return false;
  const fn = LOCAL[line.slice(1)]; // esatto: nessun argomento, nessun prefisso
  if (!fn) return false;
  fn(host);
  return true;
}
