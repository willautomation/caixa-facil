import { createClient } from "@/lib/supabase/client";
import { ensureDefaultGeralCategoryId, linkUncategorizedProductsToGeral } from "@/lib/categories-repository";
import { buildDefaultDemoProducts, DEMO_PRODUCT_DEFINITIONS } from "@/lib/demo-product-seed";
import { mapProductRow } from "@/lib/products";
import {
  applyStockDecrementLocal,
  readLocalProducts,
  removeLocalProduct,
  upsertLocalProduct,
  writeLocalProducts,
} from "@/lib/products-local-storage";
import { ensureSeedProducts } from "@/lib/seed-products";
import type { Product, ProductType } from "@/types/database";

type Row = Parameters<typeof mapProductRow>[0];

/** Ordem persistente (sort_order), depois nome. */
export function sortProductsForDisplay(products: Product[]): Product[] {
  return [...products].sort((a, b) => {
    const d = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    return d !== 0 ? d : a.name.localeCompare(b.name, "pt-BR");
  });
}

async function recalculateSortOrdersForCategory(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  categoryId: string
): Promise<void> {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("user_id", userId)
    .eq("category_id", categoryId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error || !data?.length) return;
  const now = new Date().toISOString();
  await Promise.all(
    data.map((row, index) =>
      supabase
        .from("products")
        .update({ sort_order: index, updated_at: now })
        .eq("id", (row as { id: string }).id)
        .eq("user_id", userId)
    )
  );
  const { data: fresh, error: againErr } = await supabase
    .from("products")
    .select("*")
    .eq("user_id", userId)
    .eq("category_id", categoryId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (againErr || !fresh) return;
  for (const r of fresh) {
    upsertLocalProduct(userId, mapProductRow(r as Row));
  }
}

/** Envia catálogo local para o Supabase (tabela vazia), preservando ids e timestamps quando existirem. */
async function pushLocalProductsToSupabase(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  local: Product[]
): Promise<boolean> {
  const geralId = await ensureDefaultGeralCategoryId(supabase, userId);
  const rows = local.map((p) => {
    const row: Record<string, unknown> = {
      id: p.id,
      user_id: userId,
      name: p.name,
      type: p.type,
      price: p.price,
      track_stock: p.track_stock,
      stock: p.stock,
      icon: p.icon,
      sort_order: p.sort_order ?? 0,
    };
    if (geralId) row.category_id = p.category_id ?? geralId;
    if (p.created_at) row.created_at = p.created_at;
    row.updated_at = p.updated_at ?? new Date().toISOString();
    return row;
  });

  const { error } = await supabase.from("products").upsert(rows, { onConflict: "id" });
  if (error) {
    console.warn("[Caixa Fácil] pushLocalProductsToSupabase:", error.message, error);
    return false;
  }
  return true;
}

async function fetchRemoteProducts(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<{ list: Product[]; ok: boolean }> {
  try {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw error;
    return { list: (data ?? []).map((r) => mapProductRow(r as Row)), ok: true };
  } catch (e) {
    console.warn("[Caixa Fácil] Carregar produtos no Supabase falhou; usando fallback local.", e);
    return { list: [], ok: false };
  }
}

/**
 * Carrega produtos: Supabase primeiro; se vazio no remoto mas houver local → sync automático;
 * se ambos vazios → seed; fallback local se o remoto falhar.
 */
export async function loadProductsCatalog(userId: string): Promise<Product[]> {
  const supabase = createClient();
  await linkUncategorizedProductsToGeral(supabase, userId);

  let { list: remote, ok: remoteOk } = await fetchRemoteProducts(supabase, userId);
  const local = readLocalProducts(userId);

  if (remoteOk && remote.length === 0 && local.length > 0) {
    console.info("[Caixa Fácil] sincronizando produtos locais para Supabase");
    const pushed = await pushLocalProductsToSupabase(supabase, userId, local);
    if (pushed) {
      const again = await fetchRemoteProducts(supabase, userId);
      if (again.ok && again.list.length > 0) {
        remote = again.list;
        console.info("[Caixa Fácil] produtos sincronizados com sucesso");
        writeLocalProducts(userId, remote);
        return sortProductsForDisplay(remote);
      }
    }
    console.warn("[Caixa Fácil] Sync local→Supabase não concluído; mantendo catálogo local.");
    return sortProductsForDisplay(local);
  }

  if (remoteOk && remote.length > 0) {
    console.info("[Caixa Fácil] Supabase já possui produtos, sync inicial ignorado");
    writeLocalProducts(userId, remote);
    return sortProductsForDisplay(remote);
  }

  if (remoteOk && remote.length === 0 && local.length === 0) {
    await ensureSeedProducts(supabase, userId);
    const seeded = await fetchRemoteProducts(supabase, userId);
    if (seeded.ok && seeded.list.length > 0) {
      remote = seeded.list;
      writeLocalProducts(userId, remote);
      return sortProductsForDisplay(remote);
    }
  }

  if (local.length > 0) {
    return sortProductsForDisplay(local);
  }

  const defaults = buildDefaultDemoProducts(userId);
  writeLocalProducts(userId, defaults);

  if (remoteOk) {
    try {
      const geralId = await ensureDefaultGeralCategoryId(supabase, userId);
      const rows = DEMO_PRODUCT_DEFINITIONS.map((row, index) => ({
        user_id: userId,
        name: row.name,
        type: row.type,
        price: row.price,
        track_stock: row.track_stock,
        stock: row.stock,
        icon: row.icon,
        sort_order: index,
        ...(geralId ? { category_id: geralId } : {}),
      }));
      await supabase.from("products").insert(rows);
    } catch (e) {
      console.warn("[Caixa Fácil] Inserir catálogo demo no Supabase ignorado:", e);
    }
  }

  return sortProductsForDisplay(defaults);
}

export type ProductSavePayload = {
  name: string;
  type: ProductType;
  price: number;
  track_stock: boolean;
  stock: number;
  icon: string | null;
  category_id: string | null;
};

/**
 * Cria ou atualiza produto no Supabase; em qualquer falha mantém cópia local atualizada.
 */
export async function saveProductToRepository(
  userId: string,
  editing: Product | null,
  payload: ProductSavePayload
): Promise<void> {
  const supabase = createClient();
  const geralId = await ensureDefaultGeralCategoryId(supabase, userId);
  const resolvedCategoryId = payload.category_id ?? geralId ?? null;
  const id = editing?.id ?? crypto.randomUUID();

  let sortOrder = editing?.sort_order ?? 0;
  if (!editing && resolvedCategoryId) {
    const { data: maxRow } = await supabase
      .from("products")
      .select("sort_order")
      .eq("user_id", userId)
      .eq("category_id", resolvedCategoryId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const maxSo =
      typeof maxRow?.sort_order === "number"
        ? maxRow.sort_order
        : Number((maxRow as { sort_order?: unknown } | null)?.sort_order ?? -1);
    sortOrder = (Number.isFinite(maxSo) ? maxSo : -1) + 1;
  }

  const full: Product = {
    id,
    user_id: userId,
    name: payload.name.trim(),
    type: payload.type,
    price: payload.price,
    track_stock: payload.track_stock,
    stock: payload.track_stock ? payload.stock : 0,
    icon: payload.icon,
    category_id: resolvedCategoryId,
    sort_order: sortOrder,
  };

  const row: Record<string, unknown> = {
    user_id: userId,
    name: full.name,
    type: full.type,
    price: full.price,
    track_stock: full.track_stock,
    stock: full.stock,
    icon: full.icon,
    sort_order: sortOrder,
  };
  if (resolvedCategoryId) row.category_id = resolvedCategoryId;

  try {
    if (editing) {
      const { error } = await supabase.from("products").update(row).eq("id", editing.id);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from("products").insert(row).select("id").single();
      if (error) throw error;
      if (data?.id) full.id = data.id as string;
    }
  } catch (e) {
    console.warn("[Caixa Fácil] Salvar produto no Supabase falhou; gravando só no localStorage.", e);
  }

  upsertLocalProduct(userId, full);
}

/**
 * Persiste ordem 0..n-1 na categoria (Supabase + cache local).
 */
export async function persistSortOrderForCategory(
  userId: string,
  categoryId: string,
  orderedProductIds: string[]
): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = createClient();
  const now = new Date().toISOString();
  for (let i = 0; i < orderedProductIds.length; i++) {
    const id = orderedProductIds[i]!;
    const { error } = await supabase
      .from("products")
      .update({ sort_order: i, updated_at: now })
      .eq("id", id)
      .eq("user_id", userId)
      .eq("category_id", categoryId);
    if (error) return { ok: false, message: error.message };
  }
  const { data: fresh, error: selErr } = await supabase
    .from("products")
    .select("*")
    .eq("user_id", userId)
    .eq("category_id", categoryId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (!selErr && fresh) {
    for (const r of fresh) upsertLocalProduct(userId, mapProductRow(r as Row));
  }
  return { ok: true };
}

/** Atualiza `category_id` e renumera `sort_order` nas duas categorias afetadas. */
export async function updateProductCategoryId(
  userId: string,
  product: Product,
  newCategoryId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = createClient();
  const geralId = await ensureDefaultGeralCategoryId(supabase, userId);
  const fromId = product.category_id ?? geralId ?? newCategoryId;
  if (fromId === newCategoryId) {
    return { ok: true };
  }
  const { error } = await supabase
    .from("products")
    .update({ category_id: newCategoryId, updated_at: new Date().toISOString() })
    .eq("id", product.id)
    .eq("user_id", userId);
  if (error) {
    return { ok: false, message: error.message || "Não foi possível mover o produto." };
  }
  upsertLocalProduct(userId, { ...product, category_id: newCategoryId });
  try {
    await recalculateSortOrdersForCategory(supabase, userId, fromId);
    await recalculateSortOrdersForCategory(supabase, userId, newCategoryId);
  } catch (e) {
    console.warn("[Caixa Fácil] Renumeração sort_order após mover categoria:", e);
  }
  return { ok: true };
}

export async function deleteProductFromRepository(userId: string, productId: string): Promise<void> {
  const supabase = createClient();
  const existing = readLocalProducts(userId).find((p) => p.id === productId);
  const geralId = await ensureDefaultGeralCategoryId(supabase, userId);
  const categoryId = existing?.category_id ?? geralId ?? null;
  try {
    const { error } = await supabase.from("products").delete().eq("id", productId);
    if (error) throw error;
  } catch (e) {
    console.warn("[Caixa Fácil] Excluir produto no Supabase falhou; removendo só do localStorage.", e);
  }
  removeLocalProduct(userId, productId);
  if (categoryId) {
    try {
      await recalculateSortOrdersForCategory(supabase, userId, categoryId);
    } catch {
      /* ignore */
    }
  }
}

/** Sincroniza estoque local após venda (mantém demo alinhada se o caixa usar o mesmo cache). */
export function syncStockAfterSale(userId: string, decrements: Map<string, number>): void {
  applyStockDecrementLocal(userId, decrements);
}

export type ProductStockSnapshot = {
  track_stock: boolean;
  stock: number;
};

/**
 * Resolve estoque para o carrinho: tenta Supabase, depois catálogo local (ids do demo/localStorage).
 * Retorna null se o item não existir em nenhum dos dois (venda ainda pode seguir sem checagem de estoque).
 */
export async function resolveProductStockForCart(
  userId: string,
  productId: string
): Promise<ProductStockSnapshot | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("products")
    .select("track_stock, stock")
    .eq("id", productId)
    .maybeSingle();
  if (!error && data) {
    return {
      track_stock: Boolean(data.track_stock),
      stock: Number((data as { stock?: unknown }).stock ?? 0),
    };
  }
  const local = readLocalProducts(userId).find((p) => p.id === productId);
  if (local) {
    return {
      track_stock: local.track_stock,
      stock: local.stock,
    };
  }
  return null;
}

/** IDs presentes na tabela `products` do Supabase (para FK em `sale_items.product_id`). */
export async function getRemoteProductIdsThatExist(
  supabase: ReturnType<typeof createClient>,
  productIds: string[]
): Promise<Set<string>> {
  const unique = [...new Set(productIds.filter((id) => typeof id === "string" && id.length > 0))];
  if (unique.length === 0) return new Set();
  const { data, error } = await supabase.from("products").select("id").in("id", unique);
  if (error) {
    console.warn("[Caixa Fácil] getRemoteProductIdsThatExist:", error.message, error);
    return new Set();
  }
  return new Set((data ?? []).map((r) => r.id as string));
}

/** Baixa estoque só no Supabase se a linha existir (produtos só locais são ignorados aqui). */
export async function applyRemoteStockDecrement(productId: string, decrement: number): Promise<void> {
  const supabase = createClient();
  const { data: row, error: selErr } = await supabase
    .from("products")
    .select("track_stock, stock")
    .eq("id", productId)
    .maybeSingle();
  if (selErr || !row?.track_stock) return;
  const next = Math.max(0, Number((row as { stock?: unknown }).stock ?? 0) - decrement);
  const { error: upErr } = await supabase
    .from("products")
    .update({ stock: next })
    .eq("id", productId);
  if (upErr) {
    console.warn("[Caixa Fácil] Falha ao baixar estoque no Supabase para o produto:", productId, upErr);
  }
}
