export type ProductType = "manual" | "quantity" | "typed_value";

export interface Category {
  id: string;
  user_id: string;
  name: string;
  /** Emoji/ícone salvo; null = usar fallback por nome na UI (exceto "Geral" = 📁). */
  icon: string | null;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  user_id: string;
  name: string;
  type: ProductType;
  price: number;
  track_stock: boolean;
  stock: number;
  icon: string | null;
  /** null ou ausente = tratado como categoria "Geral" na UI */
  category_id: string | null;
  /** Ordem dentro da categoria (0 = primeiro). Persistido no Supabase. */
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface Sale {
  id: string;
  user_id: string;
  total: number;
  payment_method?: string | null;
  amount_received: number;
  change_amount: number;
  created_at: string;
}

/** Linha de `sale_items` conforme schema Supabase (sem line_type / unit_price). */
export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  /** Preço unitário (coluna `price` no banco). */
  price: number;
  line_total: number;
  created_at?: string;
}

export interface DailyClosure {
  id: string;
  user_id: string;
  closure_date: string;
  total_day: number;
  sale_count: number;
  product_summary: ProductSummaryEntry[];
  closed_at: string;
}

export interface ProductSummaryEntry {
  product_id: string | null;
  name: string;
  quantity: number;
  total: number;
}

export interface CartLine {
  id: string;
  productId: string;
  productName: string;
  type: ProductType;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}
