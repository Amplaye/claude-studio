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
  const modeBox = $('mode');
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
  /** Le scorciatoie si imparano solo se stanno scritte dove guardi mentre aspetti. */
  const KEYS = [
    ['@', 'un file'],
    ['/', 'un comando'],
    ['Alt+N', 'nuova'],
    ['Alt+H', 'cronologia'],
    ['Esc', 'ferma'],
  ];

  function showEmpty() {
    log.replaceChildren();
    const box = el('div', 'empty');
    box.append(
      icon('chatbubble-ellipses'),
      el('h2', null, 'Pronti.'),
      el('p', null, 'Scrivi qui sotto: risponde la stessa Claude Code che usi da terminale, con i tuoi CLAUDE.md, skill, MCP e permessi.')
    );
    const keys = el('div', 'keys');
    for (const [k, what] of KEYS) {
      const item = el('span', 'key');
      item.append(el('kbd', null, k), el('span', null, what));
      keys.append(item);
    }
    box.append(keys);
    log.appendChild(box);
  }

  /**
   * Cambio conversazione: quella vecchia scorre via mentre la nuova entra.
   * I nodi non si copiano, si spostano dentro un fantasma sovrapposto al log e
   * tagliato alla stessa finestra che stavi guardando — cosi' se ne va proprio
   * quello che vedevi, non una ricostruzione.
   */
  function swapLog(paint) {
    const kids = [...log.children];
    if (!kids.length) {
      paint();
      return;
    }
    const col = document.querySelector('.chatcol');
    const box = log.getBoundingClientRect();
    const host = col.getBoundingClientRect();
    const ghost = el('div', 'log-ghost');
    ghost.style.top = box.top - host.top + 'px';
    ghost.style.left = box.left - host.left + 'px';
    ghost.style.width = box.width + 'px';
    ghost.style.height = box.height + 'px';
    // stesso foglio del log, cosi' i nodi spostati restano identici a com'erano
    const inner = el('div', 'log log-ghost-in');
    inner.style.transform = `translateY(${-log.scrollTop}px)`;
    inner.append(...kids);
    ghost.append(inner);
    col.appendChild(ghost);
    setTimeout(() => ghost.remove(), 420);

    log.replaceChildren();
    log.classList.remove('swap-in');
    void log.offsetWidth; // riparte anche su due cambi ravvicinati
    log.classList.add('swap-in');
    stick = true;
    paint();
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

  // ---------- errori ----------
  //
  // Dal motore arriva quello che arriva: a volte una frase, spesso un messaggio
  // scritto per chi legge i log. Qui si dice cos'e' successo e cosa si puo' fare,
  // e il testo originale resta sotto per chi lo vuole vedere.
  const ERRORS = [
    {
      re: /cli\.js|@anthropic-ai\/claude-code|non trovo la cli|command not found|ENOENT|spawn/i,
      title: 'Non trovo la CLI di Claude Code su questo computer.',
      hint: 'Installala con "npm i -g @anthropic-ai/claude-code", oppure indica il percorso di cli.js in Impostazioni → Claude Studio → Cli Path.',
      keep: false,
    },
    {
      re: /rate.?limit|\b429\b|too many requests|usage limit/i,
      title: 'Hai raggiunto il limite d’uso dell’account.',
      hint: 'Nel pannello del contesto c’è quanto manca al prossimo reset.',
    },
    {
      re: /\b401\b|\b403\b|unauthor|authentic|not logged in|invalid api key|oauth/i,
      title: 'Claude Code non è autenticato.',
      hint: 'Apri un terminale, lancia "claude" e rifai l’accesso: la chat usa la stessa autenticazione.',
    },
    {
      re: /credit|billing|insufficient|payment/i,
      title: 'L’account non ha credito per rispondere.',
      hint: 'Il pannello del contesto mostra quanto è stato speso finora.',
    },
    {
      re: /prompt is too long|context (window|length|limit)|too many tokens|exceeds? .{0,20}tokens/i,
      title: 'La conversazione ha riempito la finestra di contesto.',
      hint: 'Aprine una nuova (Alt+N) e riparti da un riassunto: qui non ci sta più niente.',
    },
    {
      re: /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|socket hang up|network|offline/i,
      title: 'La connessione si è interrotta.',
      hint: 'Controlla la rete e rimanda il messaggio: la conversazione non è andata persa.',
    },
    {
      re: /interrupt|interrott|abort|cancell?ed|annullat/i,
      title: 'Turno interrotto.',
      hint: 'Il prossimo messaggio riparte da qui.',
      calm: true,
    },
    {
      re: /exit(ed)? (with )?code|process (exited|terminated|died)|SIGTERM|SIGKILL|killed/i,
      title: 'Il processo di Claude si è chiuso da solo.',
      hint: 'Rimanda il messaggio: la sessione riparte in automatico.',
    },
  ];

  function readableError(raw) {
    const s = String(raw || '').trim() || 'Errore senza descrizione.';
    for (const e of ERRORS) {
      if (e.re.test(s)) return { title: e.title, hint: e.hint, calm: !!e.calm, raw: e.keep === false ? '' : s };
    }
    // Un messaggio gia' scritto per una persona si mostra com'e': riscriverlo
    // significherebbe nasconderlo.
    if (s.length <= 220 && !/\n|Error:|Exception|\bat .+:\d+|[{}]/.test(s)) {
      return { title: s, hint: '', calm: false, raw: '' };
    }
    return {
      title: 'Qualcosa è andato storto.',
      hint: 'Di solito basta rimandare il messaggio. Qui sotto c’è quello che ha detto il motore.',
      calm: false,
      raw: s,
    };
  }

  function errorCard(message) {
    const e = readableError(message);
    const node = el('div', 'msg err' + (e.calm ? ' calm' : ''));
    const body = el('div', 'err-body');
    body.append(el('div', 'err-title', e.title));
    if (e.hint) body.append(el('div', 'err-hint', e.hint));
    if (e.raw && e.raw !== e.title) {
      const det = document.createElement('details');
      det.className = 'err-raw';
      det.append(el('summary', null, 'Dettagli tecnici'), el('pre', null, e.raw.slice(0, 4000)));
      body.append(det);
    }
    node.append(icon(e.calm ? 'stop-circle' : 'alert-circle'), body);
    add(node);
  }

  // ---------- attesa ----------
  let waiting = null;
  function showWaiting() {
    if (waiting) return;
    waiting = el('div', 'msg pulse');
    // Due movimenti, non uno: l'alone che pulsa dice "sta lavorando", il gradiente
    // che gira dice "e' ancora vivo". Insieme sono l'attesa.
    const orb = el('span', 'orb');
    orb.append(el('span', 'thinking-ring'), el('span', 'dot thinking-halo'));
    waiting.append(orb, el('span', null, 'Claude sta pensando…'));
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

  $('btnHistory').addEventListener('click', () => toggleHistory());
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
    sendBtn.replaceChildren(icon(v ? 'stop-circle' : 'arrow-up'));
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
        // il discorso di prima esce scorrendo mentre quello nuovo prende posto
        swapLog(showEmpty);
        break;
      case 'mode':
        paintMode(m.value);
        break;
      case 'prefs':
        prefs = Object.assign({}, prefs, m.value || {});
        paintCfg();
        break;
      case 'models':
        models = m.items || [];
        paintCfg();
        break;
      // Chi decide se e' il momento di suonare e' l'estensione: e' l'unica a
      // sapere se la finestra e' davanti a te. Qui si suona e basta.
      case 'chime':
        if (window.Chime) window.Chime.play(m.sound, m.event, m.volume);
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
        // L'icona del modello nella testata e' stata rimossa:
        // il modello si sceglie nelle impostazioni.
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
      case 'error':
        errorCard(m.message);
        break;
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

  /** Raggruppa i comandi per categoria (la parte prima di ':' o 'Generale'). */
  function categorize(items) {
    const cats = new Map();
    for (const it of items) {
      const m = it.label.match(/^\/([^:]+):/);
      const cat = m ? m[1] : 'Generale';
      if (!cats.has(cat)) cats.set(cat, []);
      cats.get(cat).push(it);
    }
    return cats;
  }

  let cmdSearchInput = null;

  function paintMenu(items) {
    if (!picking) return;
    picking.items = items;
    picking.sel = 0;
    menu.replaceChildren();
    if (!items.length) {
      closeMenu();
      return;
    }
    const isCmd = picking.kind === '/';
    if (isCmd) {
      // Intestazione con barra di ricerca
      const head = el('div', 'menu-head');
      head.append(icon('terminal'), el('span', null, ' Comandi'));
      menu.append(head);

      const searchBox = el('div', 'menu-search');
      cmdSearchInput = document.createElement('input');
      cmdSearchInput.type = 'text';
      cmdSearchInput.placeholder = 'Cerca un comando…';
      searchBox.append(icon('search'), cmdSearchInput);
      menu.append(searchBox);

      // Griglia per categorie
      const grid = el('div', 'menu-grid');
      const cats = categorize(items);
      let idx = 0;
      for (const [cat, catItems] of cats) {
        if (cats.size > 1) grid.append(el('div', 'menu-cat', cat));
        for (const it of catItems) {
          const row = el('div', 'mitem mitem-cmd' + (idx === 0 ? ' on' : ''));
          row.dataset.idx = idx;
          row.append(el('span', 'mico', '/'));
          const info = el('span', 'minfo');
          info.append(el('span', 'mlabel', it.label));
          if (it.hint) info.append(el('span', 'mdesc', it.hint));
          row.append(info);
          const ci = idx;
          row.addEventListener('mousedown', (e) => {
            e.preventDefault();
            choose(ci);
          });
          grid.append(row);
          idx++;
        }
      }
      menu.append(grid);

      // Filtro in tempo reale nella barra di ricerca
      cmdSearchInput.addEventListener('input', () => {
        const q = cmdSearchInput.value.toLowerCase();
        let first = -1;
        for (const row of grid.querySelectorAll('.mitem-cmd')) {
          const label = row.querySelector('.mlabel')?.textContent?.toLowerCase() || '';
          const desc = row.querySelector('.mdesc')?.textContent?.toLowerCase() || '';
          const show = !q || label.includes(q) || desc.includes(q);
          row.hidden = !show;
          row.classList.remove('on');
          if (show && first < 0) first = Number(row.dataset.idx);
        }
        // Nascondi le categorie vuote
        for (const cat of grid.querySelectorAll('.menu-cat')) {
          let next = cat.nextElementSibling;
          let visible = false;
          while (next && !next.classList.contains('menu-cat')) {
            if (!next.hidden) visible = true;
            next = next.nextElementSibling;
          }
          cat.hidden = !visible;
        }
        if (first >= 0) {
          picking.sel = first;
          const r = grid.querySelector(`.mitem-cmd[data-idx="${first}"]`);
          if (r) r.classList.add('on');
        }
      });
      // Non perdere il focus dalla textarea — preventDefault sul mousedown basta
      cmdSearchInput.addEventListener('mousedown', (e) => e.stopPropagation());
      cmdSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); closeMenu(); input.focus(); }
        else if (e.key === 'Enter') { e.preventDefault(); choose(); input.focus(); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); moveSel(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); moveSel(-1); }
      });
    } else {
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
    }
    menu.hidden = false;
  }

  function moveSel(d) {
    if (!picking || !picking.items.length) return;
    const rows = [...menu.querySelectorAll('.mitem, .mitem-cmd')].filter((r) => !r.hidden);
    if (!rows.length) return;
    const cur = rows.findIndex((r) => r.classList.contains('on'));
    for (const r of rows) r.classList.remove('on');
    const next = (cur + d + rows.length) % rows.length;
    rows[next]?.classList.add('on');
    rows[next]?.scrollIntoView({ block: 'nearest' });
    if (rows[next]?.dataset.idx != null) picking.sel = Number(rows[next].dataset.idx);
    else picking.sel = next;
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

  // ---------- lightbox ----------
  function openLightbox(src) {
    const overlay = el('div', 'lightbox');
    const img = document.createElement('img');
    img.src = src;
    overlay.appendChild(img);
    overlay.addEventListener('click', () => overlay.remove());
    document.body.appendChild(overlay);
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
      // Clic sulla miniatura: apre l'immagine a tutto schermo
      thumb.addEventListener('click', (e) => {
        e.stopPropagation();
        openLightbox(`data:${im.mime};base64,${im.data}`);
      });
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
  /** L'ultimo messaggio mandato: la freccia in su lo ripesca. */
  let lastText = '';

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
      return;
    }
    // Freccia in su sul campo vuoto: torna l'ultimo messaggio mandato, da
    // ritoccare invece che da riscrivere.
    if (e.key === 'ArrowUp' && !input.value && lastText) {
      e.preventDefault();
      input.value = lastText;
      grow();
      input.setSelectionRange(lastText.length, lastText.length);
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
    lastText = text;
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

  // ---------- mode segmented control con slider ----------
  // Lo slider scorre da un bottone all'altro senza ricreare nulla.
  const modeSlider = el('div', 'modeseg-slider');
  modeBox.appendChild(modeSlider);

  function paintMode(value) {
    document.body.dataset.mode = value;
    for (const btn of modeBox.querySelectorAll('.modeseg-btn')) {
      btn.classList.toggle('on', btn.dataset.mode === value);
    }
    // Muovi lo slider sul bottone attivo
    const active = modeBox.querySelector('.modeseg-btn.on');
    if (active) {
      const boxRect = modeBox.getBoundingClientRect();
      const btnRect = active.getBoundingClientRect();
      modeSlider.style.left = (btnRect.left - boxRect.left) + 'px';
      modeSlider.style.width = btnRect.width + 'px';
    }
    // Colore dello slider
    modeSlider.className = 'modeseg-slider mode-' + value;
  }
  for (const btn of modeBox.querySelectorAll('.modeseg-btn')) {
    btn.addEventListener('click', () => {
      vscode.postMessage({ cmd: 'setMode', value: btn.dataset.mode });
      paintMode(btn.dataset.mode);
    });
  }

  $('btnNew').addEventListener('click', () => vscode.postMessage({ cmd: 'newTab' }));
  $('btnTab').addEventListener('click', () => vscode.postMessage({ cmd: 'openTab' }));

  // ---------- impostazioni: modello, pensiero, avvisi ----------
  //
  // Le scelte le tiene l'estensione (restano fra una finestra e l'altra): qui si
  // disegnano e si rimandano indietro un pezzo per volta. L'elenco dei modelli
  // arriva dalla CLI a sessione accesa, quindi finche' non c'e' resta la voce
  // "predefinito" — che e' anche la scelta giusta per la maggior parte dei casi.
  const cfg = $('cfg');
  const btnCfg = $('btnCfg');
  let prefs = {
    model: '',
    effort: '',
    thinking: 'auto',
    sound: 'cozy',
    volume: 0.6,
    onlyWhenAway: false,
    soundOnAsk: true,
    toast: true,
  };
  let models = [];

  // Ogni livello di impegno ha un nome e una spiegazione semplice.
  const EFFORT_INFO = {
    '':     { label: 'Auto',          desc: 'Claude decide quanto impegnarsi in base alla domanda' },
    low:    { label: 'Veloce',        desc: 'Risponde subito — buono per domande semplici' },
    medium: { label: 'Equilibrato',   desc: 'Il giusto mix tra velocita\u0300 e precisione' },
    high:   { label: 'Approfondito',  desc: 'Si prende il tempo per fare le cose per bene' },
    xhigh:  { label: 'Molto approfondito', desc: 'Analizza tutto a fondo prima di agire' },
    max:    { label: 'Massimo',       desc: 'Non si risparmia niente, la massima qualita\u0300' },
  };
  const THINK_INFO = {
    auto: { label: 'Auto',   desc: 'Claude decide quando ragionare a fondo' },
    on:   { label: 'Acceso', desc: 'Ragiona passo passo prima di ogni risposta' },
    off:  { label: 'Spento', desc: 'Risponde direttamente, senza ragionamento intermedio' },
  };

  // -- model cards: 3 quadrati (Haiku, Opus al centro, Sonnet) --
  // L'ordine e' fisso: prima il veloce, al centro il migliore, poi il bilanciato.
  const MODEL_CATALOG = [
    { key: 'haiku',  label: 'Haiku',  desc: 'Veloce', icon: 'flash' },
    { key: 'opus',   label: 'Opus',   desc: 'Il migliore', icon: 'diamond' },
    { key: 'sonnet', label: 'Sonnet', desc: 'Bilanciato', icon: 'pulse' },
  ];

  function findModelValue(catalog, models) {
    // Cerca il modello dalla CLI che corrisponde alla chiave del catalogo
    for (const m of models) {
      if (m.value.toLowerCase().includes(catalog.key)) return m.value;
    }
    return null;
  }

  function paintModels() {
    const list = $('cfgModelList');
    list.replaceChildren();

    if (!models.length) {
      // Prima che la CLI mandi la lista, mostra i 3 modelli con chiave vuota
      for (const cat of MODEL_CATALOG) {
        const cls = 'model-card' + (cat.premium ? ' premium' : '') + (!prefs.model ? '' : '');
        const card = el('button', cls);
        card.type = 'button';
        const info = el('span', 'mc-info');
        info.append(el('span', 'mc-name', cat.label));
        info.append(el('span', 'mc-desc', cat.desc));
        if (cat.premium) info.append(el('span', 'mc-badge', 'Premium'));
        card.append(info);
        card.style.opacity = '0.5';
        card.style.cursor = 'default';
        list.append(card);
      }
      list.append(el('p', 'phint', 'I modelli appariranno dopo il primo messaggio'));
      return;
    }

    for (const cat of MODEL_CATALOG) {
      const value = findModelValue(cat, models);
      if (!value) continue;
      const isOn = prefs.model === value;
      const cls = 'model-card' + (cat.premium ? ' premium' : '') + (isOn ? ' on' : '');
      const card = el('button', cls);
      card.type = 'button';
      const info = el('span', 'mc-info');
      info.append(el('span', 'mc-name', cat.label));
      info.append(el('span', 'mc-desc', cat.desc));
      if (cat.premium) info.append(el('span', 'mc-badge', 'Premium'));
      card.append(info);
      card.addEventListener('click', () => push({ model: value }));
      list.append(card);
    }
  }

  // -- segmented control generico con slider --
  function paintSeg(container, items, value, onChange) {
    // Conserva o crea lo slider
    let slider = container.querySelector('.seg-slider');
    container.replaceChildren();
    if (!slider) {
      slider = el('div', 'seg-slider');
    }
    container.appendChild(slider);

    for (const it of items) {
      const btn = el('button', 'seg-btn' + (it.value === value ? ' on' : ''));
      btn.type = 'button';
      btn.textContent = it.label;
      if (it.disabled) btn.disabled = true;
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        onChange(it.value);
      });
      container.append(btn);
    }

    // Posiziona lo slider dopo un frame per avere le dimensioni giuste
    requestAnimationFrame(() => {
      const active = container.querySelector('.seg-btn.on');
      if (active) {
        const boxRect = container.getBoundingClientRect();
        const btnRect = active.getBoundingClientRect();
        slider.style.left = (btnRect.left - boxRect.left) + 'px';
        slider.style.width = btnRect.width + 'px';
        slider.style.display = '';
      } else {
        slider.style.display = 'none';
      }
    });
  }

  function paintEffort() {
    const chosen = models.find((m) => m.value === prefs.model);
    const levels = chosen ? chosen.efforts : ['low', 'medium', 'high'];
    const noEffort = !!chosen && !chosen.efforts.length;
    const items = [{ value: '', label: 'Auto', disabled: noEffort }].concat(
      levels.map((l) => ({
        value: l,
        label: (EFFORT_INFO[l] || {}).label || l,
        disabled: noEffort,
      }))
    );
    paintSeg($('cfgEffort'), items, prefs.effort, (v) => push({ effort: v }));
    const info = EFFORT_INFO[prefs.effort] || EFFORT_INFO[''];
    $('cfgEffortHint').textContent = noEffort
      ? 'Questo modello non accetta livelli di impegno'
      : info.desc;
  }

  function paintThinking() {
    const items = Object.entries(THINK_INFO).map(([v, i]) => ({ value: v, label: i.label }));
    paintSeg($('cfgThink'), items, prefs.thinking, (v) => push({ thinking: v }));
    $('cfgThinkHint').textContent = (THINK_INFO[prefs.thinking] || {}).desc || '';
  }

  function paintCfg() {
    paintModels();
    paintEffort();
    paintThinking();
    $('cfgSound').value = prefs.sound;
    $('cfgVol').value = Math.round((prefs.volume == null ? 0.6 : prefs.volume) * 100);
    $('cfgVol').disabled = prefs.sound === 'off';
    $('cfgAway').checked = !!prefs.onlyWhenAway;
    $('cfgAsk').checked = !!prefs.soundOnAsk;
    $('cfgToast').checked = !!prefs.toast;
  }

  /** Si manda solo quello che hai cambiato: il resto lo sa gia' l'estensione. */
  function push(patch) {
    prefs = Object.assign({}, prefs, patch);
    vscode.postMessage({ cmd: 'setPrefs', value: patch });
    paintCfg();
  }

  /** Il suono si prova subito: sceglierlo alla cieca non ha senso. */
  function previewSound() {
    if (window.Chime) window.Chime.play(prefs.sound, 'done', prefs.volume);
  }

  function toggleCfg(on) {
    const show = on == null ? cfg.hidden : on;
    if (show) {
      cfg.hidden = false;
      cfg.classList.remove('closing');
      btnCfg.classList.add('on');
      if (window.Chime) window.Chime.unlock();
    } else {
      // Animazione di chiusura: il pannello scivola via, poi si nasconde.
      cfg.classList.add('closing');
      btnCfg.classList.remove('on');
      const done = () => {
        cfg.hidden = true;
        cfg.classList.remove('closing');
        cfg.removeEventListener('animationend', done);
      };
      cfg.addEventListener('animationend', done);
    }
  }

  btnCfg.addEventListener('click', () => toggleCfg());
  $('cfgClose').addEventListener('click', () => toggleCfg(false));
  document.addEventListener('mousedown', (e) => {
    if (cfg.hidden || cfg.contains(e.target) || btnCfg.contains(e.target)) return;
    toggleCfg(false);
  });

  $('cfgSound').addEventListener('change', (e) => {
    push({ sound: e.target.value });
    previewSound();
  });
  // mentre trascini cambia solo il volume di prova; si mette da parte quando molli
  $('cfgVol').addEventListener('input', (e) => (prefs.volume = Number(e.target.value) / 100));
  $('cfgVol').addEventListener('change', (e) => {
    push({ volume: Number(e.target.value) / 100 });
    previewSound();
  });
  $('cfgAway').addEventListener('change', (e) => push({ onlyWhenAway: e.target.checked }));
  $('cfgAsk').addEventListener('change', (e) => push({ soundOnAsk: e.target.checked }));
  $('cfgToast').addEventListener('change', (e) => push({ toast: e.target.checked }));
  $('cfgTest').addEventListener('click', previewSound);

  // Il primo gesto sulla pagina sblocca l'audio: da li' in poi l'avviso di fine
  // lavoro puo' suonare anche con la finestra dietro a tutte le altre.
  const wake = () => window.Chime && window.Chime.unlock();
  document.addEventListener('pointerdown', wake, { once: true });
  document.addEventListener('keydown', wake, { once: true });

  // ---------- scorciatoie ----------
  //
  // Valgono ovunque nella pagina, anche mentre scrivi: sono le stesse cose che
  // fanno i tasti in testata, senza staccare le mani dalla tastiera. Chi le ha
  // gia' gestite (il menu di "@" e "/") lascia il segno con preventDefault, e qui
  // non ci si mette sopra.
  function toggleHistory() {
    if (!drawer.hidden) {
      drawer.hidden = true;
      return;
    }
    vscode.postMessage({ cmd: 'history' });
  }

  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.isComposing) return;

    if (e.key === 'Escape') {
      if (!cfg.hidden) {
        e.preventDefault();
        toggleCfg(false);
        return;
      }
      if (!drawer.hidden) {
        e.preventDefault();
        drawer.hidden = true;
        return;
      }
      // Ferma solo se c'e' davvero qualcosa da fermare: altrimenti Escape resta
      // il tasto che non fa niente, ed e' giusto cosi'.
      if (busy) {
        e.preventDefault();
        vscode.postMessage({ cmd: 'interrupt' });
      }
      return;
    }

    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    switch ((e.key || '').toLowerCase()) {
      case 'n':
        e.preventDefault();
        vscode.postMessage({ cmd: 'newSession' });
        return;
      case 'h':
        e.preventDefault();
        toggleHistory();
        return;
      case 'i':
        e.preventDefault();
        toggleCfg();
        return;
      case 'm': {
        e.preventDefault();
        const modes = ['default', 'plan', 'bypassPermissions'];
        const cur = document.body.dataset.mode || 'default';
        const next = modes[(modes.indexOf(cur) + 1) % modes.length];
        vscode.postMessage({ cmd: 'setMode', value: next });
        paintMode(next);
        return;
      }
      case 'c':
        // il contesto di fianco esiste solo nella scheda: dove non c'e', il tasto
        // non deve fare finta di esserci
        if ($('btnCtx').hidden) return;
        e.preventDefault();
        $('btnCtx').click();
        return;
    }
  });

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
  paintMode('default');
  paintCfg();
  // Lo slider del mode si posiziona dopo il primo render
  requestAnimationFrame(() => paintMode(document.body.dataset.mode || 'default'));
  vscode.postMessage({ cmd: 'ready' });
})();
