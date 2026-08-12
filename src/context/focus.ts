// Quale sessione stai guardando adesso.
//
// Per le nostre e' una certezza: la chat dice se e' in primo piano, e la sessione
// aperta e' una sola. Per le tab dell'ufficiale si tira a indovinare, e la card lo
// dichiara — meglio un dubbio scritto che una certezza sbagliata su dove ti trovi.
import * as vscode from 'vscode';
import type { LiveSession } from './sessions';

/** Come si e' arrivati alla sessione in focus, dalla piu' sicura alla piu' incerta. */
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

/** Le tab di una certa webview aperte in questa finestra, con il flag di attiva. */
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
    /* API delle tab non disponibile: si resta senza aggancio */
  }
  return out;
}

/** Le tab dell'estensione ufficiale, in ordine stabile (colonna, poi posizione). */
export function claudeTabs(): ClaudeTab[] {
  return tabsOfType('claudeVSCodePanel').sort(
    (a, b) => (a.viewColumn || 0) - (b.viewColumn || 0) || a.index - b.index
  );
}

/** La nostra scheda e' quella davanti? Allora non c'e' niente da indovinare. */
export function studioTabActive(): boolean {
  return tabsOfType('claudeStudio.panel').some((t) => t.isActive && t.groupActive);
}

/** La tab Claude attiva: prima quella nel gruppo col fuoco, poi una qualsiasi attiva. */
export function activeClaudeTab(tabs = claudeTabs()): ClaudeTab | null {
  return tabs.find((t) => t.isActive && t.groupActive) || tabs.find((t) => t.isActive) || null;
}

/**
 * Aggancia la tab attiva a una sessione dell'ufficiale.
 * `how` dice quanto e' affidabile l'aggancio, e finisce scritto sulla card.
 */
export function matchTabToSession(
  tab: ClaudeTab | null,
  sessions: LiveSession[],
  names: Record<string, string>,
  tabs: ClaudeTab[] = claudeTabs()
): { id: string; how: FocusHow } | null {
  if (!tab) return null;
  const lab = normLabel(tab.label);

  // 1) il nome tab scritto dalla CLI in sessions/<pid>.json
  let hit = lab ? sessions.find((s) => s.tabName && normLabel(s.tabName) === lab) : undefined;
  if (hit) return { id: hit.id, how: 'tab' };
  // 2) il nome che hai dato tu dal pannello
  hit = lab ? sessions.find((s) => names[s.id] && normLabel(names[s.id]) === lab) : undefined;
  if (hit) return { id: hit.id, how: 'tab' };
  // 3) la label contiene il nome tab o l'inizio dell'id (Claude a volte aggiunge suffissi)
  hit = lab ? sessions.find((s) => s.tabName && lab.includes(normLabel(s.tabName))) : undefined;
  if (hit) return { id: hit.id, how: 'tab' };
  hit = lab ? sessions.find((s) => lab.includes(s.id.slice(0, 8))) : undefined;
  if (hit) return { id: hit.id, how: 'tab' };
  // 4) una sola tab e una sola sessione: e' per forza lei
  if (sessions.length === 1 && tabs.length === 1) return { id: sessions[0].id, how: 'tab' };
  // 5) per posizione: se le tab si chiamano tutte uguale il nome non aiuta, ma
  //    restano nell'ordine in cui sono nate, che e' l'ordine di startedAt. Vale
  //    solo se i conti tornano, e la card dira' "stimata".
  //    (Nella 0.0.6 qui c'era anche un confronto `t === tab` che non poteva mai
  //    essere vero: le tab sono oggetti ricostruiti a ogni giro.)
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
 * Porta davvero il fuoco su una tab dell'ufficiale. Non esiste un'API per rivelare
 * la webview di un'altra estensione: si passa per l'indice dell'editor nel gruppo.
 *
 * La 0.0.6 conosceva solo i gruppi 1-4 e dal quinto in poi apriva nel posto
 * sbagliato — senza dirlo. Qui i comandi numerati arrivano all'ottavo, e oltre si
 * cammina di gruppo in gruppo: nessuna colonna resta fuori portata.
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
    /* la tab e' sparita mentre ci arrivavamo: il prossimo giro se ne accorge */
  }
}
