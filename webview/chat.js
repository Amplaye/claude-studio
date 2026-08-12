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
  };

  /** Riga di riepilogo di un tool: il primo argomento che dice davvero qualcosa. */
  function toolArg(inp) {
    if (!inp || typeof inp !== 'object') return '';
    for (const k of ['command', 'file_path', 'path', 'pattern', 'query', 'url', 'prompt', 'description']) {
      const v = inp[k];
      if (typeof v === 'string' && v.trim()) return v.replace(/\s+/g, ' ').slice(0, 200);
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

  function add(node) {
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

  function textBlock(id) {
    let b = blocks.get(id);
    if (b) return b;
    const node = el('div', 'msg assistant');
    const caret = el('span', 'caret');
    node.appendChild(caret);
    b = { node, body: node, caret, kind: 'text', raw: '' };
    blocks.set(id, b);
    add(node);
    return b;
  }

  function thinkBlock(id) {
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
    add(node);
    return b;
  }

  function appendDelta(id, kind, text) {
    const b = kind === 'thinking' ? thinkBlock(id) : textBlock(id);
    b.raw += text;
    const chunk = el('span', 'chunk', text);
    b.body.insertBefore(chunk, b.caret);
    toBottom();
  }

  /* Il testo definitivo arriva col messaggio completo: si ridisegna il blocco una
     volta sola, con il markdown reso. Cosi' lo streaming resta grezzo e veloce e il
     risultato finale resta pulito. */
  function finalize(id, kind, text) {
    const b = kind === 'thinking' ? thinkBlock(id) : textBlock(id);
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
  function toolStart(id, name, inp) {
    const node = el('div', 'msg tool running');
    const head = el('div', 'head');
    const ic = icon(TOOL_ICONS[name] || 'flash', 'tool-ico');
    head.append(ic, el('span', 'name', name), el('span', 'arg', toolArg(inp)));
    node.append(head, el('div', 'tool-bar'));
    node._ico = ic;
    tools.set(id, node);
    add(node);
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
    const t = String(text || '').trim();
    if (t) node.appendChild(el('div', 'out', t.length > 4000 ? t.slice(0, 4000) + '\n…' : t));
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
        showEmpty();
        break;
      case 'reset':
        blocks.clear();
        tools.clear();
        waiting = null;
        showEmpty();
        break;
      case 'session':
        $('modelName').textContent = m.model || '—';
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
        m.kind === 'thinking' ? thinkBlock(m.id) : textBlock(m.id);
        break;
      case 'delta':
        hideWaiting();
        appendDelta(m.id, m.kind || 'text', m.text);
        break;
      case 'block_final':
        finalize(m.id, m.kind, m.text);
        break;
      case 'tool_start':
        hideWaiting();
        toolStart(m.id, m.name, m.input);
        break;
      case 'tool_end':
        toolEnd(m.id, m.ok, m.text);
        break;
      case 'turn_end':
        blocks.clear();
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

  // ---------- invio ----------
  function grow() {
    input.style.height = 'auto';
    input.style.height = Math.min(190, input.scrollHeight) + 'px';
  }
  input.addEventListener('input', grow);

  input.addEventListener('keydown', (e) => {
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
    if (!text) return;
    vscode.postMessage({ cmd: 'send', text });
    input.value = '';
    grow();
    composer.classList.remove('sending');
    void composer.offsetWidth; // riavvia l'animazione anche a invii ravvicinati
    composer.classList.add('sending');
  });

  $('btnNew').addEventListener('click', () => vscode.postMessage({ cmd: 'newSession' }));
  $('btnTab').addEventListener('click', () => vscode.postMessage({ cmd: 'openTab' }));

  showEmpty();
  setBusy(false);
  vscode.postMessage({ cmd: 'ready' });
})();
