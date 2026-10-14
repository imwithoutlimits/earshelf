import test from 'node:test';
import assert from 'node:assert/strict';
import { candidatesFor, recommend, reflect, draftWell, phraseInsight } from './ai.ts';
import { buildSummary, listenedDays } from './activity.ts';
import type { AiProvider } from '../ai/provider.ts';
const fake = (out: string): AiProvider => ({ id: 'fake', model: 'fake', complete: async () => out });
const boom: AiProvider = { id: 'x', model: 'x', complete: async () => { throw new Error('down'); } };

test('candidates come only from matching curated wells', () => {
  const { candidates, wells } = candidatesFor('Scriptures for when I feel worried');
  assert.equal(wells[0].id, 'peace-when-worried'); assert.ok(candidates.some((c) => c.ref === 'PHP.4.6-7')); assert.ok(candidates.length <= 40);
  assert.equal(candidatesFor('zzz qqq').candidates.length, 0);
});
test('recommend: with no AI it answers from curated wells and labels them so', async () => {
  const r = await recommend(null, 'I feel anxious'); assert.equal(r.source, 'curated'); assert.equal(r.label, 'From curated wells'); assert.ok(r.items.length >= 5);
  assert.equal((await recommend(null, 'zzz qqq')).source, 'none');
});
test('recommend: invented or unoffered references from the AI are dropped, reasons that break the rules are removed', async () => {
  const out = JSON.stringify({ refs: ['PHP.4.6-7', 'JHN.99.1', 'Hezekiah 1:1', 'ROM.8.28', '1PE.5.7'], reasons: { 'PHP.4.6-7': 'Speaks about bringing worries to God.', '1PE.5.7': 'God will heal you of all anxiety, guaranteed.' } });
  const r = await recommend(fake(out), 'worried'); assert.equal(r.source, 'ai'); assert.equal(r.label, 'Suggested by AI');
  assert.deepEqual(r.items.map((i) => i.ref), ['PHP.4.6-7', '1PE.5.7']); assert.ok(r.items[0].reason); assert.equal(r.items[1].reason, undefined);
});
test('recommend: AI failure or nonsense falls back to curated, never to an error', async () => {
  assert.equal((await recommend(boom, 'worried')).source, 'curated'); assert.equal((await recommend(fake('not json'), 'worried')).source, 'curated'); assert.equal((await recommend(fake('{"refs":["JHN.99.1"]}'), 'worried')).source, 'curated');
});
test('reflection prompts: bad ones are discarded and the fallback is labelled editorial', async () => {
  const good = await reflect(fake(JSON.stringify({ prompts: ['What phrase stands out to you?', 'God will heal you if you believe.', 'Stop taking your medication?', 'What are you carrying today?'] })), 'Psalm 23', 'text');
  assert.equal(good.source, 'ai'); assert.equal(good.label, 'AI-generated reflection prompt'); assert.deepEqual(good.prompts, ['What phrase stands out to you?', 'What are you carrying today?']);
  const none = await reflect(fake(JSON.stringify({ prompts: ['As your pastor I say you must trust.'] })), 'Psalm 23', 't'); assert.equal(none.source, 'editorial');
  assert.equal((await reflect(null, 'Psalm 23', 't')).label, 'Editorial prompt');
});
test('well drafts use only offered passages and fall back to the curated well', async () => {
  const ok = await draftWell(fake(JSON.stringify({ name: 'Quiet minds', description: 'Passages for restless days.', refs: ['PHP.4.6-7', '1PE.5.7', 'ISA.26.3', 'JHN.99.9'] })), 'worried');
  assert.equal(ok?.source, 'ai'); assert.deepEqual(ok?.refs, ['PHP.4.6-7', '1PE.5.7', 'ISA.26.3']);
  const bad = await draftWell(fake(JSON.stringify({ name: 'Guaranteed healing', description: 'x', refs: ['PHP.4.6-7'] })), 'worried'); assert.equal(bad?.source, 'curated');
  assert.equal(await draftWell(null, 'zzz qqq'), null);
});
test('summary: thread, weekly target, level and next badge from plain data', () => {
  const s = buildSummary({ today: '2026-10-09', tz: 'UTC', listenedDays: listenedDays([{ day: '2026-10-03', seconds: 90 }, { day: '2026-10-04', seconds: 70 }, { day: '2026-10-05', seconds: 61 }, { day: '2026-10-06', seconds: 600 }, { day: '2026-10-07', seconds: 65 }, { day: '2026-10-08', seconds: 100 }, { day: '2026-10-02', seconds: 20 }]), xpTotal: 340, xpWeek: 100, target: 5, sessions: [] });
  assert.equal(s.thread.count, 6); assert.equal(s.thread.atRisk, true); assert.equal(s.weekly.done, 4); assert.equal(s.weekly.remaining, 1); assert.equal(s.xp.name, 'Weaver'); assert.equal(s.xp.toNext, 60); assert.equal(s.badges.next?.id, 'threefold-cord');
});
test('weekly insight falls back to computed text when the AI is down or shames', async () => {
  const facts = { sessions: 3, activeDays: 3, minutes: 9, topWell: 'Morning Strength', topPart: 'morning' as const, longestMinutes: 6, longestDay: 'Tuesday', streak: 6, target: 5, done: 4 };
  assert.equal((await phraseInsight(boom, facts)).source, 'computed'); assert.equal((await phraseInsight(fake('You failed to listen enough this week, which is disappointing.'), facts)).source, 'computed');
  assert.equal((await phraseInsight(fake('You listened on three mornings this week and kept returning to Morning Strength.'), facts)).source, 'ai');
});
