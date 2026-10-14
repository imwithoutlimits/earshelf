import { addDays, dayIndex, weekStart } from './days.ts';
import { BADGES, REST_DAYS_PER_WEEK, type Badge } from './rules.ts';

export interface Streak { count: number; atRisk: boolean; todayDone: boolean; restUsedThisWeek: number; restAvailable: number }

/** The thread: consecutive listening days. One missed day per week is bridged by a rest day (it keeps the thread whole but does not add to the count).
 *  Today not yet being done never breaks anything; it only makes the thread "at risk". */
export function streakInfo(days: Iterable<string>, today: string, restPerWeek = REST_DAYS_PER_WEEK): Streak {
  const set = days instanceof Set ? (days as Set<string>) : new Set(days);
  const used: Record<string, number> = {};
  let count = 0;
  const todayDone = set.has(today);
  if (todayDone) count++;
  let cur = addDays(today, -1);
  for (;;) {
    if (set.has(cur)) { count++; cur = addDays(cur, -1); continue; }
    const wk = weekStart(cur);
    if ((used[wk] ?? 0) < restPerWeek && set.has(addDays(cur, -1))) { used[wk] = (used[wk] ?? 0) + 1; cur = addDays(cur, -1); continue; }
    break;
  }
  const restUsedThisWeek = used[weekStart(today)] ?? 0;
  return { count, todayDone, atRisk: !todayDone && count > 0, restUsedThisWeek, restAvailable: Math.max(0, restPerWeek - restUsedThisWeek) };
}
export function longestStreak(days: string[], restPerWeek = REST_DAYS_PER_WEEK): number {
  const set = new Set(days); let best = 0;
  for (const d of set) best = Math.max(best, streakInfo(set, d, restPerWeek).count);
  return best;
}

export interface Weekly { done: number; target: number; remaining: number; daysLeft: number; met: boolean; reachable: boolean; doneDays: boolean[] }
/** Monday to Sunday. daysLeft counts today only while it is still open. */
export function weeklyProgress(days: Iterable<string>, today: string, target: number): Weekly {
  const set = new Set(days), start = weekStart(today), idx = dayIndex(today);
  const doneDays = Array.from({ length: 7 }, (_, i) => set.has(addDays(start, i)));
  const done = doneDays.filter(Boolean).length;
  const daysLeft = 6 - idx + (doneDays[idx] ? 0 : 1);
  return { done, target, remaining: Math.max(0, target - done), daysLeft, met: done >= target, reachable: done >= target || done + daysLeft >= target, doneDays };
}

export function badgeStatus(current: number, longest: number): { earned: Badge[]; next: Badge | null; progress: number } {
  const earned = BADGES.filter((b) => longest >= b.days);
  const next = BADGES.find((b) => longest < b.days) ?? null;
  return { earned, next, progress: next ? Math.min(1, current / next.days) : 1 };
}
