"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { NumericKeypad } from "@/components/NumericKeypad";
import { CaixaProductModal } from "@/components/caixa/CaixaProductModal";
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
  updateProductCategoryId,
} from "@/lib/products-repository";
import { saveVenda } from "@/lib/vendas";
import { formatBRL, parseMoneyInput } from "@/lib/money";
import type { CartLine, Category, Product } from "@/types/database";

type KeypadTarget = {
  product: Product;
} | null;

type CaixaStep = "categories" | "products";

const CATEGORY_EMOJI_HINTS: [string, string][] = [
  ["beb", "🥤"],
  ["refrig", "🥤"],
  ["água", "💧"],
  ["sal", "🥟"],
  ["doc", "🍰"],
  ["pão", "🥖"],
  ["lim", "🧹"],
  ["cig", "🚬"],
  ["caf", "☕"],
];

function emojiForCategory(name: string): string {
  const l = name.toLowerCase();
  for (const [hint, emoji] of CATEGORY_EMOJI_HINTS) {
    if (l.includes(hint)) return emoji;
  }
  return "📁";
}

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

const DND_MIME = "application/x-caixa-product-id";

function mergeProductIds(existing: string[] | undefined, currentIds: string[]): string[] {
  const ex = existing ?? [];
  const curSet = new Set(currentIds);
  const kept = ex.filter((id) => curSet.has(id));
  const seen = new Set(kept);
  const tail = currentIds.filter((id) => !seen.has(id));
  return [...kept, ...tail];
}

function applyIdOrder(products: Product[], order: string[] | undefined): Product[] {
  if (!order?.length) return products;
  const map = new Map(products.map((p) => [p.id, p]));
  const included = new Set(products.map((p) => p.id));
  const ordered: Product[] = [];
  for (const id of order) {
    if (!included.has(id)) continue;
    const pr = map.get(id);
    if (pr) ordered.push(pr);
  }
  for (const p of products) {
    if (!order.includes(p.id)) ordered.push(p);
  }
  return ordered;
}

export function CaixaView() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [step, setStep] = useState<CaixaStep>("categories");
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [keypadTarget, setKeypadTarget] = useState<KeypadTarget>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [receivedRaw, setReceivedRaw] = useState("");
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);

  const [organizeMode, setOrganizeMode] = useState(false);
  const [productOrderByCategory, setProductOrderByCategory] = useState<Record<string, string[]>>({});
  const [draggingProduct, setDraggingProduct] = useState<Product | null>(null);
  const [dragOverCategoryId, setDragOverCategoryId] = useState<string | null>(null);
  const [dragOverProductId, setDragOverProductId] = useState<string | null>(null);
  const [dndNotice, setDndNotice] = useState<string | null>(null);

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

  const productsInActiveCategory = useMemo(() => {
    if (!activeCategory) return [];
    return products.filter((p) => {
      const effective = p.category_id ?? geralCategoryId;
      return effective === activeCategory.id;
    });
  }, [products, activeCategory, geralCategoryId]);

  useEffect(() => {
    if (!organizeMode) return;
    setProductOrderByCategory((prev) => {
      const next: Record<string, string[]> = {};
      for (const c of categories) {
        const ids = products
          .filter((p) => (p.category_id ?? geralCategoryId) === c.id)
          .map((p) => p.id);
        next[c.id] = mergeProductIds(prev[c.id], ids);
      }
      return next;
    });
  }, [organizeMode, products, categories, geralCategoryId]);

  const productsInActiveCategoryOrdered = useMemo(() => {
    if (!activeCategory) return [];
    const base = productsInActiveCategory;
    if (!organizeMode) return base;
    const order = productOrderByCategory[activeCategory.id];
    return applyIdOrder(base, order);
  }, [productsInActiveCategory, organizeMode, productOrderByCategory, activeCategory?.id]);

  const searchFilteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = organizeMode ? productsInActiveCategoryOrdered : productsInActiveCategory;
    if (!q) return list;
    return list.filter((p) => p.name.toLowerCase().includes(q));
  }, [organizeMode, productsInActiveCategoryOrdered, productsInActiveCategory, search]);

  const total = useMemo(() => cart.reduce((acc, line) => acc + line.lineTotal, 0), [cart]);
  const received = parseMoneyInput(receivedRaw);
  const change = Math.max(0, received - total);

  const goToCategories = () => {
    setStep("categories");
    setActiveCategory(null);
    setSearch("");
    setDraggingProduct(null);
    setDragOverCategoryId(null);
    setDragOverProductId(null);
  };

  const openCategory = (c: Category) => {
    setActiveCategory(c);
    setStep("products");
    setSearch("");
  };

  const effectiveCategoryId = useCallback(
    (p: Product) => p.category_id ?? geralCategoryId,
    [geralCategoryId]
  );

  const toggleOrganizeMode = () => {
    setOrganizeMode((v) => {
      if (v) {
        setDraggingProduct(null);
        setDragOverCategoryId(null);
        setDragOverProductId(null);
        setProductOrderByCategory({});
      } else {
        setKeypadTarget(null);
      }
      return !v;
    });
  };

  const handleDropOnCategory = useCallback(
    async (target: Category) => {
      if (!organizeMode) return;
      const p = draggingProduct;
      if (!p) return;
      const fromId = effectiveCategoryId(p);
      if (fromId === target.id) {
        setDraggingProduct(null);
        setDragOverCategoryId(null);
        setDragOverProductId(null);
        return;
      }
      const snapshot = [...products];
      setProducts((list) =>
        list.map((x) => (x.id === p.id ? { ...x, category_id: target.id } : x))
      );
      setDraggingProduct(null);
      setDragOverCategoryId(null);
      setDragOverProductId(null);
      const supabase = createClient();
      const { userId, errorMessage } = await resolveEffectiveUserId(supabase);
      if (!userId) {
        setProducts(snapshot);
        setDndNotice(errorMessage ?? "Usuário inválido.");
        window.setTimeout(() => setDndNotice(null), 4000);
        return;
      }
      const r = await updateProductCategoryId(userId, p, target.id);
      if (!r.ok) {
        setProducts(snapshot);
        setDndNotice(r.message);
        window.setTimeout(() => setDndNotice(null), 4000);
      }
    },
    [organizeMode, draggingProduct, products, effectiveCategoryId]
  );

  const categoryDropProps = useCallback(
    (c: Category) => ({
      onDragOver: (e: React.DragEvent) => {
        if (!organizeMode || !draggingProduct) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      },
      onDragEnter: () => {
        if (!organizeMode || !draggingProduct) return;
        setDragOverCategoryId(c.id);
      },
      onDragLeave: (e: React.DragEvent) => {
        if (!organizeMode || !draggingProduct) return;
        const rel = e.relatedTarget as Node | null;
        if (rel && e.currentTarget.contains(rel)) return;
        setDragOverCategoryId((cur) => (cur === c.id ? null : cur));
      },
      onDrop: (e: React.DragEvent) => {
        if (!organizeMode || !draggingProduct) return;
        e.preventDefault();
        void handleDropOnCategory(c);
      },
    }),
    [organizeMode, draggingProduct, handleDropOnCategory]
  );

  const handleProductCardReorderDrop = useCallback(
    (targetProductId: string) => {
      if (!organizeMode || !activeCategory || !draggingProduct) return;
      const dragId = draggingProduct.id;
      if (dragId === targetProductId) return;
      const targetP = products.find((x) => x.id === targetProductId);
      if (!targetP) return;
      if (effectiveCategoryId(draggingProduct) !== activeCategory.id) return;
      if (effectiveCategoryId(targetP) !== activeCategory.id) return;

      setProductOrderByCategory((prev) => {
        const catId = activeCategory.id;
        const baseIds =
          prev[catId] && prev[catId].length > 0
            ? [...prev[catId]]
            : productsInActiveCategory.map((x) => x.id);
        const arr = [...baseIds];
        const di = arr.indexOf(dragId);
        const ti = arr.indexOf(targetProductId);
        if (di === -1 || ti === -1) return prev;
        arr.splice(di, 1);
        const newTi = arr.indexOf(targetProductId);
        arr.splice(newTi, 0, dragId);
        return { ...prev, [catId]: arr };
      });
    },
    [organizeMode, activeCategory, draggingProduct, products, effectiveCategoryId, productsInActiveCategory]
  );

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
      const supabase = createClient();
      const { userId, errorMessage } = await resolveEffectiveUserId(supabase);
      if (!userId) {
        setFinalizeError(errorMessage ?? "Não foi possível identificar o usuário.");
        return;
      }

      const neededByProduct = new Map<string, number>();
      for (const line of cart) {
        if (!line?.productId) continue;
        const dec = line.type === "quantity" ? line.quantity : 1;
        neededByProduct.set(line.productId, (neededByProduct.get(line.productId) ?? 0) + dec);
      }

      for (const [productId, dec] of neededByProduct) {
        const snap = await resolveProductStockForCart(userId, productId);
        if (!snap) continue;
        if (!snap.track_stock) continue;
        if (snap.stock < dec) {
          setFinalizeError("Estoque insuficiente para um ou mais produtos.");
          return;
        }
      }

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
        throw saleErr ?? new Error("Falha ao registrar venda.");
      }

      const productIdsForFk = [...neededByProduct.keys()];
      const validRemoteProductIds = await getRemoteProductIdsThatExist(supabase, productIdsForFk);

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

      const { error: itemsErr } = await supabase.from("sale_items").insert(items);
      if (itemsErr) throw itemsErr;

      for (const [productId, dec] of neededByProduct) {
        await applyRemoteStockDecrement(productId, dec);
      }

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
      await saveVenda({ total, troco: change, itens: itensJson });
      syncStockAfterSale(userId, neededByProduct);
      clearCart();
      await loadProducts();
    } catch (e) {
      const msg = vendingErrorMessage(e);
      setFinalizeError(msg.length > 0 ? msg : "Erro ao finalizar venda.");
    } finally {
      setFinalizing(false);
    }
  };

  const productCardClass =
    "flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm transition hover:border-emerald-300 hover:shadow-md active:bg-slate-50";

  const productCardClassOrganize =
    "flex min-h-24 cursor-grab flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-violet-300 bg-violet-50/40 p-4 text-center shadow-sm transition hover:border-violet-500 hover:bg-violet-50 active:cursor-grabbing";

  const categoryDropCardClass = (catId: string, compact?: boolean) =>
    [
      "flex shrink-0 flex-col items-center justify-center rounded-2xl border bg-white text-center shadow-sm transition",
      compact ? "min-h-[5.5rem] w-[6.5rem] px-2 py-2" : "min-h-28 min-w-[7rem] flex-1 px-3 py-3 sm:min-w-[8rem]",
      organizeMode && draggingProduct && dragOverCategoryId === catId
        ? "scale-[1.03] border-violet-600 ring-2 ring-violet-400 ring-offset-2"
        : "border-slate-200 hover:border-emerald-300",
      organizeMode && draggingProduct ? "cursor-grab" : "",
    ].join(" ");

  const renderCategoryDropTargets = (compact: boolean) => (
    <div className={compact ? "flex flex-nowrap gap-2 overflow-x-auto pb-1" : "flex flex-wrap justify-center gap-2"}>
      {categories.map((c) => (
        <div
          key={c.id}
          {...categoryDropProps(c)}
          className={categoryDropCardClass(c.id, compact)}
          role="presentation"
        >
          <span className={compact ? "text-2xl" : "text-3xl"} aria-hidden>
            {emojiForCategory(c.name)}
          </span>
          <span
            className={`mt-1 line-clamp-2 font-semibold text-slate-800 ${compact ? "text-[11px] leading-tight" : "text-xs"}`}
          >
            {c.name}
          </span>
        </div>
      ))}
    </div>
  );

  const showDndChrome = organizeMode && draggingProduct;

  if (loading) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center text-slate-600 shadow">Carregando…</div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Caixa</h1>
        <button
          type="button"
          onClick={toggleOrganizeMode}
          className={
            organizeMode
              ? "min-h-11 rounded-xl border-2 border-violet-600 bg-violet-600 px-4 font-semibold text-white shadow-md hover:bg-violet-700"
              : "min-h-11 rounded-xl border border-slate-300 bg-white px-4 font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
          }
        >
          {organizeMode ? "Concluir organização" : "Organizar"}
        </button>
      </div>

      {organizeMode ? (
        <p
          className="rounded-xl border-2 border-violet-400 bg-violet-50 px-4 py-3 text-sm font-medium text-violet-950"
          role="status"
        >
          Modo organização: arraste um produto para outra categoria ou solte sobre outro produto para reordenar. A ordem
          nesta sessão é só visual — para gravar no servidor seria preciso um campo como{" "}
          <code className="rounded bg-violet-100 px-1">sort_order</code> na tabela de produtos.
        </p>
      ) : null}

      {loadError ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-red-800" role="alert">
          {loadError}
        </p>
      ) : null}
      {dndNotice ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-amber-900" role="status">
          {dndNotice}
        </p>
      ) : null}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <section
          className={`relative flex-1 space-y-4 rounded-2xl transition ${
            organizeMode ? "ring-2 ring-violet-400 ring-offset-2 ring-offset-slate-50" : ""
          }`}
        >
          {showDndChrome && step === "products" ? (
            <div className="sticky top-0 z-20 mb-2 rounded-xl border-2 border-violet-300 bg-violet-50/95 px-3 py-3 shadow-md backdrop-blur-sm">
              <p className="mb-2 text-center text-xs font-semibold text-violet-900">
                Solte em uma categoria para mover o produto
              </p>
              {renderCategoryDropTargets(true)}
            </div>
          ) : null}

          {showDndChrome && step === "categories" ? (
            <div className="sticky top-0 z-20 mb-2 rounded-xl border-2 border-violet-300 bg-violet-50/95 px-3 py-3 shadow-md backdrop-blur-sm">
              <p className="mb-2 text-center text-xs font-semibold text-violet-900">
                Solte em uma categoria para mover o produto
              </p>
              {renderCategoryDropTargets(true)}
            </div>
          ) : null}

          {step === "categories" ? (
            <>
              <p className="text-slate-600">Escolha uma categoria para ver os produtos.</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {categories.map((c) =>
                  organizeMode ? (
                    <div
                      key={c.id}
                      {...categoryDropProps(c)}
                      className={`flex min-h-28 flex-col items-center justify-between gap-2 rounded-2xl border-2 bg-white p-3 text-center shadow-sm transition ${
                        showDndChrome && dragOverCategoryId === c.id
                          ? "border-violet-600 ring-2 ring-violet-400"
                          : "border-violet-200"
                      }`}
                    >
                      <div className="flex flex-1 flex-col items-center justify-center gap-1">
                        <span className="text-4xl" aria-hidden>
                          {emojiForCategory(c.name)}
                        </span>
                        <span className="text-sm font-semibold text-slate-800">{c.name}</span>
                        <span className="text-[10px] font-medium text-violet-700">Alvo de soltura</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => openCategory(c)}
                        className="w-full min-h-10 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-50"
                      >
                        Abrir
                      </button>
                    </div>
                  ) : (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => openCategory(c)}
                      className={productCardClass}
                    >
                      <span className="text-4xl" aria-hidden>
                        {emojiForCategory(c.name)}
                      </span>
                      <span className="text-sm font-semibold text-slate-800">{c.name}</span>
                      <span className="text-xs text-slate-500">Abrir</span>
                    </button>
                  )
                )}
                <button
                  type="button"
                  onClick={() => setNewCategoryOpen(true)}
                  className={`${productCardClass} border-dashed border-emerald-400 bg-emerald-50/80 hover:bg-emerald-100`}
                >
                  <span className="text-4xl text-emerald-700" aria-hidden>
                    ＋
                  </span>
                  <span className="text-sm font-semibold text-emerald-900">Novo card</span>
                  <span className="text-xs text-emerald-800">Nova categoria</span>
                </button>
              </div>
            </>
          ) : activeCategory ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={goToCategories}
                  className="min-h-12 rounded-xl border border-slate-300 bg-white px-4 font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                >
                  ← Voltar
                </button>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="text-3xl" aria-hidden>
                    {emojiForCategory(activeCategory.name)}
                  </span>
                  <h2 className="truncate text-xl font-bold text-slate-900">{activeCategory.name}</h2>
                </div>
              </div>
              <input
                type="search"
                placeholder="Buscar nesta categoria…"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none ring-emerald-500 focus:ring-2"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {productsInActiveCategory.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-12 text-center shadow-sm">
                  <p className="text-lg font-medium text-slate-800">Nenhum produto aqui ainda</p>
                  <p className="mt-2 text-sm text-slate-600">
                    Adicione o primeiro item desta categoria para começar a vender.
                  </p>
                  <button
                    type="button"
                    className="mt-6 min-h-12 rounded-xl bg-emerald-600 px-6 font-semibold text-white hover:bg-emerald-700"
                    onClick={() => setProductModalOpen(true)}
                  >
                    Criar produto
                  </button>
                </div>
              ) : searchFilteredProducts.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm">
                  <p className="font-medium text-slate-800">Nenhum resultado para a busca</p>
                  <p className="mt-2 text-sm text-slate-600">Tente outro termo ou limpe o filtro.</p>
                  <button
                    type="button"
                    className="mt-4 text-sm font-semibold text-emerald-700 underline"
                    onClick={() => setSearch("")}
                  >
                    Limpar busca
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {searchFilteredProducts.map((p) =>
                    organizeMode ? (
                      <div
                        key={p.id}
                        draggable
                        aria-grabbed={draggingProduct?.id === p.id}
                        onDragStart={(e) => {
                          e.dataTransfer.setData(DND_MIME, p.id);
                          e.dataTransfer.effectAllowed = "move";
                          setDraggingProduct(p);
                        }}
                        onDragEnd={() => {
                          setDraggingProduct(null);
                          setDragOverCategoryId(null);
                          setDragOverProductId(null);
                        }}
                        onDragOver={(e) => {
                          if (!draggingProduct || draggingProduct.id === p.id) return;
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                          setDragOverProductId(p.id);
                        }}
                        onDragLeave={(e) => {
                          const rel = e.relatedTarget as Node | null;
                          if (rel && e.currentTarget.contains(rel)) return;
                          setDragOverProductId((cur) => (cur === p.id ? null : cur));
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleProductCardReorderDrop(p.id);
                          setDragOverProductId(null);
                        }}
                        className={`${productCardClassOrganize} ${
                          draggingProduct?.id === p.id ? "opacity-50 shadow-lg" : ""
                        } ${
                          dragOverProductId === p.id && draggingProduct && draggingProduct.id !== p.id
                            ? "border-violet-600 bg-violet-100 ring-2 ring-violet-400"
                            : ""
                        }`}
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
                        <span className="text-[10px] font-semibold text-violet-800">Arraste · solte em categoria ou item</span>
                      </div>
                    ) : (
                      <div
                        key={p.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setKeypadTarget({ product: p })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setKeypadTarget({ product: p });
                          }
                        }}
                        className={`${productCardClass} cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-emerald-500`}
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
                      </div>
                    )
                  )}
                  <button
                    type="button"
                    onClick={() => setProductModalOpen(true)}
                    className={`${productCardClass} border-dashed border-emerald-400 bg-emerald-50/80 hover:bg-emerald-100`}
                  >
                    <span className="text-3xl text-emerald-700" aria-hidden>
                      ＋
                    </span>
                    <span className="text-sm font-semibold text-emerald-900">Novo produto</span>
                  </button>
                </div>
              )}
            </>
          ) : null}
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

      {showDndChrome ? (
        <div
          className="fixed inset-x-0 bottom-0 z-[41] border-t-2 border-violet-300 bg-violet-50/95 px-3 py-3 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] backdrop-blur-md lg:inset-auto lg:bottom-6 lg:right-6 lg:w-full lg:max-w-xl lg:rounded-2xl lg:border lg:shadow-lg"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <p className="mb-2 text-center text-xs font-semibold text-violet-900">
            Categorias — solte para mover o produto
          </p>
          {renderCategoryDropTargets(true)}
        </div>
      ) : null}

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
        }}
      />

      {activeCategory ? (
        <CaixaProductModal
          open={productModalOpen}
          categoryId={activeCategory.id}
          categoryName={activeCategory.name}
          onClose={() => setProductModalOpen(false)}
          onSaved={async () => {
            await loadProducts();
          }}
        />
      ) : null}

      {keypadTarget && !organizeMode ? (
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
