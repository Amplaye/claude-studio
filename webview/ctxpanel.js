/* Claude Studio — il pannello del contesto, come pezzo montabile.
   Vive in due posti: da solo nella barra laterale, e come colonna dentro la scheda
   a tutto schermo. Il disegno e' lo stesso, quindi il codice e' uno solo.

   Due regole di casa, le stesse della chat:
     - niente innerHTML con dati: tutto passa da textContent;
     - si costruisce una volta e poi si ridipinge. Ricreare i nodi a ogni
       aggiornamento ammazzerebbe le transizioni e farebbe saltare lo scorrimento
       sotto il dito — e con una barra animata rilancerebbe la scia ogni secondo e
       mezzo, per sempre. */
window.CtxPanel = (() => {
  const SVG = 'http://www.w3.org/2000/svg';

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  function icon(name, cls) {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('class', cls ? 'ico ' + cls : 'ico');
    const use = document.createElementNS(SVG, 'use');
    use.setAttribute('href', '#ion-' + name);
    svg.appendChild(use);
    return svg;
  }

  function iconButton(name, title, cls) {
    const b = el('button', cls ? 'iconbtn ' + cls : 'iconbtn');
    b.type = 'button';
    b.title = title;
    b.appendChild(icon(name));
    return b;
  }

  /** Il colore vive nelle barre, non nel testo. */
  const barColor = (p) =>
    p == null ? 'rgba(255,255,255,.3)' : p >= 80 ? 'var(--bad)' : p >= 60 ? 'var(--warn)' : 'var(--ok)';

  function makeBar() {
    const b = el('div', 'bar');
    const f = el('div', 'fill');
    // Finita la scia la classe se ne va: cosi' "sta scivolando" resta una cosa vera
    // e non una traccia appiccicata addosso per sempre.
    f.addEventListener('animationend', () => f.classList.remove('glide'));
    b.appendChild(f);
    return b;
  }

  /** La scia parte solo quando la barra si muove davvero: altrimenti e' rumore. */
  function paintBar(fill, pct) {
    const w = (pct == null ? 0 : Math.max(0, Math.min(100, pct))) + '%';
    if (fill.style.width !== w) {
      fill.classList.remove('glide');
      void fill.offsetWidth; // riavvia l'animazione anche se la classe c'era gia'
      fill.classList.add('glide');
      fill.style.width = w;
    }
    fill.style.background = barColor(pct);
  }

  /**
   * Costruisce il pannello dentro `root` e restituisce chi lo sa ridipingere.
   * `post` e' come si parla con l'estensione: la stessa forma nelle due facce.
   */
  return function mount(root, post) {
    root.classList.add('ctx');

    // ---------- testata: l'account ----------
    const acct = el('div', 'acct');
    const head = el('header', 'hdr');
    const headTop = el('div', 'hdr-top');
    const lab = el('span', 'lab');
    lab.append(icon('speedometer'), document.createTextNode('Account'));
    const btnDiag = iconButton('eye', 'Cosa vede l’estensione', 'btnDiag');
    const btnRefresh = iconButton('refresh', 'Aggiorna adesso', 'btnRefresh');
    headTop.append(lab, el('span', 'grow'), btnDiag, btnRefresh);
    head.append(headTop, acct);

    function buildCell(title) {
      const c = el('div', 'acell');
      const val = el('div', 'av');
      const bar = makeBar();
      const reset = el('div', 'ar');
      c.append(el('div', 'an', title), val, bar, reset);
      c._p = { val, reset, fill: bar.firstChild };
      return c;
    }

    const cells = [buildCell('Sessione · 5h'), buildCell('Settimana · 7g')];
    const waiting = el('div', 'await');

    function paintCell(c, pct, reset) {
      c._p.val.textContent = pct == null ? '—' : Math.round(pct) + '%';
      c._p.reset.textContent = reset ? 'reset ' + reset : ' ';
      paintBar(c._p.fill, pct);
    }

    // ---------- la riga della sezione ----------
    const count = el('span', 'count', '0');
    const secline = el('div', 'secline');
    const secLab = el('span', 'lab');
    secLab.append(icon('layers'), document.createTextNode('Sessioni'));
    secline.append(secLab, count);

    // ---------- le card ----------
    const host = el('main', 'cards');
    const cards = new Map();

    function buildCard(id) {
      const c = el('div', 'ctxcard card-hover');
      const chead = el('div', 'chead');
      const dot = el('span', 'dot');
      const kind = icon('sparkles', 'cico');
      const name = el('span', 'cname');
      const badge = el('span', 'badge', 'qui');
      const ren = iconButton('pencil', 'Rinomina', 'ren');
      chead.append(dot, kind, name, badge, ren);

      const meta = el('div', 'cmeta');
      const pill = el('span', 'tabpill');
      const sub = el('span', 'csub');
      meta.append(pill, sub);

      const row = el('div', 'crow');
      const pct = el('span', 'cpct');
      const nums = el('span', 'cnums');
      const tok = el('span', 'ctok');
      const cost = el('span', 'ccost');
      nums.append(tok, cost);
      row.append(pct, nums);

      const bar = makeBar();
      c.append(chead, meta, row, bar);

      ren.onclick = (ev) => {
        ev.stopPropagation();
        post({ cmd: 'rename', id });
      };
      c.onclick = () => post({ cmd: 'focus', id });

      c._p = { dot, kind, name, badge, pill, sub, pct, tok, cost, fill: bar.firstChild };
      return c;
    }

    function paintCard(c, s, limit, how) {
      const p = c._p;
      c.classList.toggle('focused', !!s.focused);
      c.classList.toggle('own', !!s.own);

      p.dot.classList.toggle('busy', !!s.busy);
      p.dot.classList.toggle('recent', !s.busy && !!s.recent);
      p.dot.title = s.busy ? 'attiva ora' : s.recent ? 'attiva di recente' : 'ferma';

      p.kind.firstChild.setAttribute('href', s.own ? '#ion-sparkles' : '#ion-chatbubble-ellipses');
      p.kind.setAttribute('title', s.own ? 'Conversazione di Claude Studio' : 'Tab dell’estensione ufficiale');

      p.name.textContent = s.name;
      p.name.title = s.preview || s.name;
      p.badge.hidden = !s.focused;
      p.pill.textContent = s.own ? 'Studio' : s.tabName || s.shortId;
      p.pill.title = s.own
        ? 'aperta da Claude Studio · id ' + s.shortId
        : 'tab "' + (s.tabName || '?') + '" · id ' + s.shortId;

      // Se l'aggancio non e' certo va detto, e va detto sulla card in focus: meglio
      // un dubbio scritto che una certezza sbagliata su dove ti trovi.
      const via =
        !s.focused || how === 'studio' || how === 'tab'
          ? ''
          : how === 'posizione'
            ? ' · stimata'
            : ' · ultima attiva';
      p.sub.textContent = s.lastClock + ' · ' + s.lastAgo + (s.busy ? ' · attiva ora' : '') + via;

      p.pct.textContent = s.pct == null ? '—' : s.pct + '%';
      p.tok.textContent = s.tokens + ' / ' + limit;
      p.cost.textContent = s.cost;
      paintBar(p.fill, s.pct);
    }

    // ---------- il piede ----------
    const fprojectName = el('span', 'v', '—');
    const fproject = el('span', 'fitem fproject');
    fproject.title = 'Progetto';
    fproject.append(icon('cube'), fprojectName);

    const fbranchName = el('span', 'v');
    const fbranch = el('span', 'fitem fbranch');
    fbranch.hidden = true;
    fbranch.append(icon('git-branch'), fbranchName);

    const fcostVal = el('span', 'v', '$0');
    const fcost = el('span', 'fitem fcost');
    fcost.title = 'Speso in tutto dalle conversazioni aperte';
    fcost.append(icon('cash'), fcostVal);

    const foot = el('footer', 'foot');
    foot.append(fproject, fbranch, el('span', 'grow'), fcost);

    root.append(head, secline, host, foot);

    btnRefresh.onclick = () => post({ cmd: 'refresh' });
    btnDiag.onclick = () => post({ cmd: 'diagnose' });

    // ---------- disegno ----------
    function render(d) {
      if (!d) return;
      if (!d.usage) {
        waiting.textContent = d.usageWait;
        if (acct.firstChild !== waiting) acct.replaceChildren(waiting);
      } else {
        paintCell(cells[0], d.usage.session, d.sessionReset);
        paintCell(cells[1], d.usage.week, d.weekReset);
        if (acct.firstChild !== cells[0]) acct.replaceChildren(cells[0], cells[1]);
      }

      count.textContent = d.cards.length;
      if (!d.cards.length) {
        host.replaceChildren(el('div', 'empty', 'Nessuna conversazione aperta in questo progetto.'));
        cards.clear();
      } else {
        if (host.querySelector('.empty')) host.replaceChildren();
        const seen = new Set();
        d.cards.forEach((s, i) => {
          seen.add(s.id);
          let c = cards.get(s.id);
          if (!c) {
            c = buildCard(s.id);
            cards.set(s.id, c);
          }
          paintCard(c, s, d.limit, d.focusHow);
          if (host.children[i] !== c) host.insertBefore(c, host.children[i] || null);
        });
        for (const [id, c] of [...cards]) {
          if (!seen.has(id)) {
            c.remove();
            cards.delete(id);
          }
        }
      }

      fprojectName.textContent = d.project;
      fbranch.hidden = !d.branch;
      fbranchName.textContent = d.branch + (d.dirty ? '*' : '');
      fbranch.title = d.dirty ? 'Ramo git — ci sono modifiche non salvate' : 'Ramo git';
      fcostVal.textContent = d.totalCost;
    }

    return { render };
  };
})();
