/** Seconds listened on one local calendar day (YYYY-MM-DD). */
export interface ListeningDay { day: string; seconds: number }

/** Total seconds between two days, both included. */
export function secondsBetween(rows: ListeningDay[], from: string, to: string): number {
  return rows.reduce((n, r) => (r.day >= from && r.day <= to ? n + Math.max(0, r.seconds) : n), 0);
}

/** Whole minutes for display; a short listen that was not zero still shows as 1. */
export const minutesOf = (seconds: number): number => (seconds <= 0 ? 0 : Math.max(1, Math.round(seconds / 60)));

/**
 * One total per day across devices. `remote` is what the server holds (this device's earlier uploads plus every other device's time);
 * `local` is what this device has counted, with `pushed` being the part the server already has. Only the not-yet-uploaded part is added,
 * so nothing is counted twice and nothing is lost while offline.
 */
export function mergeDays(local: Array<ListeningDay & { pushed?: number }>, remote: ListeningDay[]): ListeningDay[] {
  const by = new Map<string, number>();
  for (const r of remote) by.set(r.day, (by.get(r.day) ?? 0) + Math.max(0, r.seconds));
  for (const l of local) by.set(l.day, (by.get(l.day) ?? 0) + Math.max(0, l.seconds - (l.pushed ?? 0)));
  return [...by].map(([day, seconds]) => ({ day, seconds })).sort((a, b) => (a.day < b.day ? -1 : 1));
}
