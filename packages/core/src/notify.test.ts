import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_NOTIFY, dailyAllowance, localClock, parseTime, planNotification, type NotifyInput } from './notify.ts';

const BOOK = { id: 'b1', title: 'Field Notes on Slow Cities', chapter: 'The long lunch', minutesLeft: 220 };
// Lagos is UTC+1 all year, which makes the local time easy to reason about.
const at = (h: number, m = 0) => Date.parse(`2026-10-15T${String(h - 1).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);
const base = (over: Partial<NotifyInput> = {}): NotifyInput => ({ now: at(8, 5), tz: 'Africa/Lagos', prefs: { ...DEFAULT_NOTIFY }, listenedToday: false, streak: 0, lastBook: BOOK, nextBook: null, sentToday: [], daysIdle: 0, ...over });

test('local clock follows the time zone, and a made-up zone falls back to UTC', () => {
  assert.deepEqual(localClock(Date.parse('2026-10-15T23:30:00Z'), 'Africa/Lagos'), { minutes: 30, day: '2026-10-16' });
  assert.equal(localClock(Date.parse('2026-10-15T12:00:00Z'), 'Not/AZone').minutes, 720);
  assert.equal(parseTime('07:45'), 465); assert.equal(parseTime('nonsense'), 480); assert.equal(parseTime('25:99'), 23 * 60 + 59);
});

test('morning: the daily read names the book and the time left', () => {
  const n = planNotification(base())!;
  assert.equal(n.kind, 'daily'); assert.match(n.body, /Field Notes on Slow Cities/); assert.match(n.body, /3 h 40 min left/); assert.equal(n.url, '/?continue=b1');
});
test('morning with nothing in progress suggests an unstarted book, then an empty shelf', () => {
  assert.match(planNotification(base({ lastBook: null, nextBook: { id: 'n1', title: 'Why Sleep Matters', minutes: 22 } }))!.body, /Start "Why Sleep Matters"/);
  assert.match(planNotification(base({ lastBook: null }))!.body, /Add an article/);
});
test('never once they have listened today, never at night, never before 7', () => {
  assert.equal(planNotification(base({ listenedToday: true })), null);
  for (const h of [22, 23, 3, 6]) assert.equal(planNotification(base({ now: at(h, 10), streak: 9 })), null, `hour ${h}`);
});
test('midday continue only after the morning slot, and only with a book in progress', () => {
  assert.equal(planNotification(base({ now: at(13, 10), sentToday: ['daily'] }))!.kind, 'continue');
  assert.equal(planNotification(base({ now: at(13, 10), lastBook: null })), null);
  assert.equal(planNotification(base({ now: at(13, 10), sentToday: ['daily', 'continue'] })), null);
});
test('evening streak reminder needs a streak worth protecting', () => {
  const eve = at(19, 30);
  const n = planNotification(base({ now: eve, streak: 9, sentToday: ['daily', 'continue'] }))!;
  assert.equal(n.kind, 'streak'); assert.match(n.title, /9-day streak/);
  assert.equal(planNotification(base({ now: eve, streak: 1, sentToday: ['daily', 'continue'] })), null);
  assert.equal(planNotification(base({ now: eve, streak: 9, sentToday: ['daily', 'continue', 'streak'] })), null);
});
test('each kind can be switched off, and the morning time can be moved', () => {
  assert.equal(planNotification(base({ prefs: { ...DEFAULT_NOTIFY, daily: false } })), null);
  assert.equal(planNotification(base({ now: at(8, 5), prefs: { ...DEFAULT_NOTIFY, time: '18:00' } })), null);
  assert.equal(planNotification(base({ now: at(18, 5), prefs: { ...DEFAULT_NOTIFY, time: '18:00' } }))!.kind, 'daily');
});
test('someone who stays away gets fewer, then none', () => {
  assert.deepEqual([0, 2, 3, 6, 7, 13, 14, 60].map(dailyAllowance), [3, 3, 2, 2, 1, 1, 0, 0]);
  assert.equal(planNotification(base({ daysIdle: 14 })), null);
  assert.equal(planNotification(base({ daysIdle: 8, sentToday: ['daily'] })), null);
  assert.equal(planNotification(base({ daysIdle: 8 }))!.kind, 'daily');
});
test('the wording alternates by day but stays short', () => {
  const a = planNotification(base({ now: Date.parse('2026-10-14T07:05:00Z') }))!, b = planNotification(base({ now: Date.parse('2026-10-15T07:05:00Z') }))!;
  assert.ok(a.body.length < 120 && b.body.length < 120);
});
