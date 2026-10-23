import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSubscribe, isPushServiceUrl, runPushRound, vapidFromEnv, type RoundDeps, type StoredPush } from './push.ts';

const DEV = '3f0d9c2e-5b1a-4c7e-9a38-2d6f1e8b7a40';
const BOOK = { id: '9b2f4c1a-7d3e-4f5a-8c6b-1a2b3c4d5e6f', title: 'Field Notes on Slow Cities', chapter: 'The long lunch', minutesLeft: 220 };
const SUB = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc123', keys: { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' } };
const NOW = Date.parse('2026-10-15T07:10:00Z'); // 08:10 in Lagos

test('only real push services are accepted as subscription addresses', () => {
  for (const ok of ['https://fcm.googleapis.com/fcm/send/x', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://web.push.apple.com/x', 'https://wns2-par02p.notify.windows.com/w/?token=x']) assert.equal(isPushServiceUrl(ok), true, ok);
  for (const bad of ['http://fcm.googleapis.com/x', 'https://169.254.169.254/latest', 'https://localhost/x', 'https://internal.example.com/x', 'https://fcm.googleapis.com.evil.com/x', 'https://user:pw@fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x', 'not a url', '']) assert.equal(isPushServiceUrl(bad), false, bad);
});

test('a good subscription is tidied and stored; bad ones are refused with a reason', () => {
  const r = checkSubscribe({ deviceId: DEV, subscription: SUB, tz: 'Africa/Lagos', prefs: { daily: true, continue: false, time: '07:30' }, book: BOOK, next: null }, NOW);
  assert.ok(r.ok); if (!r.ok) return;
  assert.equal(r.deviceId, DEV); assert.deepEqual(r.payload.prefs, { daily: true, continue: false, streak: true, time: '07:30' });
  assert.equal(r.payload.since, '2026-10-15'); assert.equal(r.payload.book?.minutesLeft, 220); assert.equal(r.payload.tz, 'Africa/Lagos');
  assert.equal(checkSubscribe({ deviceId: 'nope', subscription: SUB }, NOW).ok, false);
  assert.equal(checkSubscribe({ deviceId: DEV, subscription: { ...SUB, endpoint: 'https://evil.example.com/x' } }, NOW).ok, false);
  assert.equal(checkSubscribe({ deviceId: DEV, subscription: { endpoint: SUB.endpoint, keys: {} } }, NOW).ok, false);
  const odd = checkSubscribe({ deviceId: DEV, subscription: SUB, tz: 'Not/AZone', prefs: { time: '99:99' }, book: { id: 'x', title: 't' } }, NOW);
  assert.ok(odd.ok); if (odd.ok) { assert.equal(odd.payload.tz, 'UTC'); assert.equal(odd.payload.prefs.time, '08:00'); assert.equal(odd.payload.book, null); }
});

test('VAPID settings are only used when all three are present and the subject is a mailto or https address', () => {
  assert.equal(vapidFromEnv({}), null);
  assert.equal(vapidFromEnv({ VAPID_PUBLIC_KEY: 'a', VAPID_PRIVATE_KEY: 'b' }), null);
  assert.equal(vapidFromEnv({ VAPID_PUBLIC_KEY: 'a', VAPID_PRIVATE_KEY: 'b', VAPID_SUBJECT: 'owner@x.org' }), null);
  assert.deepEqual(vapidFromEnv({ VAPID_PUBLIC_KEY: 'a', VAPID_PRIVATE_KEY: 'b', VAPID_SUBJECT: 'mailto:owner@x.org' }), { publicKey: 'a', privateKey: 'b', subject: 'mailto:owner@x.org' });
});

/** A small fake database and push service for running a whole round. */
function world(over: { payload?: Partial<StoredPush>; days?: Array<{ day: string; seconds: number }>; logged?: Array<{ payload: { kind: string; day: string } }>; sendResult?: { ok: true } | { ok: false; gone: boolean; status: number }; now?: number } = {}) {
  const payload: StoredPush = { sub: SUB, tz: 'Africa/Lagos', prefs: { daily: true, continue: true, streak: true, time: '08:00' }, since: '2026-10-10', updatedAt: '2026-10-14T10:00:00Z', book: BOOK, next: null, ...over.payload };
  const calls: Array<{ path: string; method: string; body?: unknown }> = [];
  const sentMsgs: unknown[] = [];
  const deps: RoundDeps = {
    now: () => over.now ?? NOW,
    rest: (async (path: string, init: { method?: string; body?: unknown } = {}) => {
      calls.push({ path, method: init.method ?? 'GET', body: init.body });
      if (path.startsWith('notifications?select=id,user_id,payload') && path.includes('push_subscription')) return [{ id: DEV, user_id: 'u1', payload }];
      if (path.startsWith('activity_days')) return over.days ?? [];
      if (path.includes('kind=eq.push_sent') && (init.method ?? 'GET') === 'GET') return over.logged ?? [];
      return null;
    }) as RoundDeps['rest'],
    send: async (_sub, msg) => { sentMsgs.push(msg); return over.sendResult ?? { ok: true }; },
  };
  return { deps, calls, sentMsgs };
}

test('a round sends the morning reminder with the book and records that it was sent', async () => {
  const w = world();
  const r = await runPushRound(w.deps);
  assert.deepEqual(r, { users: 1, sent: 1, removed: 0 });
  const m = w.sentMsgs[0] as { title: string; body: string; url: string };
  assert.equal(m.title, 'Your daily read'); assert.match(m.body, /Field Notes on Slow Cities/); assert.match(m.body, /3 h 40 min left/); assert.match(m.url, /^\/\?continue=9b2f/);
  const log = w.calls.find((c) => c.method === 'POST' && c.path === 'notifications');
  assert.deepEqual((log!.body as { payload: unknown }).payload, { kind: 'daily', day: '2026-10-15', tag: 'earshelf-daily' });
});

test('nothing is sent if it was already sent today, after listening, at night, or after weeks away', async () => {
  const already = world({ logged: [{ payload: { kind: 'daily', day: '2026-10-15' } }] });
  assert.equal((await runPushRound(already.deps)).sent, 0);
  const listened = world({ days: [{ day: '2026-10-15', seconds: 300 }] });
  assert.equal((await runPushRound(listened.deps)).sent, 0);
  const night = world({ now: Date.parse('2026-10-15T22:30:00Z') }); // 23:30 in Lagos
  assert.equal((await runPushRound(night.deps)).sent, 0);
  assert.equal(night.calls.some((c) => c.path.startsWith('activity_days')), false, 'it should not even look people up at night');
  const away = world({ payload: { since: '2026-08-01' }, days: [{ day: '2026-09-20', seconds: 900 }] }); // 25 days since last listening
  assert.equal((await runPushRound(away.deps)).sent, 0);
});

test('the evening streak reminder fires for someone with a streak who has not listened today', async () => {
  const days = ['2026-10-14', '2026-10-13', '2026-10-12', '2026-10-11'].map((day) => ({ day, seconds: 600 }));
  const w = world({ now: Date.parse('2026-10-15T18:40:00Z'), days, logged: [{ payload: { kind: 'daily', day: '2026-10-15' } }, { payload: { kind: 'continue', day: '2026-10-15' } }] });
  assert.equal((await runPushRound(w.deps)).sent, 1);
  assert.match((w.sentMsgs[0] as { title: string }).title, /4-day streak/);
});

test('a subscription the push service says is gone is removed, and nothing is logged as sent', async () => {
  const w = world({ sendResult: { ok: false, gone: true, status: 410 } });
  assert.deepEqual(await runPushRound(w.deps), { users: 1, sent: 0, removed: 1 });
  assert.ok(w.calls.some((c) => c.method === 'DELETE' && c.path.startsWith(`notifications?id=eq.${DEV}`)));
  assert.equal(w.calls.some((c) => c.method === 'POST' && c.path === 'notifications'), false);
});
