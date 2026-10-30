alter table public.menu_products
  add column if not exists is_promotion boolean not null default false;
