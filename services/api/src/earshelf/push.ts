import { addDays, isDay, listenedDays, localDay, streakInfo, validTimeZone } from '../../../../packages/activity/src/index.ts';
import { DEFAULT_NOTIFY, QUIET_FROM, QUIET_UNTIL, localClock, planNotification, type NotifyKind, type NotifyPrefs } from '../../../../packages/core/src/notify.ts';
import { rest } from '../supa.ts';
import type { HttpError } from '../entitlements.ts';
import { sendWebPush, type SendResult, type Subscription, type Vapid } from './webpush.ts';

// Reminder notifications for earshelf. Subscriptions live in the shared `notifications` table (kind 'push_subscription', product 'earshelf'),
// and what has been sent today lives there too (kind 'push_sent'), so no new table is needed. Which reminder to send and when is decided
// by planNotification() in packages/core, which is pure and tested on its own.
type Json = Record<string, unknown>;
interface Ctx { user: { id: string }; body: Json; query: URLSearchParams }
interface Route { auth: boolean; run: (c: Ctx) => Promise<unknown> }
interface Deps { limit: (key: string, max: number, windowMs: number) => void; bad: (m: string) => HttpError }

const PRODUCT = 'earshelf';
const MAX_DEVICES = 10;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** The server's sender identity, from the environment. Null when push is not set up. */
export function vapidFromEnv(env: Record<string, string | undefined> = process.env): Vapid | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim(), privateKey = env.VAPID_PRIVATE_KEY?.trim(), subject = env.VAPID_SUBJECT?.trim();
  return publicKey && privateKey && subject && /^(mailto:|https:\/\/)/.test(subject) ? { publicKey, privateKey, subject } : null;
}

/**
 * Only real push services are allowed as subscription addresses. Without this, anyone signed in could register an address such as
 * an internal service and make this server send requests to it.
 */
const PUSH_HOSTS = ['fcm.googleapis.com', 'android.googleapis.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com'];
export function isPushServiceUrl(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && !u.port && !u.username && endpoint.length <= 1000 && PUSH_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch { return false; }
}

export interface StoredPush {
  sub: Subscription; tz: string; prefs: NotifyPrefs; since: string; updatedAt: string;
  book: { id: string; title: string; chapter?: string; minutesLeft: number } | null;
  next: { id: string; title: string; minutes: number } | null;
}
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const num = (v: unknown, max: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0; };

/** Validates and tidies what a device sends when it subscribes or refreshes what it knows about the person's reading. */
export function checkSubscribe(body: Json, now: number): { ok: true; deviceId: string; payload: StoredPush } | { ok: false; message: string } {
  const deviceId = str(body.deviceId, 64);
  if (!UUID.test(deviceId)) return { ok: false, message: 'That device id is not valid.' };
  const sub = body.subscription as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | undefined;
  const endpoint = typeof sub?.endpoint === 'string' ? sub.endpoint : '';
  const p256dh = str(sub?.keys?.p256dh, 200), auth = str(sub?.keys?.auth, 100);
  if (!isPushServiceUrl(endpoint)) return { ok: false, message: 'That push address is not from a supported push service.' };
  if (!p256dh || !auth) return { ok: false, message: 'The push subscription is incomplete.' };
  const tz = typeof body.tz === 'string' && validTimeZone(body.tz) ? body.tz : 'UTC';
  const p = (body.prefs ?? {}) as Json;
  const time = typeof p.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(p.time) ? p.time : DEFAULT_NOTIFY.time;
  const prefs: NotifyPrefs = { daily: p.daily !== false, continue: p.continue !== false, streak: p.streak !== false, time };
  const b = body.book as Json | null | undefined, n = body.next as Json | null | undefined;
  const book = b && UUID.test(str(b.id, 64)) && str(b.title, 200) ? { id: str(b.id, 64), title: str(b.title, 200), chapter: str(b.chapter, 120) || undefined, minutesLeft: num(b.minutesLeft, 60000) } : null;
  const next = n && UUID.test(str(n.id, 64)) && str(n.title, 200) ? { id: str(n.id, 64), title: str(n.title, 200), minutes: num(n.minutes, 60000) } : null;
  const since = isDay(body.since) ? body.since : localDay(now, tz);
  return { ok: true, deviceId, payload: { sub: { endpoint, keys: { p256dh, auth } }, tz, prefs, since, updatedAt: new Date(now).toISOString(), book, next } };
}

/* ---------------- the scheduled round ---------------- */
export interface RoundDeps {
  rest: <T = unknown>(path: string, init?: { method?: string; body?: unknown; prefer?: string }) => Promise<T>;
  send: (sub: Subscription, message: unknown) => Promise<SendResult>;
  now: () => number;
}
interface Row { id: string; user_id: string; payload: StoredPush }

const daysBetween = (a: string, b: string) => Math.max(0, Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000));

/** Looks at everyone who has reminders on and sends the one that is due, if any. Safe to run every few minutes. */
export async function runPushRound(d: RoundDeps): Promise<{ users: number; sent: number; removed: number }> {
  const now = d.now();
  const rows = await d.rest<Row[]>(`notifications?select=id,user_id,payload&product=eq.${PRODUCT}&kind=eq.push_subscription&limit=5000`);
  const byUser = new Map<string, Row[]>();
  for (const r of rows ?? []) (byUser.get(r.user_id) ?? byUser.set(r.user_id, []).get(r.user_id)!).push(r);
  let sent = 0, removed = 0;

  for (const [userId, subs] of byUser) {
    try {
      const latest = subs.reduce((a, b) => (String(b.payload.updatedAt) > String(a.payload.updatedAt) ? b : a));
      const p = latest.payload;
      const clock = localClock(now, p.tz);
      if (clock.minutes >= QUIET_FROM || clock.minutes < QUIET_UNTIL) continue; // nothing is sent at night, so do not even look
      const [days, logged] = await Promise.all([
        d.rest<Array<{ day: string; seconds: number }>>(`activity_days?select=day,seconds&user_id=eq.${userId}&product=eq.${PRODUCT}&day=gte.${addDays(clock.day, -60)}`),
        d.rest<Array<{ payload: { kind?: string; day?: string } }>>(`notifications?select=payload&user_id=eq.${userId}&product=eq.${PRODUCT}&kind=eq.push_sent&created_at=gte.${new Date(now - 36 * 3600_000).toISOString()}`),
      ]);
      const listened = listenedDays(days ?? []);
      const streak = streakInfo(listened, clock.day);
      const last = [...listened].sort().at(-1);
      const anchor = [last, p.since].filter((x): x is string => !!x).sort().at(-1) ?? clock.day;
      const planned = planNotification({
        now, tz: p.tz, prefs: p.prefs ?? DEFAULT_NOTIFY, listenedToday: streak.todayDone || listened.includes(clock.day), streak: streak.count,
        lastBook: p.book, nextBook: p.next,
        sentToday: (logged ?? []).filter((x) => x.payload?.day === clock.day).map((x) => x.payload.kind as NotifyKind),
        daysIdle: daysBetween(anchor, clock.day),
      });
      if (!planned) continue;

      let delivered = 0;
      for (const s of subs) {
        const res = await d.send(s.payload.sub, { title: planned.title, body: planned.body, url: planned.url, tag: planned.tag });
        if (res.ok) delivered++;
        else if (res.gone) { await d.rest(`notifications?id=eq.${s.id}&user_id=eq.${userId}`, { method: 'DELETE', prefer: 'return=minimal' }); removed++; }
      }
      if (delivered) {
        sent++;
        await d.rest('notifications', { method: 'POST', prefer: 'return=minimal', body: { user_id: userId, product: PRODUCT, kind: 'push_sent', payload: { kind: planned.kind, day: clock.day, tag: planned.tag } } });
      }
    } catch (e) {
      console.error(`push: skipped a person after an error: ${e instanceof Error ? e.message : e}`);
    }
  }
  // Keep the log short: only today's and yesterday's matter.
  await d.rest(`notifications?product=eq.${PRODUCT}&kind=eq.push_sent&created_at=lt.${new Date(now - 3 * 86400_000).toISOString()}`, { method: 'DELETE', prefer: 'return=minimal' }).catch(() => undefined);
  return { users: byUser.size, sent, removed };
}

/** Runs the round every ten minutes while the server is up. One server instance only: with several, each would send. */
export function startPushScheduler(intervalMs = 10 * 60_000): (() => void) | null {
  const vapid = vapidFromEnv();
  if (!vapid) { console.log('push reminders are off (set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT to turn them on)'); return null; }
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await runPushRound({ rest, send: (sub, msg) => sendWebPush(sub, msg, vapid), now: () => Date.now() });
      if (r.sent || r.removed) console.log(`push: sent ${r.sent}, removed ${r.removed} dead subscriptions, ${r.users} people with reminders on`);
    } catch (e) { console.error('push round failed', e); } finally { running = false; }
  };
  const first = setTimeout(() => void tick(), 30_000);
  const t = setInterval(() => void tick(), intervalMs);
  t.unref?.(); first.unref?.();
  console.log('push reminders are on');
  return () => { clearTimeout(first); clearInterval(t); };
}

/* ---------------- routes the app calls ---------------- */
export function earshelfPushRoutes({ limit, bad }: Deps): Record<string, Route> {
  return {
    'GET /v1/earshelf/push/config': { auth: true, run: async () => { const v = vapidFromEnv(); return { enabled: !!v, publicKey: v?.publicKey ?? '' }; } },

    'POST /v1/earshelf/push/subscribe': { auth: true, run: async (c) => {
      limit(`push-sub:${c.user.id}`, 60, 3600_000);
      if (!vapidFromEnv()) throw bad('Reminders are not switched on for this server yet.');
      const r = checkSubscribe(c.body, Date.now());
      if (!r.ok) throw bad(r.message);
      // The device id is the row id, so make sure it is not someone else's row, and that one person cannot register unlimited devices.
      const mine = await rest<Array<{ id: string; user_id: string }>>(`notifications?select=id,user_id&product=eq.${PRODUCT}&kind=eq.push_subscription&or=(id.eq.${r.deviceId},user_id.eq.${c.user.id})`);
      if (mine.some((x) => x.id === r.deviceId && x.user_id !== c.user.id)) throw bad('That device id is already in use.');
      if (!mine.some((x) => x.id === r.deviceId) && mine.filter((x) => x.user_id === c.user.id).length >= MAX_DEVICES) throw bad(`Reminders can be on for up to ${MAX_DEVICES} devices. Turn them off on one you no longer use.`);
      await rest('notifications', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { id: r.deviceId, user_id: c.user.id, product: PRODUCT, kind: 'push_subscription', payload: r.payload } });
      return { ok: true };
    } },

    'POST /v1/earshelf/push/unsubscribe': { auth: true, run: async (c) => {
      const id = str(c.body.deviceId, 64);
      if (!UUID.test(id)) throw bad('That device id is not valid.');
      await rest(`notifications?id=eq.${id}&user_id=eq.${c.user.id}&kind=eq.push_subscription`, { method: 'DELETE', prefer: 'return=minimal' });
      return { ok: true };
    } },

    'POST /v1/earshelf/push/test': { auth: true, run: async (c) => {
      limit(`push-test:${c.user.id}`, 6, 3600_000);
      const vapid = vapidFromEnv();
      if (!vapid) throw bad('Reminders are not switched on for this server yet.');
      const rows = await rest<Row[]>(`notifications?select=id,user_id,payload&user_id=eq.${c.user.id}&product=eq.${PRODUCT}&kind=eq.push_subscription`);
      let sent = 0;
      for (const r of rows) {
        const res = await sendWebPush(r.payload.sub, { title: 'earshelf reminders are on', body: 'This is how a reminder will look. Tap to open earshelf.', url: '/', tag: 'earshelf-test' }, vapid);
        if (res.ok) sent++;
        else if (res.gone) await rest(`notifications?id=eq.${r.id}&user_id=eq.${c.user.id}`, { method: 'DELETE', prefer: 'return=minimal' });
      }
      return { sent, devices: rows.length };
    } },
  };
}
