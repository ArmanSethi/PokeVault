/** Format a money value that arrives from the API as a string|number|null. */
export function money(value: string | number | null | undefined, currency = "USD"): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n);
}

/** Short date for chart axes / labels. */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function pct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}
