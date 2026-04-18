import { createClient } from "@/lib/supabase/client";
import { applyStockRestoreLocal } from "@/lib/products-local-storage";

type SaleItemRow = { product_id: string | null; quantity: string | number };

function num(v: string | number): number {
  return typeof v === "string" ? Number(v) : v;
}

/** Soma quantidades devolvidas por produto (só linhas com product_id). */
export function aggregateRestoreQuantities(items: SaleItemRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) {
    if (!it.product_id) continue;
    const q = num(it.quantity);
    if (!Number.isFinite(q) || q <= 0) continue;
    m.set(it.product_id, (m.get(it.product_id) ?? 0) + q);
  }
  return m;
}

/**
 * Devolve estoque no Supabase (produtos com track_stock) e no localStorage.
 */
export async function restoreStockAfterSaleDeletion(
  userId: string,
  increments: Map<string, number>
): Promise<void> {
  if (increments.size === 0) return;
  const supabase = createClient();
  for (const [productId, qty] of increments) {
    const { data: row, error: selErr } = await supabase
      .from("products")
      .select("track_stock, stock")
      .eq("id", productId)
      .maybeSingle();
    if (selErr || !row?.track_stock) continue;
    const current = Number((row as { stock?: unknown }).stock ?? 0);
    const next = current + qty;
    const { error: upErr } = await supabase.from("products").update({ stock: next }).eq("id", productId);
    if (upErr) {
      console.warn("[Caixa Fácil] Exclusão de venda: falha ao restaurar estoque remoto", productId, upErr);
    }
  }
  applyStockRestoreLocal(userId, increments);
}

/**
 * Exclui uma venda: restaura estoque, remove sale_items e sales (RLS com user_id).
 */
export async function deleteSaleById(
  userId: string,
  saleId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = createClient();
  try {
    const { data: items, error: fetchErr } = await supabase
      .from("sale_items")
      .select("product_id, quantity")
      .eq("sale_id", saleId);
    if (fetchErr) {
      return { ok: false, message: fetchErr.message };
    }
    const rows = (items ?? []) as SaleItemRow[];
    const increments = aggregateRestoreQuantities(rows);
    await restoreStockAfterSaleDeletion(userId, increments);

    const { error: delItemsErr } = await supabase.from("sale_items").delete().eq("sale_id", saleId);
    if (delItemsErr) {
      console.warn("[Caixa Fácil] Exclusão de venda: sale_items", delItemsErr);
    }

    const { error: delSaleErr } = await supabase.from("sales").delete().eq("id", saleId).eq("user_id", userId);
    if (delSaleErr) {
      return { ok: false, message: delSaleErr.message };
    }

    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[Caixa Fácil] Erro ao excluir venda:", e);
    return { ok: false, message };
  }
}
