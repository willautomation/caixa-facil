import { createClient } from "@/lib/supabase/client";
import { removeLocalProduct } from "@/lib/products-local-storage";
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

/** Une listas de categorias pelo `id` (última ocorrência vence). */
export function mergeCategoriesById(...lists: Category[][]): Category[] {
  const map = new Map<string, Category>();
  for (const list of lists) {
    for (const c of list) {
      map.set(c.id, c);
    }
  }
  return sortCategoriesForUi([...map.values()]);
}

/**
 * Descobre categorias via FK em `products` (útil quando o SELECT direto em `categories` vem vazio
 * por ordem de execução ou cache, mas os produtos já trazem o vínculo).
 */
export async function fetchCategoriesViaProductsJoin(userId: string): Promise<Category[]> {
  const supabase = createClient();
  const selectors = [
    "category_id, categories ( id, name, user_id, created_at, updated_at )",
    "category_id, category:categories ( id, name, user_id, created_at, updated_at )",
    "category_id, categories!products_category_id_fkey ( id, name, user_id, created_at, updated_at )",
  ];
  for (const sel of selectors) {
    const { data, error } = await supabase.from("products").select(sel).eq("user_id", userId);
    if (error) {
      console.warn("[Caixa Fácil] fetchCategoriesViaProductsJoin tentativa:", sel, error.message);
      continue;
    }
    const map = new Map<string, Category>();
    for (const raw of data ?? []) {
      const row = raw as unknown as Record<string, unknown>;
      const emb = row.categories ?? row.category;
      if (emb == null) continue;
      const c = Array.isArray(emb) ? (emb[0] as Record<string, unknown> | undefined) : (emb as Record<string, unknown>);
      if (c && typeof c.id === "string" && typeof c.name === "string") {
        map.set(c.id, mapCategoryRow(c));
      }
    }
    if (map.size > 0) {
      return sortCategoriesForUi([...map.values()]);
    }
  }
  return [];
}

/**
 * Lista categorias para o Caixa: lê `categories` e une com categorias
 * descobertas pelo join em `products` (não recria "Geral" automaticamente).
 */
export async function loadCategoriesForCaixa(userId: string): Promise<Category[]> {
  const supabase = createClient();
  const fromTable = await listCategories(userId);
  const fromJoin = await fetchCategoriesViaProductsJoin(userId);
  return mergeCategoriesById(fromTable, fromJoin);
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

/**
 * Exclui a categoria e todos os produtos que estão nela (Supabase + cache local).
 * Nenhuma categoria é bloqueada por nome (inclui "Geral").
 */
export async function deleteCategorySafe(userId: string, categoryId: string): Promise<SimpleOk> {
  const supabase = createClient();
  const { data: row, error: readErr } = await supabase
    .from("categories")
    .select("id")
    .eq("id", categoryId)
    .eq("user_id", userId)
    .maybeSingle();
  if (readErr || !row) {
    return { ok: false, message: "Categoria não encontrada." };
  }

  const { data: prodRows, error: selProdErr } = await supabase
    .from("products")
    .select("id")
    .eq("user_id", userId)
    .eq("category_id", categoryId);
  if (selProdErr) {
    return { ok: false, message: selProdErr.message || "Falha ao listar produtos da categoria." };
  }
  const productIds = (prodRows ?? []).map((r) => (r as { id: string }).id);

  if (productIds.length > 0) {
    const { error: delProdErr } = await supabase
      .from("products")
      .delete()
      .eq("user_id", userId)
      .eq("category_id", categoryId);
    if (delProdErr) {
      return { ok: false, message: delProdErr.message || "Falha ao excluir os produtos da categoria." };
    }
  }

  for (const id of productIds) {
    removeLocalProduct(userId, id);
  }

  const { error: delErr } = await supabase.from("categories").delete().eq("id", categoryId).eq("user_id", userId);
  if (delErr) {
    return { ok: false, message: delErr.message || "Falha ao excluir a categoria." };
  }
  return { ok: true };
}

/** Só associa a "Geral" se essa categoria já existir (não cria "Geral" ao listar produtos). */
export async function linkUncategorizedProductsToGeral(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<void> {
  const { data: existing, error: selErr } = await supabase
    .from("categories")
    .select("id")
    .eq("user_id", userId)
    .eq("name", DEFAULT_CATEGORY_NAME)
    .maybeSingle();
  if (selErr || !existing?.id) return;
  const geralId = existing.id as string;
  const { error } = await supabase
    .from("products")
    .update({ category_id: geralId, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("category_id", null);
  if (error) {
    console.warn("[Caixa Fácil] linkUncategorizedProductsToGeral:", error.message, error);
  }
}
