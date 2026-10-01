// Il piano finito, in plan mode: si salva, non si approva.
//
// La frase che chiude il plan mode va al modello come risposta a ExitPlanMode, e resta
// scritta nel transcript come esito di quella chiamata. E' l'unica traccia che
// sopravvive alla conversazione: riaprendola dalla cronologia, la scheda «Piano
// pronto» si ridisegna da li'. Per questo chi la scrive e chi la rilegge stanno nello
// stesso file — se cambiasse l'una e non l'altra, la scheda sparirebbe in silenzio.
import * as nodePath from 'node:path';

/** La risposta a ExitPlanMode: dove sta il piano, e che non va eseguito adesso. */
export function planSavedMessage(file: string): string {
  return `Plan saved at ${file}. The user will run it in a new conversation: do not start it, do not ask to.`;
}

/** Il percorso dentro quella risposta, o '' se la risposta e' un'altra. */
export function savedPlanPath(text: string): string {
  const m = String(text || '').match(/Plan saved at (.+?)\. The user will run it in a new conversation/);
  return m ? m[1].trim() : '';
}

/** Il nome del piano: il file, senza cartella e senza `.md`. E' quello che si cerca dopo. */
export function planName(file: string): string {
  const base = nodePath.win32.basename(nodePath.posix.basename(file));
  return base.replace(/\.md$/i, '') || base;
}
