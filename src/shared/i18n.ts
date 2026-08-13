// The handful of sentences the extension itself puts on screen — VS Code toasts and
// buttons, which the webview never gets to draw.
//
// Everything else the user reads lives in webview/i18n.js: the page can redraw
// itself the instant you flip the switch, and a toast can't, so there is no reason
// to keep two copies of the whole dictionary. Only what genuinely comes from the
// host is here.
import type { Lang } from '../engine/protocol';

/**
 * The language is chosen in the chat's settings, but the context panel is a
 * separate webview with no idea that panel exists. This is how it finds out: the
 * controller fires, whoever draws something listens.
 *
 * A hand-rolled list rather than vscode.EventEmitter, on purpose: this file gets
 * pulled in by the offline checks, which load the bundle without a real `vscode`
 * to construct anything from. Same `{ dispose }` shape, no import.
 */
type LangListener = (lang: Lang) => void;
const listeners = new Set<LangListener>();

export function onDidChangeLang(fn: LangListener): { dispose(): void } {
  listeners.add(fn);
  return {
    dispose() {
      listeners.delete(fn);
    },
  };
}

export function announceLang(lang: Lang) {
  for (const fn of [...listeners]) fn(lang);
}

const STRINGS = {
  en: {
    'toast.done': 'Claude has finished · {project}',
    'toast.open': 'Open',
    'rename.prompt': 'Name for this conversation (empty = back to the starting name)',
    'rename.placeholder': 'e.g. Picnic — fixing the reminders',
    'rename.none': "This conversation hasn't started yet: write something first.",
    'attach.open': 'Attach',
    'attach.title': 'Attach files to the message — any kind',
    'cmd.noProject': 'No project open here: a memory file needs somewhere to live.',
    'cmd.nothingToExport': 'Nothing to export yet: this conversation is empty.',
    'cmd.exported': 'Conversation copied to the clipboard.',
    'cmd.addDir': 'Add to the session',
    'cmd.model': 'Model',
    'cmd.mode': 'Mode',
    'cmd.cwd': 'Folder',
    'rewind.none': 'Nothing to go back to yet: this conversation has no earlier point.',
    'rewind.pick': 'Go back to which message?',
    'rewind.what': 'What should go back?',
    'rewind.both': 'Restore code and conversation',
    'rewind.code': 'Restore code only',
    'rewind.talk': 'Restore conversation only',
    'rewind.files': '{n} file(s) changed since',
    'rewind.noFiles': 'no file changes',
    'rewind.done': 'Restored {n} file(s).',
    'rewind.skipped': 'Restored {n} file(s), skipped {s} (symlinked or unwritable).',
  },
  it: {
    'toast.done': 'Claude ha finito · {project}',
    'toast.open': 'Apri',
    'rename.prompt': 'Nome di questa conversazione (vuoto = torna al nome di partenza)',
    'rename.placeholder': 'es. Picnic — sistemo i promemoria',
    'rename.none': 'Questa conversazione non e’ ancora cominciata: scrivi qualcosa prima.',
    'attach.open': 'Allega',
    'attach.title': 'Allega file al messaggio — di qualunque tipo',
    'cmd.noProject': 'Qui non c’e’ un progetto aperto: un file di memoria deve pur stare da qualche parte.',
    'cmd.nothingToExport': 'Non c’e’ ancora niente da esportare: la conversazione e’ vuota.',
    'cmd.exported': 'Conversazione copiata negli appunti.',
    'cmd.addDir': 'Aggiungi alla sessione',
    'cmd.model': 'Modello',
    'cmd.mode': 'Modalita’',
    'cmd.cwd': 'Cartella',
    'rewind.none': 'Non c’e’ ancora un punto a cui tornare: la conversazione e’ appena cominciata.',
    'rewind.pick': 'A quale messaggio si torna?',
    'rewind.what': 'Cosa deve tornare indietro?',
    'rewind.both': 'Rimetti codice e conversazione',
    'rewind.code': 'Rimetti solo il codice',
    'rewind.talk': 'Rimetti solo la conversazione',
    'rewind.files': '{n} file cambiati da li’',
    'rewind.noFiles': 'nessun file cambiato',
    'rewind.done': 'Rimessi a posto {n} file.',
    'rewind.skipped': 'Rimessi {n} file, saltati {s} (link simbolici o non scrivibili).',
  },
} satisfies Record<Lang, Record<string, string>>;

type Key = keyof (typeof STRINGS)['en'];

export function t(lang: Lang, key: Key, vars?: Record<string, string>): string {
  const s = STRINGS[lang]?.[key] ?? STRINGS.en[key];
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}
