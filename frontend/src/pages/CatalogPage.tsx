import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import type { Card } from "../types";
import { CardTile } from "../components/CardTile";
import { EmptyState, ErrorState, Spinner } from "../components/States";

const PAGE = 24;

export function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const setId = params.get("set") ?? "";
  const [q, setQ] = useState(params.get("q") ?? "");
  const [debouncedQ, setDebouncedQ] = useState(q);

  const sets = useAsync(() => api.listSets({ limit: 500 }), []);

  // Debounce the search box so we don't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const [cards, setCards] = useState<Card[]>([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  // Reset + load first page whenever the filters change.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api
      .listCards({ set_id: setId || undefined, q: debouncedQ || undefined, limit: PAGE, offset: 0 })
      .then((rows) => {
        if (!alive) return;
        setCards(rows);
        setOffset(rows.length);
        setHasMore(rows.length === PAGE);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [setId, debouncedQ]);

  async function loadMore() {
    setLoading(true);
    try {
      const rows = await api.listCards({
        set_id: setId || undefined,
        q: debouncedQ || undefined,
        limit: PAGE,
        offset,
      });
      setCards((prev) => [...prev, ...rows]);
      setOffset((o) => o + rows.length);
      setHasMore(rows.length === PAGE);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  function updateSet(value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set("set", value);
    else next.delete("set");
    setParams(next, { replace: true });
  }

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Catalog</h1>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <input
          type="search"
          placeholder="Search cards by name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
        />
        <select
          value={setId}
          onChange={(e) => updateSet(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
        >
          <option value="">All sets</option>
          {(sets.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {error && <ErrorState message={error} onRetry={() => setDebouncedQ((v) => v)} />}
      {!error && cards.length === 0 && loading && <Spinner label="Loading cards…" />}
      {!error && cards.length === 0 && !loading && (
        <EmptyState title="No cards found" hint="Try a different name or set." />
      )}

      {cards.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {cards.map((c) => (
              <CardTile key={c.id} card={c} />
            ))}
          </div>
          {hasMore && (
            <div className="mt-6 text-center">
              <button
                onClick={loadMore}
                disabled={loading}
                className="rounded-lg border border-slate-300 px-5 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                {loading ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
