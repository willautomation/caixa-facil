"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AUTH_DISABLED_FOR_TESTS } from "@/lib/auth-flags";
import { createClient } from "@/lib/supabase/client";

const links = [
  { href: "/caixa", label: "Caixa" },
  { href: "/historico", label: "Histórico" },
  { href: "/relatorio-mensal", label: "Relatório mensal" },
  { href: "/produtos", label: "Produtos" },
  { href: "/estoque", label: "Estoque" },
] as const;

export function DashboardNav() {
  const pathname = usePathname();
  const router = useRouter();

  const logout = async () => {
    if (!AUTH_DISABLED_FOR_TESTS) {
      const supabase = createClient();
      await supabase.auth.signOut();
    }
    router.push(AUTH_DISABLED_FOR_TESTS ? "/" : "/login");
    router.refresh();
  };

  return (
    <header className="border-b border-slate-200 bg-white shadow-sm">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold tracking-tight text-emerald-700">Caixa Fácil</span>
        </div>
        <nav className="flex flex-wrap gap-2">
          {links.map(({ href, label }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={`rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
                  active
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-100 text-slate-800 hover:bg-slate-200"
                }`}
              >
                {label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={logout}
            className="rounded-xl bg-slate-800 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-900"
          >
            Sair
          </button>
        </nav>
      </div>
    </header>
  );
}
