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

const TTL_MS = 60000; // the numbers refresh every minute, one window only
const COOLDOWN_MS = 600000; // after a 429 we keep quiet for ten minutes

const state = {
  data: null as Usage | null,
  ts: 0,
  pending: false,
  cooldownUntil: 0,
};

export function currentUsage(): Usage | null {
  return state.data;
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
 */
export function refreshUsage(done: () => void) {
  const now = Date.now();
  if (state.pending) return;
  loadSharedUsage(); // first look at what the other windows have already done
  if (now < state.cooldownUntil) return;
  if (state.data && now - state.ts < TTL_MS) return;

  const token = readOauthToken();
  if (!token) return;
  state.pending = true;

  const backoff = () => {
    state.cooldownUntil = Date.now() + COOLDOWN_MS;
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
