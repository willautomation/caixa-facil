import { createClient } from "@/lib/supabase/client";
import type { Category } from "@/types/database";

export const DEFAULT_CATEGORY_NAME = "Geral";

function mapCategoryRow(r: Record<string, unknown>): Category {
  return {
    id: r.id as string,
    user_id: r.user_id as string,
    name: r.name as string,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

function sortCategoriesForUi(list: Category[]): Category[] {
  return [...list].sort((a, b) => {
    const ag = a.name.trim().toLowerCase() === DEFAULT_CATEGORY_NAME.toLowerCase();
    const bg = b.name.trim().toLowerCase() === DEFAULT_CATEGORY_NAME.toLowerCase();
    if (ag && !bg) return -1;
    if (!ag && bg) return 1;
    return a.name.localeCompare(b.name, "pt-BR");
  });
}

/** Cria "Geral" se ainda não existir; retorna o id ou null se o Supabase não suportar categorias. */
export async function ensureDefaultGeralCategoryId(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<string | null> {
  try {
    const { data: existing, error: selErr } = await supabase
      .from("categories")
      .select("id")
      .eq("user_id", userId)
      .eq("name", DEFAULT_CATEGORY_NAME)
      .maybeSingle();
    if (!selErr && existing?.id) return existing.id as string;

    const { data: inserted, error: insErr } = await supabase
      .from("categories")
      .insert({ user_id: userId, name: DEFAULT_CATEGORY_NAME })
      .select("id")
      .single();
    if (!insErr && inserted?.id) return inserted.id as string;

    if (insErr?.code === "23505") {
      const { data: again } = await supabase
        .from("categories")
        .select("id")
        .eq("user_id", userId)
        .eq("name", DEFAULT_CATEGORY_NAME)
        .maybeSingle();
      if (again?.id) return again.id as string;
    }
    console.warn("[Caixa Fácil] ensureDefaultGeralCategoryId:", insErr ?? selErr);
    return null;
  } catch (e) {
    console.warn("[Caixa Fácil] ensureDefaultGeralCategoryId:", e);
    return null;
  }
}

export async function listCategories(userId: string): Promise<Category[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("user_id", userId)
    .order("name", { ascending: true });
  if (error) {
    console.warn("[Caixa Fácil] listCategories:", error.message, error);
    return [];
  }
  return sortCategoriesForUi((data ?? []).map((r) => mapCategoryRow(r as Record<string, unknown>)));
}

export type CreateCategoryResult =
  | { ok: true; category: Category }
  | { ok: false; message: string };

export async function createCategory(userId: string, rawName: string): Promise<CreateCategoryResult> {
  const name = rawName.trim();
  if (!name) {
    return { ok: false, message: "Informe um nome para a categoria." };
  }
  const supabase = createClient();
  const { data, error } = await supabase
    .from("categories")
    .insert({ user_id: userId, name })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") {
      return { ok: false, message: "Já existe uma categoria com esse nome." };
    }
    return { ok: false, message: error.message || "Não foi possível criar a categoria." };
  }
  if (!data) return { ok: false, message: "Não foi possível criar a categoria." };
  return { ok: true, category: mapCategoryRow(data as Record<string, unknown>) };
}

export type SimpleOk = { ok: true } | { ok: false; message: string };

export async function renameCategory(userId: string, categoryId: string, rawName: string): Promise<SimpleOk> {
  const name = rawName.trim();
  if (!name) {
    return { ok: false, message: "O nome não pode ser vazio." };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("categories")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", categoryId)
    .eq("user_id", userId);
  if (error) {
    if (error.code === "23505") {
      return { ok: false, message: "Já existe uma categoria com esse nome." };
    }
    return { ok: false, message: error.message || "Não foi possível renomear." };
  }
  return { ok: true };
}

function isReservedGeral(name: string): boolean {
  return name.trim().toLowerCase() === DEFAULT_CATEGORY_NAME.toLowerCase();
}

/**
 * Move produtos da categoria para "Geral", depois remove a categoria.
 * Não remove produtos. "Geral" não pode ser excluída.
 */
export async function deleteCategorySafe(userId: string, categoryId: string): Promise<SimpleOk> {
  const supabase = createClient();
  const { data: row, error: readErr } = await supabase
    .from("categories")
    .select("id, name")
    .eq("id", categoryId)
    .eq("user_id", userId)
    .maybeSingle();
  if (readErr || !row) {
    return { ok: false, message: "Categoria não encontrada." };
  }
  if (isReservedGeral(row.name as string)) {
    return { ok: false, message: `A categoria "${DEFAULT_CATEGORY_NAME}" não pode ser excluída.` };
  }
  const geralId = await ensureDefaultGeralCategoryId(supabase, userId);
  if (!geralId) {
    return { ok: false, message: "Não foi possível localizar a categoria Geral." };
  }
  const { error: moveErr } = await supabase
    .from("products")
    .update({ category_id: geralId, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("category_id", categoryId);
  if (moveErr) {
    return { ok: false, message: moveErr.message || "Falha ao mover produtos para Geral." };
  }
  const { error: delErr } = await supabase.from("categories").delete().eq("id", categoryId).eq("user_id", userId);
  if (delErr) {
    return { ok: false, message: delErr.message || "Falha ao excluir a categoria." };
  }
  return { ok: true };
}

/** Atualiza no Supabase produtos do usuário sem category_id para "Geral". */
export async function linkUncategorizedProductsToGeral(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<void> {
  const geralId = await ensureDefaultGeralCategoryId(supabase, userId);
  if (!geralId) return;
  const { error } = await supabase
    .from("products")
    .update({ category_id: geralId, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("category_id", null);
  if (error) {
    console.warn("[Caixa Fácil] linkUncategorizedProductsToGeral:", error.message, error);
  }
}
