import { useRef, useState } from "react";
import { useConfirmImport, useImportPreview } from "../lib/queries";
import { useToast } from "./Toast";
import type { ImportConfirmRow, ImportPreview, ImportRow } from "../types";

/** Import (CSV → preview → confirm) and export controls for the collection page. */
export function ImportExportPanel({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const preview = useImportPreview();
  const confirm = useConfirmImport();
  const [data, setData] = useState<ImportPreview | null>(null);
  // For each ambiguous row_index, the card_id the user picked (or "" to skip).
  const [picks, setPicks] = useState<Record<number, string>>({});
  const [dragging, setDragging] = useState(false);

  async function handleFile(file: File | null) {
    if (!file) return;
    setData(null);
    setPicks({});
    try {
      const result = await preview.mutateAsync(file);
      setData(result);
      if (result.total === 0) toast.error("No card rows found in that CSV.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read that file.");
    }
  }

  function chosenCardId(row: ImportRow): string | null {
    if (row.status === "matched") return row.selected_card_id;
    if (row.status === "ambiguous") return picks[row.row_index] || null;
    return null;
  }

  function buildRows(): ImportConfirmRow[] {
    if (!data) return [];
    const out: ImportConfirmRow[] = [];
    for (const row of data.rows) {
      const card_id = chosenCardId(row);
      if (!card_id) continue;
      out.push({
        card_id,
        quantity: row.quantity,
        condition: row.condition,
        is_foil: row.is_foil,
      });
    }
    return out;
  }

  async function doConfirm() {
    const rows = buildRows();
    if (rows.length === 0) {
      toast.error("Nothing selected to import.");
      return;
    }
    try {
      const res = await confirm.mutateAsync(rows);
      toast.success(`Imported ${res.added} card${res.added === 1 ? "" : "s"}.`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed.");
    }
  }

  async function doExport() {
    try {
      const blob = await import("../lib/api").then((m) => m.api.exportCollection());
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "pokevault-collection.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed.");
    }
  }

  const selectedCount = buildRows().length;

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Import or export collection"
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-white p-6 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Import / Export</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-slate-400 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Import a CSV from Collectr, TCG Collector, or any spreadsheet — you own your data.
          </p>
          <button
            onClick={doExport}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Export my collection ↓
          </button>
        </div>

        {!data && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              handleFile(e.dataTransfer.files?.[0] ?? null);
            }}
            className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-10 text-center ${
              dragging
                ? "border-brand-500 bg-brand-50 dark:bg-brand-900/20"
                : "border-slate-300 dark:border-slate-700"
            }`}
          >
            <p className="text-sm text-slate-500 dark:text-slate-400">Drop a CSV here, or</p>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={preview.isPending}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {preview.isPending ? "Reading…" : "Choose a CSV file"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
          </div>
        )}

        {data && (
          <>
            <div className="mb-3 flex flex-wrap gap-4 text-sm">
              <span className="text-emerald-600 dark:text-emerald-400">
                ✓ {data.matched} matched
              </span>
              <span className="text-amber-600 dark:text-amber-400">
                ? {data.ambiguous} to review
              </span>
              <span className="text-slate-500">✕ {data.unmatched} unmatched</span>
            </div>

            <div className="flex-1 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-100 text-left dark:bg-slate-800">
                  <tr>
                    <th className="px-3 py-2">CSV row</th>
                    <th className="px-3 py-2">Qty</th>
                    <th className="px-3 py-2">Match</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr
                      key={row.row_index}
                      className="border-t border-slate-100 dark:border-slate-800"
                    >
                      <td className="px-3 py-2">
                        {row.name ?? "—"}
                        {row.number && <span className="text-slate-400"> #{row.number}</span>}
                        {row.set_name && <span className="text-slate-400"> · {row.set_name}</span>}
                      </td>
                      <td className="px-3 py-2">{row.quantity}</td>
                      <td className="px-3 py-2">
                        {row.status === "matched" && (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            {row.candidates[0]?.name} #{row.candidates[0]?.number}
                          </span>
                        )}
                        {row.status === "ambiguous" && (
                          <select
                            value={picks[row.row_index] ?? ""}
                            onChange={(e) =>
                              setPicks((p) => ({ ...p, [row.row_index]: e.target.value }))
                            }
                            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                          >
                            <option value="">Skip — pick a match…</option>
                            {row.candidates.map((c) => (
                              <option key={c.card_id} value={c.card_id}>
                                {c.name} #{c.number} ({c.set_id}) · {Math.round(c.confidence * 100)}
                                %
                              </option>
                            ))}
                          </select>
                        )}
                        {row.status === "unmatched" && (
                          <span className="text-slate-400">No match</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                onClick={() => {
                  setData(null);
                  setPicks({});
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700"
              >
                Choose another file
              </button>
              <button
                onClick={doConfirm}
                disabled={confirm.isPending || selectedCount === 0}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {confirm.isPending
                  ? "Importing…"
                  : `Import ${selectedCount} card${selectedCount === 1 ? "" : "s"}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
