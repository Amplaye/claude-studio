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
 *   - la stanza riempie la scheda, tutta: niente cornice e niente vuoto attorno. In
 *     cima il quadro taglia la vetrata, in fondo il pavimento, ai lati i due muri
 *     di fianco — e dentro restano tutte le scrivanie e tutti i posti dove si
 *     mettono i piedi. La camera non cambia idea (di fronte, trenta gradi, una
 *     lente lunga): e' la stanza che si adatta, crescendo in profondita' o in
 *     larghezza con una misura sua. Vedi quadro() e misura();
 *   - non si consuma batteria: si disegna solo mentre l'ufficio si vede, a trenta
 *     fotogrammi al secondo, e con le animazioni ridotte quello che si muove da solo
 *     (le nuvole, gli schermi, l'acqua) sta fermo — la gente no, che e' il punto;
 *   - se qualcosa si rompe — niente WebGL, il contesto perso per sempre, un errore
 *     a meta' fotogramma — si spegne tutto e si avverte chi ha acceso: la stanza
 *     piatta e' ancora li' sotto, e una stanza vuota non la vede nessuno.
 */
import { THREE, Lotto, Tratto, U, qui, parte, tela, tramaAlone, materiali, via } from './kit.js';
import { costruisci } from './props.js';
import { specchio } from './mirror.js';
import { animali } from './pets.js';
import classico from './skins/classico.js';
import notte from './skins/notte.js';
import bali from './skins/bali.js';

const PELLI = { classico, notte, bali };

/**
 * Quanto guarda in giu' la camera, e quanto e' lunga la lente (gradi in verticale).
 * La lente e' un compromesso. Il quadro e' piu' stretto davanti che in fondo, e
 * davanti deve tenere tutta la stanza (ci si cammina lungo i muri): quindi in fondo
 * avanza, e quello che avanza sono i due muri di fianco ai lati della vetrata. Con
 * una lente corta la prospettiva e' piu' viva e i muri si mangiano un quinto della
 * scheda; con dodici gradi ne prendono un ventesimo per parte, e le assi del
 * pavimento convergono ancora.
 */
const INCLINA = (30 * Math.PI) / 180;
const LENTE = 12;
const SIN = Math.sin(INCLINA);
const COS = Math.cos(INCLINA);
const FPS = 30;
// Le tangenti dei tre raggi che contano: mezzo quadro, il bordo di sopra, quello di sotto.
const MEZZA = ((LENTE / 2) * Math.PI) / 180;
const TF = Math.tan(MEZZA);
const TT = Math.tan(INCLINA - MEZZA);
const TB = Math.tan(INCLINA + MEZZA);
/** La faccia del muro di fondo, nella pianta: e' li' che il bordo di sopra incontra la vetrata. */
const MURO = 16;
/** A che altezza la incontra nella stanza com'e' disegnata, e di quanto sale per ogni unita' di salone in piu'. */
const CIMA = 126;
const SALE = 0.8;
/** Il bordo di sotto tocca il pavimento a tanto dal fondo della pianta: gli ultimi piedi stanno a venti. */
const FONDO = 12;
/** Chi cammina lungo un muro di fianco sta a ventotto dal bordo della pianta, ed e' largo: a tanto il quadro deve arrivarci, all'altezza di una testa. */
const LATO = 22;
const TESTA = 45;

/** La scena accesa, o null. */
let M = null;

const aspetto = (largo, alto) => largo / Math.max(1, alto);

/**
 * Il quadro: dove sta la camera per una stanza profonda `H` in una scheda di
 * proporzione `a` (largo su alto), e cosa ci entra.
 *
 * Due raggi la fissano. Quello del bordo di sopra deve finire sulla vetrata, ad
 * altezza `cima`: cosi' in cima alla scheda c'e' cielo e non il vuoto. Quello del
 * bordo di sotto deve finire sul pavimento a profondita' `giu`, appena oltre gli
 * ultimi posti dove si cammina. `mezza(y, z)` e' quanto e' largo mezzo quadro in un
 * punto della pianta a profondita' `y` e altezza `z`.
 */
function quadro(H, a) {
  const cima = CIMA + SALE * (H - window.ROOM.H0);
  const giu = H - FONDO;
  const cy = (cima + giu * TB - MURO * TT) / (TB - TT);
  const cz = (cy - giu) * TB;
  return { cima, giu, cy, cz, mezza: (y, z) => ((cy - y) * COS + (cz - z) * SIN) * TF * a };
}

/**
 * Quanto deve crescere la stanza perche' la scheda `largo` x `alto` ne sia piena:
 * la misura da dare a `ROOM.cresci`, l'altezza a cui il quadro taglia la vetrata, e
 * quanti pixel vale davanti un'unita' di stanza (l'ingrandimento del palco).
 *
 * Non e' il conto della stanza piatta, dove un pixel di pavimento e' un pixel di
 * scheda. Qui comanda la larghezza davanti: la fila piu' vicina e le due corsie
 * lungo i muri devono starci, ed e' li' che il quadro e' piu' stretto.
 *   - una scheda larga ne ha d'avanzo: la stanza si allarga fino al quadro (il
 *     corridoio in mezzo, come sempre);
 *   - una scheda alta e' stretta: la camera deve allontanarsi, e per farlo senza
 *     scoprire il vuoto il salone si allunga e la vetrata sale. Un po' piu' alla
 *     vetrata che al salone (SALE): le scrivanie restano in mezzo al salone, due
 *     file a settanta l'una dall'altra, e ogni unita' di pavimento in piu' e'
 *     pavimento vuoto attorno a loro; il cielo vuoto invece e' cielo.
 */
function misura(largo, alto) {
  const R = window.ROOM;
  const a = aspetto(largo, alto);
  const davanti = (g) => quadro(R.H0 + g, a).mezza(R.H0 + g - 20, TESTA);
  const serve = R.W0 / 2 - LATO;
  let w = R.W0;
  let g = 0;
  if (davanti(0) >= serve) w = 2 * (davanti(0) + LATO);
  else {
    let lo = 0;
    let hi = 6000;
    for (let i = 0; i < 40; i++) {
      const m = (lo + hi) / 2;
      if (davanti(m) < serve) lo = m;
      else hi = m;
    }
    // `cresci` tiene solo i pari e arrotonda in giu': qui si arrotonda in su, che una
    // stanza un pelo piu' profonda del necessario sta nel quadro e una piu' corta no.
    g = Math.ceil(hi / 2) * 2;
  }
  const h = R.H0 + g;
  const q = quadro(h, a);
  return { w, h, wh: Math.round(q.cima), k: largo / (2 * q.mezza(h - 20, 0)) };
}

const pelleDi = (stage) => PELLI[stage.dataset.skin] || classico;
const firma = () => window.ROOM.W + 'x' + window.ROOM.H + ':' + pelleDi(M.stage).nome;

/** La stanza si (ri)monta: a ogni cambio di pelle e a ogni cambio di misura. */
function monta() {
  const R = window.ROOM;
  const S = pelleDi(M.stage);
  if (M.radice) {
    M.scena.remove(M.radice);
    via(M.radice);
    for (const k of Object.keys(M.mat)) M.mat[k].dispose();
    if (M.scena.background && M.scena.background.dispose) M.scena.background.dispose();
  }
  M.S = S;
  M.firma = firma();
  M.montato = performance.now();
  M.animazioni = [];
  M.radice = new THREE.Group();
  M.scena.add(M.radice);
  M.mat = materiali(M.trama);
  // La pianta com'e' adesso. I getter di ROOM danno ogni volta la tavola fresca:
  // se ne prende una copia sola, e la stanza si monta tutta sugli stessi numeri.
  const a = aspetto(M.largo, M.alto);
  const Q = quadro(R.H, a);
  // Fin dove devono arrivare il pavimento e i muri di fianco perche' il quadro non
  // ne esca mai: verso chi guarda, finche' il muro non e' uscito di lato lungo il
  // bordo di sotto; in alto, finche' non e' uscito lungo quello di sopra. Con un po'
  // di margine: la stanza cresce a passi di due, la scheda a pixel.
  const esce = (t) => Q.cy - (R.W / 2 - MURO) / (TF * a * (COS + t * SIN));
  Q.lungo = Math.max(Q.giu, esce(TB)) + 30;
  Q.alto = Q.cima + Math.max(0, esce(TT) - MURO) * TT + 24;
  M.Q = Q;
  M.R = {
    W: R.W,
    H: R.H,
    WH: Math.round(Q.cima) + 16,
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
    /** Il quadro: `cima` e `giu` dove i bordi tagliano vetrata e pavimento, `lungo` e `alto` fin dove deve arrivare il guscio. */
    Q,
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

  // --- le luci. A tinte piatte ne bastano due: l'ambiente e' il colore di ogni
  //     ombra, propria o portata, e la chiave ci aggiunge quello che manca per
  //     arrivare al bianco. Il riempimento resta per le pelli che lo vogliono: su
  //     una tinta a gradini una seconda luce fa una seconda fila di gradini.
  const { W } = M.R;
  const lu = S.luci;
  M.radice.add(new THREE.AmbientLight(lu.ambiente[0], lu.ambiente[1] * Math.PI));
  const chiave = new THREE.DirectionalLight(lu.chiave[0], lu.chiave[1] * Math.PI);
  const [dx, dy, dz] = lu.chiave[2];
  const centro = new THREE.Vector3(W / 2, 0, (MURO + Q.giu) / 2);
  const raggio = Math.hypot(W - 2 * MURO, Q.giu - MURO) / 2 + 40;
  chiave.position.copy(centro).addScaledVector(new THREE.Vector3(dx, dz, dy).normalize(), raggio * 2.5);
  chiave.target.position.copy(centro);
  chiave.castShadow = true;
  chiave.shadow.mapSize.set(2048, 2048);
  chiave.shadow.bias = -0.0003;
  chiave.shadow.normalBias = 0.36;
  Object.assign(chiave.shadow.camera, { left: -raggio, right: raggio, top: raggio, bottom: -raggio, near: raggio * 0.5, far: raggio * 4.5 });
  M.radice.add(chiave, chiave.target);
  if (lu.riempi && lu.riempi[1] > 0) {
    const riempi = new THREE.DirectionalLight(lu.riempi[0], lu.riempi[1] * Math.PI);
    riempi.position.set(W / 2, 180, centro.z + 300);
    riempi.target.position.copy(centro);
    M.radice.add(riempi, riempi.target);
  }

  // Dietro la stanza non si vede niente: la riempie tutta. Lo sfondo resta per il
  // fotogramma in cui la scheda ha gia' cambiato misura e la stanza non ancora.
  const f = tela(512, 512);
  S.sfondo(f.g, 512, 512);
  f.tex.needsUpdate = true;
  M.scena.background = f.tex;

  M.specchio.segna();
  M.animali.stanza();
  inquadra();
}

/**
 * La camera: di fronte alla stanza, alzata, che guarda in giu' di trenta gradi. Dove
 * sta lo dice quadro(), dalla profondita' della stanza com'e' adesso e dalla
 * proporzione della scheda: non c'e' niente da cercare.
 */
function inquadra() {
  const { W, H, WH } = M.R;
  const c = M.camera;
  const a = aspetto(M.largo, M.alto);
  const Q = quadro(H, a);
  c.aspect = a;
  c.position.set(W / 2, Q.cz, Q.cy);
  c.quaternion.copy(M.vista.q);
  // Dal punto piu' vicino che si puo' vedere (una testa sul bordo di sotto) al piu'
  // lontano (il piede della vetrata, oltre la cabina), lungo l'asse della camera.
  const lungo = (y, z) => (Q.cy - y) * COS + (Q.cz - z) * SIN;
  c.near = Math.max(10, lungo(M.Q.lungo, 90));
  c.far = lungo(-60, 0) + 60;
  c.updateProjectionMatrix();
  c.updateMatrixWorld(true);
  // Di quanto la stanza sporge dal quadro: e' quello che leggono i controlli per
  // sapere che attorno non resta vuoto (vedi stato()).
  const v = new THREE.Vector3();
  const sy = (y, z) => v.set(W / 2, z, y).project(c).y;
  M.ingombro = { hi: sy(MURO, WH), lo: sy(M.Q.lungo, 0), x: (W / 2 - MURO) / Q.mezza(Q.giu, 0) };
}

/** La tela segue la scheda. Torna true se la misura e' cambiata. */
function adatta() {
  const largo = M.wrap.clientWidth;
  const alto = M.wrap.clientHeight;
  if (largo === M.largo && alto === M.alto) return false;
  M.largo = largo;
  M.alto = alto;
  // Uno e mezzo al massimo: su uno schermo denso il doppio dei pixel e' il doppio
  // del lavoro per fotogramma, e a uno e mezzo il tratto regge.
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
    // Le sedie sono copie di una mesh sola: lo specchio ne ha girato i perni, e qui
    // i perni si riportano sulle copie (props.js).
    M.B.sedie();
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
    if (m.scena.background && m.scena.background.dispose) m.scena.background.dispose();
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
  /** I controlli della camminata, misurati dentro il 3D a ogni sotto-passo: `passi(true)` comincia, `passi()` legge, `passi(false)` smette (vedi mirror.js). */
  passi: (acceso) => (M ? M.specchio.passi(acceso) : null),
  get acceso() {
    return !!M;
  },
  /**
   * Il controllo delle scrivanie: per ognuna, quanto chi siede guarda lo schermo
   * (il prodotto fra la sua direzione e la normale dello schermo: -1 e' «dritto
   * davanti») e se gli sta davanti. `seduti` e' la stessa cosa letta dalle figure
   * vere, quelle sedute a lavorare adesso. `x`, `b`, `top` e `posto` sono l'ingombro
   * della postazione nella pianta: servono a controllare che chi cammina nelle
   * corsie della stanza piatta non ci passi dentro.
   *
   * `mani` e' di chi sta battendo, a una scrivania o a un tavolo: per ogni mano,
   * quanto dista dal centro della sua tastiera e quanto sta sopra il piano, in metri.
   * E' il controllo che le mani stiano sui tasti veri e non dove li ricordava chi ha
   * disegnato la gente.
   */
  verifica() {
    if (!M) return null;
    const punto = (a, n) => Math.sin(a) * n[0] + Math.cos(a) * n[1];
    const mani = (P) => {
      const s = Math.sin(P.a);
      const c = Math.cos(P.a);
      const t = P.posto.top;
      return P.fig.mani.map((m) => [
        +(Math.hypot(P.x + (m.x * c + m.z * s) * U - t.tasti[0], P.y + (-m.x * s + m.z * c) * U - t.tasti[1]) / U).toFixed(3),
        +(m.y - t.z / U).toFixed(3),
      ]);
    };
    return {
      mani: [...M.specchio.vivi.values()]
        .filter((P) => P.posto && P.sit >= 1 && P.gira >= 1 && P.cam === 0 && P.I.fa === 'digita')
        .map((P) => ({ posto: M.B.posti.indexOf(P.posto), tipo: P.posto.tipo, mani: mani(P) })),
      banchi: M.B.banchi.map((b) => ({
        i: b.i,
        punto: punto(b.posto.a, b.normale),
        davanti: (b.posto.x - b.mon[0]) * b.normale[0] + (b.posto.y - b.mon[1]) * b.normale[1],
        x: b.x,
        b: b.b,
        top: b.top,
        posto: [b.posto.x, b.posto.y],
      })),
      seduti: [...M.specchio.vivi.values()]
        .filter((P) => P.posto && P.posto.tipo === 'banco' && P.sit >= 1 && P.gira >= 1 && P.cam === 0)
        .map((P) => ({ i: P.posto.i, punto: punto(P.a, M.B.banchi[P.posto.i].normale) })),
      // Tutti i posti dove ci si siede (scrivanie e sgabelli): `p2` e' dove ci si mette i piedi nella stanza piatta.
      posti: M.B.posti.map((q) => ({ tipo: q.tipo, p2: q.p2 })),
    };
  },
  /**
   * Per i controlli: dipinge il vuoto dietro la stanza di un colore che nella stanza
   * non c'e', fino al prossimo rimontaggio. Chi poi conta quel colore nella scheda sa
   * se la stanza la riempie tutta.
   */
  vuoto(colore) {
    if (!M) return;
    if (M.scena.background && M.scena.background.dispose) M.scena.background.dispose();
    M.scena.background = new THREE.Color(colore);
  },
  /** Dove cade nella scheda un punto della stanza (unita', `z` in alto), in pixel: per chi deve ritagliare uno scatto attorno a una cosa. */
  punto(x, y, z = 0) {
    return M ? M.specchio.proietta(x, y, z) : null;
  },
  /**
   * Quanto pesa la scena, pezzo per pezzo: le mesh che si vedono adesso e i loro
   * triangoli, per la stanza, per la gente e per le bestie. `ombra` sono i triangoli
   * che il giro delle ombre ridisegna (i corpi, senza i contorni). E' il conto che
   * tiene d'occhio quanto costa un fotogramma su una scheda grafica integrata.
   */
  costo() {
    if (!M) return null;
    const conta = (radice, salta) => {
      const r = { mesh: 0, triangoli: 0, ombra: 0 };
      const giu = (o) => {
        if (!o.visible || o === salta) return;
        if (o.isMesh && o.geometry) {
          const g = o.geometry;
          const n = (o.isInstancedMesh ? o.count : 1) / 3;
          r.mesh++;
          r.triangoli += Math.round((g.index ? g.index.count : g.attributes.position.count) * n);
          if (o.castShadow) r.ombra += Math.round((g.userData.corpo == null ? (g.index ? g.index.count : g.attributes.position.count) : g.userData.corpo) * n);
        }
        o.children.forEach(giu);
      };
      giu(radice);
      return r;
    };
    const gente = [...M.specchio.vivi.values()].map((P) => conta(P.fig.g));
    const tutti = conta(M.gente);
    const somma = (k) => gente.reduce((n, g) => n + g[k], 0);
    return {
      stanza: conta(M.radice),
      gente: { quanti: gente.length, mesh: somma('mesh'), triangoli: somma('triangoli'), ombra: somma('ombra') },
      animali: { mesh: tutti.mesh - somma('mesh'), triangoli: tutti.triangoli - somma('triangoli'), ombra: tutti.ombra - somma('ombra') },
    };
  },
  /** Com'e' messa la scena adesso, in pixel di scheda: lo leggono i controlli. */
  stato() {
    if (!M) return null;
    const e = M.ingombro || { lo: 0, hi: 0, x: 0 };
    const info = M.renderer.info.render;
    return {
      pelle: M.S.nome,
      W: M.R.W,
      H: M.R.H,
      WH: M.R.WH,
      largo: M.largo,
      alto: M.alto,
      quadri: M.quadri,
      ms: +M.ms.toFixed(2),
      // Quanto costa un fotogramma: le chiamate al disegno e i triangoli dell'ultimo, ombre comprese.
      disegni: info.calls,
      triangoli: info.triangles,
      // La stanza riempie la scheda: `su` (la cima della vetrata) sta sotto zero e
      // `giu` (dove finisce il pavimento) oltre `alto`. `larga` e' il pavimento fra i
      // due muri sul bordo di sotto; piu' su il quadro lo chiudono i muri stessi.
      stanza: { su: ((1 - e.hi) / 2) * M.alto, giu: ((1 - e.lo) / 2) * M.alto, larga: e.x * M.largo },
      // Il bar com'e' di qua: quante tazze si vedono sulla rastrelliera, nel lavandino e su quali scrivanie, se la macchina versa, se il rubinetto scorre.
      bar: M.specchio.bar(),
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
