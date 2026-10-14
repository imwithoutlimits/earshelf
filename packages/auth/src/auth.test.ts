import test from 'node:test';
import assert from 'node:assert/strict';
import { makeApi, ApiError } from './api.ts';
const session = (t: string | null) => ({ auth: { getSession: async () => ({ data: { session: t ? { access_token: t } : null } }) } });
const res = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('sends the bearer token and parses json', async () => {
  let seen: { url: string; init: RequestInit } | undefined;
  const api = makeApi({ supabase: session('tok'), apiUrl: 'https://api.test/', appName: 'tapestry', fetchImpl: (async (url: string, init: RequestInit) => { seen = { url, init }; return res(200, { ok: 1 }); }) as unknown as typeof fetch });
  assert.deepEqual(await api.apiPost('/v1/x', { a: 1 }), { ok: 1 });
  assert.equal(seen!.url, 'https://api.test/v1/x'); assert.equal((seen!.init.headers as Record<string, string>).Authorization, 'Bearer tok');
});
test('explains each failure in plain words and names the app', async () => {
  const none = makeApi({ supabase: null, apiUrl: '', appName: 'tapestry' });
  await assert.rejects(() => none.apiGet('/x'), (e: ApiError) => e.code === 'no_api' && /tapestry server/.test(e.message));
  const out = makeApi({ supabase: session(null), apiUrl: 'https://a', appName: 'x' });
  await assert.rejects(() => out.apiGet('/x'), (e: ApiError) => e.status === 401);
  const down = makeApi({ supabase: session('t'), apiUrl: 'https://a', appName: 'earshelf', fetchImpl: (async () => { throw new Error('offline'); }) as unknown as typeof fetch });
  await assert.rejects(() => down.apiGet('/x'), (e: ApiError) => e.code === 'network' && /earshelf server/.test(e.message));
});
test('reports server errors but not ordinary refusals', async () => {
  const seen: Array<[string, number]> = [];
  const mk = (s: number) => makeApi({ supabase: session('t'), apiUrl: 'https://a', appName: 'x', onServerError: (p, st) => seen.push([p, st]), fetchImpl: (async () => res(s, { error: 'e', message: 'm' })) as unknown as typeof fetch });
  await assert.rejects(() => mk(402).apiGet('/v1/q?x=1')); await assert.rejects(() => mk(502).apiGet('/v1/q?x=1'));
  assert.deepEqual(seen, [['/v1/q', 502]]);
});
