import { useState } from "react";
import { Link } from "react-router-dom";
import { useSummary, usePortfolioHistory, useUpdateProfile } from "../lib/queries";
import { useCurrency } from "../context/CurrencyContext";
import { HIDDEN_MASK, useHideValue } from "../lib/useHideValue";
import { PriceChart } from "../components/PriceChart";
import { FeaturedCard } from "../components/FeaturedCard";
import { EmptyState, ErrorState } from "../components/States";
import { StatTilesSkeleton, TableSkeleton } from "../components/Skeleton";
import { useToast } from "../components/Toast";

// Manual "Total spent" accepts 0 up to 99,999,999,999 (matches the backend column bound).
const TOTAL_SPENT_MAX = 99_999_999_999;

function PencilIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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

/**
 * "Total spent" tile. This figure is manually entered — there is no auto-calculation. `value` is
 * the user's stored override (or null when unset → a neutral "Set amount" empty state). A pencil
 * (left of the eye) opens an inline editor: type 0–99,999,999,999 (raw while typing, clamped on
 * commit), Save PATCHes the override, Clear resets it to the empty state. The eye hides the value.
 */
function TotalSpentTile({ value }: { value: string | null }) {
  const { format } = useCurrency();
  const { hidden, toggle } = useHideValue("pv-hide-spent");
  const update = useUpdateProfile();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState("");
  const hasValue = value != null;

  function open() {
    setRaw(hasValue ? String(Number(value)) : "");
    setEditing(true);
  }

  function save(v: number | null) {
    update.mutate(
      { total_spent_override: v },
      {
        onSuccess: () => {
          setEditing(false);
          toast.success(v == null ? "Total spent cleared." : "Total spent updated.");
        },
        onError: () => toast.error("Could not save Total spent."),
      },
    );
  }

  function commit() {
    const t = raw.trim();
    if (t === "") {
      save(null); // empty on save → clear back to the neutral empty state
      return;
    }
    const n = Number(t);
    if (!Number.isFinite(n)) {
      setEditing(false);
      return;
    }
    save(Math.min(TOTAL_SPENT_MAX, Math.max(0, Math.round(n * 100) / 100)));
  }

  return (
    <div className={`relative flex h-full flex-col ${PANEL} p-4`}>
      <p className="text-sm text-slate-500 dark:text-slate-400">Total spent</p>
      <p
        className={`mt-1 text-2xl font-bold ${hasValue ? "" : "text-slate-400 dark:text-slate-600"}`}
      >
        {hidden ? HIDDEN_MASK : hasValue ? format(value) : "Set amount"}
      </p>

      <div className="absolute right-2 top-2 flex items-center gap-1">
        <button
          type="button"
          onClick={open}
          aria-label="Edit total spent"
          title="Edit total spent"
          className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <PencilIcon />
        </button>
        <button
          type="button"
          onClick={toggle}
          aria-label={hidden ? "Show total spent" : "Hide total spent"}
          aria-pressed={hidden}
          title={hidden ? "Show total spent" : "Hide total spent"}
          className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          {hidden ? <EyeSlashIcon /> : <EyeIcon />}
        </button>
      </div>

      {editing && (
        <div className="absolute left-0 right-0 top-full z-20 mt-2 rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">
            Amount (USD)
          </label>
          <input
            type="text"
            inputMode="decimal"
            autoFocus
            value={raw}
            onChange={(e) => {
              const next = e.target.value.replace(/[^0-9.]/g, "");
              if ((next.match(/\./g) ?? []).length <= 1) setRaw(next);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") setEditing(false);
            }}
            placeholder="0 – 99,999,999,999"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => save(null)}
              disabled={update.isPending || !hasValue}
              className="text-xs font-medium text-slate-500 hover:text-slate-700 disabled:opacity-40 dark:hover:text-slate-300"
            >
              Clear
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs dark:border-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={commit}
                disabled={update.isPending}
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {update.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function DashboardPage() {
  const summary = useSummary();
  const history = usePortfolioHistory();
  const { format } = useCurrency();
  const { hidden, toggle } = useHideValue();

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
          {/* TOP AREA — 2x2 quadrant grid: [Portfolio hero | Total spent + Total cards] over
              [By set | Featured]. Equal-width columns; the top row (hero / stats) aligns in height
              (anchored by the hero's md:h-48) and the bottom row (By set / Featured) aligns in
              height (anchored by the big Featured box). On mobile it stacks in order: Portfolio,
              Total spent, Total cards, By set, Featured. */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {/* Top-left: Portfolio value HERO. Intentionally NON-clickable (no navigation). */}
            <div className="relative flex flex-col justify-center overflow-hidden rounded-xl border border-transparent bg-gradient-to-br from-brand-600 to-brand-800 p-6 text-white shadow-sm sm:p-8 md:h-48">
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

            {/* Top-right: Total spent (top) + Total cards (bottom), stacked; fills the top row. */}
            <div className="grid grid-cols-1 gap-3 md:h-full md:grid-rows-2">
              {/* Total spent — a manually-entered figure (pencil to edit, eye to hide). */}
              <TotalSpentTile value={summary.data.total_cost} />
              {/* Total cards → Collection in GRID view (forces grid over any stored preference). */}
              <Stat
                label="Total cards"
                value={String(summary.data.total_quantity)}
                to="/collection?view=grid"
              />
            </div>

            {/* Bottom-left: By set — CONSTANT height (h-72 / md:h-full anchored to the bottom
                row); the set list scrolls WITHIN via the inner overflow-y-auto, so the tile's
                footprint never grows with the number of sets. Each row: set name (left) +
                owned/total completion count (right). */}
            <div className={`flex h-72 flex-col overflow-hidden md:h-full ${PANEL}`}>
              <div className="border-b border-slate-200 px-3 py-2 text-sm font-semibold dark:border-slate-800">
                By set
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {summary.data.sets.map((h) => (
                  <Link
                    key={h.set_id}
                    to={`/catalog?set=${h.set_id}`}
                    className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 last:border-b-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                  >
                    <span className="min-w-0 truncate text-sm font-medium text-brand-600 dark:text-brand-400">
                      {h.set_name}
                    </span>
                    <span className="shrink-0 text-sm font-medium tabular-nums text-slate-500 dark:text-slate-400">
                      {h.distinct_cards_owned}
                      {h.set_size ? ` / ${h.set_size}` : ""}
                    </span>
                  </Link>
                ))}
              </div>
            </div>

            {/* Bottom-right: Featured card (big box — anchors the bottom-row height). */}
            <FeaturedCard />
          </div>

          {/* BELOW: full-width portfolio-value-over-time chart (moved down from where By-set was). */}
          <h2 className="mb-3 mt-8 text-lg font-semibold">Portfolio value over time</h2>
          {history.data?.points.length ? (
            <p className="mb-3 text-xs text-slate-400">
              Daily tracking since {history.data.points[0]?.date ?? ""} — earlier days aren't
              recorded.
            </p>
          ) : null}
          <div className="min-w-0">
            {history.isPending ? (
              <div className="h-72 animate-pulse rounded-xl bg-slate-200 shadow-sm dark:bg-slate-800" />
            ) : history.isError ? (
              <ErrorState
                message={(history.error as Error).message}
                onRetry={() => history.refetch()}
              />
            ) : history.data?.message ? (
              <div className={`${PANEL} p-6 text-center text-sm text-slate-500 dark:text-slate-400`}>
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
