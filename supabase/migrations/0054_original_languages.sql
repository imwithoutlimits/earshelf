-- 0054: Hebrew and Greek word data for Tapestry Pro (STEPBible-Data, CC BY 4.0). The owner runs this file BY HAND in the Supabase SQL Editor.
-- Then load the data with the GitHub action "Load Hebrew and Greek" (run it with "dry run" ticked first: it prints the size before saving).
-- One row per verse; the words are stored together as compact JSON so the table stays small. Safe to run twice.
-- Reference data, not user data, so no user_id. Only the API server reads it (no policies for signed-in users), which keeps the Pro rule intact.
create table if not exists original_verses (
  ref text primary key,                              -- one verse, like GEN.1.1
  lang text not null check (lang in ('he', 'gr')),
  words jsonb not null                               -- [[word, transliteration, English gloss, Strong's number], ...] in reading order
);
alter table original_verses enable row level security;
