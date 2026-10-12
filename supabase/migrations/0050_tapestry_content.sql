-- Tapestry: licensed Scripture text, topics and curated wells. Anyone can read (so people can explore before signing up); only the server can write.
create table translations (
  id text primary key, name text not null, abbreviation text not null, language text not null default 'en',
  copyright_notice text not null, license_name text not null, license_url text not null, source_url text not null,
  commercial_use_allowed boolean not null default false, enabled boolean not null default false,
  verse_count int not null default 0, imported_at timestamptz, created_at timestamptz not null default now()
);
create table bible_books (n int primary key, code text not null unique, name text not null, testament text not null check (testament in ('OT','NT')), chapters int not null);
create table bible_chapters (book int not null references bible_books(n), chapter int not null, verses int not null, primary key (book, chapter));
create table bible_verses (
  translation_id text not null references translations(id) on delete cascade,
  book int not null references bible_books(n), chapter int not null, verse int not null,
  text text not null,
  tsv tsvector generated always as (to_tsvector('english', text)) stored,
  embedding vector(384),
  primary key (translation_id, book, chapter, verse)
);
create index bible_verses_tsv_idx on bible_verses using gin (tsv);
create index bible_verses_trgm_idx on bible_verses using gin (text gin_trgm_ops);
create table scripture_topics (id text primary key, name text not null, description text);
create table verse_topics (topic_id text not null references scripture_topics(id) on delete cascade, ref text not null, link text not null check (link in ('direct','related','common')), note text, primary key (topic_id, ref));
create table curated_wells (
  id text primary key, name text not null, description text not null, intro text, tags text[] not null default '{}',
  memorize_ref text, status text not null default 'draft' check (status in ('draft','reviewed')), position int not null default 0, updated_at timestamptz not null default now()
);
create table curated_well_items (well_id text not null references curated_wells(id) on delete cascade, position int not null, ref text not null, link text not null check (link in ('direct','related','common')), note text, primary key (well_id, position));
create table guided_paths (id text primary key, name text not null, description text, estimated_minutes int, status text not null default 'draft' check (status in ('draft','reviewed')));
create table guided_path_items (path_id text not null references guided_paths(id) on delete cascade, position int not null, ref text not null, prompt text, primary key (path_id, position));
create table reflection_prompts (id uuid primary key default gen_random_uuid(), well_id text references curated_wells(id) on delete cascade, body text not null, source text not null default 'editorial' check (source in ('editorial','ai')), created_at timestamptz not null default now());

do $$ declare t text; begin
  foreach t in array array['translations','bible_books','bible_chapters','bible_verses','scripture_topics','verse_topics','curated_wells','curated_well_items','guided_paths','guided_path_items','reflection_prompts'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy public_read on %I for select using (true)', t);
  end loop;
end $$;
-- Text of a translation is readable only once it has been enabled (after its license has been checked).
drop policy public_read on bible_verses;
create policy public_read on bible_verses for select using (exists (select 1 from translations t where t.id = translation_id and t.enabled));
drop policy public_read on translations;
create policy public_read on translations for select using (enabled);

-- Exact phrase first, then any-word match, then similarity. Needs no AI.
create or replace function search_verses(p_translation text, p_query text, p_limit int default 20)
returns table (book int, chapter int, verse int, text text, rank real) language sql stable as $$
  select v.book, v.chapter, v.verse, v.text,
    greatest(ts_rank(v.tsv, phraseto_tsquery('english', p_query)) * 2, ts_rank(v.tsv, websearch_to_tsquery('english', p_query)), similarity(v.text, p_query))::real as rank
  from bible_verses v
  where v.translation_id = p_translation and length(trim(p_query)) > 1
    and (v.tsv @@ websearch_to_tsquery('english', p_query) or v.text ilike '%' || p_query || '%')
  order by rank desc, v.book, v.chapter, v.verse limit least(coalesce(p_limit, 20), 50);
$$;
grant execute on function search_verses(text, text, int) to anon, authenticated;
