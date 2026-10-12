/* Claude Studio — l'ufficio in 3D: le persone.
 *
 * Poche scatole per uno, ma con una testa che vale la pena guardare: un taglio di
 * capelli, gli occhi, la barba, gli occhiali. E sono le stesse persone della stanza
 * piatta: i tratti escono da `window.NPC.traits(seme)`, lo stesso generatore che
 * disegna lo sprite — stessa pelle, stessi capelli, stessa camicia, stesse cuffie.
 * Chi passa dal piatto al 3D ritrova la sua gente, non un altro turno.
 *
 * Costruita che guarda a sud (verso la camera): u di traverso alle spalle, v in
 * avanti. Braccia e gambe pendono da perni — spalla e gomito, anca e ginocchio —
 * cosi' la stessa figura cammina, si siede e batte a macchina: non ce ne sono due,
 * una in piedi e una seduta, da scambiare quando arriva alla sedia.
 *
 * Qui c'e' il corpo e le sue pose. Dove sta, da che parte guarda e cosa sta
 * facendo lo decide lo specchio (mirror.js), che lo legge dalla stanza piatta.
 */
import { THREE, Lotto, lerp } from './kit.js';
import { SEDILE } from './props.js';

/** In piedi le gambe sono alte otto; seduti il perno dell'anca sta sul sedile. */
const ANCA = 8;
const ANCA_SEDUTO = SEDILE + 1.6;
/** Quanto e' alta la figura, dai piedi alla cima dei capelli: serve a chi le mette addosso il bottone. */
export const ALTA = 24.4;
export const ALTA_SEDUTA = ANCA_SEDUTO + 8 + 8.4;

const INK = '#1f1810';

/** I tratti di npc.js, detti nei pochi pezzi che una figura a scatole sa portare. */
function aspetto(seme) {
  const t = window.NPC.traits(seme);
  const giacca = t.vestito === 'giacca' || t.vestito === 'cardigan';
  return {
    skin: t.pelle.toni[1],
    hair: t.capelli.toni[1],
    shirt: t.tessuto.toni[1],
    sotto: t.sotto.toni[1],
    accento: t.accento.toni[1],
    pants: t.pantaloni.toni[1],
    shoes: t.scarpe.toni[1],
    taglio: t.taglio,
    barba: t.barba === 'piena' || t.barba === 'corta' || t.barba === 'pizzetto',
    baffi: t.barba === 'baffi' || t.barba === 'pizzetto',
    occhiali: t.occhiali,
    cuffie: t.accessorio === 'cuffie',
    robusta: t.corporatura === 'robusta',
    giacca,
    cravatta: t.cravatta,
    // La polo ha le maniche corte: e' l'unico vestito che lascia vedere l'avambraccio.
    maniche: t.vestito === 'polo',
  };
}

function testa(q, A) {
  const s = A.skin;
  const h = A.hair;
  const lungo = A.taglio === 'caschetto';
  const calvo = A.taglio === 'calvo';
  const ricci = A.taglio === 'ricci';
  q.box(-3.6, -3.2, 0, 7.2, 6.4, 6.4, s);
  q.box(-2.4, 3.2, 2.5, 1.3, 0.25, 1.6, INK, { k: 'thin' });
  q.box(1.1, 3.2, 2.5, 1.3, 0.25, 1.6, INK, { k: 'thin' });
  // I capelli: la cima, la nuca, i due lati e la frangia. E' la nuca quella che si
  // vede di piu' — chi lavora da' le spalle alla camera.
  if (!calvo) {
    if (A.taglio === 'stempiato') q.box(-3.9, -3.5, 5.5, 7.8, 5, 1.7, h);
    else if (ricci) q.box(-4.3, -3.9, 5.2, 8.6, 7.8, 2.6, h);
    else q.box(-3.9, -3.5, 5.5, 7.8, 7, 1.7, h);
  }
  const nuca = lungo ? -3 : calvo ? 2.4 : 1.2;
  q.box(-3.9, -3.6, nuca, 7.8, 1.9, (calvo ? 4.4 : 5.6) - nuca, h);
  for (const u of [-3.95, 3.15]) {
    if (lungo) q.box(u, -3.2, -2.4, 0.8, 5.4, 7.9, h);
    else q.box(u, -3.2, calvo ? 2.4 : 3, 0.8, ricci ? 5.4 : 4.4, calvo ? 2 : 2.5, h);
  }
  if (!calvo && A.taglio !== 'stempiato') q.box(-3.6, 2.9, 4.5, A.taglio === 'riga' ? 6 : A.taglio === 'corto' ? 4.6 : 7.2, 0.55, 1.1, h);
  if (A.taglio === 'chignon') q.box(-1.7, -5, 5.2, 3.4, 2.6, 3.2, h);
  if (A.taglio === 'coda') q.box(-1, -5.4, 0.2, 2, 1.8, 4.8, h);
  if (A.barba) q.box(-3.75, 1.4, 0, 7.5, 2.05, 2, h);
  if (A.baffi) q.box(-1.8, 3.2, 1.5, 3.6, 0.3, 0.7, h, { k: 'thin' });
  if (A.occhiali) {
    q.box(-3.3, 3.25, 2.1, 6.6, 0.3, 0.5, INK, { k: 'thin' });
    for (const u of [-3.1, 0.5]) q.box(u, 3.3, 2.1, 2.6, 0.3, 2.4, '#9fd8ff', { k: 'glow' });
  }
  if (A.cuffie) {
    q.box(-4.4, -0.8, 7, 8.8, 1.6, 0.8, INK);
    for (const u of [-4.7, 3.6]) q.box(u, -1.6, 1.6, 1.1, 3.2, 3.6, INK);
  }
}

/**
 * Una persona. `mat` sono i materiali della scena: il suo, quello che prende le
 * luci, se lo fa lei — cosi' sbiadirla quando e' ferma da un pezzo e' un colore su
 * un materiale, non una figura da ricostruire.
 */
export function persona(seme, mat) {
  const A = aspetto(seme);
  const suo = new THREE.MeshLambertMaterial({ vertexColors: true });
  const M = { lit: suo, thin: suo, glow: mat.glow };
  const pezzo = (par, fn) => {
    const q = new Lotto();
    fn(q);
    const g = q.mesh(M);
    par.add(g);
    return g;
  };
  const perno = (par, x, y, z) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    par.add(g);
    return g;
  };
  const g = new THREE.Group();
  const corpo = perno(g, 0, ANCA, 0);
  const larga = A.robusta ? 0.7 : 0;

  // Il busto scende un pelo sotto l'anca: in piedi e' la camicia fuori dai
  // pantaloni, seduti e' quello che chiude il vuoto fra la schiena e il sedile.
  pezzo(corpo, (q) => {
    q.box(-4 - larga, -2, -1.6, 8 + 2 * larga, 4, 9.6, A.shirt);
    if (A.giacca) q.box(-1.3, 2, 1, 2.6, 0.25, 7, A.sotto, { k: 'thin' });
    if (A.cravatta) q.box(-0.55, 2.05, 1.6, 1.1, 0.3, 6.2, A.accento, { k: 'thin' });
  });
  const capo = perno(corpo, 0, 8, 0);
  // Una testa un po' troppo grande per il corpo: e' la faccia che deve leggersi.
  pezzo(capo, (q) => q.con(new THREE.Matrix4().makeScale(1.15, 1.15, 1.15), () => testa(q, A)));

  const braccia = [-1, 1].map((s) => {
    const spalla = perno(corpo, s * (4.8 + larga), 7.6, 0);
    pezzo(spalla, (q) => q.box(-0.8, -1.5, -4, 1.6, 3, 4, A.shirt));
    const gomito = perno(spalla, 0, -4, 0);
    pezzo(gomito, (q) => {
      q.box(-0.8, -1.5, -4.4, 1.6, 3, 4.4, A.maniche ? A.skin : A.shirt);
      q.box(-0.8, -1.5, -5.7, 1.6, 3, 1.3, A.skin);
    });
    return { spalla, gomito };
  });
  const gambe = [-1, 1].map((s) => {
    const anca = perno(corpo, s * 1.75, 0, 0);
    pezzo(anca, (q) => q.box(-1.45, -1.6, -4, 2.9, 3.2, 4, A.pants));
    const ginocchio = perno(anca, 0, -4, 0);
    const stinco = pezzo(ginocchio, (q) => {
      q.box(-1.45, -1.6, -2.7, 2.9, 3.2, 2.7, A.pants);
      q.box(-1.45, -1.6, -4, 2.9, 4.4, 1.3, A.shoes);
    });
    return { anca, ginocchio, stinco };
  });

  /* Quello che si porta in mano. Nella stanza piatta sono tre pixel appesi alla
     figura; qui stanno nella mano vera, e si accendono quando lo specchio vede il
     loro gemello piatto addosso alla persona. La tazza e il foglietto nella destra,
     il faldone sotto il braccio sinistro. */
  const tazza = pezzo(braccia[1].gomito, (q) => {
    q.box(-1.3, 1.5, -6.3, 2.6, 3, 2.6, '#f2ede2');
    q.box(-1.3, 2.2, -6.3, 2.6, 0.7, 2.6, '#e8c14d', { k: 'thin' });
  });
  const foglio = pezzo(braccia[1].gomito, (q) => q.box(-2, 1.5, -6.6, 4, 4, 0.4, '#9ecbf0', { k: 'glow' }));
  const faldone = pezzo(braccia[0].gomito, (q) => {
    q.box(-2.2, -2.4, -7.4, 1.4, 4.8, 6, '#2f4f7a');
    q.box(-2.25, -1, -5.6, 0.2, 2, 2.2, '#f2ede2', { k: 'thin' });
  });
  tazza.visible = foglio.visible = faldone.visible = false;

  return {
    g,
    seme,
    /**
     * Mette la figura in posa. Tutto arriva gia' ammorbidito da chi chiama:
     *   sit 0..1 in piedi → seduto · passo, amp la fase e l'ampiezza della camminata
     *   digita 0..1 le mani sulla tastiera · batte quale mano e' giu' adesso
     *   saluta 0..1 il braccio alzato di chi ti aspetta · onda la sua fase
     *   testa, china il capo: di lato e in giu' · salto il saltello della festa
     */
    posa(p) {
      const sit = p.sit;
      const in_piedi = 1 - sit;
      const s = Math.sin(p.passo) * p.amp * in_piedi;
      corpo.position.y = lerp(ANCA, ANCA_SEDUTO, sit) + Math.abs(Math.cos(p.passo)) * 0.7 * p.amp * in_piedi + (p.salto || 0) + (p.fiato || 0);
      gambe.forEach((l, k) => {
        const v = k ? -s : s;
        l.anca.rotation.x = -sit * (Math.PI / 2) + v * 0.6;
        // Seduti lo stinco torna in verticale, e si allunga fino a terra: e' il solo
        // trucco di questa figura, e sta sotto la scrivania.
        l.ginocchio.rotation.x = sit * (Math.PI / 2) + Math.max(0, -v) * 0.5;
        l.stinco.scale.y = 1 + 0.375 * sit;
      });
      const tiene = p.tazza || p.foglio;
      braccia.forEach((b, k) => {
        const v = k ? s : -s;
        // Appese e a tempo di passo; poi, in ordine: sedute sulle ginocchia, sulla
        // tastiera, piegate a reggere qualcosa, e alzate a chiamarti.
        let alto = v * 0.5 - 0.3 * sit;
        let basso = -0.12 - 0.95 * sit;
        alto = lerp(alto, -0.7, p.digita);
        basso = lerp(basso, -1.32 + (p.batte === k ? 0.14 : 0), p.digita);
        let fuori = 0;
        if (k === 1 && tiene) {
          alto = -0.28;
          basso = -1.32;
        }
        if (k === 0 && p.faldone) basso = -0.3;
        if (p.saluta && k === (tiene ? 0 : 1)) {
          alto = lerp(alto, -2.7, p.saluta);
          basso = lerp(basso, -0.3, p.saluta);
          fuori = 0.22 * Math.sin(p.onda) * p.saluta;
        }
        b.spalla.rotation.x = alto;
        b.spalla.rotation.z = fuori;
        b.gomito.rotation.x = basso;
      });
      capo.rotation.y = p.testa || 0;
      capo.rotation.x = p.china || 0;
      tazza.visible = !!p.tazza;
      foglio.visible = !!p.foglio && !p.tazza;
      faldone.visible = !!p.faldone;
    },
    /** Sbiadita, come chi e' fermo da un pezzo: `k` da 1 (viva) in giu'. */
    tinta(k) {
      suo.color.setScalar(k);
    },
    via() {
      g.traverse((o) => o.geometry && o.geometry.dispose());
      suo.dispose();
    },
  };
}
