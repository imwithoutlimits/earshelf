import test from 'node:test';
import assert from 'node:assert/strict';
import { analytics } from './analytics.ts';

const ev = (day: string, kind = 'listen_day', amount = 1) => ({ day, kind, amount });

test('no activity: everything is zero and there is no best day', () => {
  const a = analytics([], '2026-11-21');
  assert.deepEqual([a.current, a.longest, a.activeDays30, a.bestWeekday], [0, 0, 0, null]);
  assert.equal(a.weeks.length, 8);
  assert.ok(a.weeks.every((w) => w.days === 0));
});

test('current and longest streak, and active days in the last 30', () => {
  const days = ['2026-11-21', '2026-11-20', '2026-11-19', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-09-01'];
  const a = analytics(days.map((d) => ev(d)), '2026-11-21');
  assert.equal(a.current, 3);
  assert.equal(a.longest, 5);
  assert.equal(a.activeDays30, 8, 'the day in September is outside the last 30 days');
});

test('weeks run Monday to Sunday, oldest first, and count active days', () => {
  // 2026-11-21 is a Saturday: its week starts Monday 2026-11-16.
  const a = analytics(['2026-11-16', '2026-11-18', '2026-11-21', '2026-11-10'].map((d) => ev(d)), '2026-11-21');
  assert.equal(a.weeks[7].start, '2026-11-16');
  assert.equal(a.weeks[7].days, 3);
  assert.equal(a.weeks[6].start, '2026-11-09');
  assert.equal(a.weeks[6].days, 1);
});

test('best weekday and the mix of what was done', () => {
  const a = analytics([ev('2026-11-16', 'listen_day', 2), ev('2026-11-09', 'write_note', 1), ev('2026-11-10', 'listen_day', 3)], '2026-11-21');
  assert.equal(a.bestWeekday, 0, 'two of three active days were Mondays');
  assert.deepEqual(a.kinds, [{ kind: 'listen_day', amount: 5 }, { kind: 'write_note', amount: 1 }]);
  assert.ok(Math.abs(a.byWeekday[0] - 2 / 3) < 1e-9);
});
