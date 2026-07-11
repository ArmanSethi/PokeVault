import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  useCardImages,
  useCardNames,
  useCollection,
  useDeleteEntry,
  useUpdateEntry,
} from "../lib/queries";
import { useCurrency } from "../context/CurrencyContext";
import { EmptyState, ErrorState } from "../components/States";
import { TableSkeleton } from "../components/Skeleton";
import { useToast } from "../components/Toast";
import { ImportExportPanel } from "../components/ImportExportPanel";
import { GradingFields } from "../components/GradingFields";
import { CollectionFilters, type SortKey } from "../components/CollectionFilters";
import type { CollectionEntry } from "../types";

const LAYOUT_KEY = "pv-collection-view";

export function CollectionPage() {
  const entries = useCollection();
  const del = useDeleteEntry();
  const update = useUpdateEntry();
  const toast = useToast();
  const { format } = useCurrency();

  const [editing, setEditing] = useState<CollectionEntry | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [sort, setSort] = useState<SortKey>("value");
  const [setFilter, setSetFilter] = useState("");
  const [foilOnly, setFoilOnly] = useState(false);
  const [layout, setLayout] = useState<"table" | "grid">(() =>
    localStorage.getItem(LAYOUT_KEY) === "grid" ? "grid" : "table",
  );
  useEffect(() => {
    localStorage.setItem(LAYOUT_KEY, layout);
  }, [layout]);

  const rows = useMemo(() => entries.data ?? [], [entries.data]);
  const ids = useMemo(() => [...new Set(rows.map((e) => e.card_id))], [rows]);
  const names = useCardNames(ids);
  const images = useCardImages(ids);
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
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Collection</h1>
          <button
            onClick={() => setShowImport(true)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Import / Export
          </button>
        </div>
        <EmptyState
          title="No cards yet"
          hint="Add cards from the catalog or scan page — or import a CSV from another tracker."
        />
        {showImport && <ImportExportPanel onClose={() => setShowImport(false)} />}
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
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Import / Export
          </button>
          {/* Table / grid view toggle (persisted in localStorage) */}
          <div className="flex overflow-hidden rounded-lg border border-slate-300 dark:border-slate-700">
            {(["table", "grid"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setLayout(v)}
                aria-pressed={layout === v}
                aria-label={`${v} view`}
                className={`px-3 py-2 text-sm font-medium ${
                  layout === v
                    ? "bg-brand-600 text-white"
                    : "hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                {v === "table" ? "▤ Table" : "▦ Grid"}
              </button>
            ))}
          </div>
          <CollectionFilters
            sort={sort}
            onSort={setSort}
            setId={setFilter}
            onSet={setSetFilter}
            foilOnly={foilOnly}
            onFoil={setFoilOnly}
            sets={setIds}
          />
        </div>
      </div>

      {layout === "table" ? (
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
                  <td className="px-4 py-2">
                    {e.grade ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium dark:bg-slate-800">
                          {e.grade}
                        </span>
                        {e.grade_multiplier > 1 && (
                          <span
                            title={`Graded copy valued at ${e.grade_multiplier}× the raw price`}
                            className="rounded bg-success-500/15 px-1.5 py-0.5 text-xs font-semibold text-success-600 dark:text-success-500"
                          >
                            ×{e.grade_multiplier}
                          </span>
                        )}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">{format(e.market_price)}</td>
                  <td className="px-4 py-2 text-right font-medium">{format(e.market_value)}</td>
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
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {view.map((e) => (
            <div
              key={e.id}
              className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
            >
              <Link
                to={`/cards/${encodeURIComponent(e.card_id)}`}
                className="relative flex aspect-[3/4] items-center justify-center bg-slate-100 dark:bg-slate-800"
              >
                {images[e.card_id] ? (
                  <img
                    src={images[e.card_id]!}
                    alt={names[e.card_id] ?? e.card_id}
                    loading="lazy"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span className="text-4xl opacity-30">🃏</span>
                )}
                {e.is_foil && (
                  <span className="absolute left-1.5 top-1.5 text-xs text-accent-400">✦</span>
                )}
                {e.grade && (
                  <span className="absolute right-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    {e.grade}
                    {e.grade_multiplier > 1 ? ` ×${e.grade_multiplier}` : ""}
                  </span>
                )}
              </Link>
              <div className="flex flex-1 flex-col gap-1 p-3">
                <Link
                  to={`/cards/${encodeURIComponent(e.card_id)}`}
                  title={names[e.card_id] ?? e.card_id}
                  className="truncate text-sm font-medium text-brand-600 hover:underline"
                >
                  {names[e.card_id] ?? e.card_id}
                </Link>
                <p className="text-sm font-semibold">{format(e.market_value)}</p>
                <div className="mt-1 flex items-center gap-2">
                  <button
                    onClick={() => changeQty(e, -1)}
                    aria-label="Decrease quantity"
                    className="h-6 w-6 rounded border border-slate-300 dark:border-slate-700"
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-sm">{e.quantity}</span>
                  <button
                    onClick={() => changeQty(e, 1)}
                    aria-label="Increase quantity"
                    className="h-6 w-6 rounded border border-slate-300 dark:border-slate-700"
                  >
                    +
                  </button>
                </div>
                <div className="mt-1 flex gap-3 text-sm">
                  <button onClick={() => setEditing(e)} className="text-brand-600 hover:underline">
                    Edit
                  </button>
                  <button
                    onClick={() => remove(e)}
                    className="text-danger-600 hover:underline dark:text-danger-500"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

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

      {showImport && <ImportExportPanel onClose={() => setShowImport(false)} />}
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
          <GradingFields
            condition={condition}
            grade={grade}
            onChange={(next) => {
              setCondition(next.condition);
              setGrade(next.grade);
            }}
          />
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
