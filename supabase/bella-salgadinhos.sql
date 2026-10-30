-- Schema do cardápio da Bella Salgadinhos
-- Rode no SQL Editor do Supabase do projeto novo (ou peça pro Lovable rodar como migração)

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ================= store_settings =================
create table if not exists store_settings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  logo_url text,
  cover_url text,
  whatsapp text not null default '',
  hours_text text not null default '',
  -- Entrega
  address text not null default '',
  store_lat numeric,
  store_lon numeric,
  -- Taxa adicional (chuva, feriado, alta demanda) — ligada/desligada no painel
  surcharge_active boolean not null default false,
  surcharge_amount numeric not null default 2,
  surcharge_label text not null default 'Dia de chuva, feriado ou alta demanda',
  updated_at timestamptz not null default now()
);

-- Se a tabela store_settings já existia (criada antes), garante as colunas novas:
alter table store_settings add column if not exists address text not null default '';
alter table store_settings add column if not exists store_lat numeric;
alter table store_settings add column if not exists store_lon numeric;
alter table store_settings add column if not exists surcharge_active boolean not null default false;
alter table store_settings add column if not exists surcharge_amount numeric not null default 2;
alter table store_settings add column if not exists surcharge_label text not null default 'Dia de chuva, feriado ou alta demanda';

-- ================= menu_categories =================
create table if not exists menu_categories (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  position integer not null default 0
);

-- ================= menu_products =================
create table if not exists menu_products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references menu_categories(id) on delete cascade,
  name text not null,
  description text not null default '',
  price numeric,
  image_url text,
  sizes jsonb not null default '[]',
  flavors jsonb not null default '[]',
  single_flavors jsonb not null default '[]',
  units_base integer,
  units_per_flavor integer not null default 25,
  allow_assorted boolean not null default false,
  choice_groups jsonb not null default '[]',
  active boolean not null default true,
  position integer not null default 0
);

create index if not exists idx_menu_products_category on menu_products(category_id);

-- Coluna usada pelo painel para marcar produtos em promoção.
-- Também atualiza bancos já existentes sem apagar dados.
alter table menu_products add column if not exists is_promotion boolean not null default false;

-- ================= Storage =================
-- Criar um bucket chamado "menu" (Storage > New bucket) para as fotos.
-- Pode ficar privado: o código gera link assinado de 10 anos.

-- ================= Row Level Security =================
-- Leitura pública (o cardápio usa a chave anônima). Escrita só pelo servidor
-- (service role), por isso NÃO há policy de insert/update/delete.
alter table store_settings enable row level security;
alter table menu_categories enable row level security;
alter table menu_products enable row level security;

drop policy if exists "Leitura pública da loja" on store_settings;
create policy "Leitura pública da loja" on store_settings for select using (true);

drop policy if exists "Leitura pública das categorias" on menu_categories;
create policy "Leitura pública das categorias" on menu_categories for select using (true);

drop policy if exists "Leitura pública dos produtos" on menu_products;
create policy "Leitura pública dos produtos" on menu_products for select using (true);

-- ================= Melhorias =================
-- 1) Controle de abertura: auto (horário), open (forçar aberta), closed (forçar fechada)
alter table store_settings add column if not exists open_status text not null default 'auto';
alter table store_settings drop constraint if exists store_settings_open_status_check;
alter table store_settings add constraint store_settings_open_status_check
  check (open_status in ('auto', 'open', 'closed'));

-- 3) Pedidos gravados antes do WhatsApp (gravação só pelo servidor)
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  customer_name text not null,
  customer_phone text not null,
  order_type text not null check (order_type in ('entrega', 'retirada')),
  order_mode text not null default 'agora' check (order_mode in ('agora', 'agendado')),
  scheduled_date date not null,
  scheduled_time text not null,
  payment_method text not null,
  change_for text,
  cep text,
  address text,
  distance_km numeric,
  distance_estimated boolean not null default false,
  delivery_fee numeric not null default 0,
  return_fee_applied boolean not null default false,
  surcharge numeric not null default 0,
  subtotal numeric not null default 0,
  total numeric not null default 0,
  items jsonb not null default '[]',
  status text not null default 'novo'
);
alter table orders add column if not exists order_mode text not null default 'agora';
alter table orders drop constraint if exists orders_order_mode_check;
alter table orders add constraint orders_order_mode_check check (order_mode in ('agora', 'agendado'));
create index if not exists idx_orders_created on orders(created_at desc);
alter table orders enable row level security; -- sem policies: só service role

-- Permissões da API
grant select on store_settings, menu_categories, menu_products to anon, authenticated;
grant all on store_settings, menu_categories, menu_products, orders to service_role;

-- 2) Bucket público "menu" para as fotos
insert into storage.buckets (id, name, public)
values ('menu', 'menu', true)
on conflict (id) do update set public = true;

drop policy if exists "Leitura pública das fotos do cardápio" on storage.objects;
create policy "Leitura pública das fotos do cardápio" on storage.objects
  for select using (bucket_id = 'menu');

-- ================= Dados iniciais =================
-- Dados da Bella Salgadinhos: loja, categorias e produtos
-- Rode DEPOIS do schema.sql. Seguro para rodar uma vez só.

-- ================= Loja =================
-- Depois do primeiro acesso, complete no /painel: WhatsApp, horário,
-- endereço/CEP da loja (botão "Localizar loja no mapa"), logo e capa.
insert into store_settings (name, description, whatsapp, hours_text)
select 'Bella Salgadinhos',
       'Salgadinhos e refrigerantes para a sua festa',
       '', -- TROQUE no painel: WhatsApp com DDI+DDD, só números (ex: 5511999999999)
       'Seg-Sáb: 13h-21h' -- TROQUE no painel
where not exists (select 1 from store_settings);

-- ================= Categorias =================
insert into menu_categories (title, position)
select v.title, v.position
from (values
  ('Salgadinhos (cento)', 0),
  ('Salgadinhos (1/2 cento)', 1),
  ('Refrigerantes', 2)
) as v(title, position)
where not exists (select 1 from menu_categories mc where mc.title = v.title);

-- ================= Salgadinhos (cento = 100 unidades) =================
insert into menu_products (category_id, name, description, price, position, active)
select c.id, v.name, 'Cento (100 unidades)', v.price, v.position, true
from menu_categories c
cross join (values
  ('Salgadinhos Misto', 30.00, 0),
  ('Bolinha de Catupiry', 30.00, 1),
  ('Coxinha de Frango', 30.00, 2),
  ('Risole de Presunto', 30.00, 3),
  ('Risole de Queijo', 30.00, 4),
  ('Pastel de Carne', 35.00, 5)
) as v(name, price, position)
where c.title = 'Salgadinhos (cento)'
  and not exists (select 1 from menu_products p where p.name = v.name);

-- ================= Salgadinhos (1/2 cento = 50 unidades) =================
insert into menu_products (category_id, name, description, price, position, active)
select c.id, v.name, 'Meio cento (50 unidades)', v.price, v.position, true
from menu_categories c
cross join (values
  ('Salgadinhos Misto (1/2 cento)', 15.00, 0),
  ('Bolinha de Catupiry (1/2 cento)', 15.00, 1),
  ('Coxinha de Frango (1/2 cento)', 15.00, 2),
  ('Risole de Presunto (1/2 cento)', 15.00, 3),
  ('Risole de Queijo (1/2 cento)', 15.00, 4),
  ('Pastel de Carne (1/2 cento)', 17.50, 5)
) as v(name, price, position)
where c.title = 'Salgadinhos (1/2 cento)'
  and not exists (select 1 from menu_products p where p.name = v.name);

-- ================= Refrigerantes =================
insert into menu_products (category_id, name, description, price, position, active)
select c.id, v.name, v.descricao, v.price, v.position, true
from menu_categories c
cross join (values
  ('Coca-Cola 2lt', '2 litros', 13.00, 0),
  ('Guaraná Antarctica 2lt', '2 litros', 10.00, 1),
  ('Coca Zero 2lt', '2 litros', 13.00, 2),
  ('Kina Guaraná 2lt', '2 litros', 8.00, 3),
  ('Kina Abacaxi 2lt', '2 litros', 8.00, 4),
  ('Fanta Laranja 2lt', '2 litros', 13.00, 5),
  ('Coca 1lt', '1 litro', 10.00, 6),
  ('Fanta Laranja 1lt', '1 litro', 10.00, 7)
) as v(name, descricao, price, position)
where c.title = 'Refrigerantes'
  and not exists (select 1 from menu_products p where p.name = v.name);