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
  /** Every word you can read on this page goes through here. See i18n.js. */
  const t = (key, vars) => window.I18N.t(key, vars);

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
      return n === 1 ? t('msg.item') : t('msg.items', { n });
    }
    for (const k of ['command', 'file_path', 'path', 'pattern', 'query', 'url', 'description', 'prompt']) {
      const v = inp[k];
      if (typeof v === 'string' && v.trim()) {
        const shown = k === 'file_path' || k === 'path' ? shortPath(v) : v;
        return shown.replace(/\s+/g, ' ').slice(0, 200);
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
    ['@', 'empty.key.file'],
    ['/', 'empty.key.command'],
    ['Alt+N', 'empty.key.new'],
    ['Alt+H', 'empty.key.history'],
    ['Esc', 'empty.key.stop'],
  ];

  function showEmpty() {
    log.replaceChildren();
    const box = el('div', 'empty');
    box.append(
      icon('chatbubble-ellipses'),
      el('h2', null, t('empty.title')),
      el('p', null, t('empty.body'))
    );
    const keys = el('div', 'keys');
    for (const [k, what] of KEYS) {
      const item = el('span', 'key');
      item.append(el('kbd', null, k), el('span', null, t(what)));
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
    // `live` is what makes the light run around the border: it's on while the
    // reasoning is still arriving and goes off the moment the block is closed.
    // A dashed border said "this is a draft"; a light going round says "it's
    // thinking right now", which is the thing you actually want to know.
    node.className = 'msg think live';
    node.open = false;
    const sum = el('summary');
    sum.append(icon('bulb'), el('span', 'think-label', t('msg.reasoning')), el('span', 'grow'), icon('chevron-down', 'chev'));
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
      b.node.classList.remove('live'); // it has finished thinking: the light stops
    } else {
      b.body.replaceChildren(...markdown(text));
      b.node.classList.add('done');
    }
    b.caret = null;
    toBottom();
  }

  /* ---------- markdown ----------
     What Claude writes at the end of a turn is a recap: headings, lists, a table
     now and then. Rendering only the code fences left all the rest on screen as
     it was typed — "## What I changed" with the hashes still on, bullets as bare
     hyphens — which reads like a log file, not like an answer.
     Everything here is built as nodes, never as innerHTML: the same house rule as
     the rest of the page, so a stray "<" in a diff can't become markup. */

  const RX = {
    fence: /^\s{0,3}```+\s*([\w+#.-]*)\s*$/,
    head: /^\s{0,3}(#{1,6})\s+(.*)$/,
    rule: /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/,
    quote: /^\s{0,3}>\s?(.*)$/,
    ul: /^(\s*)[-*+]\s+(.*)$/,
    ol: /^(\s*)(\d{1,3})[.)]\s+(.*)$/,
    row: /^\s*\|(.+)\|\s*$/,
    split: /^\s*\|?[\s:|-]+\|[\s:|-]*$/,
  };

  /* ---------- links ----------
     An address written out in full is a link whether or not somebody wrapped it
     in brackets — and Claude writes them bare most of the time, inside numbered
     steps and inside code blocks. Copying one out by hand to paste it in a
     browser is the sort of small tax you pay ten times a day without noticing.
     Here they become clickable wherever they turn up. */
  const URL_RX = /https?:\/\/[^\s<>"'`\\]+/g;

  /**
   * One anchor. The trailing punctuation is trimmed off first: "…see https://x.com."
     ends a sentence, the full stop isn't part of the address. Closing brackets go
   * too, unless the address itself opened one (wiki-style URLs do).
   */
  function linkNode(raw) {
    let url = raw;
    let tail = '';
    for (;;) {
      const last = url[url.length - 1];
      if ('.,;:!?'.includes(last)) {
        tail = last + tail;
        url = url.slice(0, -1);
        continue;
      }
      const pair = { ')': '(', ']': '[', '}': '{' }[last];
      if (pair && url.split(pair).length < url.split(last).length) {
        tail = last + tail;
        url = url.slice(0, -1);
        continue;
      }
      break;
    }
    const a = el('a', 'mdlink', url);
    a.href = url;
    a.title = url;
    return [a, tail];
  }

  /** Text where every bare address becomes a link. Everything else stays text. */
  function autolink(text, into) {
    const box = into || document.createDocumentFragment();
    let last = 0;
    for (const m of String(text).matchAll(URL_RX)) {
      if (m.index > last) box.append(document.createTextNode(text.slice(last, m.index)));
      const [a, tail] = linkNode(m[0]);
      box.append(a);
      if (tail) box.append(document.createTextNode(tail));
      last = m.index + m[0].length;
    }
    if (last < text.length) box.append(document.createTextNode(text.slice(last)));
    return box;
  }

  /** Bold, italic, code, strike, links. What it doesn't know stays as typed. */
  const INLINE =
    /\*\*([^*]+)\*\*|\*([^*\n]+)\*|`([^`\n]+)`|~~([^~\n]+)~~|\[([^\]\n]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<>"'`\\]+)/g;

  function inline(text, into) {
    const box = into || document.createDocumentFragment();
    let last = 0;
    for (const m of String(text).matchAll(INLINE)) {
      if (m.index > last) box.append(document.createTextNode(text.slice(last, m.index)));
      if (m[1] != null) box.append(el('strong', null, m[1]));
      else if (m[2] != null) box.append(el('em', null, m[2]));
      else if (m[3] != null) box.append(el('code', null, m[3]));
      else if (m[4] != null) box.append(el('s', null, m[4]));
      else if (m[7] != null) {
        // written bare, no brackets around it
        const [a, tail] = linkNode(m[7]);
        box.append(a);
        if (tail) box.append(document.createTextNode(tail));
      } else if (/^https?:\/\//i.test(m[6])) {
        // Only real web links become links: a "(see below)" must not turn into
        // something clickable that goes nowhere.
        const a = el('a', 'mdlink', m[5]);
        a.href = m[6];
        a.title = m[6];
        box.append(a);
      } else {
        box.append(document.createTextNode(m[0]));
      }
      last = m.index + m[0].length;
    }
    if (last < text.length) box.append(document.createTextNode(text.slice(last)));
    return box;
  }

  /* ---------- copy ----------
     A block of code, a command, a message to forward to someone: what it's for is
     to end up somewhere else. The clipboard API is the quick road; inside a
     webview it can be refused, so the extension holds the door open behind it —
     it has a clipboard of its own and no such doubts. */
  function copyText(text) {
    const ask = () => vscode.postMessage({ cmd: 'copy', text });
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(null, ask);
        return;
      }
    } catch (_) {
      /* falls through to the extension */
    }
    ask();
  }

  /**
   * The button that lives in the corner of a copyable block. It answers: the icon
   * becomes a tick and the word changes for a second and a half, then it goes back
   * — the confirmation you want after pressing it, without a toast covering the page.
   */
  function copyButton(getText, cls) {
    const b = el('button', 'copybtn' + (cls ? ' ' + cls : ''));
    b.type = 'button';
    b.title = t('code.copy');
    const paint = (label, ico) => {
      b.replaceChildren(ico, el('span', 'copybtn-t', label));
    };
    paint(t('code.copy'), icon('copy'));
    let back = 0;
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      copyText(getText());
      b.classList.add('ok');
      paint(t('code.copied'), drawnCheck());
      clearTimeout(back);
      back = setTimeout(() => {
        b.classList.remove('ok');
        paint(t('code.copy'), icon('copy'));
      }, 1500);
    });
    return b;
  }

  function codeBlock(lang, body) {
    const text = body.replace(/\n+$/, '');
    const wrap = el('div', 'code-wrap');
    const bar = el('div', 'code-bar');
    if (lang) bar.append(el('span', 'code-lang', lang));
    bar.append(copyButton(() => text));
    wrap.append(bar);
    const pre = el('pre');
    // Addresses inside a fenced block are links too: half of what Claude writes
    // in one is a URL to open, and a block you can't click is a block you retype.
    pre.appendChild(autolink(text, el('code')));
    wrap.append(pre);
    return wrap;
  }

  function tableBlock(rows) {
    const cells = (r) =>
      r.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
    const table = el('table', 'md-table');
    const thead = el('thead');
    const hrow = el('tr');
    for (const c of cells(rows[0])) hrow.append(inline(c, el('th')));
    thead.append(hrow);
    const body = el('tbody');
    for (const r of rows.slice(2)) {
      const tr = el('tr');
      for (const c of cells(r)) tr.append(inline(c, el('td')));
      body.append(tr);
    }
    table.append(thead, body);
    return table;
  }

  function markdown(src) {
    const out = [];
    const lines = String(src == null ? '' : src).replace(/\r\n?/g, '\n').split('\n');
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // ``` code ```
      const fence = line.match(RX.fence);
      if (fence) {
        const body = [];
        i++;
        while (i < lines.length && !RX.fence.test(lines[i])) body.push(lines[i++]);
        i++; // the closing fence — or the end of the text, same thing
        out.push(codeBlock(fence[1], body.join('\n')));
        continue;
      }

      if (!line.trim()) {
        i++;
        continue;
      }

      // ### heading
      const head = line.match(RX.head);
      if (head) {
        const level = Math.min(4, head[1].length);
        out.push(inline(head[2].trim(), el('div', 'md-h md-h' + level)));
        i++;
        continue;
      }

      // ---
      if (RX.rule.test(line)) {
        out.push(el('div', 'md-rule'));
        i++;
        continue;
      }

      // > quote
      if (RX.quote.test(line)) {
        const said = [];
        while (i < lines.length && RX.quote.test(lines[i])) said.push(lines[i++].match(RX.quote)[1]);
        out.push(inline(said.join('\n'), el('blockquote', 'md-quote')));
        continue;
      }

      // | a | b |
      if (RX.row.test(line) && RX.split.test(lines[i + 1] || '')) {
        const rows = [];
        while (i < lines.length && RX.row.test(lines[i])) rows.push(lines[i++]);
        out.push(tableBlock(rows));
        continue;
      }

      // - list, 1. list
      if (RX.ul.test(line) || RX.ol.test(line)) {
        const ordered = RX.ol.test(line);
        const list = el(ordered ? 'ol' : 'ul', 'md-list');
        while (i < lines.length) {
          const m = lines[i].match(ordered ? RX.ol : RX.ul);
          if (!m) {
            // An indented line with no bullet belongs to the item above it.
            if (/^\s{2,}\S/.test(lines[i]) && list.lastChild) {
              list.lastChild.append(document.createTextNode(' '), inline(lines[i].trim()));
              i++;
              continue;
            }
            break;
          }
          const li = el('li');
          if (m[1] && m[1].length >= 2) li.className = 'sub'; // one level of nesting is plenty
          li.append(inline(ordered ? m[3] : m[2]));
          list.append(li);
          i++;
        }
        out.push(list);
        continue;
      }

      // a plain paragraph: up to the empty line, or to the next block
      const para = [];
      while (i < lines.length && lines[i].trim()) {
        const l = lines[i];
        if (RX.fence.test(l) || RX.head.test(l) || RX.rule.test(l) || RX.quote.test(l)) break;
        if (RX.ul.test(l) || RX.ol.test(l)) break;
        para.push(l.trim());
        i++;
      }
      if (para.length) out.push(inline(para.join('\n'), el('p', 'md-p')));
    }

    return out.length ? out : [document.createTextNode('')];
  }

  // A link opens in the browser, and it's the extension that opens it. Left to
  // itself a webview either swallows the navigation or goes there wholesale —
  // and a panel that has navigated away from the chat has no way back.
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest && e.target.closest('a.mdlink');
    if (!a) return;
    e.preventDefault();
    const url = a.getAttribute('href');
    if (url) vscode.postMessage({ cmd: 'openLink', url });
  });

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
    if (rows.length > MAX) box.append(el('div', 'more', t('msg.moreLines', { n: rows.length - MAX })));
    if (inp.replace_all) box.append(el('div', 'more', t('msg.replaceAll')));
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
      arg.title = t('msg.openInEditor');
      arg.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        vscode.postMessage({ cmd: 'openFile', path: file });
      });
    }
    head.append(ic, el('span', 'name', name), arg, icon('chevron-down', 'chev'));
    sum.append(head, el('div', 'tool-bar'));

    // Nothing opens by itself. A diff that unfolds on its own pushes the message
    // you were reading off the screen, and three of them in a row turn the
    // conversation into a wall of code you never asked to see. The card says
    // what it holds; opening it is your call.
    const body = el('div', 'body');
    const diff = DIFF_TOOLS[name] ? diffBody(name, i) : null;
    if (diff) {
      body.append(diff);
    } else if (name === 'TodoWrite') {
      body.append(todoBody(i));
    } else if (name === 'Task' || name === 'Agent') {
      if (i.prompt) body.append(el('div', 'prompt', String(i.prompt).slice(0, 600)));
      node._kids = el('div', 'kids');
      body.append(node._kids);
    }
    // Closed isn't empty: a card with a diff inside has to keep its arrow, or the
    // change becomes something you can't get to.
    node._full = body.childElementCount > 0;

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
    const res = ok && QUIET[node.dataset.tool] ? '' : String(text || '').trim();
    if (res) {
      const lines = res.split('\n');
      const out = el('div', 'out', lines.length > 400 ? lines.slice(0, 400).join('\n') + '\n…' : res);
      // In cards that already have something to show (diff, todo, sub-agent)
      // the result is a note at the bottom, not the main content.
      if (node._kids) node._body.append(el('div', 'sub-result', res.slice(0, 2000)));
      else node._body.append(out);
      const n = node.querySelector('.count');
      if (n) n.remove();
      if (lines.length > 12) {
        node.querySelector('.head').insertBefore(
          el('span', 'count', t('msg.lines', { n: lines.length })),
          node.querySelector('.chev')
        );
      }
    } else if (!node._full && !node.open) {
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

  /**
   * Multiple-choice questions: one answer per question, then you send.
   *
   * Every question also gets a line to write on. What gets offered is what Claude
   * imagined the answer might be, and often the answer is something else: without
   * somewhere to write it you either pick the least wrong option or you cancel the
   * card and explain yourself in the next message. What you write counts exactly
   * like an option — on a multiple choice it adds to the ones you ticked.
   */
  function questionBody(node, m, send) {
    const answers = {};
    const box = el('div', 'qs');
    const go = button('ok', 'send', t('perm.send'));
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

      // the line you write on, built first so the buttons can talk to it
      const own = el('div', 'own');
      const field = document.createElement('input');
      field.type = 'text';
      field.className = 'own-input';
      field.placeholder = q.multiSelect ? t('perm.alsoWrite') : t('perm.orWrite');
      own.append(icon('pencil', 'own-ico'), field);

      const collect = () => {
        const picked = [...opts.querySelectorAll('.opt.on .opt-label')].map((n) => n.textContent);
        const typed = field.value.trim();
        if (typed) picked.push(typed);
        own.classList.toggle('on', !!typed);
        if (picked.length) answers[q.question] = picked.join(', ');
        else delete answers[q.question];
        check();
      };

      for (const o of q.options) {
        const b = el('button', 'opt');
        b.type = 'button';
        b.append(el('span', 'opt-label', o.label));
        if (o.description) b.append(el('span', 'opt-desc', o.description));
        b.addEventListener('click', () => {
          if (q.multiSelect) {
            b.classList.toggle('on');
          } else {
            for (const other of opts.querySelectorAll('.opt.on')) other.classList.remove('on');
            b.classList.add('on');
            // One answer means one: choosing a card puts down what you'd written.
            field.value = '';
          }
          collect();
        });
        opts.append(b);
      }

      field.addEventListener('input', () => {
        // Same rule the other way round: on a single choice, writing wins.
        if (!q.multiSelect && field.value.trim()) {
          for (const other of opts.querySelectorAll('.opt.on')) other.classList.remove('on');
        }
        collect();
      });
      // Enter in the field sends, if every question has an answer by then.
      field.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (!go.disabled) go.click();
      });

      group.append(opts, own);
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
    // The engine writes its own title when it has something to say; otherwise we
    // build one here, so it comes out in the language you're reading.
    const title = m.title || (m.tool ? t('perm.wants', { tool: m.tool }) : t('perm.title'));
    head.append(icon(ic, 'perm-ico'), el('span', 'title', title));
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
      const ok = button('ok', 'checkmark', t('perm.approve'));
      const auto = button('always', 'flash', t('perm.approveAuto'));
      const no = button('no', 'close', t('perm.keepPlanning'));
      ok.addEventListener('click', () => answered('allow'));
      auto.addEventListener('click', () => answered('always'));
      no.addEventListener('click', () => answered('deny'));
      acts.append(ok, auto, no);
    } else if (m.kind === 'question' && m.questions && m.questions.length) {
      const [go] = questionBody(node, m, answered);
      acts.append(go);
    } else {
      if (m.detail) node.append(el('div', 'detail', m.detail));
      const ok = button('ok', 'checkmark', t('perm.allow'));
      ok.addEventListener('click', () => answered('allow'));
      acts.append(ok);
      if (m.canAlways) {
        const always = button('always', 'checkmark-circle', t('perm.always'));
        // This isn't a "just this once" promise: the rule stays written on disk.
        always.title = t('perm.alwaysHint');
        always.addEventListener('click', () => answered('always'));
        acts.append(always);
      }
      const no = button('no', 'close', t('perm.deny'));
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
    // The label is written by the extension. If it's one of the ones it always
    // words the same way, it gets said in your language; anything else passes
    // through as it came.
    verdict.append(
      m.ok ? drawnCheck('perm-ico') : icon('close', 'perm-ico'),
      el('span', null, t('label.' + m.label) === 'label.' + m.label ? m.label : t('label.' + m.label))
    );
    if (acts) acts.replaceWith(verdict);
    else node.append(verdict);
    // Once it's answered only what you chose stays: the options you didn't take
    // and the empty writing line have nothing left to say.
    for (const opts of node.querySelectorAll('.opts')) {
      for (const b of opts.querySelectorAll('.opt:not(.on)')) b.remove();
    }
    for (const own of node.querySelectorAll('.own')) {
      const field = own.querySelector('.own-input');
      if (own.classList.contains('on') && field) {
        own.replaceChildren(icon('pencil', 'own-ico'), el('span', 'own-said', field.value.trim()));
      } else {
        own.remove();
      }
    }
    toBottom();
  }

  // ---------- errors ----------
  //
  // Whatever the engine sends is what you get: sometimes a sentence, often a message
  // written for whoever reads the logs. Here we say what happened and what you can do
  // about it, and the original text stays below for anyone who wants to see it.
  // The wording lives in i18n.js: here we only say which case it is, so an error
  // already on screen reads in whatever language you switch to next time it happens.
  const ERRORS = [
    {
      re: /cli\.js|@anthropic-ai\/claude-code|non trovo la cli|command not found|ENOENT|spawn/i,
      key: 'err.cli',
      keep: false,
    },
    { re: /rate.?limit|\b429\b|too many requests|usage limit/i, key: 'err.rate' },
    { re: /\b401\b|\b403\b|unauthor|authentic|not logged in|invalid api key|oauth/i, key: 'err.auth' },
    { re: /credit|billing|insufficient|payment/i, key: 'err.credit' },
    {
      re: /prompt is too long|context (window|length|limit)|too many tokens|exceeds? .{0,20}tokens/i,
      key: 'err.context',
    },
    {
      re: /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|socket hang up|network|offline/i,
      key: 'err.net',
    },
    { re: /interrupt|interrott|abort|cancell?ed|annullat/i, key: 'err.stopped', calm: true },
    {
      re: /exit(ed)? (with )?code|process (exited|terminated|died)|SIGTERM|SIGKILL|killed/i,
      key: 'err.exit',
    },
  ];

  function readableError(raw) {
    const s = String(raw || '').trim() || t('err.none');
    for (const e of ERRORS) {
      if (e.re.test(s)) {
        return {
          title: t(e.key + '.title'),
          hint: t(e.key + '.hint'),
          calm: !!e.calm,
          raw: e.keep === false ? '' : s,
        };
      }
    }
    // A message already written for a person gets shown as it is: rewriting it
    // would mean hiding it.
    if (s.length <= 220 && !/\n|Error:|Exception|\bat .+:\d+|[{}]/.test(s)) {
      return { title: s, hint: '', calm: false, raw: '' };
    }
    return {
      title: t('err.generic.title'),
      hint: t('err.generic.hint'),
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
      det.append(el('summary', null, t('err.details')), el('pre', null, e.raw.slice(0, 4000)));
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
    waiting.append(orb, el('span', 'pulse-label', t('msg.thinking')));
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
    if (s < 90) return t('ago.now');
    const m = Math.round(s / 60);
    if (m < 60) return t('ago.min', { n: m });
    const h = Math.round(m / 60);
    if (h < 24) return h === 1 ? t('ago.hour') : t('ago.hours', { n: h });
    const g = Math.round(h / 24);
    return g === 1 ? t('ago.yesterday') : t('ago.days', { n: g });
  }

  function showHistory(items) {
    const list = $('drawerList');
    list.replaceChildren();
    if (!items.length) {
      list.append(el('div', 'drawer-empty', t('drawer.empty')));
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
    if (!spent.tokens) {
      chip.hidden = true;
      return;
    }
    chip.hidden = false;
    $('spendTokens').textContent = fmtTokens(spent.tokens);
    // La cifra in dollari non si mostra: accanto al contesto non aggiungeva nulla.
    const c = $('spendCost');
    if (c) c.hidden = true;
  }

  /**
   * The line that closes a turn: it went well or it didn't, how long it took,
   * how many steps, how much context it's carrying now. Four facts on one line —
   * the answer above says what was done, this says what it cost.
   */
  function turnRecap(m) {
    const node = el('div', 'msg recap' + (m.ok === false ? ' bad' : ''));
    node.append(m.ok === false ? icon('alert-circle', 'recap-ico') : drawnCheck('recap-ico'));
    const chips = el('div', 'recap-chips');
    const chip = (text, cls) => chips.append(el('span', 'recap-chip' + (cls ? ' ' + cls : ''), text));
    chip(t(m.ok === false ? 'recap.stopped' : 'recap.done'), 'strong');
    if (m.durationMs) chip(clock(m.durationMs));
    if (stepsN) chip(t(stepsN === 1 ? 'act.step' : 'act.steps', { n: stepsN }));
    if (m.tokens) chip(t('recap.context', { n: fmtTokens(m.tokens) }));
    node.append(chips);
    add(node);
  }

  /**
   * The send arrow: a paper plane, the one everybody already knows from every
   * chat they've used.
   *
   * It's drawn here rather than pulled from the sprite for the same reason as
   * before — the sprite's "navigate" is a jet tip that has to be rotated 45° to
   * point the right way, and a rotated asymmetric glyph never sits in the middle
   * of its square. This plane is built flat inside the 24-box, its body centred
   * on y=12, with the notch cut into the tail: it flies to the right without
   * being turned, so "centred" stays a property of the drawing.
   */
  function sendArrow() {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('class', 'ico send-arrow');
    svg.setAttribute('viewBox', '0 0 24 24');
    const p = document.createElementNS(SVG, 'path');
    p.setAttribute(
      'd',
      'M21.4 11.13 4.07 3.5a1 1 0 0 0-1.4 1.15l1.6 6.05a1 1 0 0 0 .8.72L12.3 12.5l-7.23 1.08a1 1 0 0 0-.8.72l-1.6 6.05a1 1 0 0 0 1.4 1.15l17.33-7.63a1 1 0 0 0 0-1.74z'
    );
    p.setAttribute('fill', 'currentColor');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '0.7');
    p.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(p);
    return svg;
  }

  /** Stop: a full square, no ring around it. Same box, so it can't drift. */
  function stopSquare() {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('class', 'ico stop-square');
    svg.setAttribute('viewBox', '0 0 24 24');
    const r = document.createElementNS(SVG, 'rect');
    r.setAttribute('x', '6');
    r.setAttribute('y', '6');
    r.setAttribute('width', '12');
    r.setAttribute('height', '12');
    r.setAttribute('rx', '2.5');
    r.setAttribute('fill', 'currentColor');
    svg.appendChild(r);
    return svg;
  }

  // ---------- what it's doing, right now ----------
  //
  // The chat can stay still for a minute while a tool chews on something, and a
  // still chat looks like a stuck chat. This pill lives in the header, beside the
  // mode switch, and says two things: what state it's in and how long the turn has
  // been going. The clock ticks every second — a moving clock is the cheapest
  // proof that nothing is frozen — and if nothing has happened for a while it
  // says that too, instead of leaving you to guess.
  //
  // The step count still gets kept (`stepsN`) — it's worth reading once, at the
  // end, in the recap. It's not worth a chip that changes every two seconds up
  // here, and neither was the command line it used to repeat from the thread.
  const actBar = $('activity');
  const actWhat = $('actWhat');
  const actTime = $('actTime');
  let actStart = 0;
  let actLast = 0;
  let actKey = 'act.working';
  let actVars = null;
  let stepsN = 0;
  let actTimer = 0;

  const clock = (ms) => {
    const s = Math.max(0, Math.round(ms / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };

  function paintActivity() {
    if (!actBar || actBar.hidden) return;
    const now = Date.now();
    const quiet = now - actLast;
    actWhat.textContent = actVars ? t(actKey, actVars) : t(actKey);
    actTime.textContent = clock(now - actStart);
    // Twelve seconds with nothing new is where the doubt starts: better to say
    // "still on it" than to let the silence say "it crashed".
    actBar.classList.toggle('quiet', quiet > 12000);
    actBar.dataset.quiet = quiet > 12000 ? t('act.quiet', { n: Math.round(quiet / 1000) }) : '';
  }

  /** Every event that means "it's alive" passes through here. */
  function activity(key, vars) {
    actKey = key;
    actVars = vars || null;
    actLast = Date.now();
    paintActivity();
  }

  function startActivity() {
    if (!actBar) return;
    actStart = Date.now();
    actLast = actStart;
    stepsN = 0;
    actKey = 'act.working';
    actVars = null;
    actBar.hidden = false;
    // The header rearranges itself around the pill: in the narrow face the
    // wordmark steps aside to make room for it (see chat.css).
    actBar.parentElement.classList.add('busy');
    paintActivity();
    clearInterval(actTimer);
    actTimer = setInterval(paintActivity, 1000);
  }

  function stopActivity() {
    if (!actBar) return;
    clearInterval(actTimer);
    actTimer = 0;
    actBar.hidden = true;
    actBar.parentElement.classList.remove('busy');
    actBar.classList.remove('quiet');
  }

  // ---------- busy ----------
  let busy = false;
  function setBusy(v) {
    busy = v;
    sendBtn.classList.toggle('stop', v);
    sendBtn.title = v ? t('composer.stop') : t('composer.send');
    sendBtn.replaceChildren(v ? stopSquare() : sendArrow());
    if (v) {
      showWaiting();
      if (!actTimer) startActivity();
    } else {
      hideWaiting();
      stopActivity();
    }
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
        // And a tab can be closed; the sidebar can't. There's no button for it any
        // more — the header was crowded and VS Code already draws an X on the tab —
        // but Alt+W still has to know where it is.
        isTab = m.surface === 'panel';
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
        stepsN = 0;
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
        // The extension is the one that remembers which language you chose — this
        // is where a freshly opened tab finds out, and where a change made in the
        // other face of the chat lands.
        window.I18N.set(prefs.lang || 'en');
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
      case 'attached':
        for (const a of m.items || []) addAttachment(a);
        paintAttach();
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
        activity('act.asking');
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
        // The attached images go on top, above the words — exactly where they sat
        // in the composer while you were writing. Sent, the message keeps the shape
        // you'd built: they're the proof they went out, and one click opens them big.
        if (m.images && m.images.length) {
          const box = el('div', 'uimgs');
          for (const im of m.images) {
            const src = `data:${im.mime};base64,${im.data}`;
            const t = document.createElement('img');
            t.className = 'uimg';
            t.src = src;
            t.alt = window.I18N.t('composer.attachedImage');
            t.addEventListener('click', () => openLightbox(src));
            box.append(t);
          }
          n.append(box);
        }
        if (m.text) n.append(el('div', 'utext', m.text));
        add(n);
        break;
      }
      case 'turn_start':
        hideWaiting();
        activity('act.thinking');
        break;
      case 'block_start':
        hideWaiting();
        m.kind === 'thinking' ? thinkBlock(m.id, m.parent) : textBlock(m.id, m.parent);
        activity(m.kind === 'thinking' ? 'act.reasoning' : 'act.writing');
        break;
      case 'delta':
        hideWaiting();
        appendDelta(m.id, m.kind || 'text', m.text, m.parent);
        activity(m.kind === 'thinking' ? 'act.reasoning' : 'act.writing');
        break;
      case 'block_final':
        finalize(m.id, m.kind, m.text, m.parent);
        break;
      case 'tool_start':
        hideWaiting();
        toolStart(m.id, m.name, m.input, m.parent);
        stepsN++;
        // The name of the tool and nothing else: what it's running is already
        // written in full in the card that just opened in the thread.
        activity('act.tool', { tool: m.name });
        break;
      case 'tool_end':
        toolEnd(m.id, m.ok, m.text);
        activity('act.working');
        break;
      case 'turn_end':
        blocks.clear();
        spent.usd += m.costUsd || 0;
        spent.tokens = m.tokens || spent.tokens;
        paintSpent();
        turnRecap(m);
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
      const cat = m ? m[1] : t('menu.general');
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
      head.append(icon('terminal'), el('span', null, t('menu.commands')));
      menu.append(head);

      const searchBox = el('div', 'menu-search');
      cmdSearchInput = document.createElement('input');
      cmdSearchInput.type = 'text';
      cmdSearchInput.placeholder = t('menu.search');
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
      // Clicking the search box moves focus here on purpose: the textarea's blur
      // handler knows not to close the menu when focus lands inside it. Leaving for
      // anywhere else does close it.
      cmdSearchInput.addEventListener('blur', (e) => {
        if (e.relatedTarget === input || (e.relatedTarget && menu.contains(e.relatedTarget))) return;
        closeMenu();
      });
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
    // `tok`, not `t`: `t` is the translator, and shadowing it here is how the whole
    // menu went down with "t is not a function".
    const tok = token();
    if (!tok) {
      closeMenu();
      return;
    }
    picking = { kind: tok.kind, start: tok.start, end: tok.end, items: [], sel: 0 };
    if (tok.kind === '/') {
      if (!commands.length) {
        // Without an active session there are no commands: show a message
        menu.replaceChildren();
        const hint = el('div', 'menu-head');
        hint.append(icon('terminal'), el('span', null, t('menu.needSession')));
        menu.append(hint);
        menu.hidden = false;
        return;
      }
      const q = tok.q.toLowerCase();
      paintMenu(
        commands
          .filter((c) => c.name.toLowerCase().includes(q))
          .slice(0, 40)
          .map((c) => ({ label: '/' + c.name, hint: c.description, insert: '/' + c.name }))
      );
      return;
    }
    clearTimeout(filesTimer);
    filesTimer = setTimeout(() => vscode.postMessage({ cmd: 'files', q: tok.q }), 110);
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
    x.title = t('lightbox.close');
    x.setAttribute('aria-label', t('common.close'));
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

  // ---------- attachments: editor selection, images and files of any kind ----------
  const attach = $('attach');
  const btnAttach = $('btnAttach');
  let selection = null; // {file, lines}
  let useSelection = true;
  let images = [];
  /** Everything that isn't an image: {path, name, size}. It travels as a path. */
  let files = [];

  /** "482 KB", "3.1 MB" — enough to think twice before sending a whole database. */
  function humanSize(n) {
    if (!n && n !== 0) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
    if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
    return (n / 1024 / 1024 / 1024).toFixed(1) + ' GB';
  }

  /** The icon says what kind of file it is before you've read its name. */
  const FILE_ICONS = [
    [/\.(png|jpe?g|gif|webp|bmp|svg|ico|avif|heic)$/i, 'image'],
    [/\.(mp4|mov|mkv|avi|webm|m4v|wmv)$/i, 'film'],
    [/\.(mp3|wav|flac|ogg|m4a|aac|wma)$/i, 'musical-notes'],
    [/\.(zip|rar|7z|tar|gz|bz2|xz)$/i, 'archive'],
    [/\.(csv|tsv|xlsx?|ods|numbers|parquet)$/i, 'grid'],
    [/\.(js|ts|tsx|jsx|py|rb|go|rs|java|cs|cpp|c|h|php|swift|kt|sh|ps1|sql|json|ya?ml|toml|xml|html?|css|scss)$/i, 'code-slash'],
    [/\.(txt|md|log|pdf|docx?|rtf|odt|pages|epub)$/i, 'document-text'],
  ];
  function fileIcon(name) {
    for (const [re, ico] of FILE_ICONS) if (re.test(name)) return ico;
    return 'document';
  }

  function paintAttach() {
    attach.replaceChildren();
    let i = 0;
    const stagger = (chip) => {
      chip.style.setProperty('--i', i++);
      attach.append(chip);
    };
    if (selection && useSelection) {
      const chip = el('span', 'att');
      chip.append(icon('code-slash'), el('span', null, `${selection.file}:${selection.lines}`));
      const x = el('button', 'attx');
      x.type = 'button';
      x.title = t('composer.dropSelection');
      x.append(icon('close'));
      x.addEventListener('click', () => {
        useSelection = false;
        paintAttach();
      });
      chip.append(x);
      stagger(chip);
    }
    images.forEach((im, n) => {
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
      x.title = t('composer.removeImage');
      x.append(icon('close'));
      x.addEventListener('click', () => {
        images.splice(n, 1);
        paintAttach();
      });
      chip.append(thumb, x);
      stagger(chip);
    });
    files.forEach((f, n) => {
      const chip = el('span', 'att att-file');
      chip.title = f.path;
      const info = el('span', 'att-info');
      info.append(el('span', 'att-name', f.name));
      if (f.size) info.append(el('span', 'att-size', humanSize(f.size)));
      const x = el('button', 'attx');
      x.type = 'button';
      x.title = t('composer.removeFile');
      x.append(icon('close'));
      x.addEventListener('click', () => {
        files.splice(n, 1);
        paintAttach();
      });
      chip.append(icon(fileIcon(f.name)), info, x);
      stagger(chip);
    });
    attach.hidden = !attach.childElementCount;
  }

  /** One attachment as the extension found it, into the right pile. */
  function addAttachment(a) {
    if (!a) return;
    if (a.kind === 'image' && a.data) images.push({ mime: a.mime, data: a.data });
    else if (a.path) files.push({ path: a.path, name: a.name, size: a.size });
  }

  // The paperclip. The picker is VS Code's own, and it filters nothing.
  btnAttach.addEventListener('click', () => {
    vscode.postMessage({ cmd: 'pickFiles' });
    input.focus();
  });

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

  // ---------- dropping files on the composer ----------
  //
  // Two ways a file can arrive, and they need different handling. Dragged out of
  // the VS Code explorer it comes as a list of URIs: it's already on disk, and
  // the path is all we need. Dragged out of a browser or a mail client the page
  // holds the only copy of the bytes — those go to the extension, which writes
  // them into a file of its own and hands back a real path.
  const MAX_DROP = 12 * 1024 * 1024;

  const dragOver = (e) => {
    if (!e.dataTransfer?.types?.length) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    composer.classList.add('dropping');
  };
  composer.addEventListener('dragover', dragOver);
  composer.addEventListener('dragenter', dragOver);
  composer.addEventListener('dragleave', (e) => {
    if (composer.contains(e.relatedTarget)) return;
    composer.classList.remove('dropping');
  });
  composer.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (!dt) return;
    composer.classList.remove('dropping');

    const uris = (dt.getData('text/uri-list') || '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('#') && /^file:/i.test(s));
    const dropped = [...(dt.files || [])];
    if (!uris.length && !dropped.length) return;
    e.preventDefault();

    for (const u of uris) {
      let p = '';
      try {
        p = decodeURIComponent(u.replace(/^file:\/{2,}/i, ''));
      } catch (_) {
        continue;
      }
      // "/c:/work/x.pdf" is what a file: URI looks like on Windows
      if (/^\/[a-z]:/i.test(p)) p = p.slice(1);
      const name = p.split(/[\\/]/).pop() || p;
      if (!files.some((f) => f.path === p)) files.push({ path: p, name, size: 0 });
    }
    // A file that came in as a URI is already on the list: no need to copy its
    // bytes anywhere.
    for (const f of dropped) {
      if (uris.length) break;
      if (f.size > MAX_DROP) continue;
      const r = new FileReader();
      r.onload = () => {
        const data = String(r.result).split(',')[1] || '';
        if (f.type.startsWith('image/')) {
          images.push({ mime: f.type, data });
          paintAttach();
        } else {
          // No path here: the extension makes one.
          vscode.postMessage({ cmd: 'stashFile', name: f.name, data });
        }
      };
      r.readAsDataURL(f);
    }
    paintAttach();
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
  // Leaving the textarea closes the menu — unless you're going *into* the menu.
  // The command search box is a real field: clicking it blurs the textarea, and
  // closing on that blur is what made the search box impossible to use.
  input.addEventListener('blur', (e) => {
    if (e.relatedTarget && menu.contains(e.relatedTarget)) return;
    closeMenu();
  });

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

  // The button is the only Stop. Enter is never a Stop: while Claude is working it
  // queues the message for the next turn — the engine already lines them up — and
  // interrupting on Enter meant a command typed mid-turn killed the turn instead of
  // running.
  sendBtn.addEventListener('click', () => {
    if (busy) {
      vscode.postMessage({ cmd: 'interrupt' });
      return;
    }
    composer.requestSubmit();
  });

  composer.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text && !images.length && !files.length) return;
    lastText = text;
    vscode.postMessage({
      cmd: 'send',
      text,
      images: images.length ? images : undefined,
      files: files.length ? files.map((f) => ({ path: f.path, name: f.name })) : undefined,
      withSelection: !!(selection && useSelection),
    });
    input.value = '';
    images = [];
    files = [];
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

  /**
   * Puts the slider over the active button.
   *
   * The measurement is taken from the container's *padding* box, because that's
   * what an absolutely-positioned child resolves `left` against — while offsetLeft
   * counts from the border box. The switch has a 1px border, so the two differ by
   * exactly that, and the slider sat one pixel to the right of its button forever.
   * Widths come from the rect, not from offsetWidth: offsetWidth is rounded to a
   * whole pixel and the buttons are not whole pixels wide.
   *
   * (Whoever wrote this before was right about one thing: don't measure while the
   * page is still moving. Hence the guard below and the re-measure on the font,
   * on a resize and after a repaint.)
   */
  function placeMode() {
    const active = modeBox.querySelector('.modeseg-btn.on');
    // Nothing to measure while the header is hidden: better to leave the slider
    // where it is than to pin it to zero and watch it jump later.
    if (!active || !modeBox.offsetParent) return;
    const box = modeBox.getBoundingClientRect();
    const on = active.getBoundingClientRect();
    modeSlider.style.left = on.left - box.left - modeBox.clientLeft + 'px';
    modeSlider.style.width = on.width + 'px';
  }

  function paintMode(value) {
    document.body.dataset.mode = value;
    for (const btn of modeBox.querySelectorAll('.modeseg-btn')) {
      btn.classList.toggle('on', btn.dataset.mode === value);
    }
    modeSlider.className = 'modeseg-slider mode-' + value;
    placeMode();
    requestAnimationFrame(placeMode);
  }

  // The buttons change width when the font arrives, when the sidebar is dragged,
  // and when a label folds away to make room for the activity pill: the slider
  // follows on its own instead of waiting for a click.
  //
  // Every button is watched, not just the box around them. In a tight header the
  // switch can be squeezed by its neighbours, so its own width stays put while the
  // buttons inside it move — and the slider was left behind, a pixel at a time.
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(placeMode);
    ro.observe(modeBox);
    for (const btn of modeBox.querySelectorAll('.modeseg-btn')) ro.observe(btn);
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(placeMode);
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
  /** Only a tab can close itself: the sidebar is always there. */
  let isTab = false;

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
    lang: 'en',
  };
  let models = [];

  // Every effort level has a name and a plain explanation. The words live in
  // i18n.js — here we only keep which levels exist, and in what order.
  const EFFORTS = ['', 'low', 'medium', 'high', 'xhigh', 'max'];
  const effortLabel = (v) => t('effort.' + v);
  const effortDesc = (v) => t('effort.' + v + '.desc');

  const THINKS = ['auto', 'on', 'off'];
  const thinkLabel = (v) => t('think.' + v);
  const thinkDesc = (v) => t('think.' + v + '.desc');

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
    const key = PURPOSE_KEY[tail];
    return (key && t(key)) || tail || String(m.resolved || '');
  }

  /** The handful of phrases the CLI always words the same way: shortened, and said
   *  in whichever language the panel is set to. Anything else it sends comes
   *  through untouched — we can't translate what we've never seen. */
  const PURPOSE_KEY = {
    'Best for everyday, complex tasks': 'model.everyday',
    'Most capable for your hardest and longest-running tasks': 'model.hardest',
    'Efficient for routine tasks': 'model.routine',
    'Fastest for quick answers': 'model.fastest',
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

  /**
   * The order on the two-column grid: Opus and Fable on the top row, Sonnet and
   * Haiku underneath. The ones you reach for when the job is hard sit where the eye
   * lands first. Anything the CLI adds that we don't recognise goes at the bottom,
   * in the order the CLI gave it.
   */
  const FAMILY_ORDER = { opus: 0, fable: 1, sonnet: 2, haiku: 3 };

  function byFamily(a, b) {
    const ra = FAMILY_ORDER[modelFamily(a)] ?? 9;
    const rb = FAMILY_ORDER[modelFamily(b)] ?? 9;
    return ra - rb;
  }

  function paintModels() {
    const list = $('cfgModelList');
    list.replaceChildren();

    if (!models.length) {
      list.append(el('p', 'phint', t('cfg.models.waiting')));
      return;
    }

    // A copy: `models` is what the CLI said, and the order on screen is ours.
    for (const m of [...models].sort(byFamily)) {
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
      // The tick on the one in force. It's built only for that card, so it draws
      // itself the moment the panel is repainted after a choice — which is the
      // moment it means something.
      if (isOn) {
        const badge = el('span', 'mc-check');
        badge.append(icon('checkmark'));
        card.append(badge);
      }
      card.addEventListener('click', () => {
        pulse(card);
        push({ model: value });
      });
      list.append(card);
    }
  }

  /**
   * The receipt for a click, on anything that gets picked.
   *
   * The class is taken off and put back with a reflow in between, so two clicks in
   * a row both land: an animation that is already running does not restart just
   * because the class it hangs off was added again.
   */
  function pulse(node, cls = 'picked') {
    if (!node) return;
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
    setTimeout(() => node.classList.remove(cls), 420);
  }

  /**
   * A dropdown that belongs to this panel.
   *
   * A <select> opens a menu drawn by the operating system: the wrong colours, the
   * wrong corners, and nothing that can be animated — in the middle of a panel
   * where every other choice slides, glows or ticks. This is a button and a list:
   * the list unrolls from the button, its options arrive one behind the other, the
   * one in force carries a tick, and the keyboard does what a <select>'s does
   * (arrows, Home/End, Enter, Escape, and typing a letter jumps to it).
   *
   * @param box       the container (.sel)
   * @param items     [{value, label, icon}]
   * @param value     the one in force
   * @param onChange  called with the chosen value
   */
  function makeSelect(box, items, value, onChange) {
    box.replaceChildren();
    box.classList.remove('open');

    const btn = el('button', 'sel-btn');
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    const cur = items.find((i) => i.value === value) || items[0];
    const val = el('span', 'sel-val', cur ? cur.label : '');
    btn.append(val, icon('chevron-down', 'sel-caret'));
    box.append(btn);
    box.dataset.value = cur ? cur.value : '';

    let list = null;

    const close = (focus) => {
      if (!list) return;
      const dying = list;
      list = null;
      box.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      dying.classList.add('closing');
      // The list leaves with its animation and only then stops existing: taken out
      // on the spot it would vanish, and a menu that vanishes reads as a menu that
      // never opened.
      setTimeout(() => dying.remove(), 160);
      if (focus) btn.focus();
    };

    const open = () => {
      if (list) return close(true);
      list = el('div', 'sel-list');
      list.setAttribute('role', 'listbox');
      items.forEach((it, i) => {
        const opt = el('button', 'sel-opt' + (it.value === box.dataset.value ? ' on' : ''));
        opt.type = 'button';
        opt.setAttribute('role', 'option');
        opt.style.setProperty('--i', i);
        if (it.icon) opt.append(icon(it.icon));
        opt.append(el('span', 'opt-label', it.label));
        if (it.value === box.dataset.value) opt.append(drawnCheck('opt-check'));
        opt.addEventListener('click', () => {
          pulse(opt);
          box.dataset.value = it.value;
          val.textContent = it.label;
          // Long enough for the option to finish its little punch: choosing is the
          // one gesture in the panel that also closes what you chose it from.
          setTimeout(() => close(true), 160);
          onChange(it.value);
        });
        list.append(opt);
      });
      box.append(list);
      box.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
      const on = list.querySelector('.sel-opt.on') || list.firstElementChild;
      if (on) on.classList.add('hot');
    };

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      open();
    });

    /** Arrows, Home/End, Enter, Escape and the first letter: what a <select> does. */
    const move = (d) => {
      if (!list) return open();
      const opts = [...list.querySelectorAll('.sel-opt')];
      const at = opts.findIndex((o) => o.classList.contains('hot'));
      const next = opts[Math.max(0, Math.min(opts.length - 1, (at < 0 ? 0 : at) + d))];
      if (!next) return;
      opts.forEach((o) => o.classList.remove('hot'));
      next.classList.add('hot');
      next.scrollIntoView({ block: 'nearest' });
    };
    box.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') return e.preventDefault(), move(1);
      if (e.key === 'ArrowUp') return e.preventDefault(), move(-1);
      if (e.key === 'Home') return e.preventDefault(), move(-999);
      if (e.key === 'End') return e.preventDefault(), move(999);
      if (e.key === 'Escape' && list) return e.preventDefault(), close(true);
      if ((e.key === 'Enter' || e.key === ' ') && list) {
        e.preventDefault();
        list.querySelector('.sel-opt.hot')?.click();
        return;
      }
      if (/^[a-z0-9]$/i.test(e.key) && list) {
        const opts = [...list.querySelectorAll('.sel-opt')];
        const hit = opts.find((o) => o.textContent.toLowerCase().startsWith(e.key.toLowerCase()));
        if (hit) {
          opts.forEach((o) => o.classList.remove('hot'));
          hit.classList.add('hot');
          hit.scrollIntoView({ block: 'nearest' });
        }
      }
    });

    // A click anywhere else closes it — including on the panel it lives in.
    document.addEventListener('mousedown', (e) => {
      if (list && !box.contains(e.target)) close(false);
    });

    return {
      set(v) {
        const it = items.find((i) => i.value === v);
        if (!it) return;
        box.dataset.value = v;
        val.textContent = it.label;
      },
    };
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
        pulse(btn);
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
    const items = [{ value: '', label: effortLabel('') }].concat(
      levels.map((l) => ({
        value: l,
        label: EFFORTS.includes(l) ? effortLabel(l) : l,
        disabled: noEffort,
      }))
    );
    paintSeg($('cfgEffort'), items, prefs.effort, (v) => push({ effort: v }));
    $('cfgEffortHint').textContent = noEffort
      ? t('effort.none')
      : effortDesc(EFFORTS.includes(prefs.effort) ? prefs.effort : '');
  }

  function paintThinking() {
    const chosen = chosenModel();
    // Not every model can decide on its own how much to think: where they can't,
    // "On" is a fixed token ceiling, not adaptive thinking. Better to say so than to
    // show three buttons that look like they mean the same thing everywhere.
    const adaptive = !chosen || chosen.adaptive !== false;
    const items = THINKS.map((v) => ({ value: v, label: thinkLabel(v) }));
    paintSeg($('cfgThink'), items, prefs.thinking, (v) => push({ thinking: v }));
    const base = THINKS.includes(prefs.thinking) ? thinkDesc(prefs.thinking) : '';
    $('cfgThinkHint').textContent =
      adaptive || prefs.thinking === 'off' ? base : base + t('think.capped');
  }

  /**
   * The language of the whole interface. It's a preference like the others — it
   * lives with the extension and follows you from one window to the next — but it's
   * the only one that redraws the panel you're setting it from, so the switch has
   * to happen before the redraw. `push` handles that.
   */
  function paintLang() {
    const items = [
      { value: 'en', label: 'English' },
      { value: 'it', label: 'Italiano' },
    ];
    paintSeg($('cfgLang'), items, prefs.lang || 'en', (v) => push({ lang: v }));
  }

  /** The sounds, each with the icon that says what kind of thing it is. */
  const SOUNDS = [
    { value: 'cozy', key: 'sound.cozy', icon: 'musical-notes' },
    { value: 'harvest', key: 'sound.harvest', icon: 'musical-notes' },
    { value: 'levelup', key: 'sound.levelup', icon: 'flash' },
    { value: 'starlit', key: 'sound.starlit', icon: 'sparkles' },
    { value: 'chest', key: 'sound.chest', icon: 'cube' },
    { value: 'off', key: 'sound.off', icon: 'close' },
  ];

  /** The dropdown, built once and then only told what the value is. */
  let soundSel = null;

  function paintSound() {
    const items = SOUNDS.map((s) => ({ value: s.value, label: t(s.key), icon: s.icon }));
    // Rebuilt when the language changes (the labels are different words), told the
    // value when only the value changed — otherwise choosing a sound would tear
    // down the very list you chose it from, mid-animation.
    if (!soundSel || $('cfgSound').dataset.lang !== window.I18N.lang) {
      $('cfgSound').dataset.lang = window.I18N.lang;
      soundSel = makeSelect($('cfgSound'), items, prefs.sound, (v) => {
        push({ sound: v });
        previewSound();
      });
    } else {
      soundSel.set(prefs.sound);
    }
    $('cfgSound').classList.toggle('off', false);
  }

  /** The track fills up to the handle: `--v` is what the CSS paints it with. */
  function paintVol() {
    const vol = $('cfgVol');
    const pct = Math.round((prefs.volume == null ? 0.6 : prefs.volume) * 100);
    vol.value = pct;
    vol.style.setProperty('--v', pct + '%');
    vol.disabled = prefs.sound === 'off';
  }

  function paintCfg() {
    paintModels();
    paintEffort();
    paintThinking();
    paintLang();
    paintSound();
    paintVol();
    $('cfgAway').checked = !!prefs.onlyWhenAway;
    $('cfgAsk').checked = !!prefs.soundOnAsk;
    $('cfgToast').checked = !!prefs.toast;
  }

  /** Only what you changed gets sent: the extension already knows the rest. */
  function push(patch) {
    prefs = Object.assign({}, prefs, patch);
    vscode.postMessage({ cmd: 'setPrefs', value: patch });
    // The language has to be in force before anything redraws, or the panel would
    // repaint itself once in the old words and only catch up on the next change.
    if (patch.lang) window.I18N.set(patch.lang);
    else paintCfg();
  }

  /** The sound plays right away: picking one blind makes no sense. */
  function previewSound() {
    if (window.Chime) window.Chime.play(prefs.sound, 'done', prefs.volume);
  }

  /**
   * The panel deals itself out: each row a beat after the one above it.
   *
   * The delay is a number written onto the row (`--i`), not a rule per row in the
   * stylesheet: the panel's sections change with the model — five effort levels or
   * three, a hint that's there or isn't — so what's on screen is only known here.
   */
  function dealCfg() {
    const rows = cfg.querySelectorAll('.pop-sec, .model-list, .seg, .phint, .prow, .pcheck, .pbtn');
    rows.forEach((r, i) => r.style.setProperty('--i', i));
    cfg.classList.remove('dealing');
    void cfg.offsetWidth;
    cfg.classList.add('dealing');
    // Once dealt, the class goes: with it left on, every repaint (a model chosen, a
    // level changed) would deal the whole panel out again under your hand.
    setTimeout(() => cfg.classList.remove('dealing'), 900);
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
      dealCfg();
      wake();
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

  // While you drag only the preview volume changes; it gets saved when you let go.
  // The track is repainted on every step, though: a bar that only catches up when
  // you release is a bar that isn't telling you what you're setting.
  $('cfgVol').addEventListener('input', (e) => {
    prefs.volume = Number(e.target.value) / 100;
    e.target.style.setProperty('--v', e.target.value + '%');
  });
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
  //
  // And the extension is told: with two or three sessions open the conversation
  // that finishes is often one whose page you've never touched, and a page that
  // has never been touched isn't allowed to make a sound. Knowing who can, it
  // sends the chime there instead of into the void (chat/sound.ts).
  let audioSaid = null;
  const tellAudio = (ok) => {
    // Only when it changes: this hangs off every keystroke, and repeating "still
    // awake" a hundred times a minute is noise on the wire for nothing.
    if (audioSaid === !!ok) return;
    audioSaid = !!ok;
    vscode.postMessage({ cmd: 'audio', ok: audioSaid });
  };
  const wake = () => {
    if (audioSaid === true) return; // already awake: nothing left to unlock
    if (window.Chime) window.Chime.unlock(tellAudio);
  };
  document.addEventListener('pointerdown', wake);
  document.addEventListener('keydown', wake);
  // Worth a try straight away: some hosts allow it, and the ones that don't just
  // say no — the first gesture then puts it right.
  wake();

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
        // A new session is a new tab, not this one wiped: whatever is running here
        // keeps running.
        e.preventDefault();
        vscode.postMessage({ cmd: 'newTab' });
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
        if (!isTab) return;
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

  // ---------- switching language ----------
  //
  // i18n.apply() has already rewritten everything the HTML declared. What's left is
  // the parts this file builds by hand: they get drawn again from the same state.
  // The conversation itself is deliberately left alone — those are Claude's words
  // and yours, and translating them would be a lie. Only the chrome moves.
  window.I18N.onChange(() => {
    paintCfg();
    setBusy(busy);
    // The empty state is ours to redraw; a conversation in progress isn't.
    if (log.querySelector('.empty')) showEmpty();
    const label = waiting && waiting.querySelector('.pulse-label');
    if (label) label.textContent = t('msg.thinking');
    paintActivity();
    paintAttach();
    // An open menu still holds the old words: it's rebuilt against what you typed.
    if (picking && !menu.hidden) refreshMenu();
    // The buttons change width in another language: the slider follows.
    paintMode(document.body.dataset.mode || 'default');
    placeAllSegs();
  });

  window.I18N.apply();
  showEmpty();
  setBusy(false);
  paintMode('default');
  paintCfg();
  // The mode slider positions itself after the first render
  requestAnimationFrame(() => paintMode(document.body.dataset.mode || 'default'));
  vscode.postMessage({ cmd: 'ready' });
})();
