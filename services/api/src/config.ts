import { creemProductMap } from '../../../packages/billing/src/creem.ts';

const e = (k: string, d = ''): string => process.env[k] ?? d;
const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
/** "kokoro:8880" is what is wanted, but people paste "http://kokoro:8880/" or ".../v1". All of those mean the same server. */
export const hostPort = (s: string): string => s.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '').replace(/\/v1$/i, '');

// The free AI that ships with the server (the "ollama" service in deploy/docker-compose.yml). It is used only when nothing else is chosen:
// a key or address you set yourself always wins, so nobody with an Anthropic or OpenAI key sees any change.
const ollama = e('OLLAMA_BASE_URL').replace(/\/$/, '');
const aiKey = e('AI_API_KEY'), aiBase = e('AI_BASE_URL').replace(/\/$/, '');
const aiProvider = e('AI_PROVIDER') || (aiBase ? 'openai-compatible' : aiKey ? 'anthropic' : ollama ? 'openai-compatible' : 'anthropic');
const aiOllama = aiProvider === 'openai-compatible' && !aiKey && !aiBase && !!ollama;
const embedOllama = !e('EMBED_API_KEY') && !e('EMBED_BASE_URL') && !!ollama;

export const config = {
  port: Number(e('PORT', '10000')),
  /** Optional: the public address of this API, if it cannot be worked out from the request. Used in podcast feed links. */
  publicApiUrl: e('PUBLIC_API_URL'),
  supabaseUrl: e('SUPABASE_URL').replace(/\/$/, ''),
  // New projects have sb_publishable_ / sb_secret_ keys. The older anon / service_role names are still accepted.
  anonKey: e('SUPABASE_PUBLISHABLE_KEY') || e('SUPABASE_ANON_KEY'),
  serviceKey: e('SUPABASE_SECRET_KEY') || e('SUPABASE_SERVICE_ROLE_KEY'),
  allowedOrigins: list(e('ALLOWED_ORIGINS')),
  ls: { secret: e('LEMON_SQUEEZY_SIGNING_SECRET'), plus: e('LS_VARIANT_EARSHELF_PLUS'), pro: e('LS_VARIANT_EARSHELF_PRO'), tapestryPlus: e('LS_VARIANT_TAPESTRY_PLUS'), tapestryPro: e('LS_VARIANT_TAPESTRY_PRO') },
  // Creem is the payment provider. Lemon Squeezy above is kept only so an old webhook does not break; new sales go through Creem.
  creem: { apiKey: e('CREEM_API_KEY'), webhookSecret: e('CREEM_WEBHOOK_SECRET'), testMode: e('CREEM_TEST_MODE') === 'true', products: creemProductMap(process.env) },
  tapestry: { translationId: e('TAPESTRY_TRANSLATION_ID', 'engwebp'), adminUserIds: new Set(list(e('TAPESTRY_ADMIN_USER_IDS'))) },
  sentryDsn: e('SENTRY_DSN'),
  embed: { base: e('EMBED_BASE_URL').replace(/\/$/, '') || (embedOllama ? ollama : ''), key: e('EMBED_API_KEY'), model: e('EMBED_MODEL') || (embedOllama ? 'all-minilm' : 'text-embedding-3-small'), dims: 384 },
  tts: {
    sampleRate: 24000,
    kokoroHostPort: hostPort(e('TTS_KOKORO_HOSTPORT')),
    eleven: { key: e('ELEVENLABS_API_KEY'), base: 'https://api.elevenlabs.io', model: e('ELEVENLABS_MODEL', 'eleven_multilingual_v2'), voiceIds: list(e('ELEVENLABS_VOICE_IDS')), concurrency: Number(e('ELEVENLABS_CONCURRENCY', '2')), stability: 0.5 },
    renderSlots: Number(e('TTS_RENDER_SLOTS', '2')),
    openaiBase: e('TTS_OPENAI_BASE_URL').replace(/\/$/, ''),
    openaiKey: e('TTS_OPENAI_API_KEY'),
    openaiModel: e('TTS_OPENAI_MODEL', 'kokoro'),
    openaiFormat: e('TTS_OPENAI_FORMAT', 'pcm') as 'pcm' | 'mp3' | 'wav',
    openaiVoices: list(e('TTS_OPENAI_VOICES', 'af_heart,af_bella,af_nicole,am_michael,am_fenrir,bf_emma,bm_george')),
    edgeEnabled: e('EDGE_TTS_ENABLED') === 'true',
    edgeUsers: new Set(list(e('EDGE_TTS_ALLOWED_USER_IDS'))),
  },
  ai: { provider: aiProvider, key: aiKey, model: e('AI_MODEL') || (aiOllama ? 'qwen2.5:3b' : 'claude-haiku-4-5-20251001'), base: aiBase || (aiOllama ? ollama : '') },
};
