import { DRAMATIZED_NOTE, pickCast, segmentVerses, STEP_CREDIT, verseKeys, CROSSREF_CREDIT, chosenRefs, classifyQuery, formatReference, parseRefKey, rankRelated, refKey, versesIn, DEFAULT_TRANSLATION } from '../../../../packages/scripture/src/index.ts';
import { DEFAULT_TARGET_DAYS, LISTEN_MIN_SECONDS, XP, isDay, isXpKind, addDays, localDay, validTimeZone, xpAward, DAILY_XP_CAP, BADGES, type Session } from '../../../../packages/activity/src/index.ts';
import type { Feature, Plan } from '../../../../packages/billing/src/plans.ts';
import { config } from '../config.ts';
import { HttpError, consume, requireFeature } from '../entitlements.ts';
import { getAiProvider } from '../ai/provider.ts';
import { rest } from '../supa.ts';
import { draftWell, phraseInsight, recommend, reflect, TAPESTRY_PROMPT_VERSION, type Candidate } from './ai.ts';
import { buildSummary, listenedDays } from './activity.ts';
import { buildGuide } from './studyGuide.ts';
import { buildDraft } from './sermon.ts';
import { MAX_NARRATED_VERSES, NARRATION_TRANSLATIONS, minutesFor, narratePart, narrateSegments, pickVoice, planNarration } from './narrate.ts';
import { engineFor } from '../tts/engines.ts';
import { pcmToMp3 } from '../tts/ffmpeg.ts';
import { renderGate } from '../tts/generate.ts';
import { importTranslation, seedStarter } from './setup.ts';

type Json = Record<string, unknown>;
interface Ctx { user: { id: string }; body: Json; query: URLSearchParams; plan: () => Promise<Plan> }
interface Route { auth: boolean; run: (c: Ctx) => Promise<unknown> }
interface Deps { limit: (key: string, max: number, windowMs: number) => void; bad: (m: string) => HttpError }
const P = 'tapestry';
const has = (plan: Plan, f: Feature) => { try { requireFeature(plan, f); return true; } catch { return false; } };

export function tapestryRoutes({ limit, bad }: Deps): Record<string, Route> {
  /** The verse text for each chosen passage, from this server's own copy of the Bible. */
  const loadPassages = (refs: string[]) => Promise.all(refs.map(async (key) => {
    const ref = parseRefKey(key)!; const to = ref.verseEnd ?? ref.verseStart ?? 999, from = ref.verseStart ?? 1;
    const rows = await rest<Array<{ text: string }>>(`bible_verses?translation_id=eq.${config.tapestry.translationId}&book=eq.${ref.book.n}&chapter=eq.${ref.chapter}&verse=gte.${from}&verse=lte.${to}&select=text&order=verse`);
    return { key, label: formatReference(ref), text: rows.map((r) => r.text).join(' ') };
  }));
  const log = (c: Ctx, kind: string, input: unknown, output: unknown, ai: ReturnType<typeof getAiProvider>) => {
    if (!ai) return; void rest('ai_generations', { method: 'POST', prefer: 'return=minimal', body: { user_id: c.user.id, product: P, kind, provider: ai.id, model: ai.model, prompt_version: TAPESTRY_PROMPT_VERSION, input_ref: input, output } }).catch(() => {});
  };
  const textHits = async (q: string): Promise<Candidate[]> => {
    try {
      const rows = await rest<Array<{ book: number; chapter: number; verse: number }>>('rpc/search_verses', { method: 'POST', body: { p_translation: config.tapestry.translationId, p_query: q, p_limit: 12 } });
      return rows.map((r) => ({ ref: `${bookCode(r.book)}.${r.chapter}.${r.verse}`, link: 'related' as const, from: 'Text match' })).filter((c) => parseRefKey(c.ref));
    } catch { return []; }
  };
  const tzOf = async (id: string) => (await rest<Array<{ timezone: string }>>(`profiles?id=eq.${id}&select=timezone`).catch(() => []))[0]?.timezone ?? 'UTC';

  return {
    'GET /v1/tapestry/capabilities': { auth: true, run: async (c) => { const plan = await c.plan(); return { plan, admin: config.tapestry.adminUserIds.has(c.user.id), ai: !!getAiProvider(), aiSearch: has(plan, 'ai_search') && !!getAiProvider(), translation: config.tapestry.translationId }; } },

    'POST /v1/tapestry/recommend': { auth: true, run: async (c) => {
      const q = String(c.body.query ?? '').trim();
      if (q.length < 3 || q.length > 300) throw bad('Describe what you are looking for in 3 to 300 characters.');
      limit(`t-rec:${c.user.id}`, 60, 3600_000);
      const plan = await c.plan(); const ai = has(plan, 'ai_search') ? getAiProvider() : null;
      if (ai) await consume(c.user.id, plan, 'ai_requests', 1, P);
      const out = await recommend(ai, q, await textHits(q));
      log(c, 'recommend', { q }, out, ai);
      return { ...out, upgrade: !ai && has(plan, 'ai_search') === false };
    } },

    'POST /v1/tapestry/reflect': { auth: true, run: async (c) => {
      const ref = parseRefKey(String(c.body.ref ?? '')); if (!ref) throw bad('That passage reference is not valid.');
      limit(`t-ref:${c.user.id}`, 60, 3600_000);
      const plan = await c.plan(); const ai = has(plan, 'reflection_ai') ? getAiProvider() : null;
      if (ai) await consume(c.user.id, plan, 'ai_requests', 1, P);
      const to = ref.verseEnd ?? ref.verseStart ?? 999, from = ref.verseStart ?? 1;
      const rows = await rest<Array<{ text: string }>>(`bible_verses?translation_id=eq.${config.tapestry.translationId}&book=eq.${ref.book.n}&chapter=eq.${ref.chapter}&verse=gte.${from}&verse=lte.${to}&select=text&order=verse`);
      const out = await reflect(ai, formatReference(ref), rows.map((r) => r.text).join(' '));
      log(c, 'reflect', { ref: refKey(ref) }, out, ai);
      return out;
    } },

    // Pro: a study guide or talk outline from the passages the person picked. The questions may come from AI; the verses never do.
    'POST /v1/tapestry/study-guide': { auth: true, run: async (c) => {
      const plan = await c.plan(); requireFeature(plan, 'sermon_generator');
      const refs = chosenRefs(c.body.refs); if (!refs.length) throw bad('Choose at least one passage.');
      const kind = c.body.kind === 'talk' ? 'talk' : 'study';
      const title = String(c.body.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
      limit(`t-guide:${c.user.id}`, 30, 3600_000);
      const ai = getAiProvider();
      if (ai) await consume(c.user.id, plan, 'ai_requests', 1, P);
      const passages = await loadPassages(refs);
      const out = await buildGuide(ai, kind, title, passages);
      log(c, 'study-guide', { refs, kind }, out, ai);
      return out;
    } },

    // Pro: an AI-written message draft from the chosen passages (owner-approved, with limits enforced in packages/scripture/src/sermon.ts).
    'POST /v1/tapestry/sermon-draft': { auth: true, run: async (c) => {
      const plan = await c.plan(); requireFeature(plan, 'sermon_generator');
      const ai = getAiProvider();
      if (!ai) throw new HttpError(503, 'ai_unavailable', 'AI features are not switched on for this server yet.');
      const refs = chosenRefs(c.body.refs); if (!refs.length) throw bad('Choose at least one passage.');
      const tone = c.body.tone === 'teaching' ? 'teaching' : 'pastoral';
      const length = c.body.length === 'medium' ? 'medium' : 'short';
      const title = String(c.body.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
      limit(`t-draft:${c.user.id}`, 10, 3600_000);
      await consume(c.user.id, plan, 'ai_requests', 2, P); // a draft is heavier than a question, so it counts double
      const passages = await loadPassages(refs);
      const out = await buildDraft(ai, tone, length, title, passages);
      if (!out) throw new HttpError(422, 'draft_unsafe', 'Could not write a draft that follows the rules for these passages. Try again, or choose fewer passages.');
      log(c, 'sermon-draft', { refs, tone, length }, out, ai);
      return out;
    } },

    // Pro: passages related to one you are reading (OpenBible.info cross-references, CC BY 4.0).
    'GET /v1/tapestry/cross-refs': { auth: true, run: async (c) => {
      requireFeature(await c.plan(), 'cross_ref_graph');
      const key = chosenRefs([String(c.query.get('ref') ?? '')])[0];
      const verses = key ? versesIn(key) : null;
      if (!key || !verses) throw bad('Choose a passage of up to 60 verses.');
      limit(`t-xref:${c.user.id}`, 300, 3600_000);
      const filter = verses === 'chapter' ? `from_ref=like.${key}.*` : `from_ref=in.(${verses.join(',')})`;
      let rows: Array<{ from_ref: string; to_ref: string; votes: number }>;
      try { rows = await rest(`cross_references?${filter}&select=from_ref,to_ref,votes&order=votes.desc&limit=400`); }
      catch { throw new HttpError(503, 'crossrefs_unavailable', 'Cross-references have not been set up on this server yet.'); }
      return { ref: key, credit: CROSSREF_CREDIT, items: rankRelated(rows, key, 25).map((r) => { const p = parseRefKey(r.ref); return { ref: r.ref, label: p ? formatReference(p) : r.ref, votes: r.votes }; }) };
    } },

    // Plus: a part of a passage read aloud with the natural Kokoro voice. Made on request and sent straight back, never saved. Public domain translations only.
    'POST /v1/tapestry/narrate': { auth: true, run: async (c) => {
      const plan = await c.plan(); requireFeature(plan, 'natural_tts');
      const translation = String(c.body.translation ?? DEFAULT_TRANSLATION);
      if (!NARRATION_TRANSLATIONS.includes(translation)) throw new HttpError(403, 'not_narratable', 'Natural voice reading is only available for the World English Bible, King James Version and American Standard Version.');
      const key = chosenRefs([String(c.body.ref ?? '')])[0]; const ref = key ? parseRefKey(key) : null;
      if (!key || !ref) throw bad('Choose a passage to listen to.');
      const engine = engineFor('kokoro', c.user.id);
      if (!engine) throw new HttpError(503, 'voice_unavailable', 'The natural voice is not switched on for this server.');
      const to = ref.verseEnd ?? ref.verseStart ?? 999, from = ref.verseStart ?? 1;
      const rows = await rest<Array<{ verse: number; text: string }>>(`bible_verses?translation_id=eq.${encodeURIComponent(translation)}&book=eq.${ref.book.n}&chapter=eq.${ref.chapter}&verse=gte.${from}&verse=lte.${to}&select=verse,text&order=verse&limit=${MAX_NARRATED_VERSES}`);
      if (!rows.length) throw new HttpError(404, 'no_text', 'That passage is not loaded in this translation.');
      const parts = planNarration(rows.map((r) => ({ n: r.verse, text: r.text })));
      const idx = Number(c.body.chunk ?? 0);
      if (!Number.isInteger(idx) || idx < 0 || idx >= parts.length) throw bad('That part does not exist.');
      const dramatized = c.body.mode === 'dramatized';
      if (dramatized) requireFeature(plan, 'dramatized_audio');
      const voices = await engine.listVoices();
      const voice = pickVoice(voices, c.body.voice);
      if (!voice) throw new HttpError(503, 'voice_unavailable', 'The natural voice has no voices available right now.');
      limit(`t-narr:${c.user.id}`, 240, 3600_000);
      await consume(c.user.id, plan, 'server_tts_minutes', minutesFor(parts[idx]), P); // counts against the same fair-use monthly voice allowance
      const priority = has(plan, 'priority_queue') ? 'high' : 'normal';
      let out;
      if (dramatized) {
        // Work out who speaks over the WHOLE passage first, so a quote that runs across parts keeps its voice, then read this part's stretches.
        const inPart = new Set(parts[idx].map((v) => v.n));
        const segs = segmentVerses(rows.map((r) => ({ n: r.verse, text: r.text }))).filter((s) => inPart.has(s.verse));
        out = await renderGate.run(priority, () => narrateSegments({ engine, cast: pickCast(voices, voice), toMp3: pcmToMp3 }, segs));
      } else out = await renderGate.run(priority, () => narratePart({ engine, voice, toMp3: pcmToMp3 }, parts[idx]));
      return { ref: key, translation, mode: dramatized ? 'dramatized' : 'single', note: dramatized ? DRAMATIZED_NOTE : undefined, chunkIndex: idx, chunkCount: parts.length, durationMs: out.durationMs, verses: out.verses, voice, url: `data:audio/mpeg;base64,${out.mp3.toString('base64')}` };
    } },

    // Pro: the Hebrew or Greek words behind a passage, word by word (STEPBible-Data, CC BY 4.0).
    'GET /v1/tapestry/original': { auth: true, run: async (c) => {
      requireFeature(await c.plan(), 'interlinear');
      const key = chosenRefs([String(c.query.get('ref') ?? '')])[0];
      const chapter = key ? versesIn(key) === 'chapter' : false;
      const keys = key && !chapter ? verseKeys(key) : null;
      if (!key || (!chapter && !keys)) throw bad('Choose a chapter, a verse, or up to 40 verses.');
      limit(`t-orig:${c.user.id}`, 300, 3600_000);
      let rows: Array<{ ref: string; lang: 'he' | 'gr'; words: unknown[] }>;
      try { rows = await rest(`original_verses?${chapter ? `ref=like.${key}.*` : `ref=in.(${keys!.join(',')})`}&select=ref,lang,words&limit=400`); }
      catch { throw new HttpError(503, 'original_unavailable', 'The Hebrew and Greek word data has not been set up on this server yet.'); }
      const num = (r: string) => Number(r.split('.').pop());
      const sorted = rows.sort((a, b) => num(a.ref) - num(b.ref));
      return { ref: key, credit: STEP_CREDIT, truncated: sorted.length > 60, verses: sorted.slice(0, 60).map((r) => ({ n: num(r.ref), lang: r.lang, words: r.words })) };
    } },

    'POST /v1/tapestry/well-draft': { auth: true, run: async (c) => {
      const goal = String(c.body.goal ?? '').trim();
      if (goal.length < 3 || goal.length > 300) throw bad('Describe the well in 3 to 300 characters.');
      limit(`t-well:${c.user.id}`, 30, 3600_000);
      const plan = await c.plan(); const ai = has(plan, 'ai_well') ? getAiProvider() : null;
      if (ai) await consume(c.user.id, plan, 'ai_requests', 1, P);
      const out = await draftWell(ai, goal, await textHits(goal));
      if (!out) throw new HttpError(404, 'nothing_found', 'We could not find passages for that. Try describing a feeling or a situation.');
      log(c, 'well_draft', { goal }, out, ai);
      return out;
    } },

    'GET /v1/tapestry/search': { auth: false, run: async (c) => {
      const q = classifyQuery(c.query.get('q') ?? ''); limit(`t-search:${c.query.get('q')}`, 600, 3600_000);
      if (q.kind === 'phrase') return { kind: q.kind, hits: await textHits(q.text) };
      return { kind: q.kind, ref: q.ref ? refKey(q.ref) : undefined };
    } },

    // Activity: the server decides what earns points, caps the day, and keeps the record. The phone only reports what happened.
    'POST /v1/tapestry/activity': { auth: true, run: async (c) => {
      const kind = String(c.body.kind ?? '');
      limit(`t-act:${c.user.id}`, 600, 3600_000);
      const tz = typeof c.body.tz === 'string' && validTimeZone(c.body.tz) ? c.body.tz : await tzOf(c.user.id);
      if (typeof c.body.tz === 'string' && validTimeZone(c.body.tz)) await rest('profiles?on_conflict=id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { id: c.user.id, timezone: tz } }).catch(() => {});
      const today = localDay(Date.now(), tz);
      const day = isDay(c.body.day) && c.body.day >= addDays(today, -2) && c.body.day <= addDays(today, 1) ? c.body.day : today; // late offline reports are accepted for two days
      const ref = typeof c.body.ref === 'string' ? c.body.ref.slice(0, 40) : null;
      const rpc = (k: string, r: string | null, secs: number, amount: number) => rest<Array<{ awarded: number; day_seconds: number }>>('rpc/record_activity', { method: 'POST', body: { p_user: c.user.id, p_product: P, p_kind: k, p_ref: r, p_day: day, p_seconds: secs, p_amount: amount, p_cap: DAILY_XP_CAP } });
      let awarded = 0;
      if (kind === 'listen') {
        const secs = Math.round(Number(c.body.seconds));
        if (!(secs >= 1 && secs <= 14400)) throw bad('Listening time must be between 1 second and 4 hours.');
        const wellName = typeof c.body.wellName === 'string' ? c.body.wellName.slice(0, 80) : null;
        await rest('listening_sessions', { method: 'POST', prefer: 'return=minimal', body: { user_id: c.user.id, product: P, day, seconds: secs, well_name: wellName } });
        const [r] = await rpc('listen', null, secs, 0);
        if (r && r.day_seconds >= LISTEN_MIN_SECONDS) { const [x] = await rpc('listen_day', null, 0, XP.listen_day); awarded += x?.awarded ?? 0; }
      } else if (isXpKind(kind)) {
        const [x] = await rpc(kind, ref, 0, xpAward(kind, 0) || XP[kind]); awarded += x?.awarded ?? 0;
      } else throw bad('Unknown activity.');
      return { awarded };
    } },

    'GET /v1/tapestry/activity': { auth: true, run: async (c) => {
      const tz = await tzOf(c.user.id); const today = localDay(Date.now(), tz); const from = addDays(today, -400);
      const [days, xp, target, sess, earned] = await Promise.all([
        rest<Array<{ day: string; seconds: number }>>(`activity_days?user_id=eq.${c.user.id}&product=eq.${P}&day=gte.${from}&select=day,seconds`),
        rest<Array<{ amount: number; day: string }>>(`xp_events?user_id=eq.${c.user.id}&product=eq.${P}&select=amount,day`),
        rest<Array<{ target_days: number }>>(`weekly_targets?user_id=eq.${c.user.id}&product=eq.${P}&select=target_days`),
        rest<Array<{ started_at: string; seconds: number; well_name: string | null }>>(`listening_sessions?user_id=eq.${c.user.id}&product=eq.${P}&started_at=gte.${addDays(today, -8)}&select=started_at,seconds,well_name`),
        rest<Array<{ badge_id: string }>>(`badge_awards?user_id=eq.${c.user.id}&product=eq.${P}&select=badge_id`),
      ]);
      const weekFrom = addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
      const sessions: Session[] = sess.map((s) => ({ ts: Date.parse(s.started_at), seconds: s.seconds, wellName: s.well_name ?? undefined }));
      const s = buildSummary({ today, tz, listenedDays: listenedDays(days), xpTotal: xp.reduce((n, x) => n + x.amount, 0), xpWeek: xp.filter((x) => x.day >= weekFrom).reduce((n, x) => n + x.amount, 0), target: target[0]?.target_days ?? DEFAULT_TARGET_DAYS, sessions });
      const have = new Set(earned.map((e) => e.badge_id)); const fresh = s.badges.earned.filter((b) => !have.has(b.id));
      if (fresh.length) await rest('badge_awards?on_conflict=user_id,product,badge_id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: fresh.map((b) => ({ user_id: c.user.id, product: P, badge_id: b.id })) }).catch(() => {});
      const plan = await c.plan(); const ai = has(plan, 'recommendations') ? getAiProvider() : null;
      const cached = (await rest<Array<{ body: string; source: 'ai' | 'computed' }>>(`weekly_insights?user_id=eq.${c.user.id}&product=eq.${P}&week_start=eq.${s.weekStart}&select=body,source`).catch(() => []))[0];
      const phrased = cached && Date.now() - 0 >= 0 && cached.source === 'ai' ? { text: cached.body, source: cached.source, label: 'AI-written from your activity' } : await phraseInsight(ai, s.facts);
      if (!cached || (cached.source !== 'ai' && phrased.source === 'ai')) void rest('weekly_insights?on_conflict=user_id,product,week_start', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { user_id: c.user.id, product: P, week_start: s.weekStart, facts: s.facts, body: phrased.text, source: phrased.source, model: phrased.source === 'ai' ? ai?.model : null } }).catch(() => {});
      return { ...s, newBadges: fresh.map((b) => b.id), insight: phrased, badgeCatalog: BADGES };
    } },

    'POST /v1/tapestry/target': { auth: true, run: async (c) => {
      const n = Math.round(Number(c.body.days)); if (!(n >= 1 && n <= 7)) throw bad('Choose between 1 and 7 days.');
      await rest('weekly_targets?on_conflict=user_id,product', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { user_id: c.user.id, product: P, target_days: n } });
      return { days: n };
    } },

    // One-time setup, for the people listed in TAPESTRY_ADMIN_USER_IDS only.
    'POST /v1/tapestry/admin/setup': { auth: true, run: async (c) => {
      if (!config.tapestry.adminUserIds.has(c.user.id)) throw new HttpError(403, 'forbidden', 'This is only for the app owner.');
      const seeded = await seedStarter();
      const ids = Array.isArray(c.body.translations) ? (c.body.translations as unknown[]).filter((x): x is string => typeof x === 'string') : [DEFAULT_TRANSLATION];
      const imported: Array<{ translation: string; verses: number; starterProblems: string[] } | { translation: string; error: string }> = [];
      if (c.body.importText !== false) for (const id of ids) { try { imported.push(await importTranslation(id, c.body.enable === true)); } catch (e) { imported.push({ translation: id, error: e instanceof Error ? e.message : 'failed' }); } }
      return { seeded, imported };
    } },
  };
}
import { BOOKS } from '../../../../packages/scripture/src/index.ts';
const bookCode = (n: number): string => BOOKS[n - 1]?.code ?? '';
