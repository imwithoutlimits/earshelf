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

test('missing AI and embedding settings are called out in plain words, and a configured server is quiet', () => {
  const off = setupReport(cfg({ ai: { provider: 'anthropic', key: '', model: 'm', base: '' }, embed: { base: '', key: '', model: 'm', dims: 384 } }));
  assert.ok(off.warnings.some((w) => /AI is switched off/.test(w)));
  assert.ok(off.warnings.some((w) => /Search by meaning is switched off/.test(w)));
  assert.deepEqual([off.settings.aiEnabled, off.settings.embeddingsEnabled], [false, false]);
  const on = setupReport(cfg({ ai: { provider: 'anthropic', key: 'k', model: 'm', base: '' }, embed: { base: '', key: 'k', model: 'm', dims: 384 } }));
  assert.ok(!on.warnings.some((w) => /AI is switched off|Search by meaning/.test(w)));
  const local = setupReport(cfg({ ai: { provider: 'openai-compatible', key: '', model: 'm', base: 'http://ollama:11434/v1' } }));
  assert.equal(local.settings.aiEnabled, true, 'a local Ollama needs no key');
});

test('kokoro probe: a proxy or wrong port that answers 404 is NOT counted as the voice service', async () => {
  const withHost = { ...config, tts: { ...config.tts, kokoroHostPort: 'kokoro:8880' } } as typeof config;
  const notKokoro = await probeKokoro(withHost, (async () => new Response('404 page not found', { status: 404 })) as unknown as typeof fetch);
  assert.equal(notKokoro.reachable, false);
  assert.match(notKokoro.detail, /HTTP 404.*not the Kokoro voice service/);
});

test('voice test: proves the voice really speaks, and says plainly when it does not', async () => {
  const { testKokoroVoice } = await import('./diagnostics.ts');
  const withHost = { ...config, tts: { ...config.tts, kokoroHostPort: 'kokoro:8880' } } as typeof config;
  const audio = (async () => new Response(new Uint8Array(48000), { status: 200 })) as unknown as typeof fetch;
  assert.equal((await testKokoroVoice(withHost, audio)).ok, true);
  assert.match((await testKokoroVoice(withHost, (async () => new Response('x', { status: 500 })) as unknown as typeof fetch)).detail, /HTTP 500/);
  assert.match((await testKokoroVoice(withHost, (async () => new Response(new Uint8Array(10), { status: 200 })) as unknown as typeof fetch)).detail, /only 10 bytes/);
  assert.match((await testKokoroVoice(withHost, (async () => { throw new Error('getaddrinfo ENOTFOUND kokoro'); }) as unknown as typeof fetch)).detail, /ENOTFOUND/);
  assert.equal((await testKokoroVoice({ ...config, tts: { ...config.tts, kokoroHostPort: '' } } as typeof config)).ok, false);
});
