// The formatters from context-bar 0.0.6, carried over as they were: they're already
// tuned for what reads well in a narrow column. They stand on their own because both
// the status bar and the panel use them, and the tests call them directly.

/** "in 2h 15m" — how long until a reset. */
export function fmtReset(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const d = Date.parse(iso);
  if (Number.isNaN(d)) return '';
  const totalMin = Math.max(0, Math.round((d - now) / 60000));
  if (totalMin === 0) return 'in <1 min';
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  const parts: string[] = [];
  if (days) parts.push(days + 'd');
  if (hours) parts.push(hours + 'h');
  if (mins || !parts.length) parts.push(mins + 'm');
  return 'in ' + parts.join(' ');
}

/** "now", "12 min ago", "3h ago", "2d ago". */
export function fmtAgo(ms: number, now = Date.now()): string {
  const diff = Math.max(0, now - ms);
  if (diff < 45000) return 'now';
  const min = Math.round(diff / 60000);
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** "14:32" — the time of the last activity. */
export function fmtClock(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "18.2k", "1.4M": nobody reads token counts written out in full. */
export function fmtTokens(n: number): string {
  if (!n) return '0';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'k';
  return String(Math.round(n));
}

/** "1M", "200k": the context window, written short. */
export function fmtLimit(n: number): string {
  return n >= 1e6 ? n / 1e6 + 'M' : Math.round(n / 1000) + 'k';
}
