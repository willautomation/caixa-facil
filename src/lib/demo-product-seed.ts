import type { Product, ProductType } from "@/types/database";

export type DemoSeedRow = {
  name: string;
  type: ProductType;
  price: number;
  track_stock: boolean;
  stock: number;
  icon: string;
};

/** Catálogo inicial de demonstração (sem ids — gerados ao materializar). */
export const DEMO_PRODUCT_DEFINITIONS: DemoSeedRow[] = [
  { name: "Pão francês", type: "manual", price: 14.99, track_stock: false, stock: 0, icon: "🥖" },
  { name: "Queijo mussarela", type: "manual", price: 42.0, track_stock: false, stock: 0, icon: "🧀" },
  { name: "Presunto", type: "manual", price: 36.0, track_stock: false, stock: 0, icon: "🍖" },
  { name: "Bolo simples", type: "manual", price: 22.0, track_stock: false, stock: 0, icon: "🍰" },
  { name: "Pão de queijo", type: "manual", price: 24.0, track_stock: false, stock: 0, icon: "🧀" },
  { name: "Cueca virada", type: "manual", price: 18.0, track_stock: false, stock: 0, icon: "🍩" },
  { name: "Refrigerante 2L", type: "quantity", price: 8.9, track_stock: true, stock: 10, icon: "🥤" },
  { name: "Água 500ml", type: "quantity", price: 3.0, track_stock: true, stock: 20, icon: "💧" },
  { name: "Café pequeno", type: "quantity", price: 4.5, track_stock: false, stock: 0, icon: "☕" },
  { name: "Café grande", type: "quantity", price: 6.5, track_stock: false, stock: 0, icon: "☕" },
  { name: "Coxinha", type: "quantity", price: 6.5, track_stock: false, stock: 0, icon: "🍗" },
  { name: "Pastel", type: "quantity", price: 7.5, track_stock: false, stock: 0, icon: "🥟" },
  { name: "Esfiha", type: "quantity", price: 5.5, track_stock: false, stock: 0, icon: "🫓" },
  { name: "Sonho", type: "quantity", price: 6.0, track_stock: false, stock: 0, icon: "🍰" },
  { name: "Bolacha recheada", type: "quantity", price: 4.5, track_stock: true, stock: 15, icon: "🍪" },
  { name: "Margarina 500g", type: "quantity", price: 8.0, track_stock: true, stock: 8, icon: "🧈" },
];

export function buildDefaultDemoProducts(userId: string): Product[] {
  return DEMO_PRODUCT_DEFINITIONS.map((row, index) => ({
    id: crypto.randomUUID(),
    user_id: userId,
    name: row.name,
    type: row.type,
    price: row.price,
    track_stock: row.track_stock,
    stock: row.stock,
    icon: row.icon,
    category_id: null,
    sort_order: index,
  }));
}
