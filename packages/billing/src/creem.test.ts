import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  accessFor, bestEntitlement, creemProductMap, createCreemCheckout, createCreemPortalLink, decideCreem, handleCreemWebhook, productIdFor,
  verifyCreemSignature, DEFAULT_CREEM_PRODUCTS,
  type CreemStore, type CreemSubscriptionRecord, type EntitlementResult,
} from './creem.ts';

const SECRET = 'whsec_test';
const USER = '3f2b8c1e-5d4a-4c7b-9e1a-2b3c4d5e6f70';
const OTHER = '9a8b7c6d-1e2f-4a3b-8c5d-6e7f80910a1b';
const sign = (body: string, secret = SECRET) => createHmac('sha256', secret).update(body).digest('hex');
const NOW = new Date('2026-11-21T12:00:00Z');
const FUTURE = '2026-12-21T12:00:00.000Z';
const PAST = '2026-10-21T12:00:00.000Z';

const P = {
  esPlusM: productIdFor(DEFAULT_CREEM_PRODUCTS, 'earshelf', 'plus', 'month')!,
  esPlusY: productIdFor(DEFAULT_CREEM_PRODUCTS, 'earshelf', 'plus', 'year')!,
  esProM: productIdFor(DEFAULT_CREEM_PRODUCTS, 'earshelf', 'pro', 'month')!,
  esProY: productIdFor(DEFAULT_CREEM_PRODUCTS, 'earshelf', 'pro', 'year')!,
  tapPlusM: productIdFor(DEFAULT_CREEM_PRODUCTS, 'tapestry', 'plus', 'month')!,
  tapProY: productIdFor(DEFAULT_CREEM_PRODUCTS, 'tapestry', 'pro', 'year')!,
};

const subEvent = (eventType: string, over: Record<string, unknown> = {}, id = `evt_${eventType}_${Math.random()}`) =>
  ({ id, eventType, created_at: 1, object: { id: 'sub_1', object: 'subscription', product: { id: P.esPlusM, object: 'product' }, customer: { id: 'cust_1' }, status: 'active', current_period_end_date: FUTURE, metadata: { user_id: USER, product: 'earshelf', plan: 'plus' }, ...over } });

function memoryStore(initial: { subs?: CreemSubscriptionRecord[]; source?: string | null } = {}) {
  const subs = new Map<string, CreemSubscriptionRecord>((initial.subs ?? []).map((s) => [s.providerSubscriptionId, s]));
  const seen = new Set<string>();
  const ents: Array<{ userId: string; product: string; e: EntitlementResult }> = [];
  let source = initial.source ?? null;
  const store: CreemStore = {
    hasProcessed: async (id) => seen.has(id),
    upsertSubscription: async (s) => { subs.set(s.providerSubscriptionId, s); },
    listSubscriptions: async (u) => [...subs.values()].filter((s) => s.userId === u),
    entitlementSource: async () => source,
    setEntitlement: async (userId, product, e) => { ents.push({ userId, product, e }); source = 'creem'; },
    record: async (id) => { seen.add(id); },
  };
  return { store, ents, subs };
}
const run = (evt: unknown, m = memoryStore(), secret = SECRET) => {
  const raw = JSON.stringify(evt);
  return handleCreemWebhook(raw, sign(raw, secret), { secret: SECRET, products: DEFAULT_CREEM_PRODUCTS }, m.store, NOW);
};

test('signature: only the exact body signed with the secret passes', () => {
  const body = '{"a":1}';
  assert.ok(verifyCreemSignature(body, sign(body), SECRET));
  assert.ok(verifyCreemSignature(body, sign(body).toUpperCase(), SECRET), 'hex case does not matter');
  assert.ok(!verifyCreemSignature('{"a":2}', sign(body), SECRET));
  assert.ok(!verifyCreemSignature(body, sign(body, 'other'), SECRET));
  assert.ok(!verifyCreemSignature(body, undefined, SECRET));
  assert.ok(!verifyCreemSignature(body, 'not-hex', SECRET));
  assert.ok(!verifyCreemSignature(body, sign(body), ''), 'no secret configured means nothing passes');
});

test('bad signature and malformed bodies are rejected and grant nothing', async () => {
  const m = memoryStore();
  const evt = subEvent('subscription.paid');
  assert.equal((await run(evt, m, 'wrong-secret')).status, 401);
  const junk = '[1,2]';
  assert.equal((await handleCreemWebhook(junk, sign(junk), { secret: SECRET, products: DEFAULT_CREEM_PRODUCTS }, m.store, NOW)).status, 400);
  assert.equal(m.ents.length, 0);
  assert.equal(m.subs.size, 0);
});

test('subscription.paid grants the plan from the PRODUCT, not from anything the buyer typed', async () => {
  const m = memoryStore();
  const r = await run(subEvent('subscription.paid', { product: { id: P.esProY }, metadata: { user_id: USER, product: 'earshelf', plan: 'plus' } }), m);
  assert.equal(r.status, 200);
  assert.equal(m.ents.length, 1);
  assert.equal(m.ents[0].e.plan, 'pro', 'metadata said plus but the paid product is Pro Annual');
  assert.equal(m.ents[0].product, 'earshelf');
  assert.equal(m.ents[0].e.active, true);
  assert.ok(m.ents[0].e.expiresAt! > FUTURE, 'a short grace is added after the period end');
});

test('a Tapestry product is never read as an Earshelf plan', async () => {
  const m = memoryStore();
  await run(subEvent('subscription.paid', { product: { id: P.tapPlusM }, metadata: { user_id: USER, product: 'earshelf' } }), m);
  assert.equal(m.ents[0].product, 'tapestry');
  assert.equal(m.ents[0].e.plan, 'plus');
});

test('checkout.completed grants from its nested subscription', async () => {
  const m = memoryStore();
  const evt = { id: 'evt_co', eventType: 'checkout.completed', object: { id: 'ch_1', object: 'checkout', product: { id: P.esPlusY }, customer: { id: 'cust_9', email: 'x@y.z' }, metadata: { user_id: USER }, subscription: { id: 'sub_9', status: 'active', current_period_end_date: FUTURE, product: P.esPlusY } } };
  assert.equal((await run(evt, m)).status, 200);
  assert.equal(m.ents[0].e.plan, 'plus');
  assert.equal(m.subs.get('sub_9')?.customerId, 'cust_9');
});

test('a one-time purchase (no subscription) grants nothing', async () => {
  const m = memoryStore();
  const r = await run({ id: 'evt_one', eventType: 'checkout.completed', object: { id: 'ch', product: { id: P.esPlusM }, metadata: { user_id: USER } } }, m);
  assert.equal(r.status === 200 && !!r.result.ignored, true);
  assert.equal(m.ents.length, 0);
});

test('missing, invalid or unknown things are ignored, never granted', () => {
  assert.ok(decideCreem(subEvent('subscription.paid', { metadata: {} }), DEFAULT_CREEM_PRODUCTS).ignored);
  assert.ok(decideCreem(subEvent('subscription.paid', { metadata: { user_id: "x'; drop table entitlements;--" } }), DEFAULT_CREEM_PRODUCTS).ignored, 'user id must be a uuid (it ends up in a database URL)');
  assert.ok(decideCreem(subEvent('subscription.paid', { product: { id: 'prod_unknown' } }), DEFAULT_CREEM_PRODUCTS).ignored);
  assert.ok(decideCreem({ id: 'e', eventType: 'credits.granted', object: {} }, DEFAULT_CREEM_PRODUCTS).ignored);
  assert.ok(decideCreem({ id: 'e', eventType: 'subscription.paid', object: {} }, DEFAULT_CREEM_PRODUCTS).ignored);
});

test('the same event twice is applied once', async () => {
  const m = memoryStore();
  const evt = subEvent('subscription.paid', {}, 'evt_same');
  await run(evt, m);
  const again = await run(evt, m);
  assert.equal(again.status === 200 && again.result.duplicate, true);
  assert.equal(m.ents.length, 1);
});

test('access rules per status', () => {
  const at = (status: string, periodEnd: string | null) => accessFor({ status, periodEnd }, NOW);
  assert.equal(at('active', FUTURE).active, true);
  assert.equal(at('trialing', FUTURE).active, true);
  assert.equal(at('scheduled_cancel', FUTURE).active, true, 'still paid up until the period ends');
  assert.equal(at('past_due', FUTURE).active, true);
  assert.equal(at('active', PAST).active, false, 'period ended long ago and nothing renewed it');
  assert.equal(at('active', '2026-11-20T12:00:00.000Z').active, true, 'one day late is inside the grace window');
  assert.equal(at('canceled', FUTURE).active, true, 'cancelled keeps access until the paid period ends');
  assert.equal(at('canceled', PAST).active, false);
  for (const s of ['expired', 'unpaid', 'paused', 'refunded', 'disputed', 'mystery']) assert.equal(at(s, FUTURE).active, false, s);
});

test('refund and dispute take access away at once', async () => {
  const m = memoryStore();
  await run(subEvent('subscription.paid'), m);
  assert.equal(m.ents.at(-1)!.e.active, true);
  const refund = { id: 'evt_ref', eventType: 'refund.created', object: { id: 'ref_1', status: 'succeeded', subscription: { id: 'sub_1', product: P.esPlusM, customer: 'cust_1', status: 'canceled', current_period_end_date: FUTURE, metadata: { user_id: USER } } } };
  await run(refund, m);
  assert.equal(m.ents.at(-1)!.e.active, false);
  assert.equal(m.ents.at(-1)!.e.plan, 'free');
  const m2 = memoryStore();
  await run(subEvent('subscription.paid'), m2);
  await run({ id: 'evt_dis', eventType: 'dispute.created', object: { id: 'd', subscription: { id: 'sub_1', product: P.esPlusM, metadata: { user_id: USER } } } }, m2);
  assert.equal(m2.ents.at(-1)!.e.active, false);
});

test('ORDER PROOF: cancelling the old Plus after buying Pro never removes Pro', async () => {
  const m = memoryStore();
  await run(subEvent('subscription.paid', { id: 'sub_plus', product: { id: P.esPlusM } }), m);
  await run(subEvent('subscription.paid', { id: 'sub_pro', product: { id: P.esProM } }), m);
  assert.equal(m.ents.at(-1)!.e.plan, 'pro');
  await run(subEvent('subscription.canceled', { id: 'sub_plus', product: { id: P.esPlusM }, status: 'canceled', current_period_end_date: PAST }), m);
  assert.equal(m.ents.at(-1)!.e.plan, 'pro');
  assert.equal(m.ents.at(-1)!.e.active, true);
});

test('cancelling the only subscription after its period ends goes back to free', async () => {
  const m = memoryStore();
  await run(subEvent('subscription.paid'), m);
  await run(subEvent('subscription.canceled', { status: 'canceled', current_period_end_date: PAST }), m);
  assert.deepEqual({ plan: m.ents.at(-1)!.e.plan, active: m.ents.at(-1)!.e.active }, { plan: 'free', active: false });
});

test('a plan the owner set by hand, or the old provider set, is not erased by an ended Creem subscription', async () => {
  for (const source of ['manual', 'lemonsqueezy']) {
    const m = memoryStore({ source });
    await run(subEvent('subscription.expired', { status: 'unpaid' }), m);
    assert.equal(m.ents.length, 0, source);
  }
  const live = memoryStore({ source: 'manual' });
  await run(subEvent('subscription.paid'), live);
  assert.equal(live.ents.length, 1, 'but a real paid Creem subscription does take over');
});

test('best plan is computed per app', () => {
  const subs: CreemSubscriptionRecord[] = [
    { providerSubscriptionId: 'a', userId: USER, productId: P.esPlusM, customerId: null, status: 'active', periodEnd: FUTURE },
    { providerSubscriptionId: 'b', userId: USER, productId: P.tapProY, customerId: null, status: 'active', periodEnd: FUTURE },
  ];
  assert.equal(bestEntitlement(subs, DEFAULT_CREEM_PRODUCTS, 'earshelf', NOW).plan, 'plus');
  assert.equal(bestEntitlement(subs, DEFAULT_CREEM_PRODUCTS, 'tapestry', NOW).plan, 'pro');
  assert.equal(bestEntitlement([], DEFAULT_CREEM_PRODUCTS, 'earshelf', NOW).active, false);
});

test('product ids can be replaced for test mode', () => {
  const map = creemProductMap({ CREEM_PRODUCT_EARSHELF_PLUS_MONTH: 'prod_TEST_plus_m' });
  assert.equal(productIdFor(map, 'earshelf', 'plus', 'month'), 'prod_TEST_plus_m');
  assert.equal(map[P.esPlusM], undefined, 'the live id for that slot is replaced, not kept beside it');
  assert.equal(productIdFor(map, 'earshelf', 'plus', 'year'), P.esPlusY, 'other slots keep their ids');
  assert.equal(Object.keys(map).length, 8);
});

test('checkout request: right URL, key header, and who is buying in the metadata', async () => {
  let seen: { url: string; init: RequestInit } | null = null;
  const fetchImpl = (async (url: string, init: RequestInit) => { seen = { url, init }; return new Response(JSON.stringify({ id: 'ch_1', checkout_url: 'https://checkout.creem.io/ch_1' }), { status: 200 }); }) as unknown as typeof fetch;
  const out = await createCreemCheckout({ apiKey: 'creem_key', testMode: true, productId: P.esProM, userId: USER, product: 'earshelf', plan: 'pro', email: 'a@b.c', successUrl: 'https://app.example/billing-done', fetchImpl });
  assert.equal(out.url, 'https://checkout.creem.io/ch_1');
  assert.equal(seen!.url, 'https://test-api.creem.io/v1/checkouts');
  const headers = seen!.init.headers as Record<string, string>;
  assert.equal(headers['x-api-key'], 'creem_key');
  const body = JSON.parse(String(seen!.init.body));
  assert.deepEqual(body.metadata, { user_id: USER, product: 'earshelf', plan: 'pro' });
  assert.equal(body.product_id, P.esProM);
  assert.equal(body.customer.email, 'a@b.c');
  await assert.rejects(createCreemCheckout({ apiKey: 'k', testMode: false, productId: 'p', userId: USER, product: 'earshelf', plan: 'plus', successUrl: 'https://x', fetchImpl: (async () => new Response('{}', { status: 400 })) as unknown as typeof fetch }), /could not start/);
});

test('portal link', async () => {
  const fetchImpl = (async (url: string) => { assert.equal(url, 'https://api.creem.io/v1/customers/billing'); return new Response(JSON.stringify({ customer_portal_link: 'https://creem.io/my-orders/login/abc' }), { status: 200 }); }) as unknown as typeof fetch;
  assert.equal(await createCreemPortalLink({ apiKey: 'k', testMode: false, customerId: 'cust_1', fetchImpl }), 'https://creem.io/my-orders/login/abc');
});

test('unrelated user is untouched', async () => {
  const m = memoryStore({ subs: [{ providerSubscriptionId: 'x', userId: OTHER, productId: P.esProM, customerId: null, status: 'active', periodEnd: FUTURE }] });
  await run(subEvent('subscription.paid'), m);
  assert.equal(m.ents.at(-1)!.userId, USER);
  assert.equal(m.ents.at(-1)!.e.plan, 'plus');
});
