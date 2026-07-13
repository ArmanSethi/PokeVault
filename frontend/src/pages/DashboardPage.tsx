import { Link } from "react-router-dom";
import { useSummary, usePortfolioHistory } from "../lib/queries";
import { useCurrency } from "../context/CurrencyContext";
import { HIDDEN_MASK, useHideValue } from "../lib/useHideValue";
import { PriceChart } from "../components/PriceChart";
import { FeaturedCard } from "../components/FeaturedCard";
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

// Shared surface style so the stat tiles, chart panel, and by-set table read as one system
// (matching radius / border / subtle resting shadow, light + dark).
const PANEL =
  "rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900";

// Faint decorative Pokéball, echoing the app's background motif. Purely ornamental.
function PokeballMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" aria-hidden="true" className={className}>
      <circle cx="50" cy="50" r="46" stroke="currentColor" strokeWidth="4" />
      <path d="M4 50h30a16 16 0 0 1 32 0h30" stroke="currentColor" strokeWidth="4" />
      <circle cx="50" cy="50" r="11" stroke="currentColor" strokeWidth="4" fill="none" />
    </svg>
  );
}

/** Small stat tile (Total spent / Total cards). `h-full` lets it fill its grid cell so the
 * stacked pair aligns with the hero's height. When `to` is set it becomes a link with a
 * tasteful hover lift; otherwise it's a plain, non-interactive surface. */
function Stat({ label, value, to }: { label: string; value: string; to?: string }) {
  const className = `flex h-full flex-col ${PANEL} p-4 ${
    to ? "cursor-pointer transition hover:border-brand-300 hover:shadow-md" : ""
  }`;
  const inner = (
    <>
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
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
          {/* Hero layout: Portfolio value is the emphasised tile on the left (golden-ratio share);
              Total spent (top) + Total cards (bottom) stack to its right. On mobile the hero goes
              full-width on top with the two small tiles side by side beneath. The left column and
              the stacked pair stretch to equal height (h-full on each tile). */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.618fr_1fr]">
            {/* Portfolio value — HERO. Intentionally NON-clickable (no navigation). */}
            <div className="relative flex h-full flex-col justify-center overflow-hidden rounded-xl border border-transparent bg-gradient-to-br from-brand-600 to-brand-800 p-6 text-white shadow-sm sm:p-8">
              <PokeballMark className="pointer-events-none absolute -right-8 -top-8 h-44 w-44 text-white/10" />
              <div className="relative z-10">
                <p className="text-xs font-medium uppercase tracking-wider text-brand-200">
                  Portfolio value
                </p>
                <p className="mt-1.5 text-4xl font-bold tracking-tight tabular-nums sm:text-5xl">
                  {hidden ? HIDDEN_MASK : format(summary.data.total_market_value)}
                </p>
              </div>
              <button
                type="button"
                onClick={toggle}
                aria-label={hidden ? "Show portfolio value" : "Hide portfolio value"}
                aria-pressed={hidden}
                title={hidden ? "Show portfolio value" : "Hide portfolio value"}
                className="absolute right-2 top-2 z-10 rounded-md p-1.5 text-brand-100 transition-colors hover:bg-white/20"
              >
                {hidden ? <EyeSlashIcon /> : <EyeIcon />}
              </button>
            </div>

            {/* Right column: two small equal tiles — Total spent (top), Total cards (bottom).
                Side by side on mobile, stacked on desktop. */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-1 md:grid-rows-2">
              {/* Total spent = SUM(acquired_price x qty), nulls skipped; its own hide toggle.
                  Non-clickable by design (no link). */}
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
              {/* Total cards → Collection in GRID view (forces grid over any stored preference). */}
              <Stat
                label="Total cards"
                value={String(summary.data.total_quantity)}
                to="/collection?view=grid"
              />
            </div>
          </div>

          <h2 className="mb-3 mt-8 text-lg font-semibold">Portfolio value over time</h2>
          {history.data?.points.length ? (
            <p className="mb-3 text-xs text-slate-400">
              Daily tracking since {history.data.points[0]?.date ?? ""} — earlier days aren't
              recorded.
            </p>
          ) : null}
          {/* Same grid template as the stat row so the chart tile lines up directly under the
              Portfolio hero — identical left/right edges and footprint. The chart occupies the
              hero's (1.618fr) column; the Featured card fills the right column (under the small
              tiles), matching the chart's height so the row is balanced. On mobile (grid-cols-1)
              they stack full-width. `min-w-0` lets the Recharts container reflow to its track. */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.618fr_1fr]">
            <div className="min-w-0">
              {history.isPending ? (
                <div className="h-64 animate-pulse rounded-xl bg-slate-200 shadow-sm dark:bg-slate-800" />
              ) : history.isError ? (
                <ErrorState
                  message={(history.error as Error).message}
                  onRetry={() => history.refetch()}
                />
              ) : history.data?.message ? (
                <div
                  className={`${PANEL} p-6 text-center text-sm text-slate-500 dark:text-slate-400`}
                >
                  {history.data.message}
                </div>
              ) : (
                <PriceChart
                  label="Portfolio"
                  className="shadow-sm"
                  data={(history.data?.points ?? []).map((p) => ({
                    date: p.date,
                    value: Number(p.total_value),
                  }))}
                />
              )}
            </div>

            <FeaturedCard />
          </div>

          <h2 className="mb-3 mt-8 text-lg font-semibold">By set</h2>
          <div className={`overflow-x-auto ${PANEL}`}>
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
