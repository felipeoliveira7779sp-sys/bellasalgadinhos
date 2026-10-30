-- Registra se o pedido é imediato ou agendado.
-- Pedidos antigos recebem 'agora' como valor padrão, sem perda de dados.
alter table public.orders
  add column if not exists order_mode text not null default 'agora';

alter table public.orders
  drop constraint if exists orders_order_mode_check;

alter table public.orders
  add constraint orders_order_mode_check
  check (order_mode in ('agora', 'agendado'));
