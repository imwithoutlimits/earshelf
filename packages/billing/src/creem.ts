import { createHmac, timingSafeEqual } from 'node:crypto';
import { higherPlan, type Interval, type Plan } from './plans.ts';

/**
 * Creem (creem.io) is the payment provider (Merchant of Record). Server-only: this file uses node:crypto.
 * Verified against docs.creem.io: header `creem-signature` = hex HMAC-SHA256 of the raw body; events carry
 * { id, eventType, created_at, object }; checkouts are created with POST /v1/checkouts and the x-api-key header.
 * A plan is only ever granted from a webhook whose signature checks out. The browser never grants anything.
 */
export type AppProduct = 'earshelf' | 'tapestry';
export type PaidPlan = 'plus' | 'pro';
export interface CreemProduct { product: AppProduct; plan: PaidPlan; interval: Interval }
export type CreemProductMap = Record<string, CreemProduct>;

/** The eight products created in the Creem dashboard. Product ids are public identifiers (they appear in payment links), not secrets.
 *  Test-mode products have different ids: override any of them with the CREEM_PRODUCT_* variables (see creemProductMap). */
export const DEFAULT_CREEM_PRODUCTS: CreemProductMap = {
  prod_4Az9oj6mf0bh6ljF7uTqV1: { product: 'earshelf', plan: 'plus', interval: 'month' },
  prod_5ITtJfjYJL7IGitCzfmHqp: { product: 'earshelf', plan: 'plus', interval: 'year' },
  prod_56oRqdxkVKBwXd53C4GP3I: { product: 'earshelf', plan: 'pro', interval: 'month' },
  prod_2qSR42lVKSrnkWMrCoIKEd: { product: 'earshelf', plan: 'pro', interval: 'year' },
  prod_2TMOG8sySQw8VaXgL8Rc4c: { product: 'tapestry', plan: 'plus', interval: 'month' },
  prod_5J1Nfc3iYoqLtW6tne9nVH: { product: 'tapestry', plan: 'plus', interval: 'year' },
  prod_5RWpQEiutwVl741SZYlUyn: { product: 'tapestry', plan: 'pro', interval: 'month' },
  prod_hjaDZXtiqEKo0Z6KfNgIV: { product: 'tapestry', plan: 'pro', interval: 'year' },
};

const SLOTS: Array<{ env: string; spec: CreemProduct }> = (['earshelf', 'tapestry'] as const).flatMap((product) =>
  (['plus', 'pro'] as const).flatMap((plan) => (['month', 'year'] as const).map((interval) => ({ env: `CREEM_PRODUCT_${product}_${plan}_${interval}`.toUpperCase(), spec: { product, plan, interval } }))));

/** Defaults, with any CREEM_PRODUCT_<APP>_<PLAN>_<MONTH|YEAR> variable replacing that slot's product id (for test mode). */
export function creemProductMap(env: Record<string, string | undefined> = {}): CreemProductMap {
  const map: CreemProductMap = { ...DEFAULT_CREEM_PRODUCTS };
  for (const { env: key, spec } of SLOTS) {
    const id = (env[key] ?? '').trim();
    if (!id) continue;
    for (const [pid, s] of Object.entries(map)) if (s.product === spec.product && s.plan === spec.plan && s.interval === spec.interval) delete map[pid];
    map[id] = spec;
  }
  return map;
}

export function productIdFor(map: CreemProductMap, product: AppProduct, plan: PaidPlan, interval: Interval): string | null {
  return Object.entries(map).find(([, s]) => s.product === product && s.plan === plan && s.interval === interval)?.[0] ?? null;
}

/** Hex HMAC-SHA256 of the exact bytes received. Compared in constant time. */
export function verifyCreemSignature(rawBody: string | Uint8Array, header: string | undefined | null, secret: string): boolean {
  if (!secret || typeof header !== 'string') return false;
  const given = header.trim();
  if (!/^[0-9a-f]{64}$/i.test(given)) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  return timingSafeEqual(Buffer.from(given, 'hex'), expected);
}

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {});
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const idOf = (v: unknown): string => (typeof v === 'string' ? v : str(rec(v).id));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CreemEvent { id: string; eventType: string; created_at?: number; object: Rec }

export interface CreemSubscriptionRecord {
  providerSubscriptionId: string;
  userId: string;
  productId: string;
  customerId: string | null;
  /** Creem's status, or 'refunded' / 'disputed' when money was returned. */
  status: string;
  periodEnd: string | null;
}

export interface CreemDecision {
  eventName: string;
  ignored?: string;
  subscription?: CreemSubscriptionRecord;
  product?: AppProduct;
}

const SUB_EVENTS = new Set([
  'subscription.active', 'subscription.paid', 'subscription.trialing', 'subscription.update', 'subscription.canceled',
  'subscription.scheduled_cancel', 'subscription.past_due', 'subscription.unpaid', 'subscription.expired', 'subscription.paused',
]);
export const CREEM_HANDLED_EVENTS = ['checkout.completed', 'refund.created', 'dispute.created', ...SUB_EVENTS] as const;

/** Reads the person from the metadata our own checkout attached. Never trusts an email or a name. */
function userIdFrom(...sources: unknown[]): string {
  for (const s of sources) {
    const u = str(rec(rec(s).metadata).user_id);
    if (UUID.test(u)) return u.toLowerCase();
  }
  return '';
}

/** Pure decision: event in, what to store out. The caller persists it. */
export function decideCreem(evt: CreemEvent, products: CreemProductMap): CreemDecision {
  const eventName = evt.eventType;
  if (!(CREEM_HANDLED_EVENTS as readonly string[]).includes(eventName)) return { eventName, ignored: 'unhandled event' };
  const o = rec(evt.object);

  let sub: Rec; let productId: string; let customerId: string; let userId: string; let status: string;
  if (eventName === 'checkout.completed') {
    sub = rec(o.subscription);
    if (!str(sub.id)) return { eventName, ignored: 'one-time purchase: only subscriptions grant a plan' };
    productId = idOf(o.product) || idOf(sub.product);
    customerId = idOf(o.customer) || idOf(sub.customer);
    userId = userIdFrom(o, sub);
    status = str(sub.status) || 'active';
  } else if (eventName === 'refund.created' || eventName === 'dispute.created') {
    sub = rec(o.subscription);
    if (!str(sub.id)) return { eventName, ignored: 'refund or dispute without a subscription' };
    productId = idOf(sub.product) || idOf(rec(o.checkout).product) || idOf(rec(o.order).product);
    customerId = idOf(sub.customer) || idOf(o.customer);
    userId = userIdFrom(sub, o.checkout, o);
    status = eventName === 'refund.created' ? 'refunded' : 'disputed';
  } else {
    sub = o;
    if (!str(sub.id)) return { eventName, ignored: 'subscription event without an id' };
    productId = idOf(sub.product);
    customerId = idOf(sub.customer);
    userId = userIdFrom(sub);
    status = str(sub.status) || 'active';
  }

  const spec = products[productId];
  if (!spec) return { eventName, ignored: `unknown product ${productId || '(none)'}` };
  if (!userId) return { eventName, ignored: 'missing or invalid user_id in checkout metadata' };

  return {
    eventName,
    product: spec.product,
    subscription: { providerSubscriptionId: str(sub.id), userId, productId, customerId: customerId || null, status, periodEnd: str(sub.current_period_end_date) || null },
  };
}

export const GRACE_DAYS = 3;
const DAY = 86_400_000;

/** Does this one subscription give access right now, and until when? A paid renewal that is a few days late does not cut someone off. */
export function accessFor(r: Pick<CreemSubscriptionRecord, 'status' | 'periodEnd'>, now = new Date(), graceDays = GRACE_DAYS): { active: boolean; until: string | null } {
  const end = r.periodEnd ? new Date(r.periodEnd).getTime() : NaN;
  switch (r.status) {
    case 'active': case 'trialing': case 'scheduled_cancel': case 'past_due': {
      if (Number.isNaN(end)) return { active: true, until: null };
      const until = end + graceDays * DAY;
      return { active: until > now.getTime(), until: new Date(until).toISOString() };
    }
    case 'canceled': // cancelled people keep what they paid for until the period ends
      return Number.isNaN(end) ? { active: false, until: null } : { active: end > now.getTime(), until: new Date(end).toISOString() };
    default: // expired, unpaid, paused, refunded, disputed, anything unknown
      return { active: false, until: null };
  }
}

export interface EntitlementResult { plan: Plan; active: boolean; expiresAt: string | null }

/**
 * The best plan across ALL of one person's subscriptions for one app. Computed from the full set every time, so the
 * order the webhooks arrive in cannot matter: an old Plus that is cancelled after Pro was bought never removes Pro.
 */
export function bestEntitlement(subs: CreemSubscriptionRecord[], products: CreemProductMap, product: AppProduct, now = new Date()): EntitlementResult {
  let plan: Plan = 'free';
  let expiresAt: string | null = null;
  let any = false;
  for (const s of subs) {
    const spec = products[s.productId];
    if (!spec || spec.product !== product) continue;
    const a = accessFor(s, now);
    if (!a.active) continue;
    const better = !any || higherPlan(spec.plan, plan) !== plan || (spec.plan === plan && (a.until === null || (expiresAt !== null && a.until > expiresAt)));
    if (better) { plan = spec.plan; expiresAt = a.until; any = true; }
  }
  return { plan, active: any, expiresAt };
}

export interface CreemStore {
  hasProcessed(eventId: string): Promise<boolean>;
  upsertSubscription(s: CreemSubscriptionRecord): Promise<void>;
  /** Every Creem subscription this person has, any status. */
  listSubscriptions(userId: string): Promise<CreemSubscriptionRecord[]>;
  /** Where the current plan row came from: 'creem', 'lemonsqueezy', 'manual' (set by the owner) or null if none. */
  entitlementSource(userId: string, product: AppProduct): Promise<string | null>;
  setEntitlement(userId: string, product: AppProduct, e: EntitlementResult): Promise<void>;
  record(eventId: string, eventType: string, payload: unknown): Promise<void>;
}

export interface CreemResult { eventId: string; eventName: string; duplicate: boolean; ignored?: string; entitlement?: EntitlementResult & { userId: string; product: AppProduct } }
export type CreemOutcome = { status: 401; error: string } | { status: 400; error: string } | { status: 200; result: CreemResult };

/** Whole webhook flow: verify signature, parse, skip repeats, decide, store. The event is recorded last so a failed save is retried by Creem. */
export async function handleCreemWebhook(
  rawBody: string,
  signature: string | undefined,
  env: { secret: string; products: CreemProductMap },
  store: CreemStore,
  now = new Date(),
): Promise<CreemOutcome> {
  if (!verifyCreemSignature(rawBody, signature, env.secret)) return { status: 401, error: 'invalid signature' };
  let evt: CreemEvent;
  try {
    const p = JSON.parse(rawBody) as Rec;
    if (typeof p.id !== 'string' || typeof p.eventType !== 'string' || !p.object || typeof p.object !== 'object') throw new Error('shape');
    evt = p as unknown as CreemEvent;
  } catch {
    return { status: 400, error: 'malformed payload' };
  }
  if (await store.hasProcessed(evt.id)) return { status: 200, result: { eventId: evt.id, eventName: evt.eventType, duplicate: true } };

  const d = decideCreem(evt, env.products);
  const result: CreemResult = { eventId: evt.id, eventName: d.eventName, duplicate: false, ignored: d.ignored };
  if (d.subscription && d.product) {
    await store.upsertSubscription(d.subscription);
    const best = bestEntitlement(await store.listSubscriptions(d.subscription.userId), env.products, d.product, now);
    const source = await store.entitlementSource(d.subscription.userId, d.product);
    // Never overwrite a plan the owner granted by hand, or one from the old provider, just because a Creem subscription ended.
    if (best.active || source === 'creem' || source === null) {
      await store.setEntitlement(d.subscription.userId, d.product, best);
      result.entitlement = { ...best, userId: d.subscription.userId, product: d.product };
    }
  }
  await store.record(evt.id, evt.eventType, evt);
  return { status: 200, result };
}

// ---- Calls to the Creem API (secret key, server only) ----
export const creemBase = (testMode: boolean) => (testMode ? 'https://test-api.creem.io' : 'https://api.creem.io');

export interface CheckoutRequest {
  apiKey: string; testMode: boolean; productId: string; userId: string; product: AppProduct; plan: PaidPlan;
  email?: string; successUrl: string; fetchImpl?: typeof fetch;
}

/** Creates a checkout that carries who is buying in its metadata. The webhook reads it back; that is the only link between a payment and an account. */
export async function createCreemCheckout(r: CheckoutRequest): Promise<{ id: string; url: string }> {
  const f = r.fetchImpl ?? fetch;
  const res = await f(`${creemBase(r.testMode)}/v1/checkouts`, {
    method: 'POST',
    headers: { 'x-api-key': r.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      product_id: r.productId,
      request_id: `${r.product}:${r.plan}:${r.userId}:${Date.now()}`,
      success_url: r.successUrl,
      ...(r.email ? { customer: { email: r.email } } : {}),
      metadata: { user_id: r.userId, product: r.product, plan: r.plan },
    }),
  });
  const data = (await res.json().catch(() => ({}))) as Rec;
  const url = str(data.checkout_url);
  if (!res.ok || !url) throw new Error(`Creem could not start the checkout (${res.status}). ${str(data.message) || str(data.error)}`.trim());
  return { id: str(data.id), url };
}

/** A link where the customer manages or cancels their subscription. */
export async function createCreemPortalLink(r: { apiKey: string; testMode: boolean; customerId: string; fetchImpl?: typeof fetch }): Promise<string> {
  const f = r.fetchImpl ?? fetch;
  const res = await f(`${creemBase(r.testMode)}/v1/customers/billing`, {
    method: 'POST',
    headers: { 'x-api-key': r.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ customer_id: r.customerId }),
  });
  const data = (await res.json().catch(() => ({}))) as Rec;
  const link = str(data.customer_portal_link);
  if (!res.ok || !link) throw new Error(`Creem could not open the billing page (${res.status}).`);
  return link;
}
