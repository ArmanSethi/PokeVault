import { useState } from "react";
import { Link } from "react-router-dom";
import { usePullLeaderboard } from "../lib/queries";
import { useCurrency } from "../context/CurrencyContext";
import { ErrorState } from "../components/States";
import { TableSkeleton } from "../components/Skeleton";
import type { LeaderboardMode, LeaderboardWindow } from "../types";

const MODES: { value: LeaderboardMode; label: string }[] = [
  { value: "best_single", label: "Best single pull" },
  { value: "total_value", label: "Total pulled value" },
];
const WINDOWS: { value: LeaderboardWindow; label: string }[] = [
  { value: "monthly", label: "This month" },
  { value: "all_time", label: "All-time" },
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

/** Public best-pulls leaderboard. Ranking is by real market price (frozen or live). */
export function LeaderboardPage() {
  const [mode, setMode] = useState<LeaderboardMode>("best_single");
  const [window, setWindow] = useState<LeaderboardWindow>("monthly");
  const board = usePullLeaderboard(mode, window);
  const { format } = useCurrency();

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">Leaderboard</h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Top pack pulls across public collectors — ranked by market value.
      </p>

      <div className="mb-5 flex flex-wrap gap-3">
        <Toggle options={MODES} value={mode} onChange={setMode} />
        <Toggle options={WINDOWS} value={window} onChange={setWindow} />
      </div>

      {board.isPending ? (
        <TableSkeleton rows={8} />
      ) : board.isError ? (
        <ErrorState message={(board.error as Error).message} onRetry={() => board.refetch()} />
      ) : board.data.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {window === "monthly"
            ? "No pulls yet this month — open a pack to claim the top spot."
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
                <Link to={`/u/${e.handle}`} className="font-medium text-brand-600 hover:underline">
                  @{e.handle}
                </Link>
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
