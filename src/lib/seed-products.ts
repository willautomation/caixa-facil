import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureDefaultGeralCategoryId } from "@/lib/categories-repository";
import { DEMO_PRODUCT_DEFINITIONS } from "@/lib/demo-product-seed";

/** Compatível com código legado — mesmo catálogo da demo. */
export const SEED_PRODUCTS = DEMO_PRODUCT_DEFINITIONS;

/**
 * Insere o catálogo inicial no Supabase se ainda não houver produtos.
 * Nunca lança: falhas de rede/RLS são ignoradas (fallback local no repositório).
 */
export async function ensureSeedProducts(supabase: SupabaseClient, userId: string): Promise<void> {
  try {
    const { count, error: countError } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    if (countError) {
      console.warn("[Caixa Fácil] ensureSeedProducts contagem:", countError.message);
      return;
    }
    if ((count ?? 0) > 0) return;

    const geralId = await ensureDefaultGeralCategoryId(supabase, userId);
    const rows = DEMO_PRODUCT_DEFINITIONS.map((p, index) => ({
      user_id: userId,
      name: p.name,
      type: p.type,
      price: p.price,
      track_stock: p.track_stock,
      stock: p.stock,
      icon: p.icon,
      sort_order: index,
      ...(geralId ? { category_id: geralId } : {}),
    }));

    const { error } = await supabase.from("products").insert(rows);
    if (error) {
      console.warn("[Caixa Fácil] ensureSeedProducts insert:", error.message);
    }
  } catch (e) {
    console.warn("[Caixa Fácil] ensureSeedProducts:", e);
  }
}
