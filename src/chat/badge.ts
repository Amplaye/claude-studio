// The badge on the activity bar icon: the only place VSCode lets you say
// "something happened" without stealing focus from what you're doing. It only
// lives while the sidebar view is mounted: if it isn't, nothing happens here and
// the sound is the only notice you get.
import * as vscode from 'vscode';

let host: vscode.WebviewView | undefined;
let value = 0;

/** The sidebar view introduces itself when it's born and bows out when it dies. */
export function useBadgeHost(v: vscode.WebviewView | undefined) {
  host = v;
  paint();
}

export function setChatBadge(n: number) {
  if (value === n) return;
  value = n;
  paint();
}

function paint() {
  if (!host) return;
  try {
    host.badge = value > 0 ? { value, tooltip: 'Claude is done' } : undefined;
  } catch {
    /* an older VSCode may not have badges: that's not a failure */
  }
}
