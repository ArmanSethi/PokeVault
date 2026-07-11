import { Link } from "react-router-dom";
import { useSummary, usePortfolioHistory } from "../lib/queries";
import { pct } from "../lib/format";
import { useCurrency } from "../context/CurrencyContext";
import { PriceChart } from "../components/PriceChart";
import { EmptyState, ErrorState } from "../components/States";
import { StatTilesSkeleton, TableSkeleton } from "../components/Skeleton";

function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        accent
          ? "border-transparent bg-gradient-to-br from-brand-600 to-brand-800 text-white"
          : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      }`}
    >
      <p className={`text-sm ${accent ? "text-brand-100" : "text-slate-500 dark:text-slate-400"}`}>
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

export function DashboardPage() {
  const summary = useSummary();
  const history = usePortfolioHistory();
  const { format } = useCurrency();

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Dashboard</h1>

      {summary.isPending ? (
        <StatTilesSkeleton />
      ) : summary.isError ? (
        <ErrorState message={(summary.error as Error).message} onRetry={() => summary.refetch()} />
      ) : summary.data.total_distinct_cards === 0 ? (
        <>
          <EmptyState
            title="Your collection is empty"
            hint="Browse the catalog or scan a card to start tracking your Pokémon collection."
          />
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              to="/catalog"
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Browse catalog
            </Link>
            <Link
              to="/scan"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium dark:border-slate-700"
            >
              Scan a card
            </Link>
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Portfolio value" value={format(summary.data.total_market_value)} accent />
            <Stat label="Total cards" value={String(summary.data.total_quantity)} />
          </div>

          <h2 className="mb-2 mt-8 text-lg font-semibold">Portfolio value over time</h2>
          {history.isPending ? (
            <div className="h-64 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
          ) : history.isError ? (
            <ErrorState
              message={(history.error as Error).message}
              onRetry={() => history.refetch()}
            />
          ) : (
            <PriceChart
              label="Portfolio"
              data={(history.data?.points ?? []).map((p) => ({
                date: p.date,
                value: Number(p.total_value),
              }))}
            />
          )}

          <h2 className="mb-2 mt-8 text-lg font-semibold">By set</h2>
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-left dark:bg-slate-800">
                <tr>
                  <th className="px-4 py-2">Set</th>
                  <th className="px-4 py-2">Owned</th>
                  <th className="px-4 py-2">Completion</th>
                  <th className="px-4 py-2 text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {summary.data.sets.map((h) => (
                  <tr key={h.set_id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-2">
                      <Link
                        to={`/catalog?set=${h.set_id}`}
                        className="font-medium text-brand-600 hover:underline"
                      >
                        {h.set_name}
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      {h.distinct_cards_owned}
                      {h.set_size ? ` / ${h.set_size}` : ""}
                    </td>
                    <td className="px-4 py-2">{h.set_size ? pct(h.completion_pct) : "—"}</td>
                    <td className="px-4 py-2 text-right">{format(h.market_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {summary.isPending && (
        <div className="mt-8">
          <TableSkeleton rows={4} />
        </div>
      )}
    </>
  );
}
