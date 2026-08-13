/* Claude Studio — the context panel, as a mountable piece.
   It lives in two places: on its own in the sidebar, and as a column inside the
   full-screen tab. The design is the same, so there's only one lot of code.

   Two house rules, the same as the chat's:
     - no innerHTML with data: everything goes through textContent;
     - build once, then repaint. Recreating the nodes on every update would kill
       the transitions and make the scroll jump under your finger — and with an
       animated bar it would relaunch the sweep every second and a half, forever. */
window.CtxPanel = (() => {
  const SVG = 'http://www.w3.org/2000/svg';
  const t = (key, vars) => window.I18N.t(key, vars);

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

  /** "2h" reads faster than "7412 seconds" in a line you only glance at. */
  function fmtAge(sec) {
    if (sec == null) return '';
    if (sec < 60) return Math.max(1, Math.round(sec)) + 's';
    if (sec < 3600) return Math.round(sec / 60) + 'm';
    if (sec < 86400) return Math.round(sec / 3600) + 'h';
    return Math.round(sec / 86400) + 'd';
  }

  /** Colour lives in the bars, not in the text. */
  const barColor = (p) =>
    p == null ? 'rgba(255,255,255,.3)' : p >= 80 ? 'var(--bad)' : p >= 60 ? 'var(--warn)' : 'var(--ok)';

  function makeBar() {
    const b = el('div', 'bar');
    const f = el('div', 'fill');
    // Once the sweep is over the class goes away: that way "it's gliding" stays a
    // real thing and not a mark stuck on it forever.
    f.addEventListener('animationend', () => f.classList.remove('glide'));
    b.appendChild(f);
    return b;
  }

  /** The sweep only starts when the bar really moves: otherwise it's noise. */
  function paintBar(fill, pct) {
    const w = (pct == null ? 0 : Math.max(0, Math.min(100, pct))) + '%';
    if (fill.style.width !== w) {
      fill.classList.remove('glide');
      void fill.offsetWidth; // restarts the animation even if the class was already there
      fill.classList.add('glide');
      fill.style.width = w;
    }
    fill.style.background = barColor(pct);
  }

  /**
   * Builds the panel inside `root` and returns whatever knows how to repaint it.
   * `post` is how you talk to the extension: the same shape on both faces.
   */
  return function mount(root, post) {
    root.classList.add('ctx');

    // ---------- header: the account ----------
    const acct = el('div', 'acct');
    const head = el('header', 'hdr');
    const headTop = el('div', 'hdr-top');
    const lab = el('span', 'lab');
    const labText = document.createTextNode(t('ctx.account'));
    lab.append(icon('speedometer'), labText);
    // There used to be two buttons here that did nothing for the person looking:
    //  - "refresh now": the numbers refresh on their own, on a timer and by
    //    listening to the sessions folder. A button to redo something that already
    //    happens by itself is just one more doubt ("so it isn't up to date?").
    //  - the eye, "what the extension sees": it opened a text sheet with session
    //    paths and ids. That's for when something doesn't add up, not for every
    //    day: it stays in the command palette, where you go look for it on purpose.
    headTop.append(lab, el('span', 'grow'));
    head.append(headTop, acct);

    function buildCell(key) {
      const c = el('div', 'acell');
      const val = el('div', 'av');
      const bar = makeBar();
      const reset = el('div', 'ar');
      const name = el('div', 'an', t(key));
      c.append(name, val, bar, reset);
      c._p = { val, reset, name, key, fill: bar.firstChild };
      return c;
    }

    const cells = [buildCell('ctx.session'), buildCell('ctx.week')];
    const waiting = el('div', 'await');
    // Shown only once the numbers stop being current. Sharing an account across
    // machines is exactly when a cached percentage quietly stops being true, so when
    // it can't be vouched for the panel says how old it is instead of implying "now".
    const aged = el('div', 'aged');

    function paintCell(c, pct, reset) {
      c._p.name.textContent = t(c._p.key);
      c._p.val.textContent = pct == null ? '—' : Math.round(pct) + '%';
      c._p.reset.textContent = reset ? t('ctx.resets', { when: reset }) : ' ';
      paintBar(c._p.fill, pct);
    }

    // ---------- the cards (hidden, but the data is needed) ----------
    const host = el('main', 'cards');
    host.hidden = true;
    const cards = new Map();

    function buildCard(id) {
      const c = el('div', 'ctxcard card-hover');
      const chead = el('div', 'chead');
      const dot = el('span', 'dot');
      const kind = icon('sparkles', 'cico');
      const name = el('span', 'cname');
      const badge = el('span', 'badge', t('ctx.here'));
      // "Ha finito." Il suono dice che qualcosa e' pronto, non quale: con tre
      // conversazioni aperte le apri a una a una per scoprirlo. Questo e' il
      // segnalino che risponde — e si spegne appena guardi quella conversazione.
      const done = el('span', 'donebadge');
      done.append(icon('checkmark', 'dico'), el('span', null, t('ctx.done')));
      done.hidden = true;
      const ren = iconButton('pencil', t('ctx.rename'), 'ren');
      // La × non e' "nascondi la card": e' "questa conversazione ho finito di
      // guardarla". Chiude la scheda che la tiene, o la azzera se e' la chat della
      // sidebar — vedi ContextMonitor.close. Senza, una card se ne andava solo
      // quando la sua conversazione moriva da sola, e non c'era modo di dirglielo.
      const shut = iconButton('close', t('ctx.close'), 'shut');
      chead.append(dot, kind, name, badge, done, ren, shut);

      const meta = el('div', 'cmeta');
      const pill = el('span', 'tabpill');
      const sub = el('span', 'csub');
      meta.append(pill, sub);

      const row = el('div', 'crow');
      const pct = el('span', 'cpct');
      const nums = el('span', 'cnums');
      const tok = el('span', 'ctok');
      nums.append(tok);
      row.append(pct, nums);

      const bar = makeBar();
      c.append(chead, meta, row, bar);

      ren.onclick = (ev) => {
        ev.stopPropagation();
        post({ cmd: 'rename', id });
      };
      shut.onclick = (ev) => {
        ev.stopPropagation();
        post({ cmd: 'close', id });
      };
      c.onclick = () => post({ cmd: 'focus', id });

      c._p = { dot, kind, name, badge, done, ren, shut, pill, sub, pct, tok, fill: bar.firstChild };
      return c;
    }

    function paintCard(c, s, limit, how) {
      const p = c._p;
      c.classList.toggle('focused', !!s.focused);
      c.classList.toggle('own', !!s.own);
      c.classList.toggle('done', !!s.done);
      p.done.hidden = !s.done;
      p.done.lastChild.textContent = t('ctx.done');
      p.done.title = t('ctx.doneHint');

      p.dot.classList.toggle('busy', !!s.busy);
      p.dot.classList.toggle('recent', !s.busy && !!s.recent);
      p.dot.title = s.busy ? t('ctx.busy') : s.recent ? t('ctx.recent') : t('ctx.idle');

      p.kind.firstChild.setAttribute('href', s.own ? '#ion-sparkles' : '#ion-chatbubble-ellipses');
      p.kind.setAttribute('title', s.own ? t('ctx.own') : t('ctx.foreign'));

      p.name.textContent = s.name;
      p.name.title = s.preview || s.name;
      p.badge.textContent = t('ctx.here');
      p.badge.hidden = !s.focused;
      p.ren.title = t('ctx.rename');
      p.shut.title = t('ctx.close');
      p.pill.textContent = s.own ? 'Studio' : s.tabName || s.shortId;
      p.pill.title = s.own
        ? t('ctx.ownPill', { id: s.shortId })
        : t('ctx.foreignPill', { tab: s.tabName || '?', id: s.shortId });

      // If the match isn't certain it has to be said, and said on the focused card:
      // better a doubt in writing than a wrong certainty about where you are.
      const via =
        !s.focused || how === 'studio' || how === 'tab'
          ? ''
          : how === 'position'
            ? t('ctx.estimated')
            : t('ctx.lastActive');
      p.sub.textContent = s.lastClock + ' · ' + s.lastAgo + (s.busy ? t('ctx.activeNow') : '') + via;

      p.pct.textContent = s.pct == null ? '—' : s.pct + '%';
      p.tok.textContent = s.tokens + ' / ' + limit;
      paintBar(p.fill, s.pct);
    }

    // ---------- i passi, sotto l'ultima card ----------
    //
    // Stavano in un riquadro loro nella sidebar, ed era un riquadro di troppo: i passi
    // che Claude sta spuntando riguardano una conversazione precisa, e quella
    // conversazione ce l'hai gia' sotto gli occhi qui, con la sua card. Metterli
    // altrove voleva dire aprire due pannelli per leggere una cosa sola — e nel
    // pannello a se' stante non c'era modo di sapere di quale delle conversazioni
    // aperte stessi leggendo i passi.
    const steps = el('section', 'steps');
    const stepsLab = el('div', 'lab');
    const stepsLabText = document.createTextNode(t('ctx.steps'));
    stepsLab.append(icon('list'), stepsLabText);
    const stepsBody = el('div');
    steps.append(stepsLab, stepsBody);
    steps.hidden = true;
    const stepsPanel = window.TaskPanel ? window.TaskPanel(stepsBody) : null;

    // Le card e i passi scorrono insieme: i passi stanno sotto l'ultima card, non in
    // un riquadro fisso in fondo che le mangerebbe l'altezza anche da vuoto.
    const scroll = el('div', 'scroll');
    scroll.append(host, steps);
    root.append(head, scroll);

    // ---------- drawing ----------
    // The last thing we were told, kept so the panel can be drawn again in another
    // language without waiting for the extension to send an update — the numbers
    // only move every second and a half, and a stale label is what you'd stare at
    // in the meantime.
    let last = null;

    window.I18N.onChange(() => {
      labText.nodeValue = t('ctx.account');
      stepsLabText.nodeValue = t('ctx.steps');
      if (last) render(last);
    });

    function render(d) {
      if (!d) return;
      last = d;
      if (!d.usage) {
        waiting.textContent = d.usageWait;
        if (acct.firstChild !== waiting) acct.replaceChildren(waiting);
        aged.remove();
      } else {
        paintCell(cells[0], d.usage.session, d.sessionReset);
        paintCell(cells[1], d.usage.week, d.weekReset);
        if (acct.firstChild !== cells[0]) acct.replaceChildren(cells[0], cells[1]);
        if (d.usageStale) {
          aged.textContent = t('ctx.stale', { age: fmtAge(d.usageAgeSec) });
          if (aged.parentNode !== head) head.append(aged);
        } else {
          aged.remove();
        }
      }

      // The cards for the active sessions with their token usage
      host.hidden = false;
      if (!d.cards.length) {
        host.replaceChildren(el('div', 'empty', t('ctx.empty')));
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
    }

    /**
     * I passi arrivano per conto loro: cambiano al ritmo di Claude, non a quello dei
     * consumi, e legarli allo stesso messaggio avrebbe voluto dire ridisegnare le
     * barre a ogni spunta.
     *
     * La sezione sparisce del tutto quando non c'e' niente da spuntare. Un "ancora
     * nessuna task" fisso sotto le card sarebbe una riga che non dice niente per il
     * 90% del tempo, e proprio sotto la card che invece dice sempre qualcosa.
     */
    function renderTasks(d) {
      if (!stepsPanel) return;
      const total = (d && d.total) || 0;
      steps.hidden = !(total > 0 || (d && d.busy));
      stepsPanel.render(d);
    }

    return { render, renderTasks };
  };
})();
