import { useRef, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useAddEntry } from "../lib/queries";
import { useToast } from "../components/Toast";
import { money } from "../lib/format";
import type { ScanResult } from "../types";

export function ScanPage() {
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<Record<string, boolean>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const addEntry = useAddEntry();
  const toast = useToast();

  function pick(f: File | null) {
    setFile(f);
    setResult(null);
    setError(null);
    setAdded({});
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  async function scan() {
    if (!file) return;
    setScanning(true);
    setError(null);
    try {
      setResult(await api.scan(file));
    } catch (e) {
      if (e instanceof ApiError && e.status === 503) {
        setError(
          "The server's OCR engine (Tesseract) isn't installed yet. Ask the admin to install it.",
        );
      } else {
        setError(e instanceof Error ? e.message : "Scan failed");
      }
    } finally {
      setScanning(false);
    }
  }

  async function addCandidate(cardId: string, name: string) {
    try {
      await addEntry.mutateAsync({ card_id: cardId, quantity: 1 });
      setAdded((prev) => ({ ...prev, [cardId]: true }));
      toast.success(`Added ${name} to your collection.`);
    } catch {
      toast.error("Could not add card.");
    }
  }

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">Scan a card</h1>
      <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
        Upload a clear photo of a single card. We read the name and number and propose matches —
        nothing is added until you confirm.
      </p>

      <div className="grid gap-6 md:grid-cols-[280px_1fr]">
        <div>
          <button
            onClick={() => inputRef.current?.click()}
            className="flex aspect-[3/4] w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-white text-center text-sm text-slate-400 hover:border-brand-400 dark:border-slate-700 dark:bg-slate-900"
          >
            {preview ? (
              <img src={preview} alt="Upload preview" className="h-full w-full object-contain" />
            ) : (
              <span className="px-4">Click to choose a card photo</span>
            )}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label="Card photo"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />
          <button
            onClick={scan}
            disabled={!file || scanning}
            className="mt-3 w-full rounded-lg bg-brand-600 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {scanning ? "Scanning…" : "Scan"}
          </button>
        </div>

        <div>
          {error && (
            <div className="rounded-xl border border-danger-500 bg-danger-500/10 p-4 text-sm text-danger-600 dark:text-danger-500">
              {error}
            </div>
          )}

          {result && (
            <>
              <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
                Detected: <strong>{result.detected_name ?? "—"}</strong>
                {result.detected_number ? ` · #${result.detected_number}` : ""}
              </p>
              {result.candidates.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
                  No confident matches. Try a sharper, straight-on photo with the name and number
                  clearly visible.
                </div>
              ) : (
                <ul className="space-y-3">
                  {result.candidates.map((c) => (
                    <li
                      key={c.card_id}
                      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
                    >
                      {c.image_url ? (
                        <img
                          src={c.image_url}
                          alt={c.name}
                          loading="lazy"
                          className="h-20 w-14 rounded object-contain"
                        />
                      ) : (
                        <div className="flex h-20 w-14 items-center justify-center rounded bg-slate-100 dark:bg-slate-800">
                          🃏
                        </div>
                      )}
                      <div className="flex-1">
                        <p className="font-medium">{c.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {c.set_id} · #{c.number} · {money(c.market_price, c.currency ?? "USD")}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                            <div
                              className="h-full bg-brand-500"
                              style={{ width: `${Math.round(c.confidence * 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-slate-400">
                            {Math.round(c.confidence * 100)}% match
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => addCandidate(c.card_id, c.name)}
                        disabled={added[c.card_id]}
                        className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
                      >
                        {added[c.card_id] ? "Added ✓" : "Add"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
