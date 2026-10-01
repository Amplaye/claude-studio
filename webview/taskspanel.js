/* Claude Studio — the task list Claude is working through.
 *
 * Two house rules, the same as the context panel:
 *   1. never innerHTML with data that isn't ours — everything goes in as textContent;
 *   2. build once, then repaint. Rows are reused where they can be, so a row that only
 *      changed state animates instead of blinking out of existence and back.
 *
 * The list arrives whole from the extension every time: Claude rewrites it at each
 * step, so there is nothing to reconcile here beyond keeping the DOM steady.
 */
(() => {
  const t = (k, v) => window.I18N.t(k, v);

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function icon(name, cls) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'ico' + (cls ? ' ' + cls : ''));
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#ion-' + name);
    svg.appendChild(use);
    return svg;
  }

  const ICON = {
    completed: 'checkmark-circle',
    in_progress: 'play',
    pending: 'time',
    failed: 'alert-circle',
  };

  /**
   * `opts.agents === false` lascia fuori gli aiutanti: il foglio della bacheca li
   * disegna in una sezione sua, ad albero, e due volte la stessa gente sarebbe una
   * lista da confrontare invece che da leggere.
   */
  window.TaskPanel = function mount(root, opts) {
    const conAiutanti = !(opts && opts.agents === false);
    root.classList.add('taskroot');

    const head = el('div', 'tk-head');
    const count = el('span', 'tk-count');
    // "4 of 9 done" answers how far along it is; it does not answer how much is still
    // coming, which is the thing you actually want to know before walking away. The
    // subtraction is easy and you should not have to do it.
    const left = el('span', 'tk-left');
    const state = el('span', 'tk-state');
    head.append(count, left, state);

    const barWrap = el('div', 'tk-bar');
    const fill = el('i', 'tk-fill');
    barWrap.append(fill);

    const list = el('div', 'tk-list');
    /** I passi gia' fatti, quando un piano non c'e'. Vedi `trail` in tasks/protocol.ts. */
    const trailBox = el('div', 'tk-trail');
    /* Chi lavora per questa conversazione: i sub-agent, ognuno sotto chi l'ha
       lanciato. Erano righe dell'elenco dei passi, e la prima che arrivava si portava
       via il piano — adesso stanno qui sotto, per conto loro. */
    const crew = el('div', 'tk-agents');
    const crewHead = el('div', 'tk-agents-head');
    const crewList = el('div', 'tk-agents-list');
    crew.append(crewHead, crewList);
    crew.hidden = true;
    const empty = el('p', 'tk-empty');

    root.append(head, barWrap, list, trailBox, crew, empty);

    /** Le righe degli aiutanti, per id: si ridipingono invece di rifarle, o l'icona che batte riparte a ogni notizia. */
    const crewRows = new Map();

    function paintCrew(d) {
      const all = conAiutanti && d && Array.isArray(d.agents) ? d.agents : [];
      crew.hidden = !all.length;
      const vivi = all.filter((a) => a.status === 'in_progress').length;
      crewHead.textContent = vivi ? t('tasks.crewBusy', { n: vivi }) : t('tasks.crew');
      const seen = new Set();
      let prima = null;
      for (const a of all) {
        seen.add(a.id);
        let r = crewRows.get(a.id);
        if (!r) {
          const row = el('div', 'tk-agent');
          const ic = el('span', 'tk-ic');
          const txt = el('span', 'tk-agent-txt');
          const kind = el('span', 'tk-agent-type');
          row.append(ic, txt, kind);
          r = { row, ic, txt, kind, status: null };
          crewRows.set(a.id, r);
        }
        const dopo = prima ? prima.row.nextSibling : crewList.firstChild;
        if (dopo !== r.row) crewList.insertBefore(r.row, dopo);
        prima = r;
        const status = a.status || 'pending';
        const lv = Math.max(0, (a.depth || 1) - 1);
        r.row.style.setProperty('--lv', String(lv));
        r.row.classList.toggle('sub', lv > 0);
        if (r.status !== status) {
          r.status = status;
          r.row.classList.remove('pending', 'in_progress', 'completed', 'failed');
          r.row.classList.add(status);
          r.ic.replaceChildren(icon(ICON[status] || 'time'));
        }
        r.txt.textContent = a.title || a.type || '';
        r.kind.textContent = a.type || '';
        r.kind.hidden = !a.type;
        r.row.title = [a.title, a.doing || a.summary || ''].filter(Boolean).join(' — ');
      }
      for (const [id, r] of crewRows) {
        if (seen.has(id)) continue;
        r.row.remove();
        crewRows.delete(id);
      }
      return all.length;
    }

    /** The rows currently on screen, so a repaint can reuse them. */
    let rows = [];
    /** Which step was in progress last time, so the panel only scrolls when it moves. */
    let lastActive = -1;

    function render(d) {
      const items = (d && d.items) || [];
      const total = items.length;
      const done = (d && d.done) || 0;

      // Senza un piano, i passi che il turno ha fatto davvero.
      //
      // Il piano lo scrive Claude, e "lo scrive" e' una cosa che si spera: provato dal
      // vivo tre volte con la stessa istruzione, due l'ha scritto e una no. Un pannello
      // che dipende da quella scelta e' vuoto un turno su tre — il difetto da cui si e'
      // partiti. Questa invece non chiede niente a nessuno: sono i passi gia' fatti,
      // l'ultimo dei quali sta succedendo adesso. Non e' una previsione e non si
      // atteggia a tale: non ha totale, quindi non ha percentuale.
      const trail = (!total && d && d.trail) || [];
      const doing = (d && d.busy && d.doing) || '';
      trailBox.replaceChildren();
      if (trail.length) {
        trail.forEach((step, i) => {
          const last = i === trail.length - 1;
          const row = el('div', 'tk-step' + (last && d.busy ? ' live' : ''));
          row.append(el('span', 'tk-step-dot'), el('span', 'tk-step-txt', step));
          trailBox.append(row);
        });
      }
      trailBox.hidden = !trail.length;
      // La riga sola resta per il momento in cui non c'e' ancora nemmeno un passo.
      empty.textContent = doing || (d && d.busy ? t('tasks.thinking') : t('tasks.none'));
      empty.classList.toggle('live', !!doing);
      // Con degli aiutanti a schermo "niente in lista" sarebbe falso: la lista dei
      // passi e' vuota, ma qualcuno sta lavorando — e lo dice la loro testata.
      const squadra = paintCrew(d);
      empty.hidden = total > 0 || trail.length > 0 || (squadra > 0 && !doing);
      head.hidden = barWrap.hidden = total === 0;

      if (total) {
        count.textContent = t('tasks.count', { done, total });
        const remaining = Math.max(0, total - done);
        left.textContent = remaining ? t('tasks.left', { n: remaining }) : '';
        left.hidden = remaining === 0;
        state.textContent =
          done >= total ? t('tasks.finished') : d.busy ? t('tasks.working') : t('tasks.paused');
        state.className = 'tk-state' + (done >= total ? ' ok' : d.busy ? ' live' : '');
        fill.style.width = total ? Math.round((done / total) * 100) + '%' : '0%';
      }

      // Grow or shrink the row pool, then repaint each one in place. Rows are reused
      // so that a task which only changed state animates from what it was, instead of
      // being destroyed and rebuilt — which would throw away the transition.
      while (rows.length < total) {
        const row = el('div', 'tk-row');
        const ic = el('span', 'tk-ic');
        const label = el('span', 'tk-label');
        // The words live in their own inline span so the strike-through can be exactly
        // as long as they are — see .tk-txt in tasks.css.
        const txt = el('span', 'tk-txt');
        label.append(txt);
        // How far along this one step is. Only ever drawn on the step that is
        // running, and only as an estimate — see estimate() below for what it is
        // actually made of, and why it is honest to show it at all.
        const pct = el('span', 'tk-pct');
        const wrap = el('div', 'tk-rowbar');
        const bar = el('i', 'tk-rowfill');
        wrap.append(bar);
        row.append(ic, label, pct, wrap);
        rows.push({ row, ic, label: txt, pct, bar, status: null, fresh: true });
        list.append(row);
      }
      while (rows.length > total) list.removeChild(rows.pop().row);

      // Una riga accesa, non quattro.
      //
      // La CLI lancia i sub-agent a mazzi, e sul filo passano tutti accesi come sono
      // davvero — l'ufficio ne disegna uno per persona e quelli gli servono veri. Qui
      // no: quattro righe arancioni insieme sono un muro, e non si capisce piu' dove
      // sia arrivato. Vale il primo, che e' anche quello a cui la lista scorre dietro;
      // gli altri si disegnano come quello che sono per chi legge una lista, cioe' da
      // fare.
      const acceso = d && typeof d.active === 'number' ? d.active : -1;

      items.forEach((it, i) => {
        const r = rows[i];
        const vero = it.status || 'pending';
        const status = vero === 'in_progress' && i !== acceso ? 'pending' : vero;
        // While it is the one being worked on it reads "Renaming the column"; the rest
        // of the time "Rename the column". That's what activeForm is for.
        const text = status === 'in_progress' ? it.activeForm || it.content : it.content;
        if (r.label.textContent !== text) r.label.textContent = String(text || '');
        if (r.status === status) return;

        // Ticked off just now — not merely drawn already done, which is what a repaint
        // after switching panels would be. Only the real transition gets the flourish.
        const justDone = status === 'completed' && r.status !== null && r.status !== 'completed';
        r.status = status;
        r.row.className =
          'tk-row ' + status + (justDone ? ' justdone' : '') + (r.fresh ? ' new' : '');
        if (r.fresh) {
          r.row.style.setProperty('--i', i);
          r.fresh = false;
        }
        r.ic.replaceChildren(icon(ICON[status] || 'time'));
        // The class is dropped once it has played, or the next repaint would replay it.
        if (justDone) setTimeout(() => r.row.classList.remove('justdone'), 600);
      });

      // Follow the step being worked on. A dozen tasks in a sidebar this narrow is
      // taller than the panel, so the one that matters is exactly the one that scrolls
      // off — and the whole point of this panel is seeing it without hunting for it.
      // Only on a change: scrolling on every repaint would fight the mouse wheel.
      const active = acceso;
      if (active >= 0 && active !== lastActive && rows[active]) {
        // `nearest` moves the list only when the row is actually out of sight, and
        // never drags the surrounding page around with it.
        rows[active].row.scrollIntoView({ block: 'nearest' });
      }
      lastActive = active;
      tick();
    }

    /**
     * How far along the step that is running is.
     *
     * Nobody knows how long "fix the failing tests" takes until it is fixed, so this
     * is not a measurement and it is not drawn as one: it is elapsed time against how
     * long the steps *already finished in this same list* took, which is the same
     * thing a download bar does — it does not know the future either, it knows the
     * speed so far. The extension sends the two raw numbers and the clock runs here,
     * once a second, instead of the wire beating sixty times a minute to animate a
     * bar that can animate itself.
     *
     * It stops at 95 and waits. A step that says 100% and is still running has told
     * you something false; one that sits at 95 has told you "longer than the others
     * are taking", which is true and is the thing worth knowing.
     */
    function estimate(d) {
      if (!d || !d.busy || !d.activeSince || !d.expectedMs) return -1;
      return Math.min(0.95, (Date.now() - d.activeSince) / d.expectedMs);
    }

    let ticker = 0;
    function tick() {
      const d = lastData;
      const active = d && typeof d.active === 'number' ? d.active : -1;
      const p = estimate(d);
      for (let i = 0; i < rows.length; i++) {
        const on = i === active && p >= 0;
        rows[i].row.classList.toggle('running', on);
        if (!on) continue;
        rows[i].bar.style.width = Math.round(p * 100) + '%';
        rows[i].pct.textContent = t('tasks.about', { n: String(Math.round(p * 100)) });
        rows[i].pct.title = t('tasks.aboutHint');
      }
      clearInterval(ticker);
      ticker = 0;
      // Un orologio che gira su un pannello dove non c'e' niente che si muove e' solo
      // una ventola accesa: parte se e solo se c'e' una riga in corso da far avanzare.
      if (p >= 0) ticker = setInterval(tick, 1000);
    }

    // Redrawn on a language switch: the counts and the labels are ours, not the HTML's.
    let lastData = null;
    window.I18N.onChange(() => lastData && render(lastData));

    // Drawn once before anything arrives: a panel that is blank until the extension
    // speaks looks broken, and on a fresh window that can be a long wait.
    render(null);

    return {
      render(d) {
        lastData = d;
        render(d);
      },
    };
  };
})();
