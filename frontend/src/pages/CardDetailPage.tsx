import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../lib/api";
import { useAddEntry, useCard, useCardHistory } from "../lib/queries";
import { money } from "../lib/format";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { PriceChart } from "../components/PriceChart";
import { ErrorState } from "../components/States";
import { DetailSkeleton } from "../components/Skeleton";
import { Meta } from "../components/Meta";
import { WishlistButton } from "../components/WishlistButton";
import { useToast } from "../components/Toast";
import type { CollectionEntryCreate } from "../types";

const CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"];
const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-800";

// Friendly names for the raw price-source keys shown in the per-source reference table.
const SOURCE_LABELS: Record<string, string> = {
  tcgplayer: "TCGplayer",
  cardmarket: "CardMarket",
};

export function CardDetailPage() {
  const { id = "" } = useParams();
  const card = useCard(id);
  const history = useCardHistory(id);
  const addEntry = useAddEntry();
  const toast = useToast();
  const { session } = useAuth();
  const { format } = useCurrency();

  const [form, setForm] = useState<CollectionEntryCreate>({
    card_id: id,
    quantity: 1,
    is_foil: false,
  });

  if (card.isPending) return <DetailSkeleton />;
  if (card.isError)
    return <ErrorState message={(card.error as Error).message} onRetry={() => card.refetch()} />;
  const c = card.data;

  async function add(e: FormEvent) {
    e.preventDefault();
    try {
      await addEntry.mutateAsync({ ...form, card_id: id });
      toast.success(`Added ${c.name} to your collection.`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not add card");
    }
  }

  const priceText = c.market_price ? ` — ${format(c.market_price)}` : "";

  return (
    <>
      <Meta
        title={`${c.name} · ${c.set_id} #${c.number}${priceText} | PokéVault`}
        description={`Live market price and price history for ${c.name} (${c.set_id} #${c.number})${
          c.rarity ? `, ${c.rarity}` : ""
        }. Track it free in your PokéVault collection.`}
        image={c.image_url}
      />
      <Link to="/catalog" className="text-sm text-brand-600 hover:underline">
        ← Back to catalog
      </Link>

      <div className="mt-4 grid gap-8 md:grid-cols-2">
        <div className="flex items-start justify-center">
          {c.image_url ? (
            <img
              src={c.image_url}
              alt={c.name}
              decoding="async"
              className="max-h-[520px] rounded-xl shadow-lg"
            />
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
            {format(c.market_price)}
          </p>

          {c.prices.length > 0 && (
            <table className="mt-4 w-full text-sm">
              <tbody>
                {c.prices.map((p) => (
                  <tr
                    key={`${p.source}-${p.variant}`}
                    className="border-t border-slate-100 dark:border-slate-800"
                  >
                    <td className="py-1 text-slate-500">
                      <span className="font-medium text-slate-600 dark:text-slate-300">
                        {SOURCE_LABELS[p.source] ?? p.source}
                      </span>{" "}
                      · {p.variant}
                    </td>
                    {/* Each marketplace's own quote, in its native currency (symbol + ISO code). */}
                    <td className="py-1 text-right">
                      {p.market != null ? (
                        <>
                          {money(p.market, p.currency)}{" "}
                          <span className="text-xs text-slate-400">{p.currency}</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!session ? (
            <div className="mt-6 rounded-xl border border-slate-200 p-4 text-sm dark:border-slate-800">
              <Link to="/login" className="font-medium text-brand-600 hover:underline">
                Log in
              </Link>{" "}
              to track this card, see price history, and build your collection — free.
            </div>
          ) : (
            <form
              onSubmit={add}
              className="mt-6 space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800"
            >
              <p className="font-semibold">Add to collection</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  <span className="mb-1 block">Quantity</span>
                  <input
                    type="number"
                    min={1}
                    value={form.quantity}
                    onChange={(e) =>
                      setForm({ ...form, quantity: Math.max(1, Number(e.target.value)) })
                    }
                    className={inputClass}
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block">Condition</span>
                  <select
                    value={form.condition ?? ""}
                    onChange={(e) => setForm({ ...form, condition: e.target.value || null })}
                    className={inputClass}
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
                    className={inputClass}
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
                      setForm({
                        ...form,
                        acquired_price: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className={inputClass}
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
              <button
                type="submit"
                disabled={addEntry.isPending}
                className="w-full rounded-lg bg-brand-600 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {addEntry.isPending ? "Adding…" : "Add to collection"}
              </button>
            </form>
          )}
          {session && <WishlistButton cardId={id} />}
        </div>
      </div>

      <h2 className="mb-2 mt-8 text-lg font-semibold">Price history</h2>
      {history.isPending ? (
        <div className="h-64 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
      ) : history.isError ? (
        <ErrorState message={(history.error as Error).message} onRetry={() => history.refetch()} />
      ) : (
        <PriceChart
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
