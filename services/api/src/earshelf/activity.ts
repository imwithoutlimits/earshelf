import { addDays, isDay, localDay, validTimeZone } from '../../../../packages/activity/src/index.ts';
import { rest } from '../supa.ts';
import type { HttpError } from '../entitlements.ts';

// Listening time for earshelf, kept in the shared activity_days table under product 'earshelf' so it follows the person across devices.
// Tapestry's own activity route is not touched. Writes go through record_activity (service role), as RLS allows only reads from the app.
type Json = Record<string, unknown>;
interface Ctx { user: { id: string }; body: Json; query: URLSearchParams }
interface Route { auth: boolean; run: (c: Ctx) => Promise<unknown> }
interface Deps { limit: (key: string, max: number, windowMs: number) => void; bad: (m: string) => HttpError }

/** How far back a device that was offline may report. Older time is refused rather than moved to a different day. */
export const REPORT_WINDOW_DAYS = 30;

export type Checked = { ok: true; day: string; seconds: number } | { ok: false; message: string };
/** Checks one report from a device: a day inside the window and between 1 second and 4 hours of listening. */
export function checkReport(body: Json, now: number): Checked {
  const tz = typeof body.tz === 'string' && validTimeZone(body.tz) ? body.tz : 'UTC';
  const today = localDay(now, tz);
  if (!isDay(body.day) || body.day < addDays(today, -REPORT_WINDOW_DAYS) || body.day > addDays(today, 1)) return { ok: false, message: 'That day is outside the days that can be reported.' };
  const seconds = Math.round(Number(body.seconds));
  if (!(seconds >= 1 && seconds <= 14400)) return { ok: false, message: 'Listening time must be between 1 second and 4 hours.' };
  return { ok: true, day: body.day, seconds };
}

export function earshelfActivityRoutes({ limit, bad }: Deps): Record<string, Route> {
  return {
    'POST /v1/earshelf/activity': { auth: true, run: async (c) => {
      limit(`e-act:${c.user.id}`, 600, 3600_000);
      const r = checkReport(c.body, Date.now());
      if (!r.ok) throw bad(r.message);
      // No points are awarded in earshelf: amount 0 only adds the seconds to the day.
      await rest('rpc/record_activity', { method: 'POST', body: { p_user: c.user.id, p_product: 'earshelf', p_kind: 'listen', p_ref: null, p_day: r.day, p_seconds: r.seconds, p_amount: 0, p_cap: 0 } });
      return { ok: true };
    } },
  };
}
