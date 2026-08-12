// Quanto hai consumato dell'account: gli stessi numeri di "Account & Usage".
//
// L'endpoint /api/oauth/usage ha un limite stretto e ogni finestra di VSCode ha la
// sua copia dell'estensione: senza coordinamento ognuna interroga per conto suo, e
// vi becca un 429 a testa. La cache sta quindi su file, condivisa fra le finestre:
// una sola chiama l'API quando scade, le altre leggono il file. Sopravvive anche ai
// riavvii, cosi' una finestra appena aperta non resta su "caricamento..." per niente.
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

const TTL_MS = 60000; // i numeri si rinfrescano ogni minuto, una finestra sola
const COOLDOWN_MS = 600000; // dopo un 429 si sta zitti dieci minuti

const state = {
  data: null as Usage | null,
  ts: 0,
  pending: false,
  cooldownUntil: 0,
};

export function currentUsage(): Usage | null {
  return state.data;
}

/** Cosa scrivere finche' i numeri non ci sono: "in coda" non e' "sto caricando". */
export function usageWaitText(now = Date.now()): string {
  if (state.cooldownUntil > now) {
    return 'limite API — riprovo ' + fmtReset(new Date(state.cooldownUntil).toISOString(), now);
  }
  return 'caricamento…';
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
    /* prima accensione, o cache di una versione vecchia: si riparte da zero */
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
 * Il token OAuth. Su macOS sta nel portachiavi (lo stesso della CLI); su Windows e
 * Linux il binario `security` non esiste e la CLI lo tiene in chiaro in
 * ~/.claude/.credentials.json. Senza questa seconda strada il token resta vuoto e
 * i numeri dell'account non arrivano mai.
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
      /* nessun portachiavi: si prova col file */
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
 * Chiede i numeri all'API, ma solo se tocca a questa finestra. Non aspetta nessuno:
 * quando la risposta arriva chiama `done`, che rifa' il giro di disegno.
 */
export function refreshUsage(done: () => void) {
  const now = Date.now();
  if (state.pending) return;
  loadSharedUsage(); // prima si guarda cosa hanno gia' fatto le altre finestre
  if (now < state.cooldownUntil) return;
  if (state.data && now - state.ts < TTL_MS) return;

  const token = readOauthToken();
  if (!token) return;
  state.pending = true;

  const backoff = () => {
    state.cooldownUntil = Date.now() + COOLDOWN_MS;
    saveSharedUsage(); // il cooldown vale per tutte, non solo per chi ha preso il no
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
        // 429 o guasto del server: si aspetta, e soprattutto NON si sovrascrivono
        // i numeri buoni gia' in cache con una risposta vuota.
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
