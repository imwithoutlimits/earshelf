-- 0053: cross-references for Tapestry Pro (data from OpenBible.info, CC BY 4.0). The owner runs this file BY HAND in the Supabase SQL Editor.
-- Then load the data with the GitHub action "Load cross-references". Safe to run twice.
-- Reference data, not user data, so there is no user_id. Only the API server reads it (no policies for signed-in users),
-- which is what keeps the Pro rule from being bypassed by reading the table directly.
create table if not exists cross_references (
  from_ref text not null,        -- one verse, like PSA.23.1
  to_ref text not null,          -- a verse or a range in one chapter, like PRO.8.22-30
  votes integer not null,
  primary key (from_ref, to_ref)
);
create index if not exists cross_references_from on cross_references (from_ref, votes desc);
alter table cross_references enable row level security;
