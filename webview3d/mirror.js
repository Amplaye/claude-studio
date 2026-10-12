/* Claude Studio — l'ufficio in 3D: lo specchio.
 *
 * Il 3D non e' un secondo ufficio: e' un altro modo di guardare lo stesso. La
 * stanza piatta resta montata e continua a vivere — la gente cammina, si siede, va
 * al bar, parla — e a ogni fotogramma lo specchio la guarda e riporta di qua
 * quello che vede: dove sta ognuno (la posizione a meta' di una camminata la da'
 * `getComputedStyle`), che posa ha, quali schermi sono accesi, se la porta e'
 * aperta. Nessuna regola dell'ufficio e' riscritta: se domani la gente impara una
 * cosa nuova nella stanza piatta, qui la si vede fare senza toccare niente.
 *
 * E quello che nella stanza piatta e' un nodo che si clicca o si legge resta LO
 * STESSO nodo: il bottone di una persona, la sua targhetta, la nuvoletta, l'alone,
 * il bottone della bacheca, i foglietti, le tazze. Lo specchio gli mette addosso
 * un `translate` e uno `scale` calcolati dalla proiezione, e il bottone finisce
 * esatto sulla sua figura — clic, fuoco, tastiera, scheda e domande funzionano
 * come prima, senza lanciare un raggio. Chi ha un gemello a volumi (pavimento,
 * muri, mobili, corpi, monitor…) lo nasconde office3d.css.
 *
 * La regola per tutto il resto: quello che sta nel palco e che qui non si conosce
 * resta un cartoncino in piedi al suo posto. Cosi' niente sparisce in silenzio, e
 * quello che verra' aggiunto alla stanza si vede anche di qua.
 */
import { THREE, clamp, ease, lerp, giro as corto } from './kit.js';
import { persona, ALTA, ALTA_SEDUTA } from './people.js';
import { PIANO } from './props.js';

/** I nodi del palco che hanno un gemello a volumi, o che sono solo contenitori. */
const SALTA = /(^|\s)(of-floor|of-wall|of-luce|of-tappeto|of-porta|of-mon|of-mail|of-nobody|of-crowd|of-bacheche|of-portatili|of-tazze|in3d)(\s|$)/;
/** Le buste, per classe: gli stessi colori di room.css. */
const BUSTE = [
  ['ko', '#f2b3a6'],
  ['esito', '#b9e0ae'],
  ['compito', '#f3e2a2'],
  ['lettera', '#d8cbef'],
  ['giu', '#cfe7c8'],
  ['su', '#cfe2ee'],
];
const verso = (v, a, passo) => (v < a ? Math.min(a, v + passo) : Math.max(a, v - passo));

export function specchio(M) {
  const { stage } = M;
  const R = window.ROOM;
  /** Il bottone della stanza piatta → la sua figura. */
  const vivi = new Map();
  /** I nodi a cui si e' messo addosso qualcosa, per toglierlo quando si spegne. */
  const toccati = new Set();
  const prima = new WeakMap();
  const sentieri = new WeakMap();
  const v3 = new THREE.Vector3();
  let geo = { k: 1, ox: 0, oy: 0 };
  let portaU = 0;

  /** Un punto della stanza → dove cade nella scheda, e quanti pixel vale li' un'unita'. */
  function proietta(x, y, z) {
    const c = M.camera;
    v3.set(x, z, y).project(c);
    const sx = ((v3.x + 1) / 2) * M.largo;
    const sy = ((1 - v3.y) / 2) * M.alto;
    v3.set(x + 1, z, y).project(c);
    return { x: sx, y: sy, s: Math.abs(((v3.x + 1) / 2) * M.largo - sx) };
  }

  /** Il palco e' scalato e centrato dalla pagina: si misura, non si suppone. */
  function misuraPalco() {
    const a = stage.getBoundingClientRect();
    const b = M.wrap.getBoundingClientRect();
    geo = { k: a.width / (stage.offsetWidth || 1) || 1, ox: a.left - b.left, oy: a.top - b.top };
  }

  /**
   * Porta un nodo del palco sul punto (sx, sy) della scheda. `l, t, w, h` e' la sua
   * scatola nel palco; `s` quanti pixel deve valere un suo pixel; `ancora` quale suo
   * punto va messo li' — 'giu' il centro del bordo di sotto, 'su' quello di sopra,
   * 'centro' il centro. `sy2` e' per chi va stirato in altezza a parte (la bacheca).
   */
  function metti(el, l, t, w, h, sx, sy, s, ancora, sy2) {
    const sc = s / geo.k;
    const scy = sy2 == null ? sc : sy2 / geo.k;
    const cx = l + w / 2;
    const cy = t + h / 2;
    const X = (sx - geo.ox) / geo.k;
    const Y = (sy - geo.oy) / geo.k;
    const dy = ancora === 'su' ? Y - (cy - (scy * h) / 2) : ancora === 'centro' ? Y - cy : Y - (cy + (scy * h) / 2);
    const tr = (X - cx).toFixed(2) + 'px ' + dy.toFixed(2) + 'px';
    const sca = sy2 == null ? sc.toFixed(4) : sc.toFixed(4) + ' ' + scy.toFixed(4);
    // Scrivere uno stile uguale a quello che c'e' costa lo stesso un ricalcolo.
    const era = prima.get(el);
    if (era && era[0] === tr && era[1] === sca) return;
    prima.set(el, [tr, sca]);
    el.style.translate = tr;
    el.style.scale = sca;
    toccati.add(el);
  }

  // ---------------------------------------------------------------------
  //  le persone
  // ---------------------------------------------------------------------
  function nasce(el, seme, fx, fy) {
    const fig = persona(seme, M.mat);
    M.gente.add(fig.g);
    const P = {
      fig,
      fx,
      fy,
      a: 0,
      sit: 0,
      amp: 0,
      passo: 0,
      cam: 0,
      digita: 0,
      saluta: 0,
      tinta: 1,
      // Chi nasce sulla soglia sta dentro la cabina finche' la porta non si apre.
      porta: el.classList.contains('soglia') ? 1 : 0,
      posto: null,
      fase: Math.random() * 6.28,
      fermoDa: -9,
      occhiata: 0,
      prossima: 3 + Math.random() * 9,
    };
    vivi.set(el, P);
    return P;
  }
  function muore(el, P) {
    M.gente.remove(P.fig.g);
    P.fig.via();
    vivi.delete(el);
  }

  /** Verso cosa si gira chi sta fermo in piedi: la pianta che annaffia, il mobile che usa. */
  function interesse(x, y) {
    let meglio = null;
    let quanto = 26;
    for (const q of M.B.interessi) {
      const d = Math.hypot(q[0] - x, q[1] - y);
      if (d < quanto) {
        quanto = d;
        meglio = q;
      }
    }
    if (meglio) return Math.atan2(meglio[0] - x, meglio[1] - y);
    // Contro il muro di fondo si guarda il muro: e' li' che stanno la bacheca, gli
    // scaffali, la macchina del caffe'.
    return y < 70 ? Math.PI : null;
  }

  function persone(t, dt) {
    const visti = new Set();
    for (const el of stage.querySelectorAll('.of-guy')) {
      const body = el.querySelector('.of-body');
      const seme = body && body.dataset.seme;
      if (!seme) continue;
      const cs = getComputedStyle(el);
      const l = parseFloat(cs.left) || 0;
      const tp = parseFloat(cs.top) || 0;
      const fx = l + 8;
      const fy = tp + 24;
      let P = vivi.get(el);
      if (P && P.fig.seme !== seme) muore(el, P), (P = null);
      if (!P) P = nasce(el, seme, fx, fy);
      visti.add(el);
      const cl = el.classList;

      // --- quanto si e' mosso, e dove sta andando
      const vx = (fx - P.fx) / dt;
      const vy = (fy - P.fy) / dt;
      const vel = Math.hypot(vx, vy);
      P.fx = fx;
      P.fy = fy;
      const cammina = vel > 3;
      const tx = (parseFloat(el.style.left) || 0) + 8;
      const ty = (parseFloat(el.style.top) || 0) + 24;
      const arrivato = Math.hypot(fx - tx, fy - ty) < 1.5;

      // --- cosa ha addosso: e' il modo in cui la stanza piatta dice cosa sta facendo
      let parla = false;
      let tazza = false;
      let foglio = false;
      let faldone = false;
      for (const c of el.children) {
        const k = c.className;
        if (typeof k !== 'string') continue;
        if (k.includes('of-say')) parla = true;
        else if (k.includes('of-tazza')) tazza = true;
        else if (k.includes('of-note')) foglio = true;
        else if (k.includes('of-faldone')) faldone = true;
      }
      const chiede = cl.contains('asking');

      // --- seduto: quando e' fermo sul posto di una scrivania o di uno sgabello.
      //     Il posto piatto e quello a volumi non coincidono (qui ci si siede di
      //     sbieco, verso lo schermo): ci si scivola sopra mentre ci si siede.
      let posto = null;
      if (arrivato && !cammina) posto = M.B.posti.find((q) => Math.abs(q.p2[0] - tx) < 2.5 && Math.abs(q.p2[1] - ty) < 2.5) || null;
      if (posto) P.posto = posto;
      P.sit = verso(P.sit, posto ? 1 : 0, dt * 4);
      if (P.sit <= 0) P.posto = null;
      const q = P.posto;
      const u = ease(P.sit);
      let x = q ? lerp(fx, q.x, u) : fx;
      let y = q ? lerp(fy, q.y, u) : fy;

      // --- sulla soglia: dentro la cabina, e da li' fuori quando la porta si apre
      P.porta = verso(P.porta, cl.contains('soglia') ? 1 : 0, dt * 3.5);
      if (P.porta > 0) {
        const e = ease(P.porta);
        x = lerp(x, M.B.porta.cabina[0], e);
        y = lerp(y, M.B.porta.cabina[1], e);
      }

      // --- da che parte guarda
      // Chi parla, o ti aspetta, si gira verso di te. E chi non ha niente da fare
      // ogni tanto da' un'occhiata: e' il momento in cui gli si vede la faccia.
      if (!M.calmo && q && !cl.contains('busy') && t > P.prossima) {
        P.occhiata = t + 1.6 + Math.random() * 1.4;
        P.prossima = P.occhiata + 6 + Math.random() * 10;
      }
      P.cam = verso(P.cam, parla || chiede ? 1 : t < P.occhiata ? 0.55 : 0, dt * 2.2);
      let a = P.a;
      let capo = 0;
      if (cammina) {
        a = Math.atan2(vx, vy);
        P.fermoDa = t;
      } else if (q && P.sit > 0.3) {
        // Seduto guarda lo schermo; per girarsi verso la camera gira la sedia per
        // due terzi e la testa per il resto, che e' come ci si gira davvero.
        const d = corto(q.a, 0);
        a = q.a + d * 0.62 * ease(P.cam);
        capo = d * 0.33 * ease(Math.min(1, P.cam * 1.6));
      } else if (P.porta > 0.05) a = 0;
      else if (t - P.fermoDa > 0.5) {
        const i = parla || chiede ? null : interesse(fx, fy);
        a = i == null ? Math.sin(P.fase) * 0.3 : i;
      }
      P.a += corto(P.a, a) * Math.min(1, dt * (cammina ? 12 : 5));

      // --- la posa
      if (cammina) P.passo += (Math.PI * vel * dt) / 12.5;
      P.amp = verso(P.amp, cammina ? 1 : 0, dt * 6);
      P.digita = verso(P.digita, q && P.sit > 0.6 && body.dataset.posa === 'digita' && P.cam < 0.25 ? 1 : 0, dt * 5);
      P.saluta = verso(P.saluta, chiede ? 1 : 0, dt * 3);
      // Il saltello della festa, con lo stesso tempo di quello piatto (office.css).
      const f = (t % 1.8) / 1.8;
      const salto = cl.contains('festa') && f > 0.58 && f < 0.84 ? Math.sin(((f - 0.58) / 0.26) * Math.PI) * 3.5 : 0;
      // Ferma da un pezzo: sbiadita, come la sua gemella piatta.
      const ferma = !cl.contains('busy') && !cl.contains('recent') && !cl.contains('done');
      P.tinta = verso(P.tinta, ferma ? 0.5 : 1, dt * 2);

      const fig = P.fig;
      fig.g.position.set(x, 0, y);
      fig.g.rotation.y = P.a;
      fig.g.visible = P.porta < 0.97;
      fig.tinta(P.tinta);
      fig.posa({
        sit: u,
        passo: P.passo,
        amp: P.amp,
        digita: P.digita,
        batte: Math.floor(t * 6 + P.fase) & 1,
        saluta: P.saluta,
        onda: t * 5,
        testa: capo,
        china: -0.22 * ease(P.cam),
        salto,
        fiato: M.calmo ? 0 : 0.12 * Math.sin(t * 1.9 + P.fase),
        tazza,
        foglio,
        faldone,
      });
      P.x = x;
      P.y = y;
      P.alta = lerp(ALTA, ALTA_SEDUTA, u) + salto;

      // --- e il suo bottone, esatto sulla figura: i piedi sui piedi, la testa sulla testa
      const piedi = proietta(x, y, 0);
      const cima = proietta(x, y, P.alta);
      P.px = Math.max(1, piedi.y - cima.y);
      P.sx = piedi.x;
      P.sy = piedi.y;
      metti(el, l, tp, 16, 24, piedi.x, piedi.y, P.px / 24, 'giu');
    }
    for (const [el, P] of vivi) if (!visti.has(el)) muore(el, P);

    // Le sedie girano con chi ci sta seduto, e tornano dritte quando si alza.
    for (const q of M.B.posti) {
      if (!q.sedia) continue;
      let a = q.a;
      for (const P of vivi.values()) if (P.posto === q && P.sit > 0.5) a = P.a;
      q.sedia.rotation.y += corto(q.sedia.rotation.y, a) * Math.min(1, dt * 8);
    }
  }

  // ---------------------------------------------------------------------
  //  la stanza: schermi, porta, portatili, buste
  // ---------------------------------------------------------------------
  function stanza(t, dt) {
    const mon = stage.querySelectorAll('.of-mon');
    M.B.banchi.forEach((b, i) => {
      const c = mon[i] && mon[i].classList;
      b.accendi(c && c.contains('working') ? 'working' : c && c.contains('on') ? 'on' : 'off');
    });
    const porta = stage.querySelector('.of-porta');
    portaU = verso(portaU, porta && porta.classList.contains('aperta') ? 1 : 0, dt * 3.2);
    M.B.porta.apri(ease(portaU));

    for (const q of M.B.posti) if (q.lap) q.lap.visible = false;
    for (const n of stage.querySelectorAll('.of-portatile')) {
      const q = M.B.portatili.get(parseFloat(n.style.left) + ',' + parseFloat(n.style.top));
      if (q) q.lap.visible = true;
    }

    /* Le buste. Sono le sole cose che non restano il loro nodo: volano lungo un
       `offset-path`, e quello si compone con `translate` e `scale` in un modo che
       non si raddrizza (la scala moltiplica anche il tragitto, e il nodo gira con
       la curva). Quindi qui la busta e' una scatola: i capi si leggono dal sentiero
       scritto addosso al nodo, e a che punto e' lo dice `offset-distance` mentre
       l'animazione gira. La campata la rifa' la stanza, in altezza vera. */
    const buste = stage.querySelectorAll('.of-mail');
    M.B.buste.forEach((m, i) => {
      const n = buste[i];
      m.visible = !!n;
      if (!n) return;
      let s = sentieri.get(n);
      if (!s) {
        const num = (n.style.offsetPath || '').match(/-?\d+(\.\d+)?/g) || [];
        const k = BUSTE.find((b) => n.classList.contains(b[0]));
        s = { a: aria(+num[0] || 0, +num[1] || 0), b: aria(+num[4] || 0, +num[5] || 0), c: k ? k[1] : '#cfe2ee' };
        sentieri.set(n, s);
      }
      const cs = getComputedStyle(n);
      const w = clamp((parseFloat(cs.offsetDistance) || 0) / 100);
      m.position.set(lerp(s.a.x, s.b.x, w), lerp(s.a.z, s.b.z, w) + Math.sin(Math.PI * w) * 26, lerp(s.a.y, s.b.y, w));
      m.material.color.set(s.c);
      m.material.opacity = parseFloat(cs.opacity);
    });
  }

  /** Un punto «a mezz'aria» della stanza piatta: sulla faccia di un mobile del muro, o all'altezza delle mani. */
  function aria(x, y) {
    const m = appeso(x, y);
    return m ? { x, y: m.yf, z: m.fz(m.b - y) } : { x, y: y + 12, z: 12 };
  }
  const appeso = (x, y) => M.B.appesi.find((m) => x >= m.x0 && x <= m.x1 && y >= m.y0 && y < m.b - 0.5);

  // ---------------------------------------------------------------------
  //  quello che resta un nodo: targhette, bacheca, foglietti, tazze, e gli sconosciuti
  // ---------------------------------------------------------------------
  function cartoncino(el) {
    if (el.hidden) return;
    const l = el.offsetLeft;
    const t = el.offsetTop;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (!w && !h) return;
    const x = l + w / 2;
    const y = t + h;
    // Appeso a un mobile del muro: sulla sua faccia. Su una scrivania: sul piano, dal
    // capo libero (quello lontano dal monitor). Tutto il resto: in piedi per terra.
    const m = appeso(x, y);
    let p;
    if (m) p = proietta(x, m.yf, m.fz(m.b - y));
    else {
      const b = M.B.banchi.find((d) => x >= d.x && x <= d.x + R.SW && y > d.b - R.SH && y <= d.b);
      if (b) {
        const lu = 33 + 12 * (1 - (x - b.x) / R.SW);
        p = proietta(b.mir ? b.x + R.SW - lu : b.x + lu, b.b - 5, PIANO);
      } else p = proietta(x, y, 0);
    }
    metti(el, l, t, w, h, p.x, p.y, p.s, 'giu');
  }

  function nodi() {
    // --- le targhette. Sulla scrivania, come nella stanza piatta — ma con la camera
    //     cosi' bassa fra una fila e l'altra non c'e' il posto di un nome: quella
    //     della fila dietro sta sopra lo schermo, quella della fila davanti per terra
    //     ai piedi di chi siede. Ognuna accanto al suo banco, nessuna sopra una persona.
    for (const el of stage.querySelectorAll('.of-plate')) {
      if (el.hidden) continue;
      const pl = parseFloat(el.style.left);
      const pt = parseFloat(el.style.top);
      const b = M.B.banchi.find((d) => Math.abs(pl - (d.x + R.SW / 2)) < 1 && Math.abs(pt - (d.b - R.SH - 20)) < 1);
      const p = b ? (b.sopra ? proietta(b.x + R.SW / 2, b.b - 8, 31) : proietta(b.x + R.SW / 2, b.b + 17, 0)) : proietta(pl, pt + 44, ALTA + 4);
      // Mai sotto i dieci pixel di scritta: una targhetta che non si legge e' un rettangolo.
      metti(el, el.offsetLeft, el.offsetTop, el.offsetWidth, el.offsetHeight, p.x, p.y, Math.max(p.s, 10.5 / 6), b && !b.sopra ? 'su' : 'giu');
    }
    // --- il bottone della bacheca, steso sulla bacheca vera
    const k = stage.querySelector('.of-kanban');
    const tb = M.B.bacheca;
    if (k && tb) {
      const a = proietta(tb.x0, tb.y, tb.z1);
      const c = proietta(tb.x1, tb.y, tb.z0);
      const w = k.offsetWidth || 1;
      const h = k.offsetHeight || 1;
      metti(k, k.offsetLeft, k.offsetTop, w, h, (a.x + c.x) / 2, (a.y + c.y) / 2, (c.x - a.x) / w, 'centro', (c.y - a.y) / h);
    }
    // --- e tutto il resto
    for (const el of stage.children) {
      const c = el.className;
      if (typeof c !== 'string' || SALTA.test(c) || el === k) continue;
      cartoncino(el);
    }
    for (const sel of ['.of-bacheche', '.of-tazze', '.of-crowd']) {
      const box = stage.querySelector(sel);
      if (!box) continue;
      for (const el of box.children) {
        const c = el.className;
        if (typeof c !== 'string' || c.includes('of-guy') || c.includes('of-plate')) continue;
        cartoncino(el);
      }
    }
  }

  /** I mobili che hanno un gemello a volumi si segnano: e' office3d.css a nasconderli. */
  function segna() {
    for (const n of stage.querySelectorAll('.in3d')) n.classList.remove('in3d');
    for (const n of stage.querySelectorAll('.of-prop')) if (M.B.fatti.has(n.dataset.k) || n.classList.contains('of-desk')) n.classList.add('in3d');
    for (const m of R.DISEGNATI) {
      if (!M.B.fatti.has(m.s)) continue;
      for (const n of stage.querySelectorAll('.of-' + m.s)) n.classList.add('in3d');
    }
  }

  return {
    vivi,
    proietta,
    segna,
    giro(t, dt) {
      misuraPalco();
      stanza(t, dt);
      persone(t, dt);
      nodi();
    },
    /** Fuori dal giro: un nodo appena nato va messo a posto prima che lo si veda. */
    sistema() {
      misuraPalco();
      nodi();
    },
    smonta() {
      for (const [el, P] of [...vivi]) muore(el, P);
      for (const el of toccati) {
        el.style.translate = '';
        el.style.scale = '';
        prima.delete(el);
      }
      toccati.clear();
      for (const n of stage.querySelectorAll('.in3d')) n.classList.remove('in3d');
    },
  };
}
