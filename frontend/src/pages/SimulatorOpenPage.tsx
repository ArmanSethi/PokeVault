import { useEffect, useMemo, useState } from "react";
import { CardBack } from "../components/simulator/CardBack";
import { PackReveal } from "../components/simulator/PackReveal";
import { ErrorState } from "../components/States";
import { useToast } from "../components/Toast";
import { useCurrency } from "../context/CurrencyContext";
import { ApiError } from "../lib/api";
import { hasPrice } from "../lib/format";
import { rarityColor } from "../lib/rarityColor";
import { useKeepFromOpen, useOpenPack, useQuota, useSets } from "../lib/queries";
import type { PackResult } from "../types";

type Phase = "idle" | "revealing" | "summary";

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
  const [discarded, setDiscarded] = useState<Set<number>>(new Set());

  // Default the set picker to Base Set (or the first set) once the list loads.
  useEffect(() => {
    if (!setId && sets.data?.length) {
      setSetId(sets.data.some((s) => s.id === "base1") ? "base1" : sets.data[0].id);
    }
  }, [sets.data, setId]);

  const remaining = quota.data?.packs_remaining_today ?? null;

  function open() {
    if (!setId) return;
    openPack.mutate(setId, {
      onSuccess: (data) => {
        setPack(data);
        setDiscarded(new Set());
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

  // Summary is best-first; we keep the original index so keep/discard maps to the right card
  // (duplicates within a pack are distinct positions).
  const summary = useMemo(
    () =>
      pack
        ? pack.cards
            .map((pc, i) => ({ pc, i }))
            .sort((a, b) => num(b.pc.price_at_open) - num(a.pc.price_at_open))
        : [],
    [pack],
  );
  const keptCount = pack ? pack.cards.length - discarded.size : 0;

  function toggle(i: number) {
    setDiscarded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function reset() {
    setPack(null);
    setPhase("idle");
    setDiscarded(new Set());
  }

  async function confirm() {
    if (!pack) return;
    const keptIds = pack.cards
      .map((pc, i) => (discarded.has(i) ? null : pc.card.id))
      .filter((id): id is string => id !== null);
    if (keptIds.length === 0) {
      toast.info(`Discarded all ${pack.cards.length} cards.`);
      reset();
      return;
    }
    try {
      await keep.mutateAsync({ openId: pack.open_id, keptCardIds: keptIds });
      toast.success(`Added ${keptIds.length} to your Vault.`);
      reset();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save your pulls.");
    }
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
            Packs left today: <span className="font-semibold text-amber-300">{remaining}</span> / 2
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
        <PackReveal cards={pack.cards} onComplete={() => setPhase("summary")} />
      )}

      {phase === "summary" && pack && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-white">
              Keep what you want — {keptCount} of {pack.cards.length} selected
            </h2>
            <div className="flex gap-2">
              <button
                onClick={() => setDiscarded(new Set())}
                className="rounded-lg border border-white/20 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-white/10"
              >
                Keep all
              </button>
              <button
                onClick={confirm}
                disabled={keep.isPending}
                className="rounded-lg bg-amber-400 px-4 py-1.5 text-sm font-semibold text-slate-900 hover:bg-amber-300 disabled:opacity-50"
              >
                {keep.isPending
                  ? "Saving…"
                  : keptCount > 0
                    ? `Add ${keptCount} to Vault`
                    : "Discard all"}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {summary.map(({ pc, i }) => {
              const kept = !discarded.has(i);
              return (
                <div
                  key={i}
                  className={`flex flex-col overflow-hidden rounded-xl border bg-white/5 transition-opacity ${
                    kept ? "border-amber-400/60" : "border-white/10 opacity-40"
                  }`}
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
                  <div className="flex flex-1 flex-col gap-1 p-2">
                    <p className="truncate text-sm font-medium text-slate-100" title={pc.card.name}>
                      {pc.card.name}
                    </p>
                    <p className="text-xs text-slate-400">
                      {hasPrice(pc.price_at_open) ? format(pc.price_at_open) : "No price yet"}
                    </p>
                    <button
                      onClick={() => toggle(i)}
                      className={`mt-1 rounded border px-2 py-1 text-xs font-medium ${
                        kept
                          ? "border-amber-400/60 text-amber-300 hover:bg-amber-400/10"
                          : "border-white/20 text-slate-400 hover:bg-white/10"
                      }`}
                    >
                      {kept ? "✓ Keep" : "Discard"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
