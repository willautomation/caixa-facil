"use client";

import { formatBRL } from "@/lib/money";
import type { Sale, SaleItem } from "@/types/database";

type Props = {
  sale: Sale;
  items: SaleItem[];
  onClose: () => void;
};

export function SaleDetailModal({ sale, items, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-xl font-bold text-slate-900">Detalhes da venda</h2>
          <button
            type="button"
            className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
            onClick={onClose}
          >
            Fechar
          </button>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          {new Date(sale.created_at).toLocaleString("pt-BR")}
        </p>
        <dl className="mt-4 grid gap-2 text-slate-800">
          <div className="flex justify-between">
            <dt>Total</dt>
            <dd className="font-semibold">{formatBRL(sale.total)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Recebido</dt>
            <dd>{formatBRL(sale.amount_received)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Troco</dt>
            <dd>{formatBRL(sale.change_amount)}</dd>
          </div>
        </dl>
        <h3 className="mt-6 font-semibold text-slate-900">Itens</h3>
        <ul className="mt-2 divide-y divide-slate-100">
          {items.map((it) => (
            <li key={it.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
              <span className="font-medium text-slate-800">{it.product_name}</span>
              <span className="text-slate-600">
                {it.quantity <= 1
                  ? formatBRL(it.line_total)
                  : `${it.quantity} × ${formatBRL(it.price)}`}
              </span>
              <span className="w-full text-right font-semibold text-emerald-700">
                {formatBRL(it.line_total)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
