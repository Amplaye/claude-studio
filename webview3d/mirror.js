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
 * muri, mobili, corpi, monitor, tazze…) lo nasconde office.css.
 *
 * Il bar e' il caso piu' fitto. La stanza piatta tiene il conto delle tazze e dice
 * addosso a ognuno cosa sta facendo (`data-gesto`); qui le tazze sono quelle vere
 * della rastrelliera, del lavandino e delle scrivanie (`M.B.bar`, `banco.tazza`), e
 * lo specchio ne accende quante ne conta di la': la macchina versa mentre qualcuno
 * si fa il caffe', il rubinetto scorre mentre qualcuno lava.
 *
 * La regola per tutto il resto: quello che sta nel palco e che qui non si conosce
 * resta un cartoncino in piedi al suo posto. Cosi' niente sparisce in silenzio, e
 * quello che verra' aggiunto alla stanza si vede anche di qua.
 */
import { THREE, U, clamp, ease, lerp, giro as corto } from './kit.js';
import { persona, ALTA } from './people.js';
import { nuovo, ingressi, sposta, atteggia, siediSubito, SBRACCIO, AL_BANCONE, ACCANTO, DI_FIANCO, LIBRO_DOPO, PRESA_DOPO, CAFFE } from './gesti.js';

/** I nodi del palco che hanno un gemello a volumi, o che sono solo contenitori. */
const SALTA = /(^|\s)(of-floor|of-wall|of-luce|of-tappeto|of-porta|of-mon|of-mail|of-nobody|of-crowd|of-bacheche|of-portatili|of-tazze|of-tazza|in3d)(\s|$)/;
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
  /** Il posto a sedere che sta sul punto (x, y) della stanza piatta, se ce n'e' uno. */
  const sedile = (x, y) => M.B.posti.find((q) => Math.abs(q.p2[0] - x) < 2.5 && Math.abs(q.p2[1] - y) < 2.5) || null;

  function nasce(el, seme, fx, fy) {
    const fig = persona(seme, M.mat);
    M.gente.add(fig.g);
    // Chi nasce sulla soglia sta dentro la cabina finche' la porta non si apre.
    const soglia = el.classList.contains('soglia');
    const cab = M.B.porta.cabina;
    const P = nuovo(fig, soglia ? cab[0] : fx, soglia ? cab[1] : fy);
    P.fx = fx;
    P.fy = fy;
    P.porta = soglia ? 1 : 0;
    P.I = ingressi();
    P.tinta = 1;
    P.gestoEra = '';
    P.occhiata = 0;
    P.prossima = 0;
    P.bada = null;
    P.badaFino = 0;
    P.badaPoi = 0;
    P.addio = 0;
    // Chi e' gia' seduto quando si accende il 3D e' gia' seduto: non ci si risiede.
    const q = soglia ? null : sedile((parseFloat(el.style.left) || 0) + 8, (parseFloat(el.style.top) || 0) + 24);
    if (q && Math.hypot(fx - q.p2[0], fy - q.p2[1]) < 1.5) siediSubito(P, q);
    vivi.set(el, P);
    return P;
  }
  function muore(el, P) {
    P.morta = true;
    M.gente.remove(P.fig.g);
    P.fig.via();
    vivi.delete(el);
  }

  /**
   * Dove ci si mette davvero per usare un mobile. La stanza piatta ferma la gente a
   * una spanna da tutto — un metro sotto lo scaffale, accanto alla pianta — e da li'
   * un braccio non arriva: qui si va fino a un braccio dal fronte del mobile, girati
   * verso di lui. I punti sono le destinazioni di room.js, riconosciute per nome; il
   * mobile e' quello che la stanza a volumi ha messo li' (`appesi`, `interessi`), ed
   * e' lui a dire dove comincia e dove sta quello che si tocca: `p` (e `p2`) sono
   * i punti della stanza, [x, y, z] in unita', dove vanno le mani.
   */
  const soste = new Map();
  let sosteDi = null;
  function sosta(tx, ty) {
    if (sosteDi !== M.B) {
      soste.clear();
      sosteDi = M.B;
    }
    const D = R.DESTINAZIONI;
    for (const nome in D) {
      const d = D[nome];
      if (Math.abs(d[0] - tx) > 1.5 || Math.abs(d[1] - ty) > 1.5) continue;
      if (!soste.has(nome)) soste.set(nome, interesse(nome, d));
      return soste.get(nome);
    }
    return null;
  }
  function interesse(nome, d) {
    const tipo = nome.replace(/\d+$/, '');
    if (tipo === 'annaffia' || tipo === 'cestino') {
      let c = null;
      let quanto = 36;
      for (const q of M.B.interessi) {
        const dd = Math.hypot(q.x - d[0], q.y - d[1]);
        if (dd < quanto && q.tipo === (tipo === 'cestino' ? 'cestino' : 'pianta')) {
          quanto = dd;
          c = q;
        }
      }
      if (!c) return null;
      // A un passo dal suo orlo, dalla parte da cui si arriva.
      const k = Math.min(quanto, c.r + ACCANTO) / (quanto || 1);
      const x = c.x + (d[0] - c.x) * k;
      const y = c.y + (d[1] - c.y) * k;
      return { nome, tipo, x, y, a: Math.atan2(c.x - x, c.y - y), alto: false, p: [c.x, c.y, c.z], p2: null };
    }
    if (!['rastrelliera', 'macchina', 'lavandino', 'archivio', 'bacheca', 'dispensa'].includes(tipo)) return null;
    // Il mobile contro il muro che ha davanti: quello che gli sta sopra, il piu' vicino di traverso.
    let m = null;
    let quanto = 40;
    for (const a of M.B.appesi) {
      const dx = Math.max(a.x0 - d[0], 0, d[0] - a.x1);
      if (a.b > d[1] || d[1] - a.b > 40 || dx >= quanto) continue;
      quanto = dx;
      m = a;
    }
    if (!m) return null;
    // Davanti a un bancone ci si sta addosso; davanti a uno scaffale a un braccio, che
    // chi si china a guardarci dentro non ci sbatta la testa.
    const x = clamp(d[0], Math.min(m.x0 + 8, m.x1), Math.max(m.x1 - 8, m.x0));
    const S = { nome, tipo, x, y: Math.min(d[1], m.fronte + (m.alto ? SBRACCIO : AL_BANCONE)), a: Math.PI, alto: m.alto, p: null, p2: null };
    if (tipo === 'rastrelliera') S.p = tazzaDiTurno();
    const bar = M.B.bar;
    const tb = M.B.bacheca;
    const punto = (q) => [q.x, q.y, q.z];
    if (tipo === 'macchina' && bar.macchina) (S.p = punto(bar.macchina)), (S.p2 = punto(bar.macchina.bottone));
    else if (tipo === 'lavandino' && bar.lavandino) S.p = punto(bar.lavandino);
    // I foglietti stanno nella meta' alta dell'ardesia: si toccano a un metro e venticinque.
    else if (tipo === 'bacheca' && tb) S.p = [x, tb.y, 1.25 * U];
    else if (m.mani) {
      S.p = [x, m.fronte - 0.1 * U, m.mani[0]];
      if (m.mani[1]) S.p2 = [x, m.fronte - 0.1 * U, m.mani[1]];
    }
    // (Alla rastrelliera il punto e' la tazza che tocca adesso: lo si scrive a ogni giro.)
    return S;
  }

  /**
   * La sosta di UNA persona davanti a un mobile del muro: non piantata davanti a
   * quello che tocca, ma di fianco. La camera le sta alle spalle: chi si mette dritto
   * davanti alla macchina la copre tutta, e il caffe' che scende non lo vede nessuno.
   * Si mette dalla parte della mano che lavora, cosi' la cosa le resta davanti alla
   * spalla e fra lei e chi guarda non c'e' niente; al lavandino, dove le mani sono
   * due, di sbieco verso la vasca.
   */
  function diFianco(P, I, S) {
    if (!S.p || S.tipo === 'annaffia' || S.tipo === 'cestino') return S;
    const mia = Object.assign(P.sosta || (P.sosta = {}), S);
    if (S.tipo === 'lavandino') {
      mia.x = S.p[0] - 0.75 * DI_FIANCO;
      mia.a = Math.atan2(S.p[0] - mia.x, S.p[1] - mia.y);
      return mia;
    }
    // Tazza e caffe' con la mano della tazza, il faldone con la sinistra, il resto con la destra (gesti.js).
    const destra = S.tipo === 'archivio' ? 0 : S.tipo === 'rastrelliera' || S.tipo === 'macchina' ? I.manoTazza : 1;
    mia.x = clamp(S.p[0] + (destra ? DI_FIANCO : -DI_FIANCO), 24, R.W - 24);
    return mia;
  }

  // ---------------------------------------------------------------------
  //  il bar: le tazze si contano di la' e si vedono di qua
  // ---------------------------------------------------------------------
  /** Quante tazze conta la stanza piatta: pulite sulla rastrelliera, sporche nel lavandino, e su quali scrivanie ce n'e' una piena. */
  const conto = { pulite: 0, sporche: 0, piene: new Set() };
  function conta() {
    conto.pulite = stage.querySelectorAll('.of-tazze:not(.of-sporche) .of-tazza').length;
    conto.sporche = stage.querySelectorAll('.of-sporche .of-tazza').length;
    conto.piene.clear();
    // La stanza piatta la posa a venti pixel dal posto di chi siede (`posa` in room.js): da li' si risale alla scrivania.
    for (const n of stage.querySelectorAll('.of-tazza.piena')) {
      const q = sedile((parseFloat(n.style.left) || 0) - 12, (parseFloat(n.style.top) || 0) + 30);
      if (q && q.tipo === 'banco') conto.piene.add(q.i);
    }
  }
  /** La tazza della rastrelliera che tocca adesso: quella che si prende, o il posto dove si rimette. Il suo piede, in unita'. */
  function tazzaDiTurno() {
    const g = M.B.bar.tazze[Math.min(conto.pulite, M.B.bar.tazze.length - 1)];
    return g ? [g.position.x, g.position.z, g.position.y] : null;
  }
  function bar(t) {
    const b = M.B.bar;
    let prende = 0;
    let lava = 0;
    let caffe = Infinity;
    const inMano = new Set();
    const riprese = new Set();
    for (const P of vivi.values()) {
      const I = P.I;
      const u = t - I.gestoDa;
      // Chi allunga la mano non l'ha ancora presa: resta sul ripiano finche' non ci arriva.
      if (I.gesto === 'prende' && u < PRESA_DOPO) prende = 1;
      else if (I.gesto === 'lava' && u > 0.3) lava = 1;
      else if (I.gesto === 'caffe') caffe = Math.min(caffe, u);
      // E sulla scrivania: chi l'ha in mano (la sta posando, o beve), e chi la sta riprendendo per tornare al bar.
      if (P.beve) inMano.add(P.casa);
      if (P.riprende > 0) riprese.add(P.casa);
    }
    b.tazze.forEach((g, i) => (g.visible = i < conto.pulite + prende));
    if (b.lavandino) {
      // Quella che si sta lavando e' fra le mani, non piu' nella vasca.
      b.lavandino.sporche.forEach((g, i) => (g.visible = i < conto.sporche - lava));
      b.lavandino.acqua.visible = !!lava;
    }
    if (b.macchina) {
      b.macchina.tazza.visible = caffe > CAFFE.sotto[0] && caffe < CAFFE.sotto[1];
      b.macchina.getto.visible = caffe > CAFFE.versa[0] && caffe < CAFFE.versa[1];
    }
    for (const d of M.B.banchi) d.tazza.visible = (conto.piene.has(d.i) && !inMano.has(d.i)) || riprese.has(d.i);
  }

  /**
   * Quello che il bottone si porta addosso — i puntini, l'alone — cresce con lui, e il
   * bottone adesso e' alto quanto una figura quasi doppia di prima: lo si riporta alla
   * misura che aveva, appeso al suo angolo. (La nuvoletta no: lei non segue nemmeno
   * il bottone, vedi `nuvolette`.) L'annaffiatoio piatto si nasconde: qui ce n'e' uno
   * vero in mano.
   */
  const figli = new WeakMap();
  function ritocca(n, k, origine) {
    const s = k.toFixed(3);
    if (figli.get(n) === s) return;
    figli.set(n, s);
    n.style.scale = s;
    n.style.transformOrigin = origine;
  }

  /** L'ora dell'ultimo giro, per sapere quanto e' passato davvero. */
  let ultimo = 0;

  function persone(t, dt) {
    const visti = new Set();
    const calmo = !!M.calmo;
    const cab = M.B.porta.cabina;
    const ora = Date.now();
    /* Il motore non da' mai piu' di un decimo di secondo a fotogramma, ma su una
       macchina lenta fra un fotogramma e l'altro ne passa di piu' — e la stanza piatta
       intanto e' andata avanti. Chi la segue fa allora piu' passi corti in un giro
       solo: se no resterebbe indietro di mezza stanza, a camminare al rallentatore. */
    const vero = ultimo ? clamp(t - ultimo, dt, 1) : dt;
    ultimo = t;
    const volte = Math.min(10, Math.ceil(vero / 0.07));
    /** Chi sta parlando con chi: le persone di una stessa scena (`data-scena`, room.js). */
    const scene = new Map();

    // --- primo giro: si legge la stanza piatta. E' tutto qui quello che si sa di ognuno.
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
      P.el = el;
      P.l = l;
      P.tp = tp;
      const cl = el.classList;
      const I = P.I;

      // Quanto si e' mosso, e dove sta andando: la meta del tratto la scrive room.js nello stile.
      const vel = Math.hypot(fx - P.fx, fy - P.fy) / vero;
      I.fx = fx;
      I.fy = fy;
      I.tx = (parseFloat(el.style.left) || 0) + 8;
      I.ty = (parseFloat(el.style.top) || 0) + 24;
      I.fermo = vel <= 3 && Math.hypot(fx - I.tx, fy - I.ty) < 1.5;
      I.posto = sedile(I.tx, I.ty);
      I.sosta = I.posto ? null : sosta(I.tx, I.ty);
      if (I.sosta && I.sosta.tipo === 'rastrelliera') I.sosta.p = tazzaDiTurno();
      // La sua scrivania e' l'ultima a cui e' andato a sedersi. Se sopra c'e' la tazza che
      // si e' portato dal bar, e' da quella che beve; e la tazza la porta con la mano
      // dalla parte dove li' la posa, che nella meta' a specchio e' l'altra.
      if (I.posto && I.posto.tipo === 'banco') P.casa = I.posto.i;
      const casa = P.casa == null ? null : M.B.banchi[P.casa];
      I.piena = !!casa && conto.piene.has(casa.i);
      I.manoTazza = casa && casa.mir ? 0 : 1;
      if (I.sosta) I.sosta = diFianco(P, I, I.sosta);
      I.soglia = cl.contains('soglia');
      I.cabina = cab;
      I.passo = cl.contains('archivio') ? 2 : 1;
      I.calmo = calmo;

      // Cosa ha addosso: e' il modo in cui la stanza piatta dice cosa sta facendo.
      I.parla = I.tazza = I.foglio = I.faldone = false;
      I.tazze = 0;
      let annaffia = false;
      for (const c of el.children) {
        const k = c.className;
        if (typeof k !== 'string') continue;
        if (k.includes('of-say')) I.parla = true;
        else if (k.includes('of-tazza')) {
          I.tazza = true;
          // Chi le ha appena lavate ne riporta piu' d'una (`data-n`).
          I.tazze = Number(c.dataset.n) || 1;
        }
        else if (k.includes('of-note')) I.foglio = true;
        else if (k.includes('of-faldone')) I.faldone = true;
        else if (k.includes('of-annaffia')) {
          annaffia = true;
          c.style.visibility = 'hidden';
        } else if (k.includes('of-bubble')) ritocca(c, P.rimpicciolisce || 1, '0 0');
        else if (k.includes('of-crunch')) ritocca(c, P.rimpicciolisce || 1, '100% 0');
        else if (k.includes('of-ring')) ritocca(c, (P.rimpicciolisce || 1) * 1.15, '50% 50%');
      }
      const busy = cl.contains('busy');
      I.ferma = !busy && !cl.contains('recent') && !cl.contains('done');
      I.chiede = cl.contains('asking');
      I.festa = cl.contains('festa');
      I.stretta = cl.contains('crunch');
      I.ritmo = busy ? 1 : cl.contains('recent') ? 0.55 : 0.35;
      // Al suo posto lavora chi ha la posa di chi lavora; e chi lavora da piu' di dieci
      // minuti (`data-da`, office.js) si e' messo a leggere.
      I.fa = body.dataset.posa === 'digita' ? 'digita' : '';
      if (I.fa && busy && el.dataset.da && ora - el.dataset.da > LIBRO_DOPO) I.fa = 'legge';
      // Il gesto che la stanza piatta gli ha messo addosso, e da quando.
      I.gesto = el.dataset.gesto || (annaffia ? 'annaffia' : '');
      if (I.gesto !== P.gestoEra) {
        P.gestoEra = I.gesto;
        I.gestoDa = t;
      } else if (I.gesto && I.sosta && Math.hypot(P.x - I.sosta.x, P.y - I.sosta.y) > 5) {
        // Il gemello piatto e' arrivato un metro prima: il gesto comincia quando ci arriva la figura.
        I.gestoDa = t;
      }
      P.scena = el.dataset.scena || '';
      if (P.scena) scene.has(P.scena) ? scene.get(P.scena).push(P) : scene.set(P.scena, [P]);
    }

    // --- secondo giro: ognuno bada a qualcosa, si sposta, si mette in posa, e si porta dietro il suo bottone
    for (const [el, P] of vivi) {
      const I = P.I;
      // Uscito dalla porta: il bottone non c'e' piu', ma lui finisce di entrare in cabina.
      if (!visti.has(el)) {
        if (!I.soglia || !P.visibile || (P.addio = P.addio || t) < t - 2.5) {
          muore(el, P);
          continue;
        }
        I.fermo = true;
        I.guarda = I.animale = null;
        I.parla = I.chiede = false;
      } else {
        // A cosa bada: a chi gli parla, a te se ti aspetta, alla bestia che lo chiama, a chi gli passa accanto.
        const compagni = P.scena ? scene.get(P.scena) : null;
        let altro = null;
        if (compagni) for (const Q of compagni) if (Q !== P && (!altro || Q.I.parla)) altro = Q;
        I.ascolta = !!altro && !I.parla;
        const aTe = I.chiede || (I.parla && !altro);
        if (!calmo && P.sit >= 1 && !I.ferma && I.ritmo < 1 && t > P.prossima) {
          // Chi non ha Claude che macina ogni tanto alza gli occhi verso di te: e' il momento in cui gli si vede la faccia.
          if (P.prossima) P.occhiata = t + 1.6 + Math.random() * 1.4;
          P.prossima = t + 8 + Math.random() * 12;
        }
        const occhiata = t < P.occhiata && !altro;
        const att = M.animali && M.animali.attenzioni ? M.animali.attenzioni.get(P) : null;
        I.animale = att && att.forza > 0.01 && !I.chiede && !I.parla && !altro ? att : null;
        if (!calmo && !altro && !aTe && !I.animale && P.amp < 0.2 && t > P.badaPoi) {
          let chi = null;
          let quanto = 58;
          for (const Q of vivi.values()) {
            if (Q === P || Q.amp < 0.6 || !Q.visibile) continue;
            const d = Math.hypot(Q.x - P.x, Q.y - P.y);
            if (d < quanto && Math.abs(corto(P.a, Math.atan2(Q.x - P.x, Q.y - P.y))) < 1.9) {
              quanto = d;
              chi = Q;
            }
          }
          if (chi) {
            // Chi sta battendo fitto alza la testa una volta su tre.
            P.bada = I.ritmo >= 1 && I.fa && Math.random() < 0.65 ? null : chi;
            P.badaFino = t + 1.1 + 1.3 * Math.random();
            P.badaPoi = P.badaFino + 4 + 7 * Math.random();
          }
        }
        if (P.bada && (t > P.badaFino || P.bada.morta || altro || aTe)) P.bada = null;
        const Q = altro || P.bada;
        I.guarda = Q ? [Q.x, Q.y, (Q.alta || ALTA) - 7] : aTe || occhiata ? [P.x, P.y + 300, (P.alta || ALTA) + 70] : null;
        // Seduto, verso chi gli parla (o verso di te) gira anche la sedia.
        P.verso = altro ? Math.atan2(altro.x - P.x, altro.y - P.y) : 0;
        // E chi legge gira un po' la sedia, come si fa per mettersi comodi: e' anche cosi' che da qui si vede il libro.
        P.cam = verso(P.cam, aTe || (altro && I.parla) ? 1 : altro ? 0.7 : occhiata ? 0.55 : I.fa === 'legge' ? 0.4 : 0, vero * 2.2);
        // In piedi e fermo, da che parte sta girato: verso chi gli parla, verso di te, verso chi ha seduto accanto.
        I.fronte = altro ? P.verso : aTe ? 0 : daFermo(P);
      }

      // La stanza rimontata ha sedie nuove al posto delle vecchie: la sua e' quella allo stesso posto.
      if (P.posto && !M.B.posti.includes(P.posto)) P.posto = M.B.posti[P.postoN] || null;
      for (let i = 0; i < volte; i++) sposta(P, I, vero / volte, vero);
      P.postoN = P.posto ? M.B.posti.indexOf(P.posto) : -1;
      atteggia(P, I, t, vero);
      // Ferma da un pezzo: sbiadita, come la sua gemella piatta.
      const tinta = verso(P.tinta, I.ferma ? 0.5 : 1, vero * 2);
      if (tinta !== P.tinta || !P.alta) P.fig.tinta((P.tinta = tinta));
      const fig = P.fig;
      fig.g.position.set(P.x, 0, P.y);
      fig.g.rotation.y = P.a;
      fig.g.visible = P.visibile;
      P.alta = fig.alta;
      if (!visti.has(el)) continue;

      // --- e il suo bottone, esatto sulla figura: i piedi sui piedi, la testa sulla testa
      const piedi = proietta(P.x, P.y, 0);
      const cima = proietta(P.x, P.y, P.alta);
      P.px = Math.max(1, piedi.y - cima.y);
      P.sx = piedi.x;
      P.sy = piedi.y;
      metti(el, P.l, P.tp, 16, 24, piedi.x, piedi.y, P.px / 24, 'giu');
      // Quanto vanno rimpiccioliti i suoi figli per restare grandi com'erano: la figura
      // di prima era alta ventiquattro unita' e spicci, vista da trenta gradi.
      P.rimpicciolisce = clamp((0.88 * piedi.s * 24) / P.px, 0.3, 1);
    }

    // Le sedie girano verso chi arriva e con chi ci sta seduto, e tornano dritte quando si alza.
    for (const q of M.B.posti) {
      if (!q.sedia) continue;
      let a = q.a;
      let k = 8;
      for (const P of vivi.values()) {
        if (P.posto !== q || P.sedia == null) continue;
        a = P.sedia;
        if (P.sit > 0) k = 40;
      }
      q.sedia.rotation.y += corto(q.sedia.rotation.y, a) * Math.min(1, vero * k);
    }
  }

  /** Da che parte sta girato chi e' fermo in piedi senza niente da fare: verso chi ha seduto accanto, o un po' verso chi gli sta vicino — ma sempre con la faccia a chi guarda. */
  function daFermo(P) {
    let seduto = null;
    let vicino = null;
    let qs = 62;
    let qv = 62;
    for (const Q of vivi.values()) {
      if (Q === P || !Q.visibile) continue;
      const d = Math.hypot(Q.x - P.x, Q.y - P.y);
      if (Q.sit >= 1 && d < qs) {
        qs = d;
        seduto = Q;
      } else if (Q.sit <= 0 && d < qv) {
        qv = d;
        vicino = Q;
      }
    }
    if (seduto && P.I.fa) return Math.atan2(seduto.x - P.x, seduto.y - P.y);
    if (vicino) return 0.55 * Math.sign(vicino.x - P.x || 1);
    return (P.n - 0.5) * 0.7;
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
       la curva). Quindi qui la busta e' un pezzo disegnato: i capi si leggono dal
       sentiero scritto addosso al nodo, e a che punto e' lo dice `offset-distance`
       mentre l'animazione gira. La campata la rifa' la stanza, in altezza vera, e in
       volo la busta dondola un poco. */
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
      m.position.set(lerp(s.a.x, s.b.x, w), lerp(s.a.z, s.b.z, w) + Math.sin(Math.PI * w) * 44, lerp(s.a.y, s.b.y, w));
      m.quaternion.copy(M.vista.q);
      if (!M.calmo) m.rotateZ(0.22 * Math.sin(w * 9 + i));
      m.material.color.set(s.c);
      m.material.opacity = parseFloat(cs.opacity);
    });
  }

  /** Le mani di chi sta in piedi: da li' parte, e li' arriva, quello che vola. */
  const MANI = 22;
  /** Un punto «a mezz'aria» della stanza piatta: sulla faccia di un mobile del muro, o all'altezza delle mani. */
  function aria(x, y) {
    const m = appeso(x, y);
    return m ? { x, y: m.yf, z: m.fz(m.b - y) } : { x, y: y + 12, z: MANI };
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
    // Appeso a un mobile del muro: sulla sua faccia. Su una scrivania: sul piano, nel
    // punto sgombro che la scrivania stessa indica — la postazione e' girata, e il
    // posto che la cosa ha nella stanza piatta cadrebbe sotto lo schermo; due cose
    // sullo stesso piano si mettono in fila verso il fondo. Il resto: in piedi per terra.
    const m = appeso(x, y);
    let p;
    if (m) p = proietta(x, m.yf, m.fz(m.b - y));
    else {
      const b = M.B.banchi.find((d) => x >= d.x && x <= d.x + R.SW && y > d.b - R.SH && y <= d.b);
      if (b) {
        const T = b.top;
        const k = ((x - b.x) / R.SW - 0.5) * 0.45 * T.d;
        p = proietta(T.libero[0] + Math.sin(T.a) * k, T.libero[1] + Math.cos(T.a) * k, T.z);
      } else p = proietta(x, y, 0);
    }
    metti(el, l, t, w, h, p.x, p.y, p.s, 'giu');
  }

  /** Quanto sta sopra il piano la cima di uno schermo, in unita' di stanza. */
  const SCHERMO_ALTO = 19;
  /** Quanto resta fra una targhetta e la cosa che indica, in pixel di scheda: e' il posto della sua codina. */
  const CODINA = 7;

  function nodi() {
    // --- le targhette. Sono della scrivania, come nella stanza piatta — ma con la
    //     camera cosi' bassa fra una fila e l'altra non c'e' il posto di un nome:
    //     quella della fila dietro sta sopra il suo schermo, quella della fila davanti
    //     per terra davanti alla sua postazione. Ognuna accanto al suo banco, nessuna
    //     sopra la testa di chi siede, e tutte dentro la scheda. Chi non ha una
    //     scrivania (siede a un tavolo) la porta sopra la testa, dov'e' adesso.
    for (const el of stage.querySelectorAll('.of-plate')) {
      if (el.hidden) continue;
      const pl = parseFloat(el.style.left);
      const pt = parseFloat(el.style.top);
      const b = M.B.banchi.find((d) => Math.abs(pl - (d.x + R.SW / 2)) < 1 && Math.abs(pt - (d.b - R.SH - 20)) < 1);
      const sotto = !!b && !b.sopra;
      let p;
      if (sotto) p = proietta(b.x + R.SW / 2, b.b + 9, 0);
      else if (b) p = proietta(b.mon[0], b.mon[1], b.top.z + SCHERMO_ALTO);
      else {
        const P = vivi.get(el.nextElementSibling);
        p = P && P.alta ? proietta(P.x, P.y, P.alta + 4) : proietta(pl, pt + 44, ALTA + 4);
      }
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      // La scritta fra i dieci e i quattordici pixel, qualunque sia la scheda: sotto
      // non si legge, sopra la targhetta copre la scrivania di cui parla. Ma mai piu'
      // larga del passo fra due scrivanie (ottanta): in una scheda piccola due nomi
      // piccoli si leggono meglio di due nomi uno sull'altro.
      const s = clamp(p.s * 0.68, Math.min(1.75, (74 * p.s) / w), 2.3);
      const x = clamp(p.x, (w * s) / 2 + 4, M.largo - (w * s) / 2 - 4);
      const y = sotto ? clamp(p.y + CODINA, 4, M.alto - h * s - 4) : clamp(p.y - CODINA, h * s + 4, M.alto - 4);
      // Da che parte sta la codina lo decide il foglio di stile (office.css), che lo legge da qui.
      const verso = sotto ? 'sotto' : 'sopra';
      if (el.dataset.tre !== verso) el.dataset.tre = verso;
      metti(el, el.offsetLeft, el.offsetTop, w, h, x, y, s, sotto ? 'su' : 'giu');
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
    for (const sel of ['.of-bacheche', '.of-crowd']) {
      const box = stage.querySelector(sel);
      if (!box) continue;
      for (const el of box.children) {
        const c = el.className;
        if (typeof c !== 'string' || c.includes('of-guy') || c.includes('of-plate')) continue;
        cartoncino(el);
      }
    }
    nuvolette();
  }

  /**
   * Le nuvolette. Nella stanza piatta la nuvoletta e' figlia del bottone di chi parla
   * e gli sta sopra la testa; qui quel bottone lo specchio lo sposta e lo scala a ogni
   * fotogramma — il respiro, i tasti, la sedia che gira — e una nuvoletta che gli va
   * dietro trema. Allora il suo posto si decide una volta sola: sopra la testa, e se
   * li' c'e' una targhetta (quella della fila dietro sta sopra lo schermo, cioe'
   * accanto alla testa di chi ci siede) sopra la targhetta, o sotto se sopra non c'e'
   * posto. Da li' non si muove piu': a ogni giro le si toglie di dosso quanto il
   * bottone si e' mosso e ingrandito.
   *
   * Il posto e' sopra una testa ferma. Chi arriva parla appena arrivato di la', e la
   * sua figura arriva un attimo dopo: la nuvoletta l'aspetta nascosta, ed entra quando
   * lei si e' fermata, in tempo per uscire quando la toglie la stanza piatta. Chi se ne
   * va non se la porta dietro: lei resta dov'e' e sfuma prima del tempo. La stanza
   * rimontata (la scheda tirata, un'altra pelle) e' un posto nuovo: la si rimette, una
   * volta.
   */
  const nate = new WeakMap();
  function nuvolette() {
    let tetto = null;
    let targhe = null;
    for (const n of stage.querySelectorAll('.of-guy > .of-say')) {
      const P = vivi.get(n.parentElement);
      if (!P || !P.px) continue;
      const k = P.px / 24;
      // Come entra e come se ne va (of-fiato, room.css). Con le animazioni ridotte non c'e' (office.css).
      const a = n.getAnimations()[0];
      const dura = a ? a.effect.getComputedTiming().duration : 0;
      let N = nate.get(n);
      if (!N) nate.set(n, (N = {}));
      // (Quella di chi se n'e' andato non si rimette: sta sfumando dov'era.)
      if (!N.via && (N.B !== M.B || N.misura !== M.largo + 'x' + M.alto)) {
        // La prima volta aspetta che chi parla sia arrivato: la gemella piatta ferma, e
        // la figura seduta, se va a sedersi, o ferma in piedi. Se e' passata mezza frase,
        // era una frase detta passando: non entra piu'.
        const arrivato = P.I.fermo && (P.I.posto ? P.sit >= 1 : !(P.amp > 0.2));
        if (!N.B && (!arrivato || (a && a.currentTime > dura / 2))) {
          n.style.visibility = 'hidden';
          N.attesa = true;
          continue;
        }
        if (tetto == null) {
          tetto = M.wrap.getBoundingClientRect().top;
          targhe = [...stage.querySelectorAll('.of-plate')].filter((b) => !b.hidden).map((b) => b.getBoundingClientRect());
          // Dal basso in su: chi sale sopra una targhetta trova dopo quelle che le stanno sopra.
          targhe.sort((b, c) => c.bottom - b.bottom);
        }
        // Appesa all'angolo verso la testa di chi parla (verso i piedi, se sta `sotto`):
        // e' da li' che si rimpicciolisce, ed e' quello che resta fermo.
        const ox = n.classList.contains('sx') ? 1 : 0;
        const oy = n.classList.contains('sotto') ? 0 : 1;
        n.style.transformOrigin = ox * 100 + '% ' + oy * 100 + '%';
        n.style.scale = P.rimpicciolisce.toFixed(4);
        // Misurata dov'e' di suo: senza lo spostamento di prima, e senza il saltello di of-fiato.
        n.style.setProperty('translate', '0px 0px', 'important');
        const r = n.getBoundingClientRect();
        const S = k * P.rimpicciolisce;
        // Fra lei e una targhetta resta almeno la codina (due pixel suoi), e un filo d'aria.
        const codina = 2 * S;
        let dy = 0;
        for (const b of targhe) {
          if (r.right < b.left + 1 || r.left > b.right - 1 || r.bottom + dy + codina < b.top || r.top + dy - codina > b.bottom) continue;
          dy = b.top - codina - 3 - r.bottom + r.top > tetto + 2 ? b.top - codina - 3 - r.bottom : b.bottom + codina + 3 - r.top;
        }
        // Quell'angolo rispetto ai piedi del bottone, in pixel di bottone; e dove deve stare sulla scheda.
        N.ax = n.offsetLeft + ox * n.offsetWidth - 8;
        N.ay = n.offsetTop + oy * n.offsetHeight - 24;
        N.x = P.sx + k * N.ax;
        N.y = P.sy + k * N.ay + dy;
        N.S = S;
        N.B = M.B;
        N.misura = M.largo + 'x' + M.alto;
        N.dove = [P.I.tx, P.I.ty];
        N.tr = N.sc = '';
        if (N.attesa) {
          // E' rimasta nascosta: entra adesso, e fa in tempo a uscire prima che la stanza piatta la tolga.
          N.attesa = false;
          n.style.visibility = '';
          if (a) {
            a.playbackRate = dura / (dura - a.currentTime);
            a.currentTime = 0;
          }
        }
      }
      ferma(n, N, P, P.sx, P.sy);
      // Chi parla se ne va (la stanza piatta l'ha gia' mandato altrove): lei sfuma da
      // adesso, dall'85% dove comincia a sfumare da sola.
      if (!N.via && Math.hypot(P.I.tx - N.dove[0], P.I.ty - N.dove[1]) > 1.5) {
        N.via = true;
        if (a) a.currentTime = Math.max(a.currentTime, dura * 0.85);
        else n.style.visibility = 'hidden';
        tiene = tiene || requestAnimationFrame(tieni);
      }
    }
  }
  /**
   * La nuvoletta al suo posto, col bottone che ha i piedi in (fx, fy) sulla scheda: alto
   * quanto la figura, un pixel suo vale `k` pixel di scheda. Lo spostamento e' scritto
   * `important` perche' of-fiato (room.css) anima anche lui, col saltello d'ingresso, e
   * un'animazione vince su uno stile qualunque ma non su questo: cosi' in 3D sfuma
   * soltanto, ed e' la stessa animazione della stanza piatta — passando dall'una
   * all'altra non riparte da capo, e finisce quando la stanza piatta la toglie.
   */
  function ferma(n, N, P, fx, fy) {
    const k = P.px / 24;
    const tr = ((N.x - fx) / k - N.ax).toFixed(2) + 'px ' + ((N.y - fy) / k - N.ay).toFixed(2) + 'px';
    const sc = (N.S / k).toFixed(4);
    if (tr === N.tr && sc === N.sc) return;
    n.style.setProperty('translate', (N.tr = tr), 'important');
    n.style.scale = N.sc = sc;
  }
  /* Lo specchio gira trenta volte al secondo, ma il bottone di chi se ne va lo porta
     avanti a ogni fotogramma la transizione della stanza piatta: la sua nuvoletta, mentre
     sfuma, andrebbe avanti e indietro di un paio di pixel. Finche' ce n'e' una cosi', la
     si tiene ferma anche fra un giro e l'altro. */
  let tiene = 0;
  function tieni() {
    tiene = 0;
    for (const n of stage.querySelectorAll('.of-guy > .of-say')) {
      const N = nate.get(n);
      const P = vivi.get(n.parentElement);
      if (!N || !N.via || !P || !P.px) continue;
      const cs = getComputedStyle(n.parentElement);
      ferma(n, N, P, P.sx + (parseFloat(cs.left) - P.l) * geo.k, P.sy + (parseFloat(cs.top) - P.tp) * geo.k);
      tiene = tiene || requestAnimationFrame(tieni);
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
      conta();
      persone(t, dt);
      bar(t);
      nodi();
    },
    /** Quello che del bar si vede adesso, per i controlli: le tazze accese sulla rastrelliera, nel lavandino e sulle scrivanie, il getto, l'acqua. */
    bar() {
      const b = M.B.bar;
      const accese = (l) => l.filter((g) => g.visible).length;
      return {
        pulite: accese(b.tazze),
        sporche: b.lavandino ? accese(b.lavandino.sporche) : 0,
        piene: M.B.banchi.filter((d) => d.tazza.visible).map((d) => d.i),
        getto: !!b.macchina && b.macchina.getto.visible,
        sotto: !!b.macchina && b.macchina.tazza.visible,
        acqua: !!b.lavandino && b.lavandino.acqua.visible,
      };
    },
    /** Fuori dal giro: un nodo appena nato va messo a posto prima che lo si veda. */
    sistema() {
      misuraPalco();
      nodi();
    },
    smonta() {
      cancelAnimationFrame(tiene);
      for (const [el, P] of [...vivi]) muore(el, P);
      // Quello che il bottone si porta addosso torna alla misura e al posto che gli da' il foglio di stile.
      for (const n of stage.querySelectorAll('.of-guy > *')) n.style.scale = n.style.translate = n.style.transformOrigin = n.style.visibility = '';
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
