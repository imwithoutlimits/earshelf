import test from 'node:test';
import assert from 'node:assert/strict';
import { pickCast, segmentVerses, speakerAfter, speakerBefore } from './dramatize.ts';

const V = (n: number, text: string) => ({ n, text });
const roles = (verses: Array<{ n: number; text: string }>) => segmentVerses(verses).map((s) => [s.role, s.text]);
const words = (s: string) => s.replace(/[“”"]/g, ' ').replace(/\s+/g, ' ').trim();

test('narration, then God speaking, then narration again', () => {
  assert.deepEqual(roles([V(3, 'God said, “Let there be light,” and there was light.')]), [
    ['narrator', 'God said,'], ['divine', 'Let there be light,'], ['narrator', 'and there was light.'],
  ]);
});

test('Jesus is read by the divine voice; other speakers are not', () => {
  assert.deepEqual(roles([V(3, 'Jesus answered him, “Most certainly I tell you, unless one is born anew, he can’t see God’s Kingdom.”')]).map((r) => r[0]), ['narrator', 'divine']);
  assert.deepEqual(roles([V(33, 'Pilate asked him, “Are you the King of the Jews?”')]).map((r) => r[0]), ['narrator', 'speaker']);
  assert.deepEqual(roles([V(1, 'The high priest said, “Is this so?”')]).map((r) => r[0]), ['narrator', 'speaker']);
});

test('a quote with no named speaker, or one the rules are unsure about, is never given the divine voice', () => {
  assert.deepEqual(roles([V(1, 'The crowd shouted, “Hosanna!”')]).map((r) => r[0]), ['narrator', 'speaker']);
  assert.deepEqual(roles([V(1, '“Hallelujah!”')]).map((r) => r[0]), ['speaker']);
  assert.equal(speakerBefore('Then Jesus said to them, '), 'divine');
  assert.equal(speakerBefore('The LORD said to Moses, '), 'divine');
  for (const before of ['They asked Jesus, ', 'Peter said to Jesus, ', 'Satan said to Jesus, ', 'The crowd answered God, ', 'Jesus’ disciples said to him, ', 'God’s messenger said, ']) assert.equal(speakerBefore(before), 'speaker', before);
});

test('a speaker named after the quote is understood', () => {
  assert.deepEqual(roles([V(19, '“Follow me,” Jesus said to them.')]).map((r) => r[0]), ['divine', 'narrator']);
  assert.equal(speakerAfter(', Jesus said to them.'), true);
  assert.equal(speakerAfter(' and he left.'), false);
});

test('a speech that runs over several verses keeps its voice, even when a new paragraph opens with another quote mark', () => {
  const r = roles([V(1, 'Jesus said to them, “Do not let your heart be troubled.'), V(2, '“In my Father’s house are many rooms.'), V(3, 'I am going to prepare a place for you.” Then he left.')]);
  assert.deepEqual(r.map((x) => x[0]), ['narrator', 'divine', 'divine', 'divine', 'narrator']);
  assert.deepEqual(segmentVerses([V(1, 'Jesus said, “One.'), V(2, '“Two.” He left.')]).map((s) => [s.verse, s.role]), [[1, 'narrator'], [1, 'divine'], [2, 'divine'], [2, 'narrator']]);
});

test('a quote inside a quote stays in the speaker\'s voice, and straight quote marks work too', () => {
  assert.deepEqual(roles([V(1, 'He said, “They asked, ‘Who are you?’ and I answered.”')]).map((r) => r[0]), ['narrator', 'speaker']);
  assert.deepEqual(roles([V(1, 'The LORD said, "Go."')]).map((r) => [r[0], r[1]]), [['narrator', 'The LORD said,'], ['divine', 'Go.']]);
});

test('plain verses stay as one narrator stretch, and an empty verse adds nothing', () => {
  assert.deepEqual(roles([V(1, 'In the beginning, God created the heavens and the earth.'), V(2, '   ')]), [['narrator', 'In the beginning, God created the heavens and the earth.']]);
  assert.deepEqual(segmentVerses([]), []);
});

test('NO WORD is ever added, lost or changed: the stretches put back together read exactly like the verses', () => {
  const verses = [
    V(1, 'Jesus said to them, “Do not let your heart be troubled. Believe in God; believe also in me.'),
    V(2, '“In my Father’s house are many rooms. If it weren’t so, I would have told you.” Thomas said to him, “Lord, we don’t know where you are going.”'),
    V(3, 'Jesus said, "I am the way," and "the truth," and the life. Then they went out; the crowd shouted, “Hosanna!”'),
    V(4, 'He said, “They asked, ‘Who?’ and I said nothing.” Peter said, “Lord!” “Yes,” Jesus said.'),
  ];
  const before = words(verses.map((v) => v.text).join(' '));
  const after = words(segmentVerses(verses).map((s) => s.text).join(' '));
  assert.equal(after, before);
  for (const s of segmentVerses(verses)) assert.ok(s.text.length > 0 && !/[“”]/.test(s.text), 'no stray quote marks left in what is read');
});

test('the cast has three different voices when the engine has them, and degrades safely when it does not', () => {
  const voices = [{ id: 'af_heart', lang: 'en-US' }, { id: 'am_michael', lang: 'en-US' }, { id: 'af_bella', lang: 'en-US' }, { id: 'bm_george', lang: 'en-GB' }, { id: 'ff_siwis', lang: 'fr-FR' }];
  const c = pickCast(voices, 'af_heart');
  assert.deepEqual([c.narrator, c.divine], ['af_heart', 'am_michael']);
  assert.notEqual(c.speaker, c.narrator);
  assert.notEqual(c.speaker, c.divine);
  assert.ok(!['ff_siwis'].includes(c.speaker), 'never a voice in another language');
  const maleNarrator = pickCast(voices, 'am_michael');
  assert.equal(maleNarrator.narrator, 'am_michael');
  assert.ok(/^[a-z]f_/.test(maleNarrator.speaker), 'a different-sounding voice for the speakers');
  assert.deepEqual(pickCast([{ id: 'af_heart', lang: 'en-US' }], 'af_heart'), { narrator: 'af_heart', divine: 'af_heart', speaker: 'af_heart' });
});
