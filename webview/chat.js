/* Claude Studio — chat.
   Regola di casa: niente innerHTML con dati. Tutto passa da textContent o da nodi
   costruiti a mano, come nella context-bar. */
(() => {
  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);
  const log = $('log');
  const input = $('input');
  const composer = $('composer');
  const sendBtn = $('send');
  const modeSel = $('modeSel');
  const SVG = 'http://www.w3.org/2000/svg';

  // ---------- utilita' DOM ----------
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

  /** La spunta e' un tracciato vero (non un <use>): cosi' puo' disegnarsi da sola. */
  function drawnCheck(cls) {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('class', cls ? 'ico ' + cls : 'ico');
    svg.setAttribute('viewBox', '0 0 512 512');
    const p = document.createElementNS(SVG, 'path');
    p.setAttribute('d', 'M416 128 192 384l-96-96');
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '44');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(p);
    try {
      svg.style.setProperty('--len', Math.ceil(p.getTotalLength()) || 480);
    } catch (_) {
      svg.style.setProperty('--len', 480);
    }
    return svg;
  }

  const TOOL_ICONS = {
    Read: 'document-text',
    Write: 'create',
    Edit: 'pencil',
    NotebookEdit: 'pencil',
    Bash: 'terminal',
    PowerShell: 'terminal',
    Glob: 'folder-open',
    Grep: 'search',
    WebFetch: 'globe',
    WebSearch: 'globe',
    Agent: 'people',
    Task: 'people',
    TodoWrite: 'list',
    Skill: 'cube',
    Artifact: 'layers',
    ExitPlanMode: 'shield-checkmark',
    AskUserQuestion: 'options',
    ToolSearch: 'search',
    Workflow: 'git-branch',
  };

  /** I tool che mostrano un diff: il "prima" viene dai dati del tool, non dal disco. */
  const DIFF_TOOLS = { Write: 1, Edit: 1, NotebookEdit: 1 };
  /** Tool che si raccontano gia' da soli: dell'esito riuscito non serve dire niente. */
  const QUIET = { Write: 1, Edit: 1, NotebookEdit: 1, TodoWrite: 1 };

  let cwd = '';
  /** I percorsi assoluti riempiono la riga senza dire niente: si tiene la parte utile. */
  function shortPath(p) {
    const s = String(p || '');
    if (cwd && s.toLowerCase().startsWith(cwd.toLowerCase())) {
      return s.slice(cwd.length).replace(/^[\\/]+/, '') || s;
    }
    return s;
  }

  /** Riga di riepilogo di un tool: il primo argomento che dice davvero qualcosa. */
  function toolArg(inp, name) {
    if (!inp || typeof inp !== 'object') return '';
    // La lista dei todo la si vede tutta sotto: in testa il JSON sarebbe solo rumore.
    if (name === 'TodoWrite') {
      const n = (inp.todos || []).length;
      return n === 1 ? '1 voce' : n + ' voci';
    }
    for (const k of ['command', 'file_path', 'path', 'pattern', 'query', 'url', 'description', 'prompt']) {
      const v = inp[k];
      if (typeof v === 'string' && v.trim()) {
        const t = k === 'file_path' || k === 'path' ? shortPath(v) : v;
        return t.replace(/\s+/g, ' ').slice(0, 200);
      }
    }
    try {
      return JSON.stringify(inp).slice(0, 200);
    } catch (_) {
      return '';
    }
  }

  // ---------- scroll ----------
  let stick = true;
  log.addEventListener('scroll', () => {
    stick = log.scrollHeight - log.scrollTop - log.clientHeight < 64;
  });
  function toBottom() {
    if (stick) log.scrollTop = log.scrollHeight;
  }

  // I loop infiniti si fermano fuori schermo: venti aloni che pulsano dove non
  // guardi scaldano il portatile per niente.
  const seen = new IntersectionObserver(
    (entries) => {
      for (const e of entries) e.target.classList.toggle('offscreen', !e.isIntersecting);
    },
    { root: log, rootMargin: '160px' }
  );

  /** Se il pezzo arriva da un sub-agent finisce dentro la card del Task che lo ha
      lanciato; altrimenti in fondo alla conversazione. */
  function add(node, parent) {
    const nest = parent && tools.get(parent);
    if (nest && nest._kids) {
      nest._kids.appendChild(node);
      seen.observe(node);
      toBottom();
      return node;
    }
    const empty = log.querySelector('.empty');
    if (empty) empty.remove();
    log.appendChild(node);
    seen.observe(node);
    toBottom();
    return node;
  }

  // ---------- stato vuoto ----------
  function showEmpty() {
    log.replaceChildren();
    const box = el('div', 'empty');
    box.append(icon('chatbubble-ellipses'), el('h2', null, 'Pronti.'), el('p', null, 'Scrivi qui sotto: risponde la stessa Claude Code che usi da terminale, con i tuoi CLAUDE.md, skill, MCP e permessi.'));
    log.appendChild(box);
  }

  // ---------- blocchi ----------
  const blocks = new Map(); // id -> {node, body, caret, kind, raw}
  const tools = new Map(); // tool_use_id -> node

  function textBlock(id, parent) {
    let b = blocks.get(id);
    if (b) return b;
    const node = el('div', 'msg assistant');
    const caret = el('span', 'caret');
    node.appendChild(caret);
    b = { node, body: node, caret, kind: 'text', raw: '' };
    blocks.set(id, b);
    add(node, parent);
    return b;
  }

  function thinkBlock(id, parent) {
    let b = blocks.get(id);
    if (b) return b;
    const node = document.createElement('details');
    node.className = 'msg think';
    node.open = false;
    const sum = el('summary');
    sum.append(icon('bulb'), el('span', null, 'Ragionamento'));
    const body = el('div', 'body');
    const caret = el('span', 'caret');
    body.appendChild(caret);
    node.append(sum, body);
    b = { node, body, caret, kind: 'thinking', raw: '' };
    blocks.set(id, b);
    add(node, parent);
    return b;
  }

  function appendDelta(id, kind, text, parent) {
    const b = kind === 'thinking' ? thinkBlock(id, parent) : textBlock(id, parent);
    b.raw += text;
    const chunk = el('span', 'chunk', text);
    b.body.insertBefore(chunk, b.caret);
    toBottom();
  }

  /* Il testo definitivo arriva col messaggio completo: si ridisegna il blocco una
     volta sola, con il markdown reso. Cosi' lo streaming resta grezzo e veloce e il
     risultato finale resta pulito. */
  function finalize(id, kind, text, parent) {
    const b = kind === 'thinking' ? thinkBlock(id, parent) : textBlock(id, parent);
    b.raw = text;
    if (kind === 'thinking') {
      b.body.replaceChildren(document.createTextNode(text));
    } else {
      b.body.replaceChildren(...markdown(text));
    }
    b.caret = null;
    toBottom();
  }

  /** Markdown minimo e sicuro: blocchi ``` e `codice`. Nessun innerHTML. */
  function markdown(src) {
    const out = [];
    const parts = String(src).split(/```/);
    parts.forEach((part, i) => {
      if (i % 2 === 1) {
        const nl = part.indexOf('\n');
        const body = nl >= 0 ? part.slice(nl + 1) : part;
        const pre = el('pre');
        pre.appendChild(el('code', null, body.replace(/\n$/, '')));
        out.push(pre);
      } else {
        const seg = part.split(/`([^`\n]+)`/);
        seg.forEach((s, j) => {
          if (!s) return;
          out.push(j % 2 === 1 ? el('code', null, s) : document.createTextNode(s));
        });
      }
    });
    return out.length ? out : [document.createTextNode('')];
  }

  // ---------- tool ----------

  /** Un diff a righe. Il "prima" arriva dai dati del tool, mai riletto dal disco:
      rileggerlo significherebbe correre contro la scrittura che sta avvenendo. */
  function diffBody(name, inp) {
    const box = el('div', 'diff');
    const rows = [];
    const push = (sign, text) => {
      if (!text) return;
      for (const l of String(text).replace(/\n$/, '').split('\n')) rows.push([sign, l]);
    };
    if (name === 'Write') push('+', inp.content);
    else if (name === 'NotebookEdit') {
      push('-', inp.old_source);
      push('+', inp.new_source ?? inp.new_string);
    } else {
      push('-', inp.old_string);
      push('+', inp.new_string);
    }
    if (!rows.length) return null; // niente da mostrare: meglio nessun riquadro vuoto

    const MAX = 60;
    for (const [sign, text] of rows.slice(0, MAX)) {
      const row = el('div', 'row ' + (sign === '+' ? 'add' : 'del'));
      row.append(el('span', 'sign', sign), el('span', 'code', text || ' '));
      box.append(row);
    }
    if (rows.length > MAX) box.append(el('div', 'more', `… altre ${rows.length - MAX} righe`));
    if (inp.replace_all) box.append(el('div', 'more', 'sostituite tutte le occorrenze'));
    return box;
  }

  const TODO_ICON = { completed: 'checkmark-circle', in_progress: 'play', pending: 'time' };

  function todoBody(inp) {
    const list = el('div', 'todos');
    for (const t of inp.todos || []) {
      const row = el('div', 'todo ' + (t.status || 'pending'));
      const text = t.status === 'in_progress' ? t.activeForm || t.content : t.content;
      row.append(icon(TODO_ICON[t.status] || 'time'), el('span', null, String(text || '')));
      list.append(row);
    }
    return list;
  }

  function toolStart(id, name, inp, parent) {
    const node = document.createElement('details');
    node.className = 'msg tool running';
    node.dataset.tool = name;
    const i = inp && typeof inp === 'object' ? inp : {};

    const sum = el('summary');
    const head = el('div', 'head');
    const ic = icon(TOOL_ICONS[name] || 'flash', 'tool-ico');
    // Se il tool tocca un file, il percorso e' un collegamento: un clic lo apre
    // nell'editor, dove serve guardarlo davvero.
    const file = i.file_path || i.path;
    const arg = el(typeof file === 'string' ? 'button' : 'span', 'arg', toolArg(inp, name));
    if (typeof file === 'string') {
      arg.type = 'button';
      arg.classList.add('link');
      arg.title = 'Apri nell’editor';
      arg.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        vscode.postMessage({ cmd: 'openFile', path: file });
      });
    }
    head.append(ic, el('span', 'name', name), arg, icon('chevron-down', 'chev'));
    sum.append(head, el('div', 'tool-bar'));

    const body = el('div', 'body');
    const diff = DIFF_TOOLS[name] ? diffBody(name, i) : null;
    if (diff) {
      body.append(diff);
      node.open = true;
    } else if (name === 'TodoWrite') {
      body.append(todoBody(i));
      node.open = true;
    } else if (name === 'Task' || name === 'Agent') {
      if (i.prompt) body.append(el('div', 'prompt', String(i.prompt).slice(0, 600)));
      node._kids = el('div', 'kids');
      body.append(node._kids);
      node.open = true;
    }

    node.append(sum, body);
    node._ico = ic;
    node._body = body;
    // Se sei tu ad aprire o chiudere la card, l'esito non ci mette piu' becco.
    sum.addEventListener('click', () => {
      node._touched = true;
    });

    tools.set(id, node);
    add(node, parent);
  }

  function toolEnd(id, ok, text) {
    const node = tools.get(id);
    if (!node) return;
    node.classList.remove('running');
    node.classList.add(ok ? 'done' : 'fail');
    const fresh = ok ? drawnCheck('tool-ico') : icon('alert-circle', 'tool-ico');
    node._ico.replaceWith(fresh);
    node._ico = fresh;
    if (ok) {
      const spark = el('span', 'spark');
      node.appendChild(spark);
      setTimeout(() => spark.remove(), 800);
    }

    // "File updated successfully" sotto a un diff che si vede gia' e' rumore:
    // di questi tool l'esito si mostra solo quando va storto.
    const t = ok && QUIET[node.dataset.tool] ? '' : String(text || '').trim();
    if (t) {
      const lines = t.split('\n');
      const out = el('div', 'out', lines.length > 400 ? lines.slice(0, 400).join('\n') + '\n…' : t);
      // Nelle card che hanno gia' qualcosa da mostrare (diff, todo, sub-agent)
      // l'esito e' una nota in fondo, non il contenuto principale.
      if (node._kids) node._body.append(el('div', 'sub-result', t.slice(0, 2000)));
      else node._body.append(out);
      if (!node._touched && !node.open) node.open = lines.length <= 12;
      const n = node.querySelector('.count');
      if (n) n.remove();
      if (lines.length > 12) {
        node.querySelector('.head').insertBefore(
          el('span', 'count', lines.length + ' righe'),
          node.querySelector('.chev')
        );
      }
    } else if (!node._touched && !node._kids && !node.open) {
      node.classList.add('bare'); // niente da aprire: via la freccia
    }
    toBottom();
  }

  // ---------- permessi ----------
  const asks = new Map(); // id -> nodo della scheda

  function button(cls, iconName, text) {
    const b = el('button', 'btn ' + cls);
    b.type = 'button';
    b.append(icon(iconName), el('span', null, text));
    return b;
  }

  /** Le domande a scelta multipla: una risposta per domanda, poi si manda. */
  function questionBody(node, m, send) {
    const answers = {};
    const box = el('div', 'qs');
    const go = button('ok', 'send', 'Manda');
    go.disabled = true;

    const check = () => {
      go.disabled = m.questions.some((q) => !answers[q.question]);
    };

    for (const q of m.questions) {
      const group = el('div', 'q');
      const head = el('div', 'q-head');
      if (q.header) head.append(el('span', 'tag', q.header));
      head.append(el('span', 'q-text', q.question));
      group.append(head);

      const opts = el('div', 'opts');
      for (const o of q.options) {
        const b = el('button', 'opt');
        b.type = 'button';
        b.append(el('span', 'opt-label', o.label));
        if (o.description) b.append(el('span', 'opt-desc', o.description));
        b.addEventListener('click', () => {
          if (q.multiSelect) {
            b.classList.toggle('on');
            const picked = [...opts.querySelectorAll('.opt.on .opt-label')].map((n) => n.textContent);
            answers[q.question] = picked.join(', ');
            if (!picked.length) delete answers[q.question];
          } else {
            for (const other of opts.querySelectorAll('.opt.on')) other.classList.remove('on');
            b.classList.add('on');
            answers[q.question] = o.label;
          }
          check();
        });
        opts.append(b);
      }
      group.append(opts);
      box.append(group);
    }

    go.addEventListener('click', () => send('allow', answers));
    node.append(box);
    return [go];
  }

  function askCard(m) {
    if (asks.has(m.id)) return;
    const node = el('div', 'msg perm card-hover');
    node.dataset.kind = m.kind;

    const head = el('div', 'head');
    const ic = m.kind === 'plan' ? 'list' : m.kind === 'question' ? 'options' : 'shield-checkmark';
    head.append(icon(ic, 'perm-ico'), el('span', 'title', m.title || 'Serve il tuo permesso'));
    node.append(head);

    const acts = el('div', 'acts');
    const answered = (choice, answers) => {
      if (node.classList.contains('resolved')) return;
      vscode.postMessage({ cmd: 'answer', id: m.id, choice, answers });
      // Niente attesa dell'estensione: chi ha cliccato vede subito il tasto spegnersi.
      for (const b of node.querySelectorAll('button')) b.disabled = true;
    };

    if (m.kind === 'plan') {
      const body = el('div', 'plan');
      body.replaceChildren(...markdown(m.plan || m.detail || ''));
      node.append(body);
      const ok = button('ok', 'checkmark', 'Approva ed esegui');
      const auto = button('always', 'flash', 'Approva, non chiedermi le modifiche');
      const no = button('no', 'close', 'Continua a pianificare');
      ok.addEventListener('click', () => answered('allow'));
      auto.addEventListener('click', () => answered('always'));
      no.addEventListener('click', () => answered('deny'));
      acts.append(ok, auto, no);
    } else if (m.kind === 'question' && m.questions && m.questions.length) {
      const [go] = questionBody(node, m, answered);
      acts.append(go);
    } else {
      if (m.detail) node.append(el('div', 'detail', m.detail));
      const ok = button('ok', 'checkmark', 'Consenti');
      ok.addEventListener('click', () => answered('allow'));
      acts.append(ok);
      if (m.canAlways) {
        const always = button('always', 'checkmark-circle', 'Consenti sempre');
        // Non e' una promessa "per stavolta": la regola resta scritta sul disco.
        always.title = 'La regola resta scritta nei permessi del progetto (.claude/settings.local.json).';
        always.addEventListener('click', () => answered('always'));
        acts.append(always);
      }
      const no = button('no', 'close', 'Rifiuta');
      no.addEventListener('click', () => answered('deny'));
      acts.append(no);
    }

    node.append(acts);
    asks.set(m.id, node);
    stick = true; // un permesso non si perde fuori schermo
    add(node);
  }

  function askDone(m) {
    const node = asks.get(m.id);
    if (!node) return;
    asks.delete(m.id);
    node.classList.add('resolved', m.ok ? 'ok' : 'no');
    const acts = node.querySelector('.acts');
    const verdict = el('div', 'verdict');
    verdict.append(m.ok ? drawnCheck('perm-ico') : icon('close', 'perm-ico'), el('span', null, m.label));
    if (acts) acts.replaceWith(verdict);
    else node.append(verdict);
    for (const opts of node.querySelectorAll('.opts')) {
      for (const b of opts.querySelectorAll('.opt:not(.on)')) b.remove();
    }
    toBottom();
  }

  // ---------- attesa ----------
  let waiting = null;
  function showWaiting() {
    if (waiting) return;
    waiting = el('div', 'msg pulse');
    const dot = el('span', 'dot thinking-halo');
    waiting.append(dot, el('span', null, 'Claude sta pensando…'));
    add(waiting);
  }
  function hideWaiting() {
    if (!waiting) return;
    waiting.remove();
    waiting = null;
  }

  // ---------- cronologia ----------
  const drawer = $('drawer');

  function fmtAgo(ms) {
    const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 90) return 'adesso';
    const m = Math.round(s / 60);
    if (m < 60) return m + ' min fa';
    const h = Math.round(m / 60);
    if (h < 24) return h === 1 ? "un'ora fa" : h + ' ore fa';
    const g = Math.round(h / 24);
    return g === 1 ? 'ieri' : g + ' giorni fa';
  }

  function showHistory(items) {
    const list = $('drawerList');
    list.replaceChildren();
    if (!items.length) {
      list.append(el('div', 'drawer-empty', 'Nessuna conversazione salvata per questo progetto.'));
    }
    for (const it of items) {
      const row = el('div', 'hrow card-hover');
      const open = el('button', 'hopen');
      open.type = 'button';
      open.append(el('span', 'hsummary', it.summary), el('span', 'hwhen', fmtAgo(it.when)));
      open.addEventListener('click', () => {
        vscode.postMessage({ cmd: 'open', id: it.id });
        drawer.hidden = true;
      });
      const fork = el('button', 'iconbtn hfork');
      fork.type = 'button';
      fork.title = 'Riprendi su un ramo nuovo, lasciando intatta l’originale';
      fork.append(icon('git-branch'));
      fork.addEventListener('click', () => {
        vscode.postMessage({ cmd: 'open', id: it.id, fork: true });
        drawer.hidden = true;
      });
      row.append(open, fork);
      list.append(row);
    }
    drawer.hidden = false;
  }

  $('btnHistory').addEventListener('click', () => {
    if (!drawer.hidden) {
      drawer.hidden = true;
      return;
    }
    vscode.postMessage({ cmd: 'history' });
  });
  $('drawerClose').addEventListener('click', () => (drawer.hidden = true));

  // ---------- quanto e' costato ----------
  // Il costo si somma turno per turno; i token sono quelli dell'ultimo turno, cioe'
  // quanto contesto sta portando la conversazione adesso.
  let spent = { usd: 0, tokens: 0 };
  const fmtTokens = (n) =>
    n >= 1000000 ? (n / 1000000).toFixed(1) + 'M' : n >= 1000 ? Math.round(n / 1000) + 'k' : String(n);

  function paintSpent() {
    const chip = $('spend');
    if (!spent.tokens && !spent.usd) {
      chip.hidden = true;
      return;
    }
    chip.hidden = false;
    $('spendTokens').textContent = fmtTokens(spent.tokens);
    $('spendCost').textContent = '$' + spent.usd.toFixed(spent.usd < 1 ? 3 : 2);
  }

  // ---------- busy ----------
  let busy = false;
  function setBusy(v) {
    busy = v;
    sendBtn.classList.toggle('stop', v);
    sendBtn.title = v ? 'Ferma' : 'Manda';
    sendBtn.replaceChildren(icon(v ? 'stop-circle' : 'send'));
    if (v) showWaiting();
    else hideWaiting();
  }

  // ---------- messaggi dall'estensione ----------
  window.addEventListener('message', (ev) => {
    const m = ev.data;
    if (!m || !m.k) return;
    switch (m.k) {
      case 'hello':
        // Da scheda la colonna del testo si tiene stretta: righe lunghe due metri
        // non si leggono. Il "apri come scheda" sparisce quando gia' ci sei.
        document.body.classList.toggle('wide', m.surface === 'panel');
        $('btnTab').hidden = m.surface === 'panel';
        // Il contesto di fianco ha senso solo dove c'e' spazio: nella scheda.
        $('btnCtx').hidden = m.surface !== 'panel';
        if (m.surface === 'panel') showRail((vscode.getState() || {}).rail !== false);
        cwd = m.cwd || '';
        spent = { usd: 0, tokens: 0 };
        paintSpent();
        showEmpty();
        break;
      case 'reset':
        blocks.clear();
        tools.clear();
        asks.clear();
        waiting = null;
        spent = { usd: 0, tokens: 0 };
        paintSpent();
        showEmpty();
        break;
      case 'mode':
        modeSel.value = m.value;
        document.body.dataset.mode = m.value;
        break;
      case 'history':
        showHistory(m.items || []);
        break;
      case 'ctx':
        rail.render(m.d);
        break;
      case 'commands':
        commands = m.items || [];
        break;
      case 'files':
        showFiles(m.items || []);
        break;
      case 'selection':
        selection = m.file ? { file: m.file, lines: m.lines } : null;
        // ogni selezione nuova riparte allegata: e' quello che ci si aspetta
        useSelection = true;
        paintAttach();
        break;
      case 'ask':
        hideWaiting();
        askCard(m);
        break;
      case 'ask_done':
        askDone(m);
        if (busy) showWaiting();
        break;
      case 'session':
        // "claude-" davanti non distingue niente: quello che conta e' cio' che segue.
        $('modelName').textContent = (m.model || '—').replace(/^claude-/, '');
        $('model').title = 'Modello della sessione: ' + (m.model || '—');
        break;
      case 'user': {
        const n = el('div', 'msg user', m.text);
        add(n);
        break;
      }
      case 'turn_start':
        hideWaiting();
        break;
      case 'block_start':
        hideWaiting();
        m.kind === 'thinking' ? thinkBlock(m.id, m.parent) : textBlock(m.id, m.parent);
        break;
      case 'delta':
        hideWaiting();
        appendDelta(m.id, m.kind || 'text', m.text, m.parent);
        break;
      case 'block_final':
        finalize(m.id, m.kind, m.text, m.parent);
        break;
      case 'tool_start':
        hideWaiting();
        toolStart(m.id, m.name, m.input, m.parent);
        break;
      case 'tool_end':
        toolEnd(m.id, m.ok, m.text);
        break;
      case 'turn_end':
        blocks.clear();
        spent.usd += m.costUsd || 0;
        spent.tokens = m.tokens || spent.tokens;
        paintSpent();
        break;
      case 'busy':
        setBusy(m.value);
        break;
      case 'error': {
        const n = el('div', 'msg err');
        n.append(icon('alert-circle'), el('span', null, m.message));
        add(n);
        break;
      }
    }
  });

  // ---------- il menu di "@" e "/" ----------
  const menu = $('menu');
  let commands = [];
  let picking = null; // {kind:'@'|'/', start, end, items, sel}

  /** Il pezzo di parola sotto al cursore, se comincia per @ o per /. */
  function token() {
    const pos = input.selectionStart;
    const before = input.value.slice(0, pos);
    const m = before.match(/(^|\s)([@/])([^\s]*)$/);
    if (!m) return null;
    // lo slash vale solo come primo carattere: "10/20" non e' un comando
    if (m[2] === '/' && before.length !== m[3].length + 1) return null;
    return { kind: m[2], q: m[3], start: pos - m[3].length - 1, end: pos };
  }

  function closeMenu() {
    picking = null;
    menu.hidden = true;
    menu.replaceChildren();
  }

  function paintMenu(items) {
    if (!picking) return;
    picking.items = items;
    picking.sel = 0;
    menu.replaceChildren();
    if (!items.length) {
      closeMenu();
      return;
    }
    items.forEach((it, i) => {
      const row = el('div', 'mitem' + (i === 0 ? ' on' : ''));
      row.append(el('span', 'mlabel', it.label));
      if (it.hint) row.append(el('span', 'mhint', it.hint));
      row.addEventListener('mousedown', (e) => {
        e.preventDefault();
        choose(i);
      });
      menu.append(row);
    });
    menu.hidden = false;
  }

  function moveSel(d) {
    if (!picking || !picking.items.length) return;
    const rows = [...menu.children];
    rows[picking.sel]?.classList.remove('on');
    picking.sel = (picking.sel + d + rows.length) % rows.length;
    rows[picking.sel]?.classList.add('on');
    rows[picking.sel]?.scrollIntoView({ block: 'nearest' });
  }

  function choose(i) {
    if (!picking) return;
    const it = picking.items[i ?? picking.sel];
    if (!it) return;
    const v = input.value;
    input.value = v.slice(0, picking.start) + it.insert + ' ' + v.slice(picking.end);
    const caret = picking.start + it.insert.length + 1;
    closeMenu();
    input.focus();
    input.setSelectionRange(caret, caret);
    grow();
  }

  let filesTimer = 0;
  function refreshMenu() {
    const t = token();
    if (!t) {
      closeMenu();
      return;
    }
    picking = { kind: t.kind, start: t.start, end: t.end, items: [], sel: 0 };
    if (t.kind === '/') {
      const q = t.q.toLowerCase();
      paintMenu(
        commands
          .filter((c) => c.name.toLowerCase().includes(q))
          .slice(0, 40)
          .map((c) => ({ label: '/' + c.name, hint: c.description, insert: '/' + c.name }))
      );
      return;
    }
    clearTimeout(filesTimer);
    filesTimer = setTimeout(() => vscode.postMessage({ cmd: 'files', q: t.q }), 110);
  }

  function showFiles(items) {
    if (!picking || picking.kind !== '@') return;
    // il cursore puo' essersi mosso mentre l'estensione cercava
    const t = token();
    if (!t) {
      closeMenu();
      return;
    }
    picking.start = t.start;
    picking.end = t.end;
    paintMenu(items.map((p) => ({ label: p.split('/').pop(), hint: p, insert: '@' + p })));
  }

  // ---------- allegati: selezione dall'editor e immagini incollate ----------
  const attach = $('attach');
  let selection = null; // {file, lines}
  let useSelection = true;
  let images = [];

  function paintAttach() {
    attach.replaceChildren();
    if (selection && useSelection) {
      const chip = el('span', 'att');
      chip.append(icon('code-slash'), el('span', null, `${selection.file}:${selection.lines}`));
      const x = el('button', 'attx');
      x.type = 'button';
      x.title = 'Non allegare la selezione';
      x.append(icon('close'));
      x.addEventListener('click', () => {
        useSelection = false;
        paintAttach();
      });
      chip.append(x);
      attach.append(chip);
    }
    images.forEach((im, i) => {
      const chip = el('span', 'att');
      const thumb = document.createElement('img');
      thumb.className = 'thumb';
      thumb.src = `data:${im.mime};base64,${im.data}`;
      const x = el('button', 'attx');
      x.type = 'button';
      x.title = 'Togli';
      x.append(icon('close'));
      x.addEventListener('click', () => {
        images.splice(i, 1);
        paintAttach();
      });
      chip.append(thumb, x);
      attach.append(chip);
    });
    attach.hidden = !attach.childElementCount;
  }

  input.addEventListener('paste', (e) => {
    const list = [...(e.clipboardData?.items || [])].filter((i) => i.type.startsWith('image/'));
    if (!list.length) return;
    e.preventDefault();
    for (const it of list) {
      const file = it.getAsFile();
      if (!file) continue;
      const r = new FileReader();
      r.onload = () => {
        images.push({ mime: file.type, data: String(r.result).split(',')[1] || '' });
        paintAttach();
      };
      r.readAsDataURL(file);
    }
  });

  // ---------- invio ----------
  function grow() {
    input.style.height = 'auto';
    input.style.height = Math.min(190, input.scrollHeight) + 'px';
  }
  input.addEventListener('input', () => {
    grow();
    refreshMenu();
  });
  input.addEventListener('blur', closeMenu);

  input.addEventListener('keydown', (e) => {
    // col menu aperto le frecce e l'invio servono al menu, non al messaggio
    if (picking && !menu.hidden) {
      if (e.key === 'ArrowDown') return e.preventDefault(), moveSel(1);
      if (e.key === 'ArrowUp') return e.preventDefault(), moveSel(-1);
      if (e.key === 'Enter' || e.key === 'Tab') return e.preventDefault(), choose();
      if (e.key === 'Escape') return e.preventDefault(), closeMenu();
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      composer.requestSubmit();
    }
  });

  composer.addEventListener('submit', (e) => {
    e.preventDefault();
    if (busy) {
      vscode.postMessage({ cmd: 'interrupt' });
      return;
    }
    const text = input.value.trim();
    if (!text && !images.length) return;
    vscode.postMessage({
      cmd: 'send',
      text,
      images: images.length ? images : undefined,
      withSelection: !!(selection && useSelection),
    });
    input.value = '';
    images = [];
    // La selezione si allega una volta sola: resta selezionata nell'editor, ma non
    // deve infilarsi da sola anche nei messaggi dopo. Si riarma se la cambi.
    useSelection = false;
    paintAttach();
    closeMenu();
    grow();
    composer.classList.remove('sending');
    void composer.offsetWidth; // riavvia l'animazione anche a invii ravvicinati
    composer.classList.add('sending');
  });

  modeSel.addEventListener('change', () =>
    vscode.postMessage({ cmd: 'setMode', value: modeSel.value })
  );

  $('btnNew').addEventListener('click', () => vscode.postMessage({ cmd: 'newSession' }));
  $('btnTab').addEventListener('click', () => vscode.postMessage({ cmd: 'openTab' }));

  // ---------- la colonna del contesto (solo nella scheda) ----------
  // Nella barra laterale il contesto ha un pannello suo, sotto la chat; in una
  // scheda quel pannello non esiste, quindi lo stesso disegno si monta qui di
  // fianco. Il codice e' lo stesso, ctxpanel.js: due posti, un pannello solo.
  const rail = window.CtxPanel($('rail'), (m) => vscode.postMessage(m));

  function showRail(on) {
    document.body.classList.toggle('rail-on', on);
    $('btnCtx').classList.toggle('on', on);
    vscode.setState({ ...(vscode.getState() || {}), rail: on });
  }

  $('btnCtx').addEventListener('click', () =>
    showRail(!document.body.classList.contains('rail-on'))
  );

  showEmpty();
  setBusy(false);
  vscode.postMessage({ cmd: 'ready' });
})();
