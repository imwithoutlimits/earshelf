import { DAILY_METRICS, TRIAL_DAYS, TRIAL_PLAN, hasFeature, limitFor, minimumPlanFor, type Feature, type Metric, type Plan } from '../../../packages/billing/src/plans.ts';
import { resolvePlan, type EntitlementRow, type PlanInfo, type TrialRow } from '../../../packages/billing/src/trial.ts';
import { rest } from './supa.ts';

export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}

export type Product = 'earshelf' | 'tapestry';

let warnedNoTrials = false;
async function readTrial(userId: string, product: Product): Promise<TrialRow | null> {
  try {
    const rows = await rest<Array<{ plan: Plan; started_at: string; ends_at: string }>>(`trials?user_id=eq.${userId}&product=eq.${product}&select=plan,started_at,ends_at`);
    const r = rows[0];
    return r ? { plan: r.plan, startedAt: r.started_at, endsAt: r.ends_at } : null;
  } catch (e) {
    // Migration 0006 not run yet: behave exactly as before the trial existed instead of breaking every request.
    if (!warnedNoTrials) { warnedNoTrials = true; console.warn('trials table not readable (run supabase/migrations/0006_trials_and_creem.sql):', e instanceof Error ? e.message : e); }
    return null;
  }
}

/** The server's own trial start, for people who reach the API before the app has asked for it. Safe to repeat: one row per person per app, never restarted. */
export async function ensureTrial(userId: string, product: Product): Promise<TrialRow | null> {
  const existing = await readTrial(userId, product);
  if (existing) return existing;
  const now = new Date();
  const ends = new Date(now.getTime() + TRIAL_DAYS * 86_400_000);
  try {
    await rest('trials?on_conflict=user_id,product', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal', body: { user_id: userId, product, plan: TRIAL_PLAN, started_at: now.toISOString(), ends_at: ends.toISOString() } });
  } catch { return null; }
  return readTrial(userId, product);
}

/** Paid plan plus trial, resolved by the same pure function the apps use. */
export async function getPlanInfo(userId: string, product: Product = 'earshelf', opts: { startTrial?: boolean } = {}): Promise<PlanInfo> {
  const [ents, trial] = await Promise.all([
    rest<Array<{ plan: Plan; active: boolean; expires_at: string | null }>>(`entitlements?user_id=eq.${userId}&product=eq.${product}&select=plan,active,expires_at`),
    opts.startTrial ? ensureTrial(userId, product) : readTrial(userId, product),
  ]);
  const e = ents[0];
  const ent: EntitlementRow | null = e ? { plan: e.plan, active: e.active, expiresAt: e.expires_at } : null;
  return resolvePlan(ent, trial);
}

/** What the person can use right now (a running trial counts). Every feature check goes through this. */
export async function getPlan(userId: string, product: Product = 'earshelf'): Promise<Plan> {
  return (await getPlanInfo(userId, product)).plan;
}

export function requireFeature(plan: Plan, feature: Feature) {
  if (!hasFeature(plan, feature)) throw new HttpError(402, 'upgrade_required', `This needs the ${minimumPlanFor(feature)} plan.`);
}

export async function consume(userId: string, plan: Plan, metric: Metric, amount: number, product: Product = 'earshelf') {
  const limit = limitFor(plan, metric);
  const daily = DAILY_METRICS.has(metric);
  const rows = await rest<Array<{ is_allowed: boolean; total_used: number }>>(daily ? 'rpc/consume_usage_daily' : 'rpc/consume_usage', {
    method: 'POST', body: { p_user: userId, p_product: product, p_metric: metric, p_amount: amount, p_limit: limit },
  });
  const r = rows[0];
  if (!r?.is_allowed) throw new HttpError(429, 'limit_reached', `You have used ${daily ? "today's" : "this month's"} ${metric.replace(/_/g, ' ')} allowance on the ${plan} plan.`);
  return { used: r.total_used, limit };
}
