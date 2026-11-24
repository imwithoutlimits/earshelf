import { config } from './config.ts';

/** Which settings are filled in, as yes/no only. Never returns a key, a secret or an address, so it is safe to show in a browser. */
export interface SetupReport {
  problems: string[];
  warnings: string[];
  settings: Record<string, boolean | number | string>;
}

type Cfg = typeof config;

export function setupReport(c: Cfg = config): SetupReport {
  const problems: string[] = [];
  const warnings: string[] = [];
  if (!c.supabaseUrl) problems.push('SUPABASE_URL is empty: nobody can sign in or load data.');
  else if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(c.supabaseUrl) && !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(c.supabaseUrl)) warnings.push('SUPABASE_URL does not look like https://YOURPROJECT.supabase.co (no slash at the end).');
  if (!c.anonKey) problems.push('SUPABASE_PUBLISHABLE_KEY is empty: sign-in checks will fail.');
  if (!c.serviceKey) problems.push('SUPABASE_SECRET_KEY is empty: the server cannot read plans or save audio.');
  if (c.allowedOrigins.length === 0) problems.push('ALLOWED_ORIGINS is empty: the websites will be blocked by the browser. Put your Netlify addresses there.');
  if (c.allowedOrigins.some((o) => o.endsWith('/'))) warnings.push('ALLOWED_ORIGINS has an address that ends with a slash. Remove the slash.');
  if (!c.tts.kokoroHostPort) warnings.push('TTS_KOKORO_HOSTPORT is empty: the free Kokoro voice is switched off.');
  const aiOn = c.ai.provider === 'anthropic' ? !!c.ai.key : !!(c.ai.key || c.ai.base);
  const embedOn = !!(c.embed.key || c.embed.base);
  if (!aiOn) warnings.push('AI is switched off: set AI_API_KEY (Anthropic or OpenAI), or run the bundled Ollama service and set OLLAMA_BASE_URL=http://ollama:11434/v1. Summaries, quizzes, Ask your library, Tapestry recommendations and study guide questions will not work.');
  if (!embedOn) warnings.push('Search by meaning is switched off: set EMBED_API_KEY, or run the bundled Ollama service and set OLLAMA_BASE_URL. Meaning search and Ask your library will not work.');
  if (!c.creem.apiKey) warnings.push('CREEM_API_KEY is empty: the Upgrade buttons cannot open a payment page.');
  if (!c.creem.webhookSecret) warnings.push('CREEM_WEBHOOK_SECRET is empty: payments cannot unlock plans (the webhook will be refused).');
  return {
    problems,
    warnings,
    settings: {
      supabaseUrl: !!c.supabaseUrl,
      publishableKey: !!c.anonKey,
      secretKey: !!c.serviceKey,
      allowedOrigins: c.allowedOrigins.length,
      kokoroConfigured: !!c.tts.kokoroHostPort,
      creemApiKey: !!c.creem.apiKey,
      creemWebhookSecret: !!c.creem.webhookSecret,
      creemMode: c.creem.testMode ? 'test' : 'live',
      aiKey: !!c.ai.key,
      aiEnabled: aiOn,
      embeddingsEnabled: embedOn,
    },
  };
}

/** Is the Kokoro voice container answering the way Kokoro does? A proxy or a wrong port that answers 404 or 502 is NOT the voice service, so only a 2xx answer counts. */
export async function probeKokoro(c: Cfg = config, fetchImpl: typeof fetch = fetch, timeoutMs = 2500): Promise<{ configured: boolean; reachable: boolean; detail: string }> {
  if (!c.tts.kokoroHostPort) return { configured: false, reachable: false, detail: 'TTS_KOKORO_HOSTPORT is not set' };
  try {
    const res = await fetchImpl(`http://${c.tts.kokoroHostPort}/v1/audio/voices`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return { configured: true, reachable: false, detail: `something answered with HTTP ${res.status}, but it is not the Kokoro voice service: check that TTS_KOKORO_HOSTPORT points at the kokoro container (usually kokoro:8880)` };
    return { configured: true, reachable: true, detail: `answered with HTTP ${res.status}` };
  } catch (e) {
    const why = e instanceof Error ? (e.name === 'TimeoutError' ? 'no answer within a few seconds (still starting, or out of memory)' : e.message) : 'unknown error';
    return { configured: true, reachable: false, detail: why };
  }
}

/**
 * Makes one short sentence with the voice, the way the app does, so "open" can be told apart from "actually speaks".
 * Slow on purpose to call (it uses the voice for a second or two), so /status only runs it when asked with ?voice=1.
 */
export async function testKokoroVoice(c: Cfg = config, fetchImpl: typeof fetch = fetch, timeoutMs = 60_000): Promise<{ ok: boolean; ms: number; detail: string }> {
  const t0 = Date.now();
  if (!c.tts.kokoroHostPort) return { ok: false, ms: 0, detail: 'TTS_KOKORO_HOSTPORT is not set' };
  try {
    const res = await fetchImpl(`http://${c.tts.kokoroHostPort}/v1/audio/speech`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({ model: 'kokoro', input: 'Your natural voice is ready.', voice: 'af_heart', response_format: 'pcm' }),
    });
    const bytes = (await res.arrayBuffer()).byteLength;
    const ms = Date.now() - t0;
    if (!res.ok) return { ok: false, ms, detail: `the voice service answered HTTP ${res.status} when asked to speak` };
    if (bytes < 2000) return { ok: false, ms, detail: `the voice service answered, but sent only ${bytes} bytes of audio` };
    return { ok: true, ms, detail: `spoke a sentence in ${(ms / 1000).toFixed(1)} s (${Math.round(bytes / 1024)} KB of audio)` };
  } catch (e) {
    const why = e instanceof Error ? (e.name === 'TimeoutError' ? 'no audio within a minute (still loading its model, or out of memory)' : e.message) : 'unknown error';
    return { ok: false, ms: Date.now() - t0, detail: why };
  }
}

export function logStartupReport(r: SetupReport = setupReport()) {
  for (const p of r.problems) console.error(`SETUP PROBLEM: ${p}`);
  for (const w of r.warnings) console.warn(`setup note: ${w}`);
  if (!r.problems.length) console.log('setup check: the required settings are filled in.');
}
