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

export { THREE };
