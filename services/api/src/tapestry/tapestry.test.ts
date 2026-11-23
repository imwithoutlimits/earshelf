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

import { buildGuide } from './studyGuide.ts';
const PASSAGES = [{ key: 'PSA.23', label: 'Psalms 23', text: 'The LORD is my shepherd.' }, { key: 'ISA.40.28-31', label: 'Isaiah 40:28–31', text: 'Have you not known?' }];

test('study guide: no AI means the editorial scaffold, in the order given', async () => {
  const g = await buildGuide(null, 'study', 'Rest', PASSAGES);
  assert.equal(g.source, 'editorial');
  assert.deepEqual(g.sections.map((s) => s.refs[0]), ['PSA.23', 'ISA.40.28-31']);
});

test('study guide: AI groups and asks, and the AI is told the rules and never asked for Scripture', async () => {
  let system = '', user = '';
  const ai: AiProvider = { id: 'f', model: 'f', complete: async (s, u) => { system = s; user = u; return JSON.stringify({ sections: [{ heading: 'Rest and strength', refs: ['ISA.40.28-31', 'PSA.23'], questions: ['What do you notice about the words used here?'] }], opening: ['What would you like to bring?'], closing: ['What will you remember?'] }); } };
  const g = await buildGuide(ai, 'talk', 'Rest', PASSAGES);
  assert.equal(g.source, 'ai');
  assert.deepEqual(g.sections[0].refs, ['ISA.40.28-31', 'PSA.23']);
  assert.match(system, /Never write, quote or paraphrase Scripture/);
  assert.match(system, /Never interpret doctrine/);
  assert.ok(!/"verses"|"scripture"/i.test(user), 'the request does not ask for any Scripture text back');
});

test('study guide: invented passages, unsafe lines, broken output or a down AI all stay safe', async () => {
  const sneaky = fake(JSON.stringify({ sections: [{ heading: 'God will heal you', refs: ['GEN.1.1', 'PSA.23'], questions: ['The Bible says you must obey.'] }] }));
  const g = await buildGuide(sneaky, 'study', 'T', PASSAGES);
  assert.deepEqual(g.sections.flatMap((s) => s.refs).sort(), ['ISA.40.28-31', 'PSA.23']);
  assert.ok(g.sections.every((s) => !/heal you/i.test(s.heading) && s.questions.every((q) => q.endsWith('?'))));
  assert.equal((await buildGuide(fake('not json'), 'study', 'T', PASSAGES)).source, 'editorial');
  assert.equal((await buildGuide(boom, 'study', 'T', PASSAGES)).source, 'editorial');
});

import { buildDraft } from './sermon.ts';
const PSALM_P = [{ key: 'PSA.23', label: 'Psalms 23', text: 'The LORD is my shepherd; I shall not want. He makes me lie down in green pastures.' }];

test('sermon draft: the AI is told the limits and a clean draft comes back labelled', async () => {
  let system = '', user = '';
  const ai: AiProvider = { id: 'f', model: 'f', complete: async (s, u) => { system = s; user = u; return JSON.stringify({ title: 'Resting in care', intro: 'Many of us come tired to this passage. Let us slow down and notice together.', sections: [{ heading: 'Provision', refs: ['PSA.23'], body: 'Notice how the writer speaks of provision. Think about what it means to be cared for. Consider where you feel unsure.' }], closing: 'Take a moment to think about what you heard. Carry one thought with you this week.' }); } };
  const d = await buildDraft(ai, 'pastoral', 'short', 'Rest', PSALM_P);
  assert.equal(d?.source, 'ai');
  assert.match(d!.label, /Review it/);
  assert.match(system, /never quote it or restate its wording/);
  assert.match(system, /never promise healing/i);
  assert.ok(user.includes('about 450 words'));
});

test('sermon draft: quoting the verses, promises and unchosen passages never reach the person', async () => {
  const sneaky = fake(JSON.stringify({ sections: [{ heading: 'Care', refs: ['PSA.23'], body: 'The LORD is my shepherd; I shall not want, says the text. God will heal you of everything. Compare John 3:16 here.' }] }));
  assert.equal(await buildDraft(sneaky, 'teaching', 'medium', 'T', PSALM_P), null, 'every sentence broke a rule, so there is no draft');
  assert.equal(await buildDraft(fake('not json'), 'pastoral', 'short', 'T', PSALM_P), null);
  assert.equal(await buildDraft(boom, 'pastoral', 'short', 'T', PSALM_P), null);
});

import { NARRATION_TRANSLATIONS, minutesFor, narratePart, pickVoice, planNarration } from './narrate.ts';
const V = (n: number, len: number) => ({ n, text: `v${n} `.padEnd(len, 'x') });

test('narration is limited to public domain translations', () => {
  assert.deepEqual([...NARRATION_TRANSLATIONS], ['engwebp', 'eng-kjv2006', 'eng-asv']);
  assert.ok(!NARRATION_TRANSLATIONS.includes('engbsb'));
});

test('a chapter is read in short parts that never split a verse', () => {
  const parts = planNarration([V(1, 300), V(2, 300), V(3, 300), V(4, 100), V(5, 900)], 700);
  assert.deepEqual(parts.map((p) => p.map((v) => v.n)), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(planNarration([], 700), []);
  assert.equal(planNarration([V(1, 3000)], 700).length, 1, 'one very long verse is still one part');
});

test('minutes are counted from the words, and a voice is always chosen safely', () => {
  assert.ok(Math.abs(minutesFor([{ n: 1, text: Array(150).fill('word').join(' ') }]) - 1) < 1e-9);
  assert.ok(minutesFor([]) > 0);
  const voices = [{ id: 'fr_x', name: 'X', lang: 'fr-FR' }, { id: 'af_heart', name: 'Heart', lang: 'en-US' }];
  assert.equal(pickVoice(voices, 'fr_x'), 'fr_x');
  assert.equal(pickVoice(voices, 'nonsense'), 'af_heart');
  assert.equal(pickVoice(voices, undefined), 'af_heart');
  assert.equal(pickVoice([], 'x'), null);
});

test('a part is spoken verse by verse and stitched with a pause; each verse knows when it starts', async () => {
  const spoken: string[] = [];
  const engine = { id: 'kokoro', label: 'K', commercialUseAllowed: true, available: () => true, listVoices: async () => [], synthesize: async (t: string) => { spoken.push(t); return { samples: new Int16Array(2400), sampleRate: 24000 }; } };
  const out = await narratePart({ engine, voice: 'af_heart', toMp3: async (s) => Buffer.from(`mp3:${s.length}`) }, [V(1, 10), V(2, 10), V(3, 10)]);
  assert.equal(spoken.length, 3);
  assert.deepEqual(out.verses.map((v) => v.n), [1, 2, 3]);
  assert.deepEqual(out.verses.map((v) => v.startMs), [0, 100 + 380, 2 * (100 + 380)], 'each clip is 100 ms, plus the pause between verses');
  assert.equal(out.durationMs, 3 * 100 + 2 * 380, 'no pause after the last verse');
  assert.match(out.mp3.toString(), /^mp3:/);
  const bad = { ...engine, synthesize: async (t: string) => ({ samples: new Int16Array(10), sampleRate: t.startsWith('v1') ? 24000 : 22050 }) };
  await assert.rejects(narratePart({ engine: bad, voice: 'x', toMp3: async () => Buffer.alloc(0) }, [V(1, 5), V(2, 5)]), /mixed sample rates/);
});
