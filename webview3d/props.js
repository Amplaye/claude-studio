/* Claude Studio — l'ufficio in 3D: la stanza e i suoi mobili.
 *
 * Qui la pianta di room.js diventa volumi. Non c'e' una seconda pianta: i muri, i
 * mobili, le scrivanie e gli sgabelli si leggono da `window.ROOM` com'e' adesso —
 * cresciuta o no — e ogni cosa sta dove sta nella stanza piatta. Quello che c'e'
 * di qui e' solo la terza misura: quanto e' alto uno scaffale, quanto e' profondo
 * un tavolo, da che parte guarda uno schermo.
 *
 * Tutto quello che non si muove finisce in un lotto solo (kit.js). Quello che si
 * muove — le ante della porta, le sedie che girano, gli schermi che cambiano stato,
 * i portatili che compaiono — sono pezzi a parte, e a muoverli e' lo specchio
 * (mirror.js), che guarda la stanza piatta e riporta qui quello che vede.
 *
 * I colori arrivano dalla pelle (skins/*.js): qui non c'e' un esadecimale.
 */
import { THREE, Lotto, T, TAU, clamp, rnd, hash } from './kit.js';
import { mobili } from './mobili.js';

/** Le altezze: i muri di fianco, il cordolo davanti, i divisori, la porta. */
export const WL = 50;
export const KH = 5;
export const PH = 14;
export const DH = 36;
/** Il piano di una scrivania e di un tavolo, e il sedile su cui ci si siede. */
export const PIANO = 11.2;
export const SEDILE = 3.9;

/* ---- chi siede guarda lo schermo ----
 *
 * La camera sta davanti, a sud. Lo schermo deve farsi vedere da lei, quindi guarda
 * verso sud; e chi ci lavora deve guardare lo schermo, quindi siede dalla parte
 * della camera e da' le spalle a chi guarda. Messi in fila — schiena, schermo —
 * la schiena copre lo schermo e della persona si vede solo la nuca.
 *
 * Quindi: il monitor sta a un capo del piano, quello di fuori, girato di
 * trentotto gradi verso la linea di mezzo della stanza; e chi lo guarda siede
 * all'altro capo, sulla sua normale, girato verso di lui. Dalla camera si vedono lo
 * schermo oltre la spalla e una guancia: tre quarti di schiena. La meta' destra
 * della stanza e' lo specchio della sinistra, cosi' ogni schermo guarda il centro.
 */
const PHI = (38 * Math.PI) / 180;
/** Dove sta il monitor sul piano, dal capo di fuori; e a quanto siede chi lo guarda. */
const MON = [10.5, 6.2];
const DISTANZA = 14.5;
const UBOX = new THREE.BoxGeometry(1, 1, 1);

export function costruisci(K) {
  const { L, C, S, R } = K;
  const box = (...a) => L.box(...a);
  const cyl = (...a) => L.cyl(...a);
  const face = (...a) => L.face(...a);
  const GLOW = { k: 'glow' };
  const THIN = { k: 'thin' };
  const { W, H, WH } = R;
  const B = { banchi: [], posti: [], appesi: [], portatili: [], buste: [], tavoli: [], vetri: [], porta: null, bacheca: null };
  /** Un pezzo che si muove: le sue scatole in un lotto suo, dentro un gruppo. */
  const pezzo = (fn, par = K.radice) => {
    const q = new Lotto();
    fn(q);
    const g = q.mesh(K.mat);
    par.add(g);
    return g;
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
  function pavimento() {
    box(8, 8, -7, W - 16, H - 16, 6.95, C.slab);
    const PPU = 4; // pixel di trama per pixel di stanza
    const { g, tex } = K.tela((W - 16) * PPU, (H - 16) * PPU);
    g.setTransform(PPU, 0, 0, PPU, -8 * PPU, -8 * PPU);
    S.pavimento(g, {
      W,
      H,
      MEZZO: R.MEZZO,
      VANO: R.VANO,
      ghiaia: R.DISEGNATI.filter((m) => m.s === 'ghiaia').map((m) => ({ x: m.x + m.w / 2, y: m.b - m.h / 2, r: m.w / 2 - 1 })),
    });
    tex.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W - 16, H - 16), new THREE.MeshLambertMaterial({ map: tex }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(W / 2, 0, H / 2);
    m.receiveShadow = true;
    K.radice.add(m);
  }

  /**
   * Un vetro: un pezzo della trama `t`, dipinta dalla pelle per tutto il muro, steso
   * fra (ua, za) e (ub, zb). `posa` lo mette in piedi contro il suo muro. Il muro di
   * fondo e' una trama sola tagliata in tre vetri — a sinistra della porta, a destra,
   * e sopra — cosi' la citta' continua dietro lo stipite invece di ricominciare.
   */
  function vetro(t, ua, ub, za, zb, posa) {
    const geo = new THREE.PlaneGeometry(ub - ua, zb - za);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, (ua + uv.getX(i) * (ub - ua) - t.u0) / t.w, (za + uv.getY(i) * (zb - za) - t.z0) / t.h);
    }
    const m = new THREE.Mesh(geo, t.mat);
    posa(m, (ua + ub) / 2, (za + zb) / 2);
    K.radice.add(m);
  }
  /** La trama di un muro, o null se da quel lato la pelle non vuole vetro. */
  function panorama(lato, u0, u1, z0, z1) {
    const PX = 5;
    const t = K.tela((u1 - u0) * PX, (z1 - z0) * PX);
    t.g.scale(PX, PX);
    const vivo = S.vetrata(t.g, u1 - u0, z1 - z0, lato);
    if (vivo === false) {
      t.tex.dispose();
      return null;
    }
    t.tex.needsUpdate = true;
    const mat = new THREE.MeshBasicMaterial({ map: t.tex });
    if (typeof vivo === 'function') B.vetri.push({ tex: t.tex, vivo });
    return { mat, u0, z0, w: u1 - u0, h: z1 - z0 };
  }

  function muri() {
    const [vx, vw] = R.VANO;
    // --- il muro di fondo: alto, ed e' una vetrata. E' lui il protagonista della
    //     meta' alta della scheda: da questa camera il pavimento e' una striscia.
    box(8, 8, 0, vx - 8, 8, WH, C.wall);
    box(vx + vw, 8, 0, W - 8 - vx - vw, 8, WH, C.wall);
    box(vx, 8, DH, vw, 8, WH - DH, C.wall);
    const z0 = 11;
    const z1 = WH - 5;
    const n = panorama('n', 20, W - 20, z0, z1);
    if (n) {
      const aSud = (m, u, z) => m.position.set(u, z, 16.06);
      vetro(n, 20, vx - 3, z0, z1, aSud);
      vetro(n, vx + vw + 3, W - 20, z0, z1, aSud);
      vetro(n, vx - 3, vx + vw + 3, DH + 6, z1, aSud);
      // I montanti partono dallo stipite e vanno verso gli angoli: cosi' la porta
      // sta sempre fra due vetri interi, comunque cresca la stanza.
      if (S.montanti) {
        for (let u = vx - 3 - S.montanti; u > 22; u -= S.montanti) box(u - 0.5, 16, z0, 1, 0.7, z1 - z0, C.infisso, THIN);
        for (let u = vx + vw + 3 + S.montanti; u < W - 22; u += S.montanti) box(u - 0.5, 16, z0, 1, 0.7, z1 - z0, C.infisso, THIN);
      }
      for (const u of [vx - 3, vx + vw + 3]) box(u - 0.8, 16, DH, 1.6, 0.9, z1 - DH, C.infisso, THIN);
      box(vx - 3, 16, DH + 4.4, vw + 6, 0.9, 1.6, C.infisso, THIN);
      for (const [a, b] of [[16, vx - 3], [vx + vw + 3, W - 16]]) box(a, 16, z0 - 1.2, b - a, 1, 1.2, C.wallHi, THIN);
    }
    face(16, vx, 16, 0, 3, C.wallLo);
    face(vx + vw, W - 16, 16, 0, 3, C.wallLo);
    filo(8, 16.4, W - 8, 16.4, WH);

    // --- i due di fianco: bassi, che da qui si guardano di taglio.
    for (const est of [false, true]) {
      const x = est ? W - 16 : 8;
      const xf = est ? W - 16.06 : 16.06;
      box(x, 16, 0, 8, H - 24, WL, C.wall);
      const t = panorama(est ? 'e' : 'w', 20, H - 20, 11, WL - 5);
      if (t) {
        vetro(t, 20, H - 20, 11, WL - 5, (m, u, z) => {
          m.rotation.y = est ? -Math.PI / 2 : Math.PI / 2;
          m.position.set(xf, z, u);
        });
        if (S.montanti) for (let u = 20 + S.montanti; u < H - 22; u += S.montanti) box(est ? W - 16.7 : 16, u - 0.5, 11, 0.7, 1, WL - 16, C.infisso, THIN);
      }
      box(est ? W - 16.4 : 16, 16, 0, 0.4, H - 24, 3, C.wallLo, THIN);
      filo(est ? W - 16.4 : 16.4, 16, est ? W - 16.4 : 16.4, H - 8, WL);
    }
    // --- quello davanti e' un cordolo: tagliato, se no nella stanza non si vede.
    box(16, H - 16, 0, W - 32, 8, KH, C.wall);
    filo(16, H - 15.6, W - 16, H - 15.6, KH);
  }

  /* I divisori: la sala riunioni, il bar e il muro fra loro e il salone. Nella pianta
     sono bande larghe una casella; qui un muro spesso sedici sarebbe un bancone,
     quindi se ne tiene l'anima — sei pixel in mezzo alla casella. Casella per
     casella: un perno al centro e un braccio verso ogni vicina che e' muro, cosi' gli
     angoli si chiudono e i capi liberi arrivano al bordo della casella (il vano fra
     due pezzi resta largo quanto nella pianta) senza scrivere la pianta due volte. */
  function divisori() {
    const fuori = (m) => m.x <= 0 || m.y <= 0 || m.x + m.w >= W || m.y + m.h >= H;
    const dentro = (x, y) => R.WALLS.some((m) => x > m.x && x < m.x + m.w && y > m.y && y < m.y + m.h);
    for (const m of R.WALLS) {
      if (fuori(m)) continue;
      for (let ty = m.y; ty < m.y + m.h - 1; ty += 16) {
        for (let tx = m.x; tx < m.x + m.w - 1; tx += 16) {
          const cx = tx + 8;
          const cy = ty + 8;
          const v = { n: dentro(cx, cy - 16), s: dentro(cx, cy + 16), w: dentro(cx - 16, cy), e: dentro(cx + 16, cy) };
          const quante = v.n + v.s + v.w + v.e;
          // Un capo libero, o un tratto dritto: i bracci vanno lungo la corsa, tutti e due.
          if (quante <= 2 && !((v.n || v.s) && (v.w || v.e))) {
            if (v.n || v.s || !quante) v.n = v.s = true;
            else v.w = v.e = true;
          }
          const x0 = v.w ? tx : cx - 3;
          const x1 = v.e ? tx + 16 : cx + 3;
          const y0 = v.n ? ty : cy - 3;
          const y1 = v.s ? ty + 16 : cy + 3;
          if (v.w || v.e) {
            box(x0, cy - 3, 0, x1 - x0, 6, PH, C.wall);
            filo(x0, cy, x1, cy, PH);
          }
          if (v.n || v.s) {
            box(cx - 3, y0, 0, 6, y1 - y0, PH, C.wall);
            filo(cx, y0, cx, y1, PH);
          }
        }
      }
    }
  }

  /* La porta: due ante che scorrono dentro il muro, e dietro la cabina di un
     ascensore — cosi' chi entra arriva da qualche parte, e chi esce non svanisce. */
  function porta() {
    const [vx, vw] = R.VANO;
    const m = vx + vw / 2;
    const st = S.portaAccesa ? GLOW : null;
    box(vx - 1.6, 16, 0, 1.6, 0.5, DH, C.porta, st);
    box(vx + vw, 16, 0, 1.6, 0.5, DH, C.porta, st);
    box(vx - 1.6, 16, DH, vw + 3.2, 0.5, 1.4, C.porta, st);
    if (S.portaAccesa && S.aloni) {
      K.alone([vx - 0.8, 16.4, 0], [vx - 0.8, 16.4, DH], 4, C.porta, 0.45 * S.aloni);
      K.alone([vx + vw + 0.8, 16.4, 0], [vx + vw + 0.8, 16.4, DH], 4, C.porta, 0.45 * S.aloni);
      K.alone([vx, 16.4, DH + 0.7], [vx + vw, 16.4, DH + 0.7], 4, C.porta, 0.45 * S.aloni);
    }
    for (const [x, y, w, d, h, z] of [
      [vx - 2, -12, vw + 4, 2, DH + 4, 0],
      [vx - 2, -12, 2, 20, DH + 4, 0],
      [vx + vw, -12, 2, 20, DH + 4, 0],
      [vx - 2, -12, vw + 4, 20, 2, DH + 2],
      [vx - 2, -12, vw + 4, 20, 1, -1],
    ]) box(x, y, z, w, d, h, C.cabina);
    const ante = [-1, 1].map((s) => {
      const g = pezzo((q) => {
        q.box(0, 0, 0, vw / 2, 2, DH, C.leaf);
        q.face(0, vw / 2, 2, DH - 3, DH, C.leafHi);
        q.face(0, vw / 2, 2, 0, 10, C.leafLo);
      });
      const x0 = s < 0 ? vx : m;
      g.position.set(x0, 0, 12.5);
      return { g, s, x0 };
    });
    let luce = null;
    if (S.portaAccesa) {
      luce = new THREE.PointLight(C.porta, 22, 110, 1.3);
      luce.position.set(m, 22, 24);
      K.radice.add(luce);
    }
    B.porta = {
      /** `u` da 0 (chiusa) a 1 (aperta): le ante spariscono nel muro. */
      apri(u) {
        for (const a of ante) a.g.position.x = a.x0 + a.s * (vw / 2) * u;
        if (luce) luce.intensity = 22 + 26 * u;
      },
      /** Dove sta in piedi chi aspetta dentro la cabina, prima di entrare. */
      cabina: [m, 1],
    };
  }

  // =====================================================================
  //  i mobili contro il muro di fondo
  // =====================================================================
  /* Ognuno dice anche dove va a finire, sulla sua faccia, una cosa che nella stanza
     piatta gli sta appesa sopra — un foglietto, una tazza, il riflesso di chi legge.
     `fz` porta da «quanti pixel sopra il bordo di sotto del ritaglio» all'altezza
     vera: i ritagli sono disegnati alti perche' si vede anche il sopra, e la
     proporzione non e' la stessa per tutti. */
  const appeso = (m, h2, yf, fz) => B.appesi.push({ x0: m.x, x1: m.x + (m.w || R.SV[m.s].w), y0: m.b - h2, b: m.b, yf, fz });

  function scaffale(m, cosa) {
    const x = m.x;
    const y = 16;
    const w = 28;
    const d = 11;
    const h = 30;
    box(x, y, 0, w, 2, h, C.woodDk);
    box(x, y, 0, 2, d, h, C.wood);
    box(x + w - 2, y, 0, 2, d, h, C.wood);
    box(x, y, h - 2, w, d, 2, C.wood);
    box(x, y, 0, w, d, 2, C.wood);
    for (let k = 0; k < 3; k++) {
      const zb = 2 + k * 9;
      if (k) box(x + 2, y + 2, zb - 1, w - 4, d - 2, 1, C.wood);
      if (cosa === 'faldoni') {
        for (let i = 0, bx = x + 3; bx < x + w - 4.6; i++) {
          const bw = 2 + rnd('bw', k, i) * 1.4;
          box(bx, y + 4, zb, bw - 0.4, 6, 5 + rnd('bh', k, i) * 2.5, C.faldoni[hash('bc', k, i) % C.faldoni.length]);
          bx += bw;
        }
      }
      if (cosa === 'barattoli') {
        for (let i = 0; i < 3; i++) {
          const bx = x + 4 + i * 7.5;
          box(bx, y + 4.5, zb, 5, 5, 4.3, C.jar);
          box(bx, y + 4.5, zb + 4.3, 5, 5, 1.2, C.jarHi);
        }
      }
      // La rastrelliera resta vuota: le tazze che ci stanno sono quelle vere, e le
      // mette la stanza piatta (lo specchio le appoggia sui ripiani).
    }
    appeso(m, R.SV[m.s].h, y + 6.5, (dy) => 0.9 * dy + 0.2);
  }
  function armadio(m) {
    const x = m.x;
    const w = 26;
    const h = 30;
    const yf = 27;
    const c = x + w / 2;
    box(x, 16, 0, w, 11, h, C.wood);
    face(c - 0.4, c + 0.4, yf, 2, h - 2, C.woodDk);
    face(x + 1.4, x + w - 1.4, yf, 0, 1.6, C.woodDk);
    box(c - 3.2, yf, 13, 1.2, 0.7, 4, C.woodHi);
    box(c + 2, yf, 13, 1.2, 0.7, 4, C.woodHi);
    appeso(m, R.SV[m.s].h, yf + 0.3, (dy) => 0.75 * dy);
  }
  function bacheca(m) {
    const x = m.x;
    box(x + 2, 16.5, 0, 2, 2, 12, C.woodLo);
    box(x + 40, 16.5, 0, 2, 2, 12, C.woodLo);
    box(x, 16, 12, 44, 3, 28, C.wood);
    face(x + 2, x + 42, 19, 14, 38, C.woodDk);
    appeso(m, R.SV[m.s].h, 19.4, (dy) => dy + 5);
    B.bacheca = { x0: x, x1: x + 44, z0: 12, z1: 40, y: 19.2 };
  }
  /** Tre sbuffi che salgono, ognuno per due secondi. Fermi, con le animazioni ridotte. */
  function vapore(cx, cy, z, seme) {
    const P = [0, 1, 2].map(() => {
      const m = new THREE.Mesh(UBOX, new THREE.MeshBasicMaterial({ color: C.steam, transparent: true, depthWrite: false }));
      K.radice.add(m);
      return m;
    });
    const metti = (t) =>
      P.forEach((p, k) => {
        const u = (t / 2 + k / 3 + seme) % 1;
        p.position.set(cx + Math.sin(u * 7 + k) * 1.2, z + u * 9, cy + Math.cos(u * 5 + k) * 0.5);
        p.material.opacity = 0.7 * Math.sin(Math.PI * u) * (1 - u * 0.5);
        p.scale.setScalar(1.3 * (1 + u * 1.2));
      });
    metti(0.4);
    K.anima(metti);
  }
  function macchina(m) {
    const x = m.x;
    const y = 16;
    const w = 24;
    const d = 12;
    const h = 30;
    const yf = y + d;
    box(x, y, 0, w, d, 8, C.mach);
    box(x, y, 19, w, d, h - 19, C.mach);
    box(x, y, 8, w, 5, 11, C.machLo);
    box(x, y, 8, 3.5, d, 11, C.mach);
    box(x + 18, y, 8, 6, d, 11, C.mach);
    box(x + 5, y + 2, h, 14, 8, 5, C.machLo);
    face(x + 4, x + 17, yf, 21.5, 25, C.machHi);
    box(x + 8.5, y + 6.5, 8, 4.5, 4.5, 4, C.cream);
    box(x + 19.5, yf, 21.8, 2.6, 0.4, 2.8, C.spia, GLOW);
    if (S.aloni) {
      K.alone([x + 20.8, yf + 0.6, 23.2], [x + 20.8, yf + 0.6, 23.2], 6, C.spia, 0.6 * S.aloni);
      const l = new THREE.PointLight(C.spia, 14, 40, 1.3);
      l.position.set(x + 20, 23, yf + 5);
      K.radice.add(l);
    }
    vapore(x + 10.7, yf - 2.5, 12.5, 0);
    appeso(m, m.h, yf + 0.3, (dy) => 0.75 * dy);
  }
  function lavandino(m) {
    const x = m.x;
    const y = 16;
    const w = 18;
    const d = 11;
    const h = 15;
    const yf = y + d;
    box(x, y, 0, w, d, h, C.wood);
    face(x + w / 2 - 0.4, x + w / 2 + 0.4, yf, 2, h - 2.5, C.woodDk);
    box(x + 2.5, y + 3, h, w - 5, d - 5, 0.25, C.woodDk, THIN);
    box(x + w / 2 - 1, y + 0.6, h, 2, 2, 5, C.steel);
    box(x + w / 2 - 1, y + 2.6, h + 3.6, 2, 3, 1.4, C.steel);
    appeso(m, m.h, yf + 0.3, (dy) => 0.75 * dy);
  }

  // =====================================================================
  //  quello che sta in mezzo alle stanze
  // =====================================================================
  /** Il tavolo delle riunioni e quello del bar sono lo stesso mobile. */
  function tavolo(m) {
    const x = m.x;
    const y = m.b - 14;
    for (const [lx, ly] of [[x + 1.5, y + 1.5], [x + 44, y + 1.5], [x + 1.5, y + 10], [x + 44, y + 10]]) box(lx, ly, 0, 2.5, 2.5, 9, C.woodLo);
    box(x, y, 9, 48, 14, 2.2, C.woodTop);
    B.tavoli.push({ x, y, w: 48, d: 14 });
  }
  /* Lo sgabello. Nella stanza piatta sta a una spanna dal tavolo, e li' seduti le
     mani non arrivano al piano: qui lo si tira sotto fino a dove ci si lavora
     davvero. Chi ci si siede guarda il tavolo, e il portatile gli sta davanti. */
  function sgabello(m) {
    const cx = m.x + 7;
    const cy = m.b - 5;
    let v = null;
    for (const t of B.tavoli) {
      const px = clamp(cx, t.x, t.x + t.w);
      const py = clamp(cy, t.y, t.y + t.d);
      const d = Math.hypot(px - cx, py - cy);
      if (d > 0.01 && d < 30 && (!v || d < v.d)) v = { d, ux: (px - cx) / d, uy: (py - cy) / d };
    }
    const tira = v ? Math.max(0, v.d - 7.5) : 0;
    const x = cx + (v ? v.ux * tira : 0);
    const y = cy + (v ? v.uy * tira : 0);
    const a = v ? Math.atan2(v.ux, v.uy) : 0;
    cyl(x, y, 0, 1.8, SEDILE - 1.3, C.woodLo);
    cyl(x, y, SEDILE - 1.3, 5.2, 1.3, C.wood);
    // Il portatile: chiuso in un pezzo suo, e lo accende lo specchio quando nella
    // stanza piatta ce n'e' uno a quel posto.
    const lap = pezzo((q) => {
      q.box(-3.2, -2.5, 0, 6.4, 5, 0.6, C.bezel);
      // Lo schermo sta dalla parte lontana e guarda chi siede, appena reclinato.
      q.con(T(0, 2.5, 0.5).multiply(new THREE.Matrix4().makeRotationX(0.25)), () => {
        q.box(-3.2, -0.3, 0, 6.4, 0.6, 4.6, C.bezel);
        q.box(-2.7, -0.42, 0.5, 5.4, 0.12, 3.6, S.schermi.on[0], GLOW);
      });
    });
    lap.position.set(x + Math.sin(a) * 9.6, PIANO, y + Math.cos(a) * 9.6);
    lap.rotation.y = a;
    lap.visible = false;
    B.posti.push({ tipo: 'sgabello', p2: [cx, m.b], x, y, a, lap });
  }
  function cestino(m) {
    box(m.x + 1, m.b - 9, 0, 10, 8, 10, C.bezel);
    box(m.x + 2.3, m.b - 7.7, 10, 7.4, 5.4, 0.2, C.off, THIN);
    box(m.x + 4, m.b - 6.5, 10, 3.2, 3, 1.6, C.carta);
  }
  /** Sei piante e sei sagome, come nella stanza piatta: `quale` e' il suo posto nell'elenco. */
  const PIANTE = { vasoAloe: 'alta', vasoFiori: 'fiori', plantPurple: 'cespo', plantBlue: 'cespo', vasoFoglie: 'felce', vasoErba: 'alta' };
  function pianta(m, quale) {
    const d = R.SV[m.s];
    const cx = m.x + d.w / 2;
    const cy = m.b - 6;
    const tipo = PIANTE[m.s];
    cyl(cx, cy, 0, 4.6, 6, C.vasi[quale % C.vasi.length]);
    cyl(cx, cy, 6, 3.6, 0.2, C.soil, THIN);
    const r = (k, i) => rnd(m.s, k, i);
    const F = [];
    if (tipo === 'cespo') for (let i = 0; i < 10; i++) {
      const a = r('a', i) * TAU, q = r('r', i) * 4.2, s = 3 + r('s', i) * 2.6;
      F.push([cx + Math.cos(a) * q - s / 2, cy + Math.sin(a) * q - s / 2, 6.5 + r('z', i) * 9, s, s, i % 4]);
    }
    if (tipo === 'alta') for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU, q = i ? 2.6 : 0;
      F.push([cx + Math.cos(a) * q - 0.9, cy + Math.sin(a) * q - 0.9, 6, 1.8, i ? 7 + r('h', i) * 8 : 17, i % 4]);
    }
    if (tipo === 'felce') for (let i = 0; i < 12; i++) {
      const a = r('a', i) * TAU, q = 1.5 + r('r', i) * 5.5, s = 2.4 + r('s', i) * 1.6;
      F.push([cx + Math.cos(a) * q - s / 2, cy + Math.sin(a) * q - s / 2, 6.5 + (7 - q) * 0.9 * r('z', i), s, s * 0.7, i % 4]);
    }
    if (tipo === 'fiori') for (let i = 0; i < 8; i++) {
      const a = r('a', i) * TAU, q = r('r', i) * 3, s = 2.4 + r('s', i) * 1.6;
      F.push([cx + Math.cos(a) * q - s / 2, cy + Math.sin(a) * q - s / 2, 6.5 + r('z', i) * 8, s, s, i < 3 ? 9 : i % 3]);
    }
    for (const [x, y, z, s, h, gi] of F) box(x, y, z, s, s, h, gi === 9 ? C.fiore : C.verde[gi]);
  }
  /** La fontanella in mezzo all'atrio: l'unica cosa che si muove anche a stanza vuota. */
  function fontana(m) {
    const cx = m.x + 8;
    const cy = m.b - 6;
    const [lo, mid, hi] = C.acqua;
    cyl(cx, cy, 0, 5, 2, C.stone);
    cyl(cx, cy, 2, 2.6, 7, C.stoneLo);
    cyl(cx, cy, 9, 6.6, 3, C.stone);
    cyl(cx, cy, 12, 5.3, 0.25, lo, GLOW);
    cyl(cx, cy, 12.4, 0.9, 0.15, hi, GLOW);
    const disco = new THREE.CylinderGeometry(1, 1, 0.12, 14);
    const onde = [0, 1].map(() => {
      const o = new THREE.Mesh(disco, new THREE.MeshBasicMaterial({ color: mid, transparent: true, depthWrite: false }));
      o.position.set(cx, 12.32, cy);
      K.radice.add(o);
      return o;
    });
    const matGetto = new THREE.MeshBasicMaterial({ color: hi });
    const getto = [0, 1, 2].map(() => {
      const o = new THREE.Mesh(UBOX, matGetto);
      o.scale.setScalar(0.9);
      K.radice.add(o);
      return o;
    });
    let luce = null;
    if (S.aloni) {
      K.alone([cx, cy, 13], [cx, cy, 13], 13, mid, 0.42 * S.aloni);
      luce = new THREE.PointLight(mid, 30, 90, 1.3);
      luce.position.set(cx, 17, cy);
      K.radice.add(luce);
    }
    const metti = (t) => {
      onde.forEach((o, i) => {
        const u = (t * 1.5 + i / 2) % 1;
        const q = 1 + u * 4.2;
        o.scale.set(q, 1, q);
        o.material.opacity = 1 - u;
      });
      getto.forEach((o, i) => o.position.set(cx, 13.45 + i * 1.3 + (Math.floor(t * 6) % 3 === i ? 0.9 : 0), cy));
      if (luce) luce.intensity = 30 + 4 * Math.sin(TAU * t * 1.5);
    };
    metti(0.2);
    K.anima(metti);
  }

  // =====================================================================
  //  le scrivanie
  // =====================================================================
  function scrivania(i) {
    const d = R.DESKS[i];
    const y = d.b - 14;
    // La meta' destra e' lo specchio della sinistra: il capo «di fuori» e' quello
    // lontano dalla linea di mezzo, ed e' li' che sta il monitor.
    const mir = d.x + 24 > W / 2;
    const sx = mir ? -1 : 1;
    const ox = mir ? d.x + 48 : d.x;
    const n = [sx * Math.sin(PHI), Math.cos(PHI)];
    const mon = [ox + sx * MON[0], y + MON[1]];
    const seat = [mon[0] + n[0] * DISTANZA, mon[1] + n[1] * DISTANZA];
    const guarda = Math.atan2(-n[0], -n[1]);

    L.con(T(ox, y, 0, 0, mir), () => {
      box(1, 1, 0, 2.5, 12, 9, C.woodLo);
      box(32, 1.5, 0, 12.5, 11.5, 9, C.wood);
      for (const z of [3, 6]) face(32.6, 43.9, 13, z, z + 0.8, C.woodDk);
      box(44.5, 1, 0, 2.5, 12, 9, C.woodLo);
      box(0, 0, 9, 48, 14, 2.2, C.woodTop);
      L.con(T(MON[0], MON[1], 0, PHI), () => {
        // Il piede, il collo e la cornice; lo schermo e' un pezzo a parte, che cambia.
        box(-3.5, -2, PIANO, 7, 4, 0.5, C.monLo);
        box(-1.5, -1.4, PIANO + 0.5, 3, 1.6, 2.4, C.monLo);
        box(-9, -1, 13.8, 18, 2, 12, C.bezel);
        // La tastiera, fra lo schermo e chi lo guarda, girata come lui. Corta: di
        // sbieco su un piano profondo quattordici una tastiera intera sporge.
        box(-4.5, 3.7, PIANO, 9, 3, 0.5, C.woodDk);
      });
    });

    // --- lo schermo: spento, acceso, al lavoro. Tre pezzi, e se ne vede uno.
    const sch = new THREE.Group();
    sch.position.set(mon[0], 0, mon[1]);
    sch.rotation.y = sx * PHI;
    K.radice.add(sch);
    const a = -7.7;
    const b = 7.7;
    const z0 = 15.1;
    const z1 = 24.5;
    const yf = 1.02;
    const pannello = (P) =>
      pezzo((q) => {
        if (!P) return q.box(a, yf, z0, b - a, 0.1, z1 - z0, C.off, GLOW);
        q.box(a, yf, z0, b - a, 0.12, z1 - z0, P[0], GLOW);
        q.box(a, yf + 0.06, z1 - 2.2, b - a, 0.12, 2.2, P[1], GLOW);
        q.box(a, yf + 0.06, z0, b - a, 0.12, 2.6, P[2], GLOW);
      }, sch);
    const stati = { off: pannello(null), on: pannello(S.schermi.on), working: pannello(S.schermi.working) };
    // Chi scrive: tre righe che cambiano lunghezza quattro volte al secondo.
    const righe = [0, 1, 2].map((k) => {
      const r = new THREE.Mesh(UBOX, K.mat.rigaLavoro);
      const w = 2.3 + rnd('riga', i, k) * 10;
      r.scale.set(w, 0.85, 0.12);
      r.position.set(a + 1.2 + w / 2, z0 + 3.5 + k * 1.75, yf + 0.2);
      stati.working.add(r);
      return r;
    });
    // E chi aspetta: un cursore che lampeggia.
    const cursore = new THREE.Mesh(UBOX, K.mat.rigaAccesa);
    cursore.scale.set(1.9, 1.8, 0.12);
    cursore.position.set(a + 2.5, z0 + 4.5, yf + 0.2);
    stati.on.add(cursore);
    let luce = null;
    if (S.schermi.luce) {
      luce = new THREE.PointLight(S.schermi.on[0], 0, 85, 1.25);
      luce.position.set(0, 20, 7);
      sch.add(luce);
    }
    let alone = null;
    if (S.aloni) {
      alone = new THREE.Mesh(
        K.geoAlone,
        new THREE.MeshBasicMaterial({ map: K.trama, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      alone.scale.set(46, 34, 1);
      alone.quaternion.copy(K.vista.q);
      alone.position.set(mon[0] + n[0] * 2.5, 19.8, mon[1] + n[1] * 2.5);
      alone.renderOrder = 5;
      K.radice.add(alone);
    }
    let stato = '';
    const banco = {
      i,
      x: d.x,
      b: d.b,
      mir,
      mon,
      /** La targhetta sta sopra lo schermo solo se dietro non c'e' un'altra fila a cui finirebbe addosso. */
      sopra: !R.DESKS.some((o) => o.b < d.b - 1 && d.b - o.b < 90),
      /** La normale vera dello schermo, letta dal pezzo che c'e' e non dalla formula. */
      get normale() {
        return [Math.sin(sch.rotation.y), Math.cos(sch.rotation.y)];
      },
      /** `s`: 'off' | 'on' | 'working' — quello che dice la classe del monitor piatto. */
      accendi(s) {
        if (s === stato) return;
        stato = s;
        for (const k of Object.keys(stati)) stati[k].visible = k === s;
        const P = S.schermi[s];
        if (luce) {
          luce.intensity = P ? S.schermi.luce : 0;
          if (P) luce.color.set(P[0]);
        }
        if (alone) {
          alone.visible = !!P;
          if (P) alone.material.color.set(P[0]).multiplyScalar(0.34 * S.aloni);
        }
      },
    };
    banco.accendi('off');
    K.anima((t) => {
      if (stato === 'working') {
        righe.forEach((r, k) => {
          const w = 2.3 + rnd('riga', i, k, Math.floor(t * 4) % 8) * 10;
          r.scale.x = w;
          r.position.x = a + 1.2 + w / 2;
        });
      }
      cursore.visible = Math.floor(t * 2) % 2 === 1;
      if (luce && stato !== 'off') luce.intensity = S.schermi.luce * (1 + 0.18 * Math.sin(TAU * (t / 2 + i * 0.37)));
    });

    // --- la sedia: gira con chi ci sta seduto (lo specchio le dice di quanto).
    const sedia = pezzo((q) => {
      q.box(-3, -0.6, 0, 6, 1.2, 0.6, C.chairLo);
      q.box(-0.6, -3, 0, 1.2, 6, 0.6, C.chairLo);
      q.box(-1, -1, 0, 2, 2, SEDILE - 1.3, C.chairLo);
      q.box(-4.3, -4, SEDILE - 1.3, 8.6, 8, 1.3, C.chair);
      q.box(-4.3, -5.4, SEDILE, 8.6, 1.4, 7.6, C.chair);
    });
    sedia.position.set(seat[0], 0, seat[1]);
    sedia.rotation.y = guarda;
    const posto = { tipo: 'banco', i, p2: [d.x + 24, d.b + 16], x: seat[0], y: seat[1], a: guarda, sedia };
    banco.posto = posto;

    /* Il controllo, lasciato qui apposta: chi siede a questa scrivania guarda lo
       schermo, e gli sta davanti. Letto dai pezzi montati — l'angolo del posto, la
       rotazione vera dello schermo — e non dai numeri di qui sopra: e' cosi' che
       prende anche uno specchio sbagliato. Nella prima anteprima sedevano tutti dalla
       parte opposta, a fissare il retro del proprio monitor. */
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
  // I mobili gia' ridisegnati a tratto (mobili.js): quelli che fa lui, qui non si rifanno.
  const suoi = mobili(K, B);
  // I tavoli prima degli sgabelli, che gli si tirano sotto.
  for (const m of R.PROPS) if (m.s === 'meetTable' && !suoi.has(m.s)) tavolo(m);
  let piante = 0;
  B.fatti = new Set(suoi);
  for (const m of R.PROPS) {
    const fatto =
      suoi.has(m.s) ? 1
      : m.s === 'board' ? (bacheca(m), 1)
      : m.s === 'shelfFull' ? (scaffale(m, 'faldoni'), 1)
      : m.s === 'shelfJars' ? (scaffale(m, 'barattoli'), 1)
      : m.s === 'shelfEmpty' ? (scaffale(m, 'tazze'), 1)
      : m.s === 'cabinet' ? (armadio(m), 1)
      : m.s === 'meetTable' ? 1
      : m.s === 'stoolRound' ? (sgabello(m), 1)
      : PIANTE[m.s] ? (pianta(m, piante++), 1)
      : m.s.startsWith('fontana') ? (fontana(m), 1)
      : 0;
    // Un mobile che qui non si sa costruire resta quello piatto, in piedi al suo
    // posto: meglio un ritaglio fra i volumi che un buco nella stanza.
    if (fatto) B.fatti.add(m.s);
  }
  for (const m of R.DISEGNATI) {
    const fatto = suoi.has(m.s) ? 1 : m.s === 'cestino' ? (cestino(m), 1) : m.s === 'macchina' ? (macchina(m), 1) : m.s === 'lavandino' ? (lavandino(m), 1) : m.s === 'ghiaia' ? 1 : 0;
    if (fatto) B.fatti.add(m.s);
  }
  B.fatti.add('desk');
  R.DESKS.forEach((_, i) => scrivania(i));

  // Le buste: otto, quante ne tiene in aria la stanza piatta (MAX_BUSTE in room.js).
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(UBOX, new THREE.MeshBasicMaterial({ transparent: true }));
    m.scale.set(5.2, 3.6, 0.5);
    m.quaternion.copy(K.vista.q);
    m.visible = false;
    K.radice.add(m);
    B.buste.push(m);
  }

  // Verso cosa si gira chi si ferma in piedi li' accanto: le piante, il cestino.
  B.interessi = R.PROPS.filter((m) => PIANTE[m.s])
    .map((m) => [m.x + R.SV[m.s].w / 2, m.b - 6])
    .concat(R.DISEGNATI.filter((m) => m.s === 'cestino').map((m) => [m.x + 6, m.b - 5]));
  // E quale sgabello ha davanti quale portatile: la stanza piatta li mette per
  // coordinate (`lap`), e da quelle si risale al posto.
  B.portatili = new Map();
  for (const g of R.SGABELLI) {
    const q = B.posti.find((p) => p.lap && Math.abs(p.p2[0] - (g.x + 8)) < 1 && Math.abs(p.p2[1] - (g.y + 24)) < 1);
    if (q) B.portatili.set(g.lap[0] + ',' + g.lap[1], q);
  }

  if (S.extra) S.extra(K);
  return B;
}
