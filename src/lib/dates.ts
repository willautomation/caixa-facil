/** Retorna yyyy-mm-dd no fuso local */
export function toInputDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Início e fim (exclusivo) do dia local em ISO */
export function localDayRangeIso(dateStr: string): { startIso: string; endIso: string } {
  const [y, m, d] = dateStr.split("-").map((x) => Number(x));
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/** Primeiro e último instante do mês local (yyyy-mm) */
export function localMonthRangeIso(monthStr: string): { startIso: string; endIso: string } {
  const [y, m] = monthStr.split("-").map((x) => Number(x));
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const end = new Date(y, m, 1, 0, 0, 0, 0);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}
