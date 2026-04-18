import { createClient } from "@/lib/supabase/client";
import { readLocalProducts, removeLocalProduct } from "@/lib/products-local-storage";
import type { Category } from "@/types/database";

export const DEFAULT_CATEGORY_NAME = "Geral";

const FALLBACK_CATEGORY_EMOJI_HINTS: [string, string][] = [
  ["beb", "🥤"],
  ["refrig", "🥤"],
  ["água", "💧"],
  ["sal", "🥟"],
  ["doc", "🍰"],
  ["pão", "🥖"],
  ["lim", "🧹"],
  ["cig", "🚬"],
  ["caf", "☕"],
];

export function isGeralCategoryName(name: string): boolean {
  return name.trim().toLowerCase() === DEFAULT_CATEGORY_NAME.toLowerCase();
}

/** Emoji sugerido pelo nome quando não há `icon` salvo (exceto Geral, tratado em `categoryDisplayIcon`). */
export function fallbackCategoryEmojiByName(name: string): string {
  const l = name.toLowerCase();
  for (const [hint, emoji] of FALLBACK_CATEGORY_EMOJI_HINTS) {
    if (l.includes(hint)) return emoji;
  }
  return "📂";
}

/** Ícone mostrado no Caixa: Geral sempre 📁; depois `icon` salvo; senão fallback por nome. */
export function categoryDisplayIcon(c: Pick<Category, "name" | "icon">): string {
  if (isGeralCategoryName(c.name)) return "📁";
  const t = (c.icon ?? "").trim();
  if (t) return t.slice(0, 16);
  return fallbackCategoryEmojiByName(c.name);
}

function parseCategoryIconField(r: Record<string, unknown>): string | null {
  const v = r.icon;
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, 16) : null;
}

function mapCategoryRow(r: Record<string, unknown>): Category {
  return {
    id: r.id as string,
    user_id: r.user_id as string,
    name: r.name as string,
    icon: parseCategoryIconField(r),
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
      .insert({ user_id: userId, name: DEFAULT_CATEGORY_NAME, icon: "📁" })
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
    "category_id, categories ( id, name, user_id, icon, created_at, updated_at )",
    "category_id, category:categories ( id, name, user_id, icon, created_at, updated_at )",
    "category_id, categories!products_category_id_fkey ( id, name, user_id, icon, created_at, updated_at )",
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

function resolvedCategoryIconForSave(name: string, rawIcon: string | null | undefined): string | null {
  if (isGeralCategoryName(name)) return "📁";
  if (rawIcon == null) return null;
  const t = rawIcon.trim();
  return t ? t.slice(0, 16) : null;
}

export async function createCategory(
  userId: string,
  rawName: string,
  rawIcon?: string | null
): Promise<CreateCategoryResult> {
  const name = rawName.trim();
  if (!name) {
    return { ok: false, message: "Informe um nome para a categoria." };
  }
  const icon = resolvedCategoryIconForSave(name, rawIcon);
  const supabase = createClient();
  const { data, error } = await supabase
    .from("categories")
    .insert({ user_id: userId, name, icon })
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

export type RenameCategoryResult =
  | { ok: true; category: Category }
  | { ok: false; message: string };

export async function renameCategory(
  userId: string,
  categoryId: string,
  rawName: string,
  rawIcon?: string | null
): Promise<RenameCategoryResult> {
  const name = rawName.trim();
  if (!name) {
    return { ok: false, message: "O nome não pode ser vazio." };
  }
  const icon = resolvedCategoryIconForSave(name, rawIcon);
  const supabase = createClient();
  const { data, error } = await supabase
    .from("categories")
    .update({ name, icon, updated_at: new Date().toISOString() })
    .eq("id", categoryId)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") {
      return { ok: false, message: "Já existe uma categoria com esse nome." };
    }
    return { ok: false, message: error.message || "Não foi possível renomear." };
  }
  if (!data) {
    return { ok: false, message: "Nenhuma linha atualizada (RLS ou categoria inexistente)." };
  }
  return { ok: true, category: mapCategoryRow(data as Record<string, unknown>) };
}

const DELETE_CATEGORY_LOG = "[Caixa Fácil][delete-category]";

/**
 * Exclui a categoria e todos os produtos que estão nela (Supabase + cache local).
 * Nenhuma categoria é bloqueada por nome (inclui "Geral").
 */
export async function deleteCategorySafe(userId: string, categoryId: string): Promise<SimpleOk> {
  const supabase = createClient();
  const log = (...parts: unknown[]) => console.log(DELETE_CATEGORY_LOG, ...parts);
  const logErr = (...parts: unknown[]) => console.error(DELETE_CATEGORY_LOG, ...parts);

  log("início exclusão", { userId, categoryId });

  const { data: row, error: readErr } = await supabase
    .from("categories")
    .select("id")
    .eq("id", categoryId)
    .eq("user_id", userId)
    .maybeSingle();
  if (readErr) {
    logErr("ler categoria: erro Supabase", readErr);
    return { ok: false, message: readErr.message || "Falha ao ler a categoria." };
  }
  if (!row) {
    logErr("ler categoria: nenhuma linha (RLS ou id/user_id incorreto)", { userId, categoryId });
    return { ok: false, message: "Categoria não encontrada." };
  }

  const localInCategory = readLocalProducts(userId).filter((p) => p.category_id === categoryId);
  log("produtos no localStorage nesta categoria", localInCategory.length);

  const { data: prodRows, error: selProdErr } = await supabase
    .from("products")
    .select("id")
    .eq("user_id", userId)
    .eq("category_id", categoryId);
  if (selProdErr) {
    logErr("select products: erro", selProdErr);
    return { ok: false, message: selProdErr.message || "Falha ao listar produtos da categoria." };
  }
  const remoteCount = (prodRows ?? []).length;
  log("select products no Supabase", { count: remoteCount });

  const { data: deletedProdRows, error: delProdErr } = await supabase
    .from("products")
    .delete()
    .eq("user_id", userId)
    .eq("category_id", categoryId)
    .select("id");
  if (delProdErr) {
    logErr("delete products: erro (ex.: RLS sem política para anon)", delProdErr);
    return { ok: false, message: delProdErr.message || "Falha ao excluir os produtos da categoria." };
  }
  log("delete products: ok", { linhasRemotas: deletedProdRows?.length ?? 0 });

  const localsToStrip = readLocalProducts(userId).filter((p) => p.category_id === categoryId);
  for (const p of localsToStrip) {
    removeLocalProduct(userId, p.id);
  }
  log("localStorage: removidos produtos da pasta", localsToStrip.length);

  const { data: deletedCatRows, error: delErr } = await supabase
    .from("categories")
    .delete()
    .eq("id", categoryId)
    .eq("user_id", userId)
    .select("id");
  if (delErr) {
    logErr("delete category: erro", delErr);
    return { ok: false, message: delErr.message || "Falha ao excluir a categoria." };
  }
  if (!deletedCatRows?.length) {
    logErr("delete category: 0 linhas afetadas (RLS ou registro inexistente)", { userId, categoryId });
    return {
      ok: false,
      message:
        "A categoria não foi removida no servidor (0 linhas). Verifique políticas RLS em `categories` para o seu usuário.",
    };
  }
  log("delete category: ok", { id: deletedCatRows[0]?.id });
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
