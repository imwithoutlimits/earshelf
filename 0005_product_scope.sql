-- Keeps two apps on one account from touching each other's data.
-- Run this BEFORE redeploying the website and server that go with it.
alter table review_cards
  add column if not exists product text not null default 'earshelf' check (product in ('earshelf','tapestry'));
create index if not exists review_cards_product_idx on review_cards (user_id, product, updated_at);
