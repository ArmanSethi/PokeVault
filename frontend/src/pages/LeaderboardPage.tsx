import { useState } from "react";
import { Link } from "react-router-dom";
import { TableSkeleton } from "../components/Skeleton";
import { ErrorState } from "../components/States";
import { useToast } from "../components/Toast";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { ApiError } from "../lib/api";
import { useMe, usePullLeaderboard, useUpdateProfile } from "../lib/queries";
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

/** Signed-in viewers who aren't opted in get a one-click prompt (opt-in is separate from the
 * public showcase). Mounted only when a session exists, so /me is never called for anon viewers. */
function OptInBanner() {
  const me = useMe();
  const update = useUpdateProfile();
  const toast = useToast();

  if (!me.data || me.data.leaderboard_opt_in) return null;

  async function enable() {
    try {
      await update.mutateAsync({ leaderboard_opt_in: true });
      toast.success("You're on the leaderboard! (You'll show once you've kept a pull.)");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not update your settings.");
    }
  }

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
      <span>You're not on the leaderboard. Opt in to show your best pulls.</span>
      <div className="flex items-center gap-3">
        <button
          onClick={enable}
          disabled={update.isPending}
          className="rounded-lg bg-amber-400 px-3 py-1.5 font-semibold text-slate-900 hover:bg-amber-300 disabled:opacity-50"
        >
          {update.isPending ? "Saving…" : "Show my pulls"}
        </button>
        <Link to="/settings" className="font-medium underline">
          Settings
        </Link>
      </div>
    </div>
  );
}

/** Public best-pulls leaderboard. Ranking is by real market price (frozen or live). */
export function LeaderboardPage() {
  const { session } = useAuth();
  const [mode, setMode] = useState<LeaderboardMode>("best_single");
  const [window, setWindow] = useState<LeaderboardWindow>("monthly");
  const board = usePullLeaderboard(mode, window);
  const { format } = useCurrency();

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">Leaderboard</h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Top pack pulls from collectors on the board — ranked by market value.
      </p>

      {session && <OptInBanner />}

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
