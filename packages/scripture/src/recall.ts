/**
 * Spaced recall for memorized passages (Pro). A small SM-2 style scheduler: passages you recall well come back less and less often,
 * passages you struggle with come back tomorrow. Pure and deterministic. The basic fixed-interval nextReview() in memorize.ts is unchanged
 * and is what Free and Plus keep using.
 */
export interface RecallState { ease: number; intervalDays: number; reps: number; lapses: number }
export type Confidence = 1 | 2 | 3 | 4 | 5;
const DAY = 86_400_000;
export const START_EASE = 2.5, MIN_EASE = 1.3, MAX_INTERVAL_DAYS = 180;

export function scheduleRecall(prev: Partial<RecallState> | undefined, confidence: Confidence, now = Date.now()): RecallState & { reviewAt: number } {
  const ease0 = prev?.ease ?? START_EASE, reps0 = prev?.reps ?? 0, int0 = prev?.intervalDays ?? 0, lapses0 = prev?.lapses ?? 0;
  const q = confidence; // 1..5, used as the SM-2 quality grade
  const ease = Math.max(MIN_EASE, +(ease0 + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))).toFixed(3));
  let reps: number, intervalDays: number, lapses = lapses0;
  if (q < 3) { reps = 0; intervalDays = 1; lapses += 1; }
  else {
    reps = reps0 + 1;
    intervalDays = reps === 1 ? 1 : reps === 2 ? (q === 5 ? 4 : 3) : Math.max(int0 + 1, Math.round(int0 * ease));
  }
  intervalDays = Math.min(MAX_INTERVAL_DAYS, intervalDays);
  return { ease, intervalDays, reps, lapses, reviewAt: now + intervalDays * DAY };
}

export interface MemoLike { ref: string; reviewAt: number; intervalDays?: number }
/** Passages due now, the most overdue first. */
export function dueRecall<T extends MemoLike>(memos: readonly T[], now = Date.now()): T[] {
  return memos.filter((m) => m.reviewAt <= now).sort((a, b) => a.reviewAt - b.reviewAt);
}
export interface RecallSummary { total: number; dueNow: number; dueThisWeek: number; solid: number }
/** "Solid" means the gap before the next review is three weeks or more. */
export function recallSummary(memos: readonly MemoLike[], now = Date.now()): RecallSummary {
  return {
    total: memos.length,
    dueNow: memos.filter((m) => m.reviewAt <= now).length,
    dueThisWeek: memos.filter((m) => m.reviewAt > now && m.reviewAt <= now + 7 * DAY).length,
    solid: memos.filter((m) => (m.intervalDays ?? 0) >= 21).length,
  };
}
