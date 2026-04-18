import { createClient } from "@/lib/supabase/client";

/** Itens persistidos na coluna JSON `itens` da tabela `vendas`. */
export type VendaItemJson = {
  productId: string;
  productName: string;
  type: "manual" | "quantity" | "typed_value";
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

/**
 * Insere uma linha na tabela `vendas`.
 * Usa `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` via `createClient()`.
 * `created_at` fica a cargo do banco (default now).
 */
export async function saveVenda(params: {
  total: number;
  troco: number;
  itens: VendaItemJson[];
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("vendas").insert({
    dados: null,
    total: params.total,
    troco: params.troco,
    itens: params.itens,
  });
  if (error) {
    console.error("[Caixa Fácil] Falha ao salvar venda na tabela vendas:", error.message, error);
  }
}
