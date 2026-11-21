export type Plan = 'free' | 'plus' | 'pro';
export type Metric =
  | 'documents' | 'server_tts_minutes' | 'ocr_pages' | 'ai_requests' | 'offline_items' | 'wells'
  // added with the Plus/Pro price change
  | 'kokoro_preview_minutes' | 'audio_exports';

export type Feature =
  | 'ocr' | 'natural_tts' | 'offline_audio' | 'summaries' | 'notes_highlights' | 'sync'
  | 'pronunciation' | 'semantic_search' | 'ask_document' | 'quizzes' | 'cross_document_search'
  | 'audio_export' | 'multi_speaker' | 'batch_processing' | 'table_figure_explain'
  // earshelf, added with the Plus/Pro price change
  | 'smart_cleanup' | 'tags_search' | 'link_sharing' | 'priority_queue' | 'podcast_feed' | 'library_chat' | 'shared_vaults'
  // tapestry
  | 'ai_search' | 'recommendations' | 'ai_well' | 'audio_downloads' | 'reflection_ai' | 'memorize_paths' | 'scheduled_listening' | 'custom_playlists' | 'group_wells' | 'guided_paths_adv' | 'more_translations'
  // tapestry, added with the Plus/Pro price change
  | 'translation_compare' | 'soundscapes' | 'memorize_loops' | 'partner_sharing'
  | 'cross_ref_graph' | 'interlinear' | 'dramatized_audio' | 'recall_scheduling' | 'family_vaults' | 'sermon_generator';

/** The free trial. Everyone gets TRIAL_PLAN for TRIAL_DAYS, once per app, then drops to free unless they pay.
 *  To trial Plus instead of Pro, change TRIAL_PLAN here AND the plan in the SQL function start_trial (migration 0006). */
export const TRIAL_DAYS = 7;
export const TRIAL_PLAN: Plan = 'pro';

const TAPESTRY_PLUS: Feature[] = ['ai_search', 'recommendations', 'ai_well', 'audio_downloads', 'reflection_ai', 'memorize_paths', 'scheduled_listening', 'custom_playlists', 'translation_compare', 'soundscapes', 'memorize_loops', 'partner_sharing'];
const TAPESTRY_PRO: Feature[] = ['group_wells', 'guided_paths_adv', 'more_translations', 'cross_ref_graph', 'interlinear', 'dramatized_audio', 'recall_scheduling', 'family_vaults', 'sermon_generator'];
const EARSHELF_PLUS: Feature[] = ['audio_export', 'multi_speaker', 'smart_cleanup', 'tags_search', 'link_sharing'];
const EARSHELF_PRO: Feature[] = ['priority_queue', 'podcast_feed', 'library_chat', 'shared_vaults'];
const PLUS: Feature[] = ['ocr', 'natural_tts', 'offline_audio', 'summaries', 'notes_highlights', 'sync', 'pronunciation', 'semantic_search', ...EARSHELF_PLUS, ...TAPESTRY_PLUS];
const PRO: Feature[] = [...PLUS, 'ask_document', 'quizzes', 'cross_document_search', 'batch_processing', 'table_figure_explain', ...EARSHELF_PRO, ...TAPESTRY_PRO];

export const PLAN_FEATURES: Record<Plan, ReadonlySet<Feature>> = {
  free: new Set<Feature>(),
  plus: new Set(PLUS),
  pro: new Set(PRO),
};

/** -1 means unlimited. Monthly counters except documents/offline_items (totals) and the daily ones in DAILY_METRICS.
 *  "Unlimited" voice on Plus and Pro is a fair-use monthly allowance (server_tts_minutes) so one heavy listener cannot cost more than they pay. */
export const PLAN_LIMITS: Record<Plan, Record<Metric, number>> = {
  free: { documents: 5, server_tts_minutes: 0, ocr_pages: 0, ai_requests: 5, offline_items: 2, wells: 3, kokoro_preview_minutes: 20, audio_exports: 0 },
  plus: { documents: 100, server_tts_minutes: 600, ocr_pages: 300, ai_requests: 100, offline_items: 50, wells: -1, kokoro_preview_minutes: -1, audio_exports: 5 },
  pro: { documents: 1000, server_tts_minutes: 3000, ocr_pages: 2000, ai_requests: 1000, offline_items: -1, wells: -1, kokoro_preview_minutes: -1, audio_exports: -1 },
};

/** Counters that reset every day instead of every month. */
export const DAILY_METRICS: ReadonlySet<Metric> = new Set<Metric>(['kokoro_preview_minutes']);

export function hasFeature(plan: Plan, feature: Feature): boolean {
  return PLAN_FEATURES[plan].has(feature);
}

export function limitFor(plan: Plan, metric: Metric): number {
  return PLAN_LIMITS[plan][metric];
}

export interface UsageCheck {
  allowed: boolean;
  remaining: number; // Infinity when unlimited
  limit: number;
}

export function checkUsage(plan: Plan, metric: Metric, used: number, requested = 1): UsageCheck {
  const limit = limitFor(plan, metric);
  if (limit < 0) return { allowed: true, remaining: Infinity, limit };
  const remaining = Math.max(0, limit - used);
  return { allowed: requested <= remaining, remaining, limit };
}

const RANK: Record<Plan, number> = { free: 0, plus: 1, pro: 2 };
export function minimumPlanFor(feature: Feature): Plan {
  return (['plus', 'pro'] as const).find((p) => PLAN_FEATURES[p].has(feature)) ?? 'pro';
}
export function planAtLeast(plan: Plan, min: Plan): boolean {
  return RANK[plan] >= RANK[min];
}
export function higherPlan(a: Plan, b: Plan): Plan {
  return RANK[a] >= RANK[b] ? a : b;
}

/** Prices shown in the apps. The real charge is whatever the Creem product says, so keep these in step with it. */
export const PRICES = {
  plus: { month: 9.99, year: 89 },
  pro: { month: 19.99, year: 169 },
} as const;
export type Interval = 'month' | 'year';
