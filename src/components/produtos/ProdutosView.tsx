"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveEffectiveUserId } from "@/lib/effective-user";
import {
  deleteProductFromRepository,
  loadProductsCatalog,
  saveProductToRepository,
} from "@/lib/products-repository";
import { formatBRL } from "@/lib/money";
import type { Product, ProductType } from "@/types/database";

export function ProdutosView() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<ProductType>("quantity");
  const [price, setPrice] = useState("0");
  const [trackStock, setTrackStock] = useState(false);
  const [stock, setStock] = useState("0");
  const [icon, setIcon] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const supabase = createClient();
      const { userId, errorMessage } = await resolveEffectiveUserId(supabase);
      if (!userId) {
        setError(errorMessage ?? "Não foi possível identificar o usuário.");
        setProducts([]);
        return;
      }
      const list = await loadProductsCatalog(userId);
      setProducts(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setCreating(true);
    setName("");
    setType("quantity");
    setPrice("0");
    setTrackStock(false);
    setStock("0");
    setIcon("");
  };

  const openEdit = (p: Product) => {
    setCreating(false);
    setEditing(p);
    setName(p.name);
    setType(p.type);
    setPrice(String(p.price).replace(".", ","));
    setTrackStock(p.track_stock);
    setStock(String(p.stock));
    setIcon(p.icon ?? "");
  };

  const closeForm = () => {
    setEditing(null);
    setCreating(false);
  };

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
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const { userId, errorMessage } = await resolveEffectiveUserId(supabase);
      if (!userId) throw new Error(errorMessage ?? "Não foi possível identificar o usuário.");
      await saveProductToRepository(userId, editing, {
        name: name.trim(),
        type,
        price: parsePrice(),
        track_stock: trackStock,
        stock: trackStock ? parseStock() : 0,
        icon: icon.trim() || null,
      });
      closeForm();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p: Product) => {
    if (!confirm(`Excluir "${p.name}"?`)) return;
    setError(null);
    try {
      const supabase = createClient();
      const { userId, errorMessage } = await resolveEffectiveUserId(supabase);
      if (!userId) throw new Error(errorMessage ?? "Não foi possível identificar o usuário.");
      await deleteProductFromRepository(userId, p.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao excluir");
    }
  };

  if (loading) {
    return <p className="text-slate-600">Carregando…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Produtos</h1>
        <button
          type="button"
          className="min-h-12 rounded-xl bg-emerald-600 px-6 text-lg font-semibold text-white hover:bg-emerald-700"
          onClick={openCreate}
        >
          Novo produto
        </button>
      </div>

      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      <ul className="space-y-3">
        {products.map((p) => (
          <li
            key={p.id}
            className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">{p.icon ?? "📦"}</span>
              <div>
                <p className="font-semibold text-slate-900">{p.name}</p>
                <p className="text-sm text-slate-600">
                  {p.type === "manual"
                    ? p.price > 0
                      ? `Valor manual — ref. ${formatBRL(p.price)}`
                      : "Valor manual"
                    : p.type === "typed_value"
                      ? p.price > 0
                        ? `Valor digitado na hora — ref. ${formatBRL(p.price)}`
                        : "Valor digitado na hora"
                      : `Quantidade — ${formatBRL(p.price)} / un.`}
                </p>
                {p.track_stock ? (
                  <p className="text-sm text-slate-600">Estoque: {p.stock}</p>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-xl bg-slate-100 px-4 py-3 font-semibold text-slate-800 hover:bg-slate-200"
                onClick={() => openEdit(p)}
              >
                Editar
              </button>
              <button
                type="button"
                className="rounded-xl bg-red-50 px-4 py-3 font-semibold text-red-700 hover:bg-red-100"
                onClick={() => void remove(p)}
              >
                Excluir
              </button>
            </div>
          </li>
        ))}
      </ul>

      {creating || editing ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-xl font-bold text-slate-900">{editing ? "Editar produto" : "Novo produto"}</h2>
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="nome">
                  Nome
                </label>
                <input
                  id="nome"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none ring-emerald-500 focus:ring-2"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <span className="mb-1 block text-sm font-medium text-slate-700">Tipo</span>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3">
                    <input
                      type="radio"
                      name="tipo"
                      checked={type === "manual"}
                      onChange={() => setType("manual")}
                    />
                    Valor manual
                  </label>
                  <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3">
                    <input
                      type="radio"
                      name="tipo"
                      checked={type === "typed_value"}
                      onChange={() => setType("typed_value")}
                    />
                    Valor digitado na hora
                  </label>
                  <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3">
                    <input
                      type="radio"
                      name="tipo"
                      checked={type === "quantity"}
                      onChange={() => setType("quantity")}
                    />
                    Quantidade
                  </label>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="preco">
                  {type === "quantity" ? "Preço unitário" : "Preço de referência"}
                </label>
                <input
                  id="preco"
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
                  <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="estoque">
                    Estoque atual
                  </label>
                  <input
                    id="estoque"
                    inputMode="numeric"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none ring-emerald-500 focus:ring-2"
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                  />
                </div>
              ) : null}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="icone">
                  Ícone (emoji opcional)
                </label>
                <input
                  id="icone"
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
                onClick={closeForm}
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
      ) : null}
    </div>
  );
}
