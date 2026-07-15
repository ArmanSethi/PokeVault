import { useState } from "react";
import { Link } from "react-router-dom";
import { TableSkeleton } from "../components/Skeleton";
import { ErrorState } from "../components/States";
import { useCurrency } from "../context/CurrencyContext";
import { usePullLeaderboard } from "../lib/queries";
import type { LeaderboardMode, LeaderboardWindow } from "../types";

const MODES: { value: LeaderboardMode; label: string }[] = [
  { value: "best_single", label: "Best single pull" },
  { value: "total_value", label: "Total pulled value" },
];

function Toggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-slate-300 dark:border-slate-700">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`px-3 py-1.5 text-sm font-medium ${
            value === o.value
              ? "bg-brand-600 text-white"
              : "hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Public best-pulls leaderboard. Ranking is by real market price (frozen or live). Anyone with
 * a handle and at least one kept pull appears automatically — there is no opt-in. */
export function LeaderboardPage() {
  const [mode, setMode] = useState<LeaderboardMode>("best_single");
  const [window, setWindow] = useState<LeaderboardWindow>("monthly");
  const board = usePullLeaderboard(mode, window);
  const { format } = useCurrency();

  // Window labels are the LIVE current UTC day/month names (e.g. "Sunday", "July").
  const dayName = new Date().toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  const monthName = new Date().toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  const windows: { value: LeaderboardWindow; label: string }[] = [
    { value: "daily", label: dayName },
    { value: "monthly", label: monthName },
    { value: "all_time", label: "All-time" },
  ];

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">Leaderboard</h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Top pack pulls from collectors on the board — ranked by market value.
      </p>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Toggle options={MODES} value={mode} onChange={setMode} />
        {mode === "total_value" ? (
          <Toggle options={windows} value={window} onChange={setWindow} />
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Today · {dayName} · top 10, updates daily
          </p>
        )}
      </div>

      {board.isPending ? (
        <TableSkeleton rows={8} />
      ) : board.isError ? (
        <ErrorState message={(board.error as Error).message} onRetry={() => board.refetch()} />
      ) : board.data.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {mode === "best_single"
            ? "No top pulls yet today — open a pack to claim #1."
            : window === "daily"
              ? "No pulls yet today — open a pack to get on the board."
              : window === "monthly"
                ? "No pulls yet this month — open a pack to get on the board."
                : "No pulls yet — open a pack to get on the board."}
        </p>
      ) : (
        <ol className="space-y-2">
          {board.data.map((e) => (
            <li
              key={e.rank}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
            >
              <span className="w-8 text-center text-lg font-bold text-slate-400">{e.rank}</span>
              {mode === "best_single" && e.card && (
                <Link
                  to={`/cards/${encodeURIComponent(e.card.card_id)}`}
                  className="flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded bg-slate-100 dark:bg-slate-800"
                >
                  {e.card.image_url ? (
                    <img
                      src={e.card.image_url}
                      alt={e.card.name}
                      loading="lazy"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="text-xl opacity-30">🃏</span>
                  )}
                </Link>
              )}
              <div className="min-w-0 flex-1">
                {/* Link to the showcase only when it's public; otherwise the handle is inert. */}
                {e.showcase_public ? (
                  <Link
                    to={`/u/${e.handle}`}
                    className="font-medium text-brand-600 hover:underline"
                  >
                    @{e.handle}
                  </Link>
                ) : (
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    @{e.handle}
                  </span>
                )}
                {mode === "best_single" && e.card && (
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {e.card.name} · {e.card.set_id}
                  </p>
                )}
                {mode === "total_value" && e.pull_count != null && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">{e.pull_count} pulls</p>
                )}
              </div>
              <span className="shrink-0 text-lg font-bold">{format(e.score)}</span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
