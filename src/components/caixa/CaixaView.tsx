"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { NumericKeypad } from "@/components/NumericKeypad";
import { createClient } from "@/lib/supabase/client";
import { resolveEffectiveUserId } from "@/lib/effective-user";
import { CategoryNameModal } from "@/components/categories/CategoryNameModal";
import {
  createCategory,
  DEFAULT_CATEGORY_NAME,
  loadCategoriesForCaixa,
} from "@/lib/categories-repository";
import {
  applyRemoteStockDecrement,
  getRemoteProductIdsThatExist,
  loadProductsCatalog,
  resolveProductStockForCart,
  syncStockAfterSale,
} from "@/lib/products-repository";
import { saveVenda } from "@/lib/vendas";
import { formatBRL, parseMoneyInput } from "@/lib/money";
import type { CartLine, Category, Product } from "@/types/database";

type KeypadTarget = {
  product: Product;
} | null;

/** Tipos que abrem o teclado em modo valor (manual) antes de ir ao carrinho. */
function usesManualValueKeypad(p: Pick<Product, "type">): boolean {
  return p.type === "manual" || p.type === "typed_value";
}

function vendingErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const o = err as { message?: string; details?: string; hint?: string };
    const parts = [o.message, o.details, o.hint].filter(Boolean);
    if (parts.length) return parts.join(" — ");
  }
  return String(err);
}

export function CaixaView() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<"all" | string>("all");
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [keypadTarget, setKeypadTarget] = useState<KeypadTarget>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [receivedRaw, setReceivedRaw] = useState("");
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);

  const loadProducts = useCallback(async () => {
    setLoadError(null);
    try {
      const supabase = createClient();
      const { userId, errorMessage } = await resolveEffectiveUserId(supabase);
      if (!userId) {
        setLoadError(errorMessage ?? "Não foi possível identificar o usuário.");
        return;
      }
      const list = await loadProductsCatalog(userId);
      const cats = await loadCategoriesForCaixa(userId);
      setProducts(list);
      setCategories(cats);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Erro ao carregar produtos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const geralCategoryId = useMemo(
    () =>
      categories.find((c) => c.name.trim().toLowerCase() === DEFAULT_CATEGORY_NAME.toLowerCase())?.id ?? null,
    [categories]
  );

  const byCategory = useMemo(() => {
    if (categoryFilter === "all") return products;
    return products.filter((p) => {
      const effective = p.category_id ?? geralCategoryId;
      return effective === categoryFilter;
    });
  }, [products, categoryFilter, geralCategoryId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return byCategory;
    return byCategory.filter((p) => p.name.toLowerCase().includes(q));
  }, [byCategory, search]);

  const total = useMemo(
    () => cart.reduce((acc, line) => acc + line.lineTotal, 0),
    [cart]
  );

  const received = parseMoneyInput(receivedRaw);
  const change = Math.max(0, received - total);

  const usedInCartForProduct = (productId: string) =>
    cart
      .filter((c) => c.productId === productId)
      .reduce((sum, c) => sum + (c.type === "quantity" ? c.quantity : 1), 0);

  const addLine = (product: Product, value: number) => {
    if (usesManualValueKeypad(product)) {
      const need = usedInCartForProduct(product.id) + 1;
      if (product.track_stock && product.stock < need) {
        setLoadError(`Estoque insuficiente para ${product.name}.`);
        return;
      }
      const line: CartLine = {
        id: crypto.randomUUID(),
        productId: product.id,
        productName: product.name,
        type: product.type === "typed_value" ? "typed_value" : "manual",
        quantity: 1,
        unitPrice: value,
        lineTotal: value,
      };
      setCart((c) => [...c, line]);
      return;
    }
    const qty = Math.floor(value);
    if (qty <= 0) return;
    const need = usedInCartForProduct(product.id) + qty;
    if (product.track_stock && product.stock < need) {
      setLoadError(`Estoque insuficiente para ${product.name}.`);
      return;
    }
    const lineTotal = qty * product.price;
    const line: CartLine = {
      id: crypto.randomUUID(),
      productId: product.id,
      productName: product.name,
      type: "quantity",
      quantity: qty,
      unitPrice: product.price,
      lineTotal: lineTotal,
    };
    setCart((c) => [...c, line]);
  };

  const onKeypadConfirm = (value: number) => {
    if (!keypadTarget) return;
    addLine(keypadTarget.product, value);
    setKeypadTarget(null);
    setLoadError(null);
  };

  const removeLine = (id: string) => {
    setCart((c) => c.filter((l) => l.id !== id));
  };

  const clearCart = () => {
    setCart([]);
    setPaymentOpen(false);
    setReceivedRaw("");
    setFinalizeError(null);
  };

  const finalizeSale = async () => {
    setFinalizeError(null);
    if (cart.length === 0) return;
    if (received < total) {
      setFinalizeError("Valor recebido deve ser maior ou igual ao total.");
      return;
    }
    setFinalizing(true);
    try {
      console.info("[Caixa Fácil] Venda: início", {
        itensNoCarrinho: cart.length,
        total,
        recebido: received,
        troco: change,
      });

      const supabase = createClient();
      const { userId, errorMessage } = await resolveEffectiveUserId(supabase);
      if (!userId) {
        const msg = errorMessage ?? "Não foi possível identificar o usuário.";
        console.error("[Caixa Fácil] Erro real na venda:", msg);
        setFinalizeError(msg);
        return;
      }

      const neededByProduct = new Map<string, number>();
      for (const line of cart) {
        if (!line?.productId) {
          console.warn("[Caixa Fácil] Venda: linha do carrinho sem productId ignorada na contagem de estoque", line);
          continue;
        }
        const dec = line.type === "quantity" ? line.quantity : 1;
        neededByProduct.set(line.productId, (neededByProduct.get(line.productId) ?? 0) + dec);
      }

      console.info("[Caixa Fácil] Venda: validação de estoque — necessidade por produto", Object.fromEntries(neededByProduct));

      for (const [productId, dec] of neededByProduct) {
        const snap = await resolveProductStockForCart(userId, productId);
        if (!snap) {
          console.warn(
            "[Caixa Fácil] Venda: produto não encontrado no catálogo (local/remoto); sem checagem de estoque para este id:",
            productId
          );
          continue;
        }
        if (!snap.track_stock) continue;
        if (snap.stock < dec) {
          const msg = "Estoque insuficiente para um ou mais produtos.";
          console.error("[Caixa Fácil] Erro real na venda:", msg, { productId, dec, stock: snap.stock });
          setFinalizeError(msg);
          return;
        }
      }

      console.info("[Caixa Fácil] Venda: validação de estoque concluída");

      console.info("[Caixa Fácil] Venda: inserindo registro em sales");
      const { data: sale, error: saleErr } = await supabase
        .from("sales")
        .insert({
          user_id: userId,
          total,
          payment_method: "dinheiro",
          amount_received: received,
          change_amount: change,
        })
        .select("id")
        .single();

      if (saleErr || !sale) {
        console.error("[Caixa Fácil] Erro real na venda (sales):", saleErr ?? "sem id retornado", saleErr);
        throw saleErr ?? new Error("Falha ao registrar venda.");
      }
      console.info("[Caixa Fácil] Venda: sales OK", { saleId: sale.id });

      const productIdsForFk = [...neededByProduct.keys()];
      const validRemoteProductIds = await getRemoteProductIdsThatExist(supabase, productIdsForFk);
      console.info("[Caixa Fácil] Venda: productIds no carrinho vs existentes no Supabase", {
        carrinho: productIdsForFk,
        existentesNoRemoto: [...validRemoteProductIds],
      });

      const items = cart
        .filter((line) => line?.productName != null)
        .map((line) => ({
          sale_id: sale.id,
          product_id:
            line.productId && validRemoteProductIds.has(line.productId) ? line.productId : null,
          product_name: line.productName,
          quantity: line.quantity,
          price: line.unitPrice,
          line_total: line.lineTotal,
        }));

      console.info("[Caixa Fácil] Venda: inserindo sale_items", { quantidade: items.length });
      const { error: itemsErr } = await supabase.from("sale_items").insert(items);
      if (itemsErr) {
        console.error("[Caixa Fácil] Erro real na venda (sale_items):", itemsErr.message, itemsErr);
        throw itemsErr;
      }
      console.info("[Caixa Fácil] Venda: sale_items OK");

      console.info("[Caixa Fácil] Venda: atualização de estoque remoto");
      for (const [productId, dec] of neededByProduct) {
        await applyRemoteStockDecrement(productId, dec);
      }
      console.info("[Caixa Fácil] Venda: atualização de estoque remoto concluída");

      const itensJson = cart
        .filter((line) => line?.productId)
        .map((line) => ({
          productId: line.productId,
          productName: line.productName,
          type: line.type,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          lineTotal: line.lineTotal,
        }));
      console.info("[Caixa Fácil] Venda: gravando em vendas (tabela opcional)");
      await saveVenda({ total, troco: change, itens: itensJson });

      console.info("[Caixa Fácil] Venda: syncStockAfterSale (localStorage)");
      syncStockAfterSale(userId, neededByProduct);

      console.info("[Caixa Fácil] Venda: finalização OK");
      clearCart();
      await loadProducts();
    } catch (e) {
      console.error("[Caixa Fácil] Erro real na venda:", e);
      const msg = vendingErrorMessage(e);
      setFinalizeError(msg.length > 0 ? msg : "Erro ao finalizar venda.");
    } finally {
      setFinalizing(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center text-slate-600 shadow">Carregando…</div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Caixa</h1>
      {loadError ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-red-800" role="alert">
          {loadError}
        </p>
      ) : null}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <section className="flex-1 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-2 shadow-sm">
            <div className="-mx-0.5 flex flex-nowrap items-center gap-2 overflow-x-auto pb-0.5 pt-0.5">
              <button
                type="button"
                onClick={() => setCategoryFilter("all")}
                className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  categoryFilter === "all"
                    ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-800 hover:border-emerald-300"
                }`}
              >
                Todos
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryFilter(c.id)}
                  className={`max-w-[10rem] shrink-0 truncate rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    categoryFilter === c.id
                      ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
                      : "border-slate-200 bg-white text-slate-800 hover:border-emerald-300"
                  }`}
                  title={c.name}
                >
                  {c.name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setNewCategoryOpen(true)}
                className="shrink-0 rounded-full border border-dashed border-emerald-400 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
              >
                + Nova categoria
              </button>
            </div>
          </div>
          <input
            type="search"
            placeholder="Buscar produto…"
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none ring-emerald-500 focus:ring-2"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setKeypadTarget({ product: p })}
                className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm transition hover:border-emerald-300 hover:shadow-md active:bg-slate-50"
              >
                <span className="text-3xl" aria-hidden>
                  {p.icon ?? "📦"}
                </span>
                <span className="text-sm font-semibold text-slate-800">{p.name}</span>
                {p.type === "quantity" ? (
                  <span className="text-xs text-slate-500">{formatBRL(p.price)} / un.</span>
                ) : p.type === "typed_value" ? (
                  <span className="text-xs text-slate-500">
                    {p.price > 0 ? `Ref. ${formatBRL(p.price)}` : "Digite o valor"}
                  </span>
                ) : p.price > 0 ? (
                  <span className="text-xs text-slate-500">Ref. {formatBRL(p.price)}</span>
                ) : (
                  <span className="text-xs text-slate-500">Valor manual</span>
                )}
              </button>
            ))}
          </div>
        </section>

        <aside className="w-full shrink-0 space-y-4 lg:w-96">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Carrinho</h2>
            {cart.length === 0 ? (
              <p className="mt-4 text-slate-500">Nenhum item ainda.</p>
            ) : (
              <ul className="mt-4 divide-y divide-slate-100">
                {cart.map((line) => (
                  <li key={line.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div>
                      <p className="font-medium text-slate-900">{line.productName}</p>
                      <p className="text-sm text-slate-600">
                        {line.type === "manual" || line.type === "typed_value"
                          ? `Valor ${formatBRL(line.lineTotal)}`
                          : `${line.quantity} × ${formatBRL(line.unitPrice)}`}
                      </p>
                      <p className="text-sm font-semibold text-emerald-700">{formatBRL(line.lineTotal)}</p>
                    </div>
                    <button
                      type="button"
                      className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
                      onClick={() => removeLine(line.id)}
                    >
                      Remover
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between text-lg font-bold text-slate-900">
                <span>Total</span>
                <span>{formatBRL(total)}</span>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                disabled={cart.length === 0}
                className="min-h-14 w-full rounded-xl bg-emerald-600 text-lg font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => {
                  setPaymentOpen(true);
                  setFinalizeError(null);
                }}
              >
                Pagamento
              </button>
              <button
                type="button"
                disabled={cart.length === 0}
                className="min-h-12 w-full rounded-xl border border-slate-300 text-lg font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                onClick={clearCart}
              >
                Limpar venda
              </button>
            </div>
          </div>

          {paymentOpen ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Pagamento</h2>
              <dl className="mt-4 space-y-2 text-slate-800">
                <div className="flex justify-between text-lg">
                  <dt>Total</dt>
                  <dd className="font-bold">{formatBRL(total)}</dd>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-600" htmlFor="received">
                    Valor recebido
                  </label>
                  <input
                    id="received"
                    inputMode="decimal"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-xl outline-none ring-emerald-500 focus:ring-2"
                    placeholder="0,00"
                    value={receivedRaw}
                    onChange={(e) => setReceivedRaw(e.target.value)}
                  />
                </div>
                <div className="flex justify-between text-lg font-semibold">
                  <dt>Troco</dt>
                  <dd>{formatBRL(change)}</dd>
                </div>
              </dl>
              {finalizeError ? (
                <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{finalizeError}</p>
              ) : null}
              <button
                type="button"
                className="mt-4 w-full min-h-14 rounded-xl bg-emerald-600 text-lg font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                disabled={finalizing || cart.length === 0}
                onClick={() => void finalizeSale()}
              >
                {finalizing ? "Salvando…" : "Finalizar venda"}
              </button>
            </div>
          ) : null}
        </aside>
      </div>

      <CategoryNameModal
        open={newCategoryOpen}
        title="Nova categoria"
        confirmLabel="Criar"
        onClose={() => setNewCategoryOpen(false)}
        onSubmit={async (name) => {
          const supabase = createClient();
          const { userId, errorMessage } = await resolveEffectiveUserId(supabase);
          if (!userId) throw new Error(errorMessage ?? "Não foi possível identificar o usuário.");
          const result = await createCategory(userId, name);
          if (!result.ok) throw new Error(result.message);
          const next = await loadCategoriesForCaixa(userId);
          setCategories(next);
          setCategoryFilter(result.category.id);
        }}
      />

      {keypadTarget ? (
        <NumericKeypad
          key={keypadTarget.product.id}
          title={
            usesManualValueKeypad(keypadTarget.product)
              ? `${keypadTarget.product.name} — valor`
              : `${keypadTarget.product.name} — quantidade`
          }
          mode={usesManualValueKeypad(keypadTarget.product) ? "manual" : "quantity"}
          initialManualValue={
            keypadTarget.product.type === "manual" && keypadTarget.product.price > 0
              ? keypadTarget.product.price
              : undefined
          }
          onConfirm={onKeypadConfirm}
          onCancel={() => setKeypadTarget(null)}
        />
      ) : null}
    </div>
  );
}
