"use client";

import { useCallback, useMemo, useState } from "react";
import { parseMoneyInput } from "@/lib/money";

type KeypadMode = "manual" | "quantity";

function appendManual(current: string, digit: string): string {
  if (digit === ",") {
    if (current.includes(",")) return current;
    return current === "" ? "0," : current + ",";
  }
  if (!/^\d$/.test(digit)) return current;
  const parts = current.split(",");
  if (parts[1] !== undefined && parts[1].length >= 2) return current;
  if (current === "0" && digit !== ",") return digit;
  return current + digit;
}

function appendQuantity(current: string, digit: string): string {
  if (!/^\d$/.test(digit)) return current;
  if (current === "0") return digit;
  if (current.length >= 6) return current;
  return current + digit;
}

function backspace(s: string): string {
  return s.slice(0, -1);
}

type Props = {
  title: string;
  mode: KeypadMode;
  onConfirm: (value: number) => void;
  onCancel: () => void;
  /** Pré-preenche o teclado no modo manual (ex.: preço de referência do produto). */
  initialManualValue?: number;
};

function initialRawFromManual(value?: number): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "";
  return value.toFixed(2).replace(".", ",");
}

export function NumericKeypad({ title, mode, onConfirm, onCancel, initialManualValue }: Props) {
  const [raw, setRaw] = useState(() =>
    mode === "manual" ? initialRawFromManual(initialManualValue) : ""
  );

  const display = raw === "" ? (mode === "manual" ? "0,00" : "0") : raw;

  const pushKey = useCallback(
    (key: string) => {
      setRaw((prev) => (mode === "manual" ? appendManual(prev, key) : appendQuantity(prev, key)));
    },
    [mode]
  );

  const handleOk = () => {
    if (mode === "quantity") {
      const n = parseInt(raw || "0", 10);
      if (!Number.isFinite(n) || n <= 0) return;
      onConfirm(n);
      return;
    }
    const n = parseMoneyInput(raw || "0");
    if (n <= 0) return;
    onConfirm(n);
  };

  const keys = useMemo(
    () =>
      mode === "manual"
        ? ["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0"]
        : ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0"],
    [mode]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div
        className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <h2 className="mb-2 text-center text-lg font-semibold text-slate-800">{title}</h2>
        <div className="mb-4 rounded-xl bg-slate-100 px-4 py-4 text-center font-mono text-3xl font-semibold tracking-wide text-slate-900">
          {display}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {keys.map((k, i) =>
            k === "" ? (
              <span key={`e-${i}`} className="min-h-14" />
            ) : (
              <button
                key={k + String(i)}
                type="button"
                className="min-h-14 rounded-xl bg-slate-200 text-xl font-medium text-slate-900 active:bg-slate-300"
                onClick={() => pushKey(k)}
              >
                {k === "," ? "," : k}
              </button>
            )
          )}
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <button
            type="button"
            className="min-h-14 rounded-xl bg-amber-100 text-lg font-semibold text-amber-900 active:bg-amber-200"
            onClick={() => setRaw("")}
          >
            C
          </button>
          <button
            type="button"
            className="min-h-14 rounded-xl bg-amber-100 text-lg font-semibold text-amber-900 active:bg-amber-200"
            onClick={() => setRaw((s) => backspace(s))}
          >
            ←
          </button>
          <button
            type="button"
            className="min-h-14 rounded-xl bg-slate-200 text-lg font-medium text-slate-900 active:bg-slate-300"
            onClick={onCancel}
          >
            Cancelar
          </button>
        </div>
        <button
          type="button"
          className="mt-3 w-full min-h-14 rounded-xl bg-emerald-600 text-lg font-semibold text-white active:bg-emerald-700"
          onClick={handleOk}
        >
          OK
        </button>
      </div>
    </div>
  );
}
