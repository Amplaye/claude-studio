/* Claude Studio — l'ufficio in 3D: la scena, la camera, e come si accende.
 *
 * Lo stesso ufficio, visto di fronte e dal basso: una camera a trenta gradi, che e'
 * l'angolo approvato. Non e' una pelle in piu' e non e' una seconda stanza: la
 * pianta, la gente e le scene restano quelle di room.js e office.js, montate e vive
 * sotto questa tela, e lo specchio (mirror.js) le riporta qui a ogni fotogramma.
 *
 * Questo file arriva nella pagina solo quando qualcuno accende il 3D: three.js
 * pesa, e chi guarda la stanza piatta non lo paga. Lo monta `build.mjs` insieme
 * agli altri di questa cartella in `dist/webview/office3d.js`, ed espone
 * `window.OFFICE3D`; a chiamarlo e' office.js.
 *
 * Tre cose che qui dentro contano piu' del disegno:
 *   - a trenta gradi una stanza si schiaccia in una striscia. La si fa stare nella
 *     scheda con un muro di fondo alto (e' una vetrata: la citta', il mare), con una
 *     lente lunga — quasi senza prospettiva, niente occhio di pesce — e chiedendo
 *     alla stanza di crescere in profondita' con una misura sua: vedi misura();
 *   - non si consuma batteria: si disegna solo mentre l'ufficio si vede, a trenta
 *     fotogrammi al secondo, e con le animazioni ridotte quello che si muove da solo
 *     (il neon, gli schermi, l'acqua) sta fermo — la gente no, che e' il punto;
 *   - se qualcosa si rompe — niente WebGL, il contesto perso per sempre, un errore
 *     a meta' fotogramma — si spegne tutto e si avverte chi ha acceso: la stanza
 *     piatta e' ancora li' sotto, e una stanza vuota non la vede nessuno.
 */
import { THREE, Lotto, Tratto, U, qui, parte, tela, tramaAlone, materiali, via } from './kit.js';
import { costruisci, WL } from './props.js';
import { specchio } from './mirror.js';
import { animali } from './pets.js';
import classico from './skins/classico.js';
import notte from './skins/notte.js';
import bali from './skins/bali.js';

const PELLI = { classico, notte, bali };

/** Quanto guarda in giu' la camera, e quanto e' lunga la lente (gradi in verticale). */
const INCLINA = (30 * Math.PI) / 180;
const LENTE = 10;
const SIN = Math.sin(INCLINA);
const COS = Math.cos(INCLINA);
const FPS = 30;
/** L'aria attorno alla stanza: la frazione della scheda che le tocca. */
const ARIA = 0.955;
/** Il bordo davanti e' il piu' vicino alla camera, e con questa lente viene largo cosi' tanto di piu'. */
const DAVANTI = 1.07;
/** Fra quanto e quanto puo' essere alto il muro di fondo, e di quanto puo' allungarsi il salone. */
const MURO = [84, 128];
const FONDO = [32, 104];

/** La scena accesa, o null. */
let M = null;

/**
 * Quanto deve crescere la stanza per riempire una scheda `largo` x `alto`, vista da
 * qui: la misura da dare a `ROOM.cresci`, l'altezza del muro di fondo, e quanti
 * pixel vale un'unita' di stanza (l'ingrandimento del palco).
 *
 * Non e' il conto della stanza piatta, dove un pixel di pavimento e' un pixel di
 * scheda. Qui la profondita' vale meta' (il seno di trenta gradi) e l'altezza quasi
 * tutta: una scheda quadrata si riempie alzando il muro di fondo e allungando il
 * salone, una larga allargando il corridoio come sempre. Il salone parte gia'
 * allungato di trentadue: e' il posto delle targhette della fila davanti, che qui
 * stanno per terra ai piedi di chi siede.
 */
function misura(largo, alto) {
  const R = window.ROOM;
  const vista = (h, wh) => (h - 16) * SIN + (wh + 9) * COS;
  let k = (largo * ARIA) / ((R.W0 - 16) * DAVANTI);
  let w = R.W0;
  let h = R.H0 + FONDO[0];
  let wh = MURO[0];
  const ci_sta = (alto * ARIA) / k;
  const base = vista(h, wh);
  if (ci_sta <= base) {
    // Scheda larga: comanda l'altezza, e quello che avanza va al corridoio.
    k = (alto * ARIA) / base;
    w = Math.max(R.W0, (largo * ARIA) / (k * DAVANTI) + 16);
  } else {
    // Scheda alta: meta' di quello che avanza al muro, il resto al salone.
    const avanza = ci_sta - base;
    const alMuro = Math.min(avanza * 0.5, (MURO[1] - MURO[0]) * COS);
    wh += alMuro / COS;
    h += Math.min(avanza - alMuro, (FONDO[1] - FONDO[0]) * SIN) / SIN;
  }
  return { w, h, wh: Math.round(wh), k };
}

const pelleDi = (stage) => PELLI[stage.dataset.skin] || classico;
const firma = () => window.ROOM.W + 'x' + window.ROOM.H + 'x' + misura(M.largo, M.alto).wh + ':' + pelleDi(M.stage).nome;

/** La stanza si (ri)monta: a ogni cambio di pelle e a ogni cambio di misura. */
function monta() {
  const R = window.ROOM;
  const S = pelleDi(M.stage);
  if (M.radice) {
    M.scena.remove(M.radice);
    via(M.radice);
    for (const k of Object.keys(M.mat)) M.mat[k].dispose();
    if (M.scena.background) M.scena.background.dispose();
  }
  M.S = S;
  M.firma = firma();
  M.montato = performance.now();
  M.animazioni = [];
  M.radice = new THREE.Group();
  M.scena.add(M.radice);
  M.mat = materiali(M.trama);
  M.mat.rigaLavoro = new THREE.MeshBasicMaterial({ color: S.schermi.working[1] });
  M.mat.rigaAccesa = new THREE.MeshBasicMaterial({ color: S.schermi.on[1] });
  // La pianta com'e' adesso. I getter di ROOM danno ogni volta la tavola fresca:
  // se ne prende una copia sola, e la stanza si monta tutta sugli stessi numeri.
  M.R = {
    W: R.W,
    H: R.H,
    WH: misura(M.largo, M.alto).wh,
    MEZZO: 8 * R.TILE,
    WALLS: R.WALLS,
    VANO: R.VANO,
    PROPS: R.PROPS,
    DISEGNATI: R.DISEGNATI,
    DESKS: R.DESKS,
    SGABELLI: R.SGABELLI,
    SV: R.SV,
  };
  const L = new Lotto();
  // Il lotto a tratto della stanza ferma, e le penne per scriverci (kit.js, «A TRATTO»).
  const tratto = new Tratto(U);
  const K = {
    THREE,
    L,
    tratto,
    toon: M.mat.toon,
    qui: (x, y, ry, z, sp) => qui(tratto, x, y, ry, z, sp),
    parte: (fn, ombra) => parte(M.mat.toon, fn, ombra),
    C: S.C,
    S,
    R: M.R,
    mat: M.mat,
    vista: M.vista,
    radice: M.radice,
    scena: M.scena,
    trama: M.trama,
    geoAlone: M.geoAlone,
    tela,
    box: (...a) => L.box(...a),
    cyl: (...a) => L.cyl(...a),
    face: (...a) => L.face(...a),
    alone: (a, b, r, c, forza) => L.alone(a, b, r, c, forza, M.vista),
    anima: (fn) => M.animazioni.push(fn),
    /** Una trama stesa per terra. `somma`: si aggiunge alla luce che c'e' (una pozza); se no e' una cosa che prende le ombre (un tappeto). */
    decalco(tex, x, y, w, d, z, o = {}) {
      const mat = o.somma
        ? new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: o.forza == null ? 1 : o.forza, blending: THREE.AdditiveBlending, depthWrite: false })
        : new THREE.MeshLambertMaterial({ map: tex, transparent: !!o.trasparente });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x + w / 2, z, y + d / 2);
      m.receiveShadow = !o.somma;
      M.radice.add(m);
      return m;
    },
  };
  M.B = costruisci(K);
  M.radice.add(L.mesh(M.mat));
  if (!tratto.vuoto) M.radice.add(tratto.mesh(M.mat.toon));

  // --- le luci: una chiave che fa le ombre, un riempimento di fronte perche' le
  //     facce si leggano, e l'ambiente. Il resto lo fanno gli schermi (props.js).
  const { W, H } = M.R;
  const lu = S.luci;
  M.radice.add(new THREE.AmbientLight(lu.ambiente[0], lu.ambiente[1] * Math.PI));
  const chiave = new THREE.DirectionalLight(lu.chiave[0], lu.chiave[1] * Math.PI);
  const [dx, dy, dz] = lu.chiave[2];
  chiave.position.set(W / 2 + dx, dz, H / 2 + dy);
  chiave.target.position.set(W / 2, 0, H / 2);
  chiave.castShadow = true;
  chiave.shadow.mapSize.set(2048, 2048);
  chiave.shadow.radius = 3;
  chiave.shadow.bias = -0.0004;
  chiave.shadow.normalBias = 0.25;
  const raggio = Math.hypot(W, H) / 2 + 30;
  Object.assign(chiave.shadow.camera, { left: -raggio, right: raggio, top: raggio, bottom: -raggio, near: 40, far: 1100 });
  const riempi = new THREE.DirectionalLight(lu.riempi[0], lu.riempi[1] * Math.PI);
  riempi.position.set(W / 2, 180, H / 2 + 300);
  riempi.target.position.set(W / 2, 0, H / 2);
  M.radice.add(chiave, chiave.target, riempi, riempi.target);

  const f = tela(512, 512);
  S.sfondo(f.g, 512, 512);
  f.tex.needsUpdate = true;
  M.scena.background = f.tex;

  M.specchio.segna();
  M.animali.stanza();
  inquadra();
}

/**
 * La camera: di fronte alla stanza, alzata, che guarda in giu' di trenta gradi. La
 * distanza e l'altezza si cercano finche' tutta la stanza — il muro di fondo in
 * cima, il cordolo in fondo — sta nel quadro con la stessa aria sui lati che
 * stringono, e in mezzo in verticale.
 */
function inquadra() {
  const { W, H, WH } = M.R;
  const c = M.camera;
  const V = M.vista;
  c.aspect = M.largo / M.alto;
  c.updateProjectionMatrix();
  const P = [
    [8, 8, WH + 2],
    [W - 8, 8, WH + 2],
    [8, H - 8, WL + 2],
    [W - 8, H - 8, WL + 2],
    [8, H - 8, -7],
    [W - 8, H - 8, -7],
  ].map(([x, y, z]) => new THREE.Vector3(x, z, y));
  const centro = new THREE.Vector3(W / 2, 0, H / 2);
  const q = new THREE.Vector3();
  const metti = (dist, alza) => {
    c.position.copy(centro).addScaledVector(V.avanti, -dist).addScaledVector(V.su, alza);
    c.quaternion.copy(V.q);
    c.updateMatrixWorld(true);
  };
  const ingombro = () => {
    let x = 0;
    let lo = 9;
    let hi = -9;
    for (const p of P) {
      q.copy(p).project(c);
      x = Math.max(x, Math.abs(q.x));
      lo = Math.min(lo, q.y);
      hi = Math.max(hi, q.y);
    }
    return { x, lo, hi };
  };
  const centra = (dist) => {
    let a = -900;
    let b = 900;
    for (let i = 0; i < 34; i++) {
      const m = (a + b) / 2;
      metti(dist, m);
      const e = ingombro();
      if (e.hi + e.lo > 0) a = m;
      else b = m;
    }
    return ingombro();
  };
  let a = 300;
  let b = 30000;
  for (let i = 0; i < 34; i++) {
    const m = (a + b) / 2;
    const e = centra(m);
    if (Math.max(e.x, e.hi) > ARIA) a = m;
    else b = m;
  }
  const e = centra(b);
  const fuori = Math.hypot(W, H) / 2 + WH + 120;
  c.near = Math.max(20, b - fuori);
  c.far = b + fuori;
  c.updateProjectionMatrix();
  c.updateMatrixWorld(true);
  M.ingombro = e;
}

/** La tela segue la scheda. Torna true se la misura e' cambiata. */
function adatta() {
  const largo = M.wrap.clientWidth;
  const alto = M.wrap.clientHeight;
  if (largo === M.largo && alto === M.alto) return false;
  M.largo = largo;
  M.alto = alto;
  // Uno e mezzo al massimo: su uno schermo denso il doppio dei pixel e' il doppio
  // del lavoro per fotogramma, e a blocchi la differenza non si vede.
  M.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  M.renderer.setSize(largo, alto, false);
  if (M.R) inquadra();
  return true;
}

/** Si vede? Pagina in primo piano, e l'ufficio davanti (dietro la chat non ha misura). */
const siVede = () => !document.hidden && M.wrap.clientWidth > 2 && M.wrap.clientHeight > 2;

function fotogramma(ora) {
  if (!M) return;
  M.raf = requestAnimationFrame(fotogramma);
  if (ora - M.ultimo < 1000 / FPS - 4) return;
  const dt = Math.min(0.1, Math.max(0.001, (ora - M.ultimo) / 1000));
  M.ultimo = ora;
  if (!siVede() || M.perso) {
    // Niente da disegnare: ci si ferma del tutto, e a risvegliare e' `sveglia`.
    cancelAnimationFrame(M.raf);
    M.raf = 0;
    return;
  }
  const prima = performance.now();
  try {
    adatta();
    // La stanza cambia misura a ogni pixel di finestra tirato: si rimonta al
    // massimo otto volte al secondo, e fra una e l'altra si disegna quella di prima.
    if (firma() !== M.firma && ora - M.montato > 120) monta();
    const t = ora / 1000;
    if (!M.calmo) {
      for (const f of M.animazioni) f(t);
      const g = Math.floor(t);
      if (g !== M.giroVetri) {
        M.giroVetri = g;
        for (const v of M.B.vetri) if (v.vivo(g)) v.tex.needsUpdate = true;
      }
    }
    M.specchio.giro(t, dt);
    M.animali.giro(t, dt);
    M.renderer.render(M.scena, M.camera);
  } catch (e) {
    rompi(e);
    return;
  }
  M.quadri++;
  M.ms += (performance.now() - prima - M.ms) * 0.1;
}

function sveglia() {
  if (!M || M.raf || M.perso || !siVede()) return;
  M.ultimo = performance.now() - 1000 / FPS;
  M.raf = requestAnimationFrame(fotogramma);
}

/** Qualcosa e' andato storto: si spegne tutto e lo si dice a chi aveva acceso. */
function rompi(e) {
  console.warn('[ufficio 3D] spento: ' + (e && e.message ? e.message : e));
  const avvisa = M && M.rotto;
  spegni();
  if (avvisa) avvisa();
}

function spegni() {
  if (!M) return;
  const m = M;
  M = null;
  cancelAnimationFrame(m.raf);
  clearTimeout(m.attesa);
  m.guardie.forEach((f) => f());
  if (m.animali) m.animali.via();
  if (m.specchio) m.specchio.smonta();
  try {
    via(m.scena);
    if (m.scena.background) m.scena.background.dispose();
    m.trama.dispose();
    m.renderer.dispose();
    // Il contesto si restituisce subito: il browser ne tiene pochi, e uno lasciato
    // appeso a una tela staccata e' uno in meno per la prossima accensione.
    m.renderer.forceContextLoss();
  } catch {
    /* si stava gia' rompendo: non c'e' altro da buttare */
  }
  m.tela.remove();
}

/**
 * Accende la scena dentro `wrap`, sotto il palco `stage`. `rotto` viene chiamata se
 * poi si rompe e si spegne da sola. Lancia se non riesce ad accendersi.
 */
function accendi({ wrap, stage, rotto }) {
  if (M) return;
  const cv = document.createElement('canvas');
  cv.className = 'of-tre';
  cv.setAttribute('aria-hidden', 'true');
  wrap.prepend(cv);
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'low-power' });
  } catch (e) {
    cv.remove();
    throw e;
  }
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  // Da che parte guarda la camera non cambia mai: serve anche ai bagliori, che sono
  // quadrati rivolti a chi guarda e si possono scrivere una volta sola.
  const avanti = new THREE.Vector3(0, -SIN, -COS);
  const su = new THREE.Vector3(0, COS, -SIN);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), avanti, new THREE.Vector3(0, 1, 0)));
  const calmo = window.matchMedia('(prefers-reduced-motion: reduce)');

  M = {
    wrap,
    stage,
    rotto,
    tela: cv,
    renderer,
    scena: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(LENTE, 1, 50, 9000),
    gente: new THREE.Group(),
    vista: { avanti, su, destra: new THREE.Vector3(1, 0, 0), q },
    trama: tramaAlone(),
    geoAlone: new THREE.PlaneGeometry(1, 1),
    calmo: calmo.matches,
    animazioni: [],
    guardie: [],
    largo: 0,
    alto: 0,
    ultimo: 0,
    quadri: 0,
    ms: 0,
    raf: 0,
  };
  M.scena.add(M.gente);
  try {
    M.specchio = specchio(M);
    M.animali = animali(M);
    adatta();
    monta();
  } catch (e) {
    spegni();
    throw e;
  }

  // --- quando svegliarsi, e quando no
  const ascolta = (su, cosa, fn) => {
    su.addEventListener(cosa, fn);
    M.guardie.push(() => su.removeEventListener(cosa, fn));
  };
  ascolta(document, 'visibilitychange', sveglia);
  ascolta(calmo, 'change', () => M && (M.calmo = calmo.matches));
  // Il contesto perso: di solito torna da solo (la scheda grafica si e' ripresa), e
  // allora si rimonta tutto. Se dopo quattro secondi non e' tornato, e' perso per sempre.
  ascolta(cv, 'webglcontextlost', (e) => {
    e.preventDefault();
    if (!M) return;
    M.perso = true;
    M.attesa = setTimeout(() => rompi('il contesto WebGL non e’ tornato'), 4000);
  });
  ascolta(cv, 'webglcontextrestored', () => {
    if (!M) return;
    clearTimeout(M.attesa);
    M.perso = false;
    try {
      monta();
    } catch (e) {
      return rompi(e);
    }
    sveglia();
  });
  const ro = new ResizeObserver(sveglia);
  ro.observe(wrap);
  // Un nodo appena nato nel palco — un foglietto, una tazza — va messo al suo posto
  // prima che lo si veda: aspettare il fotogramma dopo vuol dire vederlo lampeggiare
  // dove stava nella stanza piatta.
  const mo = new MutationObserver(() => {
    if (M && M.B && siVede()) M.specchio.sistema();
  });
  mo.observe(stage, { childList: true, subtree: true });
  M.guardie.push(() => ro.disconnect(), () => mo.disconnect());
  sveglia();
}

window.OFFICE3D = {
  misura,
  accendi,
  spegni,
  sveglia,
  get acceso() {
    return !!M;
  },
  /**
   * Il controllo delle scrivanie: per ognuna, quanto chi siede guarda lo schermo
   * (il prodotto fra la sua direzione e la normale dello schermo: -1 e' «dritto
   * davanti») e se gli sta davanti. `seduti` e' la stessa cosa letta dalle figure
   * vere, quelle sedute a lavorare adesso.
   */
  verifica() {
    if (!M) return null;
    const punto = (a, n) => Math.sin(a) * n[0] + Math.cos(a) * n[1];
    return {
      banchi: M.B.banchi.map((b) => ({
        i: b.i,
        punto: punto(b.posto.a, b.normale),
        davanti: (b.posto.x - b.mon[0]) * b.normale[0] + (b.posto.y - b.mon[1]) * b.normale[1],
      })),
      seduti: [...M.specchio.vivi.values()]
        .filter((P) => P.posto && P.posto.tipo === 'banco' && P.sit >= 1 && P.cam === 0)
        .map((P) => ({ i: P.posto.i, punto: punto(P.a, M.B.banchi[P.posto.i].normale) })),
    };
  },
  /** Com'e' messa la scena adesso, in pixel di scheda: lo leggono i controlli. */
  stato() {
    if (!M) return null;
    const e = M.ingombro || { lo: 0, hi: 0, x: 0 };
    return {
      pelle: M.S.nome,
      W: M.R.W,
      H: M.R.H,
      WH: M.R.WH,
      largo: M.largo,
      alto: M.alto,
      quadri: M.quadri,
      ms: +M.ms.toFixed(2),
      stanza: { su: ((1 - e.hi) / 2) * M.alto, giu: ((1 - e.lo) / 2) * M.alto, larga: e.x * M.largo },
      gente: [...M.specchio.vivi].map(([el, P]) => ({
        nome: el.getAttribute('aria-label') || '',
        x: P.sx,
        y: P.sy,
        alta: P.px,
        seduto: P.sit > 0.5,
        visibile: P.fig.g.visible,
      })),
    };
  },
};
