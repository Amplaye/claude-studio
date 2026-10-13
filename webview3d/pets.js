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
 *
 * Sono tre file. Questo e' la colla: legge la stanza e la gente, le passa alla
 * testa, e mette i corpi dove la testa dice.
 *   pets-cervello.js  la testa: cosa fanno e dove vanno. Senza three e senza
 *                     pagina, cosi' la si collauda a ore intere fuori dalla scheda.
 *   pets-corpo.js     i corpi: i pezzi a tratto, le pose, il passo.
 * Sono tela e basta: nessun nodo nel palco, niente che si clicchi, e le targhette —
 * che sono nodi, sopra la tela — non le possono coprire.
 */
import { toon, U, SEDILE_M } from './kit.js';
import { cervelli, leggi } from './pets-cervello.js';
import { corpo } from './pets-corpo.js';

export function animali(M) {
  // Il materiale e' il loro: quello della stanza (`M.mat.toon`) si butta a ogni rimontaggio.
  const mat = toon();
  const testa = cervelli();
  const corpi = [corpo('gatto', mat), corpo('cane', mat)];
  for (const c of corpi) {
    // Finche' non c'e' una stanza non hanno un posto: si accendono al primo `stanza()`.
    c.g.visible = false;
    M.gente.add(c.g);
  }
  const attenzioni = new Map();
  const voce = { gatto: { tipo: 'gatto', x: 0, y: 0, z: 0, forza: 0 }, cane: { tipo: 'cane', x: 0, y: 0, z: 0, forza: 0 } };
  /** Il posto di una scrivania → quale scrivania: e' cosi' che si sa chi siede dove. */
  let diChi = new Map();
  const presenti = new Set();

  /**
   * La gente come serve alla testa. Quasi tutto e' gia' sulla figura dello
   * specchio; che stia parlando o aspettando una risposta lo dice solo il suo nodo
   * nella stanza piatta, come lo legge lo specchio: la nuvoletta appesa, la classe
   * `asking`.
   */
  function persone() {
    const lista = [];
    presenti.clear();
    for (const [el, P] of M.specchio.vivi) {
      if (!Number.isFinite(P.x) || !Number.isFinite(P.y)) continue;
      let parla = false;
      for (const c of el.children) {
        if (typeof c.className === 'string' && c.className.includes('of-say')) {
          parla = true;
          break;
        }
      }
      presenti.add(P);
      lista.push({
        k: P,
        x: P.x,
        y: P.y,
        a: P.a,
        sit: P.sit,
        amp: P.amp,
        parla,
        chiede: el.classList.contains('asking'),
        // Dentro la cabina dell'ascensore, prima di entrare: non c'e' ancora.
        porta: P.porta > 0.3,
        banco: P.sit > 0.5 && diChi.has(P.posto) ? diChi.get(P.posto) : -1,
        alta: P.alta,
      });
    }
    return lista;
  }

  const api = {
    /**
     * La persona dello specchio (il valore di `M.specchio.vivi`) → chi le sta
     * chiedendo attenzione adesso: { tipo: 'cane' | 'gatto', x, y, z, forza }.
     * `x, y, z` e' la testa dell'animale in pianta (unita' di stanza, z in alto),
     * `forza` va da 0 a 1 e sale e scende in mezzo secondo: e' gia' ammorbidita.
     * A zero la voce non c'e' piu'. Mai due insieme.
     */
    attenzioni,
    /** La stanza e' stata rimontata: pianta, scrivanie e posti sono quelli nuovi. */
    stanza() {
      diChi = new Map(M.B.banchi.map((b, i) => [b.posto, i]));
      testa.stanza(leggi(window.ROOM, M.R, M.B, SEDILE_M * U));
      for (const c of corpi) c.g.visible = true;
    },
    /** Un fotogramma: `t` in secondi, `dt` quanto e' passato dall'ultimo. Dopo lo specchio. */
    giro(t, dt) {
      if (!testa.mondo) return;
      testa.passo(dt, persone(), M.calmo);
      attenzioni.clear();
      for (const c of corpi) {
        const A = testa[c.tipo];
        c.metti(A, dt, M.calmo);
        if (!A.chi || A.forza <= 0 || !presenti.has(A.chi)) continue;
        const v = voce[c.tipo];
        [v.x, v.y, v.z] = c.capo();
        v.forza = A.forza;
        attenzioni.set(A.chi, v);
      }
    },
    via() {
      for (const c of corpi) {
        M.gente.remove(c.g);
        c.via();
      }
      mat.dispose();
      attenzioni.clear();
      if (window.OFFICE3D && window.OFFICE3D.animali === controlli) delete window.OFFICE3D.animali;
    },
  };

  /* Per i controlli, come `OFFICE3D.stato()`: dove sono e cosa fanno, e il modo di
     far fare loro una cosa adesso (`ordina('gatto', 'sali')`) senza aspettare che
     gli venga in mente. Non serve a nient'altro. */
  const controlli = {
    stato() {
      const di = (c) => {
        const A = testa[c.tipo];
        const dove = { x: +A.x.toFixed(1), y: +A.y.toFixed(1), z: +A.z.toFixed(1), stato: A.stato, att: A.att, su: A.su, forza: +A.forza.toFixed(2) };
        return { ...dove, visibile: c.g.visible, meshes: c.meshes, triangoli: c.triangoli };
      };
      const Mo = testa.mondo || {};
      const c = testa.conti;
      const conti = { coccole: c.coccole.length, fusa: c.fusa.length, salti: c.salti, scansi: c.scansi, fughe: c.fughe, mollati: { ...c.mollati } };
      return { gatto: di(corpi[0]), cane: di(corpi[1]), attenzioni: [...attenzioni.values()].map((v) => ({ ...v })), W: Mo.W, H: Mo.H, conti };
    },
    ordina: (tipo, cosa, arg) => testa.ordina(tipo, cosa, arg),
  };
  if (window.OFFICE3D) window.OFFICE3D.animali = controlli;
  return api;
}
