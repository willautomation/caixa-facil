"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SaleDetailModal } from "@/components/historico/SaleDetailModal";
import { createClient } from "@/lib/supabase/client";
import { resolveEffectiveUserId } from "@/lib/effective-user";
import { localDayRangeIso, toInputDate } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { deleteSaleById } from "@/lib/sale-deletion";
import type { ProductSummaryEntry, Sale, SaleItem } from "@/types/database";

function num(v: string | number): number {
  return typeof v === "string" ? Number(v) : v;
}

/** Mensagem legível para PostgREST / objetos com message (evita cair no texto genérico). */
function closureErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const o = err as { message?: string; details?: string; hint?: string };
    const parts = [o.message, o.details, o.hint].filter(Boolean);
    if (parts.length) return parts.join(" — ");
  }
  return "Erro ao fechar caixa.";
}

export function HistoricoView() {
  const [dateStr, setDateStr] = useState(() => toInputDate(new Date()));
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [closeMsg, setCloseMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<Sale | null>(null);
  const [detailItems, setDetailItems] = useState<SaleItem[]>([]);
  const [deletingSaleId, setDeletingSaleId] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { userId, errorMessage } = await resolveEffectiveUserId(supabase);
      if (!userId) {
        setError(errorMessage ?? "Não foi possível identificar o usuário.");
        setSales([]);
        return;
      }
      const { startIso, endIso } = localDayRangeIso(dateStr);
      const { data, error: qErr } = await supabase
        .from("sales")
        .select("*")
        .eq("user_id", userId)
        .gte("created_at", startIso)
        .lt("created_at", endIso)
        .order("created_at", { ascending: false });
      if (qErr) throw qErr;
      setSales(
        (data ?? []).map((r) => ({
          id: r.id as string,
          user_id: r.user_id as string,
          total: num(r.total as string | number),
          payment_method: (r.payment_method as string | null) ?? null,
          amount_received: num(r.amount_received as string | number),
          change_amount: num(r.change_amount as string | number),
          created_at: r.created_at as string,
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar histórico");
    } finally {
      setLoading(false);
    }
  }, [dateStr]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    const totalVendido = sales.reduce((s, x) => s + x.total, 0);
    const n = sales.length;
    const ticket = n > 0 ? totalVendido / n : 0;
    return { totalVendido, n, ticket };
  }, [sales]);

  const openDetail = async (sale: Sale) => {
    setSelected(sale);
    setDetailItems([]);
    const supabase = createClient();
    const { data, error: qErr } = await supabase.from("sale_items").select("*").eq("sale_id", sale.id);
    if (qErr) return;
    setDetailItems(
      (data ?? []).map((r) => ({
        id: r.id as string,
        sale_id: r.sale_id as string,
        product_id: (r.product_id as string | null) ?? null,
        product_name: r.product_name as string,
        quantity: num(r.quantity as string | number),
        price: num((r as { price?: string | number }).price ?? 0),
        line_total: num(r.line_total as string | number),
        created_at: typeof r.created_at === "string" ? r.created_at : undefined,
      }))
    );
  };

  const buildSummary = async (): Promise<ProductSummaryEntry[]> => {
    const supabase = createClient();
    const { userId } = await resolveEffectiveUserId(supabase);
    if (!userId) return [];
    const { startIso, endIso } = localDayRangeIso(dateStr);
    const { data: daySales, error: dayErr } = await supabase
      .from("sales")
      .select("id")
      .eq("user_id", userId)
      .gte("created_at", startIso)
      .lt("created_at", endIso);
    if (dayErr) throw dayErr;
    const ids = (daySales ?? []).map((s) => s.id as string);
    if (ids.length === 0) return [];
    const { data: items, error: itemsErr } = await supabase.from("sale_items").select("*").in("sale_id", ids);
    if (itemsErr) throw itemsErr;
    const map = new Map<string, ProductSummaryEntry>();
    for (const r of items ?? []) {
      const pid = (r.product_id as string | null) ?? `name:${r.product_name as string}`;
      const name = r.product_name as string;
      const qty = num(r.quantity as string | number);
      const line = num(r.line_total as string | number);
      const cur = map.get(pid) ?? {
        product_id: (r.product_id as string | null) ?? null,
        name,
        quantity: 0,
        total: 0,
      };
      cur.quantity += qty;
      cur.total += line;
      map.set(pid, cur);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  };

  const excluirUmaVenda = async (sale: Sale) => {
    const ok = window.confirm(
      "Excluir esta venda? Os itens serão removidos e o estoque de produtos com controle será devolvido."
    );
    if (!ok) return;
    setNotice(null);
    setDeletingSaleId(sale.id);
    try {
      const supabase = createClient();
      const { userId, errorMessage } = await resolveEffectiveUserId(supabase);
      if (!userId) {
        setNotice({ type: "error", message: errorMessage ?? "Não foi possível identificar o usuário." });
        return;
      }
      const result = await deleteSaleById(userId, sale.id);
      if (!result.ok) {
        setNotice({ type: "error", message: result.message });
        return;
      }
      if (selected?.id === sale.id) {
        setSelected(null);
        setDetailItems([]);
      }
      await load();
      setNotice({ type: "success", message: "Venda excluída com sucesso." });
    } catch (e) {
      setNotice({
        type: "error",
        message: e instanceof Error ? e.message : "Erro ao excluir venda.",
      });
    } finally {
      setDeletingSaleId(null);
    }
  };

  const excluirTodasDoDia = async () => {
    if (sales.length === 0) return;
    const label = new Date(`${dateStr}T12:00:00`).toLocaleDateString("pt-BR");
    const ok = window.confirm(
      `Excluir TODAS as vendas do dia ${label}? Esta ação não pode ser desfeita. O estoque será devolvido quando aplicável.`
    );
    if (!ok) return;
    setNotice(null);
    setDeletingAll(true);
    try {
      const supabase = createClient();
      const { userId, errorMessage } = await resolveEffectiveUserId(supabase);
      if (!userId) {
        setNotice({ type: "error", message: errorMessage ?? "Não foi possível identificar o usuário." });
        return;
      }
      for (const s of sales) {
        const result = await deleteSaleById(userId, s.id);
        if (!result.ok) {
          setNotice({
            type: "error",
            message: `${result.message} (algumas vendas podem ter sido excluídas; recarregue a lista.)`,
          });
          await load();
          setSelected(null);
          setDetailItems([]);
          return;
        }
      }
      setSelected(null);
      setDetailItems([]);
      await load();
      setNotice({ type: "success", message: "Todas as vendas desta data foram excluídas." });
    } catch (e) {
      setNotice({
        type: "error",
        message: e instanceof Error ? e.message : "Erro ao excluir vendas.",
      });
      await load();
    } finally {
      setDeletingAll(false);
    }
  };

  const fecharCaixa = async () => {
    setCloseMsg(null);
    setClosing(true);
    try {
      console.info("[Caixa Fácil] Fechar caixa: início", { dateStr, vendasNaTela: sales.length });
      const supabase = createClient();

      console.info("[Caixa Fácil] Fechar caixa: etapa — identificar usuário");
      const { userId, errorMessage } = await resolveEffectiveUserId(supabase);
      if (!userId) throw new Error(errorMessage ?? "Não foi possível identificar o usuário.");

      console.info("[Caixa Fácil] Fechar caixa: etapa — verificar se já existe fechamento", { userId, dateStr });
      const { data: existing, error: existErr } = await supabase
        .from("daily_closures")
        .select("id")
        .eq("user_id", userId)
        .eq("closure_date", dateStr)
        .maybeSingle();
      if (existErr) {
        console.error("[Caixa Fácil] Fechar caixa: falha ao ler daily_closures", existErr);
        throw existErr;
      }
      if (existing) {
        setCloseMsg("O caixa deste dia já foi fechado.");
        return;
      }

      if (sales.length === 0) {
        setCloseMsg("Não há vendas neste dia para fechar.");
        return;
      }

      console.info("[Caixa Fácil] Fechar caixa: etapa — resumo por produto (sale_items)");
      const summary = await buildSummary();
      const totalDay = Number(totals.totalVendido.toFixed(2));
      const payload = {
        user_id: userId,
        closure_date: dateStr,
        total_day: totalDay,
        sale_count: totals.n,
        product_summary: summary,
      };
      console.info("[Caixa Fácil] Fechar caixa: etapa — inserir daily_closures", {
        sale_count: payload.sale_count,
        total_day: payload.total_day,
        resumoItens: summary.length,
      });
      const { error: insErr } = await supabase.from("daily_closures").insert(payload);
      if (insErr) {
        console.error("[Caixa Fácil] Fechar caixa: insert daily_closures recusado", insErr);
        throw insErr;
      }
      console.info("[Caixa Fácil] Fechar caixa: concluído com sucesso");
      setCloseMsg("Caixa do dia fechado com sucesso.");
    } catch (e) {
      console.error("[Caixa Fácil] Erro real ao fechar caixa:", e);
      setCloseMsg(closureErrorMessage(e));
    } finally {
      setClosing(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Histórico</h1>

      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="filtro-data">
            Data
          </label>
          <input
            id="filtro-data"
            type="date"
            className="w-full max-w-xs rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none ring-emerald-500 focus:ring-2"
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="min-h-14 rounded-xl bg-slate-800 px-6 text-lg font-semibold text-white hover:bg-slate-900 disabled:opacity-60"
          disabled={closing}
          onClick={() => void fecharCaixa()}
        >
          {closing ? "Fechando…" : "Fechar caixa do dia"}
        </button>
      </div>

      {closeMsg ? (
        <p className="rounded-xl bg-slate-100 px-4 py-3 text-slate-800" role="status">
          {closeMsg}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-red-800" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          className={
            notice.type === "success"
              ? "rounded-xl bg-emerald-50 px-4 py-3 text-emerald-900"
              : "rounded-xl bg-red-50 px-4 py-3 text-red-800"
          }
          role="status"
        >
          {notice.message}
        </p>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-600">Total vendido</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">{formatBRL(totals.totalVendido)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-600">Número de vendas</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{totals.n}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-600">Ticket médio</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{formatBRL(totals.ticket)}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="text-lg font-semibold text-slate-900">Vendas do dia</h2>
          {!loading && sales.length > 0 ? (
            <button
              type="button"
              className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
              disabled={deletingAll || deletingSaleId !== null}
              onClick={() => void excluirTodasDoDia()}
            >
              {deletingAll ? "Excluindo…" : "Excluir todas deste dia"}
            </button>
          ) : null}
        </div>
        {loading ? (
          <p className="p-6 text-slate-600">Carregando…</p>
        ) : sales.length === 0 ? (
          <p className="p-6 text-slate-600">Nenhuma venda nesta data.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {sales.map((s) => (
              <li key={s.id} className="flex items-stretch">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2 px-4 py-4 text-left hover:bg-slate-50"
                  onClick={() => void openDetail(s)}
                >
                  <span className="font-medium text-slate-900">
                    {new Date(s.created_at).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="text-lg font-bold text-emerald-700">{formatBRL(s.total)}</span>
                </button>
                <button
                  type="button"
                  className="shrink-0 border-l border-slate-100 px-4 py-4 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                  disabled={deletingSaleId === s.id || deletingAll}
                  onClick={(e) => {
                    e.stopPropagation();
                    void excluirUmaVenda(s);
                  }}
                >
                  {deletingSaleId === s.id ? "…" : "Excluir"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selected ? (
        <SaleDetailModal
          sale={selected}
          items={detailItems}
          onClose={() => {
            setSelected(null);
            setDetailItems([]);
          }}
        />
      ) : null}
    </div>
  );
}
