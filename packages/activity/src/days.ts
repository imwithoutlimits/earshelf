/** Days are local calendar dates ("2026-10-09") in the person's own time zone, so a streak never breaks because of UTC. */
export function localDay(ts: number, tz = 'UTC'): string {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts)); }
  catch { return new Date(ts).toISOString().slice(0, 10); }
}
const toUtc = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
export const addDays = (d: string, n: number): string => new Date(toUtc(d) + n * 86_400_000).toISOString().slice(0, 10);
/** Monday of the week containing the day. */
export const weekStart = (d: string): string => { const dow = (new Date(toUtc(d)).getUTCDay() + 6) % 7; return addDays(d, -dow); };
export const dayIndex = (d: string): number => (new Date(toUtc(d)).getUTCDay() + 6) % 7; // Monday = 0
export const isDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(toUtc(s));
export const validTimeZone = (tz: string): boolean => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } };
