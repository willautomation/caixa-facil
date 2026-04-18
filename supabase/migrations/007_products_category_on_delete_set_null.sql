-- Permite excluir categorias: produtos passam a category_id NULL (app move explicitamente antes quando há destino)

alter table public.products drop constraint if exists products_category_id_fkey;

alter table public.products
  add constraint products_category_id_fkey
  foreign key (category_id) references public.categories (id) on delete set null;
