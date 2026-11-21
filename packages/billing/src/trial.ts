import { TRIAL_PLAN, higherPlan, type Plan } from './plans.ts';

/** Browser-safe (no Node imports): the apps and the server share this one decision. */
export interface EntitlementRow { plan: Plan; active: boolean; expiresAt: string | null }
export interface TrialRow { plan: Plan; startedAt: string; endsAt: string }
export type PlanSource = 'paid' | 'trial' | 'free';
export type TrialStatus = 'none' | 'active' | 'ended';

export interface PlanInfo {
  /** What the person can use right now. */
  plan: Plan;
  source: PlanSource;
  /** What they pay for (free if nothing). */
  paidPlan: Plan;
  trial: { status: TrialStatus; plan: Plan; startedAt: string | null; endsAt: string | null; daysLeft: number };
}

const DAY = 86_400_000;

export function paidPlanOf(ent: EntitlementRow | null | undefined, now = new Date()): Plan {
  if (!ent || !ent.active) return 'free';
  if (ent.expiresAt && new Date(ent.expiresAt) < now) return 'free';
  return ent.plan;
}

/** Paid access and the trial combine: during a Pro trial a new Plus buyer keeps Pro until the trial ends. */
export function resolvePlan(ent: EntitlementRow | null | undefined, trial: TrialRow | null | undefined, now = new Date()): PlanInfo {
  const paidPlan = paidPlanOf(ent, now);
  let status: TrialStatus = 'none';
  let daysLeft = 0;
  if (trial) {
    const ends = new Date(trial.endsAt).getTime();
    if (ends > now.getTime()) { status = 'active'; daysLeft = Math.max(1, Math.ceil((ends - now.getTime()) / DAY)); }
    else status = 'ended';
  }
  const trialPlan = trial?.plan ?? TRIAL_PLAN;
  const effective = status === 'active' ? higherPlan(paidPlan, trialPlan) : paidPlan;
  const source: PlanSource = effective === 'free' ? 'free' : status === 'active' && effective !== paidPlan ? 'trial' : 'paid';
  return { plan: effective, source, paidPlan, trial: { status, plan: trialPlan, startedAt: trial?.startedAt ?? null, endsAt: trial?.endsAt ?? null, daysLeft } };
}

/** Show the "your trial ended" sheet once: trial over, nothing paid, and not dismissed yet. */
export function shouldShowTrialEnded(info: PlanInfo, acknowledgedEndsAt: string | null): boolean {
  return info.source === 'free' && info.trial.status === 'ended' && !!info.trial.endsAt && acknowledgedEndsAt !== info.trial.endsAt;
}

/** Show the small countdown banner on the last days of a running trial (always on the last 3 days, or whenever asked). */
export function trialBannerText(info: PlanInfo, planLabel: (p: Plan) => string = (p) => p[0].toUpperCase() + p.slice(1)): string | null {
  if (info.source !== 'trial') return null;
  const d = info.trial.daysLeft;
  return `${planLabel(info.trial.plan)} trial · ${d} ${d === 1 ? 'day' : 'days'} left`;
}
