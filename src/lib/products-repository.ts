import { createClient } from "@/lib/supabase/client";
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

function sortByName(products: Product[]): Product[] {
  return [...products].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

/** Envia catálogo local para o Supabase (tabela vazia), preservando ids e timestamps quando existirem. */
async function pushLocalProductsToSupabase(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  local: Product[]
): Promise<boolean> {
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
    };
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
      .order("name");
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
        return sortByName(remote);
      }
    }
    console.warn("[Caixa Fácil] Sync local→Supabase não concluído; mantendo catálogo local.");
    return sortByName(local);
  }

  if (remoteOk && remote.length > 0) {
    console.info("[Caixa Fácil] Supabase já possui produtos, sync inicial ignorado");
    writeLocalProducts(userId, remote);
    return sortByName(remote);
  }

  if (remoteOk && remote.length === 0 && local.length === 0) {
    await ensureSeedProducts(supabase, userId);
    const seeded = await fetchRemoteProducts(supabase, userId);
    if (seeded.ok && seeded.list.length > 0) {
      remote = seeded.list;
      writeLocalProducts(userId, remote);
      return sortByName(remote);
    }
  }

  if (local.length > 0) {
    return sortByName(local);
  }

  const defaults = buildDefaultDemoProducts(userId);
  writeLocalProducts(userId, defaults);

  if (remoteOk) {
    try {
      const rows = DEMO_PRODUCT_DEFINITIONS.map((row) => ({
        user_id: userId,
        name: row.name,
        type: row.type,
        price: row.price,
        track_stock: row.track_stock,
        stock: row.stock,
        icon: row.icon,
      }));
      await supabase.from("products").insert(rows);
    } catch (e) {
      console.warn("[Caixa Fácil] Inserir catálogo demo no Supabase ignorado:", e);
    }
  }

  return sortByName(defaults);
}

export type ProductSavePayload = {
  name: string;
  type: ProductType;
  price: number;
  track_stock: boolean;
  stock: number;
  icon: string | null;
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
  const id = editing?.id ?? crypto.randomUUID();
  const full: Product = {
    id,
    user_id: userId,
    name: payload.name.trim(),
    type: payload.type,
    price: payload.price,
    track_stock: payload.track_stock,
    stock: payload.track_stock ? payload.stock : 0,
    icon: payload.icon,
  };

  const row = {
    user_id: userId,
    name: full.name,
    type: full.type,
    price: full.price,
    track_stock: full.track_stock,
    stock: full.stock,
    icon: full.icon,
  };

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

export async function deleteProductFromRepository(userId: string, productId: string): Promise<void> {
  const supabase = createClient();
  try {
    const { error } = await supabase.from("products").delete().eq("id", productId);
    if (error) throw error;
  } catch (e) {
    console.warn("[Caixa Fácil] Excluir produto no Supabase falhou; removendo só do localStorage.", e);
  }
  removeLocalProduct(userId, productId);
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
