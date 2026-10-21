-- Keeps Scripture small enough for Supabase's free 500 MB database.
-- 1) The stored search column was a second copy of every verse. An index computed on the fly does the same job.
-- 2) The trigram index was the largest index. Exact-phrase search runs on the phone, and a plain scan of one translation (about 31,000 rows) is fast enough on the server.
-- Run this BEFORE loading any Scripture. If text is already loaded, it still works; the space is returned the next time Postgres rewrites the table.
create or replace function search_verses(p_translation text, p_query text, p_limit int default 20)
returns table (book int, chapter int, verse int, text text, rank real) language sql stable as $$
  select v.book, v.chapter, v.verse, v.text,
    greatest(ts_rank(to_tsvector('english', v.text), phraseto_tsquery('english', p_query)) * 2, ts_rank(to_tsvector('english', v.text), websearch_to_tsquery('english', p_query)))::real as rank
  from bible_verses v
  where v.translation_id = p_translation and length(trim(p_query)) > 1
    and (to_tsvector('english', v.text) @@ websearch_to_tsquery('english', p_query) or v.text ilike '%' || p_query || '%')
  order by rank desc, v.book, v.chapter, v.verse limit least(coalesce(p_limit, 20), 50);
$$;
grant execute on function search_verses(text, text, int) to anon, authenticated;
drop index if exists bible_verses_trgm_idx;
drop index if exists bible_verses_tsv_idx;
alter table bible_verses drop column if exists tsv;
create index if not exists bible_verses_fts_idx on bible_verses using gin (to_tsvector('english', text));
