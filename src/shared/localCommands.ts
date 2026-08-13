// I nomi dei comandi che esegue l'interfaccia, e come si presentano nel menu.
//
// Sta qui, e non accanto al codice che li esegue, perche' questo elenco lo legge
// anche il motore (engine/session.ts) per metterli nel menu insieme ai suoi: il
// motore non sa aprire finestre e non deve tirarsi dietro `vscode`.
//
// Le descrizioni sono quelle del Claude Code vero: chi le legge deve ritrovarsi,
// non imparare due vocabolari. Chi li esegue e' chat/commands.ts — e se questo
// elenco e quello divergono, quel file se ne accorge all'avvio.

export interface LocalCommand {
  name: string;
  description: string;
}

export const LOCAL_COMMANDS: LocalCommand[] = [
  // ---- la conversazione ----
  { name: 'clear', description: 'Start a new conversation with empty context' },
  { name: 'resume', description: 'Return to an earlier conversation' },
  { name: 'rewind', description: 'Roll code and conversation back to a checkpoint' },
  { name: 'export', description: 'Export the current conversation as plain text' },

  // ---- la sessione ----
  { name: 'exit', description: 'Close this conversation' },
  { name: 'quit', description: 'Close this conversation' },

  // ---- quello che si guarda ----
  { name: 'help', description: 'Show help and available commands' },
  { name: 'status', description: 'Show the current session status' },
  { name: 'cost', description: 'Show usage and cost' },
  { name: 'memory', description: 'Edit the project CLAUDE.md' },
  { name: 'add-dir', description: 'Add a working directory for file access' },

  // ---- quello che vive fuori da qui ----
  { name: 'login', description: 'Sign in to your Anthropic account' },
  { name: 'logout', description: 'Sign out from your Anthropic account' },
  { name: 'upgrade', description: 'Upgrade your plan' },
  { name: 'privacy-settings', description: 'View and update privacy settings' },
  { name: 'release-notes', description: 'View the changelog' },
  { name: 'feedback', description: 'Send product feedback' },
  { name: 'bug', description: 'Report a bug' },

  // ---- le impostazioni ----
  { name: 'permissions', description: 'Manage allow, ask and deny rules for tool permissions' },
  { name: 'hooks', description: 'View hook configurations for tool events' },
  { name: 'plugin', description: 'Turn plugins on and off' },
  { name: 'statusline', description: 'Set or remove the status line command' },
  { name: 'output-style', description: 'Choose how Claude writes its answers' },
  { name: 'sandbox', description: 'Turn sandbox mode on and off' },

  // ---- quello che in VS Code ha gia' una casa ----
  { name: 'vim', description: 'Vim mode — VS Code has its own' },
  { name: 'terminal-setup', description: 'Open a terminal' },
  { name: 'review', description: 'Review the pending changes for correctness bugs' },
  { name: 'todos', description: 'Show the problems view' },
];
