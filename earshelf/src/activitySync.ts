import { db } from './db';
import { apiPost, supabase } from './supabase';
import { reportError } from './monitor';

// Listening time follows the person across devices. This device counts its own time in db.listening (works offline, works signed out).
// When signed in, the time the server has not seen yet is sent to the API, and the server's per-day totals are copied back for the Activity screen.
const PRODUCT = 'earshelf';
const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
let running: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

async function signedIn(): Promise<boolean> {
  if (!supabase || (typeof navigator !== 'undefined' && !navigator.onLine)) return false;
  const { data } = await supabase.auth.getSession();
  return !!data.session;
}

/** Sends time the server has not seen. A failed send changes nothing, so it is simply tried again next time. */
export async function pushListening(): Promise<void> {
  for (const row of await db.listening.toArray()) {
    let sent = row.pushed ?? 0;
    while (row.seconds - sent >= 1) {
      const chunk = Math.min(14400, Math.floor(row.seconds - sent)); // the server accepts up to 4 hours per report
      await apiPost('/v1/earshelf/activity', { day: row.day, seconds: chunk, tz: tz() });
      sent += chunk;
      await db.listening.update(row.day, { pushed: sent });
    }
  }
}

/** Copies the server's per-day totals (all devices) for roughly the last 13 months. */
export async function pullListening(): Promise<void> {
  if (!supabase) return;
  const from = new Date(Date.now() - 400 * 86400000).toISOString().slice(0, 10);
  const { data, error } = await supabase.from('activity_days').select('day,seconds').eq('product', PRODUCT).gte('day', from);
  if (error) throw error;
  await db.transaction('rw', db.remoteDays, async () => {
    await db.remoteDays.clear();
    await db.remoteDays.bulkPut((data ?? []).map((r: { day: string; seconds: number }) => ({ day: r.day, seconds: r.seconds })));
  });
}

/** One round trip: send what is new, then bring back the totals. Never throws; the Activity screen keeps working from what is on the device. */
export function syncListening(): Promise<void> {
  if (running) return running;
  running = (async () => {
    try {
      if (!(await signedIn())) return;
      await pushListening();
      await pullListening();
    } catch (e) {
      reportError(e instanceof Error ? e : new Error(String((e as { message?: string })?.message ?? e)), 'activity-sync');
    } finally { running = null; }
  })();
  return running;
}

/** Called after each local save while listening: sends a little later so a session goes up as one report, not many. */
export function syncListeningSoon(ms = 30_000): void {
  if (timer || !supabase) return;
  timer = setTimeout(() => { timer = null; void syncListening(); }, ms);
}
