-- Novo tipo de produto: valor digitado na hora (não altera linhas existentes)
do $$
declare
  cname text;
begin
  select con.conname into cname
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'products'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%type%';
  if cname is not null then
    execute format('alter table public.products drop constraint %I', cname);
  end if;
end $$;

alter table public.products
  add constraint products_type_check check (type in ('manual', 'quantity', 'typed_value'));
