export const XP = { save_passage: 10, add_to_well: 5, create_well: 15, order_well: 20, write_note: 5, listen_day: 5 } as const;
export type XpKind = keyof typeof XP;
export const isXpKind = (k: unknown): k is XpKind => typeof k === 'string' && k in XP;
/** XP is for capturing and organising Scripture. A daily cap stops farming, and each action only counts once per passage per day. */
export const DAILY_XP_CAP = 100;
/** A listen counts toward the thread once the day's listening reaches this many seconds. */
export const LISTEN_MIN_SECONDS = 60;
export const DEFAULT_TARGET_DAYS = 5;
export const REST_DAYS_PER_WEEK = 1;
export const xpAward = (kind: XpKind, earnedToday: number): number => Math.max(0, Math.min(XP[kind], DAILY_XP_CAP - earnedToday));

export const LEVELS = [{ min: 0, name: 'Spool' }, { min: 100, name: 'Strand' }, { min: 250, name: 'Weaver' }, { min: 400, name: 'Braider' }, { min: 650, name: 'Loom keeper' }, { min: 1000, name: 'Master weaver' }] as const;
export interface LevelInfo { level: number; name: string; xp: number; floor: number; next: number | null; toNext: number; pct: number }
export function levelFor(xp: number): LevelInfo {
  let i = 0;
  for (let k = 0; k < LEVELS.length; k++) if (xp >= LEVELS[k].min) i = k;
  const floor = LEVELS[i].min, next = LEVELS[i + 1]?.min ?? null;
  return { level: i + 1, name: LEVELS[i].name, xp, floor, next, toNext: next === null ? 0 : next - xp, pct: next === null ? 1 : (xp - floor) / (next - floor) };
}

/** Milestones for consistency. Each has one more strand than the last. "Threefold cord" alludes to Ecclesiastes 4:12. */
export const BADGES = [
  { id: 'first-strand', name: 'First strand', days: 3, strands: 1 },
  { id: 'threefold-cord', name: 'Threefold cord', days: 7, strands: 3 },
  { id: 'steady-weave', name: 'Steady weave', days: 30, strands: 5 },
  { id: 'full-tapestry', name: 'Full tapestry', days: 100, strands: 7 },
] as const;
export type Badge = (typeof BADGES)[number];
