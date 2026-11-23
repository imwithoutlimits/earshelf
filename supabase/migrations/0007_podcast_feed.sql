-- 0007: private podcast feed (earshelf Pro). The owner runs this file BY HAND in the Supabase SQL Editor. Safe to run twice.
-- Limits (5 episodes, 300 MB, 60 days) are enforced by the API server, which is the only thing that writes these tables.

create table if not exists podcast_feeds (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token text not null unique,                 -- the secret in the person's feed address
  created_at timestamptz not null default now()
);
alter table podcast_feeds enable row level security;
drop policy if exists read_own_feed on podcast_feeds;
create policy read_own_feed on podcast_feeds for select using (user_id = auth.uid());

create table if not exists podcast_episodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product text not null default 'earshelf',
  job_id uuid not null,
  title text not null,
  author text,
  storage_path text not null,                 -- the finished export in the "audio" bucket
  ext text not null check (ext in ('mp3', 'm4b')),
  bytes bigint not null check (bytes > 0),
  duration_ms bigint,
  published_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (user_id, job_id)
);
create index if not exists podcast_episodes_user on podcast_episodes (user_id, published_at desc);
create index if not exists podcast_episodes_expiry on podcast_episodes (expires_at);
alter table podcast_episodes enable row level security;
drop policy if exists read_own_episodes on podcast_episodes;
create policy read_own_episodes on podcast_episodes for select using (user_id = auth.uid());
-- No insert, update or delete policies: only the API server (service key) writes these.
