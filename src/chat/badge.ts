// Il bollino sull'icona nella barra delle attivita': l'unico posto dove VSCode
// lascia dire "e' successo qualcosa" senza rubare il fuoco a quello che stai
// facendo. Vive solo finche' la vista laterale e' montata: se non c'e', qui non
// succede niente e l'avviso resta il suono.
import * as vscode from 'vscode';

let host: vscode.WebviewView | undefined;
let value = 0;

/** La vista laterale si presenta quando nasce e si toglie quando muore. */
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
    host.badge = value > 0 ? { value, tooltip: 'Claude ha finito' } : undefined;
  } catch {
    /* una VSCode piu' vecchia puo' non avere il bollino: non e' un guasto */
  }
}
