"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveEffectiveUserId } from "@/lib/effective-user";
import { saveProductToRepository } from "@/lib/products-repository";
import type { ProductType } from "@/types/database";

type Props = {
  open: boolean;
  categoryId: string;
  categoryName: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

export function CaixaProductModal({ open, categoryId, categoryName, onClose, onSaved }: Props) {
  const [name, setName] = useState("");
  const [type, setType] = useState<ProductType>("quantity");
  const [price, setPrice] = useState("0");
  const [trackStock, setTrackStock] = useState(false);
  const [stock, setStock] = useState("0");
  const [icon, setIcon] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setType("quantity");
      setPrice("0");
      setTrackStock(false);
      setStock("0");
      setIcon("");
      setError(null);
      setSaving(false);
    }
  }, [open]);

  if (!open) return null;

  const parsePrice = () => {
    const t = price.replace(/\./g, "").replace(",", ".");
    const n = Number(t);
    return Number.isFinite(n) ? n : 0;
  };

  const parseStock = () => {
    const n = parseInt(stock || "0", 10);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  };

  const save = async () => {
    if (!name.trim()) {
      setError("Informe o nome do produto.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const { userId, errorMessage } = await resolveEffectiveUserId(supabase);
      if (!userId) throw new Error(errorMessage ?? "Não foi possível identificar o usuário.");
      await saveProductToRepository(userId, null, {
        name: name.trim(),
        type,
        price: parsePrice(),
        track_stock: trackStock,
        stock: trackStock ? parseStock() : 0,
        icon: icon.trim() || null,
        category_id: categoryId,
      });
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-xl font-bold text-slate-900">Novo produto</h2>
        <p className="mt-1 text-sm text-slate-600">
          Categoria: <span className="font-semibold text-slate-800">{categoryName}</span>
        </p>
        <div className="mt-4 space-y-4">
          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
              {error}
            </p>
          ) : null}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="caixa-prod-nome">
              Nome
            </label>
            <input
              id="caixa-prod-nome"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none ring-emerald-500 focus:ring-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">Tipo</span>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3">
                <input type="radio" name="caixa-tipo" checked={type === "manual"} onChange={() => setType("manual")} />
                Valor manual
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3">
                <input
                  type="radio"
                  name="caixa-tipo"
                  checked={type === "typed_value"}
                  onChange={() => setType("typed_value")}
                />
                Valor digitado na hora
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3">
                <input type="radio" name="caixa-tipo" checked={type === "quantity"} onChange={() => setType("quantity")} />
                Quantidade
              </label>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="caixa-prod-preco">
              {type === "quantity" ? "Preço unitário" : "Preço de referência"}
            </label>
            <input
              id="caixa-prod-preco"
              inputMode="decimal"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none ring-emerald-500 focus:ring-2"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-slate-800">
            <input type="checkbox" checked={trackStock} onChange={(e) => setTrackStock(e.target.checked)} />
            Controla estoque
          </label>
          {trackStock ? (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="caixa-prod-estoque">
                Estoque atual
              </label>
              <input
                id="caixa-prod-estoque"
                inputMode="numeric"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none ring-emerald-500 focus:ring-2"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
              />
            </div>
          ) : null}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="caixa-prod-icone">
              Ícone (emoji opcional)
            </label>
            <input
              id="caixa-prod-icone"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none ring-emerald-500 focus:ring-2"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="🥖"
            />
          </div>
        </div>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="min-h-12 rounded-xl border border-slate-300 px-6 font-semibold text-slate-800 hover:bg-slate-50"
            disabled={saving}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving}
            className="min-h-12 rounded-xl bg-emerald-600 px-6 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            onClick={() => void save()}
          >
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
