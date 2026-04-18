-- Modo teste sem JWT: permitir CRUD em products com o mesmo UUID fixo de 005_categories_rls_no_session.sql
-- e de DEFAULT_LOCAL_TEST_USER_ID em src/lib/effective-user.ts

-- SELECT
drop policy if exists "products_select_no_session_local_uuid" on public.products;
create policy "products_select_no_session_local_uuid" on public.products for select to public using (
  auth.uid() is null
  and user_id = 'a08e7cc0-e985-44e2-b756-41bc5955f5a5'::uuid
);

-- INSERT
drop policy if exists "products_insert_no_session_local_uuid" on public.products;
create policy "products_insert_no_session_local_uuid" on public.products for insert to public with check (
  auth.uid() is null
  and user_id = 'a08e7cc0-e985-44e2-b756-41bc5955f5a5'::uuid
);

-- UPDATE
drop policy if exists "products_update_no_session_local_uuid" on public.products;
create policy "products_update_no_session_local_uuid" on public.products for update to public using (
  auth.uid() is null
  and user_id = 'a08e7cc0-e985-44e2-b756-41bc5955f5a5'::uuid
);

-- DELETE
drop policy if exists "products_delete_no_session_local_uuid" on public.products;
create policy "products_delete_no_session_local_uuid" on public.products for delete to public using (
  auth.uid() is null
  and user_id = 'a08e7cc0-e985-44e2-b756-41bc5955f5a5'::uuid
);
