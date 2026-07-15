import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  useAddSealed,
  useCardImages,
  useCardNames,
  useCollection,
  useDeleteEntry,
  useDeleteSealed,
  useSealedItems,
  useSets,
  useUpdateEntry,
  useUpdateSealed,
} from "../lib/queries";
import { useCurrency } from "../context/CurrencyContext";
import { LIMITS } from "../lib/limits";
import { NumberField } from "../components/NumberField";
import { CardBadgeOverlay } from "../components/CardBadgeOverlay";
import { RAW_GRADE_NOTE, gradedButRaw } from "../lib/grading";
import { EmptyState, ErrorState } from "../components/States";
import { TableSkeleton } from "../components/Skeleton";
import { useToast } from "../components/Toast";
import { ImportExportPanel } from "../components/ImportExportPanel";
import { GradingFields } from "../components/GradingFields";
import { CollectionFilters, type SortKey } from "../components/CollectionFilters";
import type { CollectionEntry, ProductType, SealedItem } from "../types";

const LAYOUT_KEY = "pv-collection-view";
const TAB_KEY = "pv-collection-tab";

// Sealed product types, in display order, with their human labels.
const PRODUCT_TYPES: ProductType[] = ["pack", "booster_box", "etb", "bundle", "other"];
const PRODUCT_LABELS: Record<ProductType, string> = {
  pack: "Pack",
  booster_box: "Booster box",
  etb: "Elite Trainer Box",
  bundle: "Bundle",
  other: "Other",
};

export function CollectionPage() {
  const entries = useCollection();
  const del = useDeleteEntry();
  const toast = useToast();
  const { format } = useCurrency();

  const [editing, setEditing] = useState<CollectionEntry | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [sort, setSort] = useState<SortKey>("value");
  const [setFilter, setSetFilter] = useState("");
  const [foilOnly, setFoilOnly] = useState(false);
  const [params] = useSearchParams();
  const [layout, setLayout] = useState<"table" | "grid">(() => {
    const v = params.get("view");
    if (v === "table" || v === "grid") return v;
    return localStorage.getItem(LAYOUT_KEY) === "grid" ? "grid" : "table";
  });
  useEffect(() => {
    localStorage.setItem(LAYOUT_KEY, layout);
  }, [layout]);
  const [tab, setTab] = useState<"cards" | "sealed">(() => {
    const t = params.get("tab");
    if (t === "cards" || t === "sealed") return t;
    return localStorage.getItem(TAB_KEY) === "sealed" ? "sealed" : "cards";
  });
  useEffect(() => {
    localStorage.setItem(TAB_KEY, tab);
  }, [tab]);

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

  // Cards / Sealed tab switch — shared across the (cards) empty + populated headers and the
  // sealed view. Defined after all hooks so the sealed early-return below never skips a hook.
  const tabSwitch = (
    <div className="flex overflow-hidden rounded-lg border border-slate-300 dark:border-slate-700">
      {(["cards", "sealed"] as const).map((t) => (
        <button
          key={t}
          onClick={() => setTab(t)}
          aria-pressed={tab === t}
          className={`px-3 py-2 text-sm font-medium capitalize ${
            tab === t ? "bg-brand-600 text-white" : "hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );

  // Sealed tab is independent of the card collection's load/empty state, so it returns before the
  // card guards below (its own data + states live in SealedSection).
  if (tab === "sealed") {
    return (
      <>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">Collection</h1>
          {tabSwitch}
        </div>
        <SealedSection />
      </>
    );
  }

  if (entries.isPending) return <TableSkeleton rows={8} />;
  if (entries.isError)
    return (
      <ErrorState message={(entries.error as Error).message} onRetry={() => entries.refetch()} />
    );

  if (rows.length === 0) {
    return (
      <>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Collection</h1>
            {tabSwitch}
          </div>
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
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Collection</h1>
          {tabSwitch}
        </div>
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
                <th className="px-4 py-2 text-center">Condition / Grade</th>
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
                  <td className="px-4 py-2">×{e.quantity}</td>
                  {/* One column: the grade for graded cards, else the raw condition — never both.
                      Centered (header + cell) so it sits midway between Qty and Value. */}
                  <td className="px-4 py-2 text-center">
                    {e.grade ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium dark:bg-slate-800">
                          {e.grade}
                        </span>
                        {gradedButRaw(e.grade) && (
                          <span
                            title={RAW_GRADE_NOTE}
                            className="cursor-help text-xs text-amber-600 dark:text-amber-400"
                          >
                            raw*
                          </span>
                        )}
                      </span>
                    ) : (
                      (e.condition ?? "—")
                    )}
                  </td>
                  <td className="px-4 py-2 text-right font-medium">{format(e.market_value)}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <button
                      onClick={() => setEditing(e)}
                      className="mr-3 text-brand-600 hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => remove(e)}
                      aria-label="Delete card"
                      title="Delete this card from your collection"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-danger-100 text-danger-600 hover:bg-danger-200 dark:bg-danger-600/20 dark:text-danger-400 dark:hover:bg-danger-600/30"
                    >
                      🗑
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
                <CardBadgeOverlay
                  isFoil={e.is_foil}
                  quantity={e.quantity}
                  grade={e.grade}
                  condition={e.condition}
                />
              </Link>
              <div className="flex flex-1 flex-col p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col gap-1">
                    <Link
                      to={`/cards/${encodeURIComponent(e.card_id)}`}
                      title={names[e.card_id] ?? e.card_id}
                      className="truncate text-sm font-medium text-brand-600 hover:underline"
                    >
                      {names[e.card_id] ?? e.card_id}
                    </Link>
                    <p className="text-sm font-semibold">{format(e.market_value)}</p>
                    {gradedButRaw(e.grade) && (
                      <p
                        title={RAW_GRADE_NOTE}
                        className="cursor-help text-[11px] text-amber-600 dark:text-amber-400"
                      >
                        raw price · no graded premium
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2 text-sm">
                    <button
                      onClick={() => setEditing(e)}
                      className="text-brand-600 hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => remove(e)}
                      aria-label="Delete card"
                      title="Delete this card from your collection"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-danger-100 text-danger-600 hover:bg-danger-200 dark:bg-danger-600/20 dark:text-danger-400 dark:hover:bg-danger-600/30"
                    >
                      🗑
                    </button>
                  </div>
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
            <NumberField
              ref={firstRef}
              kind="int"
              value={quantity}
              onCommit={(v) => setQuantity(v ?? LIMITS.cardQty.min)}
              min={LIMITS.cardQty.min}
              max={LIMITS.cardQty.max}
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

/**
 * The "Sealed" tab body — the user's sealed product (packs, boxes, ETBs, bundles, other). Wholly
 * separate from card singles: its own list, add/edit form, and a "Sealed value" subtotal (sum of
 * value × quantity over items that have a value; blank values contribute 0).
 */
function SealedSection() {
  const items = useSealedItems();
  const del = useDeleteSealed();
  const toast = useToast();
  const { format } = useCurrency();
  const [editing, setEditing] = useState<SealedItem | null>(null);
  const [adding, setAdding] = useState(false);

  const rows = items.data ?? [];
  const sealedValue = rows.reduce(
    (sum, i) => sum + (i.value == null ? 0 : Number(i.value) * i.quantity),
    0,
  );
  const hasAnyValue = rows.some((i) => i.value != null);

  function remove(item: SealedItem) {
    const label = item.name || PRODUCT_LABELS[item.product_type];
    if (!confirm(`Remove ${label} from your sealed products?`)) return;
    del.mutate(item.id, {
      onSuccess: () => toast.success("Removed."),
      onError: () => toast.error("Could not remove."),
    });
  }

  if (items.isPending) return <TableSkeleton rows={6} />;
  if (items.isError)
    return <ErrorState message={(items.error as Error).message} onRetry={() => items.refetch()} />;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Sealed value:{" "}
          <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {hasAnyValue ? format(sealedValue) : "—"}
          </span>
          <span className="ml-1 text-xs text-slate-400">· separate from portfolio value</span>
        </p>
        <button
          onClick={() => setAdding(true)}
          className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          + Add sealed product
        </button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No sealed product yet"
          hint="Track packs, booster boxes, ETBs and bundles you own — add one to get started."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left dark:bg-slate-800">
              <tr>
                <th className="px-4 py-2">Product</th>
                <th className="px-4 py-2">Set</th>
                <th className="px-4 py-2">Qty</th>
                <th className="px-4 py-2 text-right">Value</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-2">
                    <span className="font-medium">{PRODUCT_LABELS[i.product_type]}</span>
                    {i.name && <span className="text-slate-400"> · {i.name}</span>}
                  </td>
                  <td className="px-4 py-2">{i.set_name ?? "—"}</td>
                  <td className="px-4 py-2">×{i.quantity}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{format(i.value)}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <button
                      onClick={() => setEditing(i)}
                      className="mr-3 text-brand-600 hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => remove(i)}
                      aria-label="Delete sealed product"
                      title="Delete this sealed product"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-danger-100 text-danger-600 hover:bg-danger-200 dark:bg-danger-600/20 dark:text-danger-400 dark:hover:bg-danger-600/30"
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(adding || editing) && (
        <SealedFormModal
          item={editing}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          onSaved={() => {
            setAdding(false);
            setEditing(null);
            toast.success("Saved.");
          }}
        />
      )}
    </>
  );
}

/** Add (item = null) / edit modal for a sealed product. Mirrors the card EditModal shell. */
function SealedFormModal({
  item,
  onClose,
  onSaved,
}: {
  item: SealedItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const add = useAddSealed();
  const update = useUpdateSealed();
  const sets = useSets();
  const toast = useToast();
  const firstRef = useRef<HTMLSelectElement>(null);

  const [productType, setProductType] = useState<ProductType>(item?.product_type ?? "pack");
  const [setId, setSetId] = useState<string>(item?.set_id ?? "");
  const [name, setName] = useState(item?.name ?? "");
  const [quantity, setQuantity] = useState(item?.quantity ?? LIMITS.sealedQty.min);
  const [value, setValue] = useState<number | null>(
    item?.value == null ? null : Number(item.value),
  );

  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (ev: KeyboardEvent) => ev.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const inputClass =
    "w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-800";
  const pending = add.isPending || update.isPending;

  const sortedSets = useMemo(
    () => [...(sets.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [sets.data],
  );

  async function save() {
    const payload = {
      product_type: productType,
      set_id: setId || null,
      name: name.trim() || null,
      quantity,
      value,
    };
    try {
      if (item) await update.mutateAsync({ id: item.id, data: payload });
      else await add.mutateAsync(payload);
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
        aria-label={item ? "Edit sealed product" : "Add sealed product"}
        className="w-full max-w-md rounded-xl bg-white p-6 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {item ? "Edit sealed product" : "Add sealed product"}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded p-1 text-slate-400 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="mb-1 block">Product type</span>
            <select
              ref={firstRef}
              value={productType}
              onChange={(e) => setProductType(e.target.value as ProductType)}
              className={inputClass}
            >
              {PRODUCT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {PRODUCT_LABELS[t]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block">Set (optional)</span>
            <select value={setId} onChange={(e) => setSetId(e.target.value)} className={inputClass}>
              <option value="">No set</option>
              {sortedSets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block">Name / label (optional)</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Base Set Booster Box"
              className={inputClass}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block">Quantity</span>
              <NumberField
                kind="int"
                value={quantity}
                onCommit={(v) => setQuantity(v ?? LIMITS.sealedQty.min)}
                min={LIMITS.sealedQty.min}
                max={LIMITS.sealedQty.max}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="mb-1 block">Value (optional)</span>
              <NumberField
                kind="money"
                value={value}
                onCommit={setValue}
                min={LIMITS.money.min}
                max={LIMITS.money.max}
                placeholder="—"
                className={inputClass}
              />
            </label>
          </div>
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
            disabled={pending}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {pending ? "Saving…" : item ? "Save" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}
