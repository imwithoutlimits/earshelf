
import { cleanPages, countExtras, dropSections, findContents, listSections, stripEmoji, stripUrls, DEFAULT_CLEANUP } from './cleanup.ts';
import test from 'node:test';
import assert from 'node:assert/strict';

const BOOK = '# One\n\nFirst chapter text here.\n\n## One point one\n\nA sub section.\n\n# Acknowledgements\n\nThanks to everyone.\n\n# Two\n\nSecond chapter text.\n\n# Acknowledgements\n\nA second one.';

test('sections are listed with stable keys, and the same title twice is told apart', () => {
  const s = listSections(BOOK);
  assert.deepEqual(s.map((x) => x.key), ['one|1', 'one point one|1', 'acknowledgements|1', 'two|1', 'acknowledgements|2']);
  assert.equal(s[0].words > 0, true);
});
test('skipping a section removes it and what is under it, up to the next heading of the same or higher level', () => {
  const out = dropSections(BOOK, ['one|1']);
  assert.ok(!out.includes('First chapter') && !out.includes('A sub section'));
  assert.ok(out.includes('Thanks to everyone') && out.includes('Second chapter'));
  const only2nd = dropSections(BOOK, ['acknowledgements|2']);
  assert.ok(only2nd.includes('Thanks to everyone') && !only2nd.includes('A second one'));
  assert.equal(dropSections(BOOK, []), BOOK);
});
test('urls, emails and emoji can be removed without touching the sentence', () => {
  assert.equal(stripUrls('Read more at https://example.com/page. Mail me@site.org today.'), 'Read more at. Mail today.');
  assert.equal(stripEmoji('Great read 😀 really'), 'Great read really');
  assert.equal(stripEmoji('Acme™ and © 2026'), 'Acme™ and © 2026');
});
test('a table of contents with page numbers is found and removed', () => {
  const lines = ['Title', '', 'Contents', 'Introduction ........ 1', 'Chapter one ........ 7', 'Chapter two ........ 19', '', 'Introduction', 'Real text begins here.'];
  const toc = findContents(lines)!;
  assert.deepEqual([toc.from, toc.entries], [2, 3]);
  assert.equal(findContents(['Contents', 'Only one ..... 3', 'text']), null);
});
test('cleanPages applies the new options, and older saved options still work', () => {
  const pages = ['Intro\n\nSee https://x.org for more.\n\nTable 1 Sales\n\n| a | b |\n\nFigure 2 A chart\n\nBody text stays.'];
  const on = cleanPages(pages, { ...DEFAULT_CLEANUP, urls: true, tables: true, figures: true });
  assert.ok(!on.includes('https') && !on.includes('Table 1') && !on.includes('| a') && !on.includes('Figure 2') && on.includes('Body text stays'));
  const old = cleanPages(pages, { ...DEFAULT_CLEANUP }); // options saved before these existed
  assert.ok(old.includes('Table 1') && old.includes('https'));
});
test('counts for the checklist', () => {
  const c = countExtras(['Visit https://a.com and www.b.org or mail x@y.com 😀']);
  assert.equal(c.urls, 3); assert.equal(c.emoji, 1);
});
