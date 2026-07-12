import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CardGridSkeleton } from "../components/Skeleton";
import { EmptyState, ErrorState } from "../components/States";
import { useCurrency } from "../context/CurrencyContext";
import { hasPrice } from "../lib/format";
import { usePulls } from "../lib/queries";

const LAYOUT_KEY = "pv-vault-view";
type Sort = "value" | "pulled" | "name";

/** One tile per distinct card_id; each individual pull is still its own DB row (scoring reads
 * rows). `count` = how many copies pulled; `priceAtPull` is the most-recent pull's frozen price. */
interface Stack {
  card_id: string;
  name: string;
  set_id: string;
  number: string;
  image_url: string | null;
  count: number;
  currentEach: number | null;
  totalCurrent: number;
  pulledAt: string;
  priceAtPull: string | null;
}

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

  // Stack duplicates. Rows arrive newest-first (backend orders by pulled_at desc), so the first
  // row seen for a card_id is the most-recent pull — we take its frozen price for the "pulled at".
  const stacks = useMemo(() => {
    const map = new Map<string, Stack>();
    for (const p of rows) {
      const priced = hasPrice(p.current_value);
      let s = map.get(p.card_id);
      if (!s) {
        s = {
          card_id: p.card_id,
          name: p.name,
          set_id: p.set_id,
          number: p.number,
          image_url: p.image_url,
          count: 0,
          currentEach: priced ? Number(p.current_value) : null,
          totalCurrent: 0,
          pulledAt: p.pulled_at,
          priceAtPull: p.price_at_pull,
        };
        map.set(p.card_id, s);
      }
      s.count += 1;
      if (priced) s.totalCurrent += Number(p.current_value);
    }
    return [...map.values()];
  }, [rows]);

  const sets = useMemo(() => [...new Set(stacks.map((s) => s.set_id))].sort(), [stacks]);
  const view = useMemo(() => {
    let r = setFilter ? stacks.filter((s) => s.set_id === setFilter) : stacks;
    r = [...r].sort((a, b) => {
      if (sort === "value") return b.totalCurrent - a.totalCurrent;
      if (sort === "name") return a.name.localeCompare(b.name);
      return b.pulledAt.localeCompare(a.pulledAt); // newest first
    });
    return r;
  }, [stacks, setFilter, sort]);

  if (pulls.isPending) return <CardGridSkeleton />;
  if (pulls.isError)
    return <ErrorState message={(pulls.error as Error).message} onRetry={() => pulls.refetch()} />;

  const totalCurrent = stacks.reduce((s, x) => s + x.totalCurrent, 0);

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
          <p className="text-slate-500 dark:text-slate-400">
            {rows.length} pulls · {stacks.length} unique · total value
          </p>
          <p className="text-lg font-bold text-brand-600 dark:text-brand-400">
            {format(totalCurrent)}
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No pulls yet" hint="Open a pack and keep cards — they land here." />
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
              {view.map((s) => (
                <div
                  key={s.card_id}
                  className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                >
                  <Link
                    to={`/cards/${encodeURIComponent(s.card_id)}`}
                    className="relative flex aspect-[3/4] items-center justify-center bg-slate-100 dark:bg-slate-800"
                  >
                    {s.image_url ? (
                      <img
                        src={s.image_url}
                        alt={s.name}
                        loading="lazy"
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <span className="text-4xl opacity-30">🃏</span>
                    )}
                    {s.count > 1 && (
                      <span className="absolute right-1.5 top-1.5 rounded-full bg-brand-600 px-2 py-0.5 text-xs font-bold text-white shadow">
                        ×{s.count}
                      </span>
                    )}
                  </Link>
                  <div className="flex flex-1 flex-col gap-0.5 p-3">
                    <p className="truncate text-sm font-medium" title={s.name}>
                      {s.name}
                    </p>
                    <p className="text-sm font-semibold text-brand-600 dark:text-brand-400">
                      {s.currentEach !== null ? format(s.totalCurrent) : "No price yet"}
                      {s.count > 1 && s.currentEach !== null && (
                        <span className="ml-1 text-xs font-normal text-slate-400">
                          ({format(s.currentEach)} ea)
                        </span>
                      )}
                    </p>
                    {hasPrice(s.priceAtPull) && (
                      <p className="text-xs text-slate-400">pulled at {format(s.priceAtPull)}</p>
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
                    <th className="px-4 py-2 text-right">Qty</th>
                    <th className="px-4 py-2 text-right">Pulled at</th>
                    <th className="px-4 py-2 text-right">Current value</th>
                  </tr>
                </thead>
                <tbody>
                  {view.map((s) => (
                    <tr key={s.card_id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-4 py-2">
                        <Link
                          to={`/cards/${encodeURIComponent(s.card_id)}`}
                          className="font-medium text-brand-600 hover:underline"
                        >
                          {s.name}
                        </Link>
                      </td>
                      <td className="px-4 py-2">
                        {s.set_id} · #{s.number}
                      </td>
                      <td className="px-4 py-2 text-right">×{s.count}</td>
                      <td className="px-4 py-2 text-right text-slate-500">
                        {hasPrice(s.priceAtPull) ? format(s.priceAtPull) : "—"}
                      </td>
                      <td className="px-4 py-2 text-right font-medium">
                        {s.currentEach !== null ? format(s.totalCurrent) : "—"}
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
