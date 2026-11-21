import { handleWebhook, type BillingStore, type EventResult, type LsPayload } from '../../../packages/billing/src/lemonsqueezy.ts';
import { createCreemCheckout, createCreemPortalLink, handleCreemWebhook, productIdFor, type AppProduct, type CreemStore, type CreemSubscriptionRecord, type PaidPlan } from '../../../packages/billing/src/creem.ts';
import { planAtLeast, type Interval } from '../../../packages/billing/src/plans.ts';
import { SELLABLE } from '../../../packages/billing/src/pitch.ts';
import { config } from './config.ts';
import { HttpError, getPlanInfo } from './entitlements.ts';
import { rest } from './supa.ts';

// ---------- Creem (current payment provider) ----------
const creemStore: CreemStore = {
  async hasProcessed(eventId) {
    const rows = await rest<unknown[]>(`billing_events?event_id=eq.${encodeURIComponent(eventId)}&select=event_id`);
    return rows.length > 0;
  },
  async upsertSubscription(s) {
    const row = { user_id: s.userId, provider: 'creem', provider_subscription_id: s.providerSubscriptionId, variant_id: s.productId, status: s.status, renews_at: s.periodEnd, ends_at: null as string | null };
    const opts = { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal' };
    try {
      await rest('subscriptions?on_conflict=provider,provider_subscription_id', { ...opts, body: { ...row, customer_id: s.customerId } });
    } catch (e) {
      // customer_id comes from migration 0006. If it has not been run yet, still record the subscription.
      if (!/customer_id/.test(e instanceof Error ? e.message : '')) throw e;
      await rest('subscriptions?on_conflict=provider,provider_subscription_id', { ...opts, body: row });
    }
  },
  async listSubscriptions(userId) {
    let rows: Array<{ provider_subscription_id: string; user_id: string; variant_id: string | null; customer_id?: string | null; status: string; renews_at: string | null }>;
    try {
      rows = await rest(`subscriptions?user_id=eq.${userId}&provider=eq.creem&select=provider_subscription_id,user_id,variant_id,customer_id,status,renews_at`);
    } catch {
      rows = await rest(`subscriptions?user_id=eq.${userId}&provider=eq.creem&select=provider_subscription_id,user_id,variant_id,status,renews_at`);
    }
    return rows.map((r): CreemSubscriptionRecord => ({ providerSubscriptionId: r.provider_subscription_id, userId: r.user_id, productId: r.variant_id ?? '', customerId: r.customer_id ?? null, status: r.status, periodEnd: r.renews_at }));
  },
  async entitlementSource(userId, product) {
    const rows = await rest<Array<{ source: string | null }>>(`entitlements?user_id=eq.${userId}&product=eq.${product}&select=source`);
    return rows.length ? (rows[0].source ?? 'unknown') : null;
  },
  async setEntitlement(userId, product, e) {
    await rest('entitlements?on_conflict=user_id,product', {
      method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
      body: { user_id: userId, product, plan: e.plan, active: e.active, source: 'creem', expires_at: e.expiresAt },
    });
  },
  async record(eventId, eventType, payload) {
    // Recorded last, so a failed save above is retried by Creem instead of being marked as handled.
    await rest('billing_events', { method: 'POST', prefer: 'return=minimal', body: { provider: 'creem', event_id: eventId, event_type: eventType, payload, processed_at: new Date().toISOString() } });
  },
};

export function processCreemWebhook(raw: string, signature: string | undefined) {
  return handleCreemWebhook(raw, signature, { secret: config.creem.webhookSecret, products: config.creem.products }, creemStore);
}

const bad = (m: string) => new HttpError(400, 'bad_request', m);

/** Starts a Creem checkout for the signed-in person. The browser only ever receives a link; it never decides what anyone is granted. */
export async function createCheckout(r: { userId: string; email?: string; body: Record<string, unknown>; origin: string }): Promise<{ url: string }> {
  const product = r.body.product === 'tapestry' ? 'tapestry' : r.body.product === 'earshelf' ? 'earshelf' : null;
  const plan = r.body.plan === 'plus' || r.body.plan === 'pro' ? (r.body.plan as PaidPlan) : null;
  const interval: Interval | null = r.body.interval === 'year' ? 'year' : r.body.interval === 'month' ? 'month' : null;
  if (!product || !plan || !interval) throw bad('Choose an app, a plan and monthly or yearly.');
  if (!SELLABLE[product].includes(plan)) throw new HttpError(409, 'not_available', `The ${plan} plan for ${product} is not on sale yet.`);
  if (!config.creem.apiKey) throw new HttpError(503, 'billing_unavailable', 'Payments are not switched on for this server yet.');
  const productId = productIdFor(config.creem.products, product as AppProduct, plan, interval);
  if (!productId) throw new HttpError(503, 'billing_unavailable', 'That plan is not set up for sale yet.');
  // Send people back only to one of your own sites.
  if (!r.origin || !(config.allowedOrigins.includes('*') || config.allowedOrigins.includes(r.origin))) throw bad('This request did not come from the app.');
  const have = (await getPlanInfo(r.userId, product as AppProduct)).paidPlan;
  if (planAtLeast(have, plan) && have !== 'free') throw new HttpError(409, 'already_subscribed', `You already have the ${have} plan. Use Manage billing to change or cancel it.`);
  try {
    const out = await createCreemCheckout({ apiKey: config.creem.apiKey, testMode: config.creem.testMode, productId, userId: r.userId, product: product as AppProduct, plan, email: r.email, successUrl: `${r.origin}/?checkout=success` });
    return { url: out.url };
  } catch (e) {
    console.error('creem checkout failed', e);
    throw new HttpError(502, 'checkout_failed', 'We could not open the payment page. Try again in a moment.');
  }
}

/** A link to Creem's customer page, where the person can cancel, change card or switch monthly/yearly. */
export async function openPortal(r: { userId: string; body: Record<string, unknown> }): Promise<{ url: string }> {
  if (!config.creem.apiKey) throw new HttpError(503, 'billing_unavailable', 'Payments are not switched on for this server yet.');
  let rows: CreemSubscriptionRecord[] = [];
  try { rows = await creemStore.listSubscriptions(r.userId); } catch { rows = []; }
  const withCustomer = rows.find((s) => s.customerId);
  if (!withCustomer?.customerId) throw new HttpError(404, 'no_subscription', 'We could not find a paid plan for this account.');
  try {
    return { url: await createCreemPortalLink({ apiKey: config.creem.apiKey, testMode: config.creem.testMode, customerId: withCustomer.customerId }) };
  } catch (e) {
    console.error('creem portal failed', e);
    throw new HttpError(502, 'portal_failed', 'We could not open the billing page. Try again in a moment.');
  }
}

// ---------- Lemon Squeezy (wound down; kept so an old webhook does not break) ----------
const store: BillingStore = {
  async hasProcessed(eventId) {
    const rows = await rest<unknown[]>(`billing_events?event_id=eq.${encodeURIComponent(eventId)}&select=event_id`);
    return rows.length > 0;
  },
  async apply(r: EventResult, payload: LsPayload) {
    if (r.subscription) {
      const s = r.subscription;
      await rest('subscriptions?on_conflict=provider,provider_subscription_id', {
        method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
        body: { user_id: s.userId, provider: s.provider, provider_subscription_id: s.providerSubscriptionId, variant_id: s.variantId, status: s.status, renews_at: s.renewsAt, ends_at: s.endsAt },
      });
    }
    if (r.entitlement) {
      const e = r.entitlement;
      await rest('entitlements?on_conflict=user_id,product', {
        method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
        body: { user_id: e.userId, product: e.product, plan: e.plan, active: e.active, source: 'lemonsqueezy', expires_at: e.expiresAt },
      });
    }
    // Recorded last, so a failed apply is retried by Lemon Squeezy instead of being marked as processed.
    await rest('billing_events', { method: 'POST', prefer: 'return=minimal', body: { provider: 'lemonsqueezy', event_id: r.eventId, event_type: r.eventName, payload, processed_at: new Date().toISOString() } });
  },
};

export function processWebhook(raw: string, signature: string | undefined) {
  return handleWebhook(raw, signature, { signingSecret: config.ls.secret, variants: { earshelf: { plus: config.ls.plus, pro: config.ls.pro }, tapestry: { plus: config.ls.tapestryPlus, pro: config.ls.tapestryPro } } }, store);
}
