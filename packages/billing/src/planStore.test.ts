import test from 'node:test';
import assert from 'node:assert/strict';
import { makePlanStore, type KeyValue, type SupabaseLike } from './planStore.ts';
import { priceLabel, yearlySaving, PITCH, SELLABLE } from './pitch.ts';

const memory = (): KeyValue & { data: Map<string, string> } => { const data = new Map<string, string>(); return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); }, removeItem: (k) => { data.delete(k); } }; };

function fakeSupabase(o: { uid?: string | null; ent?: unknown; trial?: unknown; entError?: boolean; trialError?: boolean; rpcThrows?: boolean }) {
  const calls: string[] = [];
  const reply = (data: unknown, error: boolean) => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: error ? null : data, error: error ? { message: 'x' } : null }) }) }) }) });
  const sb: SupabaseLike = {
    auth: { getSession: async () => ({ data: { session: o.uid ? { user: { id: o.uid } } : null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    from: (t: string) => { calls.push(`from:${t}`); return t === 'entitlements' ? reply(o.ent ?? null, !!o.entError) : reply(o.trial ?? null, !!o.trialError); },
    rpc: async (fn: string, args?: Record<string, unknown>) => { calls.push(`rpc:${fn}:${JSON.stringify(args)}`); if (o.rpcThrows) throw new Error('no function'); return { data: null }; },
  };
  return { sb, calls };
}
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

test('signed out: free, no trial, nothing asked of the database', async () => {
  const { sb, calls } = fakeSupabase({ uid: null });
  const s = makePlanStore({ supabase: sb, product: 'earshelf', storage: memory() });
  await s.refresh();
  assert.equal(s.get().plan, 'free');
  assert.equal(s.get().trial.status, 'none');
  assert.deepEqual(calls, []);
});

test('signed in: starts the trial for the right app, then reads plan rows', async () => {
  const { sb, calls } = fakeSupabase({ uid: 'u1', trial: { plan: 'pro', started_at: inDays(-1), ends_at: inDays(6) } });
  const s = makePlanStore({ supabase: sb, product: 'tapestry', storage: memory() });
  let seen = 0; s.subscribe(() => { seen++; });
  await s.refresh();
  assert.equal(calls[0], 'rpc:start_trial:{"p_product":"tapestry"}');
  assert.equal(s.get().plan, 'pro');
  assert.equal(s.get().source, 'trial');
  assert.equal(s.get().trial.daysLeft, 6);
  assert.equal(s.uid(), 'u1');
  assert.ok(seen >= 1);
});

test('before migration 0006 is run: the missing function and table are survived, plan still works', async () => {
  const { sb } = fakeSupabase({ uid: 'u1', rpcThrows: true, trialError: true, ent: { plan: 'plus', active: true, expires_at: inDays(20) } });
  const s = makePlanStore({ supabase: sb, product: 'earshelf', storage: memory() });
  await s.refresh();
  assert.deepEqual({ plan: s.get().plan, source: s.get().source }, { plan: 'plus', source: 'paid' });
});

test('a saved copy is used at once next time, and a failed read does not wipe it (offline)', async () => {
  const store = memory();
  const a = fakeSupabase({ uid: 'u1', ent: { plan: 'pro', active: true, expires_at: inDays(30) } });
  await makePlanStore({ supabase: a.sb, product: 'earshelf', storage: store }).refresh();
  const offline = fakeSupabase({ uid: 'u1', entError: true, trialError: true });
  const s2 = makePlanStore({ supabase: offline.sb, product: 'earshelf', storage: store });
  assert.equal(s2.get().plan, 'pro', 'known before any network call');
  await s2.refresh();
  assert.equal(s2.get().plan, 'pro', 'a failed read keeps the last good answer');
});

test('another person signing in on the same device never inherits the last person\'s plan', async () => {
  const store = memory();
  await makePlanStore({ supabase: fakeSupabase({ uid: 'u1', ent: { plan: 'pro', active: true, expires_at: null } }).sb, product: 'earshelf', storage: store }).refresh();
  const s = makePlanStore({ supabase: fakeSupabase({ uid: 'u2', entError: true, trialError: true }).sb, product: 'earshelf', storage: store });
  await s.refresh();
  assert.equal(s.get().plan, 'free');
});

test('signing out clears the saved plan', async () => {
  const store = memory();
  await makePlanStore({ supabase: fakeSupabase({ uid: 'u1', ent: { plan: 'pro', active: true, expires_at: null } }).sb, product: 'earshelf', storage: store }).refresh();
  assert.ok(store.data.get('wells:plan:earshelf'));
  const s = makePlanStore({ supabase: fakeSupabase({ uid: null }).sb, product: 'earshelf', storage: store });
  await s.refresh();
  assert.equal(s.get().plan, 'free');
  assert.equal(store.data.has('wells:plan:earshelf'), false);
});

test('waitForPaid returns true once the webhook has unlocked the plan, false if it never does', async () => {
  let paid = false;
  const sb: SupabaseLike = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    from: (t: string) => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: t === 'entitlements' && paid ? { plan: 'plus', active: true, expires_at: null } : null, error: null }) }) }) }) }),
    rpc: async () => ({ data: null }),
  };
  const s = makePlanStore({ supabase: sb, product: 'earshelf', storage: memory() });
  setTimeout(() => { paid = true; }, 30);
  assert.equal(await s.waitForPaid({ everyMs: 10, maxMs: 500 }), true);
  const never = makePlanStore({ supabase: { ...sb, from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }) }, product: 'earshelf', storage: memory() });
  assert.equal(await never.waitForPaid({ everyMs: 10, maxMs: 60 }), false);
});

test('no Supabase (device only): free, and refresh is a no-op', async () => {
  const s = makePlanStore({ supabase: null, product: 'earshelf', storage: memory() });
  await s.refresh();
  assert.equal(s.get().plan, 'free');
});

test('prices and the yearly saving come from the real price list', () => {
  assert.equal(priceLabel('plus', 'month'), '$9.99/mo');
  assert.equal(priceLabel('plus', 'year'), '$89/yr');
  assert.equal(priceLabel('pro', 'year'), '$169/yr');
  assert.equal(yearlySaving('plus'), 26);
  assert.equal(yearlySaving('pro'), 30);
});

test('every plan has copy for both apps, and promised-but-unbuilt items are marked', () => {
  for (const app of ['earshelf', 'tapestry'] as const) for (const plan of ['free', 'plus', 'pro'] as const) assert.ok(PITCH[app][plan].lines.length >= 3, `${app} ${plan}`);
  assert.ok(PITCH.tapestry.pro.lines.some((l) => l.soon));
});

test('a plan with no real features behind it is not on sale', () => {
  assert.deepEqual([...SELLABLE.earshelf], ['plus', 'pro']);
  assert.deepEqual([...SELLABLE.tapestry], ['plus'], 'Tapestry Pro is made only of unbuilt features, so it stays off sale');
  // Anything marked ready (not "soon") in a sellable plan must be a real line, and every sellable paid plan needs at least two ready features.
  for (const app of ['earshelf', 'tapestry'] as const) for (const plan of SELLABLE[app]) {
    assert.ok(PITCH[app][plan].lines.filter((l) => !l.soon && !/^Everything in/.test(l.text)).length >= 2, `${app} ${plan} needs real features`);
  }
});
