import { useEffect, useState } from 'react';
import { PlanSheet, TrialBanner, TrialPrompts, type Choose } from './plans.tsx';
import { usePlanInfo, useSignedIn } from '@wells/billing/src/react.tsx';
import type { PlanStore, ProductName } from '@wells/billing/src/planStore.ts';

const bus = new EventTarget();
/** Opens the "Choose a plan" sheet from anywhere in the app (a locked feature, Profile, the trial banner). */
export const openPlans = () => bus.dispatchEvent(new Event('open-plans'));

/**
 * Mount once in the app shell. It owns: the trial countdown bar, the welcome and "trial ended" sheets, the plans sheet,
 * and the moment someone comes back from the payment page (it waits for the confirmed payment, then says so).
 */
export function PlanHost({ product, store, checkout, portal }: {
  product: ProductName;
  store: PlanStore;
  /** Asks the server for a payment page and navigates to it. Throws a readable Error on failure. */
  checkout: (plan: 'plus' | 'pro', interval: 'month' | 'year') => Promise<void>;
  portal: () => Promise<void>;
}) {
  const info = usePlanInfo(store);
  const signedIn = useSignedIn(store);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [thanks, setThanks] = useState<'waiting' | 'done' | 'late' | null>(null);

  useEffect(() => store.start(), [store]);
  useEffect(() => { const f = () => setOpen(true); bus.addEventListener('open-plans', f); return () => bus.removeEventListener('open-plans', f); }, []);
  useEffect(() => {
    // Back from the payment page. The plan is unlocked by Creem's confirmed message to the server, which can lag a few seconds.
    if (new URLSearchParams(location.search).get('checkout') !== 'success') return;
    history.replaceState(null, '', location.pathname);
    setThanks('waiting');
    void store.waitForPaid().then((ok) => setThanks(ok ? 'done' : 'late'));
  }, [store]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong. Try again.'); setBusy(false); }
  };
  const choose: Choose = (plan, interval) => { void run(() => checkout(plan, interval)); };

  return (
    <>
      {thanks && (
        <div className="up-banner up-soft" role="status">
          <span>{thanks === 'waiting' ? 'Thank you! Confirming your payment…' : thanks === 'done' ? 'Thank you! Your plan is ready.' : 'Thank you! Your payment is confirmed on their side. Your plan can take a minute to appear.'}</span>
          {thanks !== 'waiting' && <button type="button" onClick={() => setThanks(null)}>OK</button>}
        </div>
      )}
      <TrialBanner info={info} onSeePlans={() => setOpen(true)} />
      <TrialPrompts product={product} info={info} signedIn={signedIn} onChoose={choose} busy={busy} error={error} />
      {open && <PlanSheet product={product} info={info} onClose={() => { setOpen(false); setError(''); }} onChoose={choose} onManage={() => void run(portal)} busy={busy} error={error} />}
    </>
  );
}
