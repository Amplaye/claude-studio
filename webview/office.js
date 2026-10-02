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
  let gente;
  let scheda;
  let uso;
  let usoS;
  let usoW;
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
  /** Cosa mostra il foglio adesso: la bacheca, o le domande di qualcuno. */
  let foglioSu = 'bacheca';
  /** E di chi sono, quelle domande. */
  let foglioChi = '';
  /** Le domande gia' disegnate, per non rifare il foglio quando non e' cambiato niente. */
  let firmaDomande = '';

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
   * Le conversazioni e i sub-agent che hanno aperto, in un elenco solo, e i
   * sub-agent subito dopo il capo che li ha chiamati: da fuori si legge chi
   * lavora per chi senza doverlo scrivere da nessuna parte.
   *
   * La stanza li mostra gia', ma da sedici pixel visti dall'alto si vede *che*
   * ci sono, non *chi* sono ne' cosa stanno facendo. Qui hanno un nome scritto e
   * si cliccano.
   *
   * Su cosa stia lavorando una conversazione non e' il suo nome: e' il passo del
   * piano che ha in corso adesso, cioe' la stessa riga che nella stanza qualcuno
   * ha in mano sotto forma di foglietto. Se non ce n'e' uno aperto vale come sta
   * — attiva, ferma, ha finito — che e' comunque la risposta a "cosa sta
   * facendo".
   */
  function cheFa(id) {
    const items = (board[id] && board[id].items) || [];
    const viva = items.find((it) => it.status === 'in_progress');
    return viva ? viva.activeForm || viva.content || '' : '';
  }

  /**
   * Chi lavora per una conversazione, in ordine d'albero: ognuno subito dopo chi l'ha
   * lanciato. Le faccende di casa della CLI no — un osservatore non e' qualcuno al
   * lavoro, e una persona seduta per sempre a guardarlo non direbbe niente.
   */
  const aiutanti = (id) => ((board[id] && board[id].agents) || []).filter((a) => !a.ambient);
  const alLavoro = (id) => aiutanti(id).filter((a) => a.status === 'in_progress');

  /* ---- e chi porta il passo del piano ----
   *
   * Il passo in corso e' una persona: entra dalla porta, stacca il suo foglietto dalla
   * bacheca, si siede accanto al capo, e quando il passo e' fatto lo riappende verde e
   * se ne va. Nella 0.34 era stato tolto — «una persona finta, il lavoro lo fa la
   * conversazione stessa» — e l'ufficio si e' svuotato: i sub-agent veri sono rari, i
   * passi ci sono quasi a ogni messaggio, ed era il loro andirivieni a far sembrare la
   * stanza un posto dove si lavora.
   *
   * Solo finche' la conversazione lavora davvero: un passo rimasto «in corso» a turno
   * finito non lo sta facendo nessuno, e uno seduto li' per un'ora mentirebbe. Nella
   * fila in cima non c'e': la fila dice chi c'e', e il passo e' gia' la riga «cosa sta
   * facendo» della sua conversazione. */
  const MAX_PASSI = 2;
  const passiVivi = (id) => {
    const b = board[id];
    if (!b || !b.busy) return [];
    return (b.items || []).filter((it) => it.status === 'in_progress').slice(0, MAX_PASSI);
  };
  /** Il nome di chi porta un passo: il numero se la CLI gliel'ha dato, se no il testo. */
  const chiavePasso = (it) => 'passo:' + (it.id || it.content);

  /** "12s", "4m 05s", "1h 02m": quanto, detto come si legge un orologio. */
  function durata(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return s + 's';
    const m = Math.floor(s / 60);
    if (m < 60) return m + 'm ' + String(s % 60).padStart(2, '0') + 's';
    return Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm';
  }

  const comeSta = (s) =>
    s.busy ? t('ctx.busy') : s.done ? t('ctx.done') : s.recent ? t('ctx.recent') : t('ctx.idle');

  /* ---- il rimpallo ----
   *
   * Due che si scrivono di continuo: quattro buste fra la stessa coppia in due
   * minuti. Puo' voler dire che stanno lavorando sul serio insieme, o che si
   * rimbalzano la stessa domanda senza venirne fuori — da qui non si sa quale, e
   * infatti non si ferma niente: si fa vedere, sulle due pedine e nel foglio, e chi
   * guarda decide. */
  const RIMPALLO = 4;
  const FINESTRA_RIMPALLO = 120000;

  /**
   * Le coppie di una conversazione che si sono scritte almeno RIMPALLO volte negli
   * ultimi due minuti, in un verso o nell'altro: `{ a, b, n }`, dove '' e' la
   * conversazione stessa. Le buste uscite dalla porta non contano: dall'altra parte
   * non c'e' nessuno di qui.
   */
  function coppieScritte(id) {
    const ora = Date.now();
    const coppie = new Map();
    for (const m of (board[id] && board[id].mail) || []) {
      if (m.out || ora - m.at > FINESTRA_RIMPALLO) continue;
      const a = m.from || '';
      const b = m.to || '';
      if (a === b) continue;
      const k = a < b ? a + '\n' + b : b + '\n' + a;
      coppie.set(k, (coppie.get(k) || 0) + 1);
    }
    return [...coppie]
      .filter(([, n]) => n >= RIMPALLO)
      .map(([k, n]) => {
        const [a, b] = k.split('\n');
        return { a, b, n };
      });
  }

  /** Le stesse, per persona: chi ('' = la conversazione) -> quante buste e con chi. */
  function rimpalli(id) {
    const out = new Map();
    for (const { a, b, n } of coppieScritte(id)) {
      for (const [chi, con] of [
        [a, b],
        [b, a],
      ]) {
        const prima = out.get(chi);
        if (!prima || prima.n < n) out.set(chi, { n, con });
      }
    }
    return out;
  }

  function abitanti() {
    const cards = (last && last.cards) || [];
    const out = [];
    for (const s of cards) {
      const chi = people.get(s.id);
      if (!chi) continue;
      const aspetta = !!(s.asks && s.asks.length);
      const vivi = alLavoro(s.id);
      const tutti = new Map(aiutanti(s.id).map((a) => [a.id, a]));
      // Il nome dell'altro capo della coppia: un aiutante si chiama col suo lavoro, la
      // conversazione col suo nome.
      const nomeDi = (k) => (k ? (tutti.get(k) && (tutti.get(k).title || tutti.get(k).type)) || '' : s.name);
      const scritti = rimpalli(s.id);
      const rimpallo = (k) => {
        const r = scritti.get(k);
        return r ? { n: r.n, nome: nomeDi(r.con) } : null;
      };
      out.push({
        key: 'c:' + s.id,
        id: s.id,
        nome: s.name,
        seme: chi.seme,
        posa: s.busy ? 'digita' : 'fermo',
        stato: aspetta ? t('office.asking') : comeSta(s),
        // Chi aspetta una risposta non "sta lavorando a" niente: sta aspettando
        // te, ed e' la cosa piu' urgente che questa fila possa dire.
        cosa: aspetta ? s.asks[0].title : cheFa(s.id) || comeSta(s),
        // Il passo in corso del suo filo: "Read package.json". C'era da sempre sul
        // filo delle task, e non lo leggeva nessuno.
        adesso: s.busy ? (board[s.id] && board[s.id].doing) || '' : '',
        squadra: vivi.length,
        pct: s.pct,
        capo: null,
        livello: 0,
        focused: !!s.focused,
        busy: !!s.busy,
        asking: aspetta,
        rimpallo: rimpallo(''),
      });
      // Chi porta il passo del piano: nella stanza c'e', nella fila no (vedi
      // `passiVivi`). Sta qui perche' cliccandolo nella stanza esce la sua scheda.
      const items = (board[s.id] && board[s.id].items) || [];
      for (const it of passiVivi(s.id)) {
        out.push({
          key: 's:' + s.id + '/' + chiavePasso(it),
          id: s.id,
          fila: false,
          passo: it,
          numero: items.indexOf(it) + 1,
          totale: items.length,
          nome: it.activeForm || it.content,
          seme: chi.seme + '/' + chiavePasso(it),
          posa: 'digita',
          stato: t('ctx.busy'),
          cosa: it.activeForm || it.content,
          adesso: (board[s.id] && board[s.id].doing) || '',
          pct: null,
          capo: s.name,
          genitore: s.name,
          livello: 1,
          focused: false,
          busy: true,
          asking: false,
          rimpallo: null,
        });
      }
      // I suoi, in ordine d'albero, e tutti: anche chi nella stanza un posto non ce
      // l'ha — perche' il capo e' in piedi, o perche' sono piu' di quanti ne stanno
      // attorno a una scrivania. La fila e' l'elenco di chi lavora; la stanza e' solo
      // dove ci si siede. Prima la fila leggeva la stanza, e chi non ci stava non
      // esisteva.
      //
      // Il livello e' quello che si vede: un aiutante il cui capo ha gia' finito
      // non resta rientrato sotto il vuoto, sale al posto di chi se n'e' andato.
      const livelli = new Map();
      for (const a of vivi) {
        const padre = a.parentId ? tutti.get(a.parentId) : null;
        const lv = padre && livelli.has(padre.id) ? livelli.get(padre.id) + 1 : 1;
        livelli.set(a.id, lv);
        out.push({
          key: 's:' + s.id + '/' + a.id,
          id: s.id,
          agente: a,
          // Un sub-agent non ha un nome: ha una cosa da fare, ed e' quella a dire chi e'.
          nome: a.title || a.type || '',
          // Lo stesso seme della persona nella stanza (vedi `buildStaff`): la faccina
          // in cima e' la sua, non quella di un sosia.
          seme: chi.seme + '/' + a.id,
          posa: 'digita',
          stato: t('ctx.busy'),
          cosa: a.doing || a.title || '',
          pct: null,
          capo: s.name,
          genitore: padre ? padre.title || padre.type || '' : s.name,
          livello: lv,
          focused: false,
          busy: true,
          asking: false,
          rimpallo: rimpallo(a.id),
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
    const tutti = abitanti().filter((a) => a.fila !== false);
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
        // Il segno del rimpallo: due frecce e quante buste. Nascosto finche' non serve.
        const scritti = el('span', 'of-chi-rimpallo');
        scritti.hidden = true;
        b.append(faccia, nome, scritti);
        b.onclick = () => apriScheda(a.key, b);
        p = { el: b, corpo, nome, scritti };
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
      // Il rientro e' per livello: chi lavora per un aiutante sta un passo piu' in
      // la' di chi lavora per la conversazione.
      p.el.dataset.livello = String(a.livello);
      p.el.style.setProperty('--lv', String(a.livello));
      p.el.classList.toggle('deep', a.livello > 1);
      p.el.classList.toggle('focused', a.focused);
      p.el.classList.toggle('busy', a.busy);
      p.el.classList.toggle('asking', !!a.asking);
      p.el.classList.toggle('aperta', guardato === a.key);
      p.el.classList.toggle('rimpallo', !!a.rimpallo);
      p.scritti.hidden = !a.rimpallo;
      p.scritti.textContent = a.rimpallo ? '⇄ ' + a.rimpallo.n : '';
      p.el.title =
        (a.capo ? t('office.worksFor', { name: a.genitore }) + ' - ' + a.cosa : a.nome + ' - ' + a.cosa) +
        (a.rimpallo ? ' - ' + t('office.pingPong', { n: a.rimpallo.n, name: a.rimpallo.nome }) : '');
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
   * Cliccare il capo nella stanza porta alla sua conversazione; cliccarlo qui
   * dice cosa sta facendo. Sono due domande diverse e hanno due posti diversi.
   * Gli impiegati invece si aprono anche dalla stanza: dietro di loro non c'e'
   * nessuna conversazione dove andare, e quello che hanno da dire e' tutto qui.
   */
  function apriScheda(key, ancora) {
    guardato = guardato === key ? null : key;
    if (guardato && ancora) {
      // Dove sta la pedina, in coordinate dell'ufficio. Il posto vero della scheda
      // lo decide `piazzaScheda`, quando la scheda e' gia' scritta e se ne conosce
      // l'altezza: prima non si sa se sotto ci sta.
      const b = ancora.getBoundingClientRect();
      const r = root.getBoundingClientRect();
      ancoraScheda = { left: b.left - r.left, top: b.top - r.top, bottom: b.bottom - r.top };
    }
    paintGente();
  }

  /** Dove sta la pedina della scheda aperta, in coordinate dell'ufficio. */
  let ancoraScheda = null;

  /**
   * Sotto la pedina, ma mai fuori dall'ufficio: una scheda che esce dallo schermo e'
   * una scheda tagliata a meta'. Ed era proprio quello che succedeva cliccando chi
   * sta nell'ultima fila di scrivanie — sotto c'e' solo il muro, e la scheda finiva
   * oltre il bordo di sotto. Se sotto non ci sta si apre sopra la pedina; se non ci
   * sta neanche sopra (una finestra bassa), si appoggia al bordo che c'e'.
   *
   * Si rifa' a ogni ridisegno della scheda, non solo all'apertura: la scheda e' viva,
   * e una riga che va a capo la allunga.
   */
  function piazzaScheda() {
    if (!ancoraScheda || scheda.el.hidden) return;
    const W = root.clientWidth;
    const H = root.clientHeight;
    const w = scheda.el.offsetWidth;
    const h = scheda.el.offsetHeight;
    const left = Math.max(8, Math.min(ancoraScheda.left, W - w - 8));
    let top = ancoraScheda.bottom + 6;
    if (top + h > H - 8) {
      const sopra = ancoraScheda.top - 6 - h;
      top = sopra >= 8 ? sopra : Math.max(8, H - h - 8);
    }
    scheda.el.style.left = left + 'px';
    scheda.el.style.top = top + 'px';
  }

  /** L'orologio della scheda aperta: gira solo finche' c'e' un orologio da far girare. */
  let lancetta = 0;

  /** Una riga della scheda: scritta se c'e' qualcosa da dire, nascosta se no. */
  function riga(n, testo) {
    n.textContent = testo || '';
    n.hidden = !testo;
  }

  function paintScheda() {
    if (!scheda) return;
    const a = guardato && abitanti().find((x) => x.key === guardato);
    if (!a) {
      guardato = null;
      scheda.el.hidden = true;
      clearInterval(lancetta);
      lancetta = 0;
      return;
    }
    scheda.el.hidden = false;
    scheda.nome.textContent = a.nome;
    const ag = a.agente;
    if (ag) {
      // Un aiutante: che tipo e', per chi lavora, cosa gli e' stato chiesto, cosa sta
      // facendo adesso e da quanto. Le cinque cose che dalla stanza non si vedono.
      scheda.ruolo.textContent = (ag.type ? ag.type + ' · ' : '') + t('office.worksFor', { name: a.genitore });
      const brief = (ag.brief || '').replace(/\s+/g, ' ').trim();
      riga(scheda.compito, brief ? t('office.brief', { text: brief.length > 160 ? brief.slice(0, 159) + '…' : brief }) : '');
      riga(scheda.cosa, ag.doing ? t('office.now', { text: ag.doing }) : '');
      riga(scheda.extra, ag.since ? t('office.since', { time: durata(Date.now() - ag.since) }) : '');
    } else if (a.passo) {
      // Chi porta un passo del piano: di chi e' il piano, a che punto, cosa sta facendo
      // adesso il filo, e da quanto. E' la stessa conversazione vista dal passo.
      scheda.ruolo.textContent = t('office.stepFor', { name: a.genitore });
      riga(scheda.compito, a.numero > 0 ? t('office.stepN', { n: a.numero, total: a.totale }) : '');
      riga(scheda.cosa, a.adesso ? t('office.now', { text: a.adesso }) : '');
      const da = board[a.id] && board[a.id].activeSince;
      riga(scheda.extra, da ? t('office.since', { time: durata(Date.now() - da) }) : '');
    } else {
      // Una conversazione: come sta, a che passo del piano e', cosa sta facendo il
      // suo filo adesso, e quanti aiutanti ha al lavoro.
      scheda.ruolo.textContent = a.stato;
      riga(scheda.compito, '');
      riga(scheda.cosa, a.cosa);
      const adesso = a.adesso && a.adesso !== a.cosa ? t('office.now', { text: a.adesso }) : '';
      const squadra = a.squadra ? (a.squadra === 1 ? t('office.helpers1') : t('office.helpersN', { n: a.squadra })) : '';
      riga(scheda.extra, [adesso, squadra].filter(Boolean).join(' · '));
    }
    // Cosa ha preso dall'archivio: e' il faldone che si vede sulla sua scrivania,
    // detto per nome.
    const note = ag ? ag.consulted : a.passo ? null : board[a.id] && board[a.id].consulted;
    riga(scheda.memo, note && note.length ? t('office.consulted', { notes: note.join(', ') }) : '');
    // E con chi si sta scrivendo troppo, se succede.
    riga(scheda.rimpallo, a.rimpallo ? t('office.pingPong', { n: a.rimpallo.n, name: a.rimpallo.nome }) : '');
    scheda.pct.hidden = a.pct == null;
    if (a.pct != null) {
      scheda.pctVal.textContent = Math.round(a.pct) + '%';
      scheda.pctFill.style.width = Math.max(0, Math.min(100, a.pct)) + '%';
      scheda.pctFill.style.background = barColor(a.pct);
    }
    piazzaScheda();
    // L'orologio vivo: "da quanto lavora" fermo al momento in cui hai aperto la
    // scheda dice un'ora che non e' piu' quella.
    const gira = !!((ag && ag.since) || (a.passo && board[a.id] && board[a.id].activeSince));
    if (gira && !lancetta) lancetta = setInterval(paintScheda, 1000);
    if (!gira && lancetta) {
      clearInterval(lancetta);
      lancetta = 0;
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
    /* Chi c'e', uno per uno, in mezzo alla fascia. Scorre in orizzontale invece
       di stringersi: con dieci persone in ufficio i nomi si ridurrebbero a due
       lettere — e due lettere non sono un nome — oppure schiaccerebbero i
       consumi, e una barra tagliata dice una percentuale che non e' quella vera. */
    gente = el('div', 'of-gente');
    gente.setAttribute('role', 'list');

    uso = el('div', 'of-uso');
    usoS = cella();
    usoW = cella();
    uso.append(usoS.el, usoW.el);

    /* La scheda di chi si sta guardando. Sta sopra la stanza e non dentro la
       fascia: la fascia e' alta quanto un bottone, e quello che una persona sta
       facendo e' una riga di testo vero che li' dentro non ci sta. */
    const box = el('div', 'of-scheda');
    box.hidden = true;
    const sNome = el('div', 'of-scheda-nome');
    const sRuolo = el('div', 'of-scheda-ruolo');
    const sCompito = el('div', 'of-scheda-compito');
    const sCosa = el('div', 'of-scheda-cosa');
    const sExtra = el('div', 'of-scheda-extra');
    // Le note che ha tirato fuori dall'archivio: solo i nomi, mai quello che c'e'
    // dentro — in una nota possono esserci credenziali, e questa scheda si guarda.
    const sMemo = el('div', 'of-scheda-memo');
    // Il rimpallo: due che si scrivono di continuo. Si dice e basta, non ferma niente.
    const sRimpallo = el('div', 'of-scheda-rimpallo');
    const sPct = el('div', 'of-scheda-pct');
    const sPctLab = el('span', null, t('office.ctxUsed'));
    const sPctVal = el('span', 'of-scheda-val');
    const sPctTop = el('div', 'of-cell-top');
    sPctTop.append(sPctLab, sPctVal);
    const sPctBar = el('div', 'of-cell-bar');
    const sPctFill = el('div', 'of-cell-fill');
    sPctBar.append(sPctFill);
    sPct.append(sPctTop, sPctBar);
    box.append(sNome, sRuolo, sCompito, sCosa, sExtra, sMemo, sRimpallo, sPct);
    scheda = {
      el: box,
      nome: sNome,
      ruolo: sRuolo,
      compito: sCompito,
      cosa: sCosa,
      extra: sExtra,
      memo: sMemo,
      rimpallo: sRimpallo,
      pct: sPct,
      pctLab: sPctLab,
      pctVal: sPctVal,
      pctFill: sPctFill,
    };

    /* La pelle della stanza: il legno di sempre, la notte in citta', Bali. Un
       bottone solo, subito prima dei consumi — si cambia di rado, e tre bottoni
       sempre in vista si sarebbero presi il posto della gente — che apre le tre
       stanze, ognuna col suo campione di colori. */
    pelleBtn = el('button', 'of-pelle');
    pelleBtn.type = 'button';
    pelleBtn.setAttribute('aria-haspopup', 'menu');
    pelleBtn.setAttribute('aria-expanded', 'false');
    // A mano come l'icona del titolo: qui dentro `ico` e' quella, non la funzione.
    const tavolozza = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    tavolozza.setAttribute('class', 'ico');
    const usoT = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    usoT.setAttribute('href', '#ion-color-palette');
    tavolozza.appendChild(usoT);
    pelleBtn.append(tavolozza);
    pelleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      apriPelli(pelliMenu.hidden);
    });
    pelliMenu = el('div', 'of-pelli');
    pelliMenu.hidden = true;
    pelliMenu.setAttribute('role', 'menu');
    pelliMenu.append(el('div', 'of-pelli-tit'));
    for (const p of PELLI) {
      const b = el('button');
      b.type = 'button';
      b.dataset.pelle = p;
      b.setAttribute('role', 'menuitemradio');
      b.append(el('span', 'of-campione ' + p), el('span', 'of-pelle-nome'));
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        scegliPelle(p);
        apriPelli(false);
        pelleBtn.focus();
      });
      pelliMenu.append(b);
    }
    // Le frecce scorrono le tre stanze, come in ogni menu.
    pelliMenu.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const voci = [...pelliMenu.querySelectorAll('button')];
      const i = voci.indexOf(document.activeElement);
      voci[(i + (e.key === 'ArrowDown' ? 1 : -1) + voci.length) % voci.length].focus();
    });
    // Si chiude come ogni menu: cliccando altrove — anche nella chat, che sta fuori
    // dall'ufficio e il cui clic qui non arriverebbe mai — o con Esc.
    document.addEventListener(
      'pointerdown',
      (e) => {
        if (!pelliMenu.hidden && !pelliMenu.contains(e.target) && !pelleBtn.contains(e.target)) apriPelli(false);
      },
      true
    );

    // Il nome del posto, chi c'e', la pelle e i consumi. La fila in mezzo si prende
    // lo spazio che avanza ed e' lei a spingere i consumi contro il bordo destro: la
    // pelle sta subito prima, perche' i consumi restano dove l'occhio li cerca.
    bar.append(title, gente, pelleBtn, uso);

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
    // I mobili ricolorati delle due pelli, stessa strada del foglio di legno. Se una
    // non arriva, skins.css ripiega sul foglio classico: mobili di legno in una
    // stanza blu, ma nessun rettangolo vuoto.
    if (root.dataset.roomNotte) stage.style.setProperty('--sheet-notte', 'url("' + abs(root.dataset.roomNotte) + '")');
    if (root.dataset.roomBali) stage.style.setProperty('--sheet-bali', 'url("' + abs(root.dataset.roomBali) + '")');
    vestiPelle();

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
    root.append(bar, wrap, scheda.el, pelliMenu);

    // La scheda si chiude come si chiude una cosa aperta per sbaglio: col tasto
    // che chiude tutto, o cliccando altrove. La pedina se la richiude da se',
    // quindi qui si guarda solo che il clic non sia caduto ne' dentro la scheda
    // ne' su una pedina — se no aprirne una la chiuderebbe subito dopo.
    root.addEventListener('click', (e) => {
      if (!guardato) return;
      if (scheda.el.contains(e.target) || e.target.closest('.of-chi') || e.target.closest('.of-staff')) return;
      guardato = null;
      paintGente();
    });
    root.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!pelliMenu.hidden) {
        apriPelli(false);
        pelleBtn.focus();
      } else if (guardato) {
        guardato = null;
        paintGente();
      } else return;
      // Esc qui ha chiuso qualcosa, e basta: senza, il tasto saliva fino alla pagina,
      // che lo prende per «ferma Claude» — chiudevi una scheda e fermavi il turno.
      e.preventDefault();
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
    // E fra un'occasione e l'altra, chi si trova vicino fa due chiacchiere.
    setInterval(chiacchierata, GIRO_CHIACCHIERE);

    window.I18N.onChange(() => {
      titleText.nodeValue = t('office.title');
      vestiBacheca();
      scriviPelli();
      if (last) render(last);
    });
    vestiBacheca();
    scriviPelli();
  }

  // ---------- la pelle ----------

  /** Le stanze che l'ufficio sa indossare: il legno di sempre e le due di skins.css. */
  const PELLI = ['classico', 'notte', 'bali'];
  /** Quella scelta. Arriva con le preferenze, anche prima che l'ufficio sia montato. */
  let pelle = 'classico';
  let pelleBtn;
  let pelliMenu;

  /**
   * Mette la pelle al palco. E' solo un attributo: la pianta non cambia, i nodi sono
   * gli stessi, e chi sta camminando continua a camminare.
   */
  function vestiPelle() {
    if (stage) {
      if (pelle === 'classico') delete stage.dataset.skin;
      else stage.dataset.skin = pelle;
    }
    if (pelliMenu) {
      for (const b of pelliMenu.querySelectorAll('button')) {
        b.setAttribute('aria-checked', String(b.dataset.pelle === pelle));
      }
    }
  }

  /** Le parole del bottone e del menu, nella lingua di adesso. */
  function scriviPelli() {
    if (!pelleBtn) return;
    pelleBtn.title = t('office.skin');
    pelleBtn.setAttribute('aria-label', t('office.skin'));
    pelliMenu.querySelector('.of-pelli-tit').textContent = t('office.skin');
    for (const b of pelliMenu.querySelectorAll('button')) {
      b.querySelector('.of-pelle-nome').textContent = t('office.skin.' + b.dataset.pelle);
    }
  }

  /** La scelta e' tua: si vede subito, e la si ricorda con le altre preferenze. */
  function scegliPelle(p) {
    if (!PELLI.includes(p)) return;
    pelle = p;
    vestiPelle();
    send({ cmd: 'setPrefs', value: { skin: p } });
  }

  /** Il menu delle pelli, sotto il bottone e allineato al suo bordo destro. */
  function apriPelli(aperto) {
    if (!pelliMenu) return;
    pelliMenu.hidden = !aperto;
    pelleBtn.setAttribute('aria-expanded', String(!!aperto));
    if (!aperto) return;
    vestiPelle();
    const b = pelleBtn.getBoundingClientRect();
    const r = root.getBoundingClientRect();
    const w = pelliMenu.offsetWidth;
    pelliMenu.style.left = Math.max(8, Math.min(b.right - r.left - w, r.width - w - 8)) + 'px';
    pelliMenu.style.top = b.bottom - r.top + 6 + 'px';
    const scelta = pelliMenu.querySelector('button[aria-checked="true"]') || pelliMenu.querySelector('button');
    if (scelta) scelta.focus();
  }

  let fitOn;

  /**
   * La stanza riempie la scheda in due mosse.
   *
   * Prima l'ingrandimento: quante volte ci sta il DISEGNO — 384 per 320, la
   * misura che non cambia mai — nello spazio che c'e'. Poi la stanza cresce fino
   * a riempire quello spazio a quell'ingrandimento: le si aggiunge pavimento nel
   * corridoio in mezzo e in fondo al salone, e i muri di fuori si spostano con
   * lui. Alla fine si rimisura, perche' una stanza cresciuta ci sta un pelo piu'
   * larga di prima.
   *
   * L'ordine e' quello e non l'inverso: se si ingrandisse in base alla stanza
   * cresciuta, la stanza crescerebbe in base a un ingrandimento che dipende da
   * lei, e le due si rincorrerebbero.
   *
   * Il tetto non e' un giudizio sul disegno, e' un fermo: nessuna scheda arriva
   * a dodici.
   */
  function fit() {
    if (!fitOn) return;
    const R = window.ROOM;
    const largo = fitOn.clientWidth;
    const alto = fitOn.clientHeight;
    if (largo < 2 || alto < 2) return;
    const k0 = Math.max(0.5, Math.min(12, Math.min(largo / R.W0, alto / R.H0)));
    // La gente sta su coordinate sue — la scrivania, la targhetta — e quelle le
    // sa solo chi disegna le persone: se la stanza si e' mossa, si ridisegna.
    if (R.cresci(largo / k0, alto / k0) && last) render(last);
    const k = Math.max(0.5, Math.min(12, Math.min(largo / R.W, alto / R.H)));
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
    // Il punto esclamativo di chi ti sta aspettando. Sta nella stessa nuvoletta dei
    // puntini e della spunta perche' e' la stessa cosa — cosa sta facendo adesso —
    // e perche' quel posto e' l'unico attorno alla testa che nessun mobile copre.
    const bang = el('span', 'of-bang', '!');
    bubble.append(dots, tick, bang);

    // La scatoletta del contesto quasi finito. Sta addosso alla persona e non
    // sulla targhetta perche' e' una cosa che succede a lei, non al suo posto.
    b.append(el('span', 'of-ring'), who, bubble, el('span', 'of-crunch'));
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
    const chi = {
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
      asks: [],
    };

    // Un clic normale porta alla sua conversazione — e ci porta restando in
    // ufficio. Ma se quella persona sta aspettando una risposta, il clic apre
    // prima la domanda: e' l'unica cosa che si puo' fare da qui e che senza di
    // questo non faresti mai, perche' non sapresti che c'e'. Legge `chi` e non i
    // dati di adesso: la persona si costruisce una volta e vive finche' vive la
    // conversazione, quello che aspetta cambia a ogni giro.
    b.onclick = () =>
      chi.asks.length ? apriDomande(chi.id) : send({ cmd: 'focus', id: chi.id });

    return chi;
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

  /** Quanti se ne tengono per capo, passi del piano compresi. Oltre, sono una folla attorno a una scrivania. */
  const MAX_STAFF = 5;
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

  function buildStaff(chiave, capo, it, passo) {
    const b = el('span', passo ? 'of-guy of-staff of-passo busy' : 'of-guy of-staff busy');
    const who = el('span', 'of-body');
    const bubble = el('span', 'of-bubble');
    const dots = el('span', 'of-dots');
    dots.append(el('i'), el('i'), el('i'));
    bubble.append(dots);
    b.append(el('span', 'of-ring'), who, bubble);
    crowd.append(b);
    // Il seme e' il capo piu' l'id della task: la stessa faccia che ha nella fila in
    // cima (vedi `abitanti`), e la stessa per tutto il tempo che lavora. Chi porta un
    // passo del piano si chiama col passo.
    const nome = passo ? chiavePasso(it) : it.id;
    // `padre` e' chi gli ha passato il lavoro, se e' un altro aiutante: e' alla sua
    // scrivania che torna la busta dell'esito.
    const chi = {
      chiave,
      capoId: capo.id,
      nome,
      passo: !!passo,
      padre: passo ? null : it.parentId || null,
      el: b,
      fig: who,
      seme: capo.seme + '/' + nome,
    };
    // Dietro un impiegato non c'e' nessuna conversazione dove andare: cliccarlo
    // dice cosa sta facendo, che e' l'unica cosa che ha da dire. Dalla fila in
    // cima si arriva alla stessa scheda, e da li' anche con la tastiera.
    b.onclick = () => apriScheda('s:' + chiave, b);
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

  /* I posti sono in fila uno solo: prima le otto scrivanie, poi i sei sgabelli
     attorno ai due tavoli. Un indice solo perche' `banchi` ne tiene uno solo, e
     due elenchi paralleli sarebbero due modi di dire "il posto numero tre". */
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
    // In ordine d'albero, quindi chi ha lanciato qualcuno si e' gia' seduto quando
    // tocca a chi ha lanciato.
    for (const [chiave, { capo, it }] of voluti) {
      if (banchi.has(chiave) || !capo.casa) continue;
      // L'ancora e' chi l'ha lanciato: un aiutante di un aiutante si siede vicino a
      // lui, non al capo — e' il gruppetto che fa leggere da lontano chi lavora per chi.
      const padre = it.parentId ? capo.id + '/' + it.parentId : null;
      const ancora = padre != null && banchi.has(padre) ? postoBanco(banchi.get(padre)) : capo.casa;
      let scelto = -1;
      let quanto = Infinity;
      for (let i = 0; i < posti(); i++) {
        if (seats[i] || presi.has(i)) continue;
        const p = postoBanco(i);
        // Le scrivanie vengono prima degli sgabelli a qualunque distanza: un
        // posto col computer e' un posto migliore di uno col portatile, e la
        // sala riunioni si riempie solo quando il salone e' pieno davvero.
        const d = Math.hypot(p.x - ancora.x, p.y - ancora.y) + (sgabello(i) ? 1e4 : 0);
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
    // I posti in piedi sono quattro: il quinto, se mai non trovasse una sedia in tutta
    // la stanza, ricomincia dal primo invece di cadere fuori dall'elenco.
    const [dx, dy] = POSTI_STAFF[i % POSTI_STAFF.length];
    return [capo.casa.x + 8 + dx, capo.casa.y + 24 + dy];
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
      const n = el('i', 'of-portatile ' + (g.verso || 'giu'));
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
   * Solo gli aiutanti davvero al lavoro: uno "da fare" non e' ancora entrato in
   * ufficio, e uno finito se n'e' andato. E solo i capi seduti — chi e' in piedi
   * in fila non ha un posto attorno a cui mettere nessuno.
   *
   * Si leggono dagli aiutanti e non dai passi del piano. Prima era la stessa lista,
   * e un passo in corso diventava una persona finta che entrava dalla porta a fare
   * un lavoro che stava facendo la conversazione stessa.
   */
  function volutiStaff() {
    const out = new Map();
    for (const [id, capo] of people) {
      if (!capo.casa) continue;
      // Prima chi porta il passo: e' il lavoro della conversazione stessa, e si siede
      // piu' vicino di tutti. Poi gli aiutanti, nell'ordine in cui sono partiti.
      const chi = [
        ...passiVivi(id).map((it) => ({ it, passo: true, k: chiavePasso(it) })),
        ...alLavoro(id).map((it) => ({ it, passo: false, k: it.id })),
      ];
      chi.slice(0, MAX_STAFF).forEach(({ it, passo, k }, i) => out.set(id + '/' + k, { capo, it, i, passo }));
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
      // Se ha cercato nella memoria mentre arrivava, in archivio ci va adesso.
      archivioStaff(chi);
    }
  }

  /**
   * Finito: riappende il suo foglietto alla bacheca, e se ne va.
   *
   * Sulla bacheca e non su un tavolo: la bacheca c'e', ed e' il posto dove il
   * lavoro di questa stanza sta scritto. Una pila di roba fatta su un altro
   * mobile era un secondo posto dove guardare per sapere le stesse cose — verde
   * fatto, rosso storto, e sono due colori della stessa bacheca. Il foglio
   * ricompare li' e non c'e' nessuna copia in ritardo da tenere in pari con
   * nessun registro, perche' il foglio e' uno solo e sta dove sta chi lo porta.
   */
  async function esce(chi) {
    chi.esce = true;
    // Il portatile si chiude quando ci si alza, non quando si e' usciti.
    paintPortatili();
    // Prima si aspetta che abbia finito di arrivare. Un sub-agent puo' chiudersi
    // mentre chi lo porta e' ancora per strada, e due tragitti sullo stesso
    // elemento se lo litigano un tratto per uno: la persona rimbalza e non arriva
    // piu' da nessuna parte. Lo stesso per il giro all'archivio.
    await chi.andata;
    await chi.giro;
    // Alzandosi dice com'e' andata a chi gli aveva dato il lavoro.
    if (chi.esito) congedo(chi);
    // Il faldone torna in archivio: chi se ne va non lascia carte sulla scrivania.
    window.ROOM.riponi(chi);
    window.ROOM.vesti(chi.fig, chi.seme, 'cammina');
    if (await window.ROOM.viaggio(chi.el, ...window.ROOM.BACHECHE.muro.posto)) {
      await attesa(GESTO);
      // Il foglio si posa qui, e da qui in poi e' del muro. Portarlo in mano fino
      // alla porta voleva dire lo stesso foglio appeso e in mano a qualcuno nello
      // stesso momento — che e' l'unico modo in cui questa bacheca conta due
      // volte lo stesso lavoro.
      if (chi.foglio) {
        chi.foglio.remove();
        chi.foglio = null;
      }
      staff.delete(chi.chiave);
      paintBacheche();
      // E com'e' andata torna a chi gli aveva passato il lavoro: una busta dalla
      // bacheca alla sua scrivania, verde o rossa come il foglio appena riappeso.
      if (chi.esito) esito(chi);
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
    // I sub-agent vanno e vengono al ritmo di Claude, non a quello dei consumi:
    // la fila in cima li segue di qui, o resterebbe indietro di un giro.
    paintGente();
  }

  // ---------- le bacheche ----------
  //
  // Quello che c'e' da fare, quello che e' andato storto e quello che e' fatto,
  // sulla stessa bacheca. I foglietti non hanno testo — a cinque per quattro non ce ne
  // sta — e il colore e' tutto quello che dicono, che poi e' tutto quello che una
  // bacheca dice davvero anche quando i foglietti sono scritti.
  //
  // Quelli in mano a qualcuno non ci sono: un foglio e' uno solo, e se sta
  // camminando per la stanza non e' anche appeso al muro.

  /** Quanti ne stanno su una bacheca prima di impilarsi nell'angolo. */
  const PER_BACHECA = 12;
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
        if (it.status === 'pending') {
          fare++;
          continue;
        }
        // Un passo in mano a chi lo porta non e' sul muro: ne' mentre ci lavora, ne'
        // mentre lo riporta fatto. Il foglio e' uno solo.
        const chi = staff.get(id + '/' + chiavePasso(it));
        if (chi && chi.foglio) continue;
        if (it.status === 'failed') storte++;
        else if (it.status === 'completed') fatte++;
        // Un passo in corso che nessuno ha staccato — chi lo porta e' ancora per strada,
        // o la conversazione si e' fermata — e' ancora appeso, giallo come una cosa da fare.
        else if (it.status === 'in_progress') fare++;
      }
      // E il lavoro degli aiutanti finiti: il foglio che hanno riappeso, verde o
      // rosso. Chi lo sta ancora riportando ce l'ha in mano, e un foglio e' uno solo.
      for (const a of aiutanti(id)) {
        if (staff.has(id + '/' + a.id)) continue;
        if (a.status === 'failed') storte++;
        else if (a.status === 'completed') fatte++;
      }
    }
    const B = window.ROOM.BACHECHE;
    const [gx, gy] = B.muro.griglia;
    // Le storte in cima: sono quelle da guardare, e la prima riga e' quella che
    // si guarda. Le gialle riempiono da dove finiscono loro.
    const out = [];
    appendi(out, 'storta', storte, gx, gy, B.muro.z, 0);
    appendi(out, 'fare', fare, gx, gy, B.muro.z, storte);
    // E il verde in fondo: quello che e' fatto si guarda per ultimo, ma si guarda
    // qui e non su un tavolo dall'altra parte della stanza. Un secondo mobile con
    // sopra le stesse cose e' un secondo posto dove andare a controllare.
    appendi(out, 'fatta', fatte, gx, gy, B.muro.z, storte + fare);
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
    // la lista che si sta leggendo. Con le graffe e senza valore di ritorno: un
    // `onclick` che torna `false` annulla il clic, e dentro il foglio non si apriva
    // piu' nemmeno una sezione chiusa.
    n.onclick = (e) => {
      if (e.target === n) apriBacheca(false);
    };
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
    sheetClose.title = t('office.boardClose');
    sheetClose.setAttribute('aria-label', t('office.boardClose'));
    dipingiFoglio();
  }

  /**
   * Le domande di una persona, aperte.
   *
   * Stesso foglio della bacheca: due finestre uguali per due elenchi sarebbero due
   * volte lo stesso codice, e la seconda invecchierebbe.
   */
  function apriDomande(id) {
    if (!sheet) return;
    foglioSu = 'domande';
    foglioChi = id;
    firmaDomande = '';
    sheet.hidden = false;
    if (stage) stage.inert = true;
    dipingiFoglio();
    sheetClose.focus();
  }

  /** Un bottone del foglio delle domande. */
  function bottone(chiave, cls, fn) {
    const b = el('button', 'of-ask-btn ' + cls, t(chiave));
    b.type = 'button';
    b.onclick = fn;
    return b;
  }

  function dipingiDomande() {
    if (!sheet || sheet.hidden) return;
    const chi = people.get(foglioChi);
    const asks = (chi && chi.asks) || [];
    // Il foglio si ridipinge a ogni giro dei consumi, che sono un paio di secondi:
    // rifare i bottoni sotto il dito significa perdere il clic a meta'. Si rifa'
    // solo quando le domande sono davvero cambiate — ed e' proprio quello che deve
    // succedere quando ne rispondi una.
    const firma = asks.map((a) => a.id).join('|');
    if (firma === firmaDomande) return;
    firmaDomande = firma;
    sheetTitle.textContent = t('office.askTitle', { name: chi ? chi.pname.textContent : '' });
    sheetCount.hidden = true;
    // Le sezioni della bacheca restano in `elenchi`: staccarle di qui non le perde,
    // e ci pensa lei a riappenderle quando il foglio torna a essere la bacheca.
    sheetBody.textContent = '';
    for (const a of asks) {
      const sez = el('section', 'of-ask-item');
      sez.append(el('h3', 'of-ask-title', a.title));
      if (a.detail) sez.append(el('p', 'of-ask-detail', a.detail));
      const riga = el('div', 'of-ask-row');
      // Alle domande a scelta multipla non si risponde di qui: le scelte le disegna
      // la chat, e un "consenti" senza scelta sarebbe una risposta vuota mandata al
      // modello. Di qui si va di la', che e' un passo e non un vicolo cieco.
      if (a.kind !== 'question') {
        riga.append(bottone('office.askAllow', 'si', () => send({ cmd: 'answerAsk', sid: foglioChi, id: a.id, choice: 'allow' })));
      }
      riga.append(bottone('office.askDeny', 'no', () => send({ cmd: 'answerAsk', sid: foglioChi, id: a.id, choice: 'deny' })));
      riga.append(
        bottone('office.askOpen', 'va', () => {
          const chiave = foglioChi;
          apriBacheca(false);
          send({ cmd: 'focus', id: chiave, office: true });
        })
      );
      sez.append(riga);
      sheetBody.append(sez);
    }
    sheetEmpty.textContent = t('office.askEmpty');
    sheetEmpty.hidden = asks.length > 0;
  }

  /** Il foglio ridipinge quello che ci sta dentro adesso. */
  function dipingiFoglio() {
    if (foglioSu === 'domande') dipingiDomande();
    else dipingiBacheca();
  }

  function apriBacheca(aperta) {
    // Gia' com'e' richiesta: non si ridipinge e soprattutto non si sposta il fuoco.
    if (!sheet || (!sheet.hidden === aperta && foglioSu === 'bacheca')) return;
    const tornaA = foglioChi;
    foglioSu = 'bacheca';
    foglioChi = '';
    sheet.hidden = !aperta;
    if (stage) stage.inert = aperta;
    if (aperta) {
      dipingiFoglio();
      sheetClose.focus();
    } else if (tornaA && people.has(tornaA)) {
      // Chiuse le domande il fuoco torna sulla persona da cui erano uscite, non in
      // cima alla stanza.
      people.get(tornaA).el.focus();
    } else if (kanban) {
      // Il fuoco torna da dove veniva: chi ha aperto col tasto non deve ritrovarsi
      // in cima alla pagina.
      kanban.focus();
    }
  }

  function dipingiBacheca() {
    if (!sheet || sheet.hidden || foglioSu !== 'bacheca') return;
    sheetTitle.textContent = t('office.boardTitle');
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
        // Senza aiutanti: quelli hanno la sezione loro qui sotto, ad albero.
        e = { sez, nome, pannello: window.TaskPanel ? window.TaskPanel(dove, { agents: false }) : null };
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
    const gente = dipingiAlbero();
    sheetCount.textContent = quante ? t('tasks.count', { done: fatte, total: quante }) : '';
    sheetCount.hidden = !quante;
    sheetEmpty.textContent = t('office.boardEmpty');
    sheetEmpty.hidden = quante > 0 || gente > 0;
  }

  /* ---- chi lavora per chi ----
   *
   * L'ultima sezione del foglio: per ogni conversazione, una scheda con la sua
   * squadra. Era un elenco unico di righe rientrate — capo, aiutante, aiutante,
   * capo — e con una dozzina di aiutanti diventava un muro di testo dove non si
   * capiva piu' chi lavorasse per chi, ne' chi stesse lavorando adesso.
   *
   * Adesso ogni conversazione e' una scheda: la sua faccia e il suo nome in testa,
   * e accanto quanti sono al lavoro, quanti hanno finito e quanti no. Sotto, chi
   * lavora adesso — con la stessa faccia che ha nella stanza, cosa sta facendo e da
   * quanto — e chi e' stato lanciato da un altro aiutante gli sta appeso sotto, con
   * un gomito che lo dice. Chi ha finito sta raccolto in fondo, chiuso: e' storia, e
   * si apre se serve. La scheda ricorda se l'hai aperta.
   *
   * Si rifa' a ogni giro invece di ridipingerla: sono poche righe, e quello che deve
   * sopravvivere (aperto o chiuso) sta in `finitiAperti`. */
  let albero;
  /** id conversazione -> la sezione «hanno finito» e' aperta. Chi non c'e' e' come la vuole la scheda. */
  const finitiAperti = new Map();

  /** Una faccina della stanza, per la scheda: stessa striscia, stesso seme. */
  function faccina(seme) {
    const f = el('span', 'of-facciola');
    const corpo = el('span', 'of-body');
    f.append(corpo);
    window.ROOM.vesti(corpo, seme, 'fermo');
    return f;
  }

  /** Una pastiglia coi numeri della squadra: «2 al lavoro», «5 finiti», «1 non riuscito». */
  function pastiglia(cls, testo) {
    const p = el('span', 'of-pastiglia ' + cls);
    p.append(el('i'), document.createTextNode(testo));
    return p;
  }

  function dipingiAlbero() {
    if (!albero) {
      albero = el('section', 'of-sheet-who of-tree');
      albero.append(el('h3', 'of-sheet-name'), el('p', 'of-tree-intro'), el('div', 'of-tree-body'));
    }
    // Prima chi ha qualcuno al lavoro adesso: e' la scheda che si viene a guardare.
    const con = [...people.keys()]
      .filter((id) => aiutanti(id).length)
      .sort((p, q) => alLavoro(q).length - alLavoro(p).length);
    if (!con.length) {
      albero.remove();
      return 0;
    }
    albero.children[0].textContent = t('office.tree');
    albero.children[1].textContent = t('office.treeIntro');
    const corpo = albero.children[2];
    // Quello che e' aperto adesso resta aperto: lo si legge dalle schede che stanno per
    // essere rifatte, e non dall'evento `toggle`, che arriva dopo — un aggiornamento
    // che cade fra il clic e l'evento richiudeva la sezione appena aperta.
    for (const vecchia of corpo.querySelectorAll('.of-squadra')) {
      const det = vecchia.querySelector('details.of-finiti');
      if (det) finitiAperti.set(vecchia.dataset.id, det.open);
    }
    const schede = [];
    let n = 0;
    for (const id of con) {
      const capo = people.get(id);
      const tutti = aiutanti(id);
      const vivi = tutti.filter((a) => a.status === 'in_progress');
      const finiti = tutti.filter((a) => a.status === 'completed' || a.status === 'failed');
      const ok = finiti.filter((a) => a.status === 'completed').length;
      const ko = finiti.length - ok;
      n += tutti.length;

      const sq = el('article', 'of-squadra');
      sq.dataset.id = id;
      const testa = el('header', 'of-squadra-head');
      const conti = el('span', 'of-squadra-conti');
      if (vivi.length) conti.append(pastiglia('vivo', t('office.treeLive', { n: vivi.length })));
      if (ok) conti.append(pastiglia('riuscito', t('office.treeOk', { n: ok })));
      if (ko) conti.append(pastiglia('fallito', t('office.treeKo', { n: ko })));
      testa.append(faccina(capo.seme), el('span', 'of-squadra-nome', capo.pname.textContent), conti);
      sq.append(testa);

      // Chi lavora adesso, ad albero. Il livello e' quello che si vede: chi e' stato
      // lanciato da un aiutante che ha gia' finito sale sotto la conversazione, invece
      // di restare appeso a un gomito che non porta a nessuno.
      if (vivi.length) {
        const lista = el('ul', 'of-albero');
        // Prima la forma dell'albero — chi e' appeso a chi, e chi e' l'ultimo dei suoi
        // fratelli — poi le righe: i fili che scendono da un aiutante al suo prossimo
        // fratello passano attraverso le righe dei figli, e per disegnarli bisogna gia'
        // sapere chi viene dopo.
        const vis = [];
        const perId = new Map();
        for (const a of vivi) {
          const padre = a.parentId && perId.has(a.parentId) ? perId.get(a.parentId) : null;
          const v = { a, lv: padre ? padre.lv + 1 : 1, padre };
          vis.push(v);
          perId.set(a.id, v);
        }
        const figli = new Map();
        for (const v of vis) {
          const k = v.padre ? v.padre.a.id : '';
          if (!figli.has(k)) figli.set(k, []);
          figli.get(k).push(v);
        }
        const ultimo = (v) => {
          const f = figli.get(v.padre ? v.padre.a.id : '');
          return f[f.length - 1] === v;
        };
        const filo = (cls, k) => {
          const f = el('i', cls);
          f.style.setProperty('--k', String(k));
          return f;
        };
        vis.forEach((v, i) => {
          const { a, lv } = v;
          const r = el('li', 'of-nodo in_progress');
          r.dataset.livello = String(lv);
          r.style.setProperty('--lv', String(lv));
          if (lv > 1) {
            // I fili degli antenati che hanno ancora un fratello sotto: passano dritti.
            for (let p = v.padre; p && p.lv > 1; p = p.padre) if (!ultimo(p)) r.append(filo('of-filo', p.lv));
            // E il proprio gomito, che parte dalla faccia di chi l'ha lanciato — o dal
            // filo del fratello di sopra — e prosegue in giu' se c'e' un altro fratello.
            const primo = i > 0 && vis[i - 1] === v.padre;
            r.append(filo('of-gomito' + (primo ? ' primo' : ''), lv));
            if (!ultimo(v)) r.append(filo('of-filo basso', lv));
          }
          const testo = el('span', 'of-nodo-testo');
          testo.append(el('span', 'of-nodo-titolo', a.title || a.type || ''));
          const sotto = [a.type, a.doing].filter(Boolean).join(' · ');
          if (sotto) testo.append(el('span', 'of-nodo-sotto', sotto));
          r.append(faccina(capo.seme + '/' + a.id), testo);
          if (a.since) r.append(el('span', 'of-nodo-tempo', durata(Date.now() - a.since)));
          r.title = [a.title, a.brief ? t('office.brief', { text: a.brief }) : ''].filter(Boolean).join('\n');
          lista.append(r);
        });
        sq.append(lista);
      } else {
        sq.append(el('p', 'of-squadra-vuota', t('office.treeNone')));
      }

      // Chi ha finito: in fondo e chiuso, i piu' recenti prima. Aperto da solo se e'
      // tutto quello che c'e' da leggere — o se l'hai aperto tu.
      if (finiti.length) {
        const det = el('details', 'of-finiti');
        const aperto = finitiAperti.has(id) ? finitiAperti.get(id) : !vivi.length && finiti.length <= 3;
        det.open = aperto;
        det.addEventListener('toggle', () => finitiAperti.set(id, det.open));
        det.append(el('summary', null, t('office.treeFinished', { n: finiti.length })));
        const lista = el('ul', 'of-albero chiuso');
        for (const a of finiti.slice().reverse()) {
          const r = el('li', 'of-nodo ' + a.status);
          r.append(el('i', 'of-nodo-esito'), el('span', 'of-nodo-titolo', a.title || a.type || ''));
          if (a.type) r.append(el('span', 'of-nodo-tipo', a.type));
          if (a.ms) r.append(el('span', 'of-nodo-tempo', durata(a.ms)));
          r.title = [a.title, a.summary || ''].filter(Boolean).join('\n');
          lista.append(r);
        }
        det.append(lista);
        sq.append(det);
      }

      // E chi si sta scrivendo troppo: la stessa cosa delle due pedine in cima, detta
      // per intero.
      const nomi = new Map(tutti.map((a) => [a.id, a.title || a.type || '']));
      const nome = (k) => (k ? nomi.get(k) || '' : capo.pname.textContent);
      for (const { a, b, n: quante } of coppieScritte(id)) {
        sq.append(el('p', 'of-tree-rimpallo', t('office.pingPongTree', { a: nome(a), b: nome(b), n: quante })));
      }
      schede.push(sq);
    }
    // Chi non c'e' piu' non tiene aperta niente.
    for (const id of [...finitiAperti.keys()]) if (!people.has(id)) finitiAperti.delete(id);
    corpo.replaceChildren(...schede);
    sheetBody.append(albero);
    return n;
  }

  // ---------- le buste del lavoro passato di mano ----------
  //
  // Quelle di turno vanno fra la porta e una scrivania: dicono che sei tu a scrivere
  // e Claude a rispondere. Queste stanno tutte dentro la stanza, perche' e' li' che il
  // lavoro passa di mano: il compito va dalla scrivania di chi lo da' alla bacheca —
  // dove l'aiutante appena entrato lo va a staccare — l'esito torna indietro quando
  // ha finito, e i messaggi fra aiutanti volano da una scrivania all'altra.
  //
  // Il colore dice quale: gialla come il foglietto che diventera', verde o rossa
  // come il foglio appena riappeso, lilla per i messaggi.

  /** Il compito vola solo per chi e' nato adesso: aprendo l'ufficio a meta' lavoro non parte una raffica. */
  const NATO_DA = 10000;
  /** E un messaggio vecchio non si rispedisce: e' gia' arrivato, quando ancora non guardavi. */
  const POSTA_FRESCA = 10000;
  /** I messaggi gia' volati, per id della chiamata: ognuno una volta sola. */
  const spedite = new Set();

  /** Dove sta una persona, per una busta: all'altezza delle mani, non dei piedi. */
  const mani = (n) => [parseFloat(n.style.left) + 8, parseFloat(n.style.top) + 12];

  /**
   * Dove consegnare a qualcuno di `capo`: la sua scrivania (o lo sgabello) se ce l'ha,
   * se no dove sta adesso. Senza `agente` e' il capo stesso. Null se non e' nella
   * stanza: chi chiama decide se la busta esce dalla porta o non parte.
   */
  function postoDi(capo, agente) {
    if (!capo || !capo.el.isConnected) return null;
    if (!agente) return capo.casa ? [capo.casa.x + 8, capo.casa.y + 12] : mani(capo.el);
    const chiave = capo.id + '/' + agente;
    const banco = banchi.get(chiave);
    if (banco != null) {
      const p = postoBanco(banco);
      return [p.x + 8, p.y + 12];
    }
    const chi = staff.get(chiave);
    return chi && !chi.esce ? mani(chi.el) : null;
  }

  /** La bacheca: la busta atterra sul legno, in mezzo ai foglietti. */
  function suBacheca() {
    const [gx, gy] = window.ROOM.BACHECHE.muro.griglia;
    return [gx + 14, gy + 8];
  }

  /** Il compito: dalla scrivania di chi lo da' — il capo, o l'aiutante che l'ha lanciato — alla bacheca. */
  function compito(capo, it) {
    const da = postoDi(capo, it.parentId) || postoDi(capo, null);
    if (da) window.ROOM.posta(stage, da, suBacheca(), 'compito');
  }

  /** L'esito: dalla bacheca a chi gli aveva passato il lavoro, se e' ancora nella stanza. */
  function esito(chi) {
    const capo = people.get(chi.capoId);
    const a = postoDi(capo, chi.padre) || postoDi(capo, null);
    if (a) window.ROOM.posta(stage, suBacheca(), a, chi.esito === 'ko' ? 'esito ko' : 'esito');
  }

  /**
   * I messaggi fra aiutanti (SendMessage), ognuno una busta. Da chi a chi lo dice il
   * quadro; chi non e' nella stanza riceve dalla porta — o spedisce da li', se e'
   * lui a mancare. Se mancano tutti e due non c'e' niente da far vedere.
   */
  function paintPosta() {
    const ora = Date.now();
    for (const id of Object.keys(board)) {
      const capo = people.get(id);
      for (const m of board[id].mail || []) {
        if (!m || !m.id || spedite.has(m.id)) continue;
        spedite.add(m.id);
        if (!capo || ora - (m.at || 0) > POSTA_FRESCA) continue;
        const da = postoDi(capo, m.from);
        const a = m.out ? null : postoDi(capo, m.to);
        if (!da && !a) continue;
        window.ROOM.posta(stage, da || window.ROOM.INGRESSO, a || window.ROOM.INGRESSO, 'lettera');
        // E chi la manda la dice, con le parole vere del messaggio; chi la riceve
        // risponde, se e' nella stanza.
        const mitt = m.from ? staff.get(id + '/' + m.from) : capo;
        const dest = m.out ? null : m.to ? staff.get(id + '/' + m.to) : capo;
        const testo = corto(maschera(m.text), 40);
        if (mitt && testo && Math.random() < 0.8) recitaAppena('lettera', mitt, dest, { testo }, 3);
      }
    }
    // Il registro non cresce per sempre: quelle di un'ora fa non tornano piu' nel quadro.
    for (const v of spedite) {
      if (spedite.size <= 400) break;
      spedite.delete(v);
    }
  }

  // ---------- l'archivio ----------
  //
  // Chi cerca nella memoria si alza, va allo scaffale dei faldoni in sala riunioni a
  // passo svelto, se ne prende uno e torna: il faldone resta sulla scrivania finche'
  // il lavoro non e' finito, e la sua scheda dice quali note ha tirato fuori. Il come
  // sta in room.js; qui c'e' il chi e il quando.
  //
  // E' l'unica eccezione al "chi lavora resta seduto", e vale solo per chi ha un
  // posto: chi sta in piedi in fila non ha una scrivania da cui alzarsi e su cui
  // posarlo.

  /** Lo strumento che manda all'archivio. */
  const MEMORIA = /^mcp__memoria__/;
  /** Un giro ogni tanto per persona: chi cerca tre volte di fila non fa tre viaggi. */
  const GIRO_ARCHIVIO = 45000;
  /** Chi era in piedi quando ha cercato ci va appena si siede — se nel frattempo non e' passato troppo. */
  const ATTESA_ARCHIVIO = 30000;

  /**
   * Il segnale e' lo strumento che *diventa* la memoria: due ricerche di fila sono un
   * giro solo. La prima volta che si vede qualcuno non e' un cambio — aprendo
   * l'ufficio a meta' lavoro non si manda in archivio chi ci e' andato un minuto fa.
   */
  function segnaArchivio(chi, strumento) {
    const era = chi.strumento;
    chi.strumento = strumento;
    if (era === undefined || !MEMORIA.test(strumento) || MEMORIA.test(era)) return;
    if (Date.now() - (chi.ultimoArchivio || 0) < GIRO_ARCHIVIO) return;
    chi.vuoleArchivio = Date.now();
  }

  /**
   * Ci va, se puo' adesso. `torna` e' dove rimettere i piedi, `dove` dove posare il
   * faldone (niente: se lo tiene in mano), `posa` come rivestirsi una volta seduto.
   */
  function inArchivio(chi, torna, dove, posa) {
    chi.vuoleArchivio = 0;
    chi.ultimoArchivio = Date.now();
    chi.giro = window.ROOM.archivio(chi, torna, dove).then((ok) => {
      if (chi.el.isConnected && !chi.fuori && !chi.esce) window.ROOM.vesti(chi.fig, chi.seme, posa());
      if (ok) dopoArchivio(chi);
    });
  }

  /** Tornato dall'archivio: dice cosa ha ripescato, a chi gli sta vicino. */
  function dopoArchivio(chi) {
    if (!chi.el.isConnected || chi.esce || Math.random() > 0.7) return;
    const note = chi.capoId
      ? ((aiutanti(chi.capoId).find((x) => x.id === chi.nome) || {}).consulted || [])
      : (board[chi.id] && board[chi.id].consulted) || [];
    const nota = note[note.length - 1];
    if (!nota) return;
    recitaAppena('archivio', chi, vicinoA(chi, 120), { nota: corto(nota, 26) });
  }

  /** Un capo: dalla sua scrivania, e il faldone accanto al monitor. */
  function archivioCapo(capo) {
    if (!capo.vuoleArchivio) return;
    if (Date.now() - capo.vuoleArchivio > ATTESA_ARCHIVIO) {
      capo.vuoleArchivio = 0;
      return;
    }
    if (!capo.casa || capo.fuori || !capo.el.isConnected) return;
    const c = capo.casa;
    inArchivio(capo, [c.x + 8, c.y + 24], [c.x - 10, c.y - 8, c.y + 10], () => capo.posa);
  }

  /** Un aiutante: solo seduto. Sulla scrivania il faldone si posa; sullo sgabello resta in mano. */
  function archivioStaff(chi) {
    if (!chi.vuoleArchivio) return;
    if (Date.now() - chi.vuoleArchivio > ATTESA_ARCHIVIO) {
      chi.vuoleArchivio = 0;
      return;
    }
    const i = banchi.get(chi.chiave);
    if (i == null || chi.va || chi.esce || chi.archivio || !chi.el.isConnected) return;
    const p = postoBanco(i);
    inArchivio(chi, [p.x + 8, p.y + 24], sgabello(i) ? null : [p.x - 10, p.y - 8, p.y + 10], () => 'digita');
  }

  /** Il giro di controllo: chi ha appena cercato nella memoria, e chi ci deve ancora andare. */
  function paintArchivio() {
    for (const [id, capo] of people) {
      segnaArchivio(capo, (board[id] && board[id].lastTool) || '');
      archivioCapo(capo);
    }
    for (const chi of staff.values()) {
      // Chi porta un passo non ha un filo suo: la ricerca nella memoria l'ha fatta la
      // conversazione, e in archivio ci va il capo.
      if (chi.esce || chi.passo) continue;
      const a = aiutanti(chi.capoId).find((x) => x.id === chi.nome);
      segnaArchivio(chi, (a && a.lastTool) || '');
      archivioStaff(chi);
    }
  }

  function paintStaff() {
    const voluti = volutiStaff();

    // Chi ha finito se ne va — ma per la porta, non svanendo: e' l'unica cosa che
    // fa vedere che un sub-agent e' finito invece che sparito.
    //
    // E se ha finito davvero se lo segna, per la busta dell'esito. Davvero: dal
    // quadro, non dal fatto che se ne vada — si esce anche quando il capo chiude la
    // conversazione o perde la scrivania, e allora non c'e' nessun esito da portare.
    for (const [chiave, chi] of staff) {
      if (voluti.has(chiave) || chi.esce) continue;
      // Il passo si cerca fra i passi, l'aiutante fra gli aiutanti. Un passo sparito —
      // piano riscritto, messaggio nuovo — o rimasto in corso a turno finito non ha un
      // esito da portare: chi lo portava se ne va e basta.
      const a = chi.passo
        ? ((board[chi.capoId] && board[chi.capoId].items) || []).find((x) => chiavePasso(x) === chi.nome)
        : aiutanti(chi.capoId).find((x) => x.id === chi.nome);
      if (a && (a.status === 'completed' || a.status === 'failed')) chi.esito = a.status === 'failed' ? 'ko' : 'ok';
      esce(chi);
    }

    // Poi si vede chi si siede dove: prima i posti, e solo dopo dove va la gente.
    assegnaBanchi(voluti);

    for (const [chiave, { capo, it, i, passo }] of voluti) {
      let chi = staff.get(chiave);
      if (!chi) {
        chi = buildStaff(chiave, capo, it, passo);
        staff.set(chiave, chi);
        chi.andata = entra(chi, capo, i);
        // Arrivato al suo posto, si presenta a chi gli ha dato il lavoro.
        chi.andata.then(() => presentati(chi));
        // Il compito parte adesso dalla scrivania di chi lo da', e lo aspetta sulla
        // bacheca: e' li' che chi e' appena entrato va a staccarlo. Solo per chi e'
        // nato adesso — gli altri l'avevano gia' preso prima che guardassi. Un passo
        // nasce quando si accende: e' l'orologio del passo in corso.
        const nato = passo ? board[capo.id] && board[capo.id].activeSince : it.since;
        if (nato && Date.now() - nato < NATO_DA) compito(capo, it);
      } else if (!chi.va && !chi.esce && !chi.archivio) {
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
      const cosa = passo ? it.activeForm || it.content || '' : it.title || it.type || '';
      // Se la tiene addosso: e' quello che dice quando parla del suo lavoro.
      chi.cosa = cosa;
      chi.tipo = passo ? '' : it.type || '';
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
    // Chi va in archivio, e le buste fra chi si scrive. Dopo i posti: tutte e due
    // vogliono sapere chi siede dove.
    paintArchivio();
    paintPosta();
    // E il foglio aperto, se e' aperto: e' la stessa roba dei foglietti sul muro,
    // e non puo' restare indietro di un turno rispetto a loro.
    dipingiBacheca();
    // E la fila in cima: gli impiegati nascono e muoiono qui dentro, e senza
    // questa riga la fila li scoprirebbe solo al prossimo giro dei consumi.
    paintGente();
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

  /* Quelle col numero stanno in un mucchio a parte, e si usano solo se il
     numero c'e'. Adulare qualcuno per zero cose fatte non e' adulare, e'
     prendere in giro — e prima erano le prime due di un elenco solo, tagliate
     via con uno `slice(2)`: bastava aggiungere una frase in cima per rimettere
     uno zero in bocca a qualcuno senza accorgersene. */
  const ADULAZIONE_N = [
    'Gia’ {n} cose fatte, capo. Aumento?',
    '{n} task chiuse, capo!',
    'Capo, {n} in mattinata!',
    'Ne ha chiuse {n}. Io zero',
    'Con {n} cosi’, chi ci prende?',
  ];
  const ADULAZIONE = [
    'Gran visione come sempre, capo',
    'Stavo giusto per farlo anch’io!',
    'Bella la cravatta oggi, capo',
    'Che ritmo, capo',
    'Il miglior capo di sempre. Davvero.',
    'Come fa, capo?',
    'Lo dicevo io che era la strada',
    'Se lo dice lei, capo',
    'Ci avevo pensato anch’io. Dopo',
    'Ha sempre ragione, capo',
    'Glielo tengo io il posto',
    'Segno tutto, capo',
    'Riposi, capo, faccio io',
    'Impossibile fare meglio',
    'Le porto un caffe’?',
    'Il team la adora, capo',
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
    'Meta’ fatta',
    'Non e’ come sembrava',
    'Sto capendo dove sta',
    'Un ultimo controllo',
    'Ci vuole ancora un po’',
    'Va meglio di ieri',
    'Quasi. Ma quasi davvero',
    'Ho trovato il punto',
    'Adesso torna',
    'Riprovo e vediamo',
    'Piu’ facile del previsto',
    'Manca solo la prova',
  ];
  const SULLAVORO = [
    'Sto su {c}',
    'Mi son preso {c}',
    '{c}, ci sono quasi',
    'Faccio {c} e chiudo',
    'Tocca a me {c}',
    '{c}. Poi si vede',
    'Sono dentro {c}',
    '{c}, quasi fatto',
  ];

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
    'Al bar da mezz’ora, eh',
    'Chi glielo dice che e’ sbagliato?',
    'Ha letto la mail? Ne dubito',
    'Parla con la fontanella',
    'Riunione per decidere la riunione',
    'Lo dice a tutti tranne che a me',
    'Ha scritto lui questo? Ma va’',
    'Torna sempre quando ho finito',
    'Il suo schermo e’ sempre spento',
    'Un giorno lo dico in faccia',
    'Fa il giro largo per non passarmi',
    'Ha imparato una parola nuova',
    'Prende appunti e non li rilegge',
    'Delega anche il caffe’',
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
      if (chi.va || chi.esce || chi.dice || chi.archivio || chi.inDialogo) continue;
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
        // Le cose fatte per quel capo: i passi del suo piano chiusi e gli aiutanti
        // che hanno finito bene. Il numero dev'essere vero, o e' una presa in giro.
        const fatte =
          ((board[chi.capoId] && board[chi.capoId].done) || 0) +
          aiutanti(chi.capoId).filter((a) => a.status === 'completed').length;
        const pescate = fatte > 0 ? ADULAZIONE_N.concat(ADULAZIONE) : ADULAZIONE;
        const battuta = caso(pescate).replace('{n}', fatte);
        // E una volta su due il capo risponde: un'adulazione che cade nel vuoto e'
        // un cartello, una a cui il capo risponde «adulatore» e' un ufficio.
        if (Math.random() < 0.5 && !capo.inDialogo && !capo.dice) {
          const r = window.DIALOGHI && window.DIALOGHI.scena('adulazione', ritratto(chi), ritratto(capo), stanzaOra());
          if (r) {
            capo.zitto = ora;
            window.ROOM.dialogo([
              { chi, a: capo, testo: battuta, tipo: 'adula' },
              ...r.map((b) => ({ chi: capo, a: chi, testo: b.testo })),
            ]);
            continue;
          }
        }
        window.ROOM.parla(chi, battuta, { tipo: 'adula', verso: versoVerso(chi, capo) });
      } else if (d > LONTANO && Math.random() < 0.35) {
        chi.zitto = ora;
        // Alle spalle del capo, e a volte un collega lo sente e dice la sua.
        const collega = vicinoA(chi, 110, (c) => c !== capo && c.capoId === chi.capoId);
        const r =
          collega &&
          Math.random() < 0.4 &&
          window.DIALOGHI &&
          window.DIALOGHI.scena('pettegolezzo', ritratto(chi), ritratto(collega), stanzaOra());
        if (r) {
          collega.zitto = ora;
          window.ROOM.dialogo([
            { chi, a: collega, testo: caso(PETTEGOLEZZI) },
            ...r.map((b) => ({ chi: collega, a: chi, testo: b.testo })),
          ]);
        } else {
          window.ROOM.parla(chi, caso(PETTEGOLEZZI));
        }
      } else if (Math.random() < 0.25) {
        // Ne' vicino al capo ne' abbastanza lontano da sparlarne: allora si parla
        // di quello che si sta facendo, che e' quello di cui parla davvero chi sta
        // lavorando. Il capo e' un argomento, non l'unico.
        chi.zitto = ora;
        window.ROOM.parla(chi, suLavoro(chi.cosa));
      }
    }
  }

  // ---------- le chiacchiere vere ----------
  //
  // Prima ognuno parlava da solo: una frase pescata dal mucchio del posto dove stava,
  // o una battuta al capo. Adesso si parlano — una domanda e la sua risposta, fra due
  // che stanno vicini — e quello di cui parlano e' vero: il passo che uno sta facendo,
  // il file che ha aperto, quanti passi mancano, il messaggio che un aiutante ha
  // appena scritto all'altro, il contesto che sta finendo, l'ora e il branch.
  //
  // Le frasi stanno in dialoghi.js, coi buchi da riempire. Qui si decide chi parla
  // con chi, e quando: a ogni cosa vera che succede (un passo preso o chiuso, un
  // aiutante che arriva o finisce, una lettera, un ritorno dall'archivio, una
  // conversazione che apri, una domanda che ti aspetta, il contesto quasi pieno), e
  // fra un'occasione e l'altra due che si trovano vicini — al bar, in riunione, alla
  // scrivania accanto — o uno che si alza e va a trovare un collega.

  /** Ogni quanto si guarda se c'e' qualcuno da far chiacchierare. */
  const GIRO_CHIACCHIERE = 6500;
  /** Quanto tace qualcuno dopo una scena, prima di essere ripescato per un'altra. */
  const RESPIRO_SCENA = 16000;
  /** Ogni quanto qualcuno puo' alzarsi per andare a trovare un collega. */
  const OGNI_VISITA = [35000, 70000];

  /** Accorciato a parola intera: «Riporto gli agenti in…», non «Riporto gli agenti in uffic…». */
  const corto = (s, n) => {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    if (t.length <= n) return t;
    const cut = t.slice(0, n - 1);
    const sp = cut.lastIndexOf(' ');
    return (sp >= n * 0.55 ? cut.slice(0, sp) : cut).replace(/[\s,.;:–-]+$/, '') + '…';
  };
  const maiuscola = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

  /** Il genere di un aiutante, detto come lo direbbe un collega. */
  const TIPI = {
    explore: 'esploratore',
    'general-purpose': 'tuttofare',
    plan: 'pianificatore',
    claude: 'jolly',
    'statusline-setup': 'tecnico',
    bash: 'terminale',
    workflow: 'regista',
    mcp: 'connettore',
  };
  const tipoDi = (t) => (t ? TIPI[String(t).toLowerCase()] || String(t).replace(/[-_]+/g, ' ').toLowerCase() : '');

  /** «al 34%», «all'85%»: l'articolo davanti a un numero detto a voce. */
  const alPct = (n) => {
    const v = Math.round(n);
    const vocale = v === 1 || v === 8 || v === 11 || (v >= 80 && v <= 89);
    return (vocale ? 'all’' : 'al ') + v + '%';
  };

  /** Il verbo di uno strumento, al presente, al gerundio e al participio. */
  const AZIONI = {
    Read: ['leggo', 'leggendo', 'letto'],
    Reading: ['leggo', 'leggendo', 'letto'],
    Edit: ['modifico', 'modificando', 'modificato'],
    MultiEdit: ['modifico', 'modificando', 'modificato'],
    Editing: ['modifico', 'modificando', 'modificato'],
    NotebookEdit: ['modifico', 'modificando', 'modificato'],
    Write: ['scrivo', 'scrivendo', 'scritto'],
    Writing: ['scrivo', 'scrivendo', 'scritto'],
    Grep: ['cerco in', 'cercando in', 'cercato in'],
    Glob: ['cerco', 'cercando', 'cercato'],
  };

  /** Un comando, detto come lo dice chi l'ha lanciato: «i test», «la build». */
  function comandoDi(c) {
    const s = String(c || '').toLowerCase();
    if (!s) return '';
    if (/\b(vitest|jest|mocha|pytest|playwright|npm (run )?test|[\w-]*-check|smoke)\b/.test(s)) return 'i test';
    if (/\b(build|tsc|esbuild|webpack|compile|package)\b/.test(s)) return 'la build';
    if (/\bgit commit\b/.test(s)) return 'il commit';
    if (/\bgit push\b/.test(s)) return 'il push';
    if (/\b(deploy|wrangler|vercel)\b/.test(s)) return 'il deploy';
    if (/\b(npm|pnpm|yarn) (i|install|add|ci)\b/.test(s)) return 'le dipendenze';
    if (/^git\b/.test(s)) return 'git';
    return '';
  }

  /**
   * Cosa sta facendo, da quella riga che dice il filo: «Read package.json»,
   * «Bash npm test», «Running find src». Un file solo se ha l'aria di un nome di
   * file — in ufficio si dice «sto leggendo office.js», non il percorso intero.
   */
  function strumentoDi(doing) {
    const m = String(doing || '').trim().match(/^(\S+)\s*(.*)$/);
    if (!m) return {};
    const out = {};
    const [, tool, resto] = m;
    const file = (resto.match(/[\w.@-]+\.[A-Za-z][A-Za-z0-9]{0,4}\b/g) || []).pop();
    const az = AZIONI[tool];
    if (az && file && file.length <= 26) {
      out.file = file;
      [out.azione, out.azioneG, out.azioneP] = az;
    }
    if (tool === 'Bash' || tool === 'Running' || tool === 'PowerShell') out.comando = comandoDi(resto) || undefined;
    return out;
  }

  /** Le parole che non si dicono ad alta voce: chiavi, token, password. */
  const maschera = (s) =>
    String(s || '')
      .replace(/\b(sk|pk|rk|ghp|gho|github_pat|xox[abp]|sbp|AKIA)[-_A-Za-z0-9]{8,}/g, '•••')
      .replace(/\b[A-Za-z0-9+/_-]{32,}\b/g, '•••')
      .replace(/(password|passwd|token|secret|api[_-]?key)\s*[:=]\s*\S+/gi, '$1 •••');

  /**
   * Il ritratto di una persona della stanza, nella forma che vuole dialoghi.js: chi
   * e', su cosa lavora, a che punto e' il piano del suo capo, cosa sta toccando.
   */
  function ritratto(chi) {
    const r = {};
    if (!chi) return r;
    const ora = Date.now();
    const id = chi.capoId || chi.id;
    const b = board[id] || {};
    const items = b.items || [];
    const card = ((last && last.cards) || []).find((c) => c.id === id);
    let doing = '';
    if (chi.capoId) {
      const capo = people.get(chi.capoId);
      r.ruolo = chi.passo ? 'passo' : 'aiutante';
      r.capo = corto(capo ? capo.pname.textContent : '', 20);
      r.lavoro = corto(chi.cosa, 28);
      r.nome = corto(chi.cosa, 20);
      if (chi.passo) {
        const it = items.find((x) => chiavePasso(x) === chi.nome);
        if (it) r.numero = items.indexOf(it) + 1;
        doing = b.doing;
        if (b.activeSince) r.durata = durata(ora - b.activeSince);
      } else {
        const a = aiutanti(id).find((x) => x.id === chi.nome);
        if (a) {
          r.tipo = tipoDi(a.type);
          r.Tipo = maiuscola(r.tipo);
          doing = a.doing;
          if (a.status !== 'in_progress' && a.ms) r.durata = durata(a.ms);
          else if (a.since) r.durata = durata(ora - a.since);
        }
      }
    } else {
      r.ruolo = 'capo';
      r.nome = corto(card ? card.name : chi.pname && chi.pname.textContent, 20);
      r.lavoro = corto(cheFa(id), 28);
      r.aiutanti = alLavoro(id).length;
      r.occupato = !!(card && card.busy);
      r.finito = !!(card && card.done && !card.busy);
      if (card && card.pct != null) {
        r.ctx = Math.round(card.pct);
        r.alCtx = alPct(card.pct);
      }
      if (card && card.busy) doing = b.doing;
    }
    // Il piano e' quello del capo, per tutti quelli che lavorano per lui.
    if (items.length) {
      r.totale = items.length;
      r.fatte = b.done || 0;
      r.mancano = Math.max(0, items.length - (b.done || 0));
    }
    return Object.assign(r, strumentoDi(doing));
  }

  const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];

  /** La stanza adesso: il progetto, i consumi, l'ora, la bacheca. */
  function stanzaOra() {
    const d = last || {};
    const adesso = new Date();
    const h = adesso.getHours();
    const ora = h + ':' + String(adesso.getMinutes()).padStart(2, '0');
    const s = {
      progetto: d.project || '',
      branch: d.branch || '',
      sporco: !!d.dirty,
      quanti: (d.cards || []).length,
      gente: people.size + staff.size,
      ora,
      alleOra: (h === 1 ? 'all’' : 'alle ') + ora,
      sonoLe: h === 1 ? 'è l’' + ora : 'sono le ' + ora,
      momento: h >= 5 && h < 12 ? 'mattina' : h >= 12 && h < 18 ? 'pomeriggio' : h >= 18 && h < 23 ? 'sera' : 'notte',
      giorno: GIORNI[adesso.getDay()],
      resetSessione: d.sessionReset || '',
      fare: 0,
      fatte: 0,
      storte: 0,
    };
    if (d.usage && d.usage.session != null) {
      s.sessione = Math.round(d.usage.session);
      s.alSessione = alPct(d.usage.session);
    }
    if (d.usage && d.usage.week != null) {
      s.settimana = Math.round(d.usage.week);
      s.alSettimana = alPct(d.usage.week);
    }
    // I foglietti, contati come li conta la bacheca: quelli sul muro.
    if (bacheche) {
      s.fare = bacheche.querySelectorAll('.of-note.fare').length;
      s.fatte = bacheche.querySelectorAll('.of-note.fatta').length;
      s.storte = bacheche.querySelectorAll('.of-note.storta').length;
    }
    return s;
  }

  /** Tutti quelli che stanno nella stanza: i capi e chi lavora per loro. */
  const presenti = () => [...people.values(), ...staff.values()].filter((c) => c.el.isConnected && !c.esce);

  /** Pronto a fare due chiacchiere: fermo, non gia' in una scena, e zitto da un po'. */
  const pronto = (c, ora = Date.now()) =>
    c.el.isConnected &&
    !c.inDialogo &&
    !c.dice &&
    !c.va &&
    !c.esce &&
    !c.archivio &&
    !c.ferma &&
    !c.el.classList.contains('soglia') &&
    c.fig.dataset.posa !== 'cammina' &&
    ora - (c.zitto || 0) >= RESPIRO_SCENA;

  const distanza = (a, b) => {
    const [x, y] = piedi(a.el);
    const [p, q] = piedi(b.el);
    return Math.hypot(p - x, q - y);
  };

  /** Da che parte sta chi ascolta, per la nuvoletta di una battuta sola. */
  const versoVerso = (a, b) => {
    const [x] = piedi(a.el);
    const [p] = piedi(b.el);
    return p > x + 4 ? 'dx' : p < x - 4 ? 'sx' : undefined;
  };

  /** Il piu' vicino a qualcuno entro `raggio`, fra quelli che passano il filtro. */
  function vicinoA(chi, raggio, filtro = () => true) {
    let meglio = null;
    let quanto = raggio;
    for (const c of presenti()) {
      if (c === chi || !filtro(c)) continue;
      if (c.inDialogo || c.va || c.el.classList.contains('soglia')) continue;
      const d = distanza(chi, c);
      if (d <= quanto) {
        quanto = d;
        meglio = c;
      }
    }
    return meglio;
  }

  /** Chi ha lanciato questo aiutante: l'aiutante padre se e' nella stanza, se no il capo. */
  const capoDi = (chi) => (chi.padre && staff.get(chi.capoId + '/' + chi.padre)) || people.get(chi.capoId) || null;

  /**
   * Recita una scena fra A e B (B puo' mancare: allora solo scene da soli). Torna la
   * promessa della scena, o null se non si e' recitato niente.
   */
  function recita(tipo, A, B, x) {
    if (!window.DIALOGHI || !window.ROOM || !A || !A.el.isConnected) return null;
    if (B && (!B.el.isConnected || B === A)) B = null;
    const righe = window.DIALOGHI.scena(tipo, ritratto(A), B ? ritratto(B) : null, stanzaOra(), x || {});
    if (!righe) return null;
    const ora = Date.now();
    A.zitto = ora;
    if (B) B.zitto = ora;
    return window.ROOM.dialogo(
      righe.map((r) => {
        const chi = r.chi === 'b' ? B : A;
        return { chi, a: chi === A ? B : A, testo: r.testo };
      })
    );
  }

  /* ---- le occasioni ---- */

  /**
   * Un'occasione vera non si butta perche' uno dei due sta gia' parlando: aspetta il
   * suo turno, un respiro alla volta, per qualche secondo. Le frasi si scrivono al
   * momento in cui si dicono, quindi i numeri sono quelli di allora.
   */
  function recitaAppena(tipo, A, B, x, prove = 5) {
    if (!A || !A.el.isConnected) return;
    const parla = (c) => c && (c.inDialogo || c.dice);
    if ((parla(A) || parla(B) || (window.ROOM && window.ROOM.dialoghi >= 2)) && prove > 0) {
      setTimeout(() => recitaAppena(tipo, A, B, x, prove - 1), 1400);
      return;
    }
    recita(tipo, A, B, x);
  }

  /** Appena seduto: si presenta a chi gli ha dato il lavoro. */
  function presentati(chi) {
    if (!chi.el.isConnected || chi.esce) return;
    if (Math.random() > (chi.passo ? 0.6 : 0.85)) return;
    const capo = capoDi(chi);
    const vicino = capo && distanza(chi, capo) <= 200 ? capo : null;
    recitaAppena(chi.passo ? 'arrivo-passo' : 'arrivo-aiutante', chi, vicino);
  }

  /** Finito (bene o male): lo dice a chi gli aveva dato il lavoro, mentre si alza. */
  function congedo(chi) {
    if (!chi.esito || !chi.el.isConnected) return;
    const capo = capoDi(chi);
    const vicino = capo && capo.el.isConnected && distanza(chi, capo) <= 220 ? capo : null;
    const tipo = chi.passo ? 'passo' : 'aiutante';
    recitaAppena((chi.esito === 'ko' ? 'fallito-' : 'finito-') + tipo, chi, vicino, null, 2);
  }

  /** Il giro delle chiacchiere: due che si trovano vicini, e ogni tanto una visita. */
  let prossimaVisita = Date.now() + 20000;

  function chiacchierata() {
    if (!window.ROOM || !window.DIALOGHI || document.hidden) return;
    const ora = Date.now();
    if (ora >= prossimaVisita) {
      prossimaVisita = ora + OGNI_VISITA[0] + Math.random() * (OGNI_VISITA[1] - OGNI_VISITA[0]);
      if (visita()) return;
    }
    // Una scena alla volta, fra un'occasione e l'altra: le occasioni (che sono vere)
    // possono aggiungersene una seconda, il riempitivo no.
    if (window.ROOM.dialoghi > 0 || Math.random() < 0.3) return;
    const tutti = presenti().filter((c) => pronto(c, ora));
    const coppie = [];
    const alBar = (c) => c.fuori && (c.meta === 'caffe' || c.meta === 'spuntino');
    const inRiunione = (c) => c.fuori && c.meta === 'riunione';
    const seduto = (c) => !c.fuori;
    for (let i = 0; i < tutti.length; i++) {
      for (let j = i + 1; j < tutti.length; j++) {
        let [a, b] = [tutti[i], tutti[j]];
        const d = distanza(a, b);
        if (d > 140) continue;
        // Chi lavora per qualcuno parla col suo capo: A e' sempre l'aiutante.
        if (b.capoId && capoDi(b) === a) [a, b] = [b, a];
        if (a.capoId && capoDi(a) === b) coppie.push({ a, b, tipo: 'capoAiutante', peso: 3 });
        else if (a.capoId && a.capoId === b.capoId && d <= 110) coppie.push({ a, b, tipo: 'colleghi', peso: 2 });
        else if (alBar(a) && alBar(b) && d <= 90) coppie.push({ a, b, tipo: 'bar', peso: 4 });
        else if (inRiunione(a) && inRiunione(b) && d <= 90) coppie.push({ a, b, tipo: 'riunione', peso: 3 });
        else if (seduto(a) && seduto(b) && d <= 100) coppie.push({ a, b, tipo: 'vicini', peso: 1 });
      }
    }
    if (!coppie.length) return;
    let tiro = Math.random() * coppie.reduce((n, c) => n + c.peso, 0);
    const c = coppie.find((x) => (tiro -= x.peso) < 0) || coppie[0];
    // Fra pari non c'e' un primo: chi comincia si tira a sorte.
    const scambia = c.tipo !== 'capoAiutante' && Math.random() < 0.5;
    recita(c.tipo, scambia ? c.b : c.a, scambia ? c.a : c.b);
  }

  /**
   * Uno che non ha niente da fare si alza e va alla scrivania di un collega — meglio
   * se quel collega sta lavorando: e' a lui che si chiede «come va?». Si ferma nella
   * corsia accanto, dove stanno in piedi gli aiutanti, se li' non c'e' nessuno.
   */
  function visita() {
    const ora = Date.now();
    const liberi = [...people.values()].filter(
      (c) => c.casa && !c.fuori && !c.lavora && pronto(c, ora) && ora - (c.ultimo || 0) >= 45000
    );
    if (!liberi.length) return false;
    const chi = caso(liberi);
    const bersagli = [...people.values()].filter(
      (c) => c !== chi && c.casa && !c.fuori && c.el.isConnected && !c.inDialogo
    );
    if (!bersagli.length) return false;
    const al = bersagli.filter((c) => c.lavora);
    const da = caso(al.length && Math.random() < 0.75 ? al : bersagli);
    const R = window.ROOM;
    const occupato = (x, y) =>
      R.occupata[R.cella(x, y)] ||
      presenti().some((c) => {
        if (c === chi) return false;
        const [p, q] = piedi(c.el);
        return Math.hypot(p - x, q - y) < 12;
      });
    const lati = [
      [da.casa.x + 8 + 40, da.casa.y + 24 - 10],
      [da.casa.x + 8 - 40, da.casa.y + 24 - 10],
    ];
    if (Math.random() < 0.5) lati.reverse();
    const dove = lati.find(([x, y]) => !occupato(x, y));
    if (!dove) return false;
    R.visita(chi, dove, () => {
      if (!da.el.isConnected || da.inDialogo) return null;
      return recita('visita', chi, da);
    });
    return true;
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
    if (chi.busy) {
      chi.da = Date.now();
      // Il tuo messaggio e' appena arrivato: ogni tanto lo dice.
      if (visto && Math.random() < 0.3) setTimeout(() => recitaAppena('turno-iniziato', chi, null, null, 2), 700);
    } else {
      chi.festa = chi.da != null && Date.now() - chi.da >= TURNO_VERO;
      // E chi gli sta vicino se ne accorge, quando il lavoro e' stato vero.
      if (visto && chi.festa && Math.random() < 0.7) {
        setTimeout(() => recitaAppena('turno-finito', vicinoA(chi, 150), chi), 900);
      }
      // Il lavoro e' finito: il faldone torna in archivio, e chi doveva ancora
      // andarci non ci va piu' — cercare per un turno chiuso non e' lavoro.
      window.ROOM.riponi(chi);
      chi.vuoleArchivio = 0;
    }
  }

  function paintPerson(chi, s, seat) {
    const b = chi.el;
    turno(chi, s);
    // Chi e' fermo da un pezzo non si alza e non parla: sbiadito e in giro
    // sarebbe una contraddizione.
    chi.ferma = !s.busy && !s.done && !s.recent;
    // E chi non e' fermo lavora, che e' quello che si fa in ufficio: alla
    // scrivania si batte a macchina anche fra un turno e l'altro. La posa di
    // lavoro era legata ai secondi in cui Claude sta davvero macinando, e nel
    // mezzo — che e' quasi sempre — il capo se ne stava seduto a respirare o in
    // giro per i corridoi: un ufficio dove nessuno lavora mai. Che stia
    // macinando adesso lo dicono gia' l'anello verde, i puntini e lo schermo
    // che pulsa; la posa dice un'altra cosa, ed e' che quello e' il suo posto.
    chi.posa = chi.ferma ? 'fermo' : 'digita';
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

    // Cosa aspetta da te. Prima della classe: il clic la legge da qui.
    chi.asks = s.asks || [];

    // Le occasioni di questa persona, viste come cambi e non come stati: la prima
    // volta che la si vede non e' un cambio (aprendo l'ufficio non parlano tutti).
    const visto = chi.ritratta;
    chi.ritratta = true;
    // La conversazione che hai appena aperto ti saluta.
    if (visto && s.focused && !chi.fuoco && Math.random() < 0.6) setTimeout(() => recitaAppena('focus', chi, null, null, 2), 400);
    chi.fuoco = !!s.focused;
    // Una domanda che ti aspetta: lo dice, e un vicino rincara.
    const chiede = chi.asks.length > 0;
    if (visto && chiede && !chi.chiede) recitaAppena('domanda', chi, vicinoA(chi, 140));
    chi.chiede = chiede;
    // Il contesto che passa l'85%: e' il momento della scatoletta viola, e chi gli
    // sta accanto glielo fa notare.
    const pieno = s.pct != null && s.pct >= 85;
    if (visto && pieno && !chi.pieno) {
      const v = vicinoA(chi, 140);
      if (v) recitaAppena('contesto', v, chi);
      else recitaAppena('contesto-solo', chi);
    }
    chi.pieno = pieno;
    b.classList.toggle('asking', chi.asks.length > 0);
    chi.plate.classList.toggle('asking', chi.asks.length > 0);
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
    const state = chi.asks.length
      ? t('office.asking')
      : s.busy
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
        // Qualcuno lo saluta, se c'e' qualcuno vicino.
        const v = Math.random() < 0.5 ? vicinoA(chi, 160) : null;
        if (v) recitaAppena('saluto', v, null, { nome: corto(chi.pname.textContent, 20) }, 2);
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
        // Chi arriva a ufficio gia' aperto e' una conversazione nuova: qualcuno gli da'
        // il benvenuto. Chi arriva all'apertura no — sarebbero sei benvenuti in fila.
        const nuovo = avviato;
        entrata(chi, ...dove).then(() => {
          if (chi.el.isConnected) window.ROOM.vesti(chi.fig, chi.seme, chi.posa);
          if (nuovo && chi.el.isConnected) recitaAppena('benvenuto', vicinoA(chi, 170), chi);
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

    // Gli impiegati stanno accanto al loro capo, e il capo si e' appena seduto:
    // se una conversazione ha cambiato scrivania — o l'ha appena presa — i suoi
    // devono seguirla.
    paintStaff();

    // I nomi sul foglio sono quelli delle targhette, e le targhette le ha appena
    // riscritte `paintPerson`. E se il foglio sta mostrando delle domande, si
    // ridipinge lui: una a cui hai appena risposto deve sparire da sola.
    dipingiFoglio();

    empty.textContent = t('office.empty');
    empty.hidden = list.length > 0;

    paintGente();

    paintCella(usoS, 'ctx.session', d.usage?.session, d.sessionReset);
    paintCella(usoW, 'ctx.week', d.usage?.week, d.weekReset);
    uso.hidden = !d.usage;

    // La sessione che passa l'ottanta (e il novanta): qualcuno lo dice ad alta voce.
    const ses = d.usage && d.usage.session;
    if (sessionePrima != null && ses != null && [80, 90].some((k) => ses >= k && sessionePrima < k)) {
      const tutti = presenti().filter((c) => pronto(c));
      const a = tutti.length ? caso(tutti) : null;
      if (a) recitaAppena('consumi', a, vicinoA(a, 140));
    }
    if (ses != null) sessionePrima = ses;
    if (list.length) avviato = true;
  }

  /** La sessione al giro prima, per accorgersi di quando passa una soglia. */
  let sessionePrima = null;
  /** Il primo giro con qualcuno dentro e' passato: chi arriva da qui in poi e' nuovo. */
  let avviato = false;

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
    },
    /** Tornato a schermo dopo essere stato via: la misura di prima non vale piu'. */
    resize: fit,
    /**
     * La pelle scelta, come arriva dalle preferenze. Vale anche prima che l'ufficio
     * sia montato: la stanza la indossa appena nasce.
     */
    pelle(p) {
      const v = PELLI.includes(p) ? p : 'classico';
      if (v === pelle) return;
      pelle = v;
      vestiPelle();
    },
  };
})();
