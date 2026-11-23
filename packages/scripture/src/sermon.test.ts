import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleDraft, cleanProse, draftToText, longestSharedRun, mentionsOtherRef, DRAFT_LABEL, QUOTE_RUN } from './sermon.ts';

const PSALM = 'The LORD is my shepherd; I shall not want. He makes me lie down in green pastures. He leads me beside still waters.';
const passages = { 'PSA.23': PSALM };
const allowed = new Set(['PSA.23', 'ISA.40.28-31']);
const ctx = { passages, allowed, maxChars: 2000 };

test('quoting is measured as words in a row', () => {
  assert.equal(longestSharedRun('He makes me lie down in green pastures', PSALM), 8);
  assert.ok(longestSharedRun('Rest is a gift we often resist', PSALM) <= 1, 'a stray shared word is not quoting');
  assert.ok(longestSharedRun('We read that the LORD is my shepherd today', PSALM) >= QUOTE_RUN - 1);
});

test('references: chosen passages and chapters are fine, a different real passage is not', () => {
  assert.equal(mentionsOtherRef('Notice how Psalm 23 begins.', allowed), false);
  assert.equal(mentionsOtherRef('Psalm 23:4 comes next.', allowed), false, 'a verse inside a chosen chapter');
  assert.equal(mentionsOtherRef('Compare this with John 3:16.', allowed), true);
  assert.equal(mentionsOtherRef('We met on Chapter 3 of the book.', allowed), false, 'not a real book');
});

test('good sentences stay, in order', () => {
  const out = cleanProse('Rest is hard to receive. Many of us push on when we are tired. It can help to slow down and notice.', ctx);
  assert.equal(out, 'Rest is hard to receive. Many of us push on when we are tired. It can help to slow down and notice.');
});

test('each rule removes only the sentence that breaks it', () => {
  const bad = [
    'The LORD is my shepherd; I shall not want, as the text says.',      // quotes the passage
    'God will heal you of every sickness if you trust.',                  // promise
    'Stop taking your medication and rely on prayer instead.',            // medical
    'Thus says the Lord, you must repent today.',                         // speaks for God
    'See also John 3:16 for more on this theme today.',                  // a passage that was not chosen
    'Visit https://example.com for the full sermon notes.',               // link
  ];
  const good = ['Notice how the writer moves from need to rest.', 'Think about where you carry worry this week.'];
  const out = cleanProse([good[0], ...bad, good[1]].join(' '), ctx);
  assert.equal(out, good.join(' '));
});

test('a long quotation of anything is removed, and too little left means nothing is shown', () => {
  assert.equal(cleanProse('He said "this is a very long quotation that goes on and on for many words indeed" and left.', ctx), '');
  assert.equal(cleanProse('Only one good sentence survives here.', ctx), '', 'a single line is not a section');
  assert.equal(cleanProse(42, ctx), '');
});

test('the size limit stops at a sentence', () => {
  const s = Array.from({ length: 30 }, (_, i) => `Sentence number ${i} is a plain and gentle thought.`).join(' ');
  const out = cleanProse(s, { ...ctx, maxChars: 200 });
  assert.ok(out.length <= 200 && out.endsWith('.'));
});

test('a draft keeps only chosen passages, drops unsafe sections, and adds passages the AI skipped', () => {
  const d = assembleDraft({
    title: 'Resting in care',
    intro: 'Many of us come to this passage tired. Let us slow down together before we begin.',
    sections: [
      { heading: 'A shepherd who provides', refs: ['PSA.23', 'GEN.1.1'], body: 'Notice how the writer speaks of provision. Think about what it means to be cared for. Consider where you feel unsure.' },
      { heading: 'Strength for the weary', refs: ['ISA.40.28-31'], body: 'God will heal you of all weakness. Stop taking your medication.' },
    ],
    closing: 'Take a moment to think about what you heard. Carry one thought with you this week.',
  }, 'pastoral', 'Rest', ['PSA.23', 'ISA.40.28-31'], passages)!;
  assert.equal(d.source, 'ai');
  assert.equal(d.label, DRAFT_LABEL);
  assert.deepEqual(d.sections.map((s) => s.refs), [['PSA.23'], ['ISA.40.28-31']]);
  assert.equal(d.sections[1].heading, 'Also read', 'the unsafe section was dropped, so its passage is listed without AI text');
  assert.equal(d.sections[1].body, '');
  assert.ok(d.intro.includes('slow down together') && d.closing.includes('one thought'));
});

test('nothing safe means no draft', () => {
  assert.equal(assembleDraft({ sections: [{ refs: ['PSA.23'], body: 'God will heal you. Thus says the Lord.' }] }, 'teaching', 'T', ['PSA.23'], passages), null);
  for (const bad of [null, undefined, {}, { sections: 'x' }]) assert.equal(assembleDraft(bad as never, 'teaching', 'T', ['PSA.23'], passages), null);
});

test('plain text puts the verses in word for word and says which part is AI', () => {
  const d = assembleDraft({ sections: [{ heading: 'Provision', refs: ['PSA.23'], body: 'Notice how the writer speaks of provision. Think about what it means to be cared for.' }] }, 'pastoral', 'Rest', ['PSA.23'], passages)!;
  const t = draftToText(d, { 'PSA.23': PSALM }, 'WEB');
  assert.ok(t.includes(PSALM) && t.includes('Psalms 23 (WEB)') && t.includes(DRAFT_LABEL));
  assert.ok(t.endsWith('The rest of this draft is.'));
});
