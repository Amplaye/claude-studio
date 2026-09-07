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
    // I foglietti stanno appesi ai muri, quindi sotto la gente: uno che passa
    // davanti alla bacheca la copre, ed e' giusto cosi'.
    bacheche = el('div', 'of-bacheche');
    empty = el('div', 'of-nobody');
    stage.append(bacheche, crowd, empty);

    wrap.append(stage);
    root.append(bar, wrap);

    new ResizeObserver(fit).observe(wrap);
    fitOn = wrap;
    fit();

    // La stanza vive per conto suo: la lista gliela si passa come funzione
    // perche' la gente va e viene, e chi e' in corridoio quando si chiude la sua
    // conversazione deve semplicemente sparire.
    window.ROOM.accendi(() => [...people.values()]);
    // E chi lavora per qualcuno tiene d'occhio il suo capo.
    setInterval(aura, GIRO_AURA);

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
    // Nasce davanti alla bacheca, non sulla porta: un sub-agent non arriva da
    // fuori, viene fuori da una cosa da fare — e quella cosa da fare e' li'
    // appesa. Il primo gesto e' staccarla.
    const [px, py] = window.ROOM.BACHECHE.muro.posto;
    b.style.left = px - 8 + 'px';
    b.style.top = py - 24 + 'px';
    b.style.zIndex = py;
    const nome = it.id || it.content;
    const chi = { chiave, capoId: capo.id, nome, el: b, fig: who, seme: capo.seme + '/' + nome };
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

  /** Il tempo che ci vuole a staccare un foglietto da una bacheca. */
  const GESTO = 900;
  const attesa = (ms) => new Promise((r) => setTimeout(r, ms));

  /**
   * Stacca il suo foglietto dalla bacheca e va a mettersi al lavoro.
   *
   * Il gesto non e' scenografia: il foglietto che uno stacca dal muro e si porta
   * dietro e' il modo in cui una bacheca dice a chi tocca. Senza, la nota
   * salterebbe da una parte all'altra da sola, e una bacheca dove i foglietti si
   * spostano per conto loro non e' una bacheca, e' un grafico.
   */
  async function entra(chi, capo, i) {
    chi.va = true;
    try {
      if (!chi.foglio) {
        await attesa(GESTO);
        // Da qui in poi il foglietto e' suo: sta appeso addosso e cammina con
        // lui. E finche' ce l'ha in mano dalla bacheca sparisce — se no lo stesso
        // foglio sarebbe appeso al muro e in mano a qualcuno nello stesso momento.
        if (!chi.el.isConnected) return;
        chi.foglio = el('span', 'of-note mano');
        chi.el.append(chi.foglio);
        paintBacheche();
      }
      window.ROOM.vesti(chi.fig, chi.seme, 'cammina');
      if (await window.ROOM.viaggio(chi.el, ...postoStaff(capo, i))) {
        window.ROOM.vesti(chi.fig, chi.seme, 'digita');
      }
    } finally {
      // Qualunque cosa succeda per strada, "sta arrivando" deve smettere di
      // essere vero: chi resta in arrivo per sempre non se ne va piu'.
      chi.va = false;
    }
  }

  /**
   * Finito: porta il suo foglietto dov'e' andato a finire, e se ne va.
   *
   * Sul tavolo dell'archivio se e' andata bene, di nuovo sulla bacheca — rosso —
   * se e' andata storta. Ed e' li' che il foglio ricompare dove deve stare: non
   * c'e' nessuna copia in ritardo da tenere in pari con nessun registro, perche'
   * il foglio e' uno solo e sta dove sta la persona che lo porta.
   */
  async function esce(chi) {
    chi.esce = true;
    // Prima si aspetta che abbia finito di arrivare. Un sub-agent puo' chiudersi
    // mentre chi lo porta e' ancora per strada, e due tragitti sullo stesso
    // elemento se lo litigano un tratto per uno: la persona rimbalza e non arriva
    // piu' da nessuna parte.
    await chi.andata;
    window.ROOM.vesti(chi.fig, chi.seme, 'cammina');
    // Dove finisce il foglio lo dice com'e' andata, e com'e' andata si legge
    // adesso: quando e' entrato non si sapeva ancora.
    const items = (board[chi.capoId] && board[chi.capoId].items) || [];
    const it = items.find((x) => (x.id || x.content) === chi.nome);
    const dove = it && it.status === 'failed' ? 'muro' : 'archivio';
    if (await window.ROOM.viaggio(chi.el, ...window.ROOM.BACHECHE[dove].posto)) {
      await attesa(GESTO);
    }
    chi.el.remove();
    staff.delete(chi.chiave);
    paintBacheche();
  }

  // ---------- le bacheche ----------
  //
  // Quello che c'e' da fare, quello che e' andato storto, e la pila di quello che
  // e' fatto. I foglietti non hanno testo — a cinque pixel per quattro non ce ne
  // sta — e il colore e' tutto quello che dicono, che poi e' tutto quello che una
  // bacheca dice davvero anche quando i foglietti sono scritti.
  //
  // Quelli in mano a qualcuno non ci sono: un foglio e' uno solo, e se sta
  // camminando per la stanza non e' anche appeso al muro.

  /** Quanti ne stanno su una bacheca prima di impilarsi nell'angolo. */
  const PER_BACHECA = 12;
  /** Quanti fogli si vedono nella pila dell'archivio. Oltre, e' un mucchio. */
  const PILA = 6;
  let bacheche;

  /* Un foglietto sta appeso a un mobile, e la profondita' e' quella del mobile
     piu' uno: la stanza ordina tutto sul bordo di sotto, e un foglio che non lo
     rispetta finisce dietro al tavolo su cui dovrebbe stare. */
  function foglio(cls, x, y, z) {
    const n = el('span', 'of-note ' + cls);
    n.style.left = x + 'px';
    n.style.top = y + 'px';
    n.style.zIndex = z;
    return n;
  }

  /** Ne appende `quanti`, a partire dalla casella `da`: quattro per riga. */
  function appendi(out, cls, quanti, gx, gy, z, da) {
    for (let i = da; i < Math.min(da + quanti, PER_BACHECA); i++) {
      out.push(foglio(cls, gx + (i % 4) * 8, gy + Math.floor(i / 4) * 6, z));
    }
    // Oltre dodici non ci stanno: da li' in poi si impilano nell'angolo, che e'
    // quello che succede a una bacheca vera.
    if (da + quanti > PER_BACHECA) out.push(foglio(cls + ' pila', gx + 26, gy + 14, z));
  }

  function paintBacheche() {
    if (!bacheche) return;
    // Solo le conversazioni che in ufficio ci sono davvero: una lista rimasta nel
    // quadro di una scheda chiusa e' una bacheca che parla di gente che non c'e'.
    let fare = 0;
    let storte = 0;
    let fatte = 0;
    for (const id of Object.keys(board)) {
      if (!people.has(id)) continue;
      for (const it of board[id].items || []) {
        if (staff.has(id + '/' + (it.id || it.content))) continue;
        if (it.status === 'pending') fare++;
        else if (it.status === 'failed') storte++;
        else if (it.status === 'completed') fatte++;
      }
    }
    const B = window.ROOM.BACHECHE;
    const [gx, gy] = B.muro.griglia;
    // Le storte in cima: sono quelle da guardare, e la prima riga e' quella che
    // si guarda. Le gialle riempiono da dove finiscono loro.
    const out = [];
    appendi(out, 'storta', storte, gx, gy, B.muro.z, 0);
    appendi(out, 'fare', fare, gx, gy, B.muro.z, storte);
    // L'archivio non e' una griglia: e' una pila, e una pila si legge perche' i
    // fogli non sono allineati.
    for (let i = 0; i < Math.min(fatte, PILA); i++) {
      out.push(
        foglio(
          'fatta',
          B.archivio.griglia[0] + (i % 2),
          B.archivio.griglia[1] - i * 2,
          B.archivio.z + i
        )
      );
    }
    bacheche.replaceChildren(...out);
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
        chi.andata = entra(chi, capo, i);
      } else if (!chi.va && !chi.esce) {
        // Il posto puo' cambiare sotto i piedi: un fratello che finisce fa
        // scalare tutti gli altri di uno. Ci si sposta camminando, che a questa
        // misura sono venti pixel e non si nota, invece di teletrasportarsi.
        const [fx, fy] = postoStaff(capo, i);
        if (Math.abs(parseFloat(chi.el.style.left) + 8 - fx) > 2) chi.andata = entra(chi, capo, i);
      }
      const cosa = it.activeForm || it.content || '';
      chi.el.title = capo.pname.textContent + ' · ' + cosa;
      chi.el.setAttribute('aria-label', chi.el.title);
    }

    paintBacheche();
  }

  // ---------- l'aura del capo ----------
  //
  // Chi lavora per qualcuno, se quel qualcuno ce l'ha a due passi, ogni tanto gli
  // tira una battuta. E se il capo e' dall'altra parte della stanza — al bar, di
  // solito — ogni tanto ne dice una alle sue spalle.
  //
  // La cosa che la rende una battuta e non una scritta e' che il numero e' vero:
  // "gia' otto cose fatte" lo dice solo se il quadro delle task ne conta otto
  // chiuse per quel capo li'. Senza il numero vero e' un cartello; col numero
  // vero e' un ufficio.

  /* Le prime due dicono il numero, e si usano solo se il numero c'e'. Adulare
     qualcuno per zero cose fatte non e' adulare, e' prendere in giro. */
  const ADULAZIONE = [
    'Gia’ {n} cose fatte, capo. Aumento?',
    '{n} task chiuse, capo!',
    'Gran visione come sempre, capo',
    'Stavo giusto per farlo anch’io!',
    'Bella la cravatta oggi, capo',
    'Che ritmo, capo',
    'Il miglior capo di sempre. Davvero.',
  ];
  const PETTEGOLEZZI = [
    'Ma una riga l’ha mai scritta?',
    'Un altro punto veloce da un’ora',
    'La tazza se l’e’ comprata lui',
    'La mia task l’ha spacciata per sua',
    'Dice sempre di si’ e poi cambia idea',
    'Ha annaffiato una pianta. La sua.',
    'Trenta minuti per dire "vediamo"',
  ];

  /** Quanto vicino deve stare il capo perche' valga la pena adularlo. */
  const VICINO = 44;
  /** E quanto lontano perche' non senta. */
  const LONTANO = 96;
  /** Ogni quanto si guarda chi ha il capo accanto. */
  const GIRO_AURA = 1500;
  /** E ogni quanto la stessa persona puo' riaprire bocca. */
  const RESPIRO = 25000;

  const caso = (a) => a[Math.floor(Math.random() * a.length)];
  const piedi = (n) => [parseFloat(n.style.left) + 8, parseFloat(n.style.top) + 24];

  function aura() {
    const ora = Date.now();
    for (const chi of staff.values()) {
      if (chi.va || chi.esce || chi.dice) continue;
      const capo = people.get(chi.capoId);
      if (!capo || !capo.el.isConnected) continue;
      if (ora - (chi.zitto || 0) < RESPIRO) continue;
      const [x, y] = piedi(chi.el);
      const [cx, cy] = piedi(capo.el);
      const d = Math.hypot(cx - x, cy - y);
      // Chi parla e' l'impiegato, e conta che sia fermo al suo posto — uno che
      // tira una battuta al capo mentre attraversa la stanza col foglietto in
      // mano non e' un impiegato, e' un passante. Che il capo sia occupato non
      // conta: se ha un sub-agent aperto lo e' sempre, e con quella condizione
      // dentro non si sarebbe mai sentita una parola.
      if (d <= VICINO && Math.random() < 0.6) {
        chi.zitto = ora;
        const fatte = (board[chi.capoId] && board[chi.capoId].done) || 0;
        const pescate = fatte > 0 ? ADULAZIONE : ADULAZIONE.slice(2);
        window.ROOM.parla(chi, caso(pescate).replace('{n}', fatte));
      } else if (d > LONTANO && Math.random() < 0.35) {
        chi.zitto = ora;
        window.ROOM.parla(chi, caso(PETTEGOLEZZI));
      }
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
