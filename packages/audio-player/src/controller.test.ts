import test from 'node:test';
import assert from 'node:assert/strict';
import type { Utterance } from '../../core/src/model.ts';

// The controller only needs these browser objects to exist; nothing is spoken in the test.
const g = globalThis as Record<string, unknown>;
g.speechSynthesis = { speaking: false, paused: false, cancel() {}, speak() {}, pause() {}, resume() {}, getVoices: () => [], addEventListener() {}, removeEventListener() {} };
g.SpeechSynthesisUtterance = class { text: string; constructor(t: string) { this.text = t; } };

const items: Utterance[] = Array.from({ length: 6 }, (_, i) => {
  const text = `Sentence number ${i} is here for the test of the player.`;
  return { id: `u${i}`, blockId: `b${i}`, sectionId: i < 3 ? 's1' : 's2', kind: 'paragraph', text, spoken: text, pauseAfterMs: 300 };
});

test('loading a document updates the snapshot with its id, length and place', async () => {
  const { PlayerController } = await import('./controller.ts');
  const p = new PlayerController();
  assert.equal(p.getSnapshot().documentId, null);
  p.load({ documentId: 'doc-1', title: 'Field notes', author: undefined, sectionTitles: { s1: 'One', s2: 'Two' } }, items, 4);
  const s = p.getSnapshot();
  assert.equal(s.documentId, 'doc-1'); assert.equal(s.length, 6); assert.equal(s.index, 4);
  assert.equal(s.title, 'Field notes'); assert.equal(s.sectionTitle, 'Two'); assert.equal(s.status, 'paused');
  assert.ok(s.totalSeconds > 0 && s.remainingSeconds > 0 && s.remainingSeconds < s.totalSeconds, 'time left is less than the whole');
});

test('seeking moves the snapshot, and a settings change keeps the place', async () => {
  const { PlayerController } = await import('./controller.ts');
  const p = new PlayerController();
  p.load({ documentId: 'doc-2', title: 'T', author: undefined, sectionTitles: {} }, items, 0);
  p.seekTo(3);
  assert.equal(p.getSnapshot().index, 3);
  p.setRate(1.5);
  const s = p.getSnapshot();
  assert.equal(s.rate, 1.5); assert.equal(s.index, 3); assert.equal(s.documentId, 'doc-2');
});
