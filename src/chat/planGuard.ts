// Il plan mode, deciso qui: leggere si', cambiare no, e nessuno viene interpellato.
//
// In plan mode la CLI chiede il permesso per tutto quello che non sa da se' essere
// innocuo, e ogni domanda diventava una scheda nella chat: «Claude vuole usare Bash»
// mentre tu volevi solo un piano. Ma il plan mode per definizione non cambia niente,
// quindi la risposta e' gia' scritta: quello che legge passa, quello che cambierebbe
// qualcosa si rifiuta da solo, e il modello lo scrive nel piano invece di farlo.
//
// «Approva tutto» sarebbe stata la lettura alla lettera della richiesta, ma un comando
// sbagliato girerebbe senza che nessuno lo veda. Rifiutare da soli non toglie niente a
// chi pianifica: un piano non ha bisogno di scrivere da nessuna parte, se non nel suo
// file.
//
// Puro: niente `vscode`, niente disco. La cartella dei piani, la piattaforma e la
// cartella di lavoro arrivano da fuori, cosi' scripts/plan-check.cjs prova ogni caso da
// qualunque macchina.
import * as nodePath from 'node:path';

export interface GuardCtx {
  /** Dove vanno i piani: vedi context/paths.ts, `plansDir`. */
  plansDir: string;
  platform: NodeJS.Platform;
  /** Per i percorsi relativi. Senza, un percorso relativo non passa. */
  cwd?: string;
}

export type Decision = { ok: true } | { ok: false; why: string };

/** Strumenti che non cambiano niente, o che passano da qui per ogni loro passo. */
const ALWAYS = new Set([
  'Read',
  'Glob',
  'Grep',
  'LS',
  'NotebookRead',
  'WebFetch',
  'WebSearch',
  'ToolSearch',
  'Skill',
  'TodoWrite',
  'TaskCreate',
  'TaskUpdate',
  'TaskList',
  'TaskGet',
  // Un sub-agent eredita il plan mode, e le sue richieste tornano qui una per una:
  // lanciarlo non cambia niente, e quello che fara' lo giudica questa stessa regola.
  'Agent',
  'Task',
  'ListAgents',
]);

/** Gli strumenti di Studio: il ponte con l'editor e la memoria. */
const OURS = /^mcp__(editor|memoria)__/;

/** I verbi che, in testa al nome di uno strumento MCP, dicono «guardo e basta». */
const MCP_READ = /^(get|list|read|search|find|fetch|describe|show|view)(_|$)/i;

/** Gli strumenti che scrivono un file: dentro la cartella dei piani, e basta. */
const WRITERS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

/**
 * La decisione su uno strumento, in plan mode.
 *
 * `why` va al modello, in inglese come il resto di quello che legge: dice cosa non
 * passa e perche', in modo che lo scriva nel piano invece di riprovarci per un'altra
 * strada.
 */
export function planDecision(tool: string, input: Record<string, unknown>, ctx: GuardCtx): Decision {
  if (ALWAYS.has(tool) || OURS.test(tool)) return { ok: true };

  const mcp = tool.match(/^mcp__(.+?)__(.+)$/);
  if (mcp) {
    return MCP_READ.test(mcp[2])
      ? { ok: true }
      : { ok: false, why: `${tool} is not a read-only tool` };
  }

  if (WRITERS.has(tool)) {
    const raw = input?.file_path ?? input?.notebook_path ?? input?.path;
    if (typeof raw !== 'string' || !raw.trim()) return { ok: false, why: `${tool} has no file to write` };
    return inPlans(raw, ctx)
      ? { ok: true }
      : { ok: false, why: `${tool} on ${raw} is outside the plans folder (${ctx.plansDir})` };
  }

  if (tool === 'Bash' || tool === 'PowerShell') {
    const cmd = input?.command;
    if (typeof cmd !== 'string' || !cmd.trim()) return { ok: false, why: `${tool} with no command` };
    const bad = shellVerdict(cmd, tool === 'PowerShell');
    return bad ? { ok: false, why: `\`${cut(cmd, 120)}\` ${bad}` } : { ok: true };
  }

  return { ok: false, why: `${tool} can change something` };
}

/** Il file sta dentro la cartella dei piani? Su Windows le maiuscole non contano. */
export function inPlans(file: string, ctx: GuardCtx): boolean {
  const p = ctx.platform === 'win32' ? nodePath.win32 : nodePath.posix;
  const fold = (s: string) => (ctx.platform === 'win32' ? s.toLowerCase() : s);
  let target = file.trim();
  if (!p.isAbsolute(target)) {
    if (!ctx.cwd) return false;
    target = p.join(ctx.cwd, target);
  }
  // `normalize` scioglie i `..`: una fuga scritta come `plans/../../x` resta fuori.
  const base = fold(p.normalize(ctx.plansDir)).replace(/[\\/]+$/, '');
  const full = fold(p.normalize(target));
  const rel = p.relative(base, full);
  return !!rel && !rel.startsWith('..') && !p.isAbsolute(rel);
}

// ---- i comandi ---------------------------------------------------------------

/** Comandi che leggono e basta, cosi' come sono. */
const READ_CMDS = new Set([
  'cd', 'ls', 'dir', 'cat', 'type', 'head', 'tail', 'wc', 'cut', 'grep', 'rg', 'findstr', 'jq', 'diff',
  'echo', 'printf', 'pwd', 'which', 'where', 'file', 'stat', 'du', 'df', 'tree', 'basename', 'dirname',
  'realpath', 'date', 'sort', 'uniq', 'find', 'sed', 'git', 'npm',
]);

/** In PowerShell, oltre ai `Get-*` e ai `Format-*`: i cmdlet che guardano, e i loro nomi corti. */
const PS_READ = new Set([
  'select-string', 'test-path', 'resolve-path', 'measure-object', 'select-object', 'sort-object',
  'gci', 'gc', 'gi', 'gl', 'sls', 'select', 'measure', 'ft', 'fl', 'fw',
]);

const GIT_READ = new Set([
  'status', 'log', 'show', 'diff', 'blame', 'rev-parse', 'ls-files', 'ls-tree', 'grep', 'describe',
  'shortlog', 'cat-file', 'show-ref', 'merge-base',
]);

const NPM_READ = new Set(['ls', 'list', 'view', 'outdated', 'explain']);

/**
 * Cosa non va in un comando da shell, o `''` se e' tutto lettura.
 *
 * Ogni pezzo — diviso su `&&`, `||`, `;`, `|`, `&` e a capo, fuori dalle virgolette —
 * deve cominciare con un comando che legge. Niente `$(…)` ne' backtick, che fanno
 * girare un comando dentro un altro, e nessuna redirezione che non vada a `/dev/null`,
 * a `$null` o da un canale all'altro (`2>&1`).
 */
export function shellVerdict(cmd: string, powershell: boolean): string {
  if (/\$\(|`/.test(cmd)) return 'runs a command inside another one';
  const lexed = lex(cmd, powershell);
  if (typeof lexed === 'string') return lexed;
  for (const words of lexed) {
    const bad = pieceVerdict(words, powershell);
    if (bad) return bad;
  }
  return '';
}

/**
 * Il comando a pezzi, ognuno a parole, senza le virgolette. O il motivo per cui non
 * si arriva in fondo (una redirezione che scrive).
 */
function lex(cmd: string, powershell: boolean): string[][] | string {
  const pieces: string[][] = [];
  let words: string[] = [];
  let word = '';
  let has = false; // la parola c'e' anche se e' vuota: ''
  const endWord = () => {
    if (has) words.push(word);
    word = '';
    has = false;
  };
  const endPiece = () => {
    endWord();
    if (words.length) pieces.push(words);
    words = [];
  };

  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (c === "'") {
      const j = cmd.indexOf("'", i + 1);
      if (j < 0) return 'has an unclosed quote';
      word += cmd.slice(i + 1, j);
      has = true;
      i = j;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let s = '';
      for (; j < cmd.length && cmd[j] !== '"'; j++) {
        if (cmd[j] === '\\' && !powershell && j + 1 < cmd.length) s += cmd[++j];
        else s += cmd[j];
      }
      if (j >= cmd.length) return 'has an unclosed quote';
      word += s;
      has = true;
      i = j;
      continue;
    }
    // In PowerShell una parentesi o una graffa fuori dalle virgolette sono codice:
    // `Get-Item (Remove-Item x)` cancella prima di leggere, e un blocco `{ … }` dentro
    // Select-Object gira come qualunque altro. Fra virgolette sono lettere e basta
    // ("Program Files (x86)").
    if (powershell && (c === '(' || c === '{')) return 'has a script block or an expression in it';
    if (c === '\\' && !powershell && i + 1 < cmd.length) {
      // `\` a capo continua la riga; davanti a qualunque altra cosa la toglie di mezzo.
      if (cmd[i + 1] !== '\n') {
        word += cmd[i + 1];
        has = true;
      }
      i++;
      continue;
    }
    if (c === '\n' || c === '\r' || c === ';') {
      endPiece();
      continue;
    }
    if (c === '|') {
      if (cmd[i + 1] === '|') i++;
      endPiece();
      continue;
    }
    if (c === '>' || c === '<' || (c === '&' && cmd[i + 1] === '>')) {
      const r = redirect(cmd, i, has ? word : '');
      if (typeof r === 'string') return r;
      // Il numero davanti (`2>`) era finito nella parola: non e' un argomento.
      if (r.ate) {
        word = '';
        has = false;
      }
      endWord();
      i = r.end - 1;
      continue;
    }
    if (c === '&') {
      if (cmd[i + 1] === '&') i++;
      endPiece();
      continue;
    }
    if (c === ' ' || c === '\t') {
      endWord();
      continue;
    }
    word += c;
    has = true;
  }
  endPiece();
  return pieces;
}

/**
 * Una redirezione che comincia in `at`. Passano solo quelle che non scrivono niente:
 * verso `/dev/null` o `$null`, e da un canale all'altro (`2>&1`, `>&2`).
 */
function redirect(cmd: string, at: number, before: string): { end: number; ate: boolean } | string {
  let i = at;
  // `2>`, `*>`: il canale sta nella parola appena scritta, attaccato al segno.
  const ate = /^(\d+|\*)$/.test(before);
  if (cmd[i] === '<') return 'reads from a redirection';
  if (cmd[i] === '&') i++; // &>
  i++; // >
  if (cmd[i] === '>' || cmd[i] === '|') i++; // >> o >|
  if (cmd[i] === '&') {
    // 2>&1, >&2: da un canale all'altro, nessun file.
    const m = cmd.slice(i).match(/^&(\d)/);
    if (m) return { end: i + m[0].length, ate };
    return 'redirects to a file';
  }
  while (cmd[i] === ' ' || cmd[i] === '\t') i++;
  const m = cmd.slice(i).match(/^("?)(\/dev\/null|\$null|nul)\1(?=$|[\s;|&)])/i);
  if (!m) return 'writes to a file';
  return { end: i + m[0].length, ate };
}

/** Un pezzo del comando: la prima parola dice chi e', le altre cosa gli si chiede. */
function pieceVerdict(words: string[], powershell: boolean): string {
  const [first, ...rest] = words;
  const name = powershell ? first.toLowerCase() : first;
  const known = READ_CMDS.has(name) || (powershell && (PS_READ.has(name) || /^(get|format)-[a-z]/.test(name)));
  if (!known) return `runs ${first}, which is not a read-only command`;

  switch (name) {
    case 'find':
      return rest.some((w) => /^-(delete|exec|execdir|ok|okdir|fprint0?|fprintf|fls)$/.test(w))
        ? 'is a find that changes or runs things'
        : '';
    case 'sed':
      return sedVerdict(rest);
    case 'sort':
      return rest.some((w) => /^--output/.test(w) || /^-[a-zA-Z]*o/.test(w))
        ? 'is a sort that writes its output to a file'
        : '';
    case 'uniq':
      return rest.filter((w) => !w.startsWith('-')).length > 1 ? 'is a uniq that writes its output to a file' : '';
    case 'tree':
      return rest.some((w) => w.startsWith('-o')) ? 'is a tree that writes to a file' : '';
    case 'file':
      return rest.some((w) => w === '-C' || w === '--compile') ? 'is a file that compiles a magic file' : '';
    case 'rg':
      return rest.some((w) => w === '--pre' || w.startsWith('--pre=')) ? 'is an rg that runs a preprocessor' : '';
    case 'date':
      return rest.some((w) => w === '-s' || w.startsWith('--set')) ? 'sets the clock' : '';
    case 'git':
      return gitVerdict(rest);
    case 'npm': {
      const sub = rest.find((w) => !w.startsWith('-'));
      return sub && NPM_READ.has(sub) ? '' : `is npm ${sub ?? 'with no command'}, which is not read-only`;
    }
  }
  return '';
}

/** `sed` solo con `-n` e senza `-i`, e con script che stampano e basta. */
function sedVerdict(args: string[]): string {
  const scripts: string[] = [];
  let quiet = false;
  let sawScript = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-n' || a === '--quiet' || a === '--silent') quiet = true;
    else if (a === '-e' || a === '--expression') {
      scripts.push(args[++i] ?? '');
      sawScript = true;
    } else if (a.startsWith('--expression=')) {
      scripts.push(a.slice('--expression='.length));
      sawScript = true;
    } else if (/^-[a-zA-Z]*i|^--in-place/.test(a)) return 'is a sed that edits files in place';
    else if (a === '-f' || a.startsWith('--file')) return 'is a sed that runs a script from a file';
    else if (/^-[nEersuz]+$/.test(a)) {
      if (a.includes('n')) quiet = true;
    } else if (a.startsWith('-')) return `is a sed with ${a}`;
    else if (!sawScript) {
      scripts.push(a);
      sawScript = true;
    }
  }
  if (!quiet) return 'is a sed without -n';
  // Ogni comando dello script: un indirizzo (riga, $, /regex/), forse un intervallo, e
  // poi `p`, `l`, `=` o `q`. Niente `w` che scrive, niente `e` che esegue.
  const addr = String.raw`(?:\d+|\$|/(?:[^/\\]|\\.)*/)`;
  const one = new RegExp(String.raw`^\s*(?:${addr}(?:\s*,\s*(?:${addr}|\+\d+))?)?\s*!?\s*[pl=qQ]\s*$`);
  for (const s of scripts) {
    for (const part of s.split(/[;\n]/)) {
      if (part.trim() && !one.test(part)) return 'is a sed script that does more than print';
    }
  }
  return '';
}

function gitVerdict(args: string[]): string {
  let i = 0;
  // Le opzioni prima del sottocomando. `-c` no: `-c core.pager=…` fa girare qualunque cosa.
  for (; i < args.length && args[i].startsWith('-'); i++) {
    const a = args[i];
    if (a === '-C') i++;
    else if (a === '--no-pager' || a === '-P' || a === '--no-optional-locks') continue;
    else return `is git ${a}`;
  }
  const sub = args[i];
  const rest = args.slice(i + 1);
  if (!sub) return '';
  if (GIT_READ.has(sub)) {
    if (rest.some((w) => w === '--output' || w.startsWith('--output='))) return `is a git ${sub} that writes to a file`;
    if (sub === 'grep' && rest.some((w) => w === '-O' || w.startsWith('--open-files-in-pager'))) {
      return 'is a git grep that opens a pager';
    }
    return '';
  }
  if (sub === 'branch') {
    return refsVerdict('branch', rest, /^-[a-zA-Z]*[dDmMcCfut]/, [
      '--delete', '--move', '--copy', '--force', '--set-upstream-to', '--unset-upstream', '--edit-description',
      '--track', '--no-track', '--create-reflog', '--recurse-submodules',
    ]);
  }
  if (sub === 'tag') {
    return refsVerdict('tag', rest, /^-[a-zA-Z]*[dasfmFue]/, [
      '--delete', '--annotate', '--sign', '--force', '--message', '--file', '--local-user', '--edit', '--create-reflog',
    ]);
  }
  if (sub === 'remote') {
    const op = rest.find((w) => !w.startsWith('-'));
    return !op || op === 'show' || op === 'get-url' ? '' : `is git remote ${op}, which changes the remotes`;
  }
  if (sub === 'config') {
    if (rest.some((w) => /^--(unset|unset-all|add|replace-all|edit|rename-section|remove-section)$/.test(w) || w === '-e')) {
      return 'is a git config that writes';
    }
    const pos = rest.filter((w) => !w.startsWith('-'));
    if (pos[0] === 'get' || pos[0] === 'list') return '';
    if (/^(set|unset|edit|rename-section|remove-section)$/.test(pos[0] ?? '')) return 'is a git config that writes';
    if (rest.some((w) => /^--(get|get-all|get-regexp|get-urlmatch|list)$/.test(w) || w === '-l')) return '';
    return pos.length <= 1 ? '' : 'is a git config that writes';
  }
  return `is git ${sub}, which is not a read-only command`;
}

/**
 * `git branch` e `git tag` leggono quando elencano, e scrivono quando ricevono un
 * nome senza `--list`, o un'opzione che cancella, sposta o forza.
 */
function refsVerdict(what: string, rest: string[], shortWrite: RegExp, longWrite: string[]): string {
  const VALUED = new Set(['--contains', '--no-contains', '--merged', '--no-merged', '--points-at', '--sort', '--format']);
  let listing = false;
  const names: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const w = rest[i];
    if (w === '--list' || w === '-l') listing = true;
    else if (longWrite.some((l) => w === l || w.startsWith(l + '='))) return `is a git ${what} that writes`;
    else if (VALUED.has(w)) i++;
    else if (w.startsWith('--')) continue;
    else if (w.startsWith('-')) {
      if (shortWrite.test(w)) return `is a git ${what} that writes`;
      if (w.includes('l')) listing = true;
    } else names.push(w);
  }
  return names.length && !listing ? `is a git ${what} that creates one` : '';
}

function cut(s: string, n: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}
