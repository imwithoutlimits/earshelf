import test from 'node:test';
import assert from 'node:assert/strict';
import { PAD_PROGRESSION, SOUNDSCAPES, chordHz, clampVolume, isSoundscape, layersOf, midiToHz, shouldPlayAmbient, DEFAULT_VOLUME } from './ambient.ts';
import { loopPlan, loopTotalMs, reciteMs, speakMs } from './loop.ts';

const VERSE = 'The LORD is my shepherd; I shall not want. He makes me lie down in green pastures.';

test('note frequencies are right: A4 is 440 Hz and an octave doubles it', () => {
  assert.equal(midiToHz(69), 440);
  assert.ok(Math.abs(midiToHz(81) - 880) < 1e-9);
  assert.ok(Math.abs(midiToHz(60) - 261.6256) < 0.001);
});

test('every chord has four rising notes in a gentle range, and the progression loops forever', () => {
  for (let i = 0; i < PAD_PROGRESSION.length; i++) {
    const hz = chordHz(i);
    assert.equal(hz.length, 4);
    assert.ok(hz.every((f, k) => k === 0 || f > hz[k - 1]), 'notes rise');
    assert.ok(hz[0] > 80 && hz[3] < 400, 'low and warm, never shrill');
  }
  assert.deepEqual(chordHz(PAD_PROGRESSION.length), chordHz(0));
  assert.deepEqual(chordHz(-1), chordHz(PAD_PROGRESSION.length - 1));
});

test('choices, layers and volume are safe', () => {
  assert.deepEqual(SOUNDSCAPES.map((s) => s.id), ['off', 'rain', 'pad', 'both']);
  assert.ok(isSoundscape('rain') && !isSoundscape('thunder') && !isSoundscape(undefined));
  assert.deepEqual(layersOf('both'), { rain: true, pad: true });
  assert.deepEqual(layersOf('pad'), { rain: false, pad: true });
  assert.deepEqual(layersOf('off'), { rain: false, pad: false });
  assert.equal(clampVolume(5), 1);
  assert.equal(clampVolume(-1), 0);
  assert.equal(clampVolume('loud'), DEFAULT_VOLUME);
  assert.equal(clampVolume(Number.NaN), DEFAULT_VOLUME);
});

test('it plays only while reading, only when chosen, and only for people who have it', () => {
  const ok = { mode: 'rain' as const, allowed: true, playing: true };
  assert.equal(shouldPlayAmbient(ok), true);
  assert.equal(shouldPlayAmbient({ ...ok, playing: false }), false);
  assert.equal(shouldPlayAmbient({ ...ok, mode: 'off' }), false);
  assert.equal(shouldPlayAmbient({ ...ok, allowed: false }), false);
});

test('the memorization loop reads, then pauses to recite, hides more each time, then checks', () => {
  const steps = loopPlan(VERSE);
  assert.equal(steps.length, 11);
  assert.deepEqual(steps.slice(0, 4).map((s) => [s.kind, s.level]), [['speak', 0], ['recite', 0], ['speak', 1], ['recite', 1]]);
  assert.deepEqual(steps[9].level, 4);
  assert.equal(steps[9].kind, 'recite');
  assert.deepEqual([steps[10].kind, steps[10].level], ['speak', 0], 'ends with the full passage so they can check themselves');
  assert.ok(steps.every((s) => s.ms > 0 && s.label.length > 0));
});

test('timing follows the length of the passage, and slower reading takes longer', () => {
  const short = 'Jesus wept.';
  assert.ok(speakMs(VERSE) > speakMs(short));
  assert.ok(reciteMs(short) >= 4000, 'always enough time to begin');
  assert.ok(reciteMs(VERSE) > speakMs(VERSE), 'saying it from memory takes longer than hearing it');
  assert.ok(speakMs(VERSE, 0.7) > speakMs(VERSE, 1.3));
  assert.ok(loopTotalMs(loopPlan(VERSE)) > loopTotalMs(loopPlan(short)));
});

test('a loop can start and end at chosen levels, clamped to the real range', () => {
  const steps = loopPlan(VERSE, { startLevel: 2, endLevel: 3 });
  assert.deepEqual(steps.map((s) => s.level), [2, 2, 3, 3, 0]);
  assert.deepEqual(loopPlan(VERSE, { startLevel: -5, endLevel: 99 }).map((s) => s.level), [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 0]);
});
