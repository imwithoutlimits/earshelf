import { badgeStatus, longestStreak, streakInfo, weeklyProgress } from './streak.ts';
import { insightFacts, insightText, type Session } from './insight.ts';
import { levelFor, LISTEN_MIN_SECONDS, DAILY_XP_CAP, XP } from './rules.ts';
import { weekStart } from './days.ts';

export interface SummaryInput { today: string; tz: string; listenedDays: string[]; xpTotal: number; xpWeek: number; target: number; sessions: Session[] }
/** Everything the Activity screen shows, from plain data. The database reads happen elsewhere so this stays testable. */
export function buildSummary(i: SummaryInput) {
  const thread = streakInfo(i.listenedDays, i.today);
  const longest = Math.max(longestStreak(i.listenedDays), thread.count);
  const weekly = weeklyProgress(i.listenedDays, i.today, i.target);
  const badges = badgeStatus(thread.count, longest);
  const facts = insightFacts(i.sessions, i.today, i.tz, thread.count, i.target, weekly.done);
  return {
    today: i.today, tz: i.tz,
    thread: { ...thread, longest }, weekly, xp: { ...levelFor(i.xpTotal), week: i.xpWeek, dailyCap: DAILY_XP_CAP, values: XP },
    badges: { earned: badges.earned, next: badges.next, progress: badges.progress }, facts, insight: { text: insightText(facts), source: 'computed' as const },
    weekStart: weekStart(i.today),
  };
}
export const listenedDays = (rows: Array<{ day: string; seconds: number }>): string[] => rows.filter((r) => r.seconds >= LISTEN_MIN_SECONDS).map((r) => r.day);
