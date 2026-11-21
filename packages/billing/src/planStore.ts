import { resolvePlan, type EntitlementRow, type PlanInfo, type TrialRow } from './trial.ts';

/**
 * One small store per app that knows the person's plan and trial. Browser-safe (no Node imports, no React).
 * It reads the person's own plan rows straight from Supabase (row level security shows people only their own),
 * asks the database to start the trial once, and keeps a saved copy on the device so the app still knows the plan offline.
 * It never grants anything: the plan only ever comes from rows the verified payment webhook or the trial function wrote.
 */
export type ProductName = 'earshelf' | 'tapestry';
export interface SupabaseLike {
  auth: {
    getSession(): Promise<{ data: { session: { user: { id: string } } | null } }>;
    onAuthStateChange(cb: (event: string, session: { user: { id: string } } | null) => void): { data: { subscription: { unsubscribe(): void } } };
  };
  from(table: string): any; // eslint-disable-line @typescript-eslint/no-explicit-any
  rpc(fn: string, args?: Record<string, unknown>): any; // eslint-disable-line @typescript-eslint/no-explicit-any
}
export interface KeyValue { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

const same = (a: PlanInfo, b: PlanInfo) => a.plan === b.plan && a.source === b.source && a.paidPlan === b.paidPlan && a.trial.status === b.trial.status && a.trial.daysLeft === b.trial.daysLeft && a.trial.endsAt === b.trial.endsAt;

interface Raw { uid: string; ent: EntitlementRow | null; trial: TrialRow | null }

export interface PlanStore {
  get(): PlanInfo;
  /** The signed-in person's id, or '' when signed out / on this device only. */
  uid(): string;
  subscribe(fn: () => void): () => void;
  refresh(): Promise<void>;
  /** After a payment page: look every few seconds until the webhook has unlocked the plan, or give up. Resolves true if it did. */
  waitForPaid(opts?: { everyMs?: number; maxMs?: number }): Promise<boolean>;
  start(): () => void;
}

export function makePlanStore(opts: { supabase: SupabaseLike | null; product: ProductName; storage?: KeyValue | null; now?: () => Date }): PlanStore {
  const { supabase, product } = opts;
  const storage: KeyValue | null = opts.storage === undefined ? (typeof localStorage !== 'undefined' ? localStorage : null) : opts.storage;
  const now = opts.now ?? (() => new Date());
  const KEY = `wells:plan:${product}`;
  const listeners = new Set<() => void>();
  let raw: Raw = { uid: '', ent: null, trial: null };
  let snapshot: PlanInfo = resolvePlan(null, null, now());
  let snapshotAt = 0;

  try { const saved = storage?.getItem(KEY); if (saved) raw = JSON.parse(saved) as Raw; } catch { /* a damaged saved copy is just ignored */ }

  const emit = () => { snapshotAt = 0; listeners.forEach((f) => f()); };
  const save = () => { try { storage?.setItem(KEY, JSON.stringify(raw)); } catch { /* storage full or blocked */ } };

  async function refresh() {
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id ?? '';
    if (!uid) { if (raw.uid) { raw = { uid: '', ent: null, trial: null }; try { storage?.removeItem(KEY); } catch { /* ignore */ } emit(); } return; }
    // Start the one trial (a no-op if it already started). If migration 0006 has not been run yet this fails quietly and there is simply no trial.
    try { await supabase.rpc('start_trial', { p_product: product }); } catch { /* ignore */ }
    const [e, t] = await Promise.all([
      supabase.from('entitlements').select('plan,active,expires_at').eq('user_id', uid).eq('product', product).maybeSingle(),
      supabase.from('trials').select('plan,started_at,ends_at').eq('user_id', uid).eq('product', product).maybeSingle(),
    ]);
    // A failed read keeps what we already know (offline, server hiccup). Only a successful read replaces it.
    const ent: EntitlementRow | null = e?.error ? (raw.uid === uid ? raw.ent : null) : e?.data ? { plan: e.data.plan, active: e.data.active, expiresAt: e.data.expires_at } : null;
    const trial: TrialRow | null = t?.error ? (raw.uid === uid ? raw.trial : null) : t?.data ? { plan: t.data.plan, startedAt: t.data.started_at, endsAt: t.data.ends_at } : null;
    raw = { uid, ent, trial };
    save();
    emit();
  }

  const store: PlanStore = {
    get() {
      // Recomputed against the clock at most once a second, so a trial that runs out while the app is open is noticed without a reload.
      const t = Date.now();
      if (t - snapshotAt > 1000) {
        const next = resolvePlan(raw.ent, raw.trial, now());
        // Keep the very same object while nothing visible changed, so React does not re-render for nothing.
        if (!same(snapshot, next)) snapshot = next;
        snapshotAt = t;
      }
      return snapshot;
    },
    uid: () => raw.uid,
    subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    refresh,
    async waitForPaid({ everyMs = 3000, maxMs = 60_000 } = {}) {
      const stop = Date.now() + maxMs;
      const before = store.get().paidPlan;
      while (Date.now() < stop) {
        await refresh().catch(() => {});
        const p = store.get().paidPlan;
        if (p !== 'free' && p !== before) return true;
        if (p !== 'free' && before === 'free') return true;
        await new Promise((r) => setTimeout(r, everyMs));
      }
      return false;
    },
    start() {
      if (!supabase) return () => {};
      void refresh().catch(() => {});
      const { data } = supabase.auth.onAuthStateChange(() => { void refresh().catch(() => {}); });
      const again = () => { if (typeof document === 'undefined' || document.visibilityState === 'visible') void refresh().catch(() => {}); };
      if (typeof window !== 'undefined') { window.addEventListener('online', again); window.addEventListener('focus', again); }
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', again);
      const timer = setInterval(again, 5 * 60_000);
      const tick = setInterval(() => emit(), 60_000); // let the day counter and the end of a trial show up
      return () => {
        data.subscription.unsubscribe(); clearInterval(timer); clearInterval(tick);
        if (typeof window !== 'undefined') { window.removeEventListener('online', again); window.removeEventListener('focus', again); }
        if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', again);
      };
    },
  };
  return store;
}
