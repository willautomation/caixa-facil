"use client";

import { useEffect, useState } from "react";
import {
  getConfiguredAppPassword,
  isAppPasswordGateEnabled,
  readAppPasswordAuthed,
  writeAppPasswordAuthed,
} from "@/lib/app-password-gate";

function AppPasswordScreen({ expected }: { expected: string }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (value === expected) {
        writeAppPasswordAuthed();
        window.dispatchEvent(new Event("app-password-auth"));
      } else {
        setError("Senha incorreta.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
        <h1 className="text-center text-2xl font-bold text-emerald-700">Caixa Fácil</h1>
        <p className="mt-2 text-center text-slate-600">Digite a senha de acesso</p>
        <form className="mt-8 space-y-4" onSubmit={submit}>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="app-gate-password">
              Senha
            </label>
            <input
              id="app-gate-password"
              type="password"
              autoComplete="off"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none ring-emerald-500 focus:ring-2"
              value={value}
              onChange={(ev) => setValue(ev.target.value)}
            />
          </div>
          {error ? (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full min-h-14 rounded-xl bg-emerald-600 text-lg font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            Entrar
          </button>
        </form>
      </div>
    </div>
  );
}

export function AppPasswordGate({ children }: { children: React.ReactNode }) {
  const gateEnabled = isAppPasswordGateEnabled();
  const [authed, setAuthed] = useState<boolean | null>(() => (gateEnabled ? null : true));

  useEffect(() => {
    if (!gateEnabled) {
      setAuthed(true);
      return;
    }
    setAuthed(readAppPasswordAuthed());
    const onAuth = () => setAuthed(readAppPasswordAuthed());
    window.addEventListener("app-password-auth", onAuth);
    return () => window.removeEventListener("app-password-auth", onAuth);
  }, [gateEnabled]);

  if (!gateEnabled) {
    return <>{children}</>;
  }

  if (authed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">
        Carregando…
      </div>
    );
  }

  if (!authed) {
    return <AppPasswordScreen expected={getConfiguredAppPassword()} />;
  }

  return <>{children}</>;
}
