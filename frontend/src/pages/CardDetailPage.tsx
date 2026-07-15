import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../lib/api";
import { useAddEntry, useCard, useCardHistory, useRefreshCard } from "../lib/queries";
import { hasPrice, money } from "../lib/format";
import { LIMITS } from "../lib/limits";
import { NumberField } from "../components/NumberField";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { PriceChart } from "../components/PriceChart";
import { ErrorState } from "../components/States";
import { DetailSkeleton } from "../components/Skeleton";
import { Meta } from "../components/Meta";
import { WishlistButton } from "../components/WishlistButton";
import { GradingFields } from "../components/GradingFields";
import { useToast } from "../components/Toast";
import type { CollectionEntryCreate } from "../types";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-800";

// Friendly labels for the TCGplayer variant keys (used in the per-variant table + the picker).
const VARIANT_LABELS: Record<string, string> = {
  normal: "Normal",
  holofoil: "Holofoil",
  reverseHolofoil: "Reverse Holofoil",
  "1stEdition": "1st Edition",
  "1stEditionHolofoil": "1st Edition Holofoil",
  unlimited: "Unlimited",
  unlimitedHolofoil: "Unlimited Holofoil",
};
const variantLabel = (v: string): string => VARIANT_LABELS[v] ?? v;
// A copy of a "holo" printing is a foil copy (kept in sync with the legacy is_foil flag).
const isFoilVariant = (v: string): boolean => /holo/i.test(v);

export function CardDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const card = useCard(id);
  const history = useCardHistory(id);
  const addEntry = useAddEntry();
  const refresh = useRefreshCard(id);
  const toast = useToast();
  const { session } = useAuth();
  const { format } = useCurrency();

  const [form, setForm] = useState<CollectionEntryCreate>({ card_id: id, quantity: 1 });

  if (card.isPending) return <DetailSkeleton />;
  if (card.isError)
    return <ErrorState message={(card.error as Error).message} onRetry={() => card.refetch()} />;
  const c = card.data;

  // Printings the user can own — the card's actual TCGplayer variants (fallback: normal). The
  // picker defaults to the base printing (holofoil for holo rarities, else normal).
  const availableVariants = [
    ...new Set(c.prices.filter((p) => p.source === "tcgplayer").map((p) => p.variant)),
  ];
  if (availableVariants.length === 0) availableVariants.push("normal");
  const baseVariant =
    c.rarity && /holo/i.test(c.rarity) && availableVariants.includes("holofoil")
      ? "holofoil"
      : availableVariants[0];
  const selectedVariant = form.variant ?? baseVariant;

  async function add(e: FormEvent) {
    e.preventDefault();
    try {
      await addEntry.mutateAsync({
        card_id: id,
        quantity: form.quantity,
        condition: form.condition,
        grade: form.grade,
        variant: selectedVariant,
        is_foil: isFoilVariant(selectedVariant),
      });
      toast.success(`Added ${c.name} (${variantLabel(selectedVariant)}) to your collection.`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not add card");
    }
  }

  async function doRefresh() {
    try {
      await refresh.mutateAsync();
      toast.success("Prices refreshed.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not refresh prices.");
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
      {/* Real back navigation: return to wherever the user came from (preserving that route's
          filters/search/page/tab). location.key === "default" means this was the first in-app
          entry (direct load / shared link), so fall back to the catalog. */}
      <button
        type="button"
        onClick={() => (location.key === "default" ? navigate("/catalog") : navigate(-1))}
        className="text-sm text-brand-600 hover:underline"
      >
        ← Back
      </button>

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
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {hasPrice(c.market_price) ? (
              <p className="text-3xl font-bold text-brand-600 dark:text-brand-400">
                {format(c.market_price)}
              </p>
            ) : (
              <p className="text-base text-slate-500 dark:text-slate-400">
                No market price yet — our price sources haven&apos;t published one for this card.
              </p>
            )}
            {session && (
              <button
                type="button"
                onClick={doRefresh}
                disabled={refresh.isPending}
                title="Re-fetch the latest prices now"
                className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                {refresh.isPending ? "Refreshing…" : "↻ Refresh price"}
              </button>
            )}
          </div>

          {/* Per printing: TCGplayer market (USD) + Cardmarket trend (EUR), each in its native
              currency. A "verify edition" flag warns when the two markets disagree wildly (usually
              an upstream edition/printing mismatch — a data-quality hint, not an error). */}
          {c.variants.length > 0 && (
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-1 font-medium">Printing</th>
                  <th className="py-1 text-right font-medium">TCGplayer</th>
                  <th className="py-1 text-right font-medium">Cardmarket</th>
                </tr>
              </thead>
              <tbody>
                {c.variants.map((v) => (
                  <tr
                    key={v.variant}
                    className="border-t border-slate-100 dark:border-slate-800"
                  >
                    <td className="py-1.5 text-slate-600 dark:text-slate-300">
                      <span className="font-medium">{variantLabel(v.variant)}</span>
                      {v.diverges && (
                        <span
                          title="These two markets disagree a lot for this printing — verify the edition."
                          className="ml-2 cursor-help rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
                        >
                          ⚠ verify edition
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {v.tcgplayer_usd != null ? (
                        <>
                          {money(v.tcgplayer_usd, "USD")}{" "}
                          <span className="text-xs text-slate-400">USD</span>
                        </>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {v.cardmarket_eur != null ? (
                        <>
                          {money(v.cardmarket_eur, "EUR")}{" "}
                          <span className="text-xs text-slate-400">EUR</span>
                        </>
                      ) : (
                        <span className="text-slate-400">—</span>
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
                  <NumberField
                    kind="int"
                    value={form.quantity ?? LIMITS.cardQty.min}
                    onCommit={(v) => setForm({ ...form, quantity: v ?? LIMITS.cardQty.min })}
                    min={LIMITS.cardQty.min}
                    max={LIMITS.cardQty.max}
                    className={inputClass}
                  />
                </label>
                <GradingFields
                  condition={form.condition ?? ""}
                  grade={form.grade ?? ""}
                  onChange={({ condition, grade }) =>
                    setForm({ ...form, condition: condition || null, grade: grade || null })
                  }
                />
              </div>
              <div className="block text-sm">
                <span className="mb-1 block">Edition / variant</span>
                {/* Tick-box picker: one checkable box per printing, but single-select (radio
                    behavior) — ticking one unticks the rest. Still bound to form.variant so the
                    card is valued at the chosen printing. */}
                <div role="radiogroup" aria-label="Edition / variant" className="flex flex-wrap gap-2">
                  {availableVariants.map((v) => {
                    const checked = v === selectedVariant;
                    return (
                      <button
                        key={v}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        onClick={() => setForm({ ...form, variant: v })}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition ${
                          checked
                            ? "border-brand-500 bg-brand-50 font-medium text-brand-700 dark:border-brand-500 dark:bg-brand-500/10 dark:text-brand-300"
                            : "border-slate-300 text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600"
                        }`}
                      >
                        {checked && (
                          <svg
                            width="13"
                            height="13"
                            viewBox="0 0 24 24"
                            fill="none"
                            aria-hidden="true"
                          >
                            <path
                              d="M20 6 9 17l-5-5"
                              stroke="currentColor"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                        {variantLabel(v)}
                      </button>
                    );
                  })}
                </div>
                <span className="mt-2 block text-xs text-slate-400">
                  Priced at this printing&apos;s market value.
                </span>
              </div>
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
