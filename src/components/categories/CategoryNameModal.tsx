"use client";

import { useEffect, useState } from "react";
import { isGeralCategoryName } from "@/lib/categories-repository";

export type CategoryNamePayload = { name: string; icon: string | null };

type Props = {
  open: boolean;
  title: string;
  initialName?: string;
  initialIcon?: string;
  confirmLabel?: string;
  onClose: () => void;
  onSubmit: (payload: CategoryNamePayload) => Promise<void>;
};

export function CategoryNameModal({
  open,
  title,
  initialName = "",
  initialIcon = "",
  confirmLabel = "Salvar",
  onClose,
  onSubmit,
}: Props) {
  const [name, setName] = useState(initialName);
  const [icon, setIcon] = useState(initialIcon);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const geralIconLock = isGeralCategoryName(name);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setIcon(isGeralCategoryName(initialName) ? "📁" : initialIcon);
      setError(null);
      setBusy(false);
    }
  }, [open, initialName, initialIcon]);

  useEffect(() => {
    if (open && isGeralCategoryName(name)) setIcon("📁");
  }, [open, name]);

  if (!open) return null;

  const handleSubmit = async () => {
    const t = name.trim();
    if (!t) {
      setError("Informe um nome.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const rawIcon = geralIconLock ? "📁" : icon.trim();
      const iconPayload = rawIcon.length > 0 ? rawIcon.slice(0, 16) : null;
      await onSubmit({ name: t, icon: iconPayload });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        role="dialog"
        aria-labelledby="cat-modal-title"
      >
        <h2 id="cat-modal-title" className="text-xl font-bold text-slate-900">
          {title}
        </h2>
        <label className="mt-4 mb-1 block text-sm font-medium text-slate-700" htmlFor="cat-modal-name">
          Nome da categoria
        </label>
        <input
          id="cat-modal-name"
          className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none ring-emerald-500 focus:ring-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <label className="mt-4 mb-1 block text-sm font-medium text-slate-700" htmlFor="cat-modal-icon">
          Ícone (emoji)
        </label>
        {geralIconLock ? (
          <div
            id="cat-modal-icon"
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-2xl"
            aria-readonly
          >
            📁
            <span className="text-sm text-slate-600">Fixo para &quot;Geral&quot;</span>
          </div>
        ) : (
          <input
            id="cat-modal-icon"
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-2xl outline-none ring-emerald-500 focus:ring-2"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            placeholder="📦"
            maxLength={16}
            inputMode="text"
          />
        )}
        {error ? (
          <p className="mt-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="min-h-12 rounded-xl border border-slate-300 px-6 font-semibold text-slate-800 hover:bg-slate-50"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            className="min-h-12 rounded-xl bg-emerald-600 px-6 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            onClick={() => void handleSubmit()}
          >
            {busy ? "Salvando…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
