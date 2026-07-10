import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCards, useCollection, useSummary } from "../lib/queries";
import { money, pct } from "../lib/format";
import { EmptyState, ErrorState } from "../components/States";
import { TableSkeleton } from "../components/Skeleton";

export function SetCompletionPage() {
  const summary = useSummary();
  const collection = useCollection();
  const [openSet, setOpenSet] = useState<string | null>(null);

  // card_ids owned per set, e.g. "sv3-125" → set "sv3".
  const ownedBySet = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const e of collection.data ?? []) {
      const setId = e.card_id.slice(0, e.card_id.lastIndexOf("-"));
      (map[setId] ??= new Set()).add(e.card_id);
    }
    return map;
  }, [collection.data]);

  if (summary.isPending) return <TableSkeleton rows={6} />;
  if (summary.isError)
    return (
      <ErrorState message={(summary.error as Error).message} onRetry={() => summary.refetch()} />
    );
  const sets = summary.data.sets;

  if (sets.length === 0) {
    return (
      <>
        <h1 className="mb-4 text-2xl font-bold">Set completion</h1>
        <EmptyState title="No sets started" hint="Add cards to a set to track completion here." />
      </>
    );
  }

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Set completion</h1>
      <div className="space-y-3">
        {[...sets]
          .sort((a, b) => b.completion_pct - a.completion_pct)
          .map((s) => (
            <div
              key={s.set_id}
              className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <Link
                  to={`/sets/${s.set_id}`}
                  className="font-medium text-brand-600 hover:underline"
                >
                  {s.set_name}
                </Link>
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  {s.distinct_cards_owned}
                  {s.set_size ? ` / ${s.set_size} (${pct(s.completion_pct)})` : " cards"} ·{" "}
                  {money(s.market_value)}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-700 transition-all"
                  style={{ width: `${Math.min(100, Math.round(s.completion_pct * 100))}%` }}
                />
              </div>

              {s.set_size && s.distinct_cards_owned < s.set_size && (
                <div className="mt-3">
                  <button
                    onClick={() => setOpenSet(openSet === s.set_id ? null : s.set_id)}
                    className="text-sm font-medium text-brand-600 hover:underline"
                  >
                    {openSet === s.set_id ? "Hide" : "Cost to complete →"}
                  </button>
                  {openSet === s.set_id && (
                    <CostToComplete setId={s.set_id} ownedIds={ownedBySet[s.set_id] ?? new Set()} />
                  )}
                </div>
              )}
            </div>
          ))}
      </div>
    </>
  );
}

/** Lazily loads a set's cards and lists the cheapest cards still missing, with a total. */
function CostToComplete({ setId, ownedIds }: { setId: string; ownedIds: Set<string> }) {
  const cards = useCards({ set_id: setId, sort: "number", limit: 300 });

  const missing = useMemo(() => {
    const all = cards.data ?? [];
    return all
      .filter((c) => !ownedIds.has(c.id))
      .map((c) => ({ ...c, price: c.market_price === null ? null : Number(c.market_price) }))
      .sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  }, [cards.data, ownedIds]);

  if (cards.isPending) return <p className="mt-2 text-sm text-slate-500">Loading missing cards…</p>;
  if (cards.isError)
    return <p className="mt-2 text-sm text-danger-600">Could not load set cards.</p>;

  const total = missing.reduce((sum, c) => sum + (c.price ?? 0), 0);

  return (
    <div className="mt-3 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
      <p className="mb-2">
        <span className="font-semibold">{missing.length}</span> cards missing · estimated{" "}
        <span className="font-semibold">{money(total)}</span> to complete (cheapest priced first)
      </p>
      <ul className="max-h-60 space-y-1 overflow-y-auto">
        {missing.slice(0, 30).map((c) => (
          <li key={c.id} className="flex justify-between gap-2">
            <Link
              to={`/cards/${encodeURIComponent(c.id)}`}
              className="truncate text-brand-600 hover:underline"
            >
              {c.name} #{c.number}
            </Link>
            <span className="shrink-0 text-slate-500">
              {c.price === null ? "—" : money(c.price)}
            </span>
          </li>
        ))}
      </ul>
      {missing.length > 30 && (
        <p className="mt-2 text-xs text-slate-400">…and {missing.length - 30} more.</p>
      )}
    </div>
  );
}
