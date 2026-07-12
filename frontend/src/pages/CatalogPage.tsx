import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useInfiniteCards, useRarities, useSets } from "../lib/queries";
import type { CardSort } from "../types";
import { CardTile } from "../components/CardTile";
import { EmptyState, ErrorState } from "../components/States";
import { CardGridSkeleton } from "../components/Skeleton";

const SORTS: { value: CardSort; label: string }[] = [
  { value: "number", label: "Set / number" },
  { value: "name", label: "Name (A–Z)" },
  { value: "rarity", label: "Rarity" },
  { value: "price_desc", label: "Price (high → low)" },
  { value: "price_asc", label: "Price (low → high)" },
];

const selectClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800";

export function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const setId = params.get("set") ?? "";
  const [q, setQ] = useState(params.get("q") ?? "");
  const [debouncedQ, setDebouncedQ] = useState(q);
  const [rarity, setRarity] = useState("");
  const [sort, setSort] = useState<CardSort>("number");

  const sets = useSets();
  const rarities = useRarities();

  // Default landing (bare /catalog) opens on Base Set (base1), sorted by number. Only when
  // the user arrived with no set and no search — set-specific links (?set=…) and search
  // deep-links (?q=…) are left untouched, and picking "All sets" afterwards sticks.
  useEffect(() => {
    if (!params.get("set") && !params.get("q")) {
      const next = new URLSearchParams(params);
      next.set("set", "base1");
      setParams(next, { replace: true });
    }
    // Run once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const filters = useMemo(
    () => ({
      set_id: setId || undefined,
      q: debouncedQ || undefined,
      rarity: rarity || undefined,
      sort,
    }),
    [setId, debouncedQ, rarity, sort],
  );

  const cardsQ = useInfiniteCards(filters);
  const cards = cardsQ.data?.pages.flat() ?? [];

  function updateSet(value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set("set", value);
    else next.delete("set");
    setParams(next, { replace: true });
  }

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Catalog</h1>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input
          type="search"
          placeholder="Search name or number…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search cards"
          className={selectClass}
        />
        <select
          value={setId}
          onChange={(e) => updateSet(e.target.value)}
          aria-label="Filter by set"
          className={selectClass}
        >
          <option value="">All sets</option>
          {(sets.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          value={rarity}
          onChange={(e) => setRarity(e.target.value)}
          aria-label="Filter by rarity"
          className={selectClass}
        >
          <option value="">All rarities</option>
          {(rarities.data ?? []).map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as CardSort)}
          aria-label="Sort cards"
          className={selectClass}
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {cardsQ.isPending ? (
        <CardGridSkeleton />
      ) : cardsQ.isError ? (
        <ErrorState message={(cardsQ.error as Error).message} onRetry={() => cardsQ.refetch()} />
      ) : cards.length === 0 ? (
        <EmptyState title="No cards found" hint="Try a different name, set, or rarity." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {cards.map((c) => (
              <CardTile key={c.id} card={c} />
            ))}
          </div>
          {cardsQ.hasNextPage && (
            <div className="mt-6 text-center">
              <button
                onClick={() => cardsQ.fetchNextPage()}
                disabled={cardsQ.isFetchingNextPage}
                className="rounded-lg border border-slate-300 px-5 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                {cardsQ.isFetchingNextPage ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
