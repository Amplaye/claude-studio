// Is that PID still the process that wrote the session file?
//
// `process.kill(pid, 0)` only answers "does a process with this number exist".
// On Windows the numbers get recycled within minutes: a dead `claude` leaves its
// ~/.claude/sessions/<pid>.json behind, some unrelated program is given the same
// number, and the card of a conversation nobody has open any more stays lit for
// hours. That's the ghost session — the panel saying "here" about something that
// no longer exists is worse than saying nothing.
//
// The identity of a process isn't its number, it's the number *plus* when it
// started. The CLI already writes that down (`procStart`, a Windows FILETIME),
// and the operating system can be asked the same thing. If the two don't match,
// the number has been handed to somebody else.
//
// Asking costs a process spawn, so it's done rarely (a snapshot every twenty
// seconds at most), never synchronously, and the answer is used only when it's
// certain: with no snapshot, or with a snapshot older than the session itself,
// nothing gets hidden. A card wrongly on screen is a nuisance; a live card
// wrongly hidden would be a lie.
import * as cp from 'node:child_process';

/** How long a snapshot is worth using before asking again. */
const TTL_MS = 20000;
/** Clock skew and rounding between what the CLI wrote and what the OS says. */
const SLACK_MS = 5000;

let snap = new Map<number, number>(); // pid -> start, epoch ms
let snapAt = 0; // when the snapshot was taken
let asking = false;

/** Windows FILETIME (100ns since 1601) -> epoch ms. */
export function fileTimeToMs(v: unknown): number | null {
  const n = typeof v === 'string' || typeof v === 'number' ? Number(v) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = n / 10000 - 11644473600000;
  return ms > 0 && ms < Date.now() + 60000 ? ms : null;
}

/** The last snapshot, if it's still worth something. */
function fresh(): boolean {
  return snap.size > 0 && Date.now() - snapAt < TTL_MS * 3;
}

/**
 * Takes (asynchronously) the list of running processes with their start time.
 * Never throws, never blocks: if it fails, we simply stay without an opinion.
 */
export function refreshProcs(then?: () => void) {
  if (asking || Date.now() - snapAt < TTL_MS) return;
  asking = true;
  const started = Date.now();
  const done = (out: string) => {
    asking = false;
    const map = parse(out);
    // An empty answer isn't an answer: better to keep the previous snapshot than
    // to declare that nothing is running.
    if (map.size) {
      snap = map;
      snapAt = started;
      then?.();
    }
  };

  try {
    if (process.platform === 'win32') {
      // -f formatting instead of nested quotes: the argument travels as a single
      // string, with no shell in the middle to reinterpret it.
      const script =
        "Get-Process | ForEach-Object { try { '{0} {1}' -f $_.Id, " +
        "[int64]($_.StartTime.ToUniversalTime() - [datetime]'1970-01-01').TotalMilliseconds } catch { } }";
      cp.execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
        { timeout: 9000, windowsHide: true, maxBuffer: 4 << 20 },
        (_e, stdout) => done(String(stdout || ''))
      );
    } else {
      // etime, not lstart: "12:34" parses the same in every language.
      cp.execFile(
        'ps',
        ['-A', '-o', 'pid=,etime='],
        { timeout: 9000, maxBuffer: 4 << 20 },
        (_e, stdout) => done(String(stdout || ''))
      );
    }
  } catch {
    asking = false; // no powershell, no ps: we go on without the check
  }
}

function parse(out: string): Map<number, number> {
  const map = new Map<number, number>();
  const now = Date.now();
  for (const line of out.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    const m = s.match(/^(\d+)\s+(.+)$/);
    if (!m) continue;
    const pid = Number(m[1]);
    if (!pid) continue;
    const rest = m[2].trim();
    if (process.platform === 'win32') {
      const ms = Number(rest);
      if (Number.isFinite(ms) && ms > 0) map.set(pid, ms);
    } else {
      const secs = etimeSeconds(rest);
      if (secs != null) map.set(pid, now - secs * 1000);
    }
  }
  return map;
}

/** "[[dd-]hh:]mm:ss" -> seconds. */
function etimeSeconds(s: string): number | null {
  const m = s.match(/^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/);
  if (!m) return null;
  const [, d, h, mi, se] = m;
  return Number(d || 0) * 86400 + Number(h || 0) * 3600 + Number(mi) * 60 + Number(se);
}

/**
 * Is the process behind this session file somebody else by now?
 *
 * Only says yes when it's sure: the snapshot has to exist, and it has to have
 * been taken after the session was born — otherwise a conversation opened three
 * seconds ago would look like a ghost just because nobody had looked yet.
 */
export function recycledPid(pid: number, startedAt: number, procStart: unknown): boolean {
  if (!fresh()) return false;
  const born = fileTimeToMs(procStart) ?? startedAt ?? 0;
  if (!born || snapAt < born) return false;

  const seen = snap.get(pid);
  // The number is alive (the caller checked) but it isn't in the list of the
  // processes we can see: it belongs to somebody else, not to our CLI.
  if (seen == null) return true;
  // It's in the list, but it started after the session file was written: that
  // file was left behind by the previous owner of the number.
  return seen > born + SLACK_MS;
}
