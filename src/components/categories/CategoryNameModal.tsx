"use client";

import { useEffect, useState } from "react";

type Props = {
  open: boolean;
  title: string;
  initialName?: string;
  confirmLabel?: string;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
};

export function CategoryNameModal({
  open,
  title,
  initialName = "",
  confirmLabel = "Salvar",
  onClose,
  onSubmit,
}: Props) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setError(null);
      setBusy(false);
    }
  }, [open, initialName]);

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
      await onSubmit(t);
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
