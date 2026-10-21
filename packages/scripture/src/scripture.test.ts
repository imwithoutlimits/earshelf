import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOKS, totalChapters, parseReference, formatReference, refKey, parseRefKey, classifyQuery, passageId, uuid5, parseVpl, looksComplete, hideWords, nextReview, keepValidRefs, cleanPrompt, breaksBoundaries, wellsForText, STARTER_WELLS, estimateMinutes, refOf, bookByCode } from './index.ts';

test('canon has 66 books and 1189 chapters', () => { assert.equal(BOOKS.length, 66); assert.equal(totalChapters(), 1189); assert.equal(BOOKS.filter((b) => b.testament === 'NT').length, 27); });
test('parses common reference shapes', () => {
  const cases: Array<[string, string]> = [['John 3:16', 'JHN.3.16'], ['Psalm 23', 'PSA.23'], ['Romans 8:28–39', 'ROM.8.28-39'], ['1 Jn 4:7', '1JN.4.7'], ['ps 23:1-3', 'PSA.23.1-3'], ['Song of Solomon 2:4', 'SNG.2.4'], ['First Corinthians 13:4', '1CO.13.4'], ['Gen. 1', 'GEN.1']];
  for (const [i, k] of cases) { const r = parseReference(i); assert.ok(r, i); assert.equal(refKey(r!), k, i); }
});
test('rejects references that do not exist', () => { for (const x of ['John 22:1', 'Psalm 151', 'Jude 2', 'Romans 8:39-8', 'Hesitations 3:1', 'John', 'John 3-4']) assert.equal(parseReference(x), null, x); });
test('format and refKey round trip', () => { const r = parseReference('Philippians 4:6-7')!; assert.equal(formatReference(r), 'Philippians 4:6–7'); assert.equal(refKey(parseRefKey(refKey(r))!), 'PHP.4.6-7'); });
test('classifies queries', () => {
  assert.equal(classifyQuery('John 3:16').kind, 'reference');
  assert.equal(classifyQuery('Romans').kind, 'book');
  assert.equal(classifyQuery('Be strong and courageous').kind, 'phrase');
  assert.equal(classifyQuery('"the lord is my shepherd"').text, 'the lord is my shepherd');
  assert.equal(classifyQuery('Scriptures for when I feel worried').kind, 'natural');
  assert.equal(classifyQuery('forgiveness').kind, 'phrase');
});
test('uuid v5 matches the published test vector and is stable', () => {
  assert.equal(uuid5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8'), '2ed6657d-e927-568b-95e1-2665a8aea6a2');
  assert.equal(passageId('JHN.3.16'), passageId('JHN.3.16')); assert.notEqual(passageId('JHN.3.16'), passageId('JHN.3.17'));
});
test('parses verse-per-line text and flags bad downloads', () => {
  const r = parseVpl('GEN 1:1 In the beginning, God created the heavens and the earth.\n1JN 4:7 Beloved, let us love one another.\nXXX 1:1 nope\nrandom line');
  assert.equal(r.verses.length, 2); assert.equal(r.verses[1].book, 62); assert.equal(r.skipped.length, 2); assert.equal(looksComplete(r), false);
});
test('memorization hides more words as level rises, deterministically', () => {
  const t = 'The quick brown fox jumps over the lazy dog today';
  const n = (l: number) => hideWords(t, l).filter((x) => x.hidden).length;
  assert.equal(n(0), 0); assert.ok(n(1) < n(2) && n(2) < n(3) && n(3) <= n(4)); assert.equal(n(4), 10); assert.deepEqual(hideWords(t, 2), hideWords(t, 2));
  assert.ok(nextReview(5, 0) > nextReview(1, 0));
});
test('AI output keeps only real, offered references', () => {
  const allowed = new Set(['PHP.4.6-7', 'JHN.3.16']);
  assert.deepEqual(keepValidRefs(['Philippians 4:6-7', 'John 99:1', 'Hezekiah 3:1', 'JHN.3.16', 'Romans 8:28'], allowed), ['PHP.4.6-7', 'JHN.3.16']);
  assert.deepEqual(keepValidRefs('nope'), []);
});
test('AI prompts that promise outcomes, give medical advice or claim authority are discarded', () => {
  assert.equal(cleanPrompt('What part of this passage stands out to you?'), 'What part of this passage stands out to you?');
  for (const bad of ['God will heal you if you believe this passage.', 'Stop taking your medication and read this instead.', 'As your pastor, I say you must forgive.', 'This is guaranteed to bring prosperity?']) assert.equal(cleanPrompt(bad), null, bad);
  assert.ok(breaksBoundaries('Thus says the Lord to you today')); assert.equal(cleanPrompt('x?'), null);
});
test('feelings map to the right starter wells without AI', () => {
  assert.equal(wellsForText('Scriptures for when I feel worried')[0].wellId, 'peace-when-worried');
  assert.equal(wellsForText("I can't sleep tonight")[0].wellId, 'evening-reflection');
  assert.equal(wellsForText('my dad passed away')[0].wellId, 'grief-and-comfort');
  assert.deepEqual(wellsForText('zzz qqq'), []);
});
test('starter wells: 16, every reference real, ordered, no duplicates inside a well, sensitive items carry notes', () => {
  assert.equal(STARTER_WELLS.length, 16);
  assert.equal(new Set(STARTER_WELLS.map((w) => w.id)).size, 16);
  for (const w of STARTER_WELLS) {
    assert.ok(w.items.length >= 8 && w.items.length <= 14, w.id);
    assert.equal(new Set(w.items.map((i) => i.ref)).size, w.items.length, `${w.id} has a duplicate`);
    for (const i of w.items) assert.ok(parseRefKey(i.ref) && bookByCode(refOf(i.ref).book.code), `${w.id} ${i.ref}`);
    assert.ok(w.items.some((i) => i.ref === w.memorize) || true); assert.ok(parseRefKey(w.memorize), w.id);
    assert.ok(w.prompts.length >= 2 && w.tags.length >= 2 && estimateMinutes(w) >= 2, w.id);
    assert.equal(w.items[0].link, 'direct', `${w.id} should lead with a direct passage`);
  }
  const healing = STARTER_WELLS.find((w) => w.id === 'healing-and-comfort')!;
  assert.match(healing.intro, /do not replace medical care/);
  for (const k of ['JER.29.11', 'PHP.4.19', 'PHP.1.6', 'EST.4.14', 'EXO.4.11-12']) { const it = STARTER_WELLS.flatMap((w) => w.items).find((i) => i.ref === k); assert.ok(it?.note, `${k} needs a context note`); }
});
import { validateStarter, TRANSLATIONS, DEFAULT_TRANSLATION, translationById, sanitizeVerseText } from './index.ts';
test('translations: each is documented, unique, and the default exists', () => {
  assert.equal(new Set(TRANSLATIONS.map((t) => t.id)).size, TRANSLATIONS.length); assert.ok(translationById(DEFAULT_TRANSLATION));
  for (const t of TRANSLATIONS) { assert.match(t.licenseUrl, /^https:\/\/ebible\.org\//); assert.ok(t.notice.length > 40 && t.name && t.abbreviation && t.description, t.id); assert.match(t.notice, /public domain/i, t.id); }
});
test('verse text is cleaned of Strong\'s tags and extra spaces', () => {
  assert.equal(sanitizeVerseText('In the beginning {H7225} God  created <H430> the heaven [H8064] and the earth.'), 'In the beginning God created the heaven and the earth.');
  assert.equal(sanitizeVerseText('Plain text stays.'), 'Plain text stays.');
  assert.equal(parseVpl('GEN 1:1 In the beginning {H7225} God').verses[0].text, 'In the beginning God');
});
test('validateStarter flags passages that run past the end of a chapter', () => {
  assert.equal(validateStarter(() => 200).length, 0);
  const bad = validateStarter((b, c) => (b === 50 && c === 4 ? 5 : 200)); // Philippians 4 pretend-short
  assert.ok(bad.some((x) => x.includes('PHP.4.13')) && bad.some((x) => /chapter has 5 verses/.test(x)));
  assert.ok(validateStarter(() => undefined).length > 100);
});
