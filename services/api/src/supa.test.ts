import test from 'node:test';
import assert from 'node:assert/strict';
import { keyHeaders } from './supa.ts';

test('new sb_secret keys go in apikey only; legacy JWT keys go in both headers', () => {
  const modern = keyHeaders('sb_secret_abc123', { 'Content-Type': 'application/json' });
  assert.equal(modern.apikey, 'sb_secret_abc123');
  assert.equal('Authorization' in modern, false);
  assert.equal(modern['Content-Type'], 'application/json');
  const legacy = keyHeaders('eyJhbGciOiJIUzI1NiJ9.payload.sig');
  assert.equal(legacy.apikey, 'eyJhbGciOiJIUzI1NiJ9.payload.sig');
  assert.equal(legacy.Authorization, 'Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig');
});

import { PRODUCT_TABLES, deletionPlan } from './supa.ts';

test('deleting one app\'s content never touches the other app or other people', () => {
  const plan = deletionPlan('user-1', 'earshelf');
  assert.ok(plan.every((p) => p.includes('user_id=eq.user-1')), 'every request names the user');
  for (const t of PRODUCT_TABLES) assert.ok(plan.includes(`${t}?user_id=eq.user-1&product=eq.earshelf`), `${t} is scoped to the product`);
  assert.ok(plan.includes('documents?user_id=eq.user-1'));          // Earshelf-only table
  assert.ok(plan.includes('review_cards?user_id=eq.user-1&product=eq.earshelf')); // cards are now removed too
  assert.ok(!plan.some((p) => p.includes('tapestry')));
  const other = deletionPlan('user-1', 'tapestry');
  assert.ok(!other.some((p) => p.startsWith('documents?') || p.startsWith('document_pronunciations?')), 'Earshelf-only tables are left alone');
  assert.ok(other.every((p) => p.includes('product=eq.tapestry')));
});
