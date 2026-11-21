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
    },
  };
}

/** Is the Kokoro voice container answering? Any HTTP answer counts as "up"; it only has to be reachable from this server. */
export async function probeKokoro(c: Cfg = config, fetchImpl: typeof fetch = fetch, timeoutMs = 2500): Promise<{ configured: boolean; reachable: boolean; detail: string }> {
  if (!c.tts.kokoroHostPort) return { configured: false, reachable: false, detail: 'TTS_KOKORO_HOSTPORT is not set' };
  try {
    const res = await fetchImpl(`http://${c.tts.kokoroHostPort}/v1/audio/voices`, { signal: AbortSignal.timeout(timeoutMs) });
    return { configured: true, reachable: true, detail: `answered with HTTP ${res.status}` };
  } catch (e) {
    const why = e instanceof Error ? (e.name === 'TimeoutError' ? 'no answer within a few seconds (still starting, or out of memory)' : e.message) : 'unknown error';
    return { configured: true, reachable: false, detail: why };
  }
}

export function logStartupReport(r: SetupReport = setupReport()) {
  for (const p of r.problems) console.error(`SETUP PROBLEM: ${p}`);
  for (const w of r.warnings) console.warn(`setup note: ${w}`);
  if (!r.problems.length) console.log('setup check: the required settings are filled in.');
}
