// Aprire una pagina web nel browser, senza il popup di VS Code.
//
// `vscode.env.openExternal` passa dalla protezione dei link di VS Code senza
// `fromWorkspace`: per ogni dominio che non hai messo tra quelli fidati esce
// «Aprire il sito esterno?», e da li' tocca cliccare un'altra volta. Una pagina
// chiesta con "/upgrade" o "/help" non ha bisogno di nessuna conferma — l'hai
// appena chiesta tu — quindi qui la apre il sistema, come farebbe un doppio clic.
//
// In remoto (SSH, WSL, container) il browser sta dall'altra parte: un comando
// lanciato da qui partirebbe sulla macchina sbagliata. Li' resta `openExternal`,
// che sa attraversare il collegamento.
import { spawn } from 'node:child_process';
import * as vscode from 'vscode';

export interface BrowserCommand {
  file: string;
  args: string[];
}

/**
 * Il comando che apre `url` nel browser di sistema, o `null` se l'indirizzo non e'
 * una pagina web. Pura: la piattaforma e la cartella di Windows arrivano da fuori,
 * cosi' le tre strade si provano tutte da qualunque macchina.
 *
 * Mai `cmd.exe` ne' PowerShell: li' `&`, `%`, `,` e `#` hanno un significato, e un
 * indirizzo con dentro `&b=2` diventerebbe due comandi. Gli argomenti vanno al
 * programma cosi' come sono.
 */
export function browserCommand(
  platform: NodeJS.Platform,
  url: string,
  systemRoot = 'C:\\Windows'
): BrowserCommand | null {
  let href: string;
  try {
    const u = new URL(url);
    // Solo pagine web: `javascript:`, `command:`, `file:` e compagnia non sono
    // indirizzi da dare al sistema, che li eseguirebbe o aprirebbe un file.
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    // `href` e' l'indirizzo rimesso in forma: spazi e virgolette diventano %20 e %22,
    // quindi nessun argomento ha bisogno di essere messo fra virgolette — che
    // FileProtocolHandler riceverebbe tali e quali, dentro l'indirizzo.
    href = u.href;
  } catch {
    return null;
  }
  if (platform === 'win32') {
    // Il percorso intero, non il nome nudo: Windows cerca un eseguibile anche nella
    // cartella corrente, e un `rundll32.exe` messo li' da qualcuno partirebbe al
    // posto di quello vero.
    const exe = systemRoot.replace(/[\\/]+$/, '') + '\\System32\\rundll32.exe';
    return { file: exe, args: ['url.dll,FileProtocolHandler', href] };
  }
  if (platform === 'darwin') return { file: 'open', args: [href] };
  return { file: 'xdg-open', args: [href] };
}

/**
 * Apre una pagina web. In locale col comando di sistema, senza popup; se quel
 * comando non parte — o finisce male subito — e in remoto, con `openExternal`.
 */
export function openWeb(url: string): void {
  const fallback = () => {
    if (/^https?:\/\//i.test(url)) void vscode.env.openExternal(vscode.Uri.parse(url));
  };
  const cmd = vscode.env.remoteName ? null : browserCommand(process.platform, url, process.env.SystemRoot);
  if (!cmd) {
    fallback();
    return;
  }
  try {
    // Staccato e senza fili: il browser non e' figlio di VS Code, e chiudere
    // l'editor non deve chiudere lui.
    //
    // Niente `windowsHide`: Node lo traduce in SW_HIDE nella STARTUPINFO, e
    // rundll32 passa quel valore a ShellExecute — un browser che non era gia'
    // aperto partirebbe con la finestra nascosta. Una console non c'e' comunque:
    // rundll32 e' un programma a finestre.
    const child = spawn(cmd.file, cmd.args, { detached: true, stdio: 'ignore' });
    const started = Date.now();
    let done = false;
    const failed = () => {
      if (done) return;
      done = true;
      fallback();
    };
    child.on('error', failed);
    // `open` e `xdg-open` escono col codice sbagliato quando non trovano chi apre la
    // pagina, e lo fanno subito. Piu' tardi non vuol dire niente: certi xdg-open
    // restano attaccati al browser finche' non lo chiudi, e riaprire la pagina a
    // quel punto la mostrerebbe due volte.
    child.on('exit', (code) => {
      if (code && Date.now() - started < 5000) failed();
      else done = true;
    });
    child.unref();
  } catch {
    fallback();
  }
}
