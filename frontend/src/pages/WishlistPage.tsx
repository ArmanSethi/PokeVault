import { useState } from "react";
import { Link } from "react-router-dom";
import { useAlerts, useDeleteWishlist, useWishlist } from "../lib/queries";
import { useCurrency } from "../context/CurrencyContext";
import { EmptyState, ErrorState } from "../components/States";
import { TableSkeleton } from "../components/Skeleton";
import { useToast } from "../components/Toast";
import type { Alert, WishlistItem } from "../types";

function alertText(a: Alert, fmt: (v: string | number | null | undefined) => string): string {
  const price = fmt(a.triggered_price);
  if (a.kind === "target_hit")
    return `${a.name ?? a.card_id} hit your target — now ${price}${
      a.target_price ? ` (target ${fmt(a.target_price)})` : ""
    }`;
  return `${a.name ?? a.card_id} dropped to ${price}`;
}

type WishSort = "status" | "market" | "name" | "target";

const SORTS: { value: WishSort; label: string }[] = [
  { value: "status", label: "Status" },
  { value: "market", label: "Market price (high → low)" },
  { value: "name", label: "Name (A → Z)" },
  { value: "target", label: "Target price (low → high)" },
];

/** 0 = at/below target, 1 = above target, 2 = watching (no target). Lower surfaces first. */
function statusRank(w: WishlistItem): number {
  const market = w.market_price === null ? null : Number(w.market_price);
  const target = w.target_price === null ? null : Number(w.target_price);
  if (target === null) return 2;
  if (market !== null && market <= target) return 0;
  return 1;
}

/** Sort a copy of the wishlist for display. Keeps every item regardless of status. */
function sortWishlist(items: WishlistItem[], sort: WishSort): WishlistItem[] {
  const copy = [...items];
  copy.sort((a, b) => {
    if (sort === "market") {
      // High → low, cards without a price last.
      const ma = a.market_price === null ? -Infinity : Number(a.market_price);
      const mb = b.market_price === null ? -Infinity : Number(b.market_price);
      return mb - ma || a.name.localeCompare(b.name);
    }
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "target") {
      // Low → high, cards with no target last.
      const ta = a.target_price === null ? Infinity : Number(a.target_price);
      const tb = b.target_price === null ? Infinity : Number(b.target_price);
      return ta - tb || a.name.localeCompare(b.name);
    }
    // status
    return statusRank(a) - statusRank(b) || a.name.localeCompare(b.name);
  });
  return copy;
}

export function WishlistPage() {
  const wishlist = useWishlist();
  const alerts = useAlerts();
  const del = useDeleteWishlist();
  const toast = useToast();
  const { format } = useCurrency();
  const [sort, setSort] = useState<WishSort>("status");

  if (wishlist.isPending) return <TableSkeleton rows={6} />;
  if (wishlist.isError)
    return (
      <ErrorState message={(wishlist.error as Error).message} onRetry={() => wishlist.refetch()} />
    );

  const items = wishlist.data;
  const recentAlerts = alerts.data ?? [];

  function remove(id: number, name: string) {
    if (!confirm(`Remove ${name} from your wishlist?`)) return;
    del.mutate(id, {
      onSuccess: () => toast.success("Removed from wishlist."),
      onError: () => toast.error("Could not remove."),
    });
  }

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">Wishlist</h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Track cards you want and set a target price. We update prices daily and surface target hits
        here in the app.
      </p>

      {recentAlerts.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
          <p className="mb-1 font-semibold text-amber-800 dark:text-amber-300">
            🔔 Recent price alerts
          </p>
          <ul className="space-y-1 text-sm text-amber-800 dark:text-amber-200">
            {recentAlerts.slice(0, 8).map((a) => (
              <li key={a.id}>
                <Link to={`/cards/${encodeURIComponent(a.card_id)}`} className="hover:underline">
                  {alertText(a, format)}
                </Link>{" "}
                <span className="text-amber-600 dark:text-amber-400">· {a.snapshot_date}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          title="Your wishlist is empty"
          hint="Add cards from the catalog or a card page to start tracking prices."
        />
      ) : (
        <>
          <div className="mb-3 flex items-center justify-end gap-2">
            <label htmlFor="wishlist-sort" className="text-sm text-slate-500 dark:text-slate-400">
              Sort
            </label>
            <select
              id="wishlist-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as WishSort)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-left dark:bg-slate-800">
                <tr>
                  <th className="px-4 py-2">Card</th>
                  <th className="px-4 py-2 text-right">Market</th>
                  <th className="px-4 py-2 text-right">Target</th>
                  <th className="px-4 py-2 text-right">Status</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {sortWishlist(items, sort).map((w) => {
                  const market = w.market_price === null ? null : Number(w.market_price);
                  const target = w.target_price === null ? null : Number(w.target_price);
                  const hit = market !== null && target !== null && market <= target;
                  return (
                    <tr key={w.id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-4 py-2">
                        <Link
                          to={`/cards/${encodeURIComponent(w.card_id)}`}
                          className="font-medium text-brand-600 hover:underline"
                        >
                          {w.name}
                        </Link>
                        <span className="text-slate-400">
                          {" "}
                          · {w.set_id} #{w.number}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">{format(w.market_price)}</td>
                      <td className="px-4 py-2 text-right">
                        {target !== null ? format(target) : "—"}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {target === null ? (
                          <span className="text-slate-400">watching</span>
                        ) : hit ? (
                          <span className="font-medium text-emerald-600 dark:text-emerald-400">
                            ✓ at/below target
                          </span>
                        ) : (
                          <span className="text-slate-500">above target</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => remove(w.id, w.name)}
                          className="text-danger-600 hover:underline dark:text-danger-500"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
