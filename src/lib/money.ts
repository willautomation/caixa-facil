const br = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function formatBRL(value: number): string {
  return br.format(Number.isFinite(value) ? value : 0);
}

/** Aceita string com vírgula ou ponto decimal */
export function parseMoneyInput(raw: string): number {
  const t = raw.trim().replace(/\./g, "").replace(",", ".");
  if (t === "" || t === "-") return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

/** Formata número para exibição no teclado (vírgula decimal) */
export function toKeypadString(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "";
  return value.toFixed(2).replace(".", ",");
}
