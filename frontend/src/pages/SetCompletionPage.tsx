import { Link } from "react-router-dom";
import { useSummary } from "../lib/queries";
import { money, pct } from "../lib/format";
import { EmptyState, ErrorState } from "../components/States";
import { TableSkeleton } from "../components/Skeleton";

export function SetCompletionPage() {
  const summary = useSummary();

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
                  to={`/catalog?set=${s.set_id}`}
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
            </div>
          ))}
      </div>
    </>
  );
}
