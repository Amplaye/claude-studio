// Le webview caricano file veri con asWebviewUri e girano sotto una CSP stretta con
// nonce: niente risorse esterne, niente 'unsafe-inline', niente interfaccia dentro
// stringhe JavaScript (con animazioni da ritoccare quella strada e' impraticabile).
import * as fs from 'node:fs';
import * as vscode from 'vscode';

export function makeNonce(): string {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 32; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}

/**
 * Costruisce la pagina di una webview a partire dal suo .html.
 * I segnaposto {{...}} sono percorsi di risorse, il nonce, la CSP e lo sprite delle
 * Ionicons — che va incollato nel documento: Chromium non segue i riferimenti
 * <use href="file.svg#id"> verso un file esterno, quindi lo sprite si inserisce qui.
 */
export function renderPage(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  htmlName: string,
  assets: Record<string, string>
): string {
  const dist = vscode.Uri.joinPath(extensionUri, 'dist', 'webview');
  const file = vscode.Uri.joinPath(dist, htmlName).fsPath;
  const nonce = makeNonce();

  const csp = [
    `default-src 'none'`,
    `img-src ${webview.cspSource} data:`,
    `style-src ${webview.cspSource}`,
    `font-src ${webview.cspSource}`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');

  let sprite = '';
  try {
    sprite = fs.readFileSync(
      vscode.Uri.joinPath(extensionUri, 'media', 'ionicons.sprite.svg').fsPath,
      'utf8'
    );
  } catch {
    /* senza sprite le icone non si vedono, ma la pagina funziona lo stesso */
  }

  const vars: Record<string, string> = { csp, nonce, sprite };
  for (const [key, fileName] of Object.entries(assets)) {
    vars[key] = webview.asWebviewUri(vscode.Uri.joinPath(dist, fileName)).toString();
  }

  return fs
    .readFileSync(file, 'utf8')
    .replace(/\{\{(\w+)\}\}/g, (m, k: string) => (k in vars ? vars[k] : m));
}
