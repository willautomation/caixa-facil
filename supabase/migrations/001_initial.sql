-- Caixa Fácil — schema inicial (executar no SQL Editor do Supabase ou via CLI)

create table public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  type text not null check (type in ('manual', 'quantity')),
  price numeric(12, 2) not null default 0,
  track_stock boolean not null default false,
  stock integer not null default 0,
  icon text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  total numeric(12, 2) not null,
  amount_received numeric(12, 2) not null,
  change_amount numeric(12, 2) not null,
  sold_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  product_name text not null,
  line_type text not null check (line_type in ('manual', 'quantity')),
  quantity numeric(12, 3) not null,
  unit_price numeric(12, 2) not null,
  line_total numeric(12, 2) not null
);

create table public.daily_closures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  closure_date date not null,
  total_day numeric(12, 2) not null,
  sale_count integer not null,
  product_summary jsonb not null default '[]'::jsonb,
  closed_at timestamptz not null default now(),
  unique (user_id, closure_date)
);

create index sales_user_sold_at_idx on public.sales (user_id, sold_at desc);
create index products_user_idx on public.products (user_id);
create index sale_items_sale_idx on public.sale_items (sale_id);

alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.daily_closures enable row level security;

create policy "products_select_own" on public.products for select using (auth.uid() = user_id);
create policy "products_insert_own" on public.products for insert with check (auth.uid() = user_id);
create policy "products_update_own" on public.products for update using (auth.uid() = user_id);
create policy "products_delete_own" on public.products for delete using (auth.uid() = user_id);

create policy "sales_select_own" on public.sales for select using (auth.uid() = user_id);
create policy "sales_insert_own" on public.sales for insert with check (auth.uid() = user_id);
create policy "sales_update_own" on public.sales for update using (auth.uid() = user_id);
create policy "sales_delete_own" on public.sales for delete using (auth.uid() = user_id);

create policy "sale_items_all_own_sale" on public.sale_items for all using (
  exists (select 1 from public.sales s where s.id = sale_id and s.user_id = auth.uid())
) with check (
  exists (select 1 from public.sales s where s.id = sale_id and s.user_id = auth.uid())
);

create policy "closures_select_own" on public.daily_closures for select using (auth.uid() = user_id);
create policy "closures_insert_own" on public.daily_closures for insert with check (auth.uid() = user_id);
create policy "closures_update_own" on public.daily_closures for update using (auth.uid() = user_id);
create policy "closures_delete_own" on public.daily_closures for delete using (auth.uid() = user_id);
