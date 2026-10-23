// Deciding which reminder, if any, to send a person right now. Pure, so it can be tested without a server or a clock.
//
// The aim is a few notifications that bring someone back, not a stream that makes them switch notifications off:
//  - never more than 3 a day, never at night, never once they have listened today;
//  - morning "daily read", a midday "continue where you left off", and an evening "your streak is at risk" (only when there is a streak to protect);
//  - fewer and then none as a person stays away: 3 a day, then 2, then 1, then stop after two weeks until they return.

export type NotifyKind = 'daily' | 'continue' | 'streak';

export interface NotifyPrefs { daily: boolean; continue: boolean; streak: boolean; /** morning time, 'HH:MM' on the person's clock */ time: string }
export const DEFAULT_NOTIFY: NotifyPrefs = { daily: true, continue: true, streak: true, time: '08:00' };

export interface NotifyBook { id: string; title: string; chapter?: string; minutesLeft: number }
export interface NotifyInput {
  now: number;
  tz: string;
  prefs: NotifyPrefs;
  listenedToday: boolean;
  /** Current streak in days; 0 when there is none. */
  streak: number;
  /** The book they were in the middle of, if any. */
  lastBook: NotifyBook | null;
  /** A book they have not started, to suggest when nothing is in progress. */
  nextBook: { id: string; title: string; minutes: number } | null;
  /** Kinds already sent today (on the person's clock). */
  sentToday: NotifyKind[];
  /** Whole days since they last listened. Use a large number when they never have. */
  daysIdle: number;
}
export interface Planned { kind: NotifyKind; title: string; body: string; url: string; tag: string }

export const QUIET_FROM = 21 * 60 + 30; // 21:30
export const QUIET_UNTIL = 7 * 60; // 07:00
export const MAX_PER_DAY = 3;
export const GIVE_UP_AFTER_DAYS = 14;

/** Minutes since midnight and the weekday-free calendar day for a moment in a given time zone. */
export function localClock(now: number, tz: string): { minutes: number; day: string } {
  let zone = tz;
  try { new Intl.DateTimeFormat('en', { timeZone: zone }); } catch { zone = 'UTC'; }
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(now);
  const p = (t: string) => parts.find((x) => x.type === t)?.value ?? '00';
  return { minutes: Number(p('hour')) * 60 + Number(p('minute')), day: `${p('year')}-${p('month')}-${p('day')}` };
}

export function parseTime(t: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return 8 * 60;
  const h = Math.min(23, Number(m[1])), min = Math.min(59, Number(m[2]));
  return h * 60 + min;
}

/** How many a day to allow for someone who has been away for this long. */
export function dailyAllowance(daysIdle: number): number {
  if (daysIdle >= GIVE_UP_AFTER_DAYS) return 0;
  if (daysIdle >= 7) return 1;
  if (daysIdle >= 3) return 2;
  return MAX_PER_DAY;
}

const left = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min` : `${Math.max(1, Math.round(min))} min`);
const clip = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** The one notification that is due right now, or null. Meant to be asked every few minutes. */
export function planNotification(i: NotifyInput): Planned | null {
  if (i.listenedToday) return null;
  const { minutes, day } = localClock(i.now, i.tz);
  if (minutes >= QUIET_FROM || minutes < QUIET_UNTIL) return null;
  if (i.sentToday.length >= Math.min(MAX_PER_DAY, dailyAllowance(i.daysIdle))) return null;

  const morning = parseTime(i.prefs.time);
  const variant = Number(day.slice(-2)) % 2; // a different wording on alternate days, so the same line is not seen every morning
  const book = i.lastBook;
  const url = book ? `/?continue=${encodeURIComponent(book.id)}` : '/';
  const has = (k: NotifyKind) => i.sentToday.includes(k);

  // Evening first: it matters most when there is something to lose.
  if (i.prefs.streak && !has('streak') && i.streak >= 2 && minutes >= 19 * 60 && minutes < 21 * 60 + 15) {
    return {
      kind: 'streak', tag: 'earshelf-streak', url,
      title: `Your ${i.streak}-day streak ends tonight`,
      body: variant ? 'One minute of listening keeps it going.' : book ? `One minute of "${clip(book.title)}" keeps it going.` : 'One minute of listening keeps it going.',
    };
  }
  if (i.prefs.continue && !has('continue') && book && minutes >= morning + 300 && minutes < morning + 570) {
    const at = book.chapter ? ` at ${clip(book.chapter, 40)}` : '';
    return {
      kind: 'continue', tag: 'earshelf-continue', url,
      title: variant ? 'Where you left off' : `Back to "${clip(book.title, 40)}"?`,
      body: `"${clip(book.title)}"${at}: ${left(book.minutesLeft)} left. Tap to resume.`,
    };
  }
  if (i.prefs.daily && !has('daily') && minutes >= morning && minutes < morning + 180) {
    if (book) {
      return { kind: 'daily', tag: 'earshelf-daily', url, title: 'Your daily read', body: `Pick up "${clip(book.title)}"${book.chapter ? `, ${clip(book.chapter, 40)}` : ''}. ${left(book.minutesLeft)} left.` };
    }
    if (i.nextBook) {
      return { kind: 'daily', tag: 'earshelf-daily', url: `/?continue=${encodeURIComponent(i.nextBook.id)}`, title: 'Your daily read', body: `Start "${clip(i.nextBook.title)}". About ${left(i.nextBook.minutes)} to listen.` };
    }
    return { kind: 'daily', tag: 'earshelf-daily', url: '/', title: 'Your daily read', body: 'Add an article or a chapter to your shelf and let earshelf read it to you.' };
  }
  return null;
}
