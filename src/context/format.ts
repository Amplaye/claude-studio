// I formattatori della context-bar 0.0.6, portati com'erano: sono gia' tarati su
// quello che si legge bene in una colonna stretta. Stanno da soli perche' li usano
// sia la barra di stato sia il pannello, e le prove li chiamano direttamente.

/** "tra 2h 15m" — quanto manca a un reset. */
export function fmtReset(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const d = Date.parse(iso);
  if (Number.isNaN(d)) return '';
  const totalMin = Math.max(0, Math.round((d - now) / 60000));
  if (totalMin === 0) return 'tra <1 min';
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  const parts: string[] = [];
  if (days) parts.push(days + 'g');
  if (hours) parts.push(hours + 'h');
  if (mins || !parts.length) parts.push(mins + 'm');
  return 'tra ' + parts.join(' ');
}

/** "adesso", "12 min fa", "3h fa", "2g fa". */
export function fmtAgo(ms: number, now = Date.now()): string {
  const diff = Math.max(0, now - ms);
  if (diff < 45000) return 'adesso';
  const min = Math.round(diff / 60000);
  if (min < 60) return `${min} min fa`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h fa`;
  return `${Math.floor(h / 24)}g fa`;
}

/** "14:32" — l'ora dell'ultimo movimento. */
export function fmtClock(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "18.2k", "1.4M": i token per esteso non li legge nessuno. */
export function fmtTokens(n: number): string {
  if (!n) return '0';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'k';
  return String(Math.round(n));
}

/**
 * Il costo la 0.0.6 lo raccoglieva e lo buttava via: non era mostrato da nessuna
 * parte. Qui si mostra, quindi serve scriverlo. Sotto il centesimo si va a tre
 * decimali, altrimenti tutte le conversazioni corte sembrerebbero costare "$0.00".
 */
export function fmtCost(usd: number): string {
  if (!usd) return '$0';
  if (usd < 0.01) return '$' + usd.toFixed(3);
  if (usd < 10) return '$' + usd.toFixed(2);
  return '$' + Math.round(usd);
}

/** "1M", "200k": la finestra di contesto, scritta corta. */
export function fmtLimit(n: number): string {
  return n >= 1e6 ? n / 1e6 + 'M' : Math.round(n / 1000) + 'k';
}
