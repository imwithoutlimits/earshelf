import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleGuide, chosenRefs, cleanHeading, guideToText, scaffoldGuide, MAX_GUIDE_PASSAGES } from './studyGuide.ts';
import { dueRecall, recallSummary, scheduleRecall } from './recall.ts';

const REFS = ['PSA.23', 'ISA.40.28-31', 'MAT.11.28-30'];

test('only real passages are chosen, once each, up to the limit', () => {
  assert.deepEqual(chosenRefs(['PSA.23', 'psa.23', 'NOPE.1', 42, 'JHN.3.16']), ['PSA.23', 'JHN.3.16']);
  assert.deepEqual(chosenRefs('not a list'), []);
  const many = Array.from({ length: 30 }, (_, i) => `PSA.${i + 1}`);
  assert.equal(chosenRefs(many).length, MAX_GUIDE_PASSAGES);
});

test('headings must be short and neutral', () => {
  assert.equal(cleanHeading('  Rest and trust. '), 'Rest and trust');
  assert.equal(cleanHeading('x'), null);
  assert.equal(cleanHeading('a'.repeat(80)), null);
  assert.equal(cleanHeading('See Psalm 23:4 for healing'), null, 'verse numbers are added by the app, not by AI');
  assert.equal(cleanHeading('God will heal you and make you rich'), null, 'promises are blocked by the guardrails');
  assert.equal(cleanHeading(12), null);
});

test('the no-AI scaffold keeps the order given and uses the app\'s own questions', () => {
  const g = scaffoldGuide('study', 'Courage', REFS);
  assert.equal(g.source, 'editorial');
  assert.deepEqual(g.sections.map((s) => s.refs[0]), REFS);
  assert.ok(g.sections.every((s) => s.questions.length === 2 && s.questions.every((q) => q.endsWith('?'))));
  assert.equal(scaffoldGuide('talk', '  ', REFS).title, 'Study guide');
});

test('AI output is trimmed to the chosen passages, each exactly once', () => {
  const g = assembleGuide({
    sections: [
      { heading: 'Rest for the weary', refs: ['MAT.11.28-30', 'GEN.1.1'], questions: ['What does rest look like for you this week?', 'Pastor says you must believe this.'] },
      { heading: 'Strength', refs: ['ISA.40.28-31', 'MAT.11.28-30'], questions: ['Which word here do you notice first?'] },
    ],
    opening: ['What would you like to bring to this time?'],
    closing: ['What will you carry with you?'],
  }, 'study', 'Rest', REFS);
  assert.equal(g.source, 'ai');
  const flat = g.sections.flatMap((s) => s.refs);
  assert.deepEqual([...flat].sort(), [...REFS].sort(), 'an invented passage is dropped, a repeated one is used once, a missing one is added');
  assert.equal(g.sections[0].refs.join(), 'MAT.11.28-30');
  assert.equal(g.sections[0].questions.length, 1, 'a statement dressed as a question is removed');
  assert.deepEqual(g.sections[2].refs, ['PSA.23'], 'the passage the AI left out is added last');
});

test('a section with no usable questions gets an editorial one, and nonsense falls back to the scaffold', () => {
  const g = assembleGuide({ sections: [{ heading: 'Trust', refs: ['PSA.23'], questions: ['You must trust God completely.'] }] }, 'talk', 'T', ['PSA.23']);
  assert.equal(g.sections[0].questions.length, 1);
  assert.ok(g.sections[0].questions[0].endsWith('?'));
  for (const bad of [null, undefined, {}, { sections: 'x' }, { sections: [{ refs: ['GEN.1.1'] }] }]) assert.equal(assembleGuide(bad as never, 'study', 'T', REFS).source, 'editorial');
});

test('plain text export carries the verse text unchanged and says the text is not AI-written', () => {
  const g = scaffoldGuide('study', 'Rest', ['PSA.23']);
  const t = guideToText(g, { 'PSA.23': 'The LORD is my shepherd; I shall not want.' }, 'WEB');
  assert.ok(t.includes('The LORD is my shepherd; I shall not want.'));
  assert.ok(t.includes('Psalms 23 (WEB)'));
  assert.ok(t.includes('The Scripture text is not AI-written.'));
});

test('recall: struggling comes back tomorrow, good recall spaces out, ease never drops below the floor', () => {
  const t0 = 1_700_000_000_000, DAY = 86_400_000;
  let s = scheduleRecall(undefined, 4, t0);
  assert.deepEqual([s.reps, s.intervalDays], [1, 1]);
  s = scheduleRecall(s, 4, t0);
  assert.deepEqual([s.reps, s.intervalDays], [2, 3]);
  s = scheduleRecall(s, 4, t0);
  assert.equal(s.reps, 3);
  assert.ok(s.intervalDays >= 4, 'third success grows the gap');
  const before = s.intervalDays;
  s = scheduleRecall(s, 5, t0);
  assert.ok(s.intervalDays > before);
  assert.equal(s.reviewAt, t0 + s.intervalDays * DAY);
  const lapse = scheduleRecall(s, 1, t0);
  assert.deepEqual([lapse.reps, lapse.intervalDays, lapse.lapses], [0, 1, 1]);
  let e = scheduleRecall(undefined, 1, t0);
  for (let i = 0; i < 20; i++) e = scheduleRecall(e, 1, t0);
  assert.equal(e.ease, 1.3);
  let far = scheduleRecall({ ease: 2.5, intervalDays: 170, reps: 9, lapses: 0 }, 5, t0);
  assert.ok(far.intervalDays <= 180);
});

test('recall queue is most overdue first, and the summary counts what is due', () => {
  const now = 1_000_000_000_000, DAY = 86_400_000;
  const memos = [{ ref: 'a', reviewAt: now - DAY }, { ref: 'b', reviewAt: now - 5 * DAY }, { ref: 'c', reviewAt: now + 2 * DAY, intervalDays: 30 }, { ref: 'd', reviewAt: now + 20 * DAY }];
  assert.deepEqual(dueRecall(memos, now).map((m) => m.ref), ['b', 'a']);
  assert.deepEqual(recallSummary(memos, now), { total: 4, dueNow: 2, dueThisWeek: 1, solid: 1 });
});

import { alignVerses } from './compare.ts';
test('side by side lines translations up by verse number, even when one is missing a verse or is not on the device', () => {
  const t = alignVerses([
    { id: 'web', abbreviation: 'WEB', name: 'World English Bible', verses: [{ n: 1, text: 'a1' }, { n: 2, text: 'a2' }] },
    { id: 'kjv', abbreviation: 'KJV', name: 'King James Version', verses: [{ n: 2, text: 'b2' }, { n: 3, text: 'b3' }] },
    { id: 'asv', abbreviation: 'ASV', name: 'American Standard Version', verses: null },
  ]);
  assert.deepEqual(t.rows.map((r) => r.n), [1, 2, 3]);
  assert.deepEqual(t.rows[0].cells, ['a1', null, null]);
  assert.deepEqual(t.rows[1].cells, ['a2', 'b2', null]);
  assert.deepEqual(t.columns.map((c) => c.available), [true, true, false]);
  assert.deepEqual(alignVerses([]).rows, []);
});
