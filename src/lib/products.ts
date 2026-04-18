import type { Product } from "@/types/database";

export function mapProductRow(row: {
  id: string;
  user_id: string;
  name: string;
  type: string;
  price: string | number;
  track_stock: boolean;
  stock?: number | string;
  /** legado / cache antigo */
  stock_quantity?: number | string;
  icon: string | null;
  category_id?: string | null;
}): Product {
  const rawStock = row.stock ?? row.stock_quantity;
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    type:
      row.type === "quantity"
        ? "quantity"
        : row.type === "typed_value"
          ? "typed_value"
          : "manual",
    price: typeof row.price === "string" ? Number(row.price) : row.price,
    track_stock: row.track_stock,
    stock: typeof rawStock === "string" ? Number(rawStock) : Number(rawStock ?? 0),
    icon: row.icon,
    category_id: typeof row.category_id === "string" ? row.category_id : null,
  };
}

export const LOW_STOCK_THRESHOLD = 5;

export function isLowStock(p: Pick<Product, "track_stock" | "stock">): boolean {
  return p.track_stock && p.stock <= LOW_STOCK_THRESHOLD;
}
