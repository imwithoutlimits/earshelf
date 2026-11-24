import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { sanitizeOverrides } from '../../../packages/core/src/index.ts';
import type { NarrationOverrides, PronunciationEntry, ReadingMode } from '../../../packages/core/src/index.ts';
import { hasFeature, type Feature, type Plan } from '../../../packages/billing/src/plans.ts';
import { config } from './config.ts';
import { deleteUserContent, getUser, rest } from './supa.ts';
import { HttpError, consume, getPlan, getPlanInfo, requireFeature } from './entitlements.ts';
import { createCheckout, openPortal, processCreemWebhook, processWebhook } from './billing.ts';
import { fetchArticle } from './article.ts';
import { engineFor, enginesFor } from './tts/engines.ts';
import { generateChunk, loadDocument } from './tts/generate.ts';
import { pcmToMp3 } from './tts/ffmpeg.ts';
import { getAiProvider } from './ai/provider.ts';
import { ask, flashcards, isSummaryKind, quiz, summarize, PROMPT_VERSION } from './ai/tasks.ts';
import { explain } from './ai/explain.ts';
import { indexDocument, makeEmbedder, realSearchRpc, replaceChunks, semanticPassages, semanticSearch } from './semantic.ts';
import { askLibrary } from './ai/library.ts';
import { MAX_BYTES, MAX_EPISODES, KEEP_DAYS, TOKEN_RE, addEpisode, buildFeedXml, ensureFeed, episodeUrl, feedUrl, newToken, publicBase, startPodcastSweeper, supaPodcastStore } from './podcast.ts';
import { signedUrl } from './supa.ts';
import { addComment, addItem, createVault, deleteVault, displayNameFor, joinVault, leaveVault, listVaults, removeItem, removeMember, rotateCode, showCode, supaVaultStore, vaultDetail, type VaultProduct } from './vaults.ts';
import { jobStatus, startExport } from './exportJob.ts';
import { report } from './monitor.ts';
import { logStartupReport, probeKokoro, setupReport, testKokoroVoice } from './diagnostics.ts';
import { tapestryRoutes } from './tapestry/routes.ts';
import { earshelfActivityRoutes } from './earshelf/activity.ts';
import { earshelfPushRoutes, startPushScheduler } from './earshelf/push.ts';

type Json = Record<string, unknown>;
interface Ctx { user: { id: string; email?: string }; body: Json; query: URLSearchParams; origin: string; base: string; plan: () => Promise<Plan> }
interface Route { auth: boolean; run: (c: Ctx) => Promise<unknown> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODES: ReadingMode[] = ['clean', 'complete', 'audiobook', 'study', 'accessibility'];
const bad = (m: string) => new HttpError(400, 'bad_request', m);

const hits = new Map<string, number[]>();
function limit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) throw new HttpError(429, 'rate_limited', 'Too many requests. Wait a moment and try again.');
  arr.push(now);
  hits.set(key, arr);
}

const docId = (b: Json) => { if (typeof b.documentId !== 'string' || !UUID.test(b.documentId)) throw bad('Missing or invalid documentId.'); return b.documentId; };
const prons = (b: Json): PronunciationEntry[] => (Array.isArray(b.pronunciations) ? (b.pronunciations as Json[]).filter((p) => typeof p.term === 'string' && typeof p.say === 'string').slice(0, 500).map((p) => ({ term: p.term as string, say: p.say as string })) : []);

/** Reads the person's narration choices. A second voice for dialogue is a Plus feature. */
function narrationFrom(body: Json, plan: Plan): { overrides: NarrationOverrides; dialogueVoice?: string } {
  const overrides = sanitizeOverrides(body.narration);
  const dv = typeof body.dialogueVoice === 'string' ? body.dialogueVoice.trim() : '';
  if (!dv) return { overrides: { ...overrides, dialogue: false } };
  if (!/^[\w.\-: ]{1,100}$/.test(dv)) throw bad('That dialogue voice is not valid.');
  requireFeature(plan, 'multi_speaker');
  return { overrides: { ...overrides, dialogue: true }, dialogueVoice: dv };
}

async function aiRun<T>(c: Ctx, feature: Feature, kind: string, fn: (ai: NonNullable<ReturnType<typeof getAiProvider>>, doc: Awaited<ReturnType<typeof loadDocument>>) => Promise<T>): Promise<T> {
  const ai = getAiProvider();
  if (!ai) throw new HttpError(503, 'ai_unavailable', 'AI features are not switched on for this server.');
  const plan = await c.plan();
  requireFeature(plan, feature);
  limit(`ai:${c.user.id}`, 60, 3600_000);
  await consume(c.user.id, plan, 'ai_requests', 1);
  const doc = await loadDocument(c.user.id, docId(c.body));
  try {
    const out = await fn(ai, doc);
    void rest('ai_generations', { method: 'POST', prefer: 'return=minimal', body: { user_id: c.user.id, product: 'earshelf', kind, provider: ai.id, model: ai.model, prompt_version: PROMPT_VERSION, input_ref: { documentId: c.body.documentId }, output: out } }).catch(() => {});
    return out;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(502, 'ai_failed', e instanceof Error ? e.message : 'The AI request failed.');
  }
}

const vaultProduct = (v: unknown): VaultProduct => (v === 'tapestry' ? 'tapestry' : 'earshelf');

/** What the Podcast feed screen shows: the address, the episodes and how much room is left. */
async function podcastState(userId: string, base: string) {
  const token = await supaPodcastStore.getToken(userId);
  const episodes = token ? await supaPodcastStore.list(userId) : [];
  return {
    feedUrl: token ? feedUrl(base, token) : null,
    episodes: episodes.map((e) => ({ id: e.id, title: e.title, author: e.author, ext: e.ext, bytes: e.bytes, durationMs: e.durationMs, publishedAt: e.publishedAt, expiresAt: e.expiresAt, url: token ? episodeUrl(base, token, e) : null })),
    usage: { count: episodes.length, bytes: episodes.reduce((n, e) => n + e.bytes, 0), maxCount: MAX_EPISODES, maxBytes: MAX_BYTES, keepDays: KEEP_DAYS },
  };
}

const routes: Record<string, Route> = {
  'GET /health': { auth: false, run: async () => ({ ok: true }) },
  // Open this in a browser when something is wrong: it says which settings are missing and whether the voice engine answers. Yes/no only, no secrets.
  // Add ?voice=1 to also make the voice speak one short sentence, which proves natural voices really work (not just that the container answers).
  'GET /status': { auth: false, run: async (c) => {
    const r = setupReport();
    let voiceTest: Awaited<ReturnType<typeof testKokoroVoice>> | undefined;
    if (c.query.get('voice')) { limit('status-voice', 6, 60_000); voiceTest = await testKokoroVoice(); }
    return { ok: r.problems.length === 0, problems: r.problems, warnings: r.warnings, settings: r.settings, kokoro: await probeKokoro(), ...(voiceTest ? { voiceTest } : {}), time: new Date().toISOString() };
  } },

  'GET /v1/capabilities': { auth: true, run: async (c) => ({
    plan: await c.plan(),
    engines: enginesFor(c.user.id).map((e) => ({ id: e.id, label: e.label, commercialUseAllowed: e.commercialUseAllowed })),
    ai: !!getAiProvider(),
    embeddings: !!makeEmbedder(),
  }) },

  // Plan, trial and billing. The apps ask this first; it also starts the person's one 7-day trial if they have not had it yet.
  'GET /v1/plan': { auth: true, run: async (c) => {
    const product = c.query.get('product') === 'tapestry' ? 'tapestry' : 'earshelf';
    return { product, ...(await getPlanInfo(c.user.id, product, { startTrial: true })) };
  } },
  'POST /v1/billing/checkout': { auth: true, run: async (c) => {
    limit(`checkout:${c.user.id}`, 20, 3600_000);
    return createCheckout({ userId: c.user.id, email: c.user.email, body: c.body, origin: c.origin });
  } },
  'POST /v1/billing/portal': { auth: true, run: async (c) => {
    limit(`portal:${c.user.id}`, 20, 3600_000);
    return openPortal({ userId: c.user.id, body: c.body });
  } },

  'POST /v1/account/delete-content': { auth: true, run: async (c) => { await deleteUserContent(c.user.id, 'earshelf'); return { ok: true }; } },

  'GET /v1/article': { auth: true, run: async (c) => {
    limit(`article:${c.user.id}`, 40, 3600_000);
    try { return await fetchArticle(c.query.get('url') ?? ''); }
    catch (e) { throw new HttpError(422, 'article_failed', e instanceof Error ? e.message : 'We could not import that page.'); }
  } },

  'GET /v1/voices': { auth: true, run: async (c) => {
    const e = engineFor(c.query.get('provider') ?? '', c.user.id);
    if (!e) throw new HttpError(404, 'no_such_provider', 'That voice provider is not available.');
    return e.listVoices();
  } },

  'POST /v1/preview': { auth: true, run: async (c) => {
    limit(`preview:${c.user.id}`, 30, 3600_000);
    const e = engineFor(String(c.body.provider ?? ''), c.user.id);
    if (!e) throw new HttpError(404, 'no_such_provider', 'That voice provider is not available.');
    const text = String(c.body.text ?? 'This is how your documents will sound when they are read to you.').slice(0, 300);
    const pcm = await e.synthesize(text, String(c.body.voice ?? ''));
    return { __binary: await pcmToMp3(pcm.samples, pcm.sampleRate), type: 'audio/mpeg' };
  } },

  'POST /v1/chunks': { auth: true, run: async (c) => {
    const plan = await c.plan();
    const e = engineFor(String(c.body.provider ?? ''), c.user.id);
    if (!e) throw new HttpError(404, 'no_such_provider', 'That voice provider is not available.');
    // Free plan: a daily preview of the free Kokoro voice only. Plus and Pro have the full natural voices.
    const preview = !hasFeature(plan, 'natural_tts');
    if (preview && e.id !== 'kokoro') throw new HttpError(402, 'upgrade_required', 'This voice needs the plus plan. The free preview uses the Kokoro voice.');
    const mode = c.body.mode as ReadingMode;
    const idx = Number(c.body.chunkIndex), scale = Number(c.body.pauseScale ?? 1), updated = Number(c.body.updatedAt);
    if (!MODES.includes(mode) || !Number.isInteger(idx) || idx < 0 || !(scale >= 0.5 && scale <= 2) || !Number.isFinite(updated) || typeof c.body.voice !== 'string') throw bad('Invalid audio request.');
    limit(`chunks:${c.user.id}`, 120, 3600_000);
    const narr = narrationFrom(c.body, plan);
    return generateChunk({
      ...narr,
      userId: c.user.id, docId: docId(c.body), docUpdatedAt: updated, chunkIndex: idx, engine: e, voice: c.body.voice, mode, pauseScale: scale,
      prons: plan === 'free' ? [] : prons(c.body),
      ephemeral: preview,
      priority: preview ? 'low' : hasFeature(plan, 'priority_queue') ? 'high' : 'normal',
      beforeSynthesis: async (minutes) => { await consume(c.user.id, plan, preview ? 'kokoro_preview_minutes' : 'server_tts_minutes', minutes); },
    });
  } },

  'POST /v1/ai/summary': { auth: true, run: (c) => {
    const kind = String(c.body.kind ?? '');
    if (!isSummaryKind(kind)) throw bad('Unknown summary type.');
    return aiRun(c, 'summaries', `summary:${kind}`, (ai, doc) => summarize(ai, doc, kind));
  } },
  'POST /v1/ai/ask': { auth: true, run: (c) => {
    const q = String(c.body.question ?? '').trim();
    if (q.length < 3 || q.length > 500) throw bad('Ask a question between 3 and 500 characters.');
    return aiRun(c, 'ask_document', 'ask', (ai, doc) => ask(ai, doc, q));
  } },
  'POST /v1/ai/explain': { auth: true, run: (c) => {
    const blockId = String(c.body.blockId ?? '');
    if (!/^b\d{4,}$/.test(blockId)) throw bad('Missing or invalid blockId.');
    return aiRun(c, 'table_figure_explain', 'explain', (ai, doc) => explain(ai, doc, blockId));
  } },

  'POST /v1/index': { auth: true, run: async (c) => {
    const plan = await c.plan();
    requireFeature(plan, 'semantic_search');
    const emb = makeEmbedder();
    if (!emb) throw new HttpError(503, 'embeddings_unavailable', 'Search by meaning is not switched on for this server.');
    const id = docId(c.body);
    const owned = await rest<unknown[]>(`documents?id=eq.${id}&user_id=eq.${c.user.id}&select=id`);
    if (!owned.length) throw new HttpError(404, 'no_such_document', 'That document was not found in your library.');
    limit(`index:${c.user.id}`, 60, 3600_000);
    await consume(c.user.id, plan, 'ai_requests', 1);
    const doc = await loadDocument(c.user.id, id);
    try { return { indexed: await indexDocument({ embed: (t) => emb.embed(t), replace: replaceChunks }, doc, { userId: c.user.id, documentId: id, version: Number(c.body.updatedAt) || Date.now() }) }; }
    catch (e) { throw new HttpError(502, 'index_failed', e instanceof Error ? e.message : 'Indexing failed.'); }
  } },

  'POST /v1/search': { auth: true, run: async (c) => {
    const plan = await c.plan();
    const single = typeof c.body.documentId === 'string' ? docId(c.body) : undefined;
    requireFeature(plan, single ? 'semantic_search' : 'cross_document_search');
    const emb = makeEmbedder();
    if (!emb) throw new HttpError(503, 'embeddings_unavailable', 'Search by meaning is not switched on for this server.');
    const query = String(c.body.query ?? '').trim();
    if (query.length < 2 || query.length > 300) throw bad('Search for between 2 and 300 characters.');
    limit(`search:${c.user.id}`, 120, 3600_000);
    try { return { hits: await semanticSearch({ embed: (t) => emb.embed(t), rpc: realSearchRpc }, { userId: c.user.id, query, documentId: single }) }; }
    catch (e) { throw new HttpError(502, 'search_failed', e instanceof Error ? e.message : 'Search failed.'); }
  } },

  // Pro: ask one question and get an answer drawn from passages across the person's whole library, with the places it came from.
  'POST /v1/ai/library-ask': { auth: true, run: async (c) => {
    const ai = getAiProvider();
    if (!ai) throw new HttpError(503, 'ai_unavailable', 'AI features are not switched on for this server.');
    const plan = await c.plan();
    requireFeature(plan, 'library_chat');
    const emb = makeEmbedder();
    if (!emb) throw new HttpError(503, 'embeddings_unavailable', 'Searching by meaning is not switched on for this server.');
    const question = String(c.body.question ?? '').trim();
    if (question.length < 3 || question.length > 400) throw bad('Ask a question between 3 and 400 characters.');
    limit(`libask:${c.user.id}`, 40, 3600_000);
    await consume(c.user.id, plan, 'ai_requests', 1);
    try {
      const hits = await semanticPassages({ embed: (t) => emb.embed(t), rpc: realSearchRpc }, { userId: c.user.id, query: question, limit: 8 });
      const ids = [...new Set(hits.map((h) => h.documentId))].filter((i) => /^[0-9a-f-]{36}$/i.test(i));
      const rows = ids.length ? await rest<Array<{ id: string; title: string }>>(`documents?user_id=eq.${c.user.id}&id=in.(${ids.join(',')})&select=id,title`) : [];
      const out = await askLibrary(ai, hits, new Map(rows.map((r) => [r.id, r.title])), question);
      void rest('ai_generations', { method: 'POST', prefer: 'return=minimal', body: { user_id: c.user.id, product: 'earshelf', kind: 'library-ask', provider: ai.id, model: ai.model, prompt_version: PROMPT_VERSION, input_ref: { question: question.slice(0, 200) }, output: out } }).catch(() => {});
      return out;
    } catch (e) {
      if (e instanceof HttpError) throw e;
      throw new HttpError(502, 'ai_failed', e instanceof Error ? e.message : 'The AI request failed.');
    }
  } },

  // Pro: a private podcast feed of finished audiobook exports (owner-approved limits in podcast.ts).
  'GET /v1/podcast': { auth: true, run: async (c) => {
    requireFeature(await c.plan(), 'podcast_feed');
    return podcastState(c.user.id, c.base);
  } },
  'POST /v1/podcast/enable': { auth: true, run: async (c) => {
    requireFeature(await c.plan(), 'podcast_feed');
    await ensureFeed(supaPodcastStore, c.user.id);
    return podcastState(c.user.id, c.base);
  } },
  'POST /v1/podcast/rotate': { auth: true, run: async (c) => {
    requireFeature(await c.plan(), 'podcast_feed');
    await supaPodcastStore.setToken(c.user.id, newToken()); // the old address stops working at once
    return podcastState(c.user.id, c.base);
  } },
  'POST /v1/podcast/episodes': { auth: true, run: async (c) => {
    requireFeature(await c.plan(), 'podcast_feed');
    const jobId = String(c.body.jobId ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) throw bad('Choose a finished audiobook file.');
    await ensureFeed(supaPodcastStore, c.user.id);
    await addEpisode(supaPodcastStore, c.user.id, jobId);
    return podcastState(c.user.id, c.base);
  } },
  'POST /v1/podcast/remove': { auth: true, run: async (c) => {
    const id = String(c.body.id ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw bad('Choose an episode to remove.');
    await supaPodcastStore.remove(c.user.id, id); // removing is always allowed, even after a downgrade
    return podcastState(c.user.id, c.base);
  } },

  // Shared vaults for both apps: a couple, a family or a study group. All rules are in vaults.ts; nobody reads these tables directly.
  'GET /v1/vaults': { auth: true, run: async (c) => ({ vaults: await listVaults(supaVaultStore, c.user.id, vaultProduct(c.query.get('product'))) }) },
  'GET /v1/vaults/detail': { auth: true, run: async (c) => vaultDetail(supaVaultStore, c.user.id, String(c.query.get('id') ?? '')) },
  'POST /v1/vaults/create': { auth: true, run: async (c) => {
    limit(`vault-new:${c.user.id}`, 20, 3600_000);
    const product = vaultProduct(c.body.product);
    const v = await createVault(supaVaultStore, { userId: c.user.id, email: c.user.email, product, plan: await getPlan(c.user.id, product), kind: c.body.kind, name: c.body.name, displayName: c.body.displayName });
    return { id: v.id, code: showCode(v.code) };
  } },
  'POST /v1/vaults/join': { auth: true, run: async (c) => {
    limit(`vault-join:${c.user.id}`, 20, 3600_000); // slows down anyone guessing codes
    const v = await joinVault(supaVaultStore, { userId: c.user.id, email: c.user.email, product: vaultProduct(c.body.product), code: c.body.code, displayName: c.body.displayName });
    return { id: v.id };
  } },
  'POST /v1/vaults/leave': { auth: true, run: async (c) => { await leaveVault(supaVaultStore, c.user.id, String(c.body.id ?? '')); return { ok: true }; } },
  'POST /v1/vaults/remove-member': { auth: true, run: async (c) => { await removeMember(supaVaultStore, c.user.id, String(c.body.id ?? ''), String(c.body.userId ?? '')); return { ok: true }; } },
  'POST /v1/vaults/rotate-code': { auth: true, run: async (c) => ({ code: await rotateCode(supaVaultStore, c.user.id, String(c.body.id ?? '')) }) },
  'POST /v1/vaults/delete': { auth: true, run: async (c) => { await deleteVault(supaVaultStore, c.user.id, String(c.body.id ?? '')); return { ok: true }; } },
  'POST /v1/vaults/items': { auth: true, run: async (c) => { limit(`vault-item:${c.user.id}`, 120, 3600_000); const i = await addItem(supaVaultStore, c.user.id, String(c.body.id ?? ''), c.body); return { id: i.id }; } },
  'POST /v1/vaults/items/remove': { auth: true, run: async (c) => { await removeItem(supaVaultStore, c.user.id, String(c.body.id ?? ''), String(c.body.itemId ?? '')); return { ok: true }; } },
  'POST /v1/vaults/comments': { auth: true, run: async (c) => { limit(`vault-comment:${c.user.id}`, 200, 3600_000); const m = await addComment(supaVaultStore, c.user.id, String(c.body.id ?? ''), String(c.body.itemId ?? ''), c.body.body); return { id: m.id }; } },

  'POST /v1/export/audio': { auth: true, run: async (c) => {
    const plan = await c.plan();
    requireFeature(plan, 'audio_export');
    const e = engineFor(String(c.body.provider ?? ''), c.user.id);
    if (!e) throw new HttpError(404, 'no_such_provider', 'That voice provider is not available.');
    const mode = c.body.mode as ReadingMode, scale = Number(c.body.pauseScale ?? 1), updated = Number(c.body.updatedAt);
    const format = c.body.format === 'm4b' ? 'm4b' : 'mp3';
    if (!MODES.includes(mode) || !(scale >= 0.5 && scale <= 2) || !Number.isFinite(updated) || typeof c.body.voice !== 'string') throw bad('Invalid export request.');
    await consume(c.user.id, plan, 'audio_exports', 1);
    const jobId = await startExport({
      ...narrationFrom(c.body, plan),
      priority: hasFeature(plan, 'priority_queue') ? 'high' : 'normal',
      userId: c.user.id, docId: docId(c.body), docUpdatedAt: updated, engine: e, voice: c.body.voice, mode, pauseScale: scale, format,
      prons: plan === 'free' ? [] : prons(c.body),
      beforeSynthesis: async (minutes) => { await consume(c.user.id, plan, 'server_tts_minutes', minutes); },
    });
    return { jobId };
  } },
  'GET /v1/jobs': { auth: true, run: (c) => jobStatus(c.user.id, c.query.get('id') ?? '') },

  'POST /v1/ai/quiz': { auth: true, run: (c) => {
    const count = Math.min(15, Math.max(3, Number(c.body.count ?? 8)));
    const sectionId = typeof c.body.sectionId === 'string' ? c.body.sectionId : undefined;
    const cards = c.body.kind === 'flashcards';
    return aiRun(c, 'quizzes', cards ? 'flashcards' : 'quiz', async (ai, doc) => (cards ? { cards: await flashcards(ai, doc, { sectionId, count }) } : { questions: await quiz(ai, doc, { sectionId, count }) }));
  } },
};

Object.assign(routes, tapestryRoutes({ limit, bad }));
Object.assign(routes, earshelfActivityRoutes({ limit, bad }));
Object.assign(routes, earshelfPushRoutes({ limit, bad }));

const tokenCache = new Map<string, { id: string; email?: string; exp: number }>();
async function authenticate(req: IncomingMessage): Promise<{ id: string; email?: string }> {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
  if (!m) throw new HttpError(401, 'unauthorized', 'Sign in to use this.');
  const hit = tokenCache.get(m[1]);
  if (hit && hit.exp > Date.now()) return { id: hit.id, email: hit.email };
  const u = await getUser(m[1]);
  if (!u) throw new HttpError(401, 'unauthorized', 'Your session has expired. Sign in again.');
  tokenCache.set(m[1], { id: u.id, email: u.email, exp: Date.now() + 60_000 });
  if (tokenCache.size > 2000) tokenCache.clear();
  return { id: u.id, email: u.email };
}

async function readBody(req: IncomingMessage, max = 2_000_000): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) { size += (c as Buffer).length; if (size > max) throw new HttpError(413, 'too_large', 'Request is too large.'); chunks.push(c as Buffer); }
  return Buffer.concat(chunks).toString('utf8');
}

function cors(req: IncomingMessage, res: ServerResponse) {
  const o = req.headers.origin;
  if (o && (config.allowedOrigins.includes('*') || config.allowedOrigins.includes(o))) {
    res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
}

createServer(async (req, res) => {
  cors(req, res);
  const url = new URL(req.url ?? '/', 'http://x');
  try {
    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
    // Podcast apps fetch these without signing in: the secret in the address is the key.
    const feedMatch = req.method === 'GET' || req.method === 'HEAD' ? /^\/feed\/([A-Za-z0-9_-]{32})(?:\.xml|\/([0-9a-f-]{36})\.(mp3|m4b))$/.exec(url.pathname) : null;
    if (feedMatch) {
      limit(`feed:${String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0].trim()}`, 600, 3600_000);
      const owner = TOKEN_RE.test(feedMatch[1]) ? await supaPodcastStore.userByToken(feedMatch[1]) : null;
      const none = () => { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); };
      if (!owner) return none();
      const base = publicBase(req.headers, config.publicApiUrl);
      if (!feedMatch[2]) {
        const eps = await supaPodcastStore.list(owner);
        res.writeHead(200, { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'private, max-age=300' }).end(req.method === 'HEAD' ? undefined : buildFeedXml({ base, token: feedMatch[1], title: 'My earshelf audiobooks', episodes: eps }));
        return;
      }
      const ep = await supaPodcastStore.byId(feedMatch[2]);
      if (!ep || ep.userId !== owner || ep.ext !== feedMatch[3]) return none();
      // Hand the app a short-lived link to the file. Storage serves it (including partial downloads), not this server.
      res.writeHead(302, { Location: await signedUrl('audio', ep.storagePath, 3600), 'Cache-Control': 'no-store' }).end();
      return;
    }
    if (req.method === 'POST' && url.pathname === '/webhooks/creem') {
      const raw = await readBody(req);
      const out = await processCreemWebhook(raw, req.headers['creem-signature'] as string | undefined);
      if (out.status === 200 && out.result.ignored) console.log(`creem webhook ${out.result.eventName} ignored: ${out.result.ignored}`);
      res.writeHead(out.status, { 'Content-Type': 'application/json' }).end(JSON.stringify(out.status === 200 ? { ok: true, duplicate: out.result.duplicate } : { error: out.error }));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/webhooks/lemonsqueezy') {
      const raw = await readBody(req);
      const out = await processWebhook(raw, req.headers['x-signature'] as string | undefined);
      res.writeHead(out.status, { 'Content-Type': 'application/json' }).end(JSON.stringify(out.status === 200 ? { ok: true, duplicate: out.result.duplicate } : { error: out.error }));
      return;
    }
    const route = routes[`${req.method} ${url.pathname}`];
    if (!route) { res.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'not_found' })); return; }
    const user: { id: string; email?: string } = route.auth ? await authenticate(req) : { id: '' };
    let body: Json = {};
    if (req.method === 'POST') { try { body = JSON.parse((await readBody(req)) || '{}') as Json; } catch (e) { if (e instanceof HttpError) throw e; throw bad('Body must be JSON.'); } }
    let planP: Promise<Plan> | null = null;
    const out = await route.run({ user, body, query: url.searchParams, origin: String(req.headers.origin ?? ''), base: publicBase(req.headers, config.publicApiUrl), plan: () => (planP ??= getPlan(user.id, url.pathname.startsWith('/v1/tapestry/') ? 'tapestry' : 'earshelf')) });
    if (out && typeof out === 'object' && '__binary' in out) {
      const b = out as { __binary: Buffer; type: string };
      res.writeHead(200, { 'Content-Type': b.type, 'Content-Length': b.__binary.length }).end(b.__binary);
    } else res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(out));
  } catch (e) {
    if (e instanceof HttpError) { res.writeHead(e.status, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: e.code, message: e.message })); return; }
    console.error(`${req.method} ${url.pathname} failed`, e);
    report(e, `${req.method} ${url.pathname}`);
    res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'server_error', message: 'Something went wrong on our side. Try again in a moment.' }));
  }
}).listen(config.port, () => console.log(`wells api (earshelf + tapestry) listening on ${config.port}`));
logStartupReport();
startPodcastSweeper();
startPushScheduler();

process.on('uncaughtException', (e) => { console.error('uncaught', e); report(e, 'uncaughtException'); });
process.on('unhandledRejection', (e) => { console.error('unhandled', e); report(e, 'unhandledRejection'); });
