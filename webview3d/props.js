/* Claude Studio — l'ufficio in 3D: la stanza e i suoi mobili.
 *
 * Qui la pianta di room.js diventa volumi. Non c'e' una seconda pianta: i muri, i
 * mobili, le scrivanie e gli sgabelli si leggono da `window.ROOM` com'e' adesso —
 * cresciuta o no — e ogni cosa sta dove sta nella stanza piatta. Quello che c'e'
 * di qui e' solo la terza misura: quanto e' alto uno scaffale, quanto e' profondo
 * un tavolo, da che parte guarda uno schermo.
 *
 * Il guscio — pavimento, vetrata, muri, divisori, porta — e le postazioni sono a
 * tratto (kit.js, «A TRATTO»): forme tonde, tinte piatte, contorno a inchiostro. E
 * il guscio non finisce dove finisce la pianta: la vetrata sale oltre il bordo di
 * sopra della scheda, il pavimento e i due muri di fianco corrono verso chi guarda
 * oltre quello di sotto, cosi' attorno alla stanza non resta mai un vuoto. Fin dove
 * devono arrivare lo dice il quadro (`K.Q`, da office3d.js).
 *
 * Tutto quello che non si muove finisce in pochi lotti. Quello che si muove — le
 * ante della porta, le sedie che girano, i portatili che compaiono — sono pezzi a
 * parte, e a muoverli e' lo specchio (mirror.js), che guarda la stanza piatta e
 * riporta qui quello che vede.
 *
 * I colori arrivano dalla pelle (skins/*.js): qui non c'e' un esadecimale.
 */
import { THREE, Tratto, TAU, U, SEDILE_M, PIANO_M, qui, penna, senzaFilo, tazza, TAZZA, mtx, clamp, rnd } from './kit.js';
import { mobili } from './mobili.js';

/** Le altezze del guscio: il davanzale della vetrata, la porta, il traverso, i divisori e i loro pilastrini. */
const DAVANZALE = 20;
const PORTA_H = 63;
const TRAVERSO = 94;
const DIVISORIO = 21.6;
const PILASTRO = 29.4;
/** Quanto e' spesso un divisorio. Nella pianta e' una banda larga una casella: qui se ne tiene l'anima. */
const SPESSO = 4.2;

/* ---- le postazioni, girate ----
 *
 * La camera sta davanti, a sud. Una scrivania messa dritta — chi siede di spalle,
 * lo schermo oltre la sua nuca — nasconde tutte e due le cose che contano: la
 * faccia e lo schermo. Quindi la postazione gira TUTTA, piano, schermo, tastiera,
 * sedia e chi ci siede, di cinquantasette gradi: nelle due colonne di sinistra chi
 * lavora guarda in fondo a sinistra e lo schermo guarda a destra verso la camera;
 * le due di destra sono il loro specchio. Dalla camera si vedono uno schermo di
 * tre quarti e un profilo.
 *
 * La stanza piatta di questo giro non sa niente, e chi cammina cammina nelle sue
 * corsie: trentadue fra una colonna e l'altra, il corridoio fra le due file. Una
 * postazione girata non deve entrarci. Piano, sedia e chi siede stanno quindi nella
 * colonna della scrivania piatta `{ x, b }` — da x + 2 a x + 46, mentre i piedi di
 * chi passa stanno sotto x - 8 o sopra x + 56 — e in quaranta di profondita', da
 * b - 36 a b + 4, che fra le due file ne lascia trenta. E' per questo che il piano
 * e' lungo un metro e venti e non uno e quaranta come nell'anteprima: piu' lungo, e
 * i due spigoli di testa entrano nel corridoio.
 *
 * Qui sotto la postazione vista dalla sua sedia, in metri: x a destra di chi siede,
 * che sta a +z e guarda verso -z. Chi siede, lo schermo e la tastiera stanno su un
 * asse spostato a destra, e il capo sinistro del piano — quello verso la camera —
 * resta libero: e' li' che si posa una tazza, e che si sdraia il gatto. La tazza sta
 * fra la tastiera e il gatto, dove arriva una mano senza alzarsi; il foglio dall'altra
 * parte, oltre il mouse. Chi siede non li cerca a memoria: glieli dice il piano (`top`).
 */
const ALFA = (57 * Math.PI) / 180;
const LARGO = 1.2;
const FONDO = 0.62;
const ASSE = 0.12;
const SIEDE = 0.54;
const SCHERMO = -0.17;
const TASTI = 0.23;
const LIBERO = [-0.39, 0.02];
const POSA_TAZZA = [-0.19, 0.21];
const POSA_FOGLIO = [0.46, 0.08];
/** Dove sta il centro del piano rispetto alla scrivania piatta `{ x, b }`, nella meta' sinistra: cosi' piano, sedia e chi siede stanno centrati nella colonna. */
const CENTRO = [20, -16];

/** La tela degli schermi: quattro celle in fila, larghe e alte come uno schermo. */
const TELA = [512, 128];
const CELLA = [124, 78];
const CELLE = { off: 0, on: 1, working: 2, working2: 3 };
/** Un giro in dieci secondi: tutto quello che si muove da solo sugli schermi torna su se stesso. */
const W10 = TAU / 10;

export function costruisci(K) {
  const { L, C, S, R, Q } = K;
  // Le scatole di prima: restano per il neon e per la porta accesa, che sono delle pelli di notte.
  const box = (...a) => L.box(...a);
  const GLOW = { k: 'glow' };
  const { W, H, WH } = R;
  const B = { banchi: [], posti: [], appesi: [], portatili: [], buste: [], tavoli: [], vetri: [], porta: null, bacheca: null };

  /* Due lotti a tratto. Quello di tutti (`K.tratto`) fa ombra; quello dei muri no: i
     due di fianco sono alti quanto la scheda, e un muro cosi' che fa ombra la fa su
     tutta la stanza. Si scrive in metri, con due penne piantate nell'origine della
     pianta; `blocco` e' per quello che nella pianta ha gia' i suoi estremi. */
  const muro = new Tratto(U);
  const pt = K.qui(0, 0);
  const pm = qui(muro, 0, 0);
  /** Una scatola per i suoi estremi in pianta (unita' di stanza). Senza `o` e' a spigoli vivi e senza contorno; con `o.r` (metri) e' tonda. */
  const blocco = (p, x0, y0, x1, y1, z0, z1, c, o) =>
    (o && o.r != null ? p.box : p.cube)((x1 - x0) / U, (z1 - z0) / U, (y1 - y0) / U, (x0 + x1) / 2 / U, z0 / U, (y0 + y1) / 2 / U, c, o || { filo: 0 });
  const v3 = new THREE.Vector3();
  /** Un punto detto in metri davanti a una penna → dove cade nella pianta: [x, y, z]. */
  const dove = (q, x, y, z) => {
    v3.set(x, y, z).applyMatrix4(q.m);
    return [v3.x, v3.z, v3.y];
  };
  /* Il filo in cima a un muro. Di notte e' un neon col suo alone; nelle pelli di
     giorno e' un cordolo chiaro, che e' quello che fa un muro basso alla luce. */
  const filo = (x0, y0, x1, y1, z) => {
    const xa = Math.min(x0, x1);
    const ya = Math.min(y0, y1);
    if (S.filo) {
      box(xa - 0.45, ya - 0.45, z - 0.2, Math.abs(x1 - x0) + 0.9, Math.abs(y1 - y0) + 0.9, 0.9, S.filo, { k: 'neon' });
      if (S.aloni) K.alone([x0, y0, z + 0.3], [x1, y1, z + 0.3], 5, S.filo, 0.5 * S.aloni);
    } else box(xa - 1.4, ya - 1.4, z, Math.abs(x1 - x0) + 2.8, Math.abs(y1 - y0) + 2.8, 1, C.wallHi);
  };

  // =====================================================================
  //  il pavimento e i muri
  // =====================================================================
  /* Il pavimento e' un piano solo, dipinto dalla pelle, e corre verso chi guarda fin
     dove dice il quadro: oltre il bordo di sotto della scheda. Alla pelle si dice
     una stanza profonda quanto lui, cosi' il salone che dipinge arriva fin li'. */
  function pavimento() {
    const w = W - 16;
    const d = Q.lungo - 8;
    // Quattro pixel di trama per unita' di stanza, finche' la trama ci sta.
    const PPU = Math.min(4, 4096 / w, 4096 / d);
    const { g, tex } = K.tela(w * PPU, d * PPU);
    g.setTransform(PPU, 0, 0, PPU, -8 * PPU, -8 * PPU);
    S.pavimento(g, {
      W,
      H: Q.lungo + 8,
      MEZZO: R.MEZZO,
      VANO: R.VANO,
      ghiaia: R.DISEGNATI.filter((m) => m.s === 'ghiaia').map((m) => ({ x: m.x + m.w / 2, y: m.b - m.h / 2, r: m.w / 2 - 1 })),
    });
    tex.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshToonMaterial({ map: tex, gradientMap: K.toon.gradientMap }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(W / 2, 0, 8 + d / 2);
    m.receiveShadow = true;
    K.radice.add(m);
  }

  /** La trama di un muro, o null se da quel lato la pelle non vuole vetro. `u` corre lungo il muro, `z` in alto. */
  function panorama(lato, u0, u1, z0, z1, info) {
    const PX = Math.min(5, 4096 / (u1 - u0), 4096 / (z1 - z0));
    const t = K.tela((u1 - u0) * PX, (z1 - z0) * PX);
    t.g.scale(PX, PX);
    const vivo = S.vetrata(t.g, u1 - u0, z1 - z0, lato, info);
    if (vivo === false) {
      t.tex.dispose();
      return null;
    }
    t.tex.needsUpdate = true;
    const mat = new THREE.MeshBasicMaterial({ map: t.tex });
    if (typeof vivo === 'function') B.vetri.push({ tex: t.tex, vivo });
    return { mat, u0, z0, w: u1 - u0, h: z1 - z0 };
  }
  /**
   * I vetri di un muro: pezzi della trama `t`, ognuno `[ua, ub, za, zb]`, in una
   * mesh sola. `posa(u, z)` dice dove sta nella stanza un punto del muro; `gira`
   * rovescia il verso, per il muro che si guarda da est. Il muro di fondo e' una
   * trama sola tagliata attorno alla porta, cosi' il paese continua dietro lo
   * stipite invece di ricominciare.
   */
  function vetri(t, pezzi, posa, gira) {
    const p = [];
    const uv = [];
    const idx = [];
    for (const [ua, ub, za, zb] of pezzi) {
      const b = p.length / 3;
      for (const [u, z] of [[ua, za], [ub, za], [ub, zb], [ua, zb]]) {
        p.push(...posa(u, z));
        const s = (u - t.u0) / t.w;
        uv.push(gira ? 1 - s : s, (z - t.z0) / t.h);
      }
      if (gira) idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
      else idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    K.radice.add(new THREE.Mesh(geo, t.mat));
  }

  /* Le nuvole: corsie di cielo una sopra l'altra, appena davanti al vetro e dietro i
     montanti, che scorrono piano ognuna col suo passo. Le dipinge la pelle
     (`nuvole`), se ne ha; con le animazioni ridotte restano dove sono. */
  function nuvole(x0, x1, y) {
    if (!S.nuvole) return;
    // La prima a tre metri e quaranta, poi una ogni metro e venti; cinque al massimo,
    // che in una scheda alta si spartiscono tutta la vetrata.
    const passo = Math.max(36, (WH - 93) / 5);
    for (let i = 0, z = 102; z < WH + 9; i++, z += passo) {
      // Quanto e' lunga la striscia prima di ripetersi: quattro misure, cosi' le corsie non vanno a tempo.
      const lunga = [219, 153, 261, 183][i % 4];
      const { g, tex } = K.tela(512, 128);
      S.nuvole(g, 512, 128, i);
      tex.needsUpdate = true;
      tex.wrapS = THREE.RepeatWrapping;
      tex.repeat.x = (x1 - x0) / lunga;
      const fase = rnd('nuvole', i);
      tex.offset.x = fase;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, lunga / 4), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      m.position.set((x0 + x1) / 2, z, y + 0.1 + i * 0.03);
      m.renderOrder = 1 + i;
      K.radice.add(m);
      K.anima((t) => (tex.offset.x = fase - t / 60));
    }
  }

  function muri() {
    const [vx, vw] = R.VANO;
    const x0 = 16;
    const x1 = W - 16;
    // Il vetro sta tre unita' dietro la faccia del muro (y = 16, dove si appoggiano i mobili).
    const yv = 13;

    // --- il muro di fondo e' una vetrata: dal davanzale fin oltre il bordo di sopra
    //     della scheda. E' lei la protagonista della meta' alta.
    // I montanti partono dagli stipiti e vanno verso gli angoli: cosi' la porta sta
    // sempre fra due vetri interi, comunque cresca la stanza.
    const xs = [];
    if (S.montanti) {
      for (let x = vx - 5; x > x0 + S.montanti * 0.35; x -= S.montanti) xs.push(x);
      for (let x = vx + vw + 5; x < x1 - S.montanti * 0.35; x += S.montanti) xs.push(x);
    }
    xs.sort((a, b) => a - b);
    const bordi = [x0, ...xs, x1];
    const n = panorama('n', x0, x1, DAVANZALE, WH, {
      z0: DAVANZALE,
      cima: Q.cima,
      vetri: bordi.slice(1).map((x, i) => (x + bordi[i]) / 2 - x0),
    });
    if (n) {
      vetri(n, [[x0, vx, DAVANZALE, WH], [vx + vw, x1, DAVANZALE, WH], [vx, vx + vw, PORTA_H, WH]], (u, z) => [u, z, yv]);
      for (const x of xs) blocco(pm, x - 1.05, yv + 0.3, x + 1.05, yv + 2.4, DAVANZALE, WH, C.infisso);
      for (let z = TRAVERSO; z < WH - 20; z += 84) blocco(pm, x0, yv + 0.3, x1, yv + 2.4, z, z + 2.1, C.infisso);
      nuvole(x0, x1, yv);
    } else {
      blocco(pm, x0, 4, vx, yv, DAVANZALE, WH, C.wall);
      blocco(pm, vx + vw, 4, x1, yv, DAVANZALE, WH, C.wall);
      blocco(pm, vx, 4, vx + vw, yv, PORTA_H, WH, C.wall);
    }
    // Sotto il vetro: lo zoccolo pieno, il suo battiscopa e il davanzale, ai due lati della porta.
    for (const [a, b] of [[x0, vx - 4], [vx + vw + 4, x1]]) {
      blocco(pm, a, yv, b, 16, 0, DAVANZALE, C.wall);
      blocco(pm, a, 16, b, 16.5, 0, 4.2, C.wallLo);
      blocco(pm, a, yv - 0.3, b, 18.7, DAVANZALE - 0.8, DAVANZALE + 1.3, C.wallHi, { r: 0.02, filo: 0.008 });
      if (S.filo) filo(a, 18.9, b, 18.9, DAVANZALE + 1.5);
    }

    // --- i due di fianco: pieni, alti quanto serve perche' chiudano il quadro fino
    //     in cima e lunghi fin oltre il bordo di sotto. Da qui si guardano di taglio.
    for (const est of [false, true]) {
      const xf = est ? x1 : x0;
      const s = est ? 1 : -1; // da che parte e' il fuori
      /** Una lastra lungo tutto il muro, da `a` a `b` unita' fuori dalla sua faccia. */
      const lastra = (a, b, z0, z1, c, y0 = 16, y1 = Q.lungo) => blocco(pm, Math.min(xf + a * s, xf + b * s), y0, Math.max(xf + a * s, xf + b * s), y1, z0, z1, c);
      lastra(0, 12, 0, Q.alto, C.wall, 4);
      lastra(-1, 0, 0, 4.2, C.wallLo);
      lastra(-1.05, 0, 27.6, 29.7, C.wallHi);
      for (let z = 72; z < Q.alto - 10; z += 84) lastra(-1.05, 0, z, z + 1.5, C.wallLo);
      // Il montante nell'angolo, dove il muro incontra la vetrata.
      lastra(-3.6, 0, 0, Q.alto, C.infisso, yv, 16.6);
      const t = panorama(est ? 'e' : 'w', 20, H - 4, DAVANZALE, TRAVERSO, { z0: DAVANZALE, cima: TRAVERSO, vetri: [] });
      if (t) {
        vetri(t, [[20, H - 4, DAVANZALE, TRAVERSO]], (u, z) => [xf - s * 0.15, z, u], !est);
        if (S.montanti) for (let u = 20 + S.montanti; u < H - 8; u += S.montanti) lastra(-1.2, -0.15, DAVANZALE, TRAVERSO, C.infisso, u - 1, u + 1);
        if (S.filo) filo(xf - s * 0.6, 16, xf - s * 0.6, H - 4, TRAVERSO + 1);
      }
    }
  }

  /* I divisori: la sala riunioni, il bar e il muro fra loro e il salone. Nella pianta
     sono bande larghe una casella; qui un muro spesso sedici sarebbe un bancone,
     quindi se ne tiene l'anima, bassa quanto un parapetto e col suo corrimano. Ogni
     banda e' una corsa sola, e conta come finisce a ognuno dei due capi: contro il
     muro di fuori si ferma li'; dentro un'altra corsa le arriva in mezzo, cosi'
     l'angolo si chiude; e dove non c'e' niente finisce con un pilastrino — sono i
     due lati di un passaggio, e il vano resta largo quanto nella pianta. */
  function divisori() {
    const fuori = (m) => m.x <= 0 || m.y <= 0 || m.x + m.w >= W || m.y + m.h >= H;
    const dentro = (x, y) => R.WALLS.some((m) => x > m.x && x < m.x + m.w && y > m.y && y < m.y + m.h);
    const bordo = (x, y) => x < 16 || y < 16 || x > W - 16 || y > H - 16;
    const pilastro = (x, y) => {
      blocco(pt, x - 3, y - 3, x + 3, y + 3, 0, PILASTRO, C.wallLo, { r: 0.04 });
      pt.sph(0.085, x / U, (PILASTRO + 1.8) / U, y / U, C.wallHi);
    };
    for (const m of R.WALLS) {
      if (fuori(m)) continue;
      const perX = m.w > m.h;
      const asse = perX ? m.y + m.h / 2 : m.x + m.w / 2;
      /** Da (lungo la corsa, di traverso) a un punto della pianta. */
      const punto = (a, b) => (perX ? [a, b] : [b, a]);
      // Un capo: `a` e' il bordo dell'ultima casella, `v` da che parte finisce la corsa.
      const capo = (a, v) => {
        const oltre = punto(a + v * 8, asse);
        if (dentro(...oltre)) return bordo(...oltre) ? a : a + v * (8 + SPESSO / 2);
        // Libero. Se l'ultima casella ha un muro di fianco e' un angolo: la corsa si
        // ferma al suo centro, dove le arriva l'altra.
        const [cx, cy] = punto(a - v * 8, asse);
        const angolo = perX ? dentro(cx, cy - 16) || dentro(cx, cy + 16) : dentro(cx - 16, cy) || dentro(cx + 16, cy);
        pilastro(...punto(a - v * (angolo ? 8 : 3), asse));
        return a - v * (angolo ? 8 - SPESSO / 2 : 3);
      };
      const a0 = capo(perX ? m.x : m.y, -1);
      const a1 = capo(perX ? m.x + m.w : m.y + m.h, 1);
      const m2 = SPESSO / 2;
      blocco(pt, ...punto(a0, asse - m2), ...punto(a1, asse + m2), 0, DIVISORIO, C.wall, { r: 0.03 });
      blocco(pt, ...punto(a0 - 0.6, asse - m2 - 0.9), ...punto(a1 + 0.6, asse + m2 + 0.9), DIVISORIO, DIVISORIO + 1.8, C.wallHi, { r: 0.025 });
      // Le doghe, sulla faccia che guarda la camera.
      if (perX) for (let x = a0 + 9; x < a1 - 4; x += 18.6) blocco(pt, x - 0.3, asse + m2, x + 0.3, asse + m2 + 0.3, 2.4, DIVISORIO - 2.4, C.wallLo);
      if (S.filo) filo(...punto(a0, asse), ...punto(a1, asse), DIVISORIO + 2);
    }
  }

  /* La porta: due ante a pannelli che si aprono verso dentro, e dietro la cabina di
     un ascensore — cosi' chi entra arriva da qualche parte, e chi esce non svanisce.
     La cabina sta dietro il vetro, e si vede solo dal vano. */
  function porta() {
    const [vx, vw] = R.VANO;
    const m = vx + vw / 2;
    const alta = PORTA_H + 4;
    for (const [x0, y0, x1, y1, z0, z1] of [
      [vx - 6, -16, vx + vw + 6, -14, 0, alta],
      [vx - 6, -16, vx - 4, 13, 0, alta],
      [vx + vw + 4, -16, vx + vw + 6, 13, 0, alta],
      [vx - 6, -16, vx + vw + 6, 13, alta - 2, alta],
      [vx - 6, -16, vx + vw + 6, 9, -2, 0.05],
    ]) blocco(pm, x0, y0, x1, y1, z0, z1, C.cabina);
    // Gli stipiti e l'architrave: legno come gli altri, o una luce (di notte).
    if (S.portaAccesa) {
      box(vx - 4, 13, 0, 4, 5.4, PORTA_H, C.porta, GLOW);
      box(vx + vw, 13, 0, 4, 5.4, PORTA_H, C.porta, GLOW);
      box(vx - 4, 13, PORTA_H, vw + 8, 5.4, 3.6, C.porta, GLOW);
      if (S.aloni) {
        K.alone([vx - 2, 18.6, 0], [vx - 2, 18.6, PORTA_H], 5, C.porta, 0.45 * S.aloni);
        K.alone([vx + vw + 2, 18.6, 0], [vx + vw + 2, 18.6, PORTA_H], 5, C.porta, 0.45 * S.aloni);
        K.alone([vx, 18.6, PORTA_H + 1.8], [vx + vw, 18.6, PORTA_H + 1.8], 5, C.porta, 0.45 * S.aloni);
      }
    } else {
      for (const x of [vx - 2, vx + vw + 2]) blocco(pt, x - 2, 13.2, x + 2, 18.4, 0, PORTA_H + 1, C.porta, { r: 0.025 });
      blocco(pt, vx - 5.5, 13, vx + vw + 5.5, 18.8, PORTA_H, PORTA_H + 4.5, C.porta, { r: 0.03 });
    }
    // Le ante: ognuna e' un pezzo col perno sul suo stipite, e si disegna verso il centro.
    const w = vw / 2 / U;
    const ante = [-1, 1].map((s) => {
      const g = K.parte((p) => {
        const x = (-s * w) / 2;
        p.box(w - 0.012, PORTA_H / U - 0.02, 0.07, x, 0, 0, C.leaf, { r: 0.012 });
        for (const [y, h] of [[0.14, 0.78], [1.06, 0.9]]) p.box(w - 0.14, h, 0.02, x, y, 0.04, C.leafHi, { r: 0.02, filo: 0.006 });
        p.sph(0.036, -s * (w - 0.07), 1.0, 0.07, C.pomello || C.cream, { filo: 0.008, n: 10 });
      });
      g.position.set(s < 0 ? vx : vx + vw, 0, 14.6);
      K.radice.add(g);
      return { g, s };
    });
    B.porta = {
      /** `u` da 0 (chiusa) a 1 (aperta): le ante girano sul perno e finiscono contro i fianchi della cabina. */
      apri(u) {
        for (const a of ante) a.g.rotation.y = -a.s * u * 1.5;
      },
      /** Dove sta in piedi chi aspetta dentro la cabina, prima di entrare. */
      cabina: [m, 1],
    };
  }

  // =====================================================================
  //  gli schermi
  // =====================================================================
  /* Tutti gli schermi sono una mesh sola, che mostra le celle di una tela sola:
     spento, acceso, e al lavoro in due pagine diverse (una per le scrivanie pari,
     una per le dispari, che otto schermi a tempo sono un'insegna). Cambiare stato a
     uno schermo e' dirgli un'altra cella. La tela si ridipinge a ogni fotogramma
     finche' almeno uno e' acceso; con le animazioni ridotte resta com'e' stata
     dipinta la prima volta. */
  const schermi = (() => {
    const [AW, AH] = TELA;
    const [CW, CH] = CELLA;
    const A = K.tela(AW, AH);
    A.tex.minFilter = THREE.LinearFilter;
    A.tex.generateMipmaps = false;
    const g = A.g;
    const LAV = S.schermi.working;
    const ON = S.schermi.on;
    const p = [];
    const idx = [];
    let uv = null;
    let accesi = 0;
    const riga = (x, y, w, h, c) => {
      g.fillStyle = c;
      g.beginPath();
      g.roundRect(x, y, Math.max(w, h), h, h / 2);
      g.fill();
    };
    /** Una cella si dipinge come fosse 160 x 100, e in coda prende la striscia di riflesso che dice «vetro». */
    const cella = (k, fn) => {
      g.save();
      g.beginPath();
      g.rect(2 + k * 127, 2, CW, CH);
      g.clip();
      g.translate(2 + k * 127, 2);
      g.scale(CW / 160, CH / 100);
      fn();
      g.globalAlpha = 0.13;
      g.fillStyle = C.cream;
      g.beginPath();
      g.moveTo(99, 0);
      g.lineTo(131, 0);
      g.lineTo(80, 100);
      g.lineTo(48, 100);
      g.fill();
      g.restore();
    };
    function dipingi(t) {
      cella(CELLE.off, () => {
        g.fillStyle = C.off;
        g.fillRect(0, 0, 160, 100);
      });
      // Acceso e nessuno che scrive: un salvaschermo, che rimbalza piano.
      cella(CELLE.on, () => {
        g.fillStyle = ON[2];
        g.fillRect(0, 0, 160, 100);
        for (let i = 5; i >= 0; i--) {
          const u = t - i * 0.09;
          g.globalAlpha = i ? 0.55 - i * 0.08 : 1;
          g.fillStyle = i ? ON[0] : ON[1];
          g.beginPath();
          g.roundRect(80 + 56 * Math.sin(W10 * 2 * u) - 15, 50 + 30 * Math.sin(W10 * 3 * u + 1) - 11, 30, 22, 7);
          g.fill();
        }
        g.globalAlpha = 1;
      });
      // Al lavoro: una riga di codice al secondo — la si batte, poi la pagina sale.
      cella(CELLE.working, () => {
        g.fillStyle = LAV[0];
        g.fillRect(0, 0, 160, 100);
        g.fillStyle = LAV[2];
        g.fillRect(0, 0, 36, 100);
        for (let i = 0; i < 5; i++) {
          g.globalAlpha = i === Math.floor(t / 2) % 5 ? 1 : 0.4;
          riga(6, 10 + i * 17, 24, 7, LAV[1]);
        }
        g.globalAlpha = 1;
        const n = Math.floor(t);
        const fr = t - n;
        const su = clamp((fr - 0.8) / 0.2) * 15;
        for (let j = 0; j <= 6; j++) {
          const i = (((n - 5 + j) % 10) + 10) % 10;
          const y = 8 + j * 15 - su;
          const rientro = [0, 10, 20, 10, 0, 10, 20, 20, 10, 0][i];
          const larga = 34 + rnd('codice', i) * 62;
          const q = j === 5 ? Math.min(1, fr / 0.72) : j > 5 ? 0 : 1;
          if (q <= 0) continue;
          riga(44 + rientro, y, 16, 7, LAV[2]);
          riga(64 + rientro, y, (larga - 20) * q, 7, LAV[1]);
          if (j === 5 && Math.sin(W10 * 25 * t) > -0.2) {
            g.fillStyle = LAV[1];
            g.fillRect(64 + rientro + Math.max(7, (larga - 20) * q) + 3, y - 1, 5, 9);
          }
        }
      });
      // E l'altra pagina: un cruscotto, con le sue colonne che salgono e scendono.
      cella(CELLE.working2, () => {
        g.fillStyle = LAV[0];
        g.fillRect(0, 0, 160, 100);
        g.fillStyle = LAV[2];
        g.fillRect(0, 0, 30, 100);
        for (let i = 0; i < 4; i++) riga(7, 10 + i * 20, 16, 9, LAV[1]);
        for (let i = 0; i < 6; i++) {
          const a = 14 + 15 * (1 + Math.sin(W10 * (2 + (i % 2)) * t + i * 1.3));
          g.fillStyle = i % 2 ? LAV[1] : LAV[2];
          g.beginPath();
          g.roundRect(40 + i * 19, 52 - a, 13, a, 3);
          g.fill();
        }
        const viva = Math.floor(t / 2) % 3;
        for (let i = 0; i < 3; i++) {
          if (i === viva) {
            g.globalAlpha = 0.3;
            riga(38, 59 + i * 13, 116, 11, C.cream);
            g.globalAlpha = 1;
          }
          riga(42, 62 + i * 13, 40 + rnd('voce', i) * 30, 5, LAV[1]);
          riga(128, 62 + i * 13, 18, 5, LAV[2]);
        }
      });
      A.tex.needsUpdate = true;
    }
    return {
      /**
       * Uno schermo in piu': `m` porta il suo centro, in metri, dove sta nella stanza;
       * `rov` se la postazione e' quella allo specchio. Torna il suo numero e la sua
       * normale in pianta — letta dai vertici della faccia cosi' come si disegna, non
       * da una formula: e' cosi' che il controllo prende anche uno specchio sbagliato.
       */
      aggiungi(m, rov) {
        const b = p.length / 3;
        const q = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => new THREE.Vector3(x * 0.27, y * 0.17, 0).applyMatrix4(m));
        for (const v of q) p.push(v.x, v.y, v.z);
        // Uno specchio rovescia il verso della faccia: si rigira qui, una volta.
        const giro = rov ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
        idx.push(...giro.map((k) => b + k));
        const n = q[giro[1]].clone().sub(q[giro[0]]).cross(q[giro[2]].clone().sub(q[giro[0]]));
        const l = Math.hypot(n.x, n.z) || 1;
        return { k: b / 4, n: [n.x / l, n.z / l] };
      },
      /** Finite le scrivanie: la mesh, e la prima mano di tinta. */
      chiudi() {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
        uv = new THREE.Float32BufferAttribute(new Float32Array((p.length / 3) * 2), 2);
        geo.setAttribute('uv', uv);
        geo.setIndex(idx);
        K.radice.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: A.tex })));
        dipingi(3.3);
        K.anima((t) => accesi > 0 && dipingi(t));
      },
      /** Lo schermo `k` mostra la cella `quale`. Con lo specchio la pagina si stende al contrario, cosi' si legge dritta. */
      mostra(k, quale, rov) {
        const c = CELLE[quale];
        const [a, b] = [(3 + c * 127) / AW, (1 + c * 127 + CW) / AW];
        const [u0, u1] = rov ? [b, a] : [a, b];
        const v0 = 1 - (1 + CH) / AH;
        const v1 = 1 - 3 / AH;
        uv.array.set([u0, v0, u1, v0, u1, v1, u0, v1], k * 8);
        uv.needsUpdate = true;
      },
      /** Uno si e' acceso (+1) o spento (-1): finche' il conto e' zero la tela non si ridipinge. */
      conta(d) {
        accesi += d;
      },
    };
  })();

  // =====================================================================
  //  le sedie
  // =====================================================================
  /* Otto sedie uguali che girano ognuna per conto suo: una forma sola, disegnata una
     volta che guarda a sud come le persone (lo schienale sta dietro), e otto copie
     nella stessa mesh. Chi le gira — lo specchio, a cui la sedia arriva come
     `posto.sedia` — ha in mano un perno qualunque, con la sua `rotation.y`;
     `B.sedie()` riporta i perni sulle copie, a ogni fotogramma. Otto mesh a parte
     erano otto chiamate al disegno, e altre otto per le ombre. */
  const sedie = (() => {
    const forma = new Tratto();
    const p = penna(forma);
    p.lathe([[0, 0], [0.2, 0], [0.21, 0.015], [0.14, 0.035], [0.04, 0.07], [0.03, 0.25], [0, 0.25]], 0, 0, 0, C.chairLo);
    p.disc(0.21, 0.08, 0, SEDILE_M - 0.08, 0, C.chair, { b: 0.03 });
    p.box(0.07, 0.22, 0.04, 0, 0.26, -0.215, C.chairLo, { rx: -0.12, filo: 0.008, r: 0.015 });
    p.box(0.4, 0.36, 0.07, 0, 0.43, -0.235, C.chair, { r: 0.035, rx: -0.12, seg: 2 });
    const perni = [];
    return {
      nuova(x, y, a) {
        const o = new THREE.Object3D();
        o.position.set(x, 0, y);
        o.rotation.y = a;
        o.scale.setScalar(U);
        perni.push(o);
        return o;
      },
      chiudi() {
        const m = senzaFilo(new THREE.InstancedMesh(forma.geometry(), K.toon, perni.length));
        // Le copie stanno sparse per il salone: il conto di cosa e' in quadro non vale la pena.
        m.frustumCulled = false;
        K.radice.add(m);
        B.sedie = () => {
          perni.forEach((o, k) => {
            o.updateMatrix();
            m.setMatrixAt(k, o.matrix);
          });
          m.instanceMatrix.needsUpdate = true;
        };
        B.sedie();
      },
    };
  })();

  // =====================================================================
  //  le scrivanie
  // =====================================================================
  function scrivania(i) {
    const d = R.DESKS[i];
    // La meta' destra della stanza e' lo specchio della sinistra.
    const mir = d.x + 24 > W / 2;
    const q = K.qui(d.x + (mir ? 48 - CENTRO[0] : CENTRO[0]), d.b + CENTRO[1], mir ? -ALFA : ALFA, 0, mir);

    // --- il piano, i due fianchi, il pannello davanti alle gambe, e la cassettiera
    //     sotto il capo libero
    q.slab(LARGO, FONDO, 0.05, 0, PIANO_M - 0.05, 0, C.woodTop, { r: 0.08 });
    for (const s of [-1, 1]) q.box(0.06, PIANO_M - 0.05, FONDO - 0.12, s * (LARGO / 2 - 0.1), 0, 0, C.wood, { r: 0.025 });
    q.box(LARGO - 0.26, 0.24, 0.03, 0, 0.22, 0.08 - FONDO / 2, C.woodLo, { r: 0.012, filo: 0 });
    q.box(0.28, 0.38, 0.44, -0.33, 0.1, -0.03, C.wood, { r: 0.03 });
    for (const y of [0.31, 0.15]) {
      q.box(0.22, 0.14, 0.02, -0.33, y, 0.2, C.woodTop, { r: 0.01, filo: 0.006 });
      q.sph(0.018, -0.33, y + 0.07, 0.218, C.cream, { filo: 0, n: 8 });
    }
    // --- il monitor, appena reclinato; la tastiera e il mouse davanti a chi siede
    q.disc(0.13, 0.022, ASSE, PIANO_M, SCHERMO, C.bezel);
    q.cyl(0.024, 0.03, 0.16, ASSE, PIANO_M + 0.02, SCHERMO - 0.01, C.bezel, { filo: 0.008, n: 10 });
    const s = q.at(ASSE, PIANO_M + 0.35, SCHERMO, 0, -0.1);
    s.box(0.62, 0.42, 0.06, 0, -0.21, 0, C.bezel, { r: 0.03, seg: 2 });
    const vetro = schermi.aggiungi(s.m.clone().multiply(mtx(0, 0, 0.033)), mir);
    q.box(0.34, 0.02, 0.12, ASSE, PIANO_M, TASTI, C.tasti || C.cream, { r: 0.008, filo: 0.007 });
    for (let k = -1; k <= 1; k++) q.cube(0.3, 0.004, 0.024, ASSE, PIANO_M + 0.019, TASTI + k * 0.034, C.stone, { filo: 0 });
    q.sph(1, ASSE + 0.25, PIANO_M + 0.014, TASTI, C.cream, { s: [0.03, 0.02, 0.045], filo: 0.007, n: 10 });

    // Dove cade tutto questo nella pianta: lo si chiede alla penna che l'ha
    // disegnato, cosi' specchio e giro sono gia' dentro e non si rifanno a mano.
    const [sx, sy] = dove(q, ASSE, 0, SIEDE);
    const [fx, fy] = dove(q, ASSE, 0, SIEDE - 1);
    const guarda = Math.atan2(fx - sx, fy - sy);
    const mon = dove(q, ASSE, 0, SCHERMO).slice(0, 2);
    const [tx, ty, tz] = dove(q, 0, PIANO_M, 0);
    const sulPiano = (p) => dove(q, p[0], PIANO_M, p[1]).slice(0, 2);
    const posaTazza = sulPiano(POSA_TAZZA);

    // --- la tazza che chi siede qui si e' portato dal bar: un pezzo spento, e lo
    //     accende lo specchio quando nella stanza piatta ce n'e' una su questa scrivania.
    // Il manico verso la mano che la prende: e' da quella parte che sta chi siede.
    const manico = guarda + (mir ? 0.9 : 2.2);
    const tazzaBar = K.parte((p) => tazza(p.at(0, 0, 0, manico), C.cream, C.caffe || C.soil), false);
    tazzaBar.scale.multiplyScalar(TAZZA);
    tazzaBar.position.set(posaTazza[0], tz, posaTazza[1]);
    tazzaBar.visible = false;
    K.radice.add(tazzaBar);
    if (B.fuma) B.fuma(posaTazza[0], posaTazza[1], tz + 0.09 * TAZZA * U, () => tazzaBar.visible);

    // --- la sedia: gira con chi ci sta seduto (lo specchio le dice di quanto).
    const sedia = sedie.nuova(sx, sy, guarda);

    /* La luce che fa lo schermo, nelle pelli che la vogliono: una chiazza sommata,
       stesa sul piano davanti a lui (`schermi.luce`), e un alone rivolto a chi guarda
       (`aloni`). Non sono lampade. Una lampada vera si paga a ogni pixel della
       stanza, e qui sarebbero otto: a tinte piatte, dove non c'e' una scheda grafica
       la scena si fermava a un fotogramma ogni dieci secondi. */
    const chiazza = (punto, largo, alto, piana) => {
      const m = new THREE.Mesh(K.geoAlone, new THREE.MeshBasicMaterial({ map: K.trama, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.scale.set(largo, alto, 1);
      if (piana) m.rotation.x = -Math.PI / 2;
      else m.quaternion.copy(K.vista.q);
      m.position.set(punto[0], punto[2], punto[1]);
      m.renderOrder = 5;
      K.radice.add(m);
      return m;
    };
    const luce = S.schermi.luce ? chiazza(dove(q, ASSE, PIANO_M + 0.012, 0.06), 52, 52, true) : null;
    const alone = S.aloni ? chiazza(dove(s, 0, 0, 0.25), 64, 48) : null;

    let stato = '';
    const banco = {
      i,
      x: d.x,
      b: d.b,
      mir,
      mon,
      /**
       * Il piano, per chi ci appoggia qualcosa: il centro e l'altezza, da che parte
       * guarda chi siede (`a`, come `posto.a`), quanto e' largo di traverso (`w`) e
       * profondo lungo lo sguardo (`d`), e i suoi posti, tutti [x, y] di pianta:
       * `libero` il capo sgombro verso la camera, dove si sdraia il gatto e si
       * appoggia quello che non ha un posto suo; `tasti` il centro della tastiera;
       * `tazza` e `foglio` dove chi siede posa l'una e l'altro, e `manico` da che
       * parte gira il manico della tazza posata (l'angolo attorno alla verticale).
       */
      top: { x: tx, y: ty, z: tz, a: guarda, w: LARGO * U, d: FONDO * U, libero: sulPiano(LIBERO), tasti: sulPiano([ASSE, TASTI]), tazza: posaTazza, foglio: sulPiano(POSA_FOGLIO), manico },
      /** La tazza del bar posata qui: la accende lo specchio. */
      tazza: tazzaBar,
      /** La targhetta sta sopra lo schermo solo se dietro non c'e' un'altra fila a cui finirebbe addosso. */
      sopra: !R.DESKS.some((o) => o.b < d.b - 1 && d.b - o.b < 90),
      /** La normale vera dello schermo, in pianta: quella del vetro che c'e'. */
      normale: vetro.n,
      /** `s`: 'off' | 'on' | 'working' — quello che dice la classe del monitor piatto. */
      accendi(s) {
        if (s === stato) return;
        schermi.conta((s !== 'off') - (stato !== '' && stato !== 'off'));
        stato = s;
        schermi.mostra(vetro.k, s === 'working' && i % 2 ? 'working2' : s, mir);
        const P = S.schermi[s];
        for (const [m, forza] of [[luce, S.schermi.luce / 90], [alone, 0.34 * S.aloni]]) {
          if (!m) continue;
          m.visible = !!P;
          if (P) m.material.color.set(P[0]).multiplyScalar(forza);
        }
      },
    };
    // Uno schermo acceso non fa una luce ferma: trema appena, ognuno col suo tempo.
    if (luce) K.anima((t) => (luce.material.opacity = 0.85 + 0.15 * Math.sin(TAU * (t / 2 + i * 0.37))));

    const posto = { tipo: 'banco', i, p2: [d.x + 24, d.b + 16], x: sx, y: sy, a: guarda, sedia, top: banco.top };
    banco.posto = posto;

    /* Il controllo, lasciato qui apposta: chi siede a questa scrivania guarda lo
       schermo, e gli sta davanti. Letto dai pezzi montati — l'angolo del posto, la
       normale del vetro cosi' come si disegna — e non dai numeri di qui sopra: e'
       cosi' che prende anche uno specchio sbagliato. Nella prima anteprima sedevano
       tutti dalla parte opposta, a fissare il retro del proprio monitor. */
    const nn = banco.normale;
    const punto = Math.sin(posto.a) * nn[0] + Math.cos(posto.a) * nn[1];
    const davanti = (posto.x - mon[0]) * nn[0] + (posto.y - mon[1]) * nn[1];
    console.assert(punto < -0.8 && davanti > 0, '[ufficio 3D] alla scrivania ' + i + ' chi siede non guarda lo schermo: ' + punto.toFixed(2) + ', ' + davanti.toFixed(1));

    B.posti.push(posto);
    B.banchi.push(banco);
  }

  // =====================================================================
  //  si monta
  // =====================================================================
  pavimento();
  muri();
  divisori();
  porta();
  /* I mobili li fa mobili.js, e dice quali: il gemello piatto di quelli si nasconde.
     Un mobile che non sa fare resta il suo ritaglio, in piedi al suo posto — meglio un
     ritaglio fra i volumi che un buco nella stanza. La ghiaia dell'atrio l'ha gia'
     dipinta il pavimento, e le scrivanie si fanno qui sotto. */
  B.fatti = mobili(K, B).add('ghiaia').add('desk');
  R.DESKS.forEach((_, i) => scrivania(i));
  schermi.chiudi();
  sedie.chiudi();
  for (const b of B.banchi) b.accendi('off');
  K.radice.add(muro.mesh(K.toon, false));

  /* Le buste: otto, quante ne tiene in aria la stanza piatta (MAX_BUSTE in room.js).
     Una busta disegnata una volta — il corpo, il contorno, le due pieghe del lembo —
     e otto mesh che la mostrano, ognuna col suo materiale: e' li' che lo specchio
     mette il colore del suo genere e quanto si vede. Guardano sempre la camera. */
  const busta = new Tratto();
  const pb = penna(busta);
  pb.box(0.32, 0.21, 0.035, 0, -0.105, 0, C.carta, { r: 0.012, filo: 0.012 });
  for (const s of [-1, 1]) pb.cube(0.19, 0.014, 0.006, s * 0.08, 0.045, 0.02, C.ink, { filo: 0, rz: s * 0.58 });
  const formaBusta = busta.geometry();
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(formaBusta, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true }));
    m.scale.setScalar(U);
    m.quaternion.copy(K.vista.q);
    m.visible = false;
    K.radice.add(m);
    B.buste.push(m);
  }

  // Quale sgabello ha davanti quale portatile: la stanza piatta li mette per
  // coordinate (`lap`), e da quelle si risale al posto.
  B.portatili = new Map();
  for (const g of R.SGABELLI) {
    const q = B.posti.find((p) => p.lap && Math.abs(p.p2[0] - (g.x + 8)) < 1 && Math.abs(p.p2[1] - (g.y + 24)) < 1);
    if (q) B.portatili.set(g.lap[0] + ',' + g.lap[1], q);
  }

  if (S.extra) S.extra(K);
  return B;
}
