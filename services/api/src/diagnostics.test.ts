import test from 'node:test';
import assert from 'node:assert/strict';
import { probeKokoro, setupReport } from './diagnostics.ts';
import { config } from './config.ts';

const cfg = (over: Record<string, unknown> = {}) => ({ ...config, supabaseUrl: 'https://abc.supabase.co', anonKey: 'a', serviceKey: 'b', allowedOrigins: ['https://x.netlify.app'], ...over }) as typeof config;

test('setup report names what is missing, and never leaks a value', () => {
  const ok = setupReport(cfg());
  assert.deepEqual(ok.problems, []);
  const empty = setupReport(cfg({ supabaseUrl: '', anonKey: '', serviceKey: '', allowedOrigins: [] }));
  assert.equal(empty.problems.length, 4);
  const text = JSON.stringify(setupReport(cfg({ serviceKey: 'sb_secret_SHOULD_NOT_APPEAR' })));
  assert.ok(!text.includes('SHOULD_NOT_APPEAR'));
  assert.ok(!text.includes('abc.supabase.co'));
});

test('a trailing slash in an allowed origin is flagged', () => {
  assert.ok(setupReport(cfg({ allowedOrigins: ['https://x.netlify.app/'] })).warnings.some((w) => /slash/.test(w)));
});

test('kokoro probe: not configured, reachable, unreachable', async () => {
  const none = await probeKokoro({ ...config, tts: { ...config.tts, kokoroHostPort: '' } } as typeof config);
  assert.equal(none.configured, false);
  const withHost = { ...config, tts: { ...config.tts, kokoroHostPort: 'kokoro:8880' } } as typeof config;
  const up = await probeKokoro(withHost, (async () => new Response('[]', { status: 200 })) as unknown as typeof fetch);
  assert.deepEqual({ c: up.configured, r: up.reachable }, { c: true, r: true });
  const down = await probeKokoro(withHost, (async () => { throw new Error('getaddrinfo ENOTFOUND kokoro'); }) as unknown as typeof fetch);
  assert.deepEqual({ c: down.configured, r: down.reachable }, { c: true, r: false });
});
