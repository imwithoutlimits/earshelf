import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_TAGS, addTag, advancedHits, docPassesFilters, normalizeTag, parseLibraryQuery, removeTag, searchLibrary, tagCounts, type LibraryDocInfo } from './library.ts';
import { makeShareLink, parseShare } from './share.ts';
import { parseStructure } from './structure.ts';

test('tags are tidied into one form', () => {
  assert.equal(normalizeTag('  #Church  History '), 'church history');
  assert.equal(normalizeTag('tag:evil'), 'tagevil', 'a colon can never sneak into a tag');
  assert.equal(normalizeTag('   '), '');
  assert.equal(normalizeTag('x'.repeat(80)).length, 30);
});

test('adding a tag ignores empties and repeats and stops at the limit', () => {
  assert.deepEqual(addTag([], '#Work'), ['work']);
  assert.deepEqual(addTag(['work'], 'WORK'), ['work']);
  assert.deepEqual(addTag(['work'], '  '), ['work']);
  const full = Array.from({ length: MAX_TAGS }, (_, i) => `t${i}`);
  assert.equal(addTag(full, 'one more').length, MAX_TAGS);
  assert.deepEqual(removeTag(['a', 'b'], 'a'), ['b']);
});

test('tag counts: most used first, then alphabetical', () => {
  assert.deepEqual(tagCounts([{ tags: ['b', 'a'] }, { tags: ['b'] }, { tags: undefined }, { tags: ['c'] }]), [{ tag: 'b', count: 2 }, { tag: 'a', count: 1 }, { tag: 'c', count: 1 }]);
});

test('query words are understood', () => {
  const q = parseLibraryQuery('war "second world" tag:history tag:"church history" type:web author:smith is:finished -fiction');
  assert.deepEqual(q.words, ['war']);
  assert.deepEqual(q.phrases, ['second world']);
  assert.deepEqual(q.tags, ['history', 'church history']);
  assert.deepEqual(q.types.sort(), ['html', 'url']);
  assert.deepEqual(q.authors, ['smith']);
  assert.equal(q.status, 'finished');
  assert.deepEqual(q.exclude, ['fiction']);
  assert.equal(q.hasFilters, true);
  const plain = parseLibraryQuery('coffee beans');
  assert.deepEqual([plain.words, plain.hasFilters], [['coffee', 'beans'], false]);
  assert.deepEqual(parseLibraryQuery('type:nonsense').types, [], 'an unknown type matches nothing extra');
});

const info = (o: Partial<LibraryDocInfo> & { id: string }): LibraryDocInfo => ({ title: 'Untitled', tags: [], sourceType: 'pdf', ...o });

test('filters decide which documents are allowed', () => {
  const d = info({ id: '1', title: 'A History of Coffee', author: 'Ann Smith', tags: ['history', 'food'], sourceType: 'epub' });
  const ok = (s: string, st: 'new' | 'started' | 'finished' = 'new') => docPassesFilters(d, parseLibraryQuery(s), st);
  assert.ok(ok('tag:history tag:food'));
  assert.ok(!ok('tag:history tag:science'));
  assert.ok(ok('type:epub') && !ok('type:pdf'));
  assert.ok(ok('author:smith') && !ok('author:jones'));
  assert.ok(ok('title:coffee'));
  assert.ok(ok('is:finished', 'finished') && !ok('is:finished', 'started'));
  assert.ok(ok('is:unfinished', 'started') && !ok('is:unfinished', 'finished'));
  assert.ok(!ok('-food'), 'excluded word found in the tags');
});

const parsed = parseStructure(['# Coffee', '## Origins', 'Coffee was first cultivated in Ethiopia and spread across Yemen.', '## Brewing', 'Espresso forces hot water through fine grounds. It is not tea.'].join('\n\n'), { sourceType: 'md' });

test('text hits need every word and phrase, and never an excluded word', () => {
  assert.equal(advancedHits(parsed, parseLibraryQuery('coffee ethiopia')).length, 1);
  assert.equal(advancedHits(parsed, parseLibraryQuery('"hot water"')).length, 1);
  assert.equal(advancedHits(parsed, parseLibraryQuery('"water hot"')).length, 0, 'a phrase must match in order');
  assert.equal(advancedHits(parsed, parseLibraryQuery('espresso -tea')).length, 0);
  assert.equal(advancedHits(parsed, parseLibraryQuery('tag:x')).length, 0, 'no words, no text hits');
});

test('library search: filters narrow, tag-only lists documents, title hits come first', () => {
  const a = { doc: info({ id: 'a', title: 'Coffee Atlas', tags: ['food'] }), parsed, state: 'new' as const };
  const b = { doc: info({ id: 'b', title: 'Tea Notes', tags: ['food', 'tea'] }), parsed, state: 'finished' as const };
  assert.deepEqual(searchLibrary([a, b], parseLibraryQuery('tag:food')).map((r) => r.docId).sort(), ['a', 'b']);
  assert.deepEqual(searchLibrary([a, b], parseLibraryQuery('tag:tea')).map((r) => r.docId), ['b']);
  assert.deepEqual(searchLibrary([a, b], parseLibraryQuery('coffee')).map((r) => r.docId).sort(), ['a', 'b'], 'both have the word in their text');
  assert.equal(searchLibrary([a, b], parseLibraryQuery('coffee'))[0].docId, 'a', 'the title match is listed first');
  assert.deepEqual(searchLibrary([a, b], parseLibraryQuery('coffee is:finished')).map((r) => r.docId), ['b']);
  assert.deepEqual(searchLibrary([a, b], parseLibraryQuery('')), []);
});

test('a share link carries only the article address and round-trips through the app', () => {
  const link = makeShareLink('https://app.example/', 'https://news.site/a?id=1&x=2')!;
  assert.equal(link, 'https://app.example/?import=https%3A%2F%2Fnews.site%2Fa%3Fid%3D1%26x%3D2');
  assert.deepEqual(parseShare(new URL(link).search), { kind: 'url', url: 'https://news.site/a?id=1&x=2' });
  assert.equal(makeShareLink('https://app.example', 'javascript:alert(1)'), null);
  assert.equal(makeShareLink('https://app.example', 'not a url'), null);
});
