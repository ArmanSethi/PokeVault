import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import { money } from "../lib/format";
import { EmptyState, ErrorState, Spinner } from "../components/States";
import type { CollectionEntry } from "../types";

export function CollectionPage() {
  const entries = useAsync(() => api.listCollection(), []);
  const [names, setNames] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<CollectionEntry | null>(null);

  // Enrich rows with card names (the collection endpoint returns only card_id).
  useEffect(() => {
    const list = entries.data;
    if (!list || list.length === 0) return;
    const ids = [...new Set(list.map((e) => e.card_id))].filter((id) => !(id in names));
    if (ids.length === 0) return;
    let alive = true;
    Promise.all(
      ids.map((id) =>
        api
          .getCard(id)
          .then((c) => [id, c.name] as const)
          .catch(() => [id, id] as const),
      ),
    ).then((pairs) => {
      if (alive) setNames((prev) => ({ ...prev, ...Object.fromEntries(pairs) }));
    });
    return () => {
      alive = false;
    };
  }, [entries.data, names]);

  if (entries.loading) return <Spinner label="Loading your collection…" />;
  if (entries.error) return <ErrorState message={entries.error} onRetry={entries.reload} />;
  const rows = entries.data!;

  if (rows.length === 0) {
    return (
      <>
        <h1 className="mb-4 text-2xl font-bold">Collection</h1>
        <EmptyState title="No cards yet" hint="Add cards from the catalog or the scan page." />
      </>
    );
  }

  async function remove(entry: CollectionEntry) {
    if (!confirm(`Remove ${names[entry.card_id] ?? entry.card_id} from your collection?`)) return;
    await api.deleteEntry(entry.id);
    entries.reload();
  }

  async function changeQty(entry: CollectionEntry, delta: number) {
    const quantity = entry.quantity + delta;
    if (quantity < 1) return;
    await api.updateEntry(entry.id, { quantity });
    entries.reload();
  }

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Collection</h1>
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
            {rows.map((e) => (
              <tr key={e.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-4 py-2">
                  <Link to={`/cards/${encodeURIComponent(e.card_id)}`} className="font-medium text-brand-600 hover:underline">
                    {names[e.card_id] ?? e.card_id}
                  </Link>
                  {e.is_foil && <span className="ml-2 text-xs text-amber-500">✦ foil</span>}
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <button onClick={() => changeQty(e, -1)} className="h-6 w-6 rounded border border-slate-300 dark:border-slate-700">
                      −
                    </button>
                    <span className="w-6 text-center">{e.quantity}</span>
                    <button onClick={() => changeQty(e, 1)} className="h-6 w-6 rounded border border-slate-300 dark:border-slate-700">
                      +
                    </button>
                  </div>
                </td>
                <td className="px-4 py-2">{e.condition ?? "—"}</td>
                <td className="px-4 py-2">{e.grade ?? "—"}</td>
                <td className="px-4 py-2 text-right">{money(e.market_price)}</td>
                <td className="px-4 py-2 text-right font-medium">{money(e.market_value)}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => setEditing(e)} className="mr-2 text-brand-600 hover:underline">
                    Edit
                  </button>
                  <button onClick={() => remove(e)} className="text-red-600 hover:underline">
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
            entries.reload();
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
  const [quantity, setQuantity] = useState(entry.quantity);
  const [condition, setCondition] = useState(entry.condition ?? "");
  const [grade, setGrade] = useState(entry.grade ?? "");
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [acquired, setAcquired] = useState(entry.acquired_price ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.updateEntry(entry.id, {
        quantity,
        condition: condition || null,
        grade: grade || null,
        notes: notes || null,
        acquired_price: acquired === "" ? null : Number(acquired),
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl bg-white p-6 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold">Edit — {name}</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label>
            <span className="mb-1 block">Quantity</span>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
            />
          </label>
          <label>
            <span className="mb-1 block">Condition</span>
            <input
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
            />
          </label>
          <label>
            <span className="mb-1 block">Grade</span>
            <input
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
            />
          </label>
          <label>
            <span className="mb-1 block">Acquired price</span>
            <input
              type="number"
              step="0.01"
              value={acquired}
              onChange={(e) => setAcquired(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
            />
          </label>
          <label className="col-span-2">
            <span className="mb-1 block">Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
            />
          </label>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
