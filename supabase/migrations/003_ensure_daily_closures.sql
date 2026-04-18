-- Garante tabela e políticas RLS para "Fechar caixa do dia" (idempotente).
-- Não apaga vendas; apenas registra um snapshot do dia em daily_closures.

create table if not exists public.daily_closures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  closure_date date not null,
  total_day numeric(12, 2) not null,
  sale_count integer not null,
  product_summary jsonb not null default '[]'::jsonb,
  closed_at timestamptz not null default now(),
  unique (user_id, closure_date)
);

alter table public.daily_closures enable row level security;

drop policy if exists "closures_select_own" on public.daily_closures;
drop policy if exists "closures_insert_own" on public.daily_closures;
drop policy if exists "closures_update_own" on public.daily_closures;
drop policy if exists "closures_delete_own" on public.daily_closures;

create policy "closures_select_own" on public.daily_closures for select using (auth.uid() = user_id);
create policy "closures_insert_own" on public.daily_closures for insert with check (auth.uid() = user_id);
create policy "closures_update_own" on public.daily_closures for update using (auth.uid() = user_id);
create policy "closures_delete_own" on public.daily_closures for delete using (auth.uid() = user_id);
