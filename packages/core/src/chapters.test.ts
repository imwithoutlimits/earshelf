import test from 'node:test';
import assert from 'node:assert/strict';
import { chapterAtFraction, chapterFor, chaptersOf, chapterStarts } from './chapters.ts';
import type { DocBlock, DocSection } from './model.ts';

const sections: DocSection[] = [
  { id: 's1', title: 'Arrival', level: 1, blockIds: ['b1', 'b2'] },
  { id: 's1a', title: 'First morning', level: 2, blockIds: ['b3'] },
  { id: 's2', title: 'The long lunch', level: 1, blockIds: ['b4', 'b5'] },
  { id: 's3', title: 'Night trams', level: 1, blockIds: ['b6'] },
];
const blocks: DocBlock[] = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'].map((id) => ({ id, type: 'paragraph', text: id }));

test('top-level sections are chapters, sub-sections belong to the chapter above', () => {
  assert.deepEqual(chaptersOf(sections).map((s) => s.title), ['Arrival', 'The long lunch', 'Night trams']);
  assert.deepEqual(chapterFor(sections, 's1a'), { index: 1, total: 3, title: 'Arrival' });
  assert.deepEqual(chapterFor(sections, 's2'), { index: 2, total: 3, title: 'The long lunch' });
  assert.equal(chapterFor(sections, 'missing'), null);
});

test('a document with one level uses every section; no sections gives nothing', () => {
  const flat: DocSection[] = [{ id: 'a', title: 'A', level: 2, blockIds: ['x'] }, { id: 'b', title: 'B', level: 2, blockIds: ['y'] }];
  assert.equal(chaptersOf(flat).length, 2);
  assert.deepEqual(chapterFor(flat, 'b'), { index: 2, total: 2, title: 'B' });
  assert.equal(chapterFor([], 'a'), null);
  assert.equal(chapterAtFraction({ blocks: [], sections: [] }, 0.5), null);
});

test('chapter at a fraction of the way through, clamped to the ends', () => {
  assert.equal(chapterAtFraction({ blocks, sections }, 0)?.index, 1);
  assert.equal(chapterAtFraction({ blocks, sections }, 0.6)?.title, 'The long lunch');
  assert.equal(chapterAtFraction({ blocks, sections }, 1)?.index, 3);
  assert.equal(chapterAtFraction({ blocks, sections }, 7)?.index, 3);
  assert.equal(chapterAtFraction({ blocks, sections }, Number.NaN)?.index, 1);
});

test('chapter starts map the first block of each chapter to its number', () => {
  const m = chapterStarts(sections);
  assert.equal(m.get('b1'), 1); assert.equal(m.get('b4'), 2); assert.equal(m.get('b6'), 3); assert.equal(m.has('b3'), false);
});
