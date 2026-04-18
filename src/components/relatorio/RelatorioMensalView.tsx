"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveEffectiveUserId } from "@/lib/effective-user";
import { localMonthRangeIso } from "@/lib/dates";
import { formatBRL } from "@/lib/money";

type Agg = { key: string; name: string; units: number; revenue: number };

function num(v: string | number): number {
  return typeof v === "string" ? Number(v) : v;
}

function monthDefault(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function RelatorioMensalView() {
  const [monthStr, setMonthStr] = useState(monthDefault);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalVendido, setTotalVendido] = useState(0);
  const [saleCount, setSaleCount] = useState(0);
  const [topUnits, setTopUnits] = useState<Agg | null>(null);
  const [topRevenue, setTopRevenue] = useState<Agg | null>(null);

  const ticket = useMemo(
    () => (saleCount > 0 ? totalVendido / saleCount : 0),
    [saleCount, totalVendido]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { userId, errorMessage } = await resolveEffectiveUserId(supabase);
      if (!userId) {
        setError(errorMessage ?? "Não foi possível identificar o usuário.");
        setTotalVendido(0);
        setSaleCount(0);
        setTopUnits(null);
        setTopRevenue(null);
        return;
      }
      const { startIso, endIso } = localMonthRangeIso(monthStr);
      const { data: sales, error: sErr } = await supabase
        .from("sales")
        .select("id, total")
        .eq("user_id", userId)
        .gte("created_at", startIso)
        .lt("created_at", endIso);
      if (sErr) throw sErr;
      const list = sales ?? [];
      const ids = list.map((s) => s.id as string);
      const vendido = list.reduce((a, s) => a + num(s.total as string | number), 0);
      setTotalVendido(vendido);
      setSaleCount(list.length);

      if (ids.length === 0) {
        setTopUnits(null);
        setTopRevenue(null);
        return;
      }

      const { data: items, error: iErr } = await supabase.from("sale_items").select("*").in("sale_id", ids);
      if (iErr) throw iErr;

      const map = new Map<string, Agg>();
      for (const r of items ?? []) {
        const key = ((r.product_id as string | null) ?? `n:${r.product_name}`) as string;
        const name = r.product_name as string;
        const qty = num(r.quantity as string | number);
        const lineTotal = num(r.line_total as string | number);
        const units = qty;
        const cur = map.get(key) ?? { key, name, units: 0, revenue: 0 };
        cur.units += units;
        cur.revenue += lineTotal;
        map.set(key, cur);
      }
      const arr = [...map.values()];
      const maxU = arr.reduce<Agg | null>((best, cur) => {
        if (!best || cur.units > best.units) return cur;
        return best;
      }, null);
      const maxR = arr.reduce<Agg | null>((best, cur) => {
        if (!best || cur.revenue > best.revenue) return cur;
        return best;
      }, null);
      setTopUnits(maxU);
      setTopRevenue(maxR);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar relatório");
    } finally {
      setLoading(false);
    }
  }, [monthStr]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Relatório mensal</h1>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="mes">
          Mês / ano
        </label>
        <input
          id="mes"
          type="month"
          className="w-full max-w-xs rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none ring-emerald-500 focus:ring-2"
          value={monthStr}
          onChange={(e) => setMonthStr(e.target.value)}
        />
      </div>

      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-slate-600">Carregando…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-600">Total vendido no mês</p>
            <p className="mt-1 text-2xl font-bold text-emerald-700">{formatBRL(totalVendido)}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-600">Total de vendas</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{saleCount}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-600">Ticket médio</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{formatBRL(ticket)}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-600">Produto mais vendido (unidades)</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {topUnits ? `${topUnits.name} (${topUnits.units})` : "—"}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:col-span-2">
            <p className="text-sm text-slate-600">Produto que mais faturou</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {topRevenue ? `${topRevenue.name} (${formatBRL(topRevenue.revenue)})` : "—"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
