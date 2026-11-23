import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOKS } from './books.ts';
import { OSIS_TO_CODE, looksRight, parseCrossRefFile, parseCrossRefLine, versesIn } from './crossrefs.ts';

test('every one of the 66 books maps to Tapestry\'s own book, in the right order', () => {
  assert.equal(Object.keys(OSIS_TO_CODE).length, 66);
  assert.equal(new Set(Object.values(OSIS_TO_CODE)).size, 66);
  const name = (osis: string) => BOOKS.find((b) => b.code === OSIS_TO_CODE[osis.toLowerCase()])!.name;
  assert.equal(name('Gen'), 'Genesis'); assert.equal(name('Ps'), 'Psalms'); assert.equal(name('Song'), BOOKS[21].name);
  assert.equal(name('Matt'), 'Matthew'); assert.equal(name('Phil'), 'Philippians'); assert.equal(name('Phlm'), 'Philemon');
  assert.equal(name('Jas'), 'James'); assert.equal(name('1John'), '1 John'); assert.equal(name('Obad'), 'Obadiah'); assert.equal(name('Rev'), 'Revelation');
  assert.equal(name('1Sam'), '1 Samuel'); assert.equal(name('2Thess'), '2 Thessalonians'); assert.equal(name('Jonah'), 'Jonah'); assert.equal(name('Nah'), 'Nahum');
});

test('a line becomes Tapestry passage keys', () => {
  assert.deepEqual(parseCrossRefLine('Gen.1.1\tProv.8.22-Prov.8.30\t59'), { from: 'GEN.1.1', to: 'PRO.8.22-30', votes: 59 });
  assert.deepEqual(parseCrossRefLine('John.3.16\tRom.5.8\t120'), { from: 'JHN.3.16', to: 'ROM.5.8', votes: 120 });
  assert.deepEqual(parseCrossRefLine('Ps.23.1   Ezek.34.11-Ezek.34.16   7'), { from: 'PSA.23.1', to: 'EZK.34.11-16', votes: 7 }, 'spaces instead of tabs are fine');
  assert.equal(parseCrossRefLine('Gen.1.1\tPs.8.3-Ps.9.2\t4')?.to, 'PSA.8.3', 'a range that crosses a chapter keeps only its first verse');
  assert.equal(parseCrossRefLine('Gen.1.1\tProv.8.22-Prov.8.22\t4')?.to, 'PRO.8.22');
  assert.equal(parseCrossRefLine('Gen.1.1\tZzz.8.22\t4'), null, 'an unknown book is not guessed');
  assert.equal(parseCrossRefLine('From Verse\tTo Verse\tVotes'), null);
  assert.equal(parseCrossRefLine(''), null);
});

test('a file: header skipped, low votes and self-links dropped, repeats keep the best vote', () => {
  const text = ['From Verse\tTo Verse\tVotes', 'Gen.1.1\tJohn.1.1\t80', 'Gen.1.1\tJohn.1.1\t90', 'Gen.1.1\tPs.8.3\t2', 'Gen.1.2\tGen.1.2\t50', 'Gen.1.1\tHeb.11.3\t30', 'nonsense 9.9', ''].join('\n');
  const p = parseCrossRefFile(text, { minVotes: 5 });
  assert.deepEqual(p.rows, [{ from: 'GEN.1.1', to: 'JHN.1.1', votes: 90 }, { from: 'GEN.1.1', to: 'HEB.11.3', votes: 30 }]);
  assert.equal(p.dataLines, 6);
  assert.equal(p.skipped, 1);
});

test('the loader refuses a file that does not look like the real one', () => {
  assert.equal(looksRight({ rows: [], dataLines: 10, skipped: 0 }), false, 'far too small');
  assert.equal(looksRight({ rows: [], dataLines: 340000, skipped: 100 }), true);
  assert.equal(looksRight({ rows: [], dataLines: 340000, skipped: 90000 }), false, 'too many lines were not understood');
});

test('which verses to look up for a passage', () => {
  assert.deepEqual(versesIn('PSA.23.1'), ['PSA.23.1']);
  assert.deepEqual(versesIn('ISA.40.28-31'), ['ISA.40.28', 'ISA.40.29', 'ISA.40.30', 'ISA.40.31']);
  assert.equal(versesIn('PSA.23'), 'chapter');
  assert.equal(versesIn('GEN.1.1-99'), null, 'a huge range is refused');
  assert.equal(versesIn('nonsense'), null);
});

import { rankRelated } from './crossrefs.ts';
test('related passages: added up per target, strongest first, never the passage itself', () => {
  const rows = [
    { from_ref: 'ISA.40.28', to_ref: 'PSA.147.4', votes: 10 }, { from_ref: 'ISA.40.29', to_ref: 'PSA.147.4', votes: 15 },
    { from_ref: 'ISA.40.31', to_ref: 'JHN.1.1', votes: 40 }, { from_ref: 'ISA.40.28', to_ref: 'ISA.40.30', votes: 99 }, { from_ref: 'ISA.40.28', to_ref: 'ROM.8.1-4', votes: 5 },
  ];
  const r = rankRelated(rows, 'ISA.40.28-31');
  assert.deepEqual(r.map((x) => [x.ref, x.votes]), [['JHN.1.1', 40], ['PSA.147.4', 25], ['ROM.8.1-4', 5]]);
  assert.deepEqual(r[1].from, ['ISA.40.28', 'ISA.40.29']);
  assert.equal(rankRelated(rows, 'ISA.40', 1).length, 1, 'chapter search and a size limit');
  assert.ok(!rankRelated([{ from_ref: 'ISA.40.1', to_ref: 'ISA.40.2', votes: 9 }], 'ISA.40').length, 'a verse in the same chapter is not "related" to the chapter');
});
