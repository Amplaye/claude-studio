// I segreti non escono dalla memoria.
//
// Fra le note ci sono credenziali vere — chiavi di servizio, token, password — scritte
// li' apposta, per non doverle cercare ogni volta. Una ricerca per argomento le
// trascinerebbe nel discorso, e dal discorso nel transcript, nei riassunti, magari in
// una schermata condivisa. Quindi ogni testo che la memoria restituisce passa di qui:
// la riga resta, il valore no. Chi ne ha davvero bisogno apre il file.
const HIDDEN = '[hidden]';

const RULES: [RegExp, string | ((...m: string[]) => string)][] = [
  // Un blocco di chiave privata, intero: dalla prima riga all'ultima.
  [/-----BEGIN [A-Z0-9 ]*KEY-----[\s\S]*?(?:-----END [A-Z0-9 ]*KEY-----|$)/g, '[hidden key]'],
  // JWT: tre pezzi base64url, il primo comincia sempre con eyJ ({"…).
  [/\beyJ[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]{4,}){0,2}/g, HIDDEN],
  [/\bsk-[A-Za-z0-9_-]{16,}/g, HIDDEN],
  [/\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{10,}/g, HIDDEN],
  [/\bsbp_[A-Za-z0-9]{20,}/g, HIDDEN],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, HIDDEN],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, HIDDEN],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/g, HIDDEN],
  [/\bAKIA[0-9A-Z]{16}\b/g, HIDDEN],
  [/\bAIza[0-9A-Za-z_-]{30,}/g, HIDDEN],
  // Il valore lungo dopo «token», «key», «secret», «password» seguiti da : o =. La
  // parola resta — dice di cosa si parla — e il valore se ne va.
  [
    /\b([A-Za-z_]*(?:token|key|secret|password|passwd|pwd)s?\b[^\S\r\n]*[:=][^\S\r\n]*)([`'"]?)([^\s`'"]{8,})\2/gi,
    (_m: string, label: string, q: string) => `${label}${q}${HIDDEN}${q}`,
  ],
];

/** Il testo con i segreti tolti. */
export function mask(text: string): string {
  let out = String(text ?? '');
  for (const [re, by] of RULES) out = out.replace(re, by as never);
  return out;
}
