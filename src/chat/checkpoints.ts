// I checkpoint: com'era il codice prima che Claude lo toccasse.
//
// Funziona come nel Claude Code vero. Ogni messaggio che scrivi apre un
// checkpoint; prima che uno strumento di modifica scriva su un file, il
// contenuto di quel file viene messo da parte com'e' adesso. Tornare indietro
// vuol dire riscrivere quei contenuti al loro posto.
//
// Si salva il file *prima*, non dopo, e una volta sola per checkpoint: la prima
// copia e' l'unica che vale, le successive sarebbero gia' il lavoro di Claude.
//
// Limiti, gli stessi dichiarati dall'originale: quello che cambia un comando di
// shell non e' tracciato (un `rm` o un `mv` passa da Bash, non dagli strumenti
// di modifica), e cosi' i link simbolici, che si saltano invece di seguirli —
// riscriverli vorrebbe dire sovrascrivere il bersaglio, fuori dal progetto.
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/** Gli strumenti che scrivono davvero su un file. Gli altri non sporcano niente. */
const WRITERS = new Set(['Edit', 'Write', 'NotebookEdit', 'MultiEdit']);

/** Quanti se ne tengono: come nell'originale, i 100 piu' recenti. */
const MAX = 100;

export interface Checkpoint {
  /** Quando: serve solo a farli vedere in ordine. */
  readonly at: number;
  /** Il messaggio che l'ha aperto: e' cosi' che lo riconosci nell'elenco. */
  readonly prompt: string;
  /** path del file → com'era prima. `null` = non esisteva ancora. */
  readonly files: Map<string, string | null>;
}

export class Checkpoints {
  private list: Checkpoint[] = [];

  /** Un messaggio nuovo: da qui in poi le modifiche appartengono a questo punto. */
  begin(prompt: string) {
    this.list.push({ at: Date.now(), prompt, files: new Map() });
    // Oltre il tetto si buttano i piu' vecchi, che nessuno andra' piu' a riprendere.
    if (this.list.length > MAX) this.list.splice(0, this.list.length - MAX);
  }

  /**
   * Uno strumento sta per scrivere: se e' la prima volta che tocca questo file
   * in questo checkpoint, si mette da parte com'era. Va chiamato *prima* che
   * scriva — dopo, il contenuto di prima non esiste piu' da nessuna parte.
   */
  async before(tool: string, input: Record<string, unknown>) {
    if (!WRITERS.has(tool)) return;
    const cp = this.list[this.list.length - 1];
    if (!cp) return; // niente di aperto: e' roba che non appartiene a nessun punto
    for (const file of filesOf(input)) {
      if (cp.files.has(file)) continue; // gia' preso: la prima copia e' quella buona
      cp.files.set(file, await readOrNull(file));
    }
  }

  /** L'elenco da mostrare, dal piu' recente. */
  entries(): { index: number; prompt: string; at: number; files: number }[] {
    return this.list
      .map((c, index) => ({ index, prompt: c.prompt, at: c.at, files: c.files.size }))
      .reverse();
  }

  /** Quanti file tornerebbero indietro scegliendo questo punto. */
  filesAt(index: number): number {
    return this.affected(index).size;
  }

  /**
   * Riporta i file com'erano a quel punto e butta via i checkpoint successivi.
   * Torna quanti file ha rimesso a posto e quanti ne ha saltati.
   */
  async restore(index: number): Promise<{ restored: number; skipped: string[] }> {
    const targets = this.affected(index);
    let restored = 0;
    const skipped: string[] = [];
    for (const [file, was] of targets) {
      try {
        // Un link simbolico si salta: scriverci sopra colpirebbe il bersaglio,
        // che sta fuori da qui. L'originale fa lo stesso e lo dice.
        const st = await fs.lstat(file).catch(() => null);
        if (st?.isSymbolicLink() || (st && st.nlink > 1)) {
          skipped.push(file);
          continue;
        }
        if (was === null) {
          await fs.rm(file, { force: true }); // prima non c'era: torna a non esserci
        } else {
          await fs.mkdir(path.dirname(file), { recursive: true });
          await fs.writeFile(file, was, 'utf8');
        }
        restored++;
      } catch {
        skipped.push(file);
      }
    }
    this.list = this.list.slice(0, index);
    return { restored, skipped };
  }

  /** Si riparte da zero quando la conversazione si azzera. */
  clear() {
    this.list = [];
  }

  /**
   * Cosa va rimesso a posto per tornare a `index`: tutti i checkpoint da li' in
   * avanti, e per ogni file la copia *piu' vecchia* — quella e' com'era prima
   * che qualcuno lo toccasse.
   */
  private affected(index: number): Map<string, string | null> {
    const out = new Map<string, string | null>();
    for (let i = index; i < this.list.length; i++) {
      for (const [file, was] of this.list[i].files) {
        if (!out.has(file)) out.set(file, was);
      }
    }
    return out;
  }
}

/** I percorsi che uno strumento di scrittura dichiara nel suo input. */
function filesOf(input: Record<string, unknown>): string[] {
  const out: string[] = [];
  const one = input.file_path ?? input.notebook_path ?? input.path;
  if (typeof one === 'string' && one) out.push(one);
  // MultiEdit: piu' file in un colpo solo.
  const many = input.edits;
  if (Array.isArray(many)) {
    for (const e of many) {
      const p = (e as any)?.file_path;
      if (typeof p === 'string' && p) out.push(p);
    }
  }
  return out;
}

/** Il contenuto di adesso, o `null` se il file ancora non c'e'. */
async function readOrNull(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return null; // non esiste, o non e' testo: tornare indietro vuol dire toglierlo
  }
}
