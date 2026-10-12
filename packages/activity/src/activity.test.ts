import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, weekStart, localDay, isDay, xpAward, levelFor, DAILY_XP_CAP, streakInfo, longestStreak, weeklyProgress, badgeStatus, insightFacts, insightText, cleanInsight, BADGES } from './index.ts';

test('day maths and time zones', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01'); assert.equal(weekStart('2026-10-09'), '2026-10-05'); assert.equal(weekStart('2026-10-11'), '2026-10-05');
  const ts = Date.UTC(2026, 9, 9, 3, 0); assert.equal(localDay(ts, 'UTC'), '2026-10-09'); assert.equal(localDay(ts, 'America/Los_Angeles'), '2026-10-08');
  assert.ok(isDay('2026-10-09')); assert.ok(!isDay('2026-13-40x'));
});
test('xp is capped per day and levels follow thresholds', () => {
  assert.equal(xpAward('save_passage', 0), 10); assert.equal(xpAward('order_well', 90), 10); assert.equal(xpAward('save_passage', DAILY_XP_CAP), 0);
  const l = levelFor(340); assert.equal(l.level, 3); assert.equal(l.name, 'Weaver'); assert.equal(l.toNext, 60); assert.equal(levelFor(5000).next, null);
});
const run = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));
test('thread counts consecutive days; today pending only puts it at risk', () => {
  const days = run('2026-10-03', 6); // Sat 3 .. Thu 8
  const s = streakInfo(days, '2026-10-09'); assert.equal(s.count, 6); assert.equal(s.atRisk, true); assert.equal(s.todayDone, false);
  const t = streakInfo([...days, '2026-10-09'], '2026-10-09'); assert.equal(t.count, 7); assert.equal(t.atRisk, false);
});
test('one rest day per week bridges a single miss, two misses break the thread', () => {
  const bridged = streakInfo(['2026-10-05', '2026-10-06', '2026-10-08', '2026-10-09'], '2026-10-09'); // Wed 7 missed
  assert.equal(bridged.count, 4); assert.equal(bridged.restUsedThisWeek, 1); assert.equal(bridged.restAvailable, 0);
  assert.equal(streakInfo(['2026-10-05', '2026-10-08', '2026-10-09'], '2026-10-09').count, 2); // Tue and Wed both missed
  const twoInWeek = streakInfo(['2026-10-05', '2026-10-07', '2026-10-09'], '2026-10-09'); assert.equal(twoInWeek.count, 2); // second gap in same week is not bridged
  assert.equal(streakInfo([], '2026-10-09').count, 0); assert.equal(streakInfo([], '2026-10-09').atRisk, false);
});
test('longest streak and badges', () => {
  assert.equal(longestStreak([...run('2026-09-01', 12), ...run('2026-10-03', 6)]), 12);
  const b = badgeStatus(6, 6); assert.deepEqual(b.earned.map((x) => x.id), ['first-strand']); assert.equal(b.next?.id, 'threefold-cord'); assert.ok(Math.abs(b.progress - 6 / 7) < 1e-9);
  assert.equal(badgeStatus(100, 100).next, null); assert.deepEqual(BADGES.map((x) => x.strands), [1, 3, 5, 7]);
});
test('weekly target: progress, remaining and whether it is still reachable', () => {
  const w = weeklyProgress(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'], '2026-10-09', 5);
  assert.equal(w.done, 4); assert.equal(w.remaining, 1); assert.equal(w.daysLeft, 3); assert.equal(w.met, false); assert.equal(w.reachable, true); assert.deepEqual(w.doneDays, [true, true, true, true, false, false, false]);
  const late = weeklyProgress(['2026-10-05'], '2026-10-11', 5); assert.equal(late.reachable, false);
  assert.equal(weeklyProgress(run('2026-10-05', 5), '2026-10-09', 5).met, true);
});
test('weekly insight is computed from numbers and refuses shaming language', () => {
  const tz = 'UTC'; const at = (d: string, h: number, secs: number, well = 'Courage for Difficult Days') => ({ ts: Date.parse(`${d}T${String(h).padStart(2, '0')}:00:00Z`), seconds: secs, wellName: well });
  const f = insightFacts([at('2026-10-05', 7, 120), at('2026-10-06', 8, 360), at('2026-10-08', 7, 90)], '2026-10-09', tz, 6, 5, 4);
  assert.equal(f.activeDays, 3); assert.equal(f.topPart, 'morning'); assert.equal(f.longestMinutes, 6); assert.equal(f.longestDay, 'Tuesday');
  const t = insightText(f); assert.match(t, /3 days/); assert.match(t, /Morning/); assert.match(t, /1 more day reaches/);
  assert.match(insightText(insightFacts([], '2026-10-09', tz, 0, 5, 0)), /begin your thread again/);
  assert.equal(cleanInsight('You failed to listen this week and should have done more.'), null); assert.ok(cleanInsight(t));
});
