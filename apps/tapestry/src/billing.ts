import { makePlanStore, type SupabaseLike } from '@wells/billing/src/planStore.ts';
import { usePlanInfo } from '@wells/billing/src/react.tsx';
import type { Plan } from '@wells/billing/src/plans.ts';
import { api, supabase } from './api';

/** The person's Tapestry plan and free trial. Plans are only ever unlocked by Creem's confirmed payment message to the server, never by this app. */
export const planStore = makePlanStore({ supabase: supabase as unknown as SupabaseLike | null, product: 'tapestry' });
export const usePlan = (): Plan => usePlanInfo(planStore).plan;
export const usePlanDetails = () => usePlanInfo(planStore);

/** Asks the server for a Creem payment page for this person and goes there. */
export async function startCheckout(plan: 'plus' | 'pro', interval: 'month' | 'year'): Promise<void> {
  const { url } = await api.apiPost<{ url: string }>('/v1/billing/checkout', { product: 'tapestry', plan, interval });
  location.assign(url);
}

/** Opens Creem's page where the person can cancel, switch monthly/yearly or change card. */
export async function openBillingPortal(): Promise<void> {
  const { url } = await api.apiPost<{ url: string }>('/v1/billing/portal', { product: 'tapestry' });
  location.assign(url);
}
