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
  let gente;
  let uso;
  let usoS;
  let usoW;
  let scheda;
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
  /** La bacheca aperta: il bottone sul mobile, il foglio che ci esce, e i suoi pezzi. */
  let kanban;
  let sheet;
  let sheetBody;
  let sheetTitle;
  let sheetCount;
  let sheetEmpty;
  let sheetClose;
  /** id conversazione -> il pezzo di elenco che le tocca, per ridipingerlo invece di rifarlo. */
  const elenchi = new Map();

  /** Un'icona dello sprite. Le SVG vanno create col namespace, o restano invisibili. */
  function ico(name, cls) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', cls ? 'ico ' + cls : 'ico');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#ion-' + name);
    svg.appendChild(use);
    return svg;
  }

  /* ---- i consumi, come li dice il pannello del contesto ----
   *
   * Erano due pillole con dentro un numero, e un numero da solo non dice quanto
   * manca: "sessione 34%" letto di sfuggita puo' voler dire tutto. La barra lo
   * dice senza leggere — e il momento in cui si svuota di colpo e' il rinnovo,
   * che con la sola percentuale non si vedeva affatto.
   *
   * Stessa ricetta del pannello: il colore sta nella barra e non nel testo, e la
   * scia parte solo quando la barra si muove davvero.
   */
  function cella() {
    const box = el('div', 'of-cell');
    const top = el('div', 'of-cell-top');
    const lab = el('span', 'of-cell-lab');
    const val = el('span', 'of-cell-val');
    top.append(lab, val);
    const bar = el('div', 'of-cell-bar');
    const fill = el('div', 'of-cell-fill');
    fill.addEventListener('animationend', () => fill.classList.remove('glide'));
    bar.append(fill);
    const reset = el('div', 'of-cell-reset');
    box.append(top, bar, reset);
    return { el: box, lab, val, fill, reset };
  }

  function paintCella(c, chiave, pct, quando) {
    c.lab.textContent = t(chiave);
    c.val.textContent = pct == null ? '—' : Math.round(pct) + '%';
    c.reset.textContent = quando ? t('ctx.resets', { when: quando }) : '';
    const w = (pct == null ? 0 : Math.max(0, Math.min(100, pct))) + '%';
    if (c.fill.style.width !== w) {
      c.fill.classList.remove('glide');
      void c.fill.offsetWidth;
      c.fill.classList.add('glide');
      c.fill.style.width = w;
    }
    c.fill.style.background = barColor(pct);
  }

  /* ---- chi c'e' in ufficio ----
   *
   * Le conversazioni e i loro sub-agent in un elenco solo, e i sub-agent subito
   * dopo il capo che li ha aperti: da fuori si legge chi lavora per chi senza
   * doverlo scrivere da nessuna parte.
   *
   * Su cosa stia lavorando una conversazione non e' il suo nome: e' il passo del
   * piano che ha in corso adesso, cioe' la stessa riga che nella stanza sta in
   * mano a qualcuno sotto forma di foglietto. Se non ce n'e' uno aperto vale
   * come sta — attiva, ferma, ha finito — che e' comunque la risposta a "cosa
   * sta facendo".
   */
  function cheFa(id) {
    const items = (board[id] && board[id].items) || [];
    const viva = items.find((it) => it.status === 'in_progress');
    return viva ? viva.activeForm || viva.content || '' : '';
  }

  const comeSta = (s) =>
    s.busy ? t('ctx.busy') : s.done ? t('ctx.done') : s.recent ? t('ctx.recent') : t('ctx.idle');

  function abitanti() {
    const cards = (last && last.cards) || [];
    const out = [];
    for (const s of cards) {
      const chi = people.get(s.id);
      if (!chi) continue;
      out.push({
        key: 'c:' + s.id,
        nome: s.name,
        seme: chi.seme,
        posa: s.busy ? 'digita' : 'fermo',
        stato: comeSta(s),
        cosa: cheFa(s.id) || comeSta(s),
        pct: s.pct,
        capo: null,
        focused: !!s.focused,
        busy: !!s.busy,
      });
      // I suoi, attaccati a lui. Un sub-agent non ha un nome: ha una cosa da
      // fare, ed e' quella a dire chi e'.
      for (const [chiave, sub] of staff) {
        // Chi sta uscendo non e' piu' in ufficio: e' ancora disegnato perche' sta
        // attraversando la stanza, ma nella fila di chi c'e' non ci va.
        if (sub.capoId !== s.id || sub.esce) continue;
        out.push({
          key: 's:' + chiave,
          nome: sub.cosa || sub.nome || '',
          seme: sub.seme,
          posa: 'digita',
          stato: t('ctx.busy'),
          cosa: sub.cosa || sub.nome || '',
          pct: null,
          capo: s.name,
          focused: false,
          busy: true,
        });
      }
    }
    return out;
  }

  /** Le pedine della fila, per chiave: si ridipingono invece di rifarle. */
  const pedine = new Map();
  /** Chi si sta guardando adesso, se si sta guardando qualcuno. */
  let guardato = null;

  function paintGente() {
    if (!gente) return;
    const tutti = abitanti();
    const vive = new Set(tutti.map((a) => a.key));
    for (const [k, p] of pedine) {
      if (!vive.has(k)) {
        p.el.remove();
        pedine.delete(k);
      }
    }
    let prima = null;
    for (const a of tutti) {
      let p = pedine.get(a.key);
      if (!p) {
        const b = el('button', 'of-chi');
        b.type = 'button';
        const faccia = el('span', 'of-facciola');
        const corpo = el('span', 'of-body');
        faccia.append(corpo);
        const nome = el('span', 'of-chi-nome');
        b.append(faccia, nome);
        b.onclick = () => apriScheda(a.key, b);
        p = { el: b, corpo, nome };
        pedine.set(a.key, p);
      }
      // Rimessa in fila senza toccarla se e' gia' al posto giusto: riappendere un
      // elemento fa ripartire l'animazione della striscia, e una fila di facce
      // che sbattono a ogni aggiornamento non si guarda.
      const dopo = prima ? prima.el.nextSibling : gente.firstChild;
      if (dopo !== p.el) gente.insertBefore(p.el, dopo);
      prima = p;
      window.ROOM.vesti(p.corpo, a.seme, a.posa);
      p.nome.textContent = a.nome;
      p.el.classList.toggle('of-sub', !!a.capo);
      p.el.classList.toggle('focused', a.focused);
      p.el.classList.toggle('busy', a.busy);
      p.el.classList.toggle('aperta', guardato === a.key);
      p.el.title = a.capo ? t('office.sub', { name: a.capo }) + ' - ' + a.cosa : a.nome + ' - ' + a.cosa;
      p.el.setAttribute('aria-label', p.el.title);
      p.el.setAttribute('aria-expanded', guardato === a.key ? 'true' : 'false');
    }
    paintScheda();
  }

  /* ---- e cosa sta facendo ----
   *
   * Cliccare una pedina apre una scheda sotto la fascia con quello che quella
   * persona sta facendo adesso, e resta viva finche' e' aperta: il piano cambia
   * al ritmo di Claude, e una scheda ferma al momento in cui l'hai aperta dice
   * una cosa che non e' piu' vera.
   *
   * Cliccare la persona nella stanza porta alla sua conversazione; cliccarla qui
   * dice cosa sta facendo. Sono due domande diverse e hanno due posti diversi:
   * da qui non si va da nessuna parte, si guarda.
   */
  function apriScheda(key, ancora) {
    guardato = guardato === key ? null : key;
    if (guardato && ancora) {
      // Sotto la pedina, ma mai oltre il bordo: una scheda che esce dalla scheda
      // e' una scheda tagliata a meta'.
      const b = ancora.getBoundingClientRect();
      const r = root.getBoundingClientRect();
      scheda.el.style.left = Math.max(8, Math.min(b.left - r.left, r.width - 268)) + 'px';
      scheda.el.style.top = b.bottom - r.top + 6 + 'px';
    }
    paintGente();
  }

  function paintScheda() {
    if (!scheda) return;
    const a = guardato && abitanti().find((x) => x.key === guardato);
    if (!a) {
      guardato = null;
      scheda.el.hidden = true;
      return;
    }
    scheda.el.hidden = false;
    scheda.nome.textContent = a.nome;
    scheda.ruolo.textContent = a.capo ? t('office.sub', { name: a.capo }) : a.stato;
    scheda.cosa.textContent = a.cosa;
    scheda.pct.hidden = a.pct == null;
    if (a.pct != null) {
      scheda.pctVal.textContent = Math.round(a.pct) + '%';
      scheda.pctFill.style.width = Math.max(0, Math.min(100, a.pct)) + '%';
      scheda.pctFill.style.background = barColor(a.pct);
    }
  }

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

    /* Chi c'e' in ufficio, uno per uno: le conversazioni e i sub-agent che hanno
       aperto. La stanza li mostra gia' — ma da sedici pixel e visti dall'alto si
       vede *che* ci sono, non *chi* sono, e per sapere su cosa sta lavorando
       quello in fondo a destra bisognava andarselo a cercare. Qui hanno un nome
       scritto e si cliccano.

       Scorre in orizzontale invece di stringersi: con dieci persone in ufficio i
       nomi si sarebbero ridotti a due lettere, e due lettere non sono un nome.
       Ed e' la riga che tiene i consumi interi — sono l'unica cosa della fascia
       che non si puo' tagliare, perche' una barra tagliata dice una percentuale
       sbagliata. */
    gente = el('div', 'of-gente');
    gente.setAttribute('role', 'list');

    uso = el('div', 'of-uso');
    usoS = cella();
    usoW = cella();
    uso.append(usoS.el, usoW.el);

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
    // Due gruppi e niente in mezzo: a sinistra dove sei e chi c'e', a destra i
    // consumi e la via d'uscita. In mezzo la fila della gente, che si prende
    // tutto lo spazio che avanza — ed e' lei a spingere i consumi e il bottone
    // contro il bordo destro, senza bisogno di un vuoto messo apposta.
    bar.append(title, count, boss, gente, uso, back);


    /* La scheda di chi si sta guardando. Sta sopra la stanza e non dentro la
       fascia: la fascia e' alta quanto un bottone, e quello che una persona sta
       facendo e' una riga di testo vero che li' dentro non ci sta. */
    const box = el('div', 'of-scheda');
    box.hidden = true;
    const sNome = el('div', 'of-scheda-nome');
    const sRuolo = el('div', 'of-scheda-ruolo');
    const sCosa = el('div', 'of-scheda-cosa');
    const sPct = el('div', 'of-scheda-pct');
    const sPctLab = el('span', null, t('office.ctxUsed'));
    const sPctVal = el('span', 'of-scheda-val');
    const sPctTop = el('div', 'of-cell-top');
    sPctTop.append(sPctLab, sPctVal);
    const sPctBar = el('div', 'of-cell-bar');
    const sPctFill = el('div', 'of-cell-fill');
    sPctBar.append(sPctFill);
    sPct.append(sPctTop, sPctBar);
    box.append(sNome, sRuolo, sCosa, sPct);
    scheda = {
      el: box,
      nome: sNome,
      ruolo: sRuolo,
      cosa: sCosa,
      pct: sPct,
      pctLab: sPctLab,
      pctVal: sPctVal,
      pctFill: sPctFill,
    };

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
    // I portatili stanno sui tavoli, quindi sotto la gente che ci si siede
    // davanti: e' la profondita' del singolo pezzo a decidere, non il gruppo.
    portatili = el('div', 'of-portatili');
    empty = el('div', 'of-nobody');
    stage.append(bacheche, portatili, crowd, empty);

    // La bacheca si clicca, e dentro c'e' quello che sul muro non ci sta scritto.
    //
    // Un foglietto e' cinque pixel per quattro: dice il suo colore e basta, ed e'
    // giusto cosi' finche' la bacheca e' arredamento. Ma quello che ci sta appeso
    // e' il piano vero di ogni conversazione aperta, e a un piano si vorrebbe
    // poter dare un'occhiata.
    //
    // Il bottone e' un bottone vero appoggiato sopra il mobile, e non il mobile
    // reso cliccabile: e' l'unico modo di averlo raggiungibile da tastiera senza
    // rifare a mano il ruolo, il focus e i tasti che un <button> ha gia'.
    const tela = stage.querySelector('.of-prop[data-k="board"]');
    if (tela) {
      kanban = el('button', 'of-kanban');
      kanban.type = 'button';
      kanban.style.left = tela.style.left;
      kanban.style.top = tela.style.top;
      kanban.style.width = tela.style.width;
      kanban.style.height = tela.style.height;
      // Sopra i foglietti, che stanno alla profondita' del mobile piu' uno.
      kanban.style.zIndex = window.ROOM.BACHECHE.muro.z + 2;
      kanban.onclick = () => apriBacheca(true);
      stage.append(kanban);
    }

    sheet = costruisciFoglio();

    // Il foglio sta dentro il riquadro della stanza e non dentro tutto l'ufficio:
    // copre la pianta, non la fascia in cima.
    wrap.append(stage, sheet);
    root.append(bar, wrap, scheda.el);

    // Si chiude come si chiude una cosa aperta per sbaglio: col tasto che chiude
    // tutto, o cliccando altrove. La pedina se la richiude da se', quindi qui si
    // guarda solo che il clic non sia caduto ne' dentro la scheda ne' su una
    // pedina — se no aprirne una la chiuderebbe subito dopo averla aperta.
    root.addEventListener('click', (e) => {
      if (!guardato) return;
      if (scheda.el.contains(e.target) || e.target.closest('.of-chi')) return;
      guardato = null;
      paintGente();
    });
    root.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !guardato) return;
      guardato = null;
      paintGente();
    });

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
      vestiBacheca();
      if (last) render(last);
    });
    vestiBacheca();
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

  // ---------- la porta ----------
  //
  // In ufficio si entra da una porta sola, e si esce dalla stessa. Prima non era
  // cosi': i capi comparivano gia' seduti alla loro scrivania e sparivano da
  // seduti, e gli impiegati nascevano davanti alla bacheca. Comparire e sparire
  // sul posto e' la cosa che fa sembrare una stanza uno schermo: chi arriva non
  // e' arrivato da nessuna parte.
  //
  // La porta e' larga due caselle e si entra uno alla volta. Quattro
  // conversazioni aperte tutte insieme — che e' quello che succede riaprendo la
  // scheda — sarebbero quattro persone nello stesso punto della soglia, cioe'
  // una persona sola disegnata quattro volte.

  /** Quanto passa fra uno che entra e il prossimo. */
  const PASSO_PORTA = 700;
  /** E quanto ci si mette a sparire di la', una volta sulla soglia. */
  const SOGLIA = 320;
  let ultimaEntrata = 0;

  /** Il proprio turno sulla soglia: si aspetta che l'abbia liberata chi c'era. */
  function turnoPorta() {
    const ora = Date.now();
    const quando = Math.max(ora, ultimaEntrata + PASSO_PORTA);
    ultimaEntrata = quando;
    return attesa(quando - ora);
  }

  /** Mette qualcuno sulla soglia, fermo e non ancora visibile. */
  function soglia(chi) {
    const [px, py] = window.ROOM.INGRESSO;
    chi.el.style.left = px - 8 + 'px';
    chi.el.style.top = py - 24 + 'px';
    chi.el.style.zIndex = py;
    // `fuori` e' la parola che la stanza gia' conosce per "sta camminando, non
    // spostarlo": senza, il primo ridisegno lo teletrasporta al suo posto e la
    // camminata dalla porta non parte mai.
    chi.fuori = true;
    chi.el.classList.add('fuori', 'soglia');
    // Vestito subito, anche se non si vede ancora: un elemento senza sprite che
    // diventa visibile a meta' camminata e' una persona che si materializza in
    // corridoio.
    window.ROOM.vesti(chi.fig, chi.seme, 'fermo');
  }

  /**
   * Entra dalla porta e cammina fino a `[fx, fy]`.
   *
   * Torna falso se per strada e' sparito: chi apre e chiude una conversazione in
   * due secondi lascia qualcuno a meta' corridoio, e da li' in poi non c'e' piu'
   * nessuno da far arrivare.
   */
  async function entrata(chi, fx, fy) {
    soglia(chi);
    await turnoPorta();
    if (!chi.el.isConnected) return false;
    window.ROOM.apriPorta();
    chi.el.classList.remove('soglia');
    chi.el.classList.add('in-arrivo');
    window.ROOM.vesti(chi.fig, chi.seme, 'cammina');
    const ok = await window.ROOM.viaggio(chi.el, fx, fy);
    chi.el.classList.remove('fuori', 'in-arrivo');
    chi.fuori = false;
    return ok;
  }

  /** E se ne va dalla stessa porta, che e' l'unica che c'e'. */
  async function uscita(chi) {
    chi.fuori = true;
    chi.el.classList.add('fuori', 'via');
    window.ROOM.vesti(chi.fig, chi.seme, 'cammina');
    await window.ROOM.viaggio(chi.el, ...window.ROOM.INGRESSO);
    window.ROOM.apriPorta();
    chi.el.classList.add('soglia');
    await attesa(SOGLIA);
    chi.el.remove();
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
    const nome = it.id || it.content;
    const chi = { chiave, capoId: capo.id, nome, el: b, fig: who, seme: capo.seme + '/' + nome };
    window.ROOM.vesti(who, chi.seme, 'cammina');
    return chi;
  }

  /* ---- e le scrivanie che avanzano ----
   *
   * Sei scrivanie e una sola per conversazione: con due schede aperte quattro
   * restavano vuote per sempre, e un ufficio con quattro posti liberi e tre
   * persone in piedi in mezzo alla corsia non e' un ufficio pieno, e' un ufficio
   * in attesa. Quindi chi lavora per qualcuno si siede.
   *
   * Si prende la scrivania libera piu' vicina al proprio capo, e non una a caso:
   * e' quello che tiene insieme il gruppetto, e da lontano si vede ancora chi sta
   * con chi. I capi vengono prima e non si discute — una scrivania presa da un
   * impiegato la si lascia appena arriva una conversazione nuova, e da li' si
   * torna a stare in piedi nella corsia.
   */
  /** chiave dell'impiegato -> posto. Un posto preso non si cambia sotto i piedi. */
  const banchi = new Map();

  /* I posti sono in fila uno solo: prima le sei scrivanie, poi i quattro
     sgabelli. Un indice solo perche' `banchi` ne tiene uno solo, e due elenchi
     paralleli sarebbero due modi di dire "il posto numero tre". */
  const posti = () => scrivanie.length + window.ROOM.SGABELLI.length;
  const sgabello = (i) => i >= scrivanie.length;
  const postoBanco = (i) =>
    sgabello(i) ? window.ROOM.SGABELLI[i - scrivanie.length] : window.ROOM.posto(i);

  /** Da' un posto a chi non ce l'ha, e lo toglie a chi non c'e' piu' o se l'e' visto soffiare. */
  function assegnaBanchi(voluti) {
    for (const [chiave, i] of banchi) {
      if (!voluti.has(chiave) || seats[i]) banchi.delete(chiave);
    }
    const presi = new Set(banchi.values());
    for (const [chiave, { capo }] of voluti) {
      if (banchi.has(chiave) || !capo.casa) continue;
      let scelto = -1;
      let quanto = Infinity;
      for (let i = 0; i < posti(); i++) {
        if (seats[i] || presi.has(i)) continue;
        const p = postoBanco(i);
        // Le scrivanie vengono prima degli sgabelli a qualunque distanza: un
        // posto col computer e' un posto migliore di uno col portatile, e la
        // sala riunioni si riempie solo quando il salone e' pieno davvero.
        const d = Math.hypot(p.x - capo.casa.x, p.y - capo.casa.y) + (sgabello(i) ? 1e4 : 0);
        if (d < quanto) {
          quanto = d;
          scelto = i;
        }
      }
      // Nessuno libero: si sta in piedi accanto al capo, come si e' sempre fatto.
      if (scelto < 0) continue;
      banchi.set(chiave, scelto);
      presi.add(scelto);
    }
  }

  /** Il posto di questo impiegato: il suo, o la corsia accanto al capo. */
  function postoStaff(chiave, capo, i) {
    const banco = banchi.get(chiave);
    if (banco != null) {
      const p = postoBanco(banco);
      return [p.x + 8, p.y + 24];
    }
    return [capo.casa.x + 8 + POSTI_STAFF[i][0], capo.casa.y + 24 + POSTI_STAFF[i][1]];
  }

  /* ---- i portatili ----
   *
   * Sul tavolo della sala riunioni un computer non c'e', ed e' giusto che non ci
   * sia: e' un tavolo. Ma uno seduto a un tavolo vuoto che batte a macchina e'
   * uno che mima, ed e' esattamente la cosa che questo ufficio non deve fare —
   * quindi chi si siede su uno sgabello se lo porta.
   *
   * Si ridipingono tutti da `banchi` invece di appiccicarne uno a ciascuno: un
   * portatile non e' di nessuno, e' del posto. Cosi' non c'e' un ciclo di vita da
   * tenere in pari, e un portatile dimenticato acceso su un tavolo vuoto non
   * puo' esistere.
   *
   * Solo per chi e' arrivato davvero: comparire sul tavolo mentre chi lo porta e'
   * ancora per strada e' lo stesso errore del foglietto appeso al muro e in mano
   * a qualcuno nello stesso momento.
   */
  let portatili;

  function paintPortatili() {
    if (!portatili) return;
    const out = [];
    for (const [chiave, i] of banchi) {
      const chi = staff.get(chiave);
      if (!sgabello(i) || !chi || chi.va || chi.esce) continue;
      const g = window.ROOM.SGABELLI[i - scrivanie.length];
      const n = el('i', 'of-portatile');
      n.style.left = g.lap[0] + 'px';
      n.style.top = g.lap[1] + 'px';
      n.style.zIndex = g.lz;
      out.push(n);
    }
    portatili.replaceChildren(...out);
  }

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
        // Prima la porta, poi la bacheca. Un sub-agent non si materializza
        // davanti al muro dove sta il suo foglietto: entra come entrano tutti, e
        // il foglietto va a prenderselo — che e' anche il motivo per cui la
        // bacheca sta nella stanza in cima e non sopra le scrivanie.
        if (!(await entrata(chi, ...window.ROOM.BACHECHE.muro.posto))) return;
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
      if (await window.ROOM.viaggio(chi.el, ...postoStaff(chi.chiave, capo, i))) {
        window.ROOM.vesti(chi.fig, chi.seme, 'digita');
      }
    } finally {
      // Qualunque cosa succeda per strada, "sta arrivando" deve smettere di
      // essere vero: chi resta in arrivo per sempre non se ne va piu'.
      chi.va = false;
      // E il portatile si apre adesso, che e' quando si e' seduti.
      paintPortatili();
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
    // Il portatile si chiude quando ci si alza, non quando si e' usciti.
    paintPortatili();
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
      // Il foglio si posa qui, e da qui in poi e' del muro o della pila. Portarlo
      // in mano fino alla porta voleva dire lo stesso foglio appeso e in mano a
      // qualcuno nello stesso momento — che e' l'unico modo in cui questa
      // bacheca conta due volte lo stesso lavoro.
      if (chi.foglio) {
        chi.foglio.remove();
        chi.foglio = null;
      }
      staff.delete(chi.chiave);
      paintBacheche();
      // E poi si esce, dalla porta, come si e' entrati. Sparire davanti alla
      // bacheca voleva dire che chi finiva svaniva dentro il muro.
      if (chi.el.isConnected) await uscita(chi);
    }
    chi.el.remove();
    staff.delete(chi.chiave);
    // Il posto torna libero, e il portatile se ne va col suo padrone.
    banchi.delete(chi.chiave);
    paintPortatili();
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

  // ---------- la bacheca, aperta ----------
  //
  // Sul muro un foglietto e' cinque pixel per quattro: dice il suo colore e basta.
  // Cliccando la bacheca esce quello che c'e' scritto sopra — il piano di ogni
  // conversazione aperta, capo per capo.
  //
  // Le liste non sono riscritte qui: sono `TaskPanel`, la stessa che la chat mette
  // nella colonna del contesto. Due liste della stessa cosa si scollano al primo
  // ritocco, e a quel punto dicono due verita' diverse sullo stesso lavoro.

  function costruisciFoglio() {
    const n = el('div', 'of-sheet');
    n.hidden = true;
    const box = el('div', 'of-sheet-box');
    box.setAttribute('role', 'dialog');
    // Non `aria-modal`: la chat accanto resta viva e ci si puo' scrivere, ed e' il
    // punto di tutta la scheda. Quello che non deve restare raggiungibile e' la
    // stanza sotto — ci si pensa con `inert` in `apriBacheca`, che e' anche l'unico
    // modo di non far finire il fuoco su una persona nascosta dietro il buio.
    box.setAttribute('aria-labelledby', 'ofSheetTitle');

    const head = el('header', 'of-sheet-head');
    sheetTitle = el('h2', 'of-sheet-title');
    sheetTitle.id = 'ofSheetTitle';
    sheetCount = el('span', 'of-sheet-count');
    sheetClose = el('button', 'of-sheet-x');
    sheetClose.type = 'button';
    sheetClose.append(ico('close'));
    sheetClose.onclick = () => apriBacheca(false);
    head.append(sheetTitle, sheetCount, sheetClose);

    sheetBody = el('div', 'of-sheet-body');
    sheetEmpty = el('p', 'of-sheet-empty');
    box.append(head, sheetBody, sheetEmpty);
    n.append(box);

    // Il fondo chiude, la scatola no: un clic dentro la lista non deve far sparire
    // la lista che si sta leggendo.
    n.onclick = (e) => e.target === n && apriBacheca(false);
    // Esc chiude. Basta ascoltarlo qui dentro perche' aprendo il foglio il fuoco ci
    // finisce dentro: un ascoltatore su tutto il documento avrebbe litigato con
    // l'Esc della chat, che sta nella stessa pagina.
    n.addEventListener('keydown', (e) => e.key === 'Escape' && apriBacheca(false));
    return n;
  }

  /** Le parole del foglio, che cambiano con la lingua e non con i dati. */
  function vestiBacheca() {
    if (kanban) {
      kanban.title = t('office.board');
      kanban.setAttribute('aria-label', t('office.board'));
    }
    if (!sheet) return;
    sheetTitle.textContent = t('office.boardTitle');
    sheetClose.title = t('office.boardClose');
    sheetClose.setAttribute('aria-label', t('office.boardClose'));
    dipingiBacheca();
  }

  function apriBacheca(aperta) {
    // Gia' com'e' richiesta: non si ridipinge e soprattutto non si sposta il fuoco.
    if (!sheet || !sheet.hidden === aperta) return;
    sheet.hidden = !aperta;
    if (stage) stage.inert = aperta;
    if (aperta) {
      dipingiBacheca();
      sheetClose.focus();
    } else if (kanban) {
      // Il fuoco torna da dove veniva: chi ha aperto col tasto non deve ritrovarsi
      // in cima alla pagina.
      kanban.focus();
    }
  }

  function dipingiBacheca() {
    if (!sheet || sheet.hidden) return;
    // Solo le conversazioni che in ufficio ci sono davvero, e solo quelle che un
    // piano ce l'hanno: un elenco rimasto nel quadro di una scheda chiusa e' una
    // lista di lavoro di nessuno.
    const vivi = [...people.keys()].filter((id) => ((board[id] || {}).items || []).length);
    for (const [id, e] of elenchi) {
      if (!vivi.includes(id)) {
        e.sez.remove();
        elenchi.delete(id);
      }
    }
    let quante = 0;
    let fatte = 0;
    for (const id of vivi) {
      let e = elenchi.get(id);
      if (!e) {
        const sez = el('section', 'of-sheet-who');
        const nome = el('h3', 'of-sheet-name');
        const dove = el('div', 'of-sheet-tasks');
        sez.append(nome, dove);
        // Come nella colonna del contesto: la lista e' `TaskPanel`, e se il foglio
        // non e' stato caricato resta il nome, che e' meglio di una pagina rotta.
        e = { sez, nome, pannello: window.TaskPanel ? window.TaskPanel(dove) : null };
        elenchi.set(id, e);
      }
      // Riappendere una sezione che c'e' gia' la sposta invece di duplicarla: e'
      // quello che tiene l'ordine del foglio uguale all'ordine delle scrivanie.
      sheetBody.append(e.sez);
      e.nome.textContent = people.get(id).pname.textContent;
      if (e.pannello) e.pannello.render(board[id]);
      quante += (board[id].items || []).length;
      fatte += board[id].done || 0;
    }
    sheetCount.textContent = quante ? t('tasks.count', { done: fatte, total: quante }) : '';
    sheetCount.hidden = !quante;
    sheetEmpty.textContent = t('office.boardEmpty');
    sheetEmpty.hidden = quante > 0;
  }

  function paintStaff() {
    const voluti = volutiStaff();

    // Chi ha finito se ne va — ma per la porta, non svanendo: e' l'unica cosa che
    // fa vedere che un sub-agent e' finito invece che sparito.
    for (const [chiave, chi] of staff) {
      if (!voluti.has(chiave) && !chi.esce) esce(chi);
    }

    // Poi si vede chi si siede dove: prima i posti, e solo dopo dove va la gente.
    assegnaBanchi(voluti);

    for (const [chiave, { capo, it, i }] of voluti) {
      let chi = staff.get(chiave);
      if (!chi) {
        chi = buildStaff(chiave, capo, it);
        staff.set(chiave, chi);
        chi.andata = entra(chi, capo, i);
      } else if (!chi.va && !chi.esce) {
        // Il posto puo' cambiare sotto i piedi: un fratello che finisce fa
        // scalare tutti gli altri di uno, e una conversazione nuova si riprende
        // la scrivania. Ci si sposta camminando, invece di teletrasportarsi.
        const [fx, fy] = postoStaff(chiave, capo, i);
        const qx = parseFloat(chi.el.style.left) + 8;
        const qy = parseFloat(chi.el.style.top) + 24;
        // Sui due assi e non solo in orizzontale: due scrivanie della stessa
        // colonna stanno una sotto l'altra, e a guardare solo la x il trasloco
        // fra le due non parte mai.
        if (Math.hypot(qx - fx, qy - fy) > 2) chi.andata = entra(chi, capo, i);
      }
      const cosa = it.activeForm || it.content || '';
      // Se la tiene addosso: e' quello che dice quando parla del suo lavoro, ed e'
      // quello che si legge cliccandolo nella fascia in cima.
      chi.cosa = cosa;
      chi.el.title = capo.pname.textContent + ' · ' + cosa;
      chi.el.setAttribute('aria-label', chi.el.title);
    }

    // E gli schermi delle scrivanie che non sono di nessun capo: acceso se ci si e'
    // seduto un impiegato, spento se no. Uno schermo spento con davanti uno che
    // batte a macchina e' un ufficio a cui e' saltata la corrente, e uno acceso
    // davanti a una scrivania vuota e' peggio.
    //
    // Il giro si fa qui e non solo in `render`: il quadro delle task arriva per
    // conto suo — cambia al ritmo di Claude e non a quello dei consumi — e chi se
    // ne va di la' si porterebbe dietro uno schermo acceso fino al prossimo
    // aggiornamento dei consumi. Quelle dei capi le lascia stare: sono di
    // `render`, che sa se quella conversazione sta lavorando.
    const occupate = new Set(banchi.values());
    scrivanie.forEach((dk, i) => {
      if (seats[i]) return;
      dk.mon.classList.toggle('on', occupate.has(i));
      dk.mon.classList.toggle('working', occupate.has(i));
    });

    paintPortatili();
    paintBacheche();
    // E il foglio aperto, se e' aperto: e' la stessa roba dei foglietti sul muro,
    // e non puo' restare indietro di un turno rispetto a loro.
    dipingiBacheca();
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
  /* Quello che dice chi sta lavorando: la sua task, detta come la direbbe una
     persona.

     Il testo arriva dal piano vero — "Cercando i file di configurazione" — e
     quello e' gia' italiano, scritto per essere letto. Ma non sempre: a volte
     dentro c'e' un percorso, un comando, un pezzo di riga. Una nuvoletta con
     dentro `src/webview/office.js` non e' una persona che parla, e in ufficio
     nessuno parla in bash — quindi quando il testo non si legge come una frase
     si dice invece come sta andando, che e' l'altra meta' di quello che una
     persona dice davvero del proprio lavoro.

     La prova e' grezza apposta: i segni da terminale, le estensioni, e la
     lunghezza. Una nuvoletta e' `nowrap` a sei pixel — trentadue caratteri sono
     gia' un centinaio di pixel, e da li' in poi esce dalla stanza. */
  const CODICE =
    /[^A-Za-zÀ-ÿ0-9 ,.:;!?'’-]|[.][a-z]{1,4}|(^| )-|(^| )(npm|git|cd|ls|rm|sudo|http|const|function)( |$)/i;
  const AVANTI = [
    'Ci sono quasi',
    "E' piu' lunga del previsto",
    'Dammi due minuti',
    'Ci sto lavorando',
    'Questa la chiudo io',
    'Un attimo e ho finito',
  ];
  const SULLAVORO = ['Sto su {c}', 'Mi son preso {c}', '{c}, ci sono quasi', 'Faccio {c} e chiudo'];

  function suLavoro(cosa) {
    const c = (cosa || '').trim();
    if (!c || c.length > 18 || CODICE.test(c)) return caso(AVANTI);
    // Iniziale minuscola: "Cercando i file" dentro "Sto su ..." con la maiuscola
    // sembra una citazione, non una cosa detta.
    return caso(SULLAVORO).replace('{c}', c[0].toLowerCase() + c.slice(1));
  }

  const PETTEGOLEZZI = [
    'Ma una riga l’ha mai scritta?',
    'Un altro punto veloce da un’ora',
    'La tazza se l’e’ comprata lui',
    'La mia task l’ha spacciata per sua',
    'Dice sempre di si’ e poi cambia idea',
    'Ha annaffiato una pianta. La sua.',
    'Trenta minuti per dire "vediamo"',
  ];

  /* Quanto vicino deve stare il capo perche' valga la pena adularlo. Adesso che
     gli impiegati si siedono, "a due passi" non e' piu' solo la corsia: e' anche
     la scrivania di fianco, che sta settanta pixel piu' sotto. Con quaranta la
     battuta al capo non si sarebbe sentita quasi mai. */
  const VICINO = 72;
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
      } else if (Math.random() < 0.25) {
        // Ne' vicino al capo ne' abbastanza lontano da sparlarne: allora si parla
        // di quello che si sta facendo, che e' quello di cui parla davvero chi sta
        // lavorando. Il capo e' un argomento, non l'unico.
        chi.zitto = ora;
        window.ROOM.parla(chi, suLavoro(chi.cosa));
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
        // La stanza vuole saperlo: chi se ne va con una tazza in mano se la
        // porta via dal conto, e dopo qualche giro la rastrelliera resta vuota
        // senza che nessuno abbia bevuto niente.
        window.ROOM.congeda(chi);
        chi.plate.remove();
        people.delete(id);
        // Non sparisce da seduto: si alza e se ne va dalla porta, che e' l'unica
        // che c'e'. Fuori da `people` la stanza non lo tocca piu' — non lo manda
        // al bar e non lo rimette a sedere — e l'elemento resta in vita giusto il
        // tempo di attraversare la stanza. La targhetta invece va via subito: e'
        // della scrivania, e la scrivania e' gia' libera.
        uscita(chi);
      }
    }

    let spare = 0;
    for (const s of list) {
      let chi = people.get(s.id);
      if (!chi) {
        chi = buildPerson(s);
        people.set(s.id, chi);
        // Sulla soglia e non ancora visibile: da li' entra, come tutti.
        soglia(chi);
      }
      let seat = seats.indexOf(s.id);
      if (seat < 0) {
        seat = seats.indexOf(null);
        if (seat >= 0) seats[seat] = s.id;
      }
      // In fila lungo il muro in fondo, dove il corridoio e' libero. Sei per
      // fila e distanti cinquantaquattro: e' la larghezza della targhetta, ed e'
      // quella a decidere, non la persona — piu' stretti i nomi si coprono a
      // vicenda e la fila diventa una macchia bianca. Si parte da cinquantasei
      // per non finire dentro la pianta dell'angolo.
      // ponytail: oltre una fila si va a capo, e la seconda fila finisce addosso
      // alle scrivanie. Tredici conversazioni insieme non le ha nessuno.
      //
      // Duecentosettantasei e non piu' duecentosessantasei: le scrivanie sono
      // scese di venti, e a restare dov'era la fila finiva addosso alle spalle
      // di chi sta seduto nell'ultima.
      let fila = null;
      if (seat < 0) {
        fila = [56 + (spare % 6) * 54, 276 - Math.floor(spare++ / 6) * 26];
        if (chi.entrato && !chi.fuori) {
          chi.el.style.left = fila[0] + 'px';
          chi.el.style.top = fila[1] + 'px';
          chi.el.style.zIndex = fila[1] + 24;
        }
      }
      paintPerson(chi, s, seat);
      // La prima volta ci si arriva a piedi, dalla porta. Comparire gia' seduti
      // e' la cosa che fa sembrare una stanza uno schermo: chi arriva non e'
      // arrivato da nessuna parte. `casa` la sa solo `paintPerson`, quindi la
      // camminata parte da qui e non da dove si costruisce la persona.
      if (!chi.entrato) {
        chi.entrato = true;
        const dove = chi.casa ? [chi.casa.x + 8, chi.casa.y + 24] : [fila[0] + 8, fila[1] + 24];
        entrata(chi, ...dove).then(() => {
          if (chi.el.isConnected) window.ROOM.vesti(chi.fig, chi.seme, chi.posa);
        });
      }
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

    // I nomi sul foglio sono quelli delle targhette, e le targhette le ha appena
    // riscritte `paintPerson`.
    dipingiBacheca();

    count.textContent = t('office.count', { n: list.length });
    empty.textContent = t('office.empty');
    empty.hidden = list.length > 0;

    paintCella(usoS, 'ctx.session', d.usage?.session, d.sessionReset);
    paintCella(usoW, 'ctx.week', d.usage?.week, d.weekReset);
    uso.hidden = !d.usage;

    // E chi c'e' in ufficio, con quello che sta facendo adesso.
    paintGente();
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
      if (!root) return;
      paintStaff();
      // Il quadro viaggia per conto suo: i sub-agent nascono e muoiono al ritmo di
      // Claude, non a quello dei consumi. La fila in cima deve saperlo subito.
      paintGente();
    },
    /** Tornato a schermo dopo essere stato via: la misura di prima non vale piu'. */
    resize: fit,
  };
})();
