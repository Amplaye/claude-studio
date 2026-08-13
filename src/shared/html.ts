// The webviews load real files through asWebviewUri and run under a tight CSP with
// a nonce: no external resources, no 'unsafe-inline', no interface buried inside
// JavaScript strings (with animations to tweak, that road is a dead end).
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as vscode from 'vscode';

function makeNonce(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Builds a webview page starting from its .html.
 * The {{...}} placeholders are asset paths, the nonce, the CSP and the Ionicons
 * sprite — which has to be pasted into the document: Chromium doesn't follow
 * <use href="file.svg#id"> references to an external file, so the sprite goes in here.
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
    /* without the sprite the icons don't show, but the page still works */
  }

  const vars: Record<string, string> = { csp, nonce, sprite };
  for (const [key, fileName] of Object.entries(assets)) {
    vars[key] = webview.asWebviewUri(vscode.Uri.joinPath(dist, fileName)).toString();
  }

  return fs
    .readFileSync(file, 'utf8')
    .replace(/\{\{(\w+)\}\}/g, (m, k: string) => (k in vars ? vars[k] : m));
}
