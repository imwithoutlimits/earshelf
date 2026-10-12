import { STARTER_WELLS, GENERIC_PROMPTS, wellsForText, keepValidRefs, cleanPrompt, breaksBoundaries, type Link } from '../../../../packages/scripture/src/index.ts';
import { insightText, cleanInsight, insightPrompt, type InsightFacts } from '../../../../packages/activity/src/index.ts';
import { parseJson, type AiProvider } from '../ai/provider.ts';

export const TAPESTRY_PROMPT_VERSION = 'tapestry-1';
const RULES = 'You help someone find Bible passages. You may only choose from the candidate list you are given. Never write, quote or paraphrase Scripture. Never invent references. Never interpret doctrine or speak with spiritual authority. Never give medical advice or promise healing, prosperity or outcomes. Reply with JSON only.';

export interface Candidate { ref: string; link: Link; note?: string; from: string }
export interface RecItem { ref: string; link: Link; note?: string; reason?: string }
export interface Recommendation { source: 'ai' | 'curated' | 'none'; label: string; items: RecItem[]; wells: Array<{ id: string; name: string }> }

/** Candidates come from the curated wells that match the words, plus any exact text hits found in the database. The AI never sees anything else, so it cannot recommend what is not in the library. */
export function candidatesFor(text: string, extra: Candidate[] = []): { candidates: Candidate[]; wells: Array<{ id: string; name: string }> } {
  const hits = wellsForText(text).slice(0, 3);
  const out: Candidate[] = []; const seen = new Set<string>();
  const add = (c: Candidate) => { if (!seen.has(c.ref) && out.length < 40) { seen.add(c.ref); out.push(c); } };
  for (const h of hits) { const w = STARTER_WELLS.find((x) => x.id === h.wellId)!; for (const i of w.items) add({ ref: i.ref, link: i.link, note: i.note, from: w.name }); }
  for (const x of extra) add(x);
  return { candidates: out, wells: hits.map((h) => ({ id: h.wellId, name: STARTER_WELLS.find((x) => x.id === h.wellId)!.name })) };
}

export async function recommend(ai: AiProvider | null, query: string, extra: Candidate[] = []): Promise<Recommendation> {
  const { candidates, wells } = candidatesFor(query, extra);
  if (!candidates.length) return { source: 'none', label: '', items: [], wells: [] };
  const curated: Recommendation = { source: 'curated', label: 'From curated wells', items: candidates.slice(0, 8).map(({ ref, link, note }) => ({ ref, link, note })), wells };
  if (!ai) return curated;
  try {
    const raw = await ai.complete(RULES, JSON.stringify({ task: 'Choose up to 8 candidates that best fit what the person describes and order them. Give each a neutral reason of at most 100 characters that does not interpret doctrine.', query, candidates: candidates.map((c) => ({ ref: c.ref, well: c.from })), format: { refs: ['REF'], reasons: { REF: 'short reason' } } }), { maxTokens: 900 });
    const j = parseJson<{ refs?: unknown; reasons?: Record<string, unknown> }>(raw);
    const byRef = new Map(candidates.map((c) => [c.ref, c]));
    const refs = keepValidRefs(j?.refs, new Set(byRef.keys())).slice(0, 8);
    if (!refs.length) return curated;
    return { source: 'ai', label: 'Suggested by AI', wells, items: refs.map((ref) => {
      const c = byRef.get(ref)!; const why = j?.reasons?.[ref];
      return { ref, link: c.link, note: c.note, reason: typeof why === 'string' && why.length <= 140 && !breaksBoundaries(why) ? why.trim() : undefined };
    }) };
  } catch { return curated; }
}

export interface Prompts { source: 'ai' | 'editorial'; label: string; prompts: string[] }
export async function reflect(ai: AiProvider | null, refLabel: string, passageText: string): Promise<Prompts> {
  const editorial: Prompts = { source: 'editorial', label: 'Editorial prompt', prompts: GENERIC_PROMPTS.slice(0, 3) };
  if (!ai) return editorial;
  try {
    const raw = await ai.complete(RULES, JSON.stringify({ task: 'Write three short reflection questions about this passage. Each must be an open question or invitation that does not state what the passage means and makes no claim.', passage: refLabel, text: passageText.slice(0, 1500), format: { prompts: ['...'] } }), { maxTokens: 400 });
    const list = (parseJson<{ prompts?: unknown }>(raw)?.prompts ?? []) as unknown[];
    const clean = (Array.isArray(list) ? list : []).map(cleanPrompt).filter((x): x is string => !!x).slice(0, 3);
    return clean.length ? { source: 'ai', label: 'AI-generated reflection prompt', prompts: clean } : editorial;
  } catch { return editorial; }
}

export interface WellDraft { source: 'ai' | 'curated'; label: string; name: string; description: string; refs: string[] }
export async function draftWell(ai: AiProvider | null, goal: string, extra: Candidate[] = []): Promise<WellDraft | null> {
  const { candidates, wells } = candidatesFor(goal, extra);
  if (!candidates.length) return null;
  const fallback = (): WellDraft => { const w = STARTER_WELLS.find((x) => x.id === wells[0]?.id)!; return { source: 'curated', label: 'From curated wells', name: w.name, description: w.description, refs: candidates.slice(0, 8).map((c) => c.ref) }; };
  if (!ai) return fallback();
  try {
    const raw = await ai.complete(RULES, JSON.stringify({ task: 'Draft a personal well from the candidates: a title of at most 6 words, a one-sentence description of at most 140 characters, and 5 to 8 refs in a good listening order.', goal, candidates: candidates.map((c) => c.ref), format: { name: '', description: '', refs: [] } }), { maxTokens: 500 });
    const j = parseJson<{ name?: unknown; description?: unknown; refs?: unknown }>(raw);
    const refs = keepValidRefs(j?.refs, new Set(candidates.map((c) => c.ref))).slice(0, 8);
    const ok = (s: unknown, max: number): s is string => typeof s === 'string' && s.trim().length > 2 && s.length <= max && !breaksBoundaries(s);
    if (refs.length < 3 || !ok(j?.name, 60) || !ok(j?.description, 160)) return fallback();
    return { source: 'ai', label: 'Suggested by AI', name: (j!.name as string).trim(), description: (j!.description as string).trim(), refs };
  } catch { return fallback(); }
}

export async function phraseInsight(ai: AiProvider | null, facts: InsightFacts): Promise<{ text: string; source: 'ai' | 'computed'; label: string }> {
  const computed = { text: insightText(facts), source: 'computed' as const, label: 'Summary of your week' };
  if (!ai || !facts.sessions) return computed;
  try { const p = insightPrompt(facts); const t = cleanInsight(await ai.complete(p.system, p.user, { maxTokens: 200 })); return t ? { text: t, source: 'ai', label: 'AI-written from your activity' } : computed; } catch { return computed; }
}
