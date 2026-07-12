import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePulls } from "../lib/queries";
import { useCurrency } from "../context/CurrencyContext";
import { hasPrice } from "../lib/format";
import { EmptyState, ErrorState } from "../components/States";
import { CardGridSkeleton } from "../components/Skeleton";
import type { PackPull } from "../types";

const LAYOUT_KEY = "pv-vault-view";
type Sort = "value" | "pulled" | "name";

/** Virtual pull collection (Vault). Separate from the IRL collection — these are pack pulls. */
export function VaultPage() {
  const pulls = usePulls();
  const { format } = useCurrency();
  const [layout, setLayout] = useState<"grid" | "table">(() =>
    localStorage.getItem(LAYOUT_KEY) === "table" ? "table" : "grid",
  );
  const [sort, setSort] = useState<Sort>("value");
  const [setFilter, setSetFilter] = useState("");
  useEffect(() => localStorage.setItem(LAYOUT_KEY, layout), [layout]);

  const rows = useMemo(() => pulls.data ?? [], [pulls.data]);
  const sets = useMemo(() => [...new Set(rows.map((p) => p.set_id))].sort(), [rows]);
  const view = useMemo(() => {
    let r = setFilter ? rows.filter((p) => p.set_id === setFilter) : rows;
    const val = (p: PackPull) => Number(p.current_value ?? 0);
    r = [...r].sort((a, b) => {
      if (sort === "value") return val(b) - val(a);
      if (sort === "name") return a.name.localeCompare(b.name);
      return b.pulled_at.localeCompare(a.pulled_at); // newest first
    });
    return r;
  }, [rows, setFilter, sort]);

  if (pulls.isPending) return <CardGridSkeleton />;
  if (pulls.isError)
    return <ErrorState message={(pulls.error as Error).message} onRetry={() => pulls.refetch()} />;

  const totalCurrent = rows.reduce((s, p) => s + Number(p.current_value ?? 0), 0);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Vault</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Cards you've pulled in the simulator — separate from your real collection.
          </p>
        </div>
        <div className="text-right text-sm">
          <p className="text-slate-500 dark:text-slate-400">{rows.length} pulls · total value</p>
          <p className="text-lg font-bold text-brand-600 dark:text-brand-400">
            {format(totalCurrent)}
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No pulls yet"
          hint="Open a pack in the Simulator and keep cards — they land here."
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-lg border border-slate-300 dark:border-slate-700">
              {(["grid", "table"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setLayout(v)}
                  aria-pressed={layout === v}
                  className={`px-3 py-2 text-sm font-medium ${
                    layout === v
                      ? "bg-brand-600 text-white"
                      : "hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  {v === "grid" ? "▦ Grid" : "▤ Table"}
                </button>
              ))}
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              aria-label="Sort"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            >
              <option value="value">Current value (high→low)</option>
              <option value="pulled">Recently pulled</option>
              <option value="name">Name (A→Z)</option>
            </select>
            <select
              value={setFilter}
              onChange={(e) => setSetFilter(e.target.value)}
              aria-label="Filter by set"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            >
              <option value="">All sets</option>
              {sets.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {layout === "grid" ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {view.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                >
                  <Link
                    to={`/cards/${encodeURIComponent(p.card_id)}`}
                    className="flex aspect-[3/4] items-center justify-center bg-slate-100 dark:bg-slate-800"
                  >
                    {p.image_url ? (
                      <img
                        src={p.image_url}
                        alt={p.name}
                        loading="lazy"
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <span className="text-4xl opacity-30">🃏</span>
                    )}
                  </Link>
                  <div className="flex flex-1 flex-col gap-0.5 p-3">
                    <p className="truncate text-sm font-medium" title={p.name}>
                      {p.name}
                    </p>
                    <p className="text-sm font-semibold text-brand-600 dark:text-brand-400">
                      {hasPrice(p.current_value) ? format(p.current_value) : "No price yet"}
                    </p>
                    {hasPrice(p.price_at_pull) && (
                      <p className="text-xs text-slate-400">pulled at {format(p.price_at_pull)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 text-left dark:bg-slate-800">
                  <tr>
                    <th className="px-4 py-2">Card</th>
                    <th className="px-4 py-2">Set</th>
                    <th className="px-4 py-2 text-right">Pulled at</th>
                    <th className="px-4 py-2 text-right">Current value</th>
                  </tr>
                </thead>
                <tbody>
                  {view.map((p) => (
                    <tr key={p.id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-4 py-2">
                        <Link
                          to={`/cards/${encodeURIComponent(p.card_id)}`}
                          className="font-medium text-brand-600 hover:underline"
                        >
                          {p.name}
                        </Link>
                      </td>
                      <td className="px-4 py-2">
                        {p.set_id} · #{p.number}
                      </td>
                      <td className="px-4 py-2 text-right text-slate-500">
                        {hasPrice(p.price_at_pull) ? format(p.price_at_pull) : "—"}
                      </td>
                      <td className="px-4 py-2 text-right font-medium">
                        {hasPrice(p.current_value) ? format(p.current_value) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
