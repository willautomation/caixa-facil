-- Opcional: modo teste **sem** sessão JWT (auth.uid() nulo) com `user_id` fixo do app.
-- O UUID abaixo deve ser o mesmo de `DEFAULT_LOCAL_TEST_USER_ID` em `src/lib/effective-user.ts`.
-- Se usar `NEXT_PUBLIC_LOCAL_USER_ID`, crie políticas equivalentes para esse UUID ou faça login no app.

-- INSERT
drop policy if exists "categories_insert_no_session_local_uuid" on public.categories;
create policy "categories_insert_no_session_local_uuid" on public.categories for insert to public with check (
  auth.uid() is null
  and user_id = 'a08e7cc0-e985-44e2-b756-41bc5955f5a5'::uuid
);

-- SELECT (listar categorias na tabela sem join)
drop policy if exists "categories_select_no_session_local_uuid" on public.categories;
create policy "categories_select_no_session_local_uuid" on public.categories for select to public using (
  auth.uid() is null
  and user_id = 'a08e7cc0-e985-44e2-b756-41bc5955f5a5'::uuid
);

-- UPDATE / DELETE (renomear / excluir categoria no modo sem sessão)
drop policy if exists "categories_update_no_session_local_uuid" on public.categories;
create policy "categories_update_no_session_local_uuid" on public.categories for update to public using (
  auth.uid() is null
  and user_id = 'a08e7cc0-e985-44e2-b756-41bc5955f5a5'::uuid
);

drop policy if exists "categories_delete_no_session_local_uuid" on public.categories;
create policy "categories_delete_no_session_local_uuid" on public.categories for delete to public using (
  auth.uid() is null
  and user_id = 'a08e7cc0-e985-44e2-b756-41bc5955f5a5'::uuid
);
