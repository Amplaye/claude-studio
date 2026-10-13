/* Claude Studio — l'ufficio in 3D: la cassetta degli attrezzi.
 *
 * Tutta la stanza e' fatta di scatole. Una scatola per `Mesh` sarebbero duemila
 * chiamate al disegno per fotogramma — e l'ombra le ridisegna tutte — quindi qui le
 * scatole si scrivono dentro un LOTTO: un mucchio di vertici col colore addosso, che
 * alla fine diventa una mesh sola per tipo di superficie. La stanza ferma sono
 * quattro chiamate, una persona una dozzina (un lotto per pezzo che si muove).
 *
 * Coordinate di pianta dappertutto, le stesse di room.js: x verso est, y verso sud
 * (verso chi guarda), z in alto, e un'unita' e' un pixel di stanza. three.js le
 * vuole (x, z, y): la conversione sta in `box` e in `T`, e in nessun altro posto.
 */
import * as THREE from 'three';
import { mergeVertices, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

export const TAU = Math.PI * 2;
export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const ease = (u) => {
  u = clamp(u);
  return u * u * (3 - 2 * u);
};
export const lerp = (a, b, u) => a + (b - a) * u;
/** Da un angolo all'altro per la strada corta. */
export const giro = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/* Il caso ripetibile: lo stesso mobile esce uguale a ogni rimontaggio, e la stanza
   si rimonta a ogni pixel di finestra tirato. Math.random qui dentro vorrebbe dire
   piante che cambiano foglie mentre allarghi la scheda. */
export function hash(...xs) {
  let h = 2166136261 >>> 0;
  for (const x of xs) {
    const s = String(x) + '|';
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return h >>> 0;
}
export const rnd = (...xs) => hash(...xs) / 4294967296;

/** Un colore CSS in rosso, verde e blu lineari: e' cosi' che li vuole un vertice. */
const tinte = new Map();
function rgb(c) {
  let v = tinte.get(c);
  if (!v) {
    const k = new THREE.Color(c);
    tinte.set(c, (v = [k.r, k.g, k.b]));
  }
  return v;
}

/**
 * Una trasformazione in coordinate di pianta: spostati di (x, y, z), gira di `ry`
 * attorno alla verticale (0 = guarda a sud, verso chi guarda), e con `specchio`
 * ribalta la x — e' cosi' che la meta' destra della stanza e' lo specchio della
 * sinistra senza scrivere due volte lo stesso mobile.
 */
export function T(x = 0, y = 0, z = 0, ry = 0, specchio = false) {
  const m = new THREE.Matrix4().makeTranslation(x, z, y);
  if (ry) m.multiply(new THREE.Matrix4().makeRotationY(ry));
  if (specchio) m.multiply(new THREE.Matrix4().makeScale(-1, 1, 1));
  return m;
}

// Le sei facce del cubo unitario: la normale e i quattro spigoli, in senso
// antiorario visti da fuori (coordinate di three: x, su, y di pianta).
const FACCE = [
  [[1, 0, 0], [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]]],
  [[-1, 0, 0], [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]]],
  [[0, 1, 0], [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]]],
  [[0, -1, 0], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]],
  [[0, 0, 1], [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]],
  [[0, 0, -1], [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]]],
];
const v3 = new THREE.Vector3();
const n3 = new THREE.Vector3();
const m3 = new THREE.Matrix3();

/**
 * Un lotto di scatole. Ogni scatola finisce in uno dei mucchi:
 *   lit   prende le luci e fa ombra (il default)
 *   thin  prende le luci ma non fa ombra: i dettagli appoggiati su una faccia
 *   glow  colore pieno, senza luci: schermi, spie, foglietti
 *   neon  come glow, ma col suo materiale: e' il filo che respira
 *   alone i bagliori: quadrati rivolti a chi guarda, sommati alla scena
 * `o` di una scatola: { k: 'glow' | 'thin' | 'neon' } per cambiare mucchio.
 */
export class Lotto {
  constructor() {
    this.b = {};
    this.m = new THREE.Matrix4();
    this.pila = [];
  }
  buf(k) {
    return this.b[k] || (this.b[k] = { p: [], n: [], c: [], u: [], i: [] });
  }
  /** Tutto quello che si disegna dentro `fn` passa per la trasformazione `m`. */
  con(m, fn) {
    this.pila.push(this.m);
    this.m = this.m.clone().multiply(m);
    fn();
    this.m = this.pila.pop();
  }
  /** Una faccia: quattro punti gia' in coordinate di three, in senso antiorario. */
  quad(k, pts, nor, c, uv) {
    const b = this.buf(k);
    const i0 = b.p.length / 3;
    const rov = this.m.determinant() < 0;
    m3.setFromMatrix4(this.m);
    n3.set(nor[0], nor[1], nor[2]).applyMatrix3(m3).normalize();
    for (let j = 0; j < 4; j++) {
      v3.set(pts[j][0], pts[j][1], pts[j][2]).applyMatrix4(this.m);
      b.p.push(v3.x, v3.y, v3.z);
      b.n.push(n3.x, n3.y, n3.z);
      b.c.push(c[0], c[1], c[2]);
      if (uv) b.u.push(uv[j][0], uv[j][1]);
    }
    // Uno specchio rovescia il verso delle facce: si rigira qui, una volta.
    if (rov) b.i.push(i0, i0 + 2, i0 + 1, i0, i0 + 3, i0 + 2);
    else b.i.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
  }
  /** Una scatola: spigolo dietro-sinistra-sotto in pianta, `w` lungo x, `d` lungo y, `h` in su. */
  box(x, y, z, w, d, h, c, o) {
    const k = (o && o.k) || 'lit';
    const col = rgb(c);
    for (const [nor, sp] of FACCE) {
      this.quad(k, sp.map((s) => [x + s[0] * w, z + s[1] * h, y + s[2] * d]), nor, col);
    }
  }
  /** Un cilindro in piedi: dodici lati bastano, a questa misura un tondo e' un dodecagono. */
  cyl(cx, cy, z, r, h, c, o) {
    const k = (o && o.k) || 'lit';
    const col = rgb(c);
    const N = 12;
    const P = (i, zz, q = r) => [cx + Math.cos((i / N) * TAU) * q, zz, cy + Math.sin((i / N) * TAU) * q];
    for (let i = 0; i < N; i++) {
      const a = ((i + 0.5) / N) * TAU;
      // Il verso: girando con l'angolo (x verso z di three) la faccia guarda fuori.
      this.quad(k, [P(i + 1, z), P(i, z), P(i, z + h), P(i + 1, z + h)], [Math.cos(a), 0, Math.sin(a)], col);
      this.quad(k, [P(i, z + h), P(i + 1, z + h), P(i + 1, z + h, 0), P(i, z + h, 0)].reverse(), [0, 1, 0], col);
    }
  }
  /** Un dettaglio steso su una faccia che guarda a sud (il piano y = yf), un pelo in fuori. */
  face(x0, x1, yf, z0, z1, c, o) {
    this.box(x0, yf - 0.05, z0, x1 - x0, 0.22, z1 - z0, c, { k: 'thin', ...o });
  }
  /**
   * Un bagliore: un quadrato che guarda la camera, col colore gia' moltiplicato per
   * quanto deve farsi vedere (si somma alla scena, quindi il nero non aggiunge niente).
   * `a` e `b` sono i due capi in coordinate di pianta [x, y, z]: uguali, e' un alone
   * tondo di raggio `r`; diversi, e' la scia di un filo.
   */
  alone(a, b, r, c, forza, vista) {
    const col = rgb(c).map((v) => v * forza);
    const A = new THREE.Vector3(a[0], a[2], a[1]).applyMatrix4(this.m);
    const B = new THREE.Vector3(b[0], b[2], b[1]).applyMatrix4(this.m);
    const lungo = B.clone().sub(A);
    const punto = lungo.lengthSq() < 1e-6;
    // I due assi del quadrato: di traverso al filo, e nel piano che guarda la camera.
    const su = punto ? vista.su.clone() : lungo.clone().cross(vista.avanti).normalize();
    const dx = punto ? vista.destra.clone().multiplyScalar(r) : new THREE.Vector3();
    su.multiplyScalar(r);
    const p = [
      A.clone().sub(dx).sub(su),
      B.clone().add(dx).sub(su),
      B.clone().add(dx).add(su),
      A.clone().sub(dx).add(su),
    ].map((q) => [q.x, q.y, q.z]);
    // La trama e' un alone tondo: per un filo se ne usa la sola colonna di mezzo.
    const uv = punto ? [[0, 0], [1, 0], [1, 1], [0, 1]] : [[0.5, 0], [0.5, 0], [0.5, 1], [0.5, 1]];
    // I punti sono gia' al loro posto: la faccia si scrive senza trasformarla due volte.
    const tieni = this.m;
    this.m = new THREE.Matrix4();
    this.quad('alone', p, [0, 0, 1], col, uv);
    this.m = tieni;
  }
  /** Chiude il lotto: una mesh per mucchio non vuoto, dentro un gruppo. */
  mesh(mat) {
    const g = new THREE.Group();
    for (const k of Object.keys(this.b)) {
      const b = this.b[k];
      if (!b.i.length || !mat[k]) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3));
      if (b.u.length) geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.u, 2));
      geo.setIndex(b.i);
      const m = new THREE.Mesh(geo, mat[k]);
      m.castShadow = k === 'lit';
      m.receiveShadow = k === 'lit' || k === 'thin';
      // I bagliori si sommano: l'ordine fra loro non conta, ma vanno dopo il resto.
      if (k === 'alone') m.renderOrder = 5;
      g.add(m);
    }
    return g;
  }
}

/** Una tela su cui dipingere una trama, gia' pronta per three. */
export function tela(w, h) {
  const cv = document.createElement('canvas');
  cv.width = Math.max(2, Math.round(w));
  cv.height = Math.max(2, Math.round(h));
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { cv, g: cv.getContext('2d'), tex };
}

/** L'alone tondo: bianco in mezzo, niente al bordo. Uno per tutti i bagliori. */
export function tramaAlone() {
  const { g, tex } = tela(64, 64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.42)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  tex.needsUpdate = true;
  return tex;
}

/**
 * I materiali di una scena. Pochi e condivisi: e' il colore sul vertice a fare la
 * differenza, non il materiale. Chi butta via la scena li butta con `via()`.
 */
export function materiali(alone) {
  const mat = {
    lit: new THREE.MeshLambertMaterial({ vertexColors: true }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    neon: new THREE.MeshBasicMaterial({ vertexColors: true }),
    alone: new THREE.MeshBasicMaterial({
      vertexColors: true,
      map: alone,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  };
  mat.thin = mat.lit;
  mat.toon = toon();
  return mat;
}

/** Butta via tutto quello che sta sotto `radice`: geometrie, materiali, trame. */
export function via(radice) {
  radice.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    for (const m of [].concat(o.material || [])) {
      if (m.map) m.map.dispose();
      m.dispose();
    }
  });
}

/* =====================================================================
 *  A TRATTO — lo stile illustrato
 * =====================================================================
 * La stanza nuova non e' fatta di scatole: forme tonde, tinte piatte a tre toni e
 * un contorno a inchiostro. Il contorno non e' una seconda mesh e non e' uno
 * shader: ogni pezzo entra nel lotto insieme al suo guscio — la stessa forma
 * saldata per posizione, gonfiata lungo le normali, rovesciata e dipinta
 * d'inchiostro col colore sul vertice. Una geometria, un materiale, una chiamata:
 * i mobili di tutta la stanza e il loro contorno sono una mesh sola.
 *
 * Qui si disegna in METRI e con gli assi di three (x a destra, y in alto, z verso
 * chi guarda), come nell'anteprima approvata: `qui()` da' una penna piantata in un
 * punto della pianta, e da li' in poi un metro vale U unita' di stanza. Le
 * scrivanie della stanza piatta sono a ottanta unita' l'una dall'altra: U = 30 ne
 * fa due metri e sessantasette, il passo dell'anteprima, e le sue proporzioni
 * tornano sulla pianta di room.js.
 *
 * Quello che sta sopra questa riga (Lotto, materiali) e' la cassetta delle scatole
 * di prima. Di scatole non ne disegna piu' nessuno: resta per i bagliori (`alone`),
 * che la stanza e i mobili accendono solo se una pelle chiede `aloni` — e oggi non
 * li chiede nessuna delle tre.
 * ponytail: se gli aloni non tornano, si tolgono Lotto, `K.box/cyl/face/alone` in
 * office3d.js e i rami `S.aloni` di props.js e mobili.js, tutti insieme.
 */
export const U = 30;
export const INK = '#3a2030';
/** Lo spessore del contorno, in metri. */
export const FILO = 0.016;
/** Le due quote che stanza, mobili, persone e animali devono avere uguali, in metri: dove ci si siede e dove si appoggia. */
export const SEDILE_M = 0.33;
export const PIANO_M = 0.54;
export const smooth = (a, b, x) => ease((x - a) / (b - a));
/** Sale dopo `a`, tiene, e' di nuovo a zero a `b`: un gesto che comincia e finisce. */
export const pulse = (t, a, b, bordo = 0.45) => smooth(a, a + bordo, t) * (1 - smooth(b - bordo, b, t));

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
/** Una matrice da posizione, rotazione e scala, negli assi di three. */
export function mtx(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
}

// ---- le forme, tenute per numeri: il guscio di ognuna si calcola una volta sola
const memo = new Map();
const tenuta = (chiave, fai) => {
  let g = memo.get(chiave);
  if (!g) memo.set(chiave, (g = fai()));
  return g;
};
const v2 = (pts) => pts.map((p) => new THREE.Vector2(Math.max(p[0], 0), p[1]));

/* Una scatola dagli spigoli smussati, fatta a mano: sei facce, dodici smussi, otto
   angoli — quarantaquattro triangoli, un quinto di RoundedBoxGeometry. Le normali
   sono quelle delle facce, e lungo lo smusso sfumano dall'una all'altra: sotto le
   tinte piatte lo spigolo si legge tondo. Va bene finche' il raggio e' di un paio di
   pixel, cioe' quasi sempre; piu' largo si vedrebbe la faccetta, e allora si chiede
   `seg` 2 e si prende quella tonda qui sotto. Di scatole nella stanza ce ne sono
   trecento, e ognuna si disegna tre volte: il corpo, il contorno e l'ombra. */
function scatola(w, h, d, r) {
  const m = [w / 2, h / 2, d / 2];
  r = Math.min(r, m[0], m[1], m[2]);
  const p = [];
  const n = [];
  const idx = [];
  // Per ogni angolo tre vertici, uno per ognuna delle facce che ci arrivano.
  const v = (asse, s) => ((s[0] > 0 ? 4 : 0) + (s[1] > 0 ? 2 : 0) + (s[2] > 0 ? 1 : 0)) * 3 + asse;
  for (let c = 0; c < 8; c++) {
    const s = [c & 4 ? 1 : -1, c & 2 ? 1 : -1, c & 1 ? 1 : -1];
    for (let a = 0; a < 3; a++) {
      for (let k = 0; k < 3; k++) {
        p.push(s[k] * (k === a ? m[k] : m[k] - r));
        n.push(k === a ? s[k] : 0);
      }
    }
  }
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  const C = new THREE.Vector3();
  // Il verso giusto si legge dalla forma: la faccia guarda via dal centro.
  const tri = (a, b, c) => {
    A.fromArray(p, a * 3);
    B.fromArray(p, b * 3).sub(A);
    C.fromArray(p, c * 3).sub(A);
    B.cross(C).dot(A) >= 0 ? idx.push(a, b, c) : idx.push(a, c, b);
  };
  const quad = (a, b, c, e) => (tri(a, b, c), tri(a, c, e));
  for (let a = 0; a < 3; a++) {
    const b = (a + 1) % 3;
    const c = (a + 2) % 3;
    for (const sa of [-1, 1]) {
      const s = (sb, sc) => {
        const q = [0, 0, 0];
        q[a] = sa;
        q[b] = sb;
        q[c] = sc;
        return q;
      };
      // la faccia, e i due smussi che la legano alle due facce dell'asse dopo
      quad(v(a, s(-1, -1)), v(a, s(1, -1)), v(a, s(1, 1)), v(a, s(-1, 1)));
      for (const sb of [-1, 1]) quad(v(a, s(sb, -1)), v(a, s(sb, 1)), v(b, s(sb, 1)), v(b, s(sb, -1)));
    }
  }
  for (let c = 0; c < 8; c++) tri(c * 3, c * 3 + 1, c * 3 + 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  g.setIndex(idx);
  return g;
}

/* E quella dagli spigoli tondi, a due faccette per quarto di giro: centootto
   triangoli, per i pezzi dove lo spigolo e' largo abbastanza da vedersi — uno
   schienale, il corpo della macchina del caffe', la cornice di uno schermo. */
function tonda(w, h, d, r) {
  const g = new THREE.BoxGeometry(1, 1, 1, 3, 3, 3).toNonIndexed();
  const P = g.attributes.position;
  const N = g.attributes.normal;
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  r = Math.min(r, w / 2, h / 2, d / 2);
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i);
    n.set(v.x - Math.sign(v.x) / 6, v.y - Math.sign(v.y) / 6, v.z - Math.sign(v.z) / 6).normalize();
    P.setXYZ(i, (w / 2 - r) * Math.sign(v.x) + n.x * r, (h / 2 - r) * Math.sign(v.y) + n.y * r, (d / 2 - r) * Math.sign(v.z) + n.z * r);
    N.setXYZ(i, n.x, n.y, n.z);
  }
  return g;
}

/** Le forme, in metri. Sono condivise e tenute in memoria: non si buttano e non si modificano. */
export const G = {
  box: (w, h, d, r = 0.03, seg = 1) => tenuta(`box${[w, h, d, r, seg]}`, () => (seg > 1 ? tonda(w, h, d, r) : scatola(w, h, d, r))),
  cube: (w, h, d) => tenuta(`cube${[w, h, d]}`, () => new THREE.BoxGeometry(w, h, d)),
  cyl: (r1, r2, h, n = 12) => tenuta(`cyl${[r1, r2, h, n]}`, () => new THREE.CylinderGeometry(r1, r2, h, n)),
  // Quanti spicchi: la sfera piu' grande della stanza e' una testa, trenta pixel a
  // misura vera, e con dodici lati il suo profilo sbaglia di mezzo pixel. Di piu' si pagano e non si vedono.
  sph: (r = 1, n = 12) => tenuta(`sph${[r, n]}`, () => new THREE.SphereGeometry(r, n, Math.max(5, Math.round(n * 0.6)))),
  cap: (r, len, n = 8) => tenuta(`cap${[r, len, n]}`, () => new THREE.CapsuleGeometry(r, len, 3, n)),
  // Un tubo sottile (un manico, una montatura) ha quattro lati: e' largo un pixel.
  torus: (R, r, arc = TAU, n = 12) => tenuta(`tor${[R, r, arc, n]}`, () => new THREE.TorusGeometry(R, r, r < 0.015 ? 4 : 6, n, arc)),
  /** Un profilo fatto girare attorno alla verticale. `crease`: tiene vivi gli spigoli invece di arrotondarli. */
  lathe: (pts, n = 12, crease = 0) =>
    tenuta(`lat${pts}|${n}|${crease}`, () => {
      const g = new THREE.LatheGeometry(v2(pts), n);
      return crease ? toCreasedNormals(g, crease) : g;
    }),
  /** Una lastra tonda con un filo di smusso, la base a y = 0. */
  disc: (r, h, b = 0.015, n = 14) => G.lathe([[0, 0], [r - b, 0], [r, b], [r, h - b], [r - b, h], [0, h]], n, 0.6),
  /** Un rettangolo dagli angoli tondi visto da sopra, estruso: piani di scrivania, panche. La base a y = 0. */
  slab: (w, d, h, r = 0.08, b = 0.012) =>
    tenuta(`slab${[w, d, h, r, b]}`, () => {
      const s = new THREE.Shape();
      const x = w / 2 - b;
      const z = d / 2 - b;
      const q = Math.max(0.002, r - b);
      s.moveTo(-x + q, -z);
      s.lineTo(x - q, -z);
      s.absarc(x - q, -z + q, q, -Math.PI / 2, 0);
      s.lineTo(x, z - q);
      s.absarc(x - q, z - q, q, 0, Math.PI / 2);
      s.lineTo(-x + q, z);
      s.absarc(-x + q, z - q, q, Math.PI / 2, Math.PI);
      s.lineTo(-x, -z + q);
      s.absarc(-x + q, -z + q, q, Math.PI, Math.PI * 1.5);
      // Tre tratti per angolo e uno per lo smusso: l'angolo di un piano e' sei pixel, lo smusso uno.
      const g = new THREE.ExtrudeGeometry(s, { depth: h - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 1, curveSegments: 3 });
      g.rotateX(-Math.PI / 2);
      g.translate(0, b, 0);
      return toCreasedNormals(g, 0.7);
    }),
};

// ---- il guscio di una forma: saldata per posizione, cosi' le normali sono lisce e gli angoli chiusi
const gusci = new WeakMap();
function guscioDi(g) {
  let h = gusci.get(g);
  if (!h) {
    const s = new THREE.BufferGeometry();
    s.setAttribute('position', g.attributes.position);
    if (g.index) s.setIndex(g.index);
    h = mergeVertices(s, 1e-4);
    h.computeVertexNormals();
    gusci.set(g, h);
  }
  return h;
}

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();
const _c = new THREE.Color();

/**
 * Un lotto a tratto: i pezzi e i loro gusci d'inchiostro, fusi in una geometria.
 * `scala` e' quante unita' vale un metro nello spazio in cui il lotto finisce: U per
 * quello che si scrive nella stanza, 1 (il default) per un pezzo che sta dentro un
 * gruppo gia' scalato — una persona, un'anta. Lo spessore del contorno si da'
 * sempre in metri.
 */
export class Tratto {
  constructor(scala = 1) {
    this.scala = scala;
    this.p = [];
    this.n = [];
    this.c = [];
    this.i = [];
    this.ih = [];
  }
  get vuoto() {
    return !this.i.length;
  }
  /** `filo`: lo spessore del contorno in metri, 0 per non averlo. */
  add(g, m, colore, filo = FILO, ink = INK) {
    const rov = m.determinant() < 0;
    _nm.getNormalMatrix(m);
    this.put(g, m, colore, 0, rov);
    if (filo > 0) this.put(guscioDi(g), m, ink, filo * this.scala, !rov);
    return this;
  }
  put(g, m, colore, gonfia, rov) {
    const base = this.p.length / 3;
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    const idx = g.index;
    const sgn = gonfia ? -1 : 1;
    _c.set(colore);
    for (let k = 0; k < pos.count; k++) {
      _v.fromBufferAttribute(pos, k).applyMatrix4(m);
      _n.fromBufferAttribute(nor, k).applyMatrix3(_nm).normalize();
      this.p.push(_v.x + _n.x * gonfia, _v.y + _n.y * gonfia, _v.z + _n.z * gonfia);
      this.n.push(_n.x * sgn, _n.y * sgn, _n.z * sgn);
      this.c.push(_c.r, _c.g, _c.b);
    }
    const cnt = idx ? idx.count : pos.count;
    const out = gonfia ? this.ih : this.i;
    for (let k = 0; k < cnt; k += 3) {
      const a = base + (idx ? idx.getX(k) : k);
      const b = base + (idx ? idx.getX(k + 1) : k + 1);
      const c = base + (idx ? idx.getX(k + 2) : k + 2);
      if (rov) out.push(a, c, b);
      else out.push(a, b, c);
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    // Prima i corpi, poi i gusci: il giro delle ombre disegna solo la prima parte.
    g.setIndex(this.i.concat(this.ih));
    g.userData.corpo = this.i.length;
    return g;
  }
  mesh(materiale, ombra = true) {
    return senzaFilo(new THREE.Mesh(this.geometry(), materiale), ombra);
  }
}

/** Un contorno non fa ombra: mentre si disegna la mappa delle ombre la mesh si ferma ai corpi. */
export function senzaFilo(m, ombra = true) {
  const g = m.geometry;
  m.castShadow = ombra;
  m.receiveShadow = true;
  m.onBeforeShadow = () => g.setDrawRange(0, g.userData.corpo);
  m.onAfterShadow = () => g.setDrawRange(0, Infinity);
  return m;
}

/**
 * Una penna che disegna in un lotto a partire da un posto. Scatole, lastre, dischi
 * e cilindri si danno per la base (stanno appoggiati sulle cose); sfere e forme
 * libere per il centro. Le opzioni `o`: { rx, ry, rz, s: [x, y, z], filo, ink, r, seg, n }.
 */
export function penna(L, m0 = new THREE.Matrix4()) {
  const put = (g, c, x, y, z, o = {}) => {
    const s = o.s || [1, 1, 1];
    L.add(g, m0.clone().multiply(mtx(x, y, z, o.rx || 0, o.ry || 0, o.rz || 0, s[0], s[1], s[2])), c, o.filo == null ? FILO : o.filo, o.ink || INK);
  };
  return {
    L,
    m: m0,
    put,
    box: (w, h, d, x, y, z, c, o = {}) => put(G.box(w, h, d, o.r == null ? 0.03 : o.r, o.seg || ((o.r || 0) > 0.045 ? 2 : 1)), c, x, y + h / 2, z, o),
    cube: (w, h, d, x, y, z, c, o = {}) => put(G.cube(w, h, d), c, x, y + h / 2, z, o),
    slab: (w, d, h, x, y, z, c, o = {}) => put(G.slab(w, d, h, o.r == null ? 0.08 : o.r, o.b || 0.012), c, x, y, z, o),
    disc: (r, h, x, y, z, c, o = {}) => put(G.disc(r, h, o.b || 0.015, o.n || 14), c, x, y, z, o),
    cyl: (r1, r2, h, x, y, z, c, o = {}) => put(G.cyl(r1, r2, h, o.n || 12), c, x, y + h / 2, z, o),
    sph: (r, x, y, z, c, o = {}) => put(G.sph(1, o.n || 12), c, x, y, z, { ...o, s: (o.s || [1, 1, 1]).map((k) => k * r) }),
    cap: (r, len, x, y, z, c, o = {}) => put(G.cap(r, len, o.n || 8), c, x, y, z, o),
    lathe: (pts, x, y, z, c, o = {}) => put(G.lathe(pts, o.n || 12, o.crease || 0), c, x, y, z, o),
    /** Un'altra penna, spostata e girata rispetto a questa. */
    at: (x, y, z, ry = 0, rx = 0) => penna(L, m0.clone().multiply(mtx(x, y, z, rx, ry, 0))),
  };
}

/**
 * Una penna piantata in un punto della PIANTA (x verso est, y verso sud, `z` in
 * alto, in unita' di stanza), girata di `ry` attorno alla verticale (0 = guarda a
 * sud, verso chi guarda). Da li' in poi si disegna in metri. `specchio` ribalta la
 * x: la meta' destra della stanza e' lo specchio della sinistra.
 */
export function qui(L, x, y, ry = 0, z = 0, specchio = false) {
  return penna(L, mtx(x, z, y, 0, ry, 0, specchio ? -U : U, U, U));
}

/**
 * Un pezzo che si muove: un gruppo scalato a metri con dentro il suo lotto. Chi lo
 * riceve gli da' `position` (in unita' di stanza, assi di three: x, z, y di pianta)
 * e `rotation.y`. `fn` riceve una penna con l'origine nel perno del pezzo.
 */
export function parte(materiale, fn, ombra = true) {
  const L = new Tratto();
  fn(penna(L));
  const g = new THREE.Group();
  if (!L.vuoto) g.add(L.mesh(materiale, ombra));
  g.scale.setScalar(U);
  return g;
}

/* La tazza del bar. E' una sola forma, perche' e' una sola tazza: quella che sta
   sulla rastrelliera e' quella che uno si ritrova in mano, che posa sulla scrivania
   e che poi finisce nel lavandino. Il manico verso +x; `dentro` e' quello che ci si
   vede guardandola da sopra, `segno` il bordo di caffe' di quella da lavare. Chi la
   mette in scena la ingrandisce di TAZZA: a questa distanza una tazza vera e' sei pixel. */
export const TAZZA = 1.2;
const COCCIO = [[0, 0], [0.034, 0], [0.043, 0.012], [0.046, 0.09], [0, 0.09]];
export function tazza(p, c, dentro, segno) {
  p.lathe(COCCIO, 0, 0, 0, c, { n: 10, filo: 0.008 });
  p.put(G.torus(0.024, 0.008, TAU, 8), c, 0.05, 0.048, 0, { filo: 0.006 });
  p.cyl(0.037, 0.037, 0.004, 0, 0.088, 0, dentro, { filo: 0, n: 10 });
  if (segno) p.cyl(0.0468, 0.0462, 0.014, 0, 0.066, 0, segno, { filo: 0, n: 10 });
}

// ---- le tinte piatte: tre toni. Sotto il primo gradino la luce chiave non da'
//      niente, quindi l'ombra propria e l'ombra portata sono la stessa tinta.
let scalino = null;
function gradino() {
  if (scalino) return scalino;
  const n = 64;
  const d = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const x = ((i + 0.5) / n) * 2 - 1;
    const v = 0.6 * smooth(0.03, 0.09, x) + 0.4 * smooth(0.6, 0.66, x);
    d.set([v * 255, v * 255, v * 255, 255], i * 4);
  }
  scalino = new THREE.DataTexture(d, n, 1);
  scalino.minFilter = scalino.magFilter = THREE.LinearFilter;
  scalino.needsUpdate = true;
  return scalino;
}
/** Il materiale a tinte piatte, col colore sul vertice. La scala dei toni e' di tutti: non si butta. */
export const toon = (o = {}) => new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradino(), ...o });

export { THREE };
