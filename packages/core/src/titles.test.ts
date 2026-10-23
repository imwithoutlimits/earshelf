import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanAuthor, isPlaceholderTitle, normalizeTitle, pickTitle, titleFromFileName } from './titles.ts';
import { parseStructure } from './structure.ts';

test('junk titles from file metadata are recognised', () => {
  for (const t of ['Unknown', 'unknown', 'Untitled', 'untitled document', 'Document1', 'Microsoft Word - Document1.docx', 'IMG_2031', 'scan0012', '1000470870', '   ', 'N/A', 'Title', '-', 'Slide 1']) {
    assert.equal(isPlaceholderTitle(t), true, t);
  }
  for (const t of ['Field Notes on Slow Cities', 'Atomic Habits', 'Q3 churn review', 'Why Sleep Matters']) assert.equal(isPlaceholderTitle(t), false, t);
});
test('app prefixes and extensions are stripped, snake_case becomes words', () => {
  assert.equal(normalizeTitle('Microsoft Word - Chapter 1 Notes.docx'), 'Chapter 1 Notes');
  assert.equal(normalizeTitle('annual_report_2025.pdf'), 'annual report 2025');
});
test('the first real candidate wins, otherwise undefined', () => {
  assert.equal(pickTitle(['Unknown', undefined, 'Real Title', 'Other']), 'Real Title');
  assert.equal(pickTitle(['Unknown', 'Untitled']), undefined);
  assert.equal(titleFromFileName('IMG_0001.jpg'), undefined);
  assert.equal(titleFromFileName('Atomic%20Habits.pdf'), 'Atomic Habits');
});
test('placeholder authors are dropped', () => {
  assert.equal(cleanAuthor('Unknown'), undefined); assert.equal(cleanAuthor(' admin '), undefined); assert.equal(cleanAuthor('Imogen Hale'), 'Imogen Hale');
});
test('a document whose metadata says Unknown takes its title from the text instead', () => {
  const doc = parseStructure('# Field Notes\n\nA first paragraph.', { title: 'Unknown', sourceType: 'md' });
  assert.equal(doc.title, 'Field Notes');
  assert.equal(parseStructure('Some words here.', { title: 'Untitled', sourceType: 'txt' }).title, 'Some words here.');
});
