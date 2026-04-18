"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: signError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signError) {
        setError(signError.message);
        return;
      }
      router.push("/caixa");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao conectar. Verifique o Supabase no .env.local.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
        <h1 className="text-center text-2xl font-bold text-emerald-700">Caixa Fácil</h1>
        <p className="mt-2 text-center text-slate-600">Entre com sua conta</p>
        <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="email">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none ring-emerald-500 focus:ring-2"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="password">
              Senha
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none ring-emerald-500 focus:ring-2"
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
            />
          </div>
          {error ? (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-14 rounded-xl bg-emerald-600 text-lg font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
