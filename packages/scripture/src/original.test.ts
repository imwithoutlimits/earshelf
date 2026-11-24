import test from 'node:test';
import assert from 'node:assert/strict';
import { approxBytes, groupByVerse, langOf, looksRightOriginal, mainStrongs, parseStepFile, verseKeys, STEP_CREDIT } from './original.ts';

const t = (...cells: string[]) => cells.join('\t');
// Rows copied from the real TAHOT Gen-Deu file (STEPBible.org, CC BY 4.0), tab separated.
const HDR = t('Eng (Heb) Ref & Type', 'Hebrew', 'Transliteration', 'Translation', 'dStrongs', 'Grammar', 'Meaning Variants', 'Spelling Variants', 'Root dStrong+Instance', 'Alternative Strongs+Instance', 'Conjoin word', 'Expanded Strong tags');
const he = (ref: string, hebrew: string, tr: string, gloss: string, strongs: string, gram: string) => t(ref, hebrew, tr, gloss, strongs, gram, '', '', '', '', '', '');
const HEBREW = [
  '# Gen.1.1\tbe.re.Shit (בְּרֵאשִׁ֖ית)', '#_Translation\tin/ beginning', '', HDR,
  he('Gen.1.1#01=L', 'בְּ/רֵאשִׁ֖ית', 'be./re.Shit', 'in/ beginning', 'H9003/{H7225G}', 'HR/Ncfsa'),
  he('Gen.1.1#02=L', 'בָּרָ֣א', "ba.Ra'", 'he created', '{H1254A}', 'HVqp3ms'),
  he('Gen.1.1#03=L', 'אֱלֹהִ֑ים', "'E.lo.Him", 'God', '{H0430G}', 'HNcmpa'),
  he('Gen.1.1#04=L', 'אֵ֥ת', "'et", '<obj.>', '{H0853}', 'HTo'),
  he('Gen.1.1#05=L', 'הַ/שָּׁמַ֖יִם', 'ha./sha.Ma.yim', 'the/ heavens', 'H9009/{H8064}', 'HTd/Ncmpa'),
  he('Gen.1.1#06=L', 'וְ/אֵ֥ת', "ve./'Et", 'and/ <obj.>', 'H9002/{H0853}', 'HC/To'),
  he('Gen.1.1#07=L', 'הָ/אָֽרֶץ\\׃', "ha./'A.retz", 'the/ earth', 'H9009/{H0776G}\\H9016', 'HTd/Ncfsa'),
  he('Gen.1.12#09=LAH(b)', 'עֹֽשֶׂה\\־', "'o.seh-", 'producing', '{H6213H}\\H9014', 'HVqrmsa'),
  he('Psa.3.0#01=L', 'מִזְמוֹר', 'miz.Mor', 'a psalm', '{H4210}', 'HNcmsa'),
  he('Gen.1.2#01=K', 'וְהָאָרֶץ', 'x', 'ketiv only', '{H0776G}', 'HC'),
  he('Psa.4.1(4.2)#01=L', 'בְּקָרְאִי', 'be.kor.I', 'when/ I call', 'H9003/{H7121H}', 'HR/Vqc'),
].join('\n');

test('real TAHOT rows become words: separators removed, the root Strong\'s number chosen', () => {
  const rows = parseStepFile(HEBREW, 'he').filter((r) => r.ref === 'GEN.1.1');
  assert.equal(rows.length, 7);
  assert.deepEqual([rows[0].word, rows[0].translit, rows[0].gloss, rows[0].strongs], ['בְּרֵאשִׁ֖ית', 'be.re.Shit', 'in beginning', 'H7225']);
  assert.deepEqual([rows[6].word, rows[6].gloss, rows[6].strongs], ['הָאָֽרֶץ׃', 'the earth', 'H0776'], 'the "\\" mark is gone and the number after it is ignored');
  assert.equal(rows[3].gloss, '<obj.>', "STEPBible's own notation is kept");
  assert.equal(rows[4].strongs, 'H8064', 'the prefix number H9009 is not chosen');
});

test('only the main text is kept: no Ketiv-only rows, no verse 0, variants of a kept word are fine', () => {
  const all = parseStepFile(HEBREW, 'he');
  assert.ok(!all.some((r) => r.gloss === 'ketiv only'));
  assert.ok(!all.some((r) => r.ref === 'PSA.3.0'));
  assert.ok(all.some((r) => r.ref === 'GEN.1.12'), 'a word whose type carries extra notes (LAH(b)) is still the main text and is kept');
  assert.ok(all.some((r) => r.ref === 'PSA.4.1'), 'a Hebrew verse number in brackets does not break the English reference');
});

test('verses are grouped in word order, once each', () => {
  const doubled = HEBREW + '\n' + he('Gen.1.1#01=L', 'דופליקט', 'dup', 'duplicate', '{H0001}', 'HN');
  const v = groupByVerse(parseStepFile(doubled, 'he'), 'he').find((x) => x.ref === 'GEN.1.1')!;
  assert.equal(v.words.length, 7);
  assert.equal(v.words[0][2], 'in beginning', 'the first reading of a position wins');
  assert.deepEqual(v.words[1], ['בָּרָ֣א', "ba.Ra'", 'he created', 'H1254']);
});

test('main Strong\'s number: root in braces, else the first number, else nothing', () => {
  assert.equal(mainStrongs('H9003/{H7225G}'), 'H7225');
  assert.equal(mainStrongs('{H0430G}'), 'H0430');
  assert.equal(mainStrongs('G0976=N-NSF'), 'G0976');
  assert.equal(mainStrongs('H9002/H0853'), 'H9002');
  assert.equal(mainStrongs(''), '');
});

// The Greek layout below is my best understanding of TAGNT and has NOT been checked against the real file yet.
// The loader's dry run is the check: if the real file differs, nothing Greek is saved and the log shows what to fix.
const GREEK = [
  t('Word & Type', 'Greek', 'English translation', 'dStrongs = Grammar', 'Dictionary form =  Gloss', 'editions'),
  t('Mat.1.1#01=NKO', 'Βίβλος (Biblos)', '[The] book', 'G0976=N-NSF', 'βίβλος=book', 'NA28+NA27+TR'),
  t('Mat.1.1#02=NKO', 'γενέσεως (geneseōs)', 'of [the] genealogy', 'G1078=N-GSF', 'γένεσις=origin', 'NA28+NA27+TR'),
  t('Mat.1.1#03=k', 'εξτρα (extra)', 'variant only', 'G9999=N-NSF', 'x=y', 'TR'),
].join('\n');

test('Greek rows are read through the file\'s own header, with the transliteration taken from the brackets', () => {
  const rows = parseStepFile(GREEK, 'gr');
  assert.equal(rows.length, 2, 'a word that is not in the NA text is left out');
  assert.deepEqual([rows[0].ref, rows[0].word, rows[0].translit, rows[0].gloss, rows[0].strongs], ['MAT.1.1', 'Βίβλος', 'Biblos', '[The] book', 'G0976']);
});

test('the loader refuses files that do not look like the whole Bible, and tells the owner the size', () => {
  const tiny = groupByVerse(parseStepFile(HEBREW, 'he'), 'he');
  assert.equal(looksRightOriginal(tiny, 'he'), false);
  const big = Array.from({ length: 23_000 }, (_, i) => ({ ref: `GEN.1.${i}`, lang: 'he' as const, words: Array.from({ length: 14 }, (): [string, string, string, string] => ['מילה', 'mi.la', 'word', 'H1234']) }));
  assert.equal(looksRightOriginal(big, 'he'), true);
  assert.equal(looksRightOriginal(big, 'gr'), true);
  assert.ok(approxBytes(big) > 10_000_000);
  const broken = big.map((v, i) => (i % 5 === 0 ? { ...v, words: [['', '', '', '']] as typeof v.words } : v));
  assert.equal(looksRightOriginal(broken as never, 'he'), false, 'too many empty words');
});

test('which verses to look up, and which language a book is in', () => {
  assert.deepEqual(verseKeys('PSA.23.1'), ['PSA.23.1']);
  assert.deepEqual(verseKeys('ISA.40.28-30'), ['ISA.40.28', 'ISA.40.29', 'ISA.40.30']);
  assert.equal(verseKeys('PSA.23'), null);
  assert.equal(verseKeys('GEN.1.1-99'), null);
  assert.equal(langOf('GEN.1.1'), 'he');
  assert.equal(langOf('MAL.4.6'), 'he');
  assert.equal(langOf('MAT.1.1'), 'gr');
  assert.equal(langOf('REV.22.21'), 'gr');
  assert.match(STEP_CREDIT, /STEPBible\.org/);
  assert.match(STEP_CREDIT, /CC BY 4\.0/);
});
