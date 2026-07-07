import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import { money } from "../lib/format";
import { PriceChart } from "../components/PriceChart";
import { ErrorState, Spinner } from "../components/States";
import type { CollectionEntryCreate } from "../types";

const CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"];

export function CardDetailPage() {
  const { id = "" } = useParams();
  const card = useAsync(() => api.getCard(id), [id]);
  const history = useAsync(() => api.cardHistory(id), [id]);

  const [form, setForm] = useState<CollectionEntryCreate>({ card_id: id, quantity: 1, is_foil: false });
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  if (card.loading) return <Spinner label="Loading card…" />;
  if (card.error) return <ErrorState message={card.error} onRetry={card.reload} />;
  const c = card.data!;

  async function add(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      await api.addEntry({ ...form, card_id: id });
      setFeedback({ ok: true, msg: "Added to your collection." });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Could not add card";
      setFeedback({ ok: false, msg });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Link to="/catalog" className="text-sm text-brand-600 hover:underline">
        ← Back to catalog
      </Link>

      <div className="mt-4 grid gap-8 md:grid-cols-2">
        <div className="flex items-start justify-center">
          {c.image_url ? (
            <img src={c.image_url} alt={c.name} className="max-h-[520px] rounded-xl shadow-lg" />
          ) : (
            <div className="flex aspect-[3/4] w-full items-center justify-center rounded-xl bg-slate-100 text-6xl opacity-30 dark:bg-slate-800">
              🃏
            </div>
          )}
        </div>

        <div>
          <h1 className="text-2xl font-bold">{c.name}</h1>
          <p className="mt-1 text-slate-500 dark:text-slate-400">
            {c.set_id} · #{c.number}
            {c.rarity ? ` · ${c.rarity}` : ""}
          </p>
          <p className="mt-3 text-3xl font-bold text-brand-600 dark:text-brand-400">
            {money(c.market_price, c.currency ?? "USD")}
          </p>

          {c.prices.length > 0 && (
            <table className="mt-4 w-full text-sm">
              <tbody>
                {c.prices.map((p) => (
                  <tr key={`${p.source}-${p.variant}`} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-1 text-slate-500">{p.source} · {p.variant}</td>
                    <td className="py-1 text-right">{money(p.market, p.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <form onSubmit={add} className="mt-6 space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <p className="font-semibold">Add to collection</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="mb-1 block">Quantity</span>
                <input
                  type="number"
                  min={1}
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: Math.max(1, Number(e.target.value)) })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block">Condition</span>
                <select
                  value={form.condition ?? ""}
                  onChange={(e) => setForm({ ...form, condition: e.target.value || null })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="">—</option>
                  {CONDITIONS.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block">Grade (optional)</span>
                <input
                  placeholder="e.g. PSA 10"
                  value={form.grade ?? ""}
                  onChange={(e) => setForm({ ...form, grade: e.target.value || null })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block">Acquired price (optional)</span>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={form.acquired_price ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, acquired_price: e.target.value ? Number(e.target.value) : null })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_foil ?? false}
                onChange={(e) => setForm({ ...form, is_foil: e.target.checked })}
              />
              Foil / holo copy
            </label>
            {feedback && (
              <p className={`text-sm ${feedback.ok ? "text-green-600" : "text-red-600"}`}>{feedback.msg}</p>
            )}
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-brand-600 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? "Adding…" : "Add to collection"}
            </button>
          </form>
        </div>
      </div>

      <h2 className="mb-2 mt-8 text-lg font-semibold">Price history</h2>
      {history.loading ? (
        <Spinner label="Loading history…" />
      ) : history.error ? (
        <ErrorState message={history.error} onRetry={history.reload} />
      ) : (
        <PriceChart
          currency={history.data?.currency ?? "USD"}
          label="Market"
          data={(history.data?.points ?? []).map((p) => ({
            date: p.date,
            value: p.market_price === null ? null : Number(p.market_price),
          }))}
        />
      )}
    </>
  );
}
