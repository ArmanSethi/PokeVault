import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import { money, pct } from "../lib/format";
import { PriceChart } from "../components/PriceChart";
import { EmptyState, ErrorState, Spinner } from "../components/States";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

export function DashboardPage() {
  const summary = useAsync(() => api.summary(), []);
  const history = useAsync(() => api.portfolioHistory(), []);

  if (summary.loading) return <Spinner label="Loading your portfolio…" />;
  if (summary.error) return <ErrorState message={summary.error} onRetry={summary.reload} />;
  const s = summary.data!;

  if (s.total_distinct_cards === 0) {
    return (
      <>
        <h1 className="mb-4 text-2xl font-bold">Dashboard</h1>
        <EmptyState
          title="Your collection is empty"
          hint="Browse the catalog or scan a card to start tracking your Pokémon collection."
        />
        <div className="mt-4 flex gap-3">
          <Link to="/catalog" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Browse catalog
          </Link>
          <Link to="/scan" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium dark:border-slate-700">
            Scan a card
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Portfolio value" value={money(s.total_market_value, s.currency)} />
        <Stat label="Total cost" value={money(s.total_cost, s.currency)} />
        <Stat label="Distinct cards" value={String(s.total_distinct_cards)} />
        <Stat label="Total cards" value={String(s.total_quantity)} />
      </div>

      <h2 className="mb-2 mt-8 text-lg font-semibold">Portfolio value over time</h2>
      {history.loading ? (
        <Spinner label="Loading history…" />
      ) : history.error ? (
        <ErrorState message={history.error} onRetry={history.reload} />
      ) : (
        <PriceChart
          currency={s.currency}
          label="Portfolio"
          data={(history.data?.points ?? []).map((p) => ({ date: p.date, value: Number(p.total_value) }))}
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
            {s.sets.map((h) => (
              <tr key={h.set_id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-4 py-2">
                  <Link to={`/catalog?set=${h.set_id}`} className="font-medium text-brand-600 hover:underline">
                    {h.set_name}
                  </Link>
                </td>
                <td className="px-4 py-2">
                  {h.distinct_cards_owned}
                  {h.set_size ? ` / ${h.set_size}` : ""}
                </td>
                <td className="px-4 py-2">{h.set_size ? pct(h.completion_pct) : "—"}</td>
                <td className="px-4 py-2 text-right">{money(h.market_value, s.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
