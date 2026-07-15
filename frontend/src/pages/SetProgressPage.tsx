import { useMemo } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useAllSetCards, useCollection, useSet } from "../lib/queries";
import { useCurrency } from "../context/CurrencyContext";
import { EmptyState, ErrorState } from "../components/States";
import { PageSkeleton } from "../components/Skeleton";
import type { Card } from "../types";

/**
 * Per-set "cards left to collect" view. Reached ONLY by clicking a set row in the dashboard
 * "By set" tile (route /dashboard/set/:setId; deliberately not in the top nav). Read-only.
 *
 * Missing = every card in the set the user does NOT own yet — i.e. all catalog cards for the set
 * minus the card_ids the user owns in that set. Each row shows the card's RAW (ungraded)
 * canonical market value (`Card.market_price`, the same USD headline the catalog/detail use — no
 * grade premium); an unpriced card shows "—" (null, never 0). Rows link to the card detail page,
 * whose "← Back" returns here.
 */
export function SetProgressPage() {
  const { setId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const set = useSet(setId);
  const cards = useAllSetCards(setId);
  const collection = useCollection();
  const { format } = useCurrency();

  // card_ids the user owns anywhere; intersected with the set's cards below (a card_id belongs to
  // exactly one set, so membership in this set's card list is what scopes it).
  const owned = useMemo(
    () => new Set((collection.data ?? []).map((e) => e.card_id)),
    [collection.data],
  );

  // The "left to collect" list, sorted by raw value desc (chase cards on top); unpriced cards
  // sink to the bottom, tie-broken by collector number so the order is stable.
  const missing = useMemo(() => {
    const val = (c: Card) => (c.market_price == null ? -Infinity : Number(c.market_price));
    return (cards.data ?? [])
      .filter((c) => !owned.has(c.id))
      .sort(
        (a, b) =>
          val(b) - val(a) || a.number.localeCompare(b.number, undefined, { numeric: true }),
      );
  }, [cards.data, owned]);

  if (set.isPending || cards.isPending || collection.isPending) return <PageSkeleton />;
  if (set.isError)
    return <ErrorState message={(set.error as Error).message} onRetry={() => set.refetch()} />;
  if (cards.isError)
    return <ErrorState message={(cards.error as Error).message} onRetry={() => cards.refetch()} />;
  if (collection.isError)
    return (
      <ErrorState
        message={(collection.error as Error).message}
        onRetry={() => collection.refetch()}
      />
    );
  if (!set.data) return <PageSkeleton />;

  const allCards = cards.data ?? [];
  const ownedInSet = allCards.filter((c) => owned.has(c.id)).length;
  // Match the dashboard "By set" figure exactly: distinct owned / (printed_total ?? total).
  const setSize = set.data.printed_total ?? set.data.total ?? allCards.length;

  return (
    <>
      <button
        type="button"
        onClick={() => (location.key === "default" ? navigate("/") : navigate(-1))}
        className="text-sm text-brand-600 hover:underline"
      >
        ← Back
      </button>

      <h1 className="mt-2 text-2xl font-bold">
        {set.data.name}{" "}
        <span className="font-medium text-slate-400">
          · {ownedInSet} / {setSize}
        </span>
      </h1>
      <p className="mb-4 mt-1 text-sm text-slate-500 dark:text-slate-400">
        {missing.length === 0
          ? "You own every card in this set."
          : `${missing.length} card${missing.length === 1 ? "" : "s"} left to collect — raw (ungraded) market value.`}
      </p>

      {missing.length === 0 ? (
        <EmptyState title="Set complete! 🎉" hint="You own every card in this set." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left dark:bg-slate-800">
              <tr>
                <th className="px-4 py-2">Card</th>
                <th className="px-4 py-2 text-right">Raw value</th>
              </tr>
            </thead>
            <tbody>
              {missing.map((c) => (
                <tr
                  key={c.id}
                  className="border-t border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                >
                  <td className="px-4 py-2">
                    <Link
                      to={`/cards/${encodeURIComponent(c.id)}`}
                      className="font-medium text-brand-600 hover:underline dark:text-brand-400"
                    >
                      {c.name}
                    </Link>
                    <span className="text-slate-400"> #{c.number}</span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{format(c.market_price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
