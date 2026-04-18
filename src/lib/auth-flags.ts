/**
 * Quando true: sem login obrigatório, rotas abertas, home → caixa, `user_id` via
 * NEXT_PUBLIC_LOCAL_USER_ID ou DEFAULT_LOCAL_TEST_USER_ID (effective-user.ts).
 *
 * Para reativar login obrigatório, altere para false.
 */
export const AUTH_DISABLED_FOR_TESTS = true;
