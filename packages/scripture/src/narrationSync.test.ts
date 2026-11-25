import test from 'node:test';
import assert from 'node:assert/strict';
import { charAt, snapToWordStart, verseOffsets, VERSE_PAUSE_MS } from './narrationSync.ts';

const verses = [{ n: 16, text: 'For God so loved the world,' }, { n: 17, text: 'For God did not send his Son' }, { n: 18, text: 'He who believes' }];
const text = verses.map((v) => v.text).join(' ');
const part = { durationMs: 12000, verses: [{ n: 16, startMs: 0 }, { n: 17, startMs: 4000 }, { n: 18, startMs: 9000 }] };

test('verse positions match the text the player reads, which is the verses joined by single spaces', () => {
  const o = verseOffsets(verses);
  for (const v of verses) { const at = o.get(v.n)!; assert.equal(text.slice(at.start, at.start + at.len), v.text); }
});

test('the place moves through a verse, and lands on the next verse when it starts', () => {
  const o = verseOffsets(verses);
  assert.equal(charAt(0, part, o, text.length, 0), 0);
  const mid = charAt(2000, part, o, text.length, 0);
  assert.ok(mid > 5 && mid < o.get(16)!.len, 'inside the first verse');
  assert.equal(charAt(4000, part, o, text.length, 0), o.get(17)!.start);
  assert.ok(Math.abs(charAt(9000, part, o, text.length, 0) - o.get(18)!.start) < 1e-9);
});

test('the pause after a verse does not run the highlight into the next verse early', () => {
  const o = verseOffsets(verses);
  const endOfSpeech = charAt(4000 - VERSE_PAUSE_MS, part, o, text.length, 0);
  const inPause = charAt(4000 - 100, part, o, text.length, 0);
  assert.equal(inPause, o.get(16)!.start + o.get(16)!.len, 'it waits at the end of the verse');
  assert.ok(endOfSpeech <= inPause);
});

test('the place never goes backwards as time passes', () => {
  const o = verseOffsets(verses);
  let prev = -1;
  for (let t = 0; t <= 12000; t += 50) { const c = charAt(t, part, o, text.length, 0); assert.ok(c >= prev, `at ${t}ms`); prev = c; }
});

test('without verse positions it falls back to how far through the passage the audio is', () => {
  assert.equal(charAt(5000, part, null, 200, 0.5), 100);
  assert.equal(charAt(5000, { verses: [], durationMs: 1000 }, null, 200, 0.25), 50);
});

test('snapping puts the highlight on the start of a word', () => {
  assert.equal(snapToWordStart('For God so loved', 9), 8);
  assert.equal(snapToWordStart('For God so loved', 4), 4);
  assert.equal(snapToWordStart('For God', 0), 0);
  assert.equal(snapToWordStart('For God', 99), 4);
});
