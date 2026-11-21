import { useState } from 'react';
import { Sheet } from './Sheet.tsx';
import { PITCH, SELLABLE, priceLabel, yearlySaving } from '@wells/billing/src/pitch.ts';
import { TRIAL_DAYS, TRIAL_PLAN, type Interval } from '@wells/billing/src/plans.ts';
import type { ProductName } from '@wells/billing/src/planStore.ts';
import { shouldShowTrialEnded, trialBannerText, type PlanInfo } from '@wells/billing/src/trial.ts';

/**
 * The upgrade screens, shared by earshelf and Tapestry. Structure and words live here; colour, type and spacing come from
 * each app's own stylesheet through the `up-*` classes, so each app keeps its own look.
 */
export type Choose = (plan: 'plus' | 'pro', interval: Interval) => void;

const read = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* blocked storage: the sheet may show again, which is harmless */ } };
const name = (product: ProductName, plan: 'free' | 'plus' | 'pro') => PITCH[product][plan].name;

function PlanPicker({ product, info, onChoose, busy }: { product: ProductName; info: PlanInfo; onChoose: Choose; busy?: boolean }) {
  const [period, setPeriod] = useState<Interval>('year');
  return (
    <div className="up">
      <div className="up-toggle" role="group" aria-label="Billing period">
        <button type="button" aria-pressed={period === 'month'} onClick={() => setPeriod('month')}>Monthly</button>
        <button type="button" aria-pressed={period === 'year'} onClick={() => setPeriod('year')}>Yearly</button>
      </div>
      <div className="up-cards">
        {(['plus', 'pro'] as const).map((plan) => {
          const p = PITCH[product][plan];
          const owned = info.paidPlan === plan;
          const covered = info.paidPlan === 'pro' && plan === 'plus';
          const onSale = SELLABLE[product].includes(plan);
          const onTrial = info.source === 'trial' && info.trial.plan === plan && !owned;
          return (
            <section key={plan} className={`up-card${owned ? ' is-current' : ''}`} aria-label={`${p.name} plan`}>
              <header className="up-card-head">
                <h3>{p.name}</h3>
                {owned && <span className="up-badge">Your plan</span>}
                {onTrial && <span className="up-badge">Your trial</span>}
              </header>
              <p className="up-price"><strong>{priceLabel(plan, period).split('/')[0]}</strong><span>/{period === 'month' ? 'month' : 'year'}</span>{period === 'year' && <em className="up-save">save {yearlySaving(plan)}%</em>}</p>
              <p className="up-tag">{p.tagline}</p>
              <ul className="up-list">
                {p.lines.map((l) => <li key={l.text}>{l.text}{l.soon && <span className="up-soon">Soon</span>}</li>)}
              </ul>
              <button type="button" className={`btn ${plan === 'plus' ? 'primary' : ''}`} disabled={busy || owned || covered || !onSale} onClick={() => onChoose(plan, period)}>
                {owned ? 'Current plan' : covered ? 'Included in Pro' : !onSale ? 'Coming soon' : busy ? 'Opening…' : `Choose ${p.name}`}
              </button>
            </section>
          );
        })}
      </div>
      <p className="up-fine">Payments are handled securely by Creem. Cancel any time from Manage billing. Features marked Soon are on the way and not yet in the app.</p>
    </div>
  );
}

/** The full plans screen: opened from Profile / Settings, the trial banner, and locked features. */
export function PlanSheet({ product, info, onClose, onChoose, onManage, busy, error }: { product: ProductName; info: PlanInfo; onClose: () => void; onChoose: Choose; onManage?: () => void; busy?: boolean; error?: string }) {
  return (
    <Sheet label="Choose a plan" onClose={onClose} className="up-sheet">
      <div className="up-head"><h2>Choose a plan</h2><button type="button" className="btn" onClick={onClose}>Close</button></div>
      {error && <p role="alert" className="up-error">{error}</p>}
      <PlanPicker product={product} info={info} onChoose={onChoose} busy={busy} />
      {info.paidPlan !== 'free' && onManage && <button type="button" className="btn" onClick={onManage}>Manage billing</button>}
    </Sheet>
  );
}

/** A slim bar for the last days of a trial. Quiet before that. */
export function TrialBanner({ info, onSeePlans }: { info: PlanInfo; onSeePlans: () => void }) {
  const text = trialBannerText(info, (p) => name('earshelf', p));
  if (!text || info.trial.daysLeft > 3) return null;
  return <div className="up-banner" role="status"><span>{text}</span><button type="button" onClick={onSeePlans}>See plans</button></div>;
}

/** Drop this into the app shell once. It shows the welcome sheet when a trial begins and the "trial ended" sheet once when it is over. */
export function TrialPrompts({ product, info, signedIn, onChoose, busy, error }: { product: ProductName; info: PlanInfo; signedIn: boolean; onChoose: Choose; busy?: boolean; error?: string }) {
  const [, bump] = useState(0);
  if (!signedIn) return null;
  const wKey = `wells:trial-welcome:${product}`, eKey = `wells:trial-ended:${product}`;
  const dismiss = (k: string, v: string) => { write(k, v); bump((n) => n + 1); };
  if (shouldShowTrialEnded(info, read(eKey))) {
    const was = name(product, info.trial.plan);
    return (
      <Sheet label={`Your ${was} trial has ended`} onClose={() => dismiss(eKey, info.trial.endsAt!)} className="up-sheet">
        <div className="up-head"><h2>Your {was} trial has ended</h2></div>
        <p className="up-lead">You are on the Free plan now. Everything you saved is still here. Pick a plan to keep the extras, or carry on for free.</p>
        {error && <p role="alert" className="up-error">{error}</p>}
        <PlanPicker product={product} info={info} onChoose={onChoose} busy={busy} />
        <button type="button" className="btn up-free" onClick={() => dismiss(eKey, info.trial.endsAt!)}>Continue with Free</button>
      </Sheet>
    );
  }
  if (info.source === 'trial' && read(wKey) !== info.trial.endsAt) {
    const plan = name(product, info.trial.plan), d = info.trial.daysLeft;
    const highlights = PITCH[product][info.trial.plan].lines.filter((l) => !l.soon && !/^Everything in/.test(l.text)).slice(0, 4);
    return (
      <Sheet label={`Welcome to ${plan}`} onClose={() => dismiss(wKey, info.trial.endsAt!)} className="up-sheet">
        <div className="up-head"><h2>{d} {d === 1 ? 'day' : 'days'} of {plan}, on us</h2></div>
        <p className="up-lead">Everything in {plan} is unlocked while you try it. No card needed. After that you move to the Free plan unless you choose to keep {plan}.</p>
        <ul className="up-list">{highlights.map((l) => <li key={l.text}>{l.text}</li>)}</ul>
        <button type="button" className="btn primary" onClick={() => dismiss(wKey, info.trial.endsAt!)}>Start exploring</button>
      </Sheet>
    );
  }
  return null;
}

/** The plan card for Profile / Settings. */
export function PlanSummary({ product, info, signedIn, onSeePlans, onManage, onSignIn }: { product: ProductName; info: PlanInfo; signedIn: boolean; onSeePlans: () => void; onManage?: () => void; onSignIn?: () => void }) {
  const label = name(product, info.plan);
  let line: string;
  if (!signedIn) line = `Sign in to start your free ${TRIAL_DAYS}-day ${name(product, TRIAL_PLAN)} trial. No card needed.`;
  else if (info.source === 'trial') line = `${name(product, info.trial.plan)} trial: ${info.trial.daysLeft} ${info.trial.daysLeft === 1 ? 'day' : 'days'} left. After that you move to Free unless you choose a plan.`;
  else if (info.source === 'paid') line = `You are on ${label}. Thank you for supporting ${product === 'tapestry' ? 'Tapestry' : 'earshelf'}.`;
  else if (info.trial.status === 'ended') line = `Your ${name(product, info.trial.plan)} trial has ended. You are on Free; you can upgrade any time.`;
  else line = 'You are on Free. Upgrade any time.';
  return (
    <div className="up-summary">
      <p className="up-summary-plan"><span>Plan</span><strong>{signedIn ? label : 'Free'}</strong></p>
      <p className="up-lead">{line}</p>
      <div className="up-actions">
        {!signedIn && onSignIn && <button type="button" className="btn primary" onClick={onSignIn}>Sign in to start the trial</button>}
        {signedIn && info.paidPlan !== 'pro' && <button type="button" className="btn primary" onClick={onSeePlans}>{info.paidPlan === 'plus' ? 'Upgrade to Pro' : 'See plans'}</button>}
        {signedIn && info.paidPlan !== 'free' && onManage && <button type="button" className="btn" onClick={onManage}>Manage billing</button>}
      </div>
    </div>
  );
}
