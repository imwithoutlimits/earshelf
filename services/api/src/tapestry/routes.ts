import { classifyQuery, formatReference, parseRefKey, refKey, DEFAULT_TRANSLATION } from '../../../../packages/scripture/src/index.ts';
import { DEFAULT_TARGET_DAYS, LISTEN_MIN_SECONDS, XP, isDay, isXpKind, addDays, localDay, validTimeZone, xpAward, DAILY_XP_CAP, BADGES, type Session } from '../../../../packages/activity/src/index.ts';
import type { Feature, Plan } from '../../../../packages/billing/src/plans.ts';
import { config } from '../config.ts';
import { HttpError, consume, requireFeature } from '../entitlements.ts';
import { getAiProvider } from '../ai/provider.ts';
import { rest } from '../supa.ts';
import { draftWell, phraseInsight, recommend, reflect, TAPESTRY_PROMPT_VERSION, type Candidate } from './ai.ts';
import { buildSummary, listenedDays } from './activity.ts';
import { importTranslation, seedStarter } from './setup.ts';

type Json = Record<string, unknown>;
interface Ctx { user: { id: string }; body: Json; query: URLSearchParams; plan: () => Promise<Plan> }
interface Route { auth: boolean; run: (c: Ctx) => Promise<unknown> }
interface Deps { limit: (key: string, max: number, windowMs: number) => void; bad: (m: string) => HttpError }
const P = 'tapestry';
const has = (plan: Plan, f: Feature) => { try { requireFeature(plan, f); return true; } catch { return false; } };

export function tapestryRoutes({ limit, bad }: Deps): Record<string, Route> {
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
