import { localDay, addDays } from './days.ts';
export interface Session { ts: number; seconds: number; wellName?: string }
export interface InsightFacts { sessions: number; activeDays: number; minutes: number; topWell?: string; topPart?: 'morning' | 'afternoon' | 'evening' | 'night'; longestMinutes: number; longestDay?: string; streak: number; target: number; done: number }
const part = (h: number) => (h >= 5 && h < 12 ? 'morning' : h < 17 && h >= 12 ? 'afternoon' : h >= 17 && h < 22 ? 'evening' : 'night') as NonNullable<InsightFacts['topPart']>;
const hourIn = (ts: number, tz: string) => { try { return Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(new Date(ts))) % 24; } catch { return new Date(ts).getUTCHours(); } };
export function insightFacts(sessions: Session[], today: string, tz: string, streak: number, target: number, done: number): InsightFacts {
  const from = addDays(today, -6);
  const mine = sessions.filter((s) => { const d = localDay(s.ts, tz); return d >= from && d <= today; });
  const tally = <K extends string>(keys: K[]) => { const m = new Map<K, number>(); keys.forEach((k) => m.set(k, (m.get(k) ?? 0) + 1)); return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]; };
  const longest = mine.reduce((a, s) => (s.seconds > (a?.seconds ?? 0) ? s : a), undefined as Session | undefined);
  return {
    sessions: mine.length, activeDays: new Set(mine.map((s) => localDay(s.ts, tz))).size, minutes: Math.round(mine.reduce((n, s) => n + s.seconds, 0) / 60),
    topWell: tally(mine.map((s) => s.wellName).filter((x): x is string => !!x)), topPart: tally(mine.map((s) => part(hourIn(s.ts, tz)))),
    longestMinutes: longest ? Math.max(1, Math.round(longest.seconds / 60)) : 0,
    longestDay: longest ? new Intl.DateTimeFormat('en', { timeZone: tz, weekday: 'long' }).format(new Date(longest.ts)) : undefined, streak, target, done,
  };
}
/** Plain, kind sentences built from the numbers. Used when no AI is configured, and as the check on what the AI is allowed to say. */
export function insightText(f: InsightFacts): string {
  if (!f.sessions) return 'A quiet week so far. One short listen is enough to begin your thread again.';
  const a = [`You listened on ${f.activeDays} ${f.activeDays === 1 ? 'day' : 'days'} this week, ${f.minutes} ${f.minutes === 1 ? 'minute' : 'minutes'} in all.`];
  if (f.topPart) a.push(`${f.topPart[0].toUpperCase()}${f.topPart.slice(1)} is when you listen most${f.topWell ? `, and ${f.topWell} is the well you return to` : ''}.`);
  if (f.longestMinutes > 1 && f.longestDay) a.push(`Your longest session was ${f.longestDay}, ${f.longestMinutes} minutes.`);
  if (f.done < f.target) a.push(`${f.target - f.done} more ${f.target - f.done === 1 ? 'day' : 'days'} reaches your weekly target.`);
  return a.join(' ');
}
const SHAME = /\b(fail(ed|ure)?|lazy|disappoint\w*|guilt\w*|shame\w*|you (should have|didn't|missed)|behind|god (is|was) (angry|disappointed|watching))\b/i;
export const cleanInsight = (t: unknown): string | null => (typeof t === 'string' && t.trim().length >= 30 && t.length <= 500 && !SHAME.test(t) && !/https?:/.test(t) ? t.replace(/\s+/g, ' ').trim() : null);
export const insightPrompt = (f: InsightFacts): { system: string; user: string } => ({
  system: 'You write a short, warm weekly summary of someone\u2019s Scripture listening. Use only the numbers given. Never mention doctrine, never promise outcomes, never shame or pressure. Two or three plain sentences. No quotes from Scripture.',
  user: JSON.stringify(f),
});
