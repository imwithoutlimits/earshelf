-- XP, listening thread, weekly target, milestone badges, weekly insights and reminders. Shared by both apps (product column); Tapestry uses them first.
alter table profiles add column if not exists timezone text not null default 'UTC';

create table xp_events (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  product text not null check (product in ('earshelf','tapestry')), kind text not null, amount int not null check (amount >= 0),
  ref text, day date not null, created_at timestamptz not null default now()
);
-- Each action counts once per passage per day, which stops the same save being repeated for points.
create unique index xp_once_per_day on xp_events (user_id, product, kind, (coalesce(ref, '')), day);
create index xp_events_user_idx on xp_events (user_id, product, day);

create table activity_days (
  user_id uuid not null references auth.users(id) on delete cascade, product text not null check (product in ('earshelf','tapestry')),
  day date not null, seconds int not null default 0, sessions int not null default 0, primary key (user_id, product, day)
);
create table listening_sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  product text not null check (product in ('earshelf','tapestry')), day date not null, started_at timestamptz not null default now(),
  seconds int not null check (seconds between 1 and 14400), well_name text
);
create index listening_sessions_idx on listening_sessions (user_id, product, started_at desc);
create table weekly_targets (user_id uuid not null references auth.users(id) on delete cascade, product text not null, target_days int not null default 5 check (target_days between 1 and 7), primary key (user_id, product));
create table badge_awards (user_id uuid not null references auth.users(id) on delete cascade, product text not null, badge_id text not null, earned_at timestamptz not null default now(), primary key (user_id, product, badge_id));
create table weekly_insights (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, product text not null,
  week_start date not null, facts jsonb not null, body text not null, source text not null check (source in ('computed','ai')), model text,
  created_at timestamptz not null default now(), unique (user_id, product, week_start)
);
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, product text not null,
  endpoint text not null unique, p256dh text not null, auth text not null, remind_at time, created_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['xp_events','activity_days','listening_sessions','weekly_targets','badge_awards','weekly_insights','push_subscriptions'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy read_own on %I for select using (user_id = auth.uid())', t);
  end loop;
end $$;
-- People may change their own target and reminders. Everything that earns points is written by the server only.
create policy write_own_target on weekly_targets for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy write_own_push on push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Records one action: caps the day's XP, ignores repeats, adds listening time. Server (service role) only.
create or replace function record_activity(p_user uuid, p_product text, p_kind text, p_ref text, p_day date, p_seconds int, p_amount int, p_cap int)
returns table (awarded int, day_seconds int) language plpgsql security definer set search_path = public as $$
declare earned int; n int; got int := 0;
begin
  if p_amount > 0 then
    select coalesce(sum(amount), 0) into earned from xp_events where user_id = p_user and product = p_product and day = p_day;
    got := greatest(0, least(p_amount, p_cap - earned));
    if got > 0 then
      insert into xp_events (user_id, product, kind, amount, ref, day) values (p_user, p_product, p_kind, got, p_ref, p_day) on conflict do nothing;
      get diagnostics n = row_count;
      if n = 0 then got := 0; end if;
    end if;
  end if;
  if p_seconds > 0 then
    insert into activity_days (user_id, product, day, seconds, sessions) values (p_user, p_product, p_day, p_seconds, 1)
    on conflict (user_id, product, day) do update set seconds = activity_days.seconds + excluded.seconds, sessions = activity_days.sessions + 1;
  end if;
  return query select got, coalesce((select a.seconds from activity_days a where a.user_id = p_user and a.product = p_product and a.day = p_day), 0);
end $$;
revoke all on function record_activity(uuid, text, text, text, date, int, int, int) from public, anon, authenticated;
grant execute on function record_activity(uuid, text, text, text, date, int, int, int) to service_role;
