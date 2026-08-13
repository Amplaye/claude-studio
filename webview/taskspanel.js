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

  const ICON = { completed: 'checkmark-circle', in_progress: 'play', pending: 'time' };

  window.TaskPanel = function mount(root) {
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
    const empty = el('p', 'tk-empty');

    root.append(head, barWrap, list, empty);

    /** The rows currently on screen, so a repaint can reuse them. */
    let rows = [];
    /** Which step was in progress last time, so the panel only scrolls when it moves. */
    let lastActive = -1;

    function render(d) {
      const items = (d && d.items) || [];
      const total = items.length;
      const done = (d && d.done) || 0;

      // Nothing to show: one line, and the rest of the panel gets out of the way.
      empty.textContent = d && d.busy ? t('tasks.thinking') : t('tasks.none');
      empty.hidden = total > 0;
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
        row.append(ic, label);
        rows.push({ row, ic, label: txt, status: null, fresh: true });
        list.append(row);
      }
      while (rows.length > total) list.removeChild(rows.pop().row);

      items.forEach((it, i) => {
        const r = rows[i];
        const status = it.status || 'pending';
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
      const active = d && typeof d.active === 'number' ? d.active : -1;
      if (active >= 0 && active !== lastActive && rows[active]) {
        // `nearest` moves the list only when the row is actually out of sight, and
        // never drags the surrounding page around with it.
        rows[active].row.scrollIntoView({ block: 'nearest' });
      }
      lastActive = active;
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
