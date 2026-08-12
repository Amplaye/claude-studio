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
  },
  it: {
    'toast.done': 'Claude ha finito · {project}',
    'toast.open': 'Apri',
  },
} satisfies Record<Lang, Record<string, string>>;

type Key = keyof (typeof STRINGS)['en'];

export function t(lang: Lang, key: Key, vars?: Record<string, string>): string {
  const s = STRINGS[lang]?.[key] ?? STRINGS.en[key];
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}
