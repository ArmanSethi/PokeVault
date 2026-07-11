import { Link } from "react-router-dom";
import { useLeaderboard } from "../lib/queries";
import { useCurrency } from "../context/CurrencyContext";
import { EmptyState, ErrorState } from "../components/States";
import { TableSkeleton } from "../components/Skeleton";

/** Public leaderboard: top public collectors by portfolio value. Read-only; works logged-out.
 * Values shown only for users who opted in — others display "Hidden" but keep their true rank. */
export function LeaderboardPage() {
  const board = useLeaderboard();
  const { format } = useCurrency();

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">Leaderboard</h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Top public collectors by portfolio value. Make your profile public and opt in from Settings
        to appear here.
      </p>

      {board.isPending ? (
        <TableSkeleton rows={10} />
      ) : board.isError ? (
        <ErrorState message={(board.error as Error).message} onRetry={() => board.refetch()} />
      ) : board.data.length === 0 ? (
        <EmptyState
          title="No public collectors yet"
          hint="Be the first — make your profile public in Settings."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left dark:bg-slate-800">
              <tr>
                <th className="px-4 py-2 w-16">Rank</th>
                <th className="px-4 py-2">Collector</th>
                <th className="px-4 py-2 text-right">Cards</th>
                <th className="px-4 py-2 text-right">Portfolio value</th>
              </tr>
            </thead>
            <tbody>
              {board.data.map((e) => (
                <tr key={e.handle} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-2 font-semibold tabular-nums">#{e.rank}</td>
                  <td className="px-4 py-2">
                    <Link
                      to={`/u/${encodeURIComponent(e.handle)}`}
                      className="font-medium text-brand-600 hover:underline"
                    >
                      @{e.handle}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{e.card_count}</td>
                  <td className="px-4 py-2 text-right font-medium tabular-nums">
                    {e.value_hidden ? (
                      <span className="text-slate-400 dark:text-slate-500">Hidden</span>
                    ) : (
                      format(e.value_usd)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
