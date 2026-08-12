// Which session you're looking at right now.
//
// For ours it's a certainty: the chat says whether it's in front, and there's only
// one open session. For the official extension's tabs we're guessing, and the card
// says so — better a doubt written down than a wrong certainty about where you are.
import * as vscode from 'vscode';
import type { LiveSession } from './sessions';

/** How we arrived at the focused session, from the surest to the shakiest. */
export type FocusHow = 'studio' | 'tab' | 'posizione' | 'recenza';

export interface ClaudeTab {
  label: string;
  isActive: boolean;
  groupActive: boolean;
  viewColumn: number;
  index: number;
}

export function normLabel(s: string): string {
  return String(s || '')
    .replace(/[•●○·]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** The tabs of a given webview open in this window, with the active flag. */
function tabsOfType(marker: string): ClaudeTab[] {
  const out: ClaudeTab[] = [];
  try {
    for (const g of vscode.window.tabGroups.all) {
      for (const t of g.tabs) {
        const vt = (t.input as any)?.viewType;
        if (!vt || !String(vt).includes(marker)) continue;
        out.push({
          label: t.label,
          isActive: !!t.isActive,
          groupActive: !!g.isActive,
          viewColumn: g.viewColumn as unknown as number,
          index: g.tabs.indexOf(t),
        });
      }
    }
  } catch {
    /* tabs API not available: we're left without a hook */
  }
  return out;
}

/** The official extension's tabs, in stable order (column, then position). */
export function claudeTabs(): ClaudeTab[] {
  return tabsOfType('claudeVSCodePanel').sort(
    (a, b) => (a.viewColumn || 0) - (b.viewColumn || 0) || a.index - b.index
  );
}

/** Is our tab the one in front? Then there's nothing to guess. */
export function studioTabActive(): boolean {
  return tabsOfType('claudeStudio.panel').some((t) => t.isActive && t.groupActive);
}

/** The active Claude tab: first the one in the focused group, then any active one. */
export function activeClaudeTab(tabs = claudeTabs()): ClaudeTab | null {
  return tabs.find((t) => t.isActive && t.groupActive) || tabs.find((t) => t.isActive) || null;
}

/**
 * Hooks the active tab onto one of the official extension's sessions.
 * `how` says how reliable that hook is, and ends up written on the card.
 */
export function matchTabToSession(
  tab: ClaudeTab | null,
  sessions: LiveSession[],
  names: Record<string, string>,
  tabs: ClaudeTab[] = claudeTabs()
): { id: string; how: FocusHow } | null {
  if (!tab) return null;
  const lab = normLabel(tab.label);

  // 1) the tab name the CLI writes in sessions/<pid>.json
  let hit = lab ? sessions.find((s) => s.tabName && normLabel(s.tabName) === lab) : undefined;
  if (hit) return { id: hit.id, how: 'tab' };
  // 2) the name you gave it from the panel
  hit = lab ? sessions.find((s) => names[s.id] && normLabel(names[s.id]) === lab) : undefined;
  if (hit) return { id: hit.id, how: 'tab' };
  // 3) the label contains the tab name or the start of the id (Claude sometimes adds suffixes)
  hit = lab ? sessions.find((s) => s.tabName && lab.includes(normLabel(s.tabName))) : undefined;
  if (hit) return { id: hit.id, how: 'tab' };
  hit = lab ? sessions.find((s) => lab.includes(s.id.slice(0, 8))) : undefined;
  if (hit) return { id: hit.id, how: 'tab' };
  // 4) one tab and one session: it can only be that one
  if (sessions.length === 1 && tabs.length === 1) return { id: sessions[0].id, how: 'tab' };
  // 5) by position: if the tabs are all named the same the name doesn't help, but
  //    they stay in the order they were born in, which is the order of startedAt.
  //    It only holds if the counts match, and the card will say "estimated".
  //    (In 0.0.6 there was also a `t === tab` comparison here that could never be
  //    true: the tabs are objects rebuilt on every round.)
  if (tabs.length === sessions.length && tabs.length > 0) {
    const pos = tabs.findIndex((t) => t.viewColumn === tab.viewColumn && t.index === tab.index);
    if (pos >= 0) {
      const byStart = sessions.slice().sort((a, b) => a.startedAt - b.startedAt);
      if (byStart[pos]) return { id: byStart[pos].id, how: 'posizione' };
    }
  }
  return null;
}

/**
 * Actually moves the focus onto one of the official extension's tabs. There's no API
 * to reveal another extension's webview: we go through the editor's index in the group.
 *
 * 0.0.6 only knew groups 1-4 and from the fifth on it opened in the wrong place —
 * without saying so. Here the numbered commands reach the eighth, and beyond that we
 * walk from group to group: no column stays out of reach.
 */
export async function revealTab(tab: ClaudeTab) {
  const ORDINALS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth'];
  const col = tab.viewColumn || 1;
  try {
    if (col >= 1 && col <= ORDINALS.length) {
      await vscode.commands.executeCommand(`workbench.action.focus${ORDINALS[col - 1]}EditorGroup`);
    } else {
      await vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup');
      for (let i = 1; i < col; i++) {
        await vscode.commands.executeCommand('workbench.action.focusNextGroup');
      }
    }
    await vscode.commands.executeCommand('workbench.action.openEditorAtIndex', tab.index + 1);
  } catch {
    /* the tab vanished while we were getting there: the next round will notice */
  }
}
