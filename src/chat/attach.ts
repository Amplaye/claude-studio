// Gli allegati: il fermaglio nella barra di scrittura, e cosa succede a un file
// lasciato cadere sopra.
//
// Il CLI di Claude, da solo, guarda solo quello che gli passi come immagine. Qui
// invece qualunque file puo' entrare nel messaggio, e la strada e' una delle due:
//
//   immagine  -> viaggia in byte, diventa un blocco immagine, si vede in chat
//   tutto il resto -> viaggia come percorso, e lo apre Claude con i suoi strumenti
//
// La seconda e' l'unica che regge ogni formato (un PDF, un foglio di calcolo, uno
// zip, un video) e l'unica che non fa passare quaranta megabyte dentro un JSON.
import * as vscode from 'vscode';
import * as path from 'node:path';
import type { Attachment, Lang } from '../engine/protocol';
import { t } from '../shared/i18n';

/** Le estensioni che il modello guarda davvero come immagini. */
const IMG: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

/**
 * Oltre questa soglia un'immagine non viaggia piu' in byte: diventa un percorso
 * come tutti gli altri file. Venti megabyte di base64 dentro un postMessage
 * bloccano la finestra per qualche secondo, e il risultato sarebbe comunque
 * rifiutato dall'API.
 */
const MAX_INLINE = 5 * 1024 * 1024;

/** Il file com'e' sul disco: se e' un'immagine piccola, byte compresi. */
export async function readAttachment(uri: vscode.Uri): Promise<Attachment> {
  const name = path.basename(uri.fsPath);
  const ext = path.extname(name).toLowerCase();
  let size = 0;
  try {
    size = (await vscode.workspace.fs.stat(uri)).size;
  } catch {
    /* un file che non si riesce a misurare si allega lo stesso: lo aprira' Claude */
  }
  const mime = IMG[ext];
  if (mime && size > 0 && size <= MAX_INLINE) {
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      return {
        kind: 'image',
        path: uri.fsPath,
        name,
        size,
        mime,
        data: Buffer.from(bytes).toString('base64'),
      };
    } catch {
      /* illeggibile: resta un percorso, ed e' comunque meglio di un errore */
    }
  }
  return { kind: 'file', path: uri.fsPath, name, size };
}

/** Il selettore di VS Code, senza nessun filtro: qualunque cosa ci sia sul disco. */
export async function pickFiles(lang: Lang = 'en'): Promise<Attachment[]> {
  const picked = await vscode.window.showOpenDialog({
    canSelectMany: true,
    canSelectFiles: true,
    canSelectFolders: false,
    openLabel: t(lang, 'attach.open'),
    title: t(lang, 'attach.title'),
    // Nessun `filters`: e' esattamente il punto. Il limite dell'estensione
    // originale e' che ti lascia allegare solo immagini.
  });
  if (!picked?.length) return [];
  return Promise.all(picked.map(readAttachment));
}

/**
 * Un file arrivato da fuori dal disco (trascinato da un browser, da una mail):
 * i byte li ha solo la pagina. Li scriviamo in una cartella nostra e da li' in
 * poi e' un file come tutti gli altri, con un percorso vero.
 */
export async function stashFile(
  ctx: vscode.ExtensionContext,
  name: string,
  base64: string
): Promise<Attachment | undefined> {
  try {
    const dir = vscode.Uri.joinPath(ctx.globalStorageUri, 'attachments');
    await vscode.workspace.fs.createDirectory(dir);
    // Il nome lo sceglie chi trascina, quindi non finisce mai crudo in un percorso:
    // via tutto quello che non e' una lettera, una cifra, un punto o un trattino.
    const safe = path.basename(name).replace(/[^\w.\-]+/g, '_').slice(-80) || 'file';
    const target = vscode.Uri.joinPath(dir, `${Date.now().toString(36)}-${safe}`);
    await vscode.workspace.fs.writeFile(target, Buffer.from(base64, 'base64'));
    return readAttachment(target);
  } catch {
    return undefined;
  }
}
