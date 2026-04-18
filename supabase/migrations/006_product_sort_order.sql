-- Ordem de exibição por categoria (menor = primeiro)

alter table public.products
  add column if not exists sort_order integer not null default 0;

-- Numeração estável por (usuário, categoria), desempate por nome
with numbered as (
  select
    id,
    (row_number() over (
      partition by user_id, category_id
      order by sort_order asc, name asc
    ) - 1) as rn
  from public.products
)
update public.products p
set sort_order = n.rn
from numbered n
where p.id = n.id;

create index if not exists products_user_category_sort_idx
  on public.products (user_id, category_id, sort_order);
