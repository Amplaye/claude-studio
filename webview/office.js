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

    // La targhetta sta addosso a chi la porta, e la segue dove va: e' cosi' che
    // si legge una pianta d'ufficio, ed e' l'unico posto che le resta ora che le
    // file sono strette — sul piano della scrivania c'e' il monitor. Di chi sia
    // quel posto lo dice lo schermo acceso, che resta acceso anche mentre lei e'
    // al bar. Attaccata al bottone si sposta da sola: due elementi con due
    // transizioni loro si scollavano a meta' corridoio.
    const plate = el('span', 'of-plate');
    const pname = el('span', 'of-name');
    const pbar = el('span', 'of-bar2');
    const pfill = el('span', 'of-fill');
    pbar.append(pfill);
    plate.append(pname, pbar);

    b.append(el('span', 'of-ring'), who, bubble, plate);
    b.onclick = () => send({ cmd: 'focus', id: s.id });
    crowd.append(b);

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

  /** Colore della barra: lo stesso semaforo del pannello. */
  const barColor = (p) =>
    p == null ? 'var(--line)' : p >= 80 ? 'var(--bad)' : p >= 60 ? 'var(--warn)' : 'var(--ok)';

  function paintPerson(chi, s, seat) {
    const b = chi.el;
    chi.posa = s.busy ? 'digita' : 'fermo';
    // Chi e' fermo da un pezzo non si alza e non parla: sbiadito e in giro
    // sarebbe una contraddizione.
    chi.ferma = !s.busy && !s.done && !s.recent;
    // E chi sta lavorando resta alla sua scrivania. Al bar ci si va quando non
    // c'e' niente da fare — la stanza legge questa riga e non fa alzare nessuno
    // che stia lavorando, e richiama a sedersi chi era gia' uscito.
    chi.lavora = !!s.busy;

    // Chi sta in piedi non ha una scrivania da cui alzarsi, quindi non gira per
    // la stanza.
    chi.casa = seat >= 0 ? window.ROOM.posto(seat) : null;

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
        // In fila nel corridoio, che e' l'unica fascia di pavimento libera in
        // tutta la stanza — ed e' anche il posto dove uno aspetta davvero che si
        // liberi una scrivania. Sei per fila e distanti sessanta: e' la
        // larghezza della targhetta a decidere, non la persona — piu' stretti i
        // nomi si coprono a vicenda e la fila diventa una macchia bianca.
        // ponytail: oltre una fila si va a capo, e la seconda finisce nel muro.
        // Diciannove conversazioni insieme non le ha nessuno.
        chi.el.style.left = 40 + (spare % 6) * 60 + 'px';
        chi.el.style.top = 138 - Math.floor(spare++ / 6) * 26 + 'px';
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
    /** Tornato a schermo dopo essere stato via: la misura di prima non vale piu'. */
    resize: fit,
  };
})();
