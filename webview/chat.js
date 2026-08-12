/* Claude Studio — chat.
   House rule: no innerHTML with data. Everything goes through textContent or nodes
   built by hand, same as in the context-bar. */
(() => {
  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);
  const log = $('log');
  const input = $('input');
  const composer = $('composer');
  const sendBtn = $('send');
  const modeBox = $('mode');
  const SVG = 'http://www.w3.org/2000/svg';

  // ---------- DOM helpers ----------
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

  /** The checkmark is a real path (not a <use>): that way it can draw itself. */
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

  /** Tools that show a diff: the "before" comes from the tool's data, not from disk. */
  const DIFF_TOOLS = { Write: 1, Edit: 1, NotebookEdit: 1 };
  /** Tools that already speak for themselves: on success there's nothing to add. */
  const QUIET = { Write: 1, Edit: 1, NotebookEdit: 1, TodoWrite: 1 };

  let cwd = '';
  /** Absolute paths fill the line without saying anything: keep the useful part. */
  function shortPath(p) {
    const s = String(p || '');
    if (cwd && s.toLowerCase().startsWith(cwd.toLowerCase())) {
      return s.slice(cwd.length).replace(/^[\\/]+/, '') || s;
    }
    return s;
  }

  /** A tool's summary line: the first argument that actually says something. */
  function toolArg(inp, name) {
    if (!inp || typeof inp !== 'object') return '';
    // The whole todo list shows up below: up top the JSON would just be noise.
    if (name === 'TodoWrite') {
      const n = (inp.todos || []).length;
      return n === 1 ? '1 item' : n + ' items';
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

  // Infinite loops stop when off screen: twenty halos pulsing where you aren't
  // looking heat up the laptop for nothing.
  const seen = new IntersectionObserver(
    (entries) => {
      for (const e of entries) e.target.classList.toggle('offscreen', !e.isIntersecting);
    },
    { root: log, rootMargin: '160px' }
  );

  /** If the piece comes from a sub-agent it goes inside the card of the Task that
      launched it; otherwise at the bottom of the conversation. */
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

  // ---------- empty state ----------
  /** Shortcuts only get learned if they're written where you look while waiting. */
  const KEYS = [
    ['@', 'a file'],
    ['/', 'a command'],
    ['Alt+N', 'new'],
    ['Alt+H', 'history'],
    ['Esc', 'stop'],
  ];

  function showEmpty() {
    log.replaceChildren();
    const box = el('div', 'empty');
    box.append(
      icon('chatbubble-ellipses'),
      el('h2', null, 'Ready.'),
      el('p', null, 'Write below: you get the same Claude Code you use from the terminal, with your CLAUDE.md, skills, MCP and permissions.')
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
   * Switching conversation: the old one slides away while the new one comes in.
   * The nodes aren't copied, they're moved into a ghost laid over the log and
   * clipped to the same window you were looking at — so what leaves is exactly
   * what you were seeing, not a reconstruction.
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
    // same stylesheet as the log, so the moved nodes stay identical to how they were
    const inner = el('div', 'log log-ghost-in');
    inner.style.transform = `translateY(${-log.scrollTop}px)`;
    inner.append(...kids);
    ghost.append(inner);
    col.appendChild(ghost);
    setTimeout(() => ghost.remove(), 420);

    log.replaceChildren();
    log.classList.remove('swap-in');
    void log.offsetWidth; // restarts even on two changes back to back
    log.classList.add('swap-in');
    stick = true;
    paint();
  }

  // ---------- blocks ----------
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
    sum.append(icon('bulb'), el('span', null, 'Reasoning'));
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

  /* The final text arrives with the complete message: the block gets redrawn just
     once, with the markdown rendered. That way streaming stays raw and fast and the
     end result stays clean. */
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

  /** Minimal, safe markdown: ``` blocks and `code`. No innerHTML. */
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

  /** A line-by-line diff. The "before" comes from the tool's data, never re-read from
      disk: re-reading it would mean racing against the write that's happening. */
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
    if (!rows.length) return null; // nothing to show: better no box than an empty one

    const MAX = 60;
    for (const [sign, text] of rows.slice(0, MAX)) {
      const row = el('div', 'row ' + (sign === '+' ? 'add' : 'del'));
      row.append(el('span', 'sign', sign), el('span', 'code', text || ' '));
      box.append(row);
    }
    if (rows.length > MAX) box.append(el('div', 'more', `… ${rows.length - MAX} more lines`));
    if (inp.replace_all) box.append(el('div', 'more', 'all occurrences replaced'));
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
    // If the tool touches a file, the path is a link: one click opens it in the
    // editor, where you actually need to look at it.
    const file = i.file_path || i.path;
    const arg = el(typeof file === 'string' ? 'button' : 'span', 'arg', toolArg(inp, name));
    if (typeof file === 'string') {
      arg.type = 'button';
      arg.classList.add('link');
      arg.title = 'Open in the editor';
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
    // If you're the one opening or closing the card, the result stops meddling with it.
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

    // "File updated successfully" under a diff you can already see is noise:
    // for these tools the result only shows up when something goes wrong.
    const t = ok && QUIET[node.dataset.tool] ? '' : String(text || '').trim();
    if (t) {
      const lines = t.split('\n');
      const out = el('div', 'out', lines.length > 400 ? lines.slice(0, 400).join('\n') + '\n…' : t);
      // In cards that already have something to show (diff, todo, sub-agent)
      // the result is a note at the bottom, not the main content.
      if (node._kids) node._body.append(el('div', 'sub-result', t.slice(0, 2000)));
      else node._body.append(out);
      if (!node._touched && !node.open) node.open = lines.length <= 12;
      const n = node.querySelector('.count');
      if (n) n.remove();
      if (lines.length > 12) {
        node.querySelector('.head').insertBefore(
          el('span', 'count', lines.length + ' lines'),
          node.querySelector('.chev')
        );
      }
    } else if (!node._touched && !node._kids && !node.open) {
      node.classList.add('bare'); // nothing to open: drop the arrow
    }
    toBottom();
  }

  // ---------- permissions ----------
  const asks = new Map(); // id -> the card's node

  function button(cls, iconName, text) {
    const b = el('button', 'btn ' + cls);
    b.type = 'button';
    b.append(icon(iconName), el('span', null, text));
    return b;
  }

  /** Multiple-choice questions: one answer per question, then you send. */
  function questionBody(node, m, send) {
    const answers = {};
    const box = el('div', 'qs');
    const go = button('ok', 'send', 'Send');
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
    head.append(icon(ic, 'perm-ico'), el('span', 'title', m.title || 'Your permission is needed'));
    node.append(head);

    const acts = el('div', 'acts');
    const answered = (choice, answers) => {
      if (node.classList.contains('resolved')) return;
      vscode.postMessage({ cmd: 'answer', id: m.id, choice, answers });
      // No waiting on the extension: whoever clicked sees the button go dead right away.
      for (const b of node.querySelectorAll('button')) b.disabled = true;
    };

    if (m.kind === 'plan') {
      const body = el('div', 'plan');
      body.replaceChildren(...markdown(m.plan || m.detail || ''));
      node.append(body);
      const ok = button('ok', 'checkmark', 'Approve and run');
      const auto = button('always', 'flash', "Approve, don't ask about edits");
      const no = button('no', 'close', 'Keep planning');
      ok.addEventListener('click', () => answered('allow'));
      auto.addEventListener('click', () => answered('always'));
      no.addEventListener('click', () => answered('deny'));
      acts.append(ok, auto, no);
    } else if (m.kind === 'question' && m.questions && m.questions.length) {
      const [go] = questionBody(node, m, answered);
      acts.append(go);
    } else {
      if (m.detail) node.append(el('div', 'detail', m.detail));
      const ok = button('ok', 'checkmark', 'Allow');
      ok.addEventListener('click', () => answered('allow'));
      acts.append(ok);
      if (m.canAlways) {
        const always = button('always', 'checkmark-circle', 'Always allow');
        // This isn't a "just this once" promise: the rule stays written on disk.
        always.title = "The rule stays written in the project's permissions (.claude/settings.local.json).";
        always.addEventListener('click', () => answered('always'));
        acts.append(always);
      }
      const no = button('no', 'close', 'Deny');
      no.addEventListener('click', () => answered('deny'));
      acts.append(no);
    }

    node.append(acts);
    asks.set(m.id, node);
    stick = true; // a permission request must not get lost off screen
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

  // ---------- errors ----------
  //
  // Whatever the engine sends is what you get: sometimes a sentence, often a message
  // written for whoever reads the logs. Here we say what happened and what you can do
  // about it, and the original text stays below for anyone who wants to see it.
  const ERRORS = [
    {
      re: /cli\.js|@anthropic-ai\/claude-code|non trovo la cli|command not found|ENOENT|spawn/i,
      title: "Can't find the Claude Code CLI on this computer.",
      hint: 'Install it with "npm i -g @anthropic-ai/claude-code", or point to the path of cli.js in Settings → Claude Studio → Cli Path.',
      keep: false,
    },
    {
      re: /rate.?limit|\b429\b|too many requests|usage limit/i,
      title: "You've hit the account's usage limit.",
      hint: 'The context panel shows how long until the next reset.',
    },
    {
      re: /\b401\b|\b403\b|unauthor|authentic|not logged in|invalid api key|oauth/i,
      title: 'Claude Code is not authenticated.',
      hint: 'Open a terminal, run "claude" and sign in again: the chat uses the same authentication.',
    },
    {
      re: /credit|billing|insufficient|payment/i,
      title: "The account doesn't have the credit to answer.",
      hint: 'The context panel shows how much has been spent so far.',
    },
    {
      re: /prompt is too long|context (window|length|limit)|too many tokens|exceeds? .{0,20}tokens/i,
      title: 'The conversation has filled up the context window.',
      hint: "Open a new one (Alt+N) and start again from a summary: nothing else fits in here.",
    },
    {
      re: /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|socket hang up|network|offline/i,
      title: 'The connection dropped.',
      hint: "Check the network and send the message again: the conversation wasn't lost.",
    },
    {
      re: /interrupt|interrott|abort|cancell?ed|annullat/i,
      title: 'Turn interrupted.',
      hint: 'The next message picks up from here.',
      calm: true,
    },
    {
      re: /exit(ed)? (with )?code|process (exited|terminated|died)|SIGTERM|SIGKILL|killed/i,
      title: 'The Claude process shut itself down.',
      hint: 'Send the message again: the session restarts automatically.',
    },
  ];

  function readableError(raw) {
    const s = String(raw || '').trim() || 'Error with no description.';
    for (const e of ERRORS) {
      if (e.re.test(s)) return { title: e.title, hint: e.hint, calm: !!e.calm, raw: e.keep === false ? '' : s };
    }
    // A message already written for a person gets shown as it is: rewriting it
    // would mean hiding it.
    if (s.length <= 220 && !/\n|Error:|Exception|\bat .+:\d+|[{}]/.test(s)) {
      return { title: s, hint: '', calm: false, raw: '' };
    }
    return {
      title: 'Something went wrong.',
      hint: 'Usually sending the message again is enough. Below is what the engine said.',
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
      det.append(el('summary', null, 'Technical details'), el('pre', null, e.raw.slice(0, 4000)));
      body.append(det);
    }
    node.append(icon(e.calm ? 'stop-circle' : 'alert-circle'), body);
    add(node);
  }

  // ---------- waiting ----------
  let waiting = null;
  function showWaiting() {
    if (waiting) return;
    waiting = el('div', 'msg pulse');
    // Two movements, not one: the pulsing halo says "it's working", the spinning
    // gradient says "it's still alive". Together they are the wait.
    const orb = el('span', 'orb');
    orb.append(el('span', 'thinking-ring'), el('span', 'dot thinking-halo'));
    waiting.append(orb, el('span', null, 'Claude is thinking…'));
    add(waiting);
  }
  function hideWaiting() {
    if (!waiting) return;
    waiting.remove();
    waiting = null;
  }

  // ---------- history ----------
  const drawer = $('drawer');

  function fmtAgo(ms) {
    const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 90) return 'just now';
    const m = Math.round(s / 60);
    if (m < 60) return m + ' min ago';
    const h = Math.round(m / 60);
    if (h < 24) return h === 1 ? 'an hour ago' : h + ' hours ago';
    const g = Math.round(h / 24);
    return g === 1 ? 'yesterday' : g + ' days ago';
  }

  function showHistory(items) {
    const list = $('drawerList');
    list.replaceChildren();
    if (!items.length) {
      list.append(el('div', 'drawer-empty', 'No saved conversations for this project.'));
    }
    for (const it of items) {
      const row = el('div', 'hrow card-hover');
      const open = el('button', 'hopen');
      open.type = 'button';
      open.append(el('span', 'hsummary', it.summary), el('span', 'hwhen', fmtAgo(it.when)));
      open.addEventListener('click', () => {
        vscode.postMessage({ cmd: 'open', id: it.id });
        closeDrawer();
      });
      row.append(open);
      list.append(row);
    }
    drawer.hidden = false;
  }

  /**
   * Hide after the exit animation — but not only after that: if the system has
   * animations turned off, `animationend` never arrives and the panel would sit
   * there open forever. The safety net is a timer a little longer than the
   * animation.
   */
  function hideAfterClosing(node, ms) {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      node.hidden = true;
      node.classList.remove('closing');
      node.removeEventListener('animationend', finish);
    };
    node.classList.add('closing');
    node.addEventListener('animationend', finish);
    setTimeout(finish, ms || 320);
  }

  function closeDrawer() {
    if (drawer.hidden) return;
    hideAfterClosing(drawer);
  }

  $('btnHistory').addEventListener('click', () => toggleHistory());
  $('drawerClose').addEventListener('click', closeDrawer);

  // ---------- what it cost ----------
  // The cost adds up turn by turn; the tokens are the ones from the last turn, that
  // is, how much context the conversation is carrying right now.
  let spent = { usd: 0, tokens: 0 };
  const fmtTokens = (n) =>
    n >= 1000000 ? (n / 1000000).toFixed(1) + 'M' : n >= 1000 ? Math.round(n / 1000) + 'k' : String(n);

  function paintSpent() {
    // The usage chip was taken out of the header: what you spend is read in the
    // context panel. As long as it isn't there we touch nothing — without this
    // check the function blew up at every end of turn, and took the rest of the
    // message down with it.
    const chip = $('spend');
    if (!chip) return;
    if (!spent.tokens && !spent.usd) {
      chip.hidden = true;
      return;
    }
    chip.hidden = false;
    $('spendTokens').textContent = fmtTokens(spent.tokens);
    $('spendCost').textContent = '$' + spent.usd.toFixed(spent.usd < 1 ? 3 : 2);
  }

  /** Futuristic arrow: the tip of Ionicons' "navigate", jet-like. */
  function sendArrow() {
    return icon('navigate', 'send-arrow');
  }

  // ---------- busy ----------
  let busy = false;
  function setBusy(v) {
    busy = v;
    sendBtn.classList.toggle('stop', v);
    sendBtn.title = v ? 'Stop' : 'Send';
    sendBtn.replaceChildren(v ? icon('stop-circle') : sendArrow());
    if (v) showWaiting();
    else hideWaiting();
  }

  // ---------- messages from the extension ----------
  window.addEventListener('message', (ev) => {
    const m = ev.data;
    if (!m || !m.k) return;
    switch (m.k) {
      case 'hello':
        // In a tab the text column stays narrow: lines two metres long don't get
        // read. The "open as tab" button disappears when you're already there.
        document.body.classList.toggle('wide', m.surface === 'panel');
        $('btnTab').hidden = m.surface === 'panel';
        // The context alongside only makes sense where there's room: in the tab.
        $('btnCtx').hidden = m.surface !== 'panel';
        // And a tab can be closed; the sidebar can't.
        $('btnClose').hidden = m.surface !== 'panel';
        if (m.surface === 'panel') showRail((vscode.getState() || {}).rail !== false);
        cwd = m.cwd || '';
        spent = { usd: 0, tokens: 0 };
        paintSpent();
        showEmpty();
        // Opening animation: the tab comes in whole, while the side panel
        // (which is always there) sticks to its own conversation.
        if (m.surface === 'panel') playTabIn();
        log.classList.remove('fresh-open');
        void log.offsetWidth;
        log.classList.add('fresh-open');
        break;
      case 'reset':
        blocks.clear();
        tools.clear();
        asks.clear();
        waiting = null;
        spent = { usd: 0, tokens: 0 };
        paintSpent();
        // the previous conversation scrolls out while the new one takes its place
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
      // The extension decides whether it's time to play a sound: it's the only one
      // that knows if the window is in front of you. Here we just play it.
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
        // every new selection starts out attached: that's what you'd expect
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
        // The model icon in the header was removed:
        // the model gets picked in the settings.
        break;
      case 'user': {
        const n = el('div', 'msg user');
        if (m.text) n.append(el('div', 'utext', m.text));
        // The attached images stay down here: they're the proof that they went out,
        // and one click opens them big again, just like before sending.
        if (m.images && m.images.length) {
          const box = el('div', 'uimgs');
          for (const im of m.images) {
            const src = `data:${im.mime};base64,${im.data}`;
            const t = document.createElement('img');
            t.className = 'uimg';
            t.src = src;
            t.alt = 'Attached image';
            t.addEventListener('click', () => openLightbox(src));
            box.append(t);
          }
          n.append(box);
        }
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

  // ---------- the "@" and "/" menu ----------
  const menu = $('menu');
  let commands = [];
  let picking = null; // {kind:'@'|'/', start, end, items, sel}

  /** The piece of word under the caret, if it starts with @ or with /. */
  function token() {
    const pos = input.selectionStart;
    const before = input.value.slice(0, pos);
    const m = before.match(/(^|\s)([@/])([^\s]*)$/);
    if (!m) return null;
    // the slash only counts as the first character: "10/20" isn't a command
    if (m[2] === '/' && before.length !== m[3].length + 1) return null;
    return { kind: m[2], q: m[3], start: pos - m[3].length - 1, end: pos };
  }

  function closeMenu() {
    picking = null;
    menu.hidden = true;
    menu.replaceChildren();
  }

  /** Groups the commands by category (the part before ':' or 'General'). */
  function categorize(items) {
    const cats = new Map();
    for (const it of items) {
      const m = it.label.match(/^\/([^:]+):/);
      const cat = m ? m[1] : 'General';
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
      // Header with search bar
      const head = el('div', 'menu-head');
      head.append(icon('terminal'), el('span', null, ' Commands'));
      menu.append(head);

      const searchBox = el('div', 'menu-search');
      cmdSearchInput = document.createElement('input');
      cmdSearchInput.type = 'text';
      cmdSearchInput.placeholder = 'Search for a command…';
      searchBox.append(icon('search'), cmdSearchInput);
      menu.append(searchBox);

      // Grid by category
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

      // Live filtering from the search bar
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
        // Hide the empty categories
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
      // Don't lose focus from the textarea — preventDefault on mousedown is enough
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
      if (!commands.length) {
        // Without an active session there are no commands: show a message
        menu.replaceChildren();
        const hint = el('div', 'menu-head');
        hint.append(icon('terminal'), el('span', null, ' Send a message to load the commands'));
        menu.append(hint);
        menu.hidden = false;
        return;
      }
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
    // the caret may have moved while the extension was searching
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

    // The X at the top right: clicking the backdrop already closes it, but without a
    // visible button nobody knows that. Esc does the same thing.
    const x = el('button', 'lbx');
    x.type = 'button';
    x.title = 'Close (Esc)';
    x.setAttribute('aria-label', 'Close');
    x.append(icon('close'));
    overlay.appendChild(x);

    const close = () => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
    };
    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    }
    x.addEventListener('click', (e) => {
      e.stopPropagation();
      close();
    });
    // Clicking the image doesn't close it: sometimes you just want to look at it
    img.addEventListener('click', (e) => e.stopPropagation());
    overlay.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
  }

  // ---------- attachments: editor selection and pasted images ----------
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
      x.title = "Don't attach the selection";
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
      // Click on the thumbnail: opens the image full screen
      thumb.addEventListener('click', (e) => {
        e.stopPropagation();
        openLightbox(`data:${im.mime};base64,${im.data}`);
      });
      const x = el('button', 'attx');
      x.type = 'button';
      x.title = 'Remove';
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

  // ---------- sending ----------
  /** The last message sent: the up arrow fishes it back out. */
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
    // with the menu open the arrows and Enter belong to the menu, not to the message
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
    // Up arrow on an empty field: the last message sent comes back, to touch up
    // instead of rewriting from scratch.
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
    // The selection gets attached only once: it stays selected in the editor, but it
    // shouldn't sneak into the messages after it too. It re-arms if you change it.
    useSelection = false;
    paintAttach();
    closeMenu();
    grow();
    composer.classList.remove('sending');
    void composer.offsetWidth; // restarts the animation even on back-to-back sends
    composer.classList.add('sending');
  });

  // ---------- mode segmented control with slider ----------
  // The slider glides from one button to the next without recreating anything.
  const modeSlider = el('div', 'modeseg-slider');
  modeBox.appendChild(modeSlider);

  function paintMode(value) {
    document.body.dataset.mode = value;
    for (const btn of modeBox.querySelectorAll('.modeseg-btn')) {
      btn.classList.toggle('on', btn.dataset.mode === value);
    }
    // Move the slider onto the active button
    const active = modeBox.querySelector('.modeseg-btn.on');
    if (active) {
      const boxRect = modeBox.getBoundingClientRect();
      const btnRect = active.getBoundingClientRect();
      modeSlider.style.left = (btnRect.left - boxRect.left) + 'px';
      modeSlider.style.width = btnRect.width + 'px';
    }
    // Slider colour
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

  // ---------- opening and closing the tab ----------
  //
  // The tab strip at the top is drawn by VS Code and it won't let us touch it; what's
  // inside, though, is ours. On opening the page comes in, on closing it goes out and
  // only then does it really close — so the gesture has a beginning and an end
  // instead of being a flicker.
  const shell = document.querySelector('.shell');

  function playTabIn() {
    if (!shell) return;
    shell.classList.add('tab-in');
    shell.addEventListener('animationend', () => shell.classList.remove('tab-in'), { once: true });
  }

  function closeTab() {
    const bye = () => vscode.postMessage({ cmd: 'closeTab' });
    if (!shell) return bye();
    shell.classList.add('tab-out');
    // If the animation doesn't start (reduced motion, page hidden) the button has to
    // close it anyway: the safety net is the timer.
    let done = false;
    const fire = () => {
      if (done) return;
      done = true;
      bye();
    };
    shell.addEventListener('animationend', fire, { once: true });
    setTimeout(fire, 320);
  }

  $('btnClose').addEventListener('click', closeTab);

  // ---------- settings: model, thinking, alerts ----------
  //
  // The extension holds the choices (they survive from one window to the next): here
  // we just draw them and send them back one piece at a time. The list of models
  // comes from the CLI once the session is up, so until it's there the "default"
  // entry stays — which is also the right choice for most cases.
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

  // Every effort level has a name and a plain explanation.
  const EFFORT_INFO = {
    '':     { label: 'Auto',          desc: 'Claude decides how hard to work based on the question' },
    low:    { label: 'Fast',          desc: 'Answers right away — good for simple questions' },
    medium: { label: 'Balanced',      desc: 'The right mix of speed and precision' },
    high:   { label: 'Thorough',      desc: 'Takes the time to do things properly' },
    xhigh:  { label: 'Very thorough', desc: 'Analyses everything in depth before acting' },
    max:    { label: 'Maximum',       desc: 'Spares nothing, the highest quality' },
  };
  const THINK_INFO = {
    auto: { label: 'Auto', desc: 'Claude decides when to reason in depth' },
    on:   { label: 'On',   desc: 'Reasons step by step before every answer' },
    off:  { label: 'Off',  desc: 'Answers directly, with no intermediate reasoning' },
  };

  // -- model cards --
  //
  // The cards are dictated by the installed CLI, not by a list written here: the day
  // a new model comes out it shows up by itself, and one that disappears doesn't hang
  // around pretending. The name and description are its own, trimmed only as much as
  // it takes to fit.

  /** From the CLI's description we keep the last piece: the "what it's for". */
  function modelPurpose(m) {
    const d = String(m.description || '');
    const parts = d.split('·');
    const tail = (parts[parts.length - 1] || '').trim();
    return PURPOSE_IT[tail] || tail || String(m.resolved || '');
  }

  /** The handful of phrases the CLI always words the same way: shortened here. */
  const PURPOSE_IT = {
    'Best for everyday, complex tasks': 'For every day, complex ones too',
    'Most capable for your hardest and longest-running tasks': 'The most capable, for the tough jobs',
    'Efficient for routine tasks': 'Efficient for routine things',
    'Fastest for quick answers': 'The fastest, answers on the fly',
  };

  /**
   * The name on the card, broken across two lines.
   *
   * The CLI tacks the context window onto the name — "Opus (1M context)" — and on
   * a single line the card becomes unreadable. The name stays big up top, the
   * qualifier wraps smaller underneath.
   */
  function bareName(m) {
    const raw = String(m.label || m.value).trim();
    // Tail in round or square brackets: "(1M context)", "[1m]", ...
    const cut = raw.match(/^(.*?)[\s]*[([]([^)\]]+)[)\]]\s*$/);
    if (cut) return { name: cut[1].trim(), note: cut[2].trim() };
    return { name: raw, note: '' };
  }

  /**
   * "Opus" on its own doesn't say which Opus. But the number is already there in
   * the resolved model — claude-opus-5 — so we take it from there instead of
   * keeping a list here that goes stale: the day the CLI resolves to claude-opus-6,
   * the card will say "Opus 6" all by itself, without touching a thing.
   */
  const FALLBACK_VER = { opus: '5' };

  function versioned(name, resolved) {
    if (!name || /\d/.test(name)) return name; // it already has the version
    const key = name.trim().toLowerCase();
    const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const hit = String(resolved || '')
      .toLowerCase()
      .match(new RegExp(esc + '-(\\d+(?:-\\d+)?)'));
    const ver = hit ? hit[1].replace(/-/g, '.') : FALLBACK_VER[key];
    return ver ? name + ' ' + ver : name;
  }

  function modelName(m) {
    const b = bareName(m);
    return { name: versioned(b.name, m.resolved), note: b.note };
  }

  /**
   * Every family has its own colour and its own effect: it isn't a scale from little
   * to a lot, they're four different things. That way you recognise the model at a
   * glance from the colour, before you even read the name.
   *
   *   haiku   cyan     fast streak crossing through
   *   sonnet  purple   soft breathing
   *   opus    clay     gradient border going round
   *   fable   gold     quick spin + halo + floats
   */
  const FAMILY = [
    [/fable|mythos/i, 'fable'],
    [/opus/i, 'opus'],
    [/sonnet/i, 'sonnet'],
    [/haiku/i, 'haiku'],
  ];

  function modelFamily(m) {
    const hay =
      bareName(m).name + ' ' + String(m.value || '') + ' ' + String(m.resolved || '');
    for (const [re, name] of FAMILY) if (re.test(hay)) return name;
    return 'sonnet';
  }

  function paintModels() {
    const list = $('cfgModelList');
    list.replaceChildren();

    if (!models.length) {
      list.append(el('p', 'phint', 'The models will appear after the first message'));
      return;
    }

    for (const m of models) {
      // No "Automatic": the model is always picked by hand.
      if (m.recommended) continue;
      const value = m.value;
      const isOn = prefs.model === value;
      // Every family has its own colour and its own effect.
      const cls = 'model-card fam-' + modelFamily(m) + (isOn ? ' on' : '');
      const card = el('button', cls);
      card.type = 'button';
      card.title = String(m.description || m.resolved || m.value);
      const info = el('span', 'mc-info');
      const nm = modelName(m);
      info.append(el('span', 'mc-name', nm.name));
      if (nm.note) info.append(el('span', 'mc-note', nm.note));
      info.append(el('span', 'mc-desc', modelPurpose(m)));
      card.append(info);
      card.addEventListener('click', () => push({ model: value }));
      list.append(card);
    }
  }

  // -- generic segmented control with slider --

  /**
   * Puts the slider over the active button. We use the offsets (not the rects):
   * they're already relative to the container — which is `position: relative` — so
   * they don't miss by half a pixel and, above all, they hold up even while the
   * panel is still sliding in with its animation.
   */
  function placeSeg(container) {
    const slider = container.querySelector('.seg-slider');
    if (!slider) return;
    const active = container.querySelector('.seg-btn.on');
    // With the panel closed there's nothing to measure: better not to move it at all
    // than to pin it to zero and then watch it jump on the first click.
    if (!active || !container.offsetParent) return;
    slider.style.left = active.offsetLeft + 'px';
    slider.style.top = active.offsetTop + 'px';
    slider.style.width = active.offsetWidth + 'px';
    slider.style.height = active.offsetHeight + 'px';
    slider.style.display = '';
  }

  /** Every time the container changes size (the buttons wrap, the panel opens)
   *  the slider puts itself back in place on its own. */
  function watchSeg(container) {
    if (container.dataset.watched || typeof ResizeObserver === 'undefined') return;
    container.dataset.watched = '1';
    new ResizeObserver(() => placeSeg(container)).observe(container);
  }

  /** Puts all the sliders back in place: needed when the panel opens. */
  function placeAllSegs() {
    for (const c of document.querySelectorAll('.seg')) placeSeg(c);
  }

  function paintSeg(container, items, value, onChange) {
    // Keep the existing slider or make one
    let slider = container.querySelector('.seg-slider');
    container.replaceChildren();
    if (!slider) {
      slider = el('div', 'seg-slider');
    }
    container.appendChild(slider);
    watchSeg(container);

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

    if (!container.querySelector('.seg-btn.on')) slider.style.display = 'none';
    // Right away and then after a frame: the first pass handles the normal case, the
    // second the one where the buttons have just wrapped.
    placeSeg(container);
    requestAnimationFrame(() => placeSeg(container));
  }

  /** The model effort and thinking apply to: the chosen one, or the recommended one. */
  function chosenModel() {
    return prefs.model
      ? models.find((m) => m.value === prefs.model)
      : models.find((m) => m.recommended);
  }

  function paintEffort() {
    // With no choice made the recommended one applies: its levels are the good ones.
    const chosen = chosenModel();
    const levels = chosen ? chosen.efforts : ['low', 'medium', 'high'];
    const noEffort = !!chosen && !chosen.efforts.length;
    // "Auto" never gets disabled. It isn't a level like the others: it means "tell
    // it nothing", and saying nothing is always possible — even to a model that
    // doesn't take levels at all. Disabling it left the panel with no choice lit up
    // and the slider hanging in mid-air.
    const items = [{ value: '', label: 'Auto' }].concat(
      levels.map((l) => ({
        value: l,
        label: (EFFORT_INFO[l] || {}).label || l,
        disabled: noEffort,
      }))
    );
    paintSeg($('cfgEffort'), items, prefs.effort, (v) => push({ effort: v }));
    const info = EFFORT_INFO[prefs.effort] || EFFORT_INFO[''];
    $('cfgEffortHint').textContent = noEffort
      ? "This model doesn't take effort levels: it decides for itself"
      : info.desc;
  }

  function paintThinking() {
    const chosen = chosenModel();
    // Not every model can decide on its own how much to think: where they can't,
    // "On" is a fixed token ceiling, not adaptive thinking. Better to say so than to
    // show three buttons that look like they mean the same thing everywhere.
    const adaptive = !chosen || chosen.adaptive !== false;
    const items = Object.entries(THINK_INFO).map(([v, i]) => ({ value: v, label: i.label }));
    paintSeg($('cfgThink'), items, prefs.thinking, (v) => push({ thinking: v }));
    const base = (THINK_INFO[prefs.thinking] || {}).desc || '';
    $('cfgThinkHint').textContent =
      adaptive || prefs.thinking === 'off'
        ? base
        : base + ' — on this model it means a fixed token ceiling';
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

  /** Only what you changed gets sent: the extension already knows the rest. */
  function push(patch) {
    prefs = Object.assign({}, prefs, patch);
    vscode.postMessage({ cmd: 'setPrefs', value: patch });
    paintCfg();
  }

  /** The sound plays right away: picking one blind makes no sense. */
  function previewSound() {
    if (window.Chime) window.Chime.play(prefs.sound, 'done', prefs.volume);
  }

  function toggleCfg(on) {
    const show = on == null ? cfg.hidden : on;
    if (show) {
      cfg.hidden = false;
      cfg.classList.remove('closing');
      btnCfg.classList.add('on');
      // Now that the panel can be measured, the sliders take up the right position
      // without waiting for the first click.
      placeAllSegs();
      requestAnimationFrame(placeAllSegs);
      if (window.Chime) window.Chime.unlock();
    } else {
      // Closing animation: the panel slides away, then hides.
      btnCfg.classList.remove('on');
      hideAfterClosing(cfg);
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
  // while you drag only the preview volume changes; it gets saved when you let go
  $('cfgVol').addEventListener('input', (e) => (prefs.volume = Number(e.target.value) / 100));
  $('cfgVol').addEventListener('change', (e) => {
    push({ volume: Number(e.target.value) / 100 });
    previewSound();
  });
  $('cfgAway').addEventListener('change', (e) => push({ onlyWhenAway: e.target.checked }));
  $('cfgAsk').addEventListener('change', (e) => push({ soundOnAsk: e.target.checked }));
  $('cfgToast').addEventListener('change', (e) => push({ toast: e.target.checked }));
  $('cfgTest').addEventListener('click', previewSound);

  // The first gesture on the page unlocks the audio: from then on the end-of-work
  // alert can sound even with the window behind all the others.
  const wake = () => window.Chime && window.Chime.unlock();
  document.addEventListener('pointerdown', wake, { once: true });
  document.addEventListener('keydown', wake, { once: true });

  // ---------- shortcuts ----------
  //
  // They work anywhere on the page, even while you're typing: they're the same things
  // the header buttons do, without taking your hands off the keyboard. Whoever
  // already handled them (the "@" and "/" menu) leaves a mark with preventDefault,
  // and here we don't step on it.
  function toggleHistory() {
    if (!drawer.hidden) {
      closeDrawer();
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
        closeDrawer();
        return;
      }
      // Stop only if there's really something to stop: otherwise Escape stays the
      // key that does nothing, and that's how it should be.
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
        // the context alongside only exists in the tab: where it isn't there, the key
        // mustn't pretend it is
        if ($('btnCtx').hidden) return;
        e.preventDefault();
        $('btnCtx').click();
        return;
      case 'w':
        // same again: from the sidebar there's no tab to close
        if ($('btnClose').hidden) return;
        e.preventDefault();
        closeTab();
        return;
    }
  });

  // ---------- the context column (tab only) ----------
  // In the sidebar the context has a panel of its own, below the chat; in a tab that
  // panel doesn't exist, so the same drawing gets mounted here alongside. The code is
  // the same, ctxpanel.js: two places, one single panel.
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
  // The mode slider positions itself after the first render
  requestAnimationFrame(() => paintMode(document.body.dataset.mode || 'default'));
  vscode.postMessage({ cmd: 'ready' });
})();
