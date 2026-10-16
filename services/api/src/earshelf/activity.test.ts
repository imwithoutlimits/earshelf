import test from 'node:test';
import assert from 'node:assert/strict';
import { checkReport, REPORT_WINDOW_DAYS } from './activity.ts';

const NOW = Date.parse('2026-10-15T12:00:00Z');

test('a report for today or yesterday with sensible seconds is accepted', () => {
  assert.deepEqual(checkReport({ day: '2026-10-15', seconds: 600, tz: 'UTC' }, NOW), { ok: true, day: '2026-10-15', seconds: 600 });
  assert.deepEqual(checkReport({ day: '2026-10-14', seconds: 90.4, tz: 'UTC' }, NOW), { ok: true, day: '2026-10-14', seconds: 90 });
});
test('a device that was offline can report up to the window, no further', () => {
  assert.equal(checkReport({ day: '2026-09-15', seconds: 60, tz: 'UTC' }, NOW).ok, true);
  assert.equal(REPORT_WINDOW_DAYS, 30);
  assert.equal(checkReport({ day: '2026-09-14', seconds: 60, tz: 'UTC' }, NOW).ok, false);
});
test('the future, bad days and bad times are refused', () => {
  assert.equal(checkReport({ day: '2026-10-17', seconds: 60, tz: 'UTC' }, NOW).ok, false);
  assert.equal(checkReport({ day: 'yesterday', seconds: 60 }, NOW).ok, false);
  assert.equal(checkReport({ seconds: 60 }, NOW).ok, false);
  for (const seconds of [0, -3, 14401, Number.NaN, '12abc', undefined]) assert.equal(checkReport({ day: '2026-10-15', seconds, tz: 'UTC' }, NOW).ok, false, String(seconds));
  assert.equal(checkReport({ day: '2026-10-15', seconds: 14400, tz: 'UTC' }, NOW).ok, true);
});
test('the person\'s time zone decides what today is, and a made-up zone falls back to UTC', () => {
  const lateUtc = Date.parse('2026-10-15T23:30:00Z'); // already the 16th in Lagos (UTC+1)
  assert.equal(checkReport({ day: '2026-10-16', seconds: 60, tz: 'Africa/Lagos' }, lateUtc).ok, true);
  assert.equal(checkReport({ day: '2026-10-17', seconds: 60, tz: 'Africa/Lagos' }, lateUtc).ok, true); // one day ahead is tolerated
  assert.equal(checkReport({ day: '2026-10-15', seconds: 60, tz: 'Not/AZone' }, NOW).ok, true);
});
