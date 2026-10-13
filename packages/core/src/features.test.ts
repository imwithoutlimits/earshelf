import test from 'node:test';
import assert from 'node:assert/strict';
import { mathToSpeech, replaceInlineMath } from './math.ts';
import { segmentDialogue } from './dialogue.ts';
import { parseStructure } from './structure.ts';
import { MODE_PRESETS, buildUtterances, sanitizeOverrides, scaledNarration } from './narration.ts';
import { toCsv, toMarkdown, toReadwiseCsv, type ExportItem } from './exporters.ts';
import { parseShare } from './share.ts';
import { audioCacheKey } from './chunks.ts';

test('math: fractions, roots, powers, symbols read as words', () => {
  assert.equal(mathToSpeech('\\frac{a}{b}'), 'a over b');
  assert.equal(mathToSpeech('x^2 + y^2 = r^2'), 'x squared plus y squared equals r squared');
  assert.equal(mathToSpeech('E = mc^{2}'), 'E equals mc squared');
  assert.equal(mathToSpeech('\\sqrt{x+1}'), 'the square root of x plus 1');
  assert.equal(mathToSpeech('\\sqrt[3]{8}'), 'the cube root of 8');
  assert.equal(mathToSpeech('a_{n+1} \\leq 2^{n}'), 'a sub n plus 1 less than or equal to 2 to the power n');
  assert.equal(mathToSpeech('\\frac{\\frac{1}{2}}{3}'), '1 over 2 over 3');
  assert.equal(mathToSpeech('\\alpha \\cdot \\pi'), 'alpha times pi');
  assert.equal(mathToSpeech('$$ x \\neq 0 $$'), 'x not equal to 0');
  assert.equal(mathToSpeech('a ≤ b ± 2'), 'a less than or equal to b plus or minus 2');
});

test('inline math: real formulas are caught, money is left alone', () => {
  assert.equal(replaceInlineMath('Let $x^2$ be positive.', 'symbols'), 'Let x squared be positive.');
  assert.equal(replaceInlineMath('Let $x^2$ be positive.', 'off'), 'Let an equation be positive.');
  const money = 'It costs $5 and then $10 more, so $5-$10 is the range.';
  assert.equal(replaceInlineMath(money, 'symbols'), money);
});

test('equation blocks are parsed and read, or skipped when equations are off', () => {
  const doc = parseStructure('# Physics\n\nEnergy follows this law.\n\n$$ E = mc^2 $$\n\nThat was it.', { sourceType: 'md' });
  assert.deepEqual(doc.blocks.map((b) => b.type), ['heading', 'paragraph', 'equation', 'paragraph']);
  const on = buildUtterances(doc, { ...MODE_PRESETS.study, equations: 'symbols' });
  assert.ok(on.some((u) => u.kind === 'equation' && u.spoken === 'Equation. E equals mc squared' && u.text === 'E = mc^2'));
  const off = buildUtterances(doc, { ...MODE_PRESETS.study, equations: 'off' });
  assert.ok(!off.some((u) => u.kind === 'equation'));
});

test('citations: skip, author-year and full differ', () => {
  const doc = parseStructure('# T\n\nIt works [3] as shown (Lee, 2019).', { sourceType: 'md' });
  const say = (c: 'skip' | 'author-year' | 'full') => buildUtterances(doc, { ...MODE_PRESETS.clean, citations: c }).find((u) => u.kind === 'paragraph')!.spoken;
  assert.equal(say('skip'), 'It works as shown.');
  assert.equal(say('author-year'), 'It works as shown (Lee, 2019).');
  assert.equal(say('full'), 'It works [3] as shown (Lee, 2019).');
});

test('dialogue: quotes split into their own segments, unclosed quote runs on', () => {
  assert.deepEqual(segmentDialogue('She smiled. “Come in,” he said. “Sit down.”'), [
    { text: 'She smiled.', dialogue: false }, { text: '“Come in,”', dialogue: true }, { text: 'he said.', dialogue: false }, { text: '“Sit down.”', dialogue: true }]);
  assert.deepEqual(segmentDialogue('He said "yes" twice.').map((s) => s.dialogue), [false, true, false]);
  assert.deepEqual(segmentDialogue('“Never closed').map((s) => s.dialogue), [true]);
  assert.deepEqual(segmentDialogue('No speech here.'), [{ text: 'No speech here.', dialogue: false }]);
});

test('dialogue splitting marks utterances only when enabled, with a short breath after a cut sentence', () => {
  const doc = parseStructure('# Story\n\n“Come in,” he said. The door opened.', { sourceType: 'md' });
  const off = buildUtterances(doc, scaledNarration('audiobook', 1));
  assert.ok(off.every((u) => !u.role));
  const on = buildUtterances(doc, scaledNarration('audiobook', 1, { dialogue: true }));
  const roles = on.filter((u) => u.kind === 'paragraph').map((u) => [u.text, u.role ?? 'narrator']);
  assert.deepEqual(roles, [['“Come in,”', 'dialogue'], ['he said.', 'narrator'], ['The door opened.', 'narrator']]);
  assert.equal(on.find((u) => u.text === '“Come in,”')!.pauseAfterMs, 80);
});

test('overrides win over the reading mode; unknown values are dropped', () => {
  const o = scaledNarration('clean', 1, { citations: 'full', equations: 'symbols', tables: 'read' });
  assert.deepEqual([o.citations, o.equations, o.tables], ['full', 'symbols', 'read']);
  assert.equal(scaledNarration('clean', 1).citations, 'skip');
  assert.deepEqual(sanitizeOverrides({ citations: 'full', equations: 'hack', tables: 'read', dialogue: true, extra: 1 }), { citations: 'full', tables: 'read', dialogue: true });
  assert.deepEqual(sanitizeOverrides('nonsense'), {});
});

test('cache key: new options change the key only when set', () => {
  const base = { docId: 'd', docUpdatedAt: 1, provider: 'kokoro', voice: 'a', mode: 'clean', pauseScale: 1, pronunciations: [] };
  const k = audioCacheKey(base);
  assert.equal(k, audioCacheKey({ ...base, overrides: {} }));
  assert.notEqual(k, audioCacheKey({ ...base, overrides: { equations: 'symbols' } }));
  assert.notEqual(k, audioCacheKey({ ...base, dialogueVoice: 'b' }));
});

const items: ExportItem[] = [
  { kind: 'highlight', docTitle: 'Book A', docAuthor: 'Ana', section: 'Ch 1', text: 'A "quoted" line, with comma', createdAt: Date.parse('2026-01-02') },
  { kind: 'note', docTitle: 'Book A', section: 'Ch 2', text: 'Another passage', body: '=HYPERLINK("http://evil")', createdAt: Date.parse('2026-01-03') },
  { kind: 'bookmark', docTitle: 'Book B', text: 'Saved place', createdAt: Date.parse('2026-01-01') },
];

test('exports: markdown groups by document; csv escapes quotes and blocks formula injection', () => {
  const md = toMarkdown(items);
  assert.ok(md.includes('## Book A') && md.includes('## Book B') && md.includes('> A "quoted" line, with comma') && md.includes('*Highlight, Ch 1, 2026-01-02*'));
  const csv = toCsv(items);
  assert.ok(csv.startsWith('"Document","Section","Type","Passage","Note","Date"\r\n'));
  assert.ok(csv.includes('"A ""quoted"" line, with comma"'));
  assert.ok(csv.includes(`"'=HYPERLINK(""http://evil"")"`)); // a leading = is defused
  const rw = toReadwiseCsv(items);
  assert.ok(rw.startsWith('"Highlight","Title","Author","URL","Note","Location","Date"'));
  assert.equal(rw.trim().split('\r\n').length, 3); // header plus two (the bookmark is left out)
});

test('share: link in url, link hidden in text (Android), long text, extension import, junk', () => {
  assert.deepEqual(parseShare('?url=https%3A%2F%2Fexample.com%2Fa&title=T'), { kind: 'url', url: 'https://example.com/a' });
  assert.deepEqual(parseShare('?text=' + encodeURIComponent('Check this https://example.com/post.')), { kind: 'url', url: 'https://example.com/post' });
  assert.deepEqual(parseShare('?import=' + encodeURIComponent('https://example.com/x')), { kind: 'url', url: 'https://example.com/x' });
  const long = 'This is a long shared passage of text that is clearly meant to be read aloud later.';
  assert.deepEqual(parseShare('?title=Hi&text=' + encodeURIComponent(long)), { kind: 'text', text: long, title: 'Hi' });
  assert.equal(parseShare('?url=javascript%3Aalert(1)'), null);
  assert.equal(parseShare(''), null);
  assert.equal(parseShare('?text=short'), null);
});
