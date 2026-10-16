import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeDays, minutesOf, secondsBetween } from './listening.ts';

test('seconds between two days include both ends and ignore the rest', () => {
  const rows = [{ day: '2026-10-12', seconds: 300 }, { day: '2026-10-13', seconds: 30 }, { day: '2026-10-14', seconds: 1500 }, { day: '2026-09-01', seconds: 900 }];
  assert.equal(secondsBetween(rows, '2026-10-12', '2026-10-14'), 1830);
  assert.equal(secondsBetween(rows, '2026-10-13', '2026-10-13'), 30);
  assert.equal(secondsBetween(rows, '2026-11-01', '2026-11-30'), 0);
});

test('minutes round to whole minutes but a short listen never shows as zero', () => {
  assert.equal(minutesOf(0), 0); assert.equal(minutesOf(-5), 0); assert.equal(minutesOf(20), 1); assert.equal(minutesOf(90), 2); assert.equal(minutesOf(3600), 60);
});

test('merging devices: the server total plus only what this device has not uploaded', () => {
  const remote = [{ day: '2026-10-14', seconds: 600 }, { day: '2026-10-13', seconds: 120 }];
  const local = [{ day: '2026-10-14', seconds: 400, pushed: 400 }, { day: '2026-10-15', seconds: 90, pushed: 0 }, { day: '2026-10-13', seconds: 150, pushed: 100 }];
  assert.deepEqual(mergeDays(local, remote), [{ day: '2026-10-13', seconds: 170 }, { day: '2026-10-14', seconds: 600 }, { day: '2026-10-15', seconds: 90 }]);
});

test('offline or signed out: local time alone is used, and bad numbers never go negative', () => {
  assert.deepEqual(mergeDays([{ day: '2026-10-14', seconds: 300 }], []), [{ day: '2026-10-14', seconds: 300 }]);
  assert.deepEqual(mergeDays([{ day: '2026-10-14', seconds: 50, pushed: 80 }], [{ day: '2026-10-14', seconds: -5 }]), [{ day: '2026-10-14', seconds: 0 }]);
  assert.deepEqual(mergeDays([], []), []);
});
