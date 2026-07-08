import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useCardNames, useCollection, useDeleteEntry, useUpdateEntry } from "../lib/queries";
import { money } from "../lib/format";
import { EmptyState, ErrorState } from "../components/States";
import { TableSkeleton } from "../components/Skeleton";
import { useToast } from "../components/Toast";
import type { CollectionEntry } from "../types";

type SortKey = "name" | "value" | "quantity";
const selectClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800";

export function CollectionPage() {
  const entries = useCollection();
  const del = useDeleteEntry();
  const update = useUpdateEntry();
  const toast = useToast();

  const [editing, setEditing] = useState<CollectionEntry | null>(null);
  const [sort, setSort] = useState<SortKey>("value");
  const [setFilter, setSetFilter] = useState("");
  const [foilOnly, setFoilOnly] = useState(false);

  const rows = useMemo(() => entries.data ?? [], [entries.data]);
  const ids = useMemo(() => [...new Set(rows.map((e) => e.card_id))], [rows]);
  const names = useCardNames(ids);
  const setIds = useMemo(
    () => [...new Set(rows.map((e) => e.card_id.split("-")[0]))].sort(),
    [rows],
  );

  const view = useMemo(() => {
    let r = rows;
    if (setFilter) r = r.filter((e) => e.card_id.startsWith(`${setFilter}-`));
    if (foilOnly) r = r.filter((e) => e.is_foil);
    const val = (e: CollectionEntry) => Number(e.market_value ?? 0);
    return [...r].sort((a, b) => {
      if (sort === "value") return val(b) - val(a);
      if (sort === "quantity") return b.quantity - a.quantity;
      return (names[a.card_id] ?? a.card_id).localeCompare(names[b.card_id] ?? b.card_id);
    });
  }, [rows, setFilter, foilOnly, sort, names]);

  if (entries.isPending) return <TableSkeleton rows={8} />;
  if (entries.isError)
    return (
      <ErrorState message={(entries.error as Error).message} onRetry={() => entries.refetch()} />
    );

  if (rows.length === 0) {
    return (
      <>
        <h1 className="mb-4 text-2xl font-bold">Collection</h1>
        <EmptyState title="No cards yet" hint="Add cards from the catalog or the scan page." />
      </>
    );
  }

  function changeQty(entry: CollectionEntry, delta: number) {
    const quantity = entry.quantity + delta;
    if (quantity < 1) return;
    update.mutate({ id: entry.id, data: { quantity } });
  }

  function remove(entry: CollectionEntry) {
    if (!confirm(`Remove ${names[entry.card_id] ?? entry.card_id} from your collection?`)) return;
    del.mutate(entry.id, {
      onSuccess: () => toast.success("Removed from collection."),
      onError: () => toast.error("Could not remove card."),
    });
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Collection</h1>
        <div className="flex flex-wrap gap-2">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Sort collection"
            className={selectClass}
          >
            <option value="value">Sort: value</option>
            <option value="name">Sort: name</option>
            <option value="quantity">Sort: quantity</option>
          </select>
          <select
            value={setFilter}
            onChange={(e) => setSetFilter(e.target.value)}
            aria-label="Filter by set"
            className={selectClass}
          >
            <option value="">All sets</option>
            {setIds.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={foilOnly}
              onChange={(e) => setFoilOnly(e.target.checked)}
            />
            Foil only
          </label>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left dark:bg-slate-800">
            <tr>
              <th className="px-4 py-2">Card</th>
              <th className="px-4 py-2">Qty</th>
              <th className="px-4 py-2">Condition</th>
              <th className="px-4 py-2">Grade</th>
              <th className="px-4 py-2 text-right">Unit</th>
              <th className="px-4 py-2 text-right">Value</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {view.map((e) => (
              <tr key={e.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-4 py-2">
                  <Link
                    to={`/cards/${encodeURIComponent(e.card_id)}`}
                    className="font-medium text-brand-600 hover:underline"
                  >
                    {names[e.card_id] ?? e.card_id}
                  </Link>
                  {e.is_foil && <span className="ml-2 text-xs text-accent-500">✦ foil</span>}
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => changeQty(e, -1)}
                      aria-label="Decrease quantity"
                      className="h-6 w-6 rounded border border-slate-300 dark:border-slate-700"
                    >
                      −
                    </button>
                    <span className="w-6 text-center">{e.quantity}</span>
                    <button
                      onClick={() => changeQty(e, 1)}
                      aria-label="Increase quantity"
                      className="h-6 w-6 rounded border border-slate-300 dark:border-slate-700"
                    >
                      +
                    </button>
                  </div>
                </td>
                <td className="px-4 py-2">{e.condition ?? "—"}</td>
                <td className="px-4 py-2">{e.grade ?? "—"}</td>
                <td className="px-4 py-2 text-right">{money(e.market_price)}</td>
                <td className="px-4 py-2 text-right font-medium">{money(e.market_value)}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <button
                    onClick={() => setEditing(e)}
                    className="mr-2 text-brand-600 hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => remove(e)}
                    className="text-danger-600 hover:underline dark:text-danger-500"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <EditModal
          entry={editing}
          name={names[editing.card_id] ?? editing.card_id}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast.success("Saved.");
          }}
        />
      )}
    </>
  );
}

function EditModal({
  entry,
  name,
  onClose,
  onSaved,
}: {
  entry: CollectionEntry;
  name: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const update = useUpdateEntry();
  const toast = useToast();
  const firstRef = useRef<HTMLInputElement>(null);
  const [quantity, setQuantity] = useState(entry.quantity);
  const [condition, setCondition] = useState(entry.condition ?? "");
  const [grade, setGrade] = useState(entry.grade ?? "");
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [acquired, setAcquired] = useState(String(entry.acquired_price ?? ""));

  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (ev: KeyboardEvent) => ev.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const inputClass =
    "w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-800";

  async function save() {
    try {
      await update.mutateAsync({
        id: entry.id,
        data: {
          quantity,
          condition: condition || null,
          grade: grade || null,
          notes: notes || null,
          acquired_price: acquired === "" ? null : Number(acquired),
        },
      });
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${name}`}
        className="w-full max-w-md rounded-xl bg-white p-6 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Edit — {name}</h2>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded p-1 text-slate-400 hover:text-slate-600"
          >
            ✕
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label>
            <span className="mb-1 block">Quantity</span>
            <input
              ref={firstRef}
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
              className={inputClass}
            />
          </label>
          <label>
            <span className="mb-1 block">Condition</span>
            <input
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              className={inputClass}
            />
          </label>
          <label>
            <span className="mb-1 block">Grade</span>
            <input
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              className={inputClass}
            />
          </label>
          <label>
            <span className="mb-1 block">Acquired price</span>
            <input
              type="number"
              step="0.01"
              value={acquired}
              onChange={(e) => setAcquired(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="col-span-2">
            <span className="mb-1 block">Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={update.isPending}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {update.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
