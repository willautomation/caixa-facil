-- Ícone/emoji opcional por categoria (Caixa e listagens)

alter table public.categories add column if not exists icon text;

update public.categories
set icon = '📁'
where lower(btrim(name)) = 'geral'
  and (icon is null or btrim(icon) = '');
