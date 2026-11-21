-- 0006: 7-day free trial, daily usage counter, Creem customer id.
-- The owner runs this file BY HAND in the Supabase SQL Editor (nothing runs it automatically). Safe to run twice.

-- 1) The free trial. One row per person per app, created once, never restarted.
--    People can READ their own row. Nobody can write it directly: only start_trial() below (with the server's own clock) and the API server.
--    Deliberately NOT in PRODUCT_TABLES, so "delete my content" can never reset a trial.
create table if not exists trials (
  user_id uuid not null references auth.users(id) on delete cascade,
  product text not null check (product in ('earshelf','tapestry')),
  plan text not null default 'pro' check (plan in ('plus','pro')),
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  primary key (user_id, product)
);
alter table trials enable row level security;
drop policy if exists read_own_trials on trials;
create policy read_own_trials on trials for select using (user_id = auth.uid());

-- To trial Plus instead of Pro: change 'pro' below to 'plus' (and TRIAL_PLAN in packages/billing/src/plans.ts), then run this file again.
create or replace function start_trial(p_product text)
returns table(out_plan text, out_started_at timestamptz, out_ends_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not signed in'; end if;
  if p_product not in ('earshelf','tapestry') then raise exception 'unknown product'; end if;
  insert into trials (user_id, product, plan, started_at, ends_at)
  values (v_user, p_product, 'pro', now(), now() + interval '7 days')
  on conflict (user_id, product) do nothing;
  return query select t.plan, t.started_at, t.ends_at from trials t where t.user_id = v_user and t.product = p_product;
end $$;
revoke all on function start_trial(text) from public, anon;
grant execute on function start_trial(text) to authenticated;

-- 2) Creem's customer id, so "Manage billing" can open the right customer portal.
alter table subscriptions add column if not exists customer_id text;

-- 3) Counters that reset every day (the free 20-minute natural voice preview). Same rules as consume_usage, but the period is one UTC day.
create or replace function consume_usage_daily(p_user uuid, p_product text, p_metric text, p_amount numeric, p_limit numeric)
returns table(is_allowed boolean, total_used numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_start date := (now() at time zone 'utc')::date;
  v_end date := (now() at time zone 'utc')::date + 1;
  v_used numeric;
begin
  insert into usage_counters (user_id, product, metric, period_start, period_end, used, "limit")
  values (p_user, p_product, p_metric, v_start, v_end, 0, p_limit)
  on conflict do nothing;

  update usage_counters uc set used = uc.used + p_amount, "limit" = p_limit
  where uc.user_id = p_user and uc.product = p_product and uc.metric = p_metric and uc.period_start = v_start
    and (p_limit < 0 or uc.used + p_amount <= p_limit)
  returning uc.used into v_used;

  if v_used is null then
    select uc.used into v_used from usage_counters uc
    where uc.user_id = p_user and uc.product = p_product and uc.metric = p_metric and uc.period_start = v_start;
    return query select false, coalesce(v_used, 0);
  else
    return query select true, v_used;
  end if;
end $$;
revoke all on function consume_usage_daily(uuid, text, text, numeric, numeric) from public, anon, authenticated;
grant execute on function consume_usage_daily(uuid, text, text, numeric, numeric) to service_role;
