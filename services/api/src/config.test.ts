import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { hostPort } from './config.ts';

/** config.ts reads the environment once at start, so each case runs in its own process with exactly the settings given. */
function cfg(env: Record<string, string>) {
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '-e', "import('./src/config.ts').then(({config:c})=>console.log(JSON.stringify({ai:c.ai,embed:{base:c.embed.base,key:c.embed.key,model:c.embed.model},kokoro:c.tts.kokoroHostPort})))"],
    { cwd: new URL('..', import.meta.url).pathname, env: { PATH: process.env.PATH ?? '', ...env }, encoding: 'utf8' });
  return JSON.parse(r.stdout.trim().split('\n').pop() ?? '{}') as { ai: { provider: string; key: string; model: string; base: string }; embed: { base: string; key: string; model: string }; kokoro: string };
}

test('the Kokoro address is accepted in any common spelling', () => {
  for (const s of ['kokoro:8880', 'http://kokoro:8880', 'http://kokoro:8880/', 'https://kokoro:8880/v1', ' kokoro:8880/v1/ ']) assert.equal(hostPort(s), 'kokoro:8880', s);
  assert.equal(hostPort(''), '');
});

test('with only the bundled Ollama running, AI and search by meaning switch on with no key', () => {
  const c = cfg({ OLLAMA_BASE_URL: 'http://ollama:11434/v1' });
  assert.deepEqual({ p: c.ai.provider, b: c.ai.base, m: c.ai.model, k: c.ai.key }, { p: 'openai-compatible', b: 'http://ollama:11434/v1', m: 'qwen2.5:3b', k: '' });
  assert.deepEqual({ b: c.embed.base, m: c.embed.model }, { b: 'http://ollama:11434/v1', m: 'all-minilm' });
});

test('setting an AI address alone is enough (no AI_PROVIDER needed)', () => {
  const c = cfg({ AI_BASE_URL: 'http://ollama:11434/v1', AI_MODEL: 'llama3.2' });
  assert.deepEqual({ p: c.ai.provider, m: c.ai.model }, { p: 'openai-compatible', m: 'llama3.2' });
});

test('a key you set always wins over the bundled Ollama, so nobody with an Anthropic key sees a change', () => {
  const c = cfg({ OLLAMA_BASE_URL: 'http://ollama:11434/v1', AI_API_KEY: 'sk-ant-x', EMBED_API_KEY: 'sk-x' });
  assert.deepEqual({ p: c.ai.provider, b: c.ai.base, m: c.ai.model }, { p: 'anthropic', b: '', m: 'claude-haiku-4-5-20251001' });
  assert.deepEqual({ b: c.embed.base, m: c.embed.model }, { b: '', m: 'text-embedding-3-small' });
});

test('with nothing set, nothing changes: Anthropic is the provider and it is off without a key', () => {
  const c = cfg({});
  assert.deepEqual({ p: c.ai.provider, b: c.ai.base, k: c.ai.key, e: c.embed.base }, { p: 'anthropic', b: '', k: '', e: '' });
});
