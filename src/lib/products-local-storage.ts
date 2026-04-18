import type { Product, ProductType } from "@/types/database";

const STORAGE_VERSION = 3;

/** Aceita JSON antigo com `stock_quantity`. */
function normalizeStoredProduct(raw: unknown, userId: string): Product | null {
  const r = raw as Record<string, unknown>;
  if (!r || typeof r.id !== "string" || typeof r.name !== "string" || r.user_id !== userId) {
    return null;
  }
  const type: ProductType =
    r.type === "quantity" ? "quantity" : r.type === "typed_value" ? "typed_value" : "manual";
  const stockVal = r.stock ?? r.stock_quantity;
  const stock = typeof stockVal === "number" ? stockVal : Number(stockVal ?? 0);
  const cat = r.category_id;
  const so = r.sort_order;
  const sortOrder =
    typeof so === "number" && Number.isFinite(so) ? so : Number(so ?? 0) || 0;
  return {
    id: r.id,
    user_id: r.user_id as string,
    name: r.name,
    type,
    price: typeof r.price === "number" ? r.price : Number(r.price ?? 0),
    track_stock: Boolean(r.track_stock),
    stock: Number.isFinite(stock) ? stock : 0,
    icon: typeof r.icon === "string" ? r.icon : null,
    category_id: typeof cat === "string" ? cat : null,
    sort_order: sortOrder,
    created_at: typeof r.created_at === "string" ? r.created_at : undefined,
    updated_at: typeof r.updated_at === "string" ? r.updated_at : undefined,
  };
}

function storageKey(userId: string): string {
  return `caixa-facil-products-v${STORAGE_VERSION}:${userId}`;
}

export function readLocalProducts(userId: string): Product[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data
      .map((raw) => normalizeStoredProduct(raw, userId))
      .filter((p): p is Product => p != null);
  } catch {
    return [];
  }
}

export function writeLocalProducts(userId: string, products: Product[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(products));
  } catch (e) {
    console.warn("[Caixa Fácil] Falha ao gravar produtos no localStorage:", e);
  }
}

export function upsertLocalProduct(userId: string, product: Product): Product[] {
  const list = readLocalProducts(userId);
  const idx = list.findIndex((p) => p.id === product.id);
  if (idx >= 0) list[idx] = product;
  else list.push(product);
  writeLocalProducts(userId, list);
  return list;
}

export function removeLocalProduct(userId: string, productId: string): Product[] {
  const list = readLocalProducts(userId).filter((p) => p.id !== productId);
  writeLocalProducts(userId, list);
  return list;
}

/** Após venda bem-sucedida, alinhar estoque no cache local. */
export function applyStockDecrementLocal(userId: string, decrements: Map<string, number>): void {
  const list = readLocalProducts(userId);
  if (list.length === 0) return;
  const next = list.map((p) => {
    const d = decrements.get(p.id);
    if (d == null || !p.track_stock) return p;
    return { ...p, stock: Math.max(0, p.stock - d) };
  });
  writeLocalProducts(userId, next);
}

/** Ao excluir venda, devolver quantidade ao estoque no cache local. */
export function applyStockRestoreLocal(userId: string, increments: Map<string, number>): void {
  const list = readLocalProducts(userId);
  if (list.length === 0) return;
  const next = list.map((p) => {
    const add = increments.get(p.id);
    if (add == null || !p.track_stock) return p;
    return { ...p, stock: Math.max(0, p.stock + add) };
  });
  writeLocalProducts(userId, next);
}
