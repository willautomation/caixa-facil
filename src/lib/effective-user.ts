import type { SupabaseClient } from "@supabase/supabase-js";
import { AUTH_DISABLED_FOR_TESTS } from "@/lib/auth-flags";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * UUID padrão do modo teste local (espelha o gerado em `.env.local`).
 * Garante `user_id` mesmo sem variável de ambiente carregada.
 */
export const DEFAULT_LOCAL_TEST_USER_ID = "a08e7cc0-e985-44e2-b756-41bc5955f5a5";

/** Lê `NEXT_PUBLIC_LOCAL_USER_ID` do ambiente, se válido. */
export function parseLocalTestUserId(): string | null {
  const raw = process.env.NEXT_PUBLIC_LOCAL_USER_ID?.trim();
  if (!raw || !UUID_RE.test(raw)) return null;
  return raw;
}

/**
 * Identificador usado em `user_id` nas tabelas.
 * - Modo teste **com sessão Supabase**: usa `auth.getUser().id` para bater com RLS (`auth.uid() = user_id`).
 * - Modo teste **sem sessão**: `NEXT_PUBLIC_LOCAL_USER_ID` ou `DEFAULT_LOCAL_TEST_USER_ID` (exige políticas
 *   extras no banco para anon — ver migração `005_categories_rls_no_session.sql`).
 * - Modo normal: `auth.getUser()`.
 */
export async function resolveEffectiveUserId(supabase: SupabaseClient): Promise<{
  userId: string | null;
  errorMessage: string | null;
}> {
  if (AUTH_DISABLED_FOR_TESTS) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.id) {
      return { userId: user.id, errorMessage: null };
    }
    const userId = parseLocalTestUserId() ?? DEFAULT_LOCAL_TEST_USER_ID;
    return { userId, errorMessage: null };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return { userId: null, errorMessage: "Sessão expirada." };
  }
  return { userId: user.id, errorMessage: null };
}
