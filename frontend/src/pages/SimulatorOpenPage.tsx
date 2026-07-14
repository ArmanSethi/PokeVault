import { useCallback, useEffect, useRef, useState } from "react";
import { CardBack } from "../components/simulator/CardBack";
import { PackReveal } from "../components/simulator/PackReveal";
import { ErrorState } from "../components/States";
import { useToast } from "../components/Toast";
import { useCurrency } from "../context/CurrencyContext";
import { ApiError } from "../lib/api";
import { hasPrice } from "../lib/format";
import { rarityColor } from "../lib/rarityColor";
import { useKeepFromOpen, useOpenPack, useQuota, useSets } from "../lib/queries";
import type { PackResult, PulledCard } from "../types";

type Phase = "idle" | "revealing" | "recap";

const num = (v: string | null): number => Number(v ?? 0);

export function SimulatorOpenPage() {
  const sets = useSets();
  const openPack = useOpenPack();
  const keep = useKeepFromOpen();
  const quota = useQuota();
  const toast = useToast();
  const { format } = useCurrency();

  const [setId, setSetId] = useState("");
  const [pack, setPack] = useState<PackResult | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [keptCards, setKeptCards] = useState<PulledCard[]>([]);
  const committedRef = useRef(false);

  // Default the set picker to Base Set (or the first set) once the list loads.
  useEffect(() => {
    if (!setId && sets.data?.length) {
      setSetId(sets.data.some((s) => s.id === "base1") ? "base1" : sets.data[0].id);
    }
  }, [sets.data, setId]);

  const remaining = quota.data?.packs_remaining_today ?? null;
  const dailyLimit = quota.data?.daily_limit ?? 2;

  function open() {
    if (!setId) return;
    openPack.mutate(setId, {
      onSuccess: (data) => {
        setPack(data);
        setKeptCards([]);
        committedRef.current = false;
        setPhase("revealing");
      },
      onError: (e) =>
        toast.error(
          e instanceof ApiError && e.status === 429
            ? e.message
            : "Could not open a pack for that set.",
        ),
    });
  }

  // The swipe flow decides every card, then hands back the cards swiped right. Show the recap;
  // the single (once-per-open) /keep write is fired by the effect below.
  const handleDecided = useCallback((kept: PulledCard[]) => {
    setKeptCards(kept);
    setPhase("recap");
  }, []);

  // Commit the kept set to the Vault exactly once. Discard-all makes no API call.
  useEffect(() => {
    if (phase !== "recap" || !pack || committedRef.current) return;
    committedRef.current = true;
    if (keptCards.length === 0) {
      toast.info(`Discarded all ${pack.cards.length} cards.`);
      return;
    }
    keep.mutate(
      { openId: pack.open_id, keptCardIds: keptCards.map((pc) => pc.card.id) },
      {
        onSuccess: () => toast.success(`Added ${keptCards.length} to your Vault.`),
        onError: (e) =>
          toast.error(e instanceof ApiError ? e.message : "Could not save your pulls."),
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const keptValue = keptCards.reduce(
    (s, pc) => (hasPrice(pc.price_at_open) ? s + num(pc.price_at_open) : s),
    0,
  );

  function reset() {
    setPack(null);
    setPhase("idle");
    setKeptCards([]);
    committedRef.current = false;
  }

  if (sets.isError)
    return <ErrorState message={(sets.error as Error).message} onRetry={() => sets.refetch()} />;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Open a pack</h1>
          <p className="text-sm text-slate-400">
            Pick any set and open a rarity-weighted booster. Odds are approximate.
          </p>
        </div>
        {remaining !== null && (
          <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-sm text-slate-200">
            Packs left today: <span className="font-semibold text-amber-300">{remaining}</span> /{" "}
            {dailyLimit}
          </span>
        )}
      </div>

      {phase === "idle" && (
        <div className="flex flex-col items-center gap-6 py-6">
          <CardBack className="w-40 drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)]" />
          <div className="flex flex-wrap items-end justify-center gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-slate-400">Set</span>
              <select
                value={setId}
                onChange={(e) => setSetId(e.target.value)}
                className="rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm text-slate-100"
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
              disabled={!setId || openPack.isPending || remaining === 0}
              className="rounded-lg bg-amber-400 px-6 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-300 disabled:opacity-50"
            >
              {openPack.isPending ? "Opening…" : "Open pack"}
            </button>
          </div>
          {remaining === 0 && (
            <p className="text-sm text-slate-400">
              You've opened your free packs for today. They reset at UTC midnight.
            </p>
          )}
        </div>
      )}

      {phase === "revealing" && pack && (
        <PackReveal cards={pack.cards} onDecided={handleDecided} />
      )}

      {phase === "recap" && pack && (
        <div className="flex flex-col items-center gap-5 py-4">
          <div className="text-center">
            <h2 className="text-lg font-semibold text-white">
              {keptCards.length > 0
                ? `Added ${keptCards.length} to your Vault`
                : "Discarded the whole pack"}
            </h2>
            {keptCards.length > 0 && (
              <p className="text-sm text-slate-400">Kept value {format(keptValue)}</p>
            )}
          </div>

          {keptCards.length > 0 && (
            <div className="grid w-full grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
              {keptCards.map((pc, i) => (
                <div
                  key={i}
                  className="flex flex-col overflow-hidden rounded-xl border border-amber-400/40 bg-white/5"
                >
                  <div className="relative flex aspect-[3/4] items-center justify-center bg-slate-900">
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
                      className="absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
                      style={{ background: rarityColor(pc.tier) }}
                    >
                      {pc.tier}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col gap-0.5 p-2">
                    <p className="truncate text-xs font-medium text-slate-100" title={pc.card.name}>
                      {pc.card.name}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {hasPrice(pc.price_at_open) ? format(pc.price_at_open) : "No price yet"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={reset}
            disabled={remaining === 0}
            className="rounded-lg bg-amber-400 px-6 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-300 disabled:opacity-50"
          >
            {remaining === 0 ? "No packs left today" : "Open another"}
          </button>
        </div>
      )}
    </>
  );
}
