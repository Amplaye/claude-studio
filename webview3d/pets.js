/* Claude Studio — l'ufficio in 3D: il gatto e il cane.
 *
 * Vivono solo di qua: la stanza piatta non li conosce, e non decidono niente per
 * nessuno. Guardano la stanza com'e' (`M.R`, `M.B`) e la gente dove sta
 * (`M.specchio.vivi`), e girano per conto loro. Nascono una volta, quando la scena
 * si accende, e restano dove sono anche se la stanza si rimonta.
 *
 * Il solo filo fra loro e le persone e' `attenzioni`: quando un animale chiede
 * qualcosa a qualcuno, lo scrive li', e lo specchio fa girare e chinare quella
 * persona. Tutto il resto delle persone non li riguarda.
 */
export function animali(M) {
  return {
    /**
     * La persona dello specchio (il valore di `M.specchio.vivi`) → chi le sta
     * chiedendo attenzione adesso: { tipo: 'cane' | 'gatto', x, y, z, forza }.
     * `x, y, z` e' la testa dell'animale in pianta (unita' di stanza, z in alto),
     * `forza` va da 0 a 1 e sale e scende piano: e' gia' ammorbidita.
     */
    attenzioni: new Map(),
    /** La stanza e' stata rimontata: pianta, scrivanie e posti sono quelli nuovi. */
    stanza() {},
    /** Un fotogramma: `t` in secondi, `dt` quanto e' passato dall'ultimo. Dopo lo specchio. */
    giro(t, dt) {},
    via() {},
  };
}
