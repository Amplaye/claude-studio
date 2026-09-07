/* Claude Studio — L'ufficio.
 *
 * La pianta di un ufficio vista dall'alto, e dentro una persona per ogni
 * conversazione aperta: seduta alla sua scrivania, che batte a macchina mentre
 * Claude lavora, con la spunta verde quando ha finito, sbiadita quando e' ferma
 * da un pezzo. E che ogni tanto si alza, va a prendersi un caffe' e dice la sua.
 *
 * E' la stessa roba del pannello del contesto — stesse sessioni, stesso filo,
 * stesso "clicca e ci vai" — detta nell'unico modo che non chiede di leggere
 * niente. Il pannello risponde a "quanto contesto le resta"; questa risponde a
 * "chi c'e' e chi sta lavorando" dall'altra parte della stanza.
 *
 * La stanza — muri, mobili, scrivanie, dove si mettono i piedi, il giro di chi
 * si alza — sta in `room.js`, che si tiene anche il vestito in `room.css`. Qui
 * c'e' solo quello che la stanza non sa: chi sono le persone, come si chiamano,
 * quanto contesto gli resta e cosa succede se ci clicchi sopra. La pianta la
 * usano in due, questa pagina e la prova `docs/office-sv.html`, e due copie
 * della stessa pianta si scollano al primo mobile spostato.
 *
 * Due regole di casa:
 *   - niente innerHTML con dei dati: tutto passa da textContent;
 *   - si costruisce una volta e poi si ridipinge. Rifare i nodi a ogni giro
 *     ammazzerebbe le transizioni, e chi e' in corridoio si ritroverebbe
 *     teletrasportato alla scrivania a ogni aggiornamento.
 *
 * Non chiama acquireVsCodeApi: vive dentro la pagina della chat, che l'ha gia'
 * chiamata lei (una volta sola per pagina, e' l'unica che se ne puo' prendere).
 * Il filo glielo passa chi lo monta.
 */
window.OFFICE = (() => {
  const t = (key, vars) => window.I18N.t(key, vars);

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  /**
   * Il turno di chi c'e' oggi.
   *
   * Le facce nascono dal seme, e finche' il seme e' l'id della conversazione
   * l'ufficio ha per sempre la stessa faccia sulla stessa sedia: dopo la terza
   * apertura sembra una fotografia, non un posto. Il turno entra nel seme, cosi'
   * a ogni apertura della scheda tocca a un altro giro di gente — ma non cambia
   * finche' la scheda e' aperta, quindi dentro la stessa apertura ognuno resta
   * se stesso e la sua faccia non balla a ogni aggiornamento.
   */
  const TURNO = Math.floor(Math.random() * 8);
  const seme = (id) => id + '#' + TURNO;

  // ---------- la scena ----------
  let root;
  let stage;
  let crowd;
  let empty;
  let count;
  let chips;
  let chipS;
  let chipW;
  let boss;
  let bossFace;
  let bossName;
  let bossWhat;
  let scrivanie = [];
  let send = () => {};
  let last = null;
  /** id -> l'abitante, nella forma che vuole room.js piu' quello che serve qui. */
  const people = new Map();
  /** Chi siede dove: una volta preso il posto non lo si cambia a ogni giro. */
  let seats = [];

  function build(container, post) {
    root = container;
    send = post;
    root.textContent = '';

    // --- la fascia in cima ---
    const bar = el('header', 'of-bar');
    const title = el('span', 'of-lab');
    const titleText = document.createTextNode(t('office.title'));
    const ico = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ico.setAttribute('class', 'ico');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#ion-people');
    ico.appendChild(use);
    title.append(ico, titleText);
    count = el('span', 'of-count');
    chips = el('span', 'of-chips');
    chipS = el('span', 'of-chip');
    chipW = el('span', 'of-chip');
    chips.append(chipS, chipW);

    // Il bottone per tornare alla chat classica. Sta qui e non fra i comandi di
    // VS Code perche' l'ufficio riempie la scheda: quando ci sei dentro, questa
    // fascia e' l'unica cosa dell'estensione che vedi.
    const back = el('button', 'of-back');
    back.type = 'button';
    const backText = el('span', null, t('office.toChat'));
    const bico = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    bico.setAttribute('class', 'ico');
    const buse = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    buse.setAttribute('href', '#ion-chatbubble-ellipses');
    bico.appendChild(buse);
    back.append(bico, backText);
    back.onclick = () => send({ cmd: 'view', value: 'chat' });

    // Chi comanda il piano. Non e' un'altra card: e' la stessa persona che sta
    // seduta di la' in mezzo alle altre, disegnata grande abbastanza da vederla
    // in faccia — cosi' sai con chi stai parlando senza doverla cercare fra
    // sedici teste da sedici pixel.
    boss = el('div', 'of-boss');
    const face = el('span', 'of-face');
    bossFace = el('span', 'of-body');
    face.append(bossFace);
    bossName = el('span', 'of-boss-name');
    bossWhat = el('span', 'of-boss-what');
    const bossText = el('span', 'of-boss-text');
    bossText.append(bossName, bossWhat);
    boss.append(face, bossText);

    // Due gruppi e niente in mezzo: a sinistra dove sei e chi c'e', a destra i
    // consumi e la via d'uscita. Il vuoto stava fra il conteggio e il ritratto,
    // e lasciava il ritratto a galleggiare in mezzo alla fascia attaccato a
    // niente. Il ritratto e' la conversazione che hai davanti, quindi sta con il
    // resto di "chi c'e'", non da solo.
    bar.append(title, count, boss, el('span', 'of-grow'), chips, back);

    // --- il piano ---
    const wrap = el('div', 'of-wrap');
    stage = el('div', 'of-stage');

    // Gli sprite arrivano come URI della webview: il CSP non fa passare un
    // <style> scritto nella pagina, quindi la strada e' un data-attributo letto
    // di qui e messo in una variabile CSS. Assoluti, sempre: un indirizzo
    // relativo dentro una variabile CSS lo risolve il foglio di stile, non la
    // pagina — e il foglio sta in una cartella piu' giu'. Nella webview vera
    // arrivano gia' assoluti e questo non li tocca.
    const abs = (p) => (p ? new URL(p, document.baseURI).href : '');
    scrivanie = window.ROOM.monta(stage, abs(root.dataset.room));
    seats = new Array(scrivanie.length).fill(null);

    crowd = el('div', 'of-crowd');
    empty = el('div', 'of-nobody');
    stage.append(crowd, empty);

    wrap.append(stage);
    root.append(bar, wrap);

    new ResizeObserver(fit).observe(wrap);
    fitOn = wrap;
    fit();

    // La stanza vive per conto suo: la lista gliela si passa come funzione
    // perche' la gente va e viene, e chi e' in corridoio quando si chiude la sua
    // conversazione deve semplicemente sparire.
    window.ROOM.accendi(() => [...people.values()]);

    window.I18N.onChange(() => {
      titleText.nodeValue = t('office.title');
      backText.textContent = t('office.toChat');
      if (last) render(last);
    });
  }

  let fitOn;

  /**
   * La pianta e' in pixel fissi e si ingrandisce tutta insieme per riempire la
   * scheda. Il fattore si arrotonda a quarti: su pixel art un ingrandimento con
   * la virgola lunga fa mattonelle larghe una volta tre e una volta quattro, e
   * il pavimento comincia a ondeggiare.
   */
  function fit() {
    if (!fitOn) return;
    const raw = Math.min(fitOn.clientWidth / window.ROOM.W, fitOn.clientHeight / window.ROOM.H);
    const k = Math.max(0.5, Math.min(5, Math.floor(raw * 4) / 4));
    stage.style.transform = 'scale(' + k + ')';
  }

  // ---------- le persone ----------

  function buildPerson(s) {
    const b = el('button', 'of-guy');
    b.type = 'button';
    const who = el('span', 'of-body');

    const bubble = el('span', 'of-bubble');
    const dots = el('span', 'of-dots');
    dots.append(el('i'), el('i'), el('i'));
    const tick = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    tick.setAttribute('class', 'ico of-tick');
    const tuse = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    tuse.setAttribute('href', '#ion-checkmark');
    tick.appendChild(tuse);
    bubble.append(dots, tick);

    // La scatoletta del contesto quasi finito. Sta addosso alla persona e non
    // sulla targhetta perche' e' una cosa che succede a lei, non al suo posto.
    b.append(el('span', 'of-ring'), who, bubble, el('span', 'of-crunch'));
    b.onclick = () => send({ cmd: 'focus', id: s.id });

    // La targhetta non sta dentro la persona: sta sulla scrivania, e ci resta
    // anche quando chi ci lavora e' andato al bar. Appesa addosso se ne andava
    // in giro con lei, e mezza stanza si ritrovava un nome che le volava sopra
    // la testa.
    const plate = el('span', 'of-plate');
    const pname = el('span', 'of-name');
    const pbar = el('span', 'of-bar2');
    const pfill = el('span', 'of-fill');
    pbar.append(pfill);
    plate.append(pname, pbar);
    crowd.append(plate, b);

    // La forma che vuole room.js — `el`, `fig`, `seme`, `casa`, `posa`, `ferma`
    // — piu' quello che serve solo di qua.
    return {
      id: s.id,
      el: b,
      fig: who,
      seme: seme(s.id),
      casa: null,
      posa: 'fermo',
      ferma: false,
      plate,
      pname,
      pfill,
    };
  }

  // ---------- gli impiegati ----------
  //
  // Una conversazione e' un capo, e i sub-agent che apre sono i suoi impiegati.
  // Due schede aperte sono due capi, ognuno coi suoi: la gerarchia non e'
  // inventata per fare scena, e' quella vera — quei sub-agent li ha aperti quella
  // conversazione li', e nessun'altra.
  //
  // Sono gente di passaggio, ed e' il punto: entrano dalla porta quando il
  // sub-agent parte, si mettono accanto al capo che li ha chiamati, e riescono
  // dalla porta quando hanno finito. Una scrivania non gliela si da' — sono sei
  // in tutto e sono dei capi — e comunque quattro che si stringono attorno a un
  // tavolo dicono "questi lavorano per lui" meglio di quattro sparpagliati per
  // la stanza.
  //
  // Il legame e' gratis: la chiave del quadro delle task e' l'id della sessione,
  // cioe' lo stesso `id` che ha la card del capo.

  /** Quanti se ne tengono per capo. Oltre, sono una folla attorno a una scrivania. */
  const MAX_STAFF = 4;
  /**
   * Dove si mettono, in pixel dai piedi del capo: due per parte, nelle corsie fra
   * una colonna di scrivanie e l'altra.
   *
   * In fila sotto il capo era il posto ovvio ed era quello sbagliato: fra una
   * fila di scrivanie e l'altra ci sono settanta pixel, e ventisei se li prende
   * la targhetta di quella dopo — gli impiegati della prima fila finivano
   * scritti sopra il nome della seconda. Le corsie invece sono larghe
   * cinquantadue e non c'e' niente, che e' esattamente dove si sta in piedi in
   * un ufficio quando si e' fermi alla scrivania di qualcun altro.
   */
  const POSTI_STAFF = [
    [40, -10],
    [-40, -10],
    [40, 16],
    [-40, 16],
  ];

  /** L'ultimo quadro delle task, per id di conversazione. */
  let board = {};
  /** chiave `idCapo/idTask` -> l'impiegato. */
  const staff = new Map();

  function buildStaff(chiave, capo, it) {
    const b = el('span', 'of-guy of-staff busy');
    const who = el('span', 'of-body');
    const bubble = el('span', 'of-bubble');
    const dots = el('span', 'of-dots');
    dots.append(el('i'), el('i'), el('i'));
    bubble.append(dots);
    b.append(el('span', 'of-ring'), who, bubble);
    crowd.append(b);
    // Nasce sulla porta: da li' entra. La porta e' il muro in fondo in mezzo, ed
    // e' l'unico punto della pianta che non e' di nessuno.
    const [px, py] = window.ROOM.PORTA;
    b.style.left = px - 8 + 'px';
    b.style.top = py - 24 + 'px';
    b.style.zIndex = py;
    const chi = { chiave, el: b, fig: who, seme: capo.seme + '/' + (it.id || it.content) };
    window.ROOM.vesti(who, chi.seme, 'cammina');
    return chi;
  }

  /** Il posto di questo impiegato: nella corsia accanto al suo capo. */
  const postoStaff = (capo, i) => [
    capo.casa.x + 8 + POSTI_STAFF[i][0],
    capo.casa.y + 24 + POSTI_STAFF[i][1],
  ];

  /**
   * Chi c'e' adesso, capo per capo.
   *
   * Solo i sub-agent davvero in corso: uno "da fare" non e' ancora entrato in
   * ufficio, e uno finito se n'e' andato. E solo i capi seduti — chi e' in piedi
   * in fila non ha un posto attorno a cui mettere nessuno.
   */
  function volutiStaff() {
    const out = new Map();
    for (const [id, capo] of people) {
      if (!capo.casa) continue;
      const items = (board[id] && board[id].items) || [];
      const vivi = items.filter((it) => it.status === 'in_progress').slice(0, MAX_STAFF);
      vivi.forEach((it, i) => out.set(id + '/' + (it.id || it.content), { capo, it, i }));
    }
    return out;
  }

  async function entra(chi, capo, i) {
    chi.va = true;
    if (await window.ROOM.viaggio(chi.el, ...postoStaff(capo, i))) {
      window.ROOM.vesti(chi.fig, chi.seme, 'digita');
    }
    chi.va = false;
  }

  async function esce(chi) {
    chi.esce = true;
    window.ROOM.vesti(chi.fig, chi.seme, 'cammina');
    await window.ROOM.viaggio(chi.el, ...window.ROOM.PORTA);
    chi.el.remove();
    staff.delete(chi.chiave);
  }

  function paintStaff() {
    const voluti = volutiStaff();

    // Chi ha finito se ne va — ma per la porta, non svanendo: e' l'unica cosa che
    // fa vedere che un sub-agent e' finito invece che sparito.
    for (const [chiave, chi] of staff) {
      if (!voluti.has(chiave) && !chi.esce) esce(chi);
    }

    for (const [chiave, { capo, it, i }] of voluti) {
      let chi = staff.get(chiave);
      if (!chi) {
        chi = buildStaff(chiave, capo, it);
        staff.set(chiave, chi);
        entra(chi, capo, i);
      } else if (!chi.va && !chi.esce) {
        // Il posto puo' cambiare sotto i piedi: un fratello che finisce fa
        // scalare tutti gli altri di uno. Ci si sposta camminando, che a questa
        // misura sono venti pixel e non si nota, invece di teletrasportarsi.
        const [fx, fy] = postoStaff(capo, i);
        if (Math.abs(parseFloat(chi.el.style.left) + 8 - fx) > 2) entra(chi, capo, i);
      }
      const cosa = it.activeForm || it.content || '';
      chi.el.title = capo.pname.textContent + ' · ' + cosa;
      chi.el.setAttribute('aria-label', chi.el.title);
    }
  }

  /** Colore della barra: lo stesso semaforo del pannello. */
  const barColor = (p) =>
    p == null ? 'var(--line)' : p >= 80 ? 'var(--bad)' : p >= 60 ? 'var(--warn)' : 'var(--ok)';

  /** Sotto il minuto non si festeggia. */
  const TURNO_VERO = 60000;

  /**
   * La posta del turno, e la festa solo se il turno c'e' stata davvero.
   *
   * Parte una busta quando Claude comincia e una quando ha finito: e' il momento
   * del cambio, che uno schermo acceso da solo non racconta. Vanno da e verso la
   * porta perche' e' da li' che entri tu — l'unico mittente vero che ha questa
   * stanza.
   *
   * Il saltello invece si festeggia solo dopo un minuto di lavoro. Non e' una
   * soglia scelta a caso: senza, una conversazione che si sveglia e si riaddormenta
   * ogni due minuti fa festa ogni due minuti, e una stanza che esulta di continuo
   * ha appena smesso di dire che qualcosa e' stato fatto.
   */
  function turno(chi, s) {
    const era = !!chi.busy;
    // Il primo giro dopo l'apertura non e' un cambio: le conversazioni gia'
    // avviate arrivano tutte insieme, e sarebbero sei buste in faccia. Segnato
    // a ogni giro e non solo quando qualcosa cambia — chi arriva gia' fermo un
    // cambio non ce l'ha, e senza questa riga la sua prima busta non parte mai.
    const visto = chi.visto;
    chi.visto = true;
    chi.busy = !!s.busy;
    if (era === chi.busy) return;
    if (visto) {
      const p = chi.casa || { x: parseFloat(chi.el.style.left) || 0, y: parseFloat(chi.el.style.top) || 0 };
      window.ROOM.posta(stage, p.x + 8, p.y + 12, chi.busy ? 'su' : 'giu');
    }
    if (chi.busy) chi.da = Date.now();
    else chi.festa = chi.da != null && Date.now() - chi.da >= TURNO_VERO;
  }

  function paintPerson(chi, s, seat) {
    const b = chi.el;
    turno(chi, s);
    chi.posa = s.busy ? 'digita' : 'fermo';
    // Chi e' fermo da un pezzo non si alza e non parla: sbiadito e in giro
    // sarebbe una contraddizione.
    chi.ferma = !s.busy && !s.done && !s.recent;
    // E chi sta lavorando resta alla sua scrivania. Al bar ci si va quando non
    // c'e' niente da fare — la stanza legge questa riga e non fa alzare nessuno
    // che stia lavorando, e richiama a sedersi chi era gia' uscito.
    chi.lavora = !!s.busy;

    if (seat >= 0) {
      const d = scrivanie[seat];
      chi.casa = window.ROOM.posto(seat);
      chi.plate.hidden = false;
      chi.plate.style.left = d.x + window.ROOM.SW / 2 + 'px';
      chi.plate.style.top = d.top - 20 + 'px';
      chi.plate.style.zIndex = d.b;
    } else {
      // Finiti i posti si sta in piedi in fondo al salone, in fila lungo il muro:
      // e' il posto dove uno aspetta davvero che si liberi una scrivania. Chi sta
      // in piedi non ha una scrivania da cui alzarsi, quindi non gira per la
      // stanza — e la sua targhetta gli sta sopra la testa, non su un mobile.
      chi.casa = null;
      chi.plate.hidden = false;
      chi.plate.style.left = parseFloat(b.style.left) + 8 + 'px';
      chi.plate.style.top = parseFloat(b.style.top) - 20 + 'px';
      chi.plate.style.zIndex = 9000;
    }

    // Chi e' in giro non lo si sposta e non lo si riveste: ci pensa la stanza,
    // e riportarlo alla scrivania a ogni aggiornamento vorrebbe dire un
    // teletrasporto ogni due secondi.
    if (!chi.fuori) {
      if (chi.casa) {
        b.style.left = chi.casa.x + 'px';
        b.style.top = chi.casa.y + 'px';
        b.style.zIndex = chi.casa.y + 24;
      }
      window.ROOM.vesti(chi.fig, chi.seme, chi.posa);
    }

    b.classList.toggle('own', !!s.own);
    b.classList.toggle('busy', !!s.busy);
    b.classList.toggle('done', !s.busy && !!s.done);
    b.classList.toggle('recent', !s.busy && !s.done && !!s.recent);
    b.classList.toggle('focused', !!s.focused);
    // Il saltello e' della festa, non del "finito": la spunta la mette sempre.
    b.classList.toggle('festa', !s.busy && !!s.done && !!chi.festa);
    // Il contesto quasi finito. Ottantacinque e non ottanta: a ottanta ci arriva
    // mezza stanza e la scatoletta smette di voler dire qualcosa.
    b.classList.toggle('crunch', s.pct != null && s.pct >= 85);
    chi.plate.classList.toggle('focused', !!s.focused);
    chi.pname.textContent = s.name;
    chi.pfill.style.width = (s.pct == null ? 0 : Math.max(0, Math.min(100, s.pct))) + '%';
    chi.pfill.style.background = barColor(s.pct);
    const state = s.busy
      ? t('ctx.busy')
      : s.done
        ? t('ctx.done')
        : s.recent
          ? t('ctx.recent')
          : t('ctx.idle');
    const label = t('office.who', { name: s.name, state, pct: s.pct == null ? '—' : s.pct + '%' });
    b.title = label;
    b.setAttribute('aria-label', label);
  }

  function render(d) {
    if (!d || !root) return;
    last = d;
    const list = d.cards || [];

    // Chi non c'e' piu' libera la scrivania.
    const live = new Set(list.map((s) => s.id));
    seats.forEach((id, i) => {
      if (id && !live.has(id)) seats[i] = null;
    });
    for (const [id, chi] of [...people]) {
      if (!live.has(id)) {
        chi.el.remove();
        chi.plate.remove();
        people.delete(id);
      }
    }

    let spare = 0;
    for (const s of list) {
      let chi = people.get(s.id);
      if (!chi) {
        chi = buildPerson(s);
        people.set(s.id, chi);
      }
      let seat = seats.indexOf(s.id);
      if (seat < 0) {
        seat = seats.indexOf(null);
        if (seat >= 0) seats[seat] = s.id;
      }
      if (seat < 0 && !chi.fuori) {
        // In fila lungo il muro in fondo, dove il corridoio e' libero. Sei per
        // fila e distanti cinquantaquattro: e' la larghezza della targhetta,
        // ed e' quella a decidere, non la persona — piu' stretti i nomi si
        // coprono a vicenda e la fila diventa una macchia bianca. Si parte da
        // cinquantasei per non finire dentro la pianta dell'angolo.
        // ponytail: oltre una fila si va a capo, e la seconda fila finisce
        // addosso alle scrivanie. Tredici conversazioni insieme non le ha nessuno.
        chi.el.style.left = 56 + (spare % 6) * 54 + 'px';
        chi.el.style.top = 266 - Math.floor(spare++ / 6) * 26 + 'px';
        chi.el.style.zIndex = parseFloat(chi.el.style.top) + 24;
      }
      paintPerson(chi, s, seat);
    }

    // Il monitor acceso e' della scrivania, non della persona: e' quello che si
    // vede per primo entrando, e da lontano dice gia' chi sta lavorando.
    scrivanie.forEach((dk, i) => {
      const s = seats[i] ? list.find((x) => x.id === seats[i]) : null;
      dk.mon.classList.toggle('on', !!s);
      dk.mon.classList.toggle('working', !!s?.busy);
    });

    // Il ritratto in cima: la conversazione che stai guardando, o — se non ne
    // stai guardando nessuna — quella che ha lavorato per ultima, che e' quella
    // a cui torneresti.
    const head = list.find((s) => s.focused) || list.find((s) => s.busy) || list[0];
    boss.hidden = !head;
    if (head) {
      window.ROOM.vesti(bossFace, seme(head.id), head.busy ? 'digita' : 'fermo');
      bossName.textContent = head.name;
      bossWhat.textContent = head.busy
        ? t('ctx.busy')
        : head.done
          ? t('ctx.done')
          : head.recent
            ? t('ctx.recent')
            : t('ctx.idle');
      boss.classList.toggle('busy', !!head.busy);
    }

    // Gli impiegati stanno accanto al loro capo, e il capo si e' appena seduto:
    // se una conversazione ha cambiato scrivania — o l'ha appena presa — i suoi
    // devono seguirla.
    paintStaff();

    count.textContent = t('office.count', { n: list.length });
    empty.textContent = t('office.empty');
    empty.hidden = list.length > 0;

    const pct = (v) => (v == null ? '—' : Math.round(v) + '%');
    chipS.textContent = t('office.session', { pct: pct(d.usage?.session) });
    chipW.textContent = t('office.week', { pct: pct(d.usage?.week) });
    chips.hidden = !d.usage;
  }

  return {
    /** Si monta una volta sola, dentro il contenitore che gli da' la pagina. */
    mount(container, post) {
      if (!root) build(container, post);
    },
    render,
    /**
     * Il quadro delle task, cioe' i sub-agent aperti da ogni conversazione.
     *
     * Arriva a parte dal resto perche' cambia al ritmo di Claude e non a quello
     * dei consumi, ed e' la stessa chiave: `board[idConversazione]`.
     */
    renderTasks(d) {
      board = d || {};
      if (root) paintStaff();
    },
    /** Tornato a schermo dopo essere stato via: la misura di prima non vale piu'. */
    resize: fit,
  };
})();
