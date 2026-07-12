import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  useAddDeckCard,
  useCards,
  useCreateDeck,
  useDecks,
  useDeleteDeck,
  useRemoveDeckCard,
  useSets,
  useUpdateDeck,
  useUpdateDeckCard,
} from "../lib/queries";
import { useCurrency } from "../context/CurrencyContext";
import { EmptyState, ErrorState } from "../components/States";
import { TableSkeleton } from "../components/Skeleton";
import { useToast } from "../components/Toast";
import type { Deck } from "../types";

const inputClass =
  "rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800";

export function DeckPage() {
  const decks = useDecks();
  const create = useCreateDeck();
  const toast = useToast();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [newSize, setNewSize] = useState(60);

  // Keep a valid selection as decks load / change.
  useEffect(() => {
    if (!decks.data) return;
    if (decks.data.length === 0) setSelectedId(null);
    else if (!decks.data.some((d) => d.id === selectedId)) setSelectedId(decks.data[0].id);
  }, [decks.data, selectedId]);

  const selected = decks.data?.find((d) => d.id === selectedId) ?? null;

  async function submitCreate(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    try {
      const deck = await create.mutateAsync({ name, target_size: Math.max(1, newSize) });
      setSelectedId(deck.id);
      setNewName("");
      setNewSize(60);
      toast.success(`Created deck "${deck.name}".`);
    } catch {
      toast.error("Could not create deck.");
    }
  }

  if (decks.isPending) return <TableSkeleton rows={6} />;
  if (decks.isError)
    return <ErrorState message={(decks.error as Error).message} onRetry={() => decks.refetch()} />;

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Deck</h1>

      <form onSubmit={submitCreate} className="mb-6 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-slate-500 dark:text-slate-400">New deck name</span>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Rainbow Charizards"
            className={`${inputClass} w-56`}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-500 dark:text-slate-400">Target size</span>
          <input
            type="number"
            min={1}
            value={newSize}
            onChange={(e) => setNewSize(Math.max(1, Number(e.target.value)))}
            className={`${inputClass} w-28`}
          />
        </label>
        <button
          type="submit"
          disabled={create.isPending || !newName.trim()}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {create.isPending ? "Creating…" : "New deck"}
        </button>
      </form>

      {decks.data.length === 0 ? (
        <EmptyState
          title="No decks yet"
          hint="Create a deck above, then add any cards from the catalog — no game rules, build your dream deck."
        />
      ) : (
        <div className="grid gap-6 md:grid-cols-[16rem_1fr]">
          {/* Deck list */}
          <div className="flex flex-col gap-2">
            {decks.data.map((d) => (
              <DeckListItem
                key={d.id}
                deck={d}
                active={d.id === selectedId}
                onSelect={() => setSelectedId(d.id)}
              />
            ))}
          </div>

          {/* Selected deck */}
          {selected && <DeckDetail deck={selected} />}
        </div>
      )}
    </>
  );
}

function DeckListItem({
  deck,
  active,
  onSelect,
}: {
  deck: Deck;
  active: boolean;
  onSelect: () => void;
}) {
  const { format } = useCurrency();
  return (
    <button
      onClick={onSelect}
      className={`rounded-xl border p-3 text-left transition-colors ${
        active
          ? "border-brand-300 bg-brand-50 dark:border-brand-700 dark:bg-brand-900/30"
          : "border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
      }`}
    >
      <p className="truncate font-medium">{deck.name}</p>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
        {deck.card_count} / {deck.target_size} · {format(deck.total_value)}
      </p>
    </button>
  );
}

function DeckDetail({ deck }: { deck: Deck }) {
  const { format } = useCurrency();
  const update = useUpdateDeck();
  const del = useDeleteDeck();
  const updateCard = useUpdateDeckCard();
  const removeCard = useRemoveDeckCard();
  const toast = useToast();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(deck.name);
  const [size, setSize] = useState(deck.target_size);

  // Reset the edit form when switching decks.
  useEffect(() => {
    setName(deck.name);
    setSize(deck.target_size);
    setEditing(false);
  }, [deck.id, deck.name, deck.target_size]);

  const pctFull = Math.min(100, Math.round((deck.card_count / deck.target_size) * 100));

  async function saveEdit() {
    try {
      await update.mutateAsync({ id: deck.id, data: { name: name.trim() || deck.name, target_size: Math.max(1, size) } });
      setEditing(false);
      toast.success("Deck updated.");
    } catch {
      toast.error("Could not update deck.");
    }
  }

  function removeDeck() {
    if (!confirm(`Delete deck "${deck.name}"? This can't be undone.`)) return;
    del.mutate(deck.id, {
      onSuccess: () => toast.success("Deck deleted."),
      onError: () => toast.error("Could not delete deck."),
    });
  }

  function setQty(cardId: string, quantity: number) {
    if (quantity < 1) {
      removeCard.mutate({ deckId: deck.id, cardId });
      return;
    }
    updateCard.mutate({ deckId: deck.id, cardId, quantity });
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
        {editing ? (
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-slate-500 dark:text-slate-400">Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputClass} w-56`} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-500 dark:text-slate-400">Target size</span>
              <input
                type="number"
                min={1}
                value={size}
                onChange={(e) => setSize(Math.max(1, Number(e.target.value)))}
                className={`${inputClass} w-28`}
              />
            </label>
            <button
              onClick={saveEdit}
              disabled={update.isPending}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">{deck.name}</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  {deck.card_count} / {deck.target_size}
                </span>{" "}
                cards · total value{" "}
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  {format(deck.total_value)}
                </span>
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setEditing(true)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Edit
              </button>
              <button
                onClick={removeDeck}
                className="rounded-lg border border-danger-200 px-3 py-1.5 text-sm font-medium text-danger-600 hover:bg-danger-100 dark:border-danger-600/40 dark:text-danger-400 dark:hover:bg-danger-600/20"
              >
                Delete
              </button>
            </div>
          </div>
        )}
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-700 transition-all"
            style={{ width: `${pctFull}%` }}
          />
        </div>
      </div>

      {/* Cards in the deck */}
      {deck.cards.length === 0 ? (
        <p className="mb-6 rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          No cards yet — add some from the catalog below.
        </p>
      ) : (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {deck.cards.map((c) => (
            <div
              key={c.card_id}
              className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex aspect-[3/4] items-center justify-center bg-slate-100 dark:bg-slate-800">
                {c.image_url ? (
                  <img src={c.image_url} alt={c.name} loading="lazy" className="h-full w-full object-contain" />
                ) : (
                  <span className="text-3xl opacity-30">🃏</span>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1 p-2">
                <p className="truncate text-sm font-medium" title={c.name}>
                  {c.name}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {c.market_price !== null ? format(c.market_price) : "No price yet"}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <button
                    onClick={() => setQty(c.card_id, c.quantity - 1)}
                    aria-label="Decrease quantity"
                    className="h-6 w-6 rounded border border-slate-300 dark:border-slate-700"
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-sm">{c.quantity}</span>
                  <button
                    onClick={() => setQty(c.card_id, c.quantity + 1)}
                    aria-label="Increase quantity"
                    className="h-6 w-6 rounded border border-slate-300 dark:border-slate-700"
                  >
                    +
                  </button>
                  <button
                    onClick={() => removeCard.mutate({ deckId: deck.id, cardId: c.card_id })}
                    aria-label="Remove card"
                    title="Remove from deck"
                    className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-md bg-danger-100 text-danger-600 hover:bg-danger-200 dark:bg-danger-600/20 dark:text-danger-400 dark:hover:bg-danger-600/30"
                  >
                    🗑
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddCardsPanel deck={deck} />
    </div>
  );
}

function AddCardsPanel({ deck }: { deck: Deck }) {
  const sets = useSets();
  const addCard = useAddDeckCard();
  const toast = useToast();

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [setId, setSetId] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const results = useCards({
    set_id: setId || undefined,
    q: debouncedQ || undefined,
    sort: "number",
    limit: 60,
  });

  const inDeck = useMemo(() => new Set(deck.cards.map((c) => c.card_id)), [deck.cards]);

  function add(cardId: string) {
    addCard.mutate(
      { deckId: deck.id, data: { card_id: cardId, quantity: 1 } },
      {
        onError: () => toast.error("Could not add card."),
      },
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <h3 className="mb-3 text-sm font-semibold">Add cards from the catalog</h3>
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or number…"
          aria-label="Search catalog"
          className={`${inputClass} flex-1`}
        />
        <select
          value={setId}
          onChange={(e) => setSetId(e.target.value)}
          aria-label="Filter by set"
          className={inputClass}
        >
          <option value="">All sets</option>
          {(sets.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {results.isPending ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : results.isError ? (
        <p className="text-sm text-danger-600">Could not load cards.</p>
      ) : (results.data ?? []).length === 0 ? (
        <p className="text-sm text-slate-500">No cards match.</p>
      ) : (
        <div className="grid max-h-96 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4">
          {(results.data ?? []).map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-800"
            >
              {c.image_url ? (
                <img src={c.image_url} alt={c.name} loading="lazy" className="h-14 w-auto rounded" />
              ) : (
                <span className="text-2xl opacity-30">🃏</span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium" title={c.name}>
                  {c.name}
                </p>
                <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                  {c.set_id} · #{c.number}
                </p>
                <button
                  onClick={() => add(c.id)}
                  className="mt-1 rounded border border-brand-300 px-2 py-0.5 text-xs font-medium text-brand-600 hover:bg-brand-50 dark:border-brand-700 dark:text-brand-300 dark:hover:bg-brand-900/30"
                >
                  {inDeck.has(c.id) ? "+1 more" : "Add"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
