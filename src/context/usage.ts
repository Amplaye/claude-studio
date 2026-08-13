// How much of the account you've used: the same numbers as "Account & Usage".
//
// The /api/oauth/usage endpoint has a tight limit and every VSCode window has its own
// copy of the extension: with no coordination each one queries on its own, and you
// collect a 429 apiece. So the cache lives in a file, shared between the windows: one
// calls the API when it expires, the others read the file. It survives restarts too,
// so a freshly opened window doesn't sit on "loading..." for nothing.
import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as https from 'node:https';
import * as path from 'node:path';
import { claudeDir, usageCachePath, writeOurFile } from './paths';
import { fmtReset } from './format';

export interface Usage {
  session: number | null;
  sessionResetAt: string | null;
  week: number | null;
  weekResetAt: string | null;
}

const TTL_MS = 30000; // idle nobody is spending: twice a minute is plenty
/**
 * The floor between two calls, `force` included. The TTL alone didn't hold the line:
 * every forced refresh (panel opened, panel back in sight, session born, turn running)
 * skipped it, so a handful of clicks fired a handful of requests back to back and the
 * endpoint answered 429 — and a 429 is exactly what makes the numbers old.
 */
const MIN_GAP_MS = 10000;
/** After a 429: a minute, then double, up to ten. It used to be ten flat, which turned
 *  one unlucky burst into ten minutes of numbers frozen on screen. */
const COOLDOWN_MS = 60000;
const COOLDOWN_MAX_MS = 600000;
/** Past this the cached numbers are shown, but no longer presented as current. */
const STALE_MS = 90000;

const state = {
  data: null as Usage | null,
  ts: 0,
  pending: false,
  cooldownUntil: 0,
  /** When we last knocked, answer or not: the floor counts attempts, not successes. */
  lastTry: 0,
  /** How long the last 429 cost us: the next one costs double. */
  penalty: 0,
};

export function currentUsage(): Usage | null {
  return state.data;
}

/**
 * How old the numbers on screen are. The file cache survives restarts, so a window
 * opened tomorrow morning paints yesterday's percentages instantly and they look
 * live. Sharing the same account across machines and people is exactly when that
 * lies, so the age travels with the data and the panel can say so.
 */
export function usageAgeMs(now = Date.now()): number | null {
  return state.data && state.ts ? Math.max(0, now - state.ts) : null;
}

export function usageIsStale(now = Date.now()): boolean {
  const age = usageAgeMs(now);
  return age !== null && age > STALE_MS;
}

/** What to write until the numbers are there: "queued" isn't "loading". */
export function usageWaitText(now = Date.now()): string {
  if (state.cooldownUntil > now) {
    return 'API limit — retrying ' + fmtReset(new Date(state.cooldownUntil).toISOString(), now);
  }
  return 'loading…';
}

export function loadSharedUsage() {
  try {
    const j = JSON.parse(fs.readFileSync(usageCachePath(), 'utf8'));
    if (j && typeof j.ts === 'number') {
      state.data = j.data || state.data;
      state.ts = j.ts || state.ts;
      state.cooldownUntil = j.cooldownUntil || state.cooldownUntil;
    }
  } catch {
    /* first run, or an old version's cache: we start from scratch */
  }
}

function saveSharedUsage() {
  writeOurFile(usageCachePath(), {
    data: state.data,
    ts: state.ts,
    cooldownUntil: state.cooldownUntil,
  });
}

/**
 * The OAuth token. On macOS it lives in the keychain (the same one the CLI uses); on
 * Windows and Linux the `security` binary doesn't exist and the CLI keeps it in the
 * clear in ~/.claude/.credentials.json. Without this second road the token stays
 * empty and the account numbers never arrive.
 */
export function readOauthToken(): string {
  if (process.platform === 'darwin') {
    try {
      const raw = cp
        .execFileSync('security', ['find-generic-password', '-s', 'Claude Code-credentials', '-w'], {
          timeout: 2000,
          stdio: ['ignore', 'pipe', 'ignore'],
        })
        .toString();
      const tok = JSON.parse(raw)?.claudeAiOauth?.accessToken || '';
      if (tok) return tok;
    } catch {
      /* no keychain: try the file */
    }
  }
  try {
    const raw = fs.readFileSync(path.join(claudeDir(), '.credentials.json'), 'utf8');
    return JSON.parse(raw)?.claudeAiOauth?.accessToken || '';
  } catch {
    return '';
  }
}

/**
 * Asks the API for the numbers, but only if it's this window's turn. It waits for
 * nobody: when the answer arrives it calls `done`, which runs the redraw round again.
 *
 * `force` skips the TTL, and only the TTL. Opening the panel used to schedule a tick
 * that this gate then threw away, so the first thing you saw was whatever the cache
 * held — sometimes hours old — and it stayed that way until the minute lapsed, which
 * in practice meant "it updates a while after I send a prompt". The two guards that
 * protect the endpoint stay in force: a request already in flight is never doubled,
 * and a 429 cooldown is never overridden.
 */
export function refreshUsage(done: () => void, force = false) {
  const now = Date.now();
  if (state.pending) return;
  loadSharedUsage(); // first look at what the other windows have already done
  if (now < state.cooldownUntil) return;
  // `state.ts` comes from the shared file: the floor holds across windows too, not
  // just inside this one.
  if (now - Math.max(state.lastTry, state.ts) < MIN_GAP_MS) return;
  if (!force && state.data && now - state.ts < TTL_MS) return;

  const token = readOauthToken();
  if (!token) return;
  state.pending = true;
  state.lastTry = now;

  const backoff = () => {
    state.penalty = Math.min(state.penalty ? state.penalty * 2 : COOLDOWN_MS, COOLDOWN_MAX_MS);
    state.cooldownUntil = Date.now() + state.penalty;
    saveSharedUsage(); // the cooldown applies to all, not just whoever got the no
    done();
  };

  const req = https.request(
    {
      hostname: 'api.anthropic.com',
      path: '/api/oauth/usage',
      method: 'GET',
      headers: {
        Authorization: 'Bearer ' + token,
        'anthropic-beta': 'oauth-2025-04-20',
        'User-Agent': 'claude-cli/2.1.223 (external, cli)',
      },
      timeout: 5000,
    },
    (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        state.pending = false;
        const code = res.statusCode ?? 0;
        // 429 or a server fault: we wait, and above all we do NOT overwrite the good
        // numbers already cached with an empty answer.
        if (code === 429 || (code >= 500 && code < 600)) return backoff();
        let j: any;
        try {
          j = JSON.parse(body);
        } catch {
          return;
        }
        if (!j || j.error || (!j.five_hour && !j.seven_day)) {
          if (j?.error) backoff();
          return;
        }
        state.data = {
          session: j.five_hour ? j.five_hour.utilization : null,
          sessionResetAt: j.five_hour ? j.five_hour.resets_at : null,
          week: j.seven_day ? j.seven_day.utilization : null,
          weekResetAt: j.seven_day ? j.seven_day.resets_at : null,
        };
        state.ts = Date.now();
        state.cooldownUntil = 0;
        state.penalty = 0;
        saveSharedUsage();
        done();
      });
    }
  );
  req.on('error', () => {
    state.pending = false;
  });
  req.on('timeout', () => {
    state.pending = false;
    req.destroy();
  });
  req.end();
}
