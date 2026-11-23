-- 0008: shared vaults (earshelf and Tapestry). The owner runs this file BY HAND in the Supabase SQL Editor. Safe to run twice.
-- A vault is a small private group (a couple, a family, a study group). Only the API server (service key) reads and writes these
-- tables, so there are NO policies for signed-in users: all the rules (plan, member limits, who may remove what) live in the server.
-- Every table has user_id and product, so "delete my content" for one app removes that person's part of it (see PRODUCT_TABLES).

create table if not exists vaults (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,   -- the owner
  product text not null check (product in ('earshelf', 'tapestry')),
  kind text not null check (kind in ('partner', 'family', 'group')),
  name text not null check (char_length(name) between 1 and 60),
  invite_code text not null unique,
  created_at timestamptz not null default now()
);
create table if not exists vault_members (
  vault_id uuid not null references vaults(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  product text not null check (product in ('earshelf', 'tapestry')),
  role text not null check (role in ('owner', 'member')),
  display_name text not null,
  joined_at timestamptz not null default now(),
  primary key (vault_id, user_id)
);
create table if not exists vault_items (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references vaults(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,   -- who shared it
  product text not null check (product in ('earshelf', 'tapestry')),
  kind text not null check (kind in ('well', 'link', 'note')),
  title text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists vault_comments (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references vaults(id) on delete cascade,
  item_id uuid not null references vault_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  product text not null check (product in ('earshelf', 'tapestry')),
  display_name text not null,
  body text not null check (char_length(body) between 1 and 280),
  created_at timestamptz not null default now()
);
create index if not exists vault_members_user on vault_members (user_id, product);
create index if not exists vault_items_vault on vault_items (vault_id, created_at desc);
create index if not exists vault_comments_item on vault_comments (item_id, created_at);

alter table vaults enable row level security;
alter table vault_members enable row level security;
alter table vault_items enable row level security;
alter table vault_comments enable row level security;
