import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePlan, shouldShowTrialEnded, trialBannerText, paidPlanOf } from './trial.ts';
import { PLAN_LIMITS, TRIAL_DAYS, TRIAL_PLAN, hasFeature, higherPlan, DAILY_METRICS } from './plans.ts';

const NOW = new Date('2026-11-21T12:00:00Z');
const trial = (startedDaysAgo: number) => {
  const start = new Date(NOW.getTime() - startedDaysAgo * 86_400_000);
  return { plan: TRIAL_PLAN, startedAt: start.toISOString(), endsAt: new Date(start.getTime() + TRIAL_DAYS * 86_400_000).toISOString() };
};

test('the trial is 7 days of Pro', () => {
  assert.equal(TRIAL_DAYS, 7);
  assert.equal(TRIAL_PLAN, 'pro');
});

test('nobody has a trial row yet: free, trial status none', () => {
  const i = resolvePlan(null, null, NOW);
  assert.deepEqual({ plan: i.plan, source: i.source, status: i.trial.status }, { plan: 'free', source: 'free', status: 'none' });
});

test('during the trial: Pro features, days left counts down and never reads 0 while running', () => {
  const day1 = resolvePlan(null, trial(0), NOW);
  assert.deepEqual({ plan: day1.plan, source: day1.source, left: day1.trial.daysLeft }, { plan: 'pro', source: 'trial', left: 7 });
  assert.equal(resolvePlan(null, trial(3), NOW).trial.daysLeft, 4);
  assert.equal(resolvePlan(null, trial(6.5), NOW).trial.daysLeft, 1);
  assert.equal(trialBannerText(resolvePlan(null, trial(6.5), NOW)), 'Pro trial · 1 day left');
  assert.equal(trialBannerText(resolvePlan(null, trial(0), NOW)), 'Pro trial · 7 days left');
});

test('after the trial, with nothing paid: back to free, and the "trial ended" sheet shows once', () => {
  const i = resolvePlan(null, trial(8), NOW);
  assert.deepEqual({ plan: i.plan, source: i.source, status: i.trial.status }, { plan: 'free', source: 'free', status: 'ended' });
  assert.equal(shouldShowTrialEnded(i, null), true);
  assert.equal(shouldShowTrialEnded(i, i.trial.endsAt), false, 'dismissed once, stays dismissed');
  assert.equal(trialBannerText(i), null);
});

test('exactly at the end the trial is over', () => {
  const t = trial(7);
  assert.equal(resolvePlan(null, t, new Date(t.endsAt)).trial.status, 'ended');
});

test('paying during the trial: Plus buyer keeps Pro until the trial ends, then Plus', () => {
  const plus = { plan: 'plus' as const, active: true, expiresAt: '2027-01-01T00:00:00Z' };
  const during = resolvePlan(plus, trial(2), NOW);
  assert.deepEqual({ plan: during.plan, paid: during.paidPlan, source: during.source }, { plan: 'pro', paid: 'plus', source: 'trial' });
  const after = resolvePlan(plus, trial(9), NOW);
  assert.deepEqual({ plan: after.plan, source: after.source }, { plan: 'plus', source: 'paid' });
  assert.equal(shouldShowTrialEnded(after, null), false, 'no upsell for someone who already pays');
});

test('a Pro buyer is just paid; an expired paid row counts as free', () => {
  assert.equal(resolvePlan({ plan: 'pro', active: true, expiresAt: null }, trial(1), NOW).source, 'paid');
  assert.equal(paidPlanOf({ plan: 'pro', active: true, expiresAt: '2026-01-01T00:00:00Z' }, NOW), 'free');
  assert.equal(paidPlanOf({ plan: 'pro', active: false, expiresAt: null }, NOW), 'free');
});

test('the plan matrix matches what is advertised', () => {
  // Free
  assert.equal(PLAN_LIMITS.free.kokoro_preview_minutes, 20);
  assert.ok(DAILY_METRICS.has('kokoro_preview_minutes'));
  assert.equal(hasFeature('free', 'natural_tts'), false);
  // Plus
  for (const f of ['natural_tts', 'multi_speaker', 'audio_export', 'smart_cleanup', 'tags_search', 'link_sharing', 'translation_compare', 'soundscapes', 'memorize_loops', 'partner_sharing'] as const) assert.equal(hasFeature('plus', f), true, `plus ${f}`);
  assert.equal(PLAN_LIMITS.plus.audio_exports, 5);
  // Pro only
  for (const f of ['podcast_feed', 'library_chat', 'shared_vaults', 'priority_queue', 'quizzes', 'cross_ref_graph', 'interlinear', 'dramatized_audio', 'recall_scheduling', 'family_vaults', 'sermon_generator'] as const) {
    assert.equal(hasFeature('plus', f), false, `plus must not have ${f}`);
    assert.equal(hasFeature('pro', f), true, `pro ${f}`);
  }
  assert.equal(PLAN_LIMITS.pro.audio_exports, -1);
  assert.equal(higherPlan('plus', 'pro'), 'pro');
});
