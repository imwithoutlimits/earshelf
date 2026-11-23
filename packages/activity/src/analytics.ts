import { addDays, dayIndex, weekStart } from './days.ts';
import { longestStreak, streakInfo } from './streak.ts';

/** Streak analytics (Pro): the same activity the Free streak uses, looked at over time. Pure. */
export interface DayEvent { day: string; kind: string; amount: number }
export interface Analytics {
  current: number;
  longest: number;
  activeDays30: number;
  /** Active days in each of the last 8 weeks, oldest first, Monday-based. */
  weeks: Array<{ start: string; days: number }>;
  /** Share of the active days in the last 30 that fell on each weekday, Monday = index 0. */
  byWeekday: number[];
  bestWeekday: number | null;
  /** Total event amount per kind over the last 30 days, biggest first. */
  kinds: Array<{ kind: string; amount: number }>;
}

export function analytics(events: readonly DayEvent[], today: string): Analytics {
  const days = new Set(events.map((e) => e.day));
  const from30 = addDays(today, -29);
  const in30 = [...days].filter((d) => d >= from30 && d <= today);
  const thisWeek = weekStart(today);
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = addDays(thisWeek, -7 * (7 - i));
    const end = addDays(start, 6);
    return { start, days: [...days].filter((d) => d >= start && d <= end).length };
  });
  const counts = [0, 0, 0, 0, 0, 0, 0];
  in30.forEach((d) => { counts[dayIndex(d)] += 1; });
  const max = Math.max(...counts);
  const kinds = new Map<string, number>();
  events.filter((e) => e.day >= from30 && e.day <= today).forEach((e) => kinds.set(e.kind, (kinds.get(e.kind) ?? 0) + e.amount));
  return {
    current: streakInfo(days, today).count,
    longest: longestStreak([...days]),
    activeDays30: in30.length,
    weeks,
    byWeekday: counts.map((c) => (in30.length ? c / in30.length : 0)),
    bestWeekday: max > 0 ? counts.indexOf(max) : null,
    kinds: [...kinds.entries()].map(([kind, amount]) => ({ kind, amount })).sort((a, b) => b.amount - a.amount),
  };
}
