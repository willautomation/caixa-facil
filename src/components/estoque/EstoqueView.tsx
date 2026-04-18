"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveEffectiveUserId } from "@/lib/effective-user";
import { loadProductsCatalog } from "@/lib/products-repository";
import { isLowStock, LOW_STOCK_THRESHOLD } from "@/lib/products";
import type { Product } from "@/types/database";

export function EstoqueView() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const supabase = createClient();
      const { userId, errorMessage } = await resolveEffectiveUserId(supabase);
      if (!userId) {
        setError(errorMessage ?? "Não foi possível identificar o usuário.");
        return;
      }
      const all = await loadProductsCatalog(userId);
      setProducts(all.filter((p) => p.track_stock));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar estoque");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="text-slate-600">Carregando…</p>;
  }

  const low = products.filter((p) => isLowStock(p));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Estoque</h1>
      <p className="text-slate-600">
        Estoque baixo: quantidade em até {LOW_STOCK_THRESHOLD} unidades (somente produtos com controle de estoque).
      </p>

      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      {low.length > 0 ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-lg font-semibold text-amber-900">Atenção — estoque baixo</h2>
          <ul className="mt-2 list-inside list-disc text-amber-950">
            {low.map((p) => (
              <li key={p.id}>
                {p.icon ? `${p.icon} ` : ""}
                {p.name}: {p.stock} un.
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-600 shadow-sm">
          Nenhum produto com estoque baixo no momento.
        </p>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <h2 className="border-b border-slate-100 px-4 py-3 text-lg font-semibold text-slate-900">
          Produtos com controle de estoque
        </h2>
        {products.length === 0 ? (
          <p className="p-4 text-slate-600">Nenhum produto com controle de estoque.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {products.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 px-4 py-4">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{p.icon ?? "📦"}</span>
                  <span className="font-medium text-slate-900">{p.name}</span>
                </div>
                <span
                  className={`text-lg font-semibold ${isLowStock(p) ? "text-amber-700" : "text-slate-800"}`}
                >
                  {p.stock}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
