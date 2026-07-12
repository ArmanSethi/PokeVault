import { useEffect, useState } from "react";
import { useAddEntry, useOpenPack, useSets } from "../lib/queries";
import { useCurrency } from "../context/CurrencyContext";
import { hasPrice } from "../lib/format";
import { ErrorState } from "../components/States";
import { useToast } from "../components/Toast";
import type { PackResult, PulledCard } from "../types";

type Decision = "kept" | "discarded";

const TIER_STYLE: Record<string, string> = {
  common: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
  uncommon: "bg-emerald-200 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300",
  hit: "bg-gradient-to-r from-amber-300 to-yellow-500 text-amber-950",
};

export function SimulatorPage() {
  const sets = useSets();
  const openPack = useOpenPack();
  const addEntry = useAddEntry();
  const toast = useToast();
  const { format } = useCurrency();

  const [setId, setSetId] = useState("");
  const [pack, setPack] = useState<PackResult | null>(null);
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});

  // Default the set picker to Base Set (or the first set) once the list loads.
  useEffect(() => {
    if (!setId && sets.data?.length) {
      setSetId(sets.data.some((s) => s.id === "base1") ? "base1" : sets.data[0].id);
    }
  }, [sets.data, setId]);

  function open() {
    if (!setId) return;
    openPack.mutate(setId, {
      onSuccess: (data) => {
        setPack(data);
        setDecisions({});
      },
      onError: () => toast.error("Could not open a pack for that set."),
    });
  }

  function keep(index: number, card: PulledCard) {
    addEntry.mutate(
      { card_id: card.card.id, quantity: 1, is_foil: card.slot_kind === "hit" },
      {
        onSuccess: () => {
          setDecisions((d) => ({ ...d, [index]: "kept" }));
          toast.success(`Kept ${card.card.name}.`);
        },
        onError: () => toast.error("Could not add to collection."),
      },
    );
  }

  function discard(index: number) {
    setDecisions((d) => ({ ...d, [index]: "discarded" }));
  }

  // Bulk: add every not-yet-kept pulled card to the collection (reuses per-card keep).
  function keepAll() {
    if (!pack) return;
    pack.cards.forEach((pc, i) => {
      if (decisions[i] !== "kept") keep(i, pc);
    });
  }

  // Bulk: cards marked Keep are already in the collection; everything else in THIS pack is
  // dropped by clearing local state. No API call, no DELETE — the un-kept pulls were never
  // added, and the existing collection is never touched.
  function discardRest(keptCount: number, discardCount: number) {
    setPack(null);
    setDecisions({});
    toast.success(`Kept ${keptCount}, discarded ${discardCount}.`);
  }

  if (sets.isError)
    return <ErrorState message={(sets.error as Error).message} onRetry={() => sets.refetch()} />;

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">Pack Simulator</h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Open a rarity-weighted booster from any set, then keep the cards you want.
      </p>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-slate-500 dark:text-slate-400">Set</span>
          <select
            value={setId}
            onChange={(e) => setSetId(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          >
            {(sets.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={open}
          disabled={!setId || openPack.isPending}
          className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {openPack.isPending ? "Opening…" : pack ? "Open another pack" : "Open pack"}
        </button>
      </div>

      {pack &&
        (() => {
          const keptCount = pack.cards.filter((_, i) => decisions[i] === "kept").length;
          const discardCount = pack.cards.length - keptCount;
          return (
            <>
              <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                <span className="font-semibold">Approximate odds.</span> {pack.disclaimer} Template:{" "}
                {pack.template}.
              </div>

              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">
                  {pack.set_name} — you pulled {pack.cards.length} cards
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={keepAll}
                    disabled={keptCount === pack.cards.length}
                    className="rounded-lg border border-brand-300 px-3 py-1.5 text-sm font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-50 dark:border-brand-700 dark:text-brand-300 dark:hover:bg-brand-900/30"
                  >
                    Keep all
                  </button>
                  <button
                    onClick={() => discardRest(keptCount, discardCount)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    Keep marked, discard rest ({discardCount})
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {pack.cards.map((pc, i) => {
                  const decision = decisions[i];
                  return (
                    <div
                      key={i}
                      className={`flex flex-col overflow-hidden rounded-xl border bg-white dark:bg-slate-900 ${
                        decision === "kept"
                          ? "border-emerald-400 dark:border-emerald-600"
                          : decision === "discarded"
                            ? "border-slate-200 opacity-40 dark:border-slate-800"
                            : "border-slate-200 dark:border-slate-800"
                      }`}
                    >
                      <div className="relative flex aspect-[3/4] items-center justify-center bg-slate-100 dark:bg-slate-800">
                        {pc.card.image_url ? (
                          <img
                            src={pc.card.image_url}
                            alt={pc.card.name}
                            loading="lazy"
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <span className="text-4xl opacity-30">🃏</span>
                        )}
                        <span
                          className={`absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            TIER_STYLE[pc.slot_kind]
                          }`}
                          title={`${pc.slot_kind} slot`}
                        >
                          {pc.tier}
                        </span>
                      </div>
                      <div className="flex flex-1 flex-col gap-1 p-2">
                        <p className="truncate text-sm font-medium" title={pc.card.name}>
                          {pc.card.name}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {hasPrice(pc.card.market_price)
                            ? format(pc.card.market_price)
                            : "No price yet"}
                        </p>
                        {decision ? (
                          <p
                            className={`mt-1 text-xs font-medium ${
                              decision === "kept"
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-slate-400"
                            }`}
                          >
                            {decision === "kept" ? "✓ Kept" : "Discarded"}
                          </p>
                        ) : (
                          <div className="mt-1 flex gap-2">
                            <button
                              onClick={() => keep(i, pc)}
                              className="flex-1 rounded border border-brand-300 px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 dark:border-brand-700 dark:text-brand-300 dark:hover:bg-brand-900/30"
                            >
                              Keep
                            </button>
                            <button
                              onClick={() => discard(i)}
                              className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                            >
                              Discard
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          );
        })()}
    </>
  );
}
