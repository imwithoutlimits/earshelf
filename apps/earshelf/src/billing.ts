import { makePlanStore, type SupabaseLike } from '@wells/billing/src/planStore.ts';
import { apiPost, supabase } from './supabase';

/** The person's plan and free trial. Plans are only ever unlocked by Creem's confirmed payment message to the server, never by this app. */
export const planStore = makePlanStore({ supabase: supabase as unknown as SupabaseLike | null, product: 'earshelf' });

/** Asks the server for a Creem payment page for this person and goes there. */
export async function startCheckout(plan: 'plus' | 'pro', interval: 'month' | 'year'): Promise<void> {
  const { url } = await apiPost<{ url: string }>('/v1/billing/checkout', { product: 'earshelf', plan, interval });
  location.assign(url);
}

/** Opens Creem's page where the person can cancel, switch monthly/yearly or change card. */
export async function openBillingPortal(): Promise<void> {
  const { url } = await apiPost<{ url: string }>('/v1/billing/portal', { product: 'earshelf' });
  location.assign(url);
}
