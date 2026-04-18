-- Categorias por usuário + vínculo opcional em products (idempotente).

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_name_nonempty check (char_length(btrim(name)) > 0)
);

create unique index if not exists categories_user_name_lower_idx
  on public.categories (user_id, lower(btrim(name)));

alter table public.products
  add column if not exists category_id uuid references public.categories (id) on delete restrict;

create index if not exists products_category_id_idx on public.products (category_id);

-- Garantir "Geral" para cada usuário que já tem produtos e ligar produtos sem categoria.
insert into public.categories (user_id, name)
select distinct p.user_id, 'Geral'
from public.products p
where not exists (
  select 1
  from public.categories c
  where c.user_id = p.user_id
    and lower(btrim(c.name)) = 'geral'
);

update public.products p
set category_id = c.id
from public.categories c
where p.category_id is null
  and c.user_id = p.user_id
  and lower(btrim(c.name)) = 'geral';

alter table public.categories enable row level security;

drop policy if exists "categories_select_own" on public.categories;
drop policy if exists "categories_insert_own" on public.categories;
drop policy if exists "categories_update_own" on public.categories;
drop policy if exists "categories_delete_own" on public.categories;

create policy "categories_select_own" on public.categories for select using (auth.uid() = user_id);
create policy "categories_insert_own" on public.categories for insert with check (auth.uid() = user_id);
create policy "categories_update_own" on public.categories for update using (auth.uid() = user_id);
create policy "categories_delete_own" on public.categories for delete using (auth.uid() = user_id);
