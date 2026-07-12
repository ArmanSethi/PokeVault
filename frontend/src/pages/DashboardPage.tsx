import { Link } from "react-router-dom";
import { useSummary, usePortfolioHistory } from "../lib/queries";
import { useCurrency } from "../context/CurrencyContext";
import { HIDDEN_MASK, useHideValue } from "../lib/useHideValue";
import { PriceChart } from "../components/PriceChart";
import { EmptyState, ErrorState } from "../components/States";
import { StatTilesSkeleton, TableSkeleton } from "../components/Skeleton";

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function EyeSlashIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.9 4.7A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-3.2 4M6.6 6.6A18 18 0 0 0 2 12s3.5 7 10 7a10.8 10.8 0 0 0 4.5-1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Stat({
  label,
  value,
  accent = false,
  to,
}: {
  label: string;
  value: string;
  accent?: boolean;
  to?: string;
}) {
  const className = `block rounded-xl border p-4 ${
    accent
      ? "border-transparent bg-gradient-to-br from-brand-600 to-brand-800 text-white"
      : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
  } ${to ? "cursor-pointer transition hover:opacity-90" : ""}`;
  const inner = (
    <>
      <p className={`text-sm ${accent ? "text-brand-100" : "text-slate-500 dark:text-slate-400"}`}>
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </>
  );
  return to ? (
    <Link to={to} className={className}>
      {inner}
    </Link>
  ) : (
    <div className={className}>{inner}</div>
  );
}

export function DashboardPage() {
  const summary = useSummary();
  const history = usePortfolioHistory();
  const { format } = useCurrency();
  const { hidden, toggle } = useHideValue();
  const { hidden: spentHidden, toggle: spentToggle } = useHideValue("pv-hide-spent");

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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="relative">
              <Stat
                label="Portfolio value"
                value={hidden ? HIDDEN_MASK : format(summary.data.total_market_value)}
                accent
                to="/collection?view=grid"
              />
              <button
                type="button"
                onClick={toggle}
                aria-label={hidden ? "Show portfolio value" : "Hide portfolio value"}
                aria-pressed={hidden}
                title={hidden ? "Show portfolio value" : "Hide portfolio value"}
                className="absolute right-2 top-2 rounded-md p-1.5 text-brand-100 transition-colors hover:bg-white/20"
              >
                {hidden ? <EyeSlashIcon /> : <EyeIcon />}
              </button>
            </div>
            <Stat
              label="Total cards"
              value={String(summary.data.total_quantity)}
              to="/collection?view=table"
            />
            {/* Total spent = SUM(acquired_price x qty), nulls skipped; its own hide toggle. */}
            <div className="relative">
              <Stat
                label="Total spent"
                value={spentHidden ? HIDDEN_MASK : format(summary.data.total_cost)}
              />
              <button
                type="button"
                onClick={spentToggle}
                aria-label={spentHidden ? "Show total spent" : "Hide total spent"}
                aria-pressed={spentHidden}
                title={spentHidden ? "Show total spent" : "Hide total spent"}
                className="absolute right-2 top-2 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {spentHidden ? <EyeSlashIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          <h2 className="mb-2 mt-8 text-lg font-semibold">Portfolio value over time</h2>
          {history.data?.points.length ? (
            <p className="-mt-1 mb-2 text-xs text-slate-400">
              Daily tracking since {history.data.points[0]?.date ?? ""} — earlier days aren't
              recorded.
            </p>
          ) : null}
          {history.isPending ? (
            <div className="h-64 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
          ) : history.isError ? (
            <ErrorState
              message={(history.error as Error).message}
              onRetry={() => history.refetch()}
            />
          ) : history.data?.message ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              {history.data.message}
            </div>
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
