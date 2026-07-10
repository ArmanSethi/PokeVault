import { useRef, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useAddEntry } from "../lib/queries";
import { useToast } from "../components/Toast";
import { CameraScanner } from "../components/CameraScanner";
import { ScanResults } from "../components/ScanResults";
import type { ScanResult } from "../types";

type Mode = "upload" | "camera";

export function ScanPage() {
  const [mode, setMode] = useState<Mode>("upload");
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<Record<string, boolean>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const addEntry = useAddEntry();
  const toast = useToast();

  function switchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    setResult(null);
    setError(null);
    setAdded({});
  }

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

  const tabClass = (active: boolean) =>
    `rounded-lg px-4 py-1.5 text-sm font-medium transition ${
      active
        ? "bg-brand-600 text-white"
        : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
    }`;

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">Scan a card</h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Upload a clear photo of a single card, or use your camera to identify a card live. We read
        the name and number and propose matches — nothing is added until you confirm.
      </p>

      <div className="mb-6 inline-flex gap-1 rounded-xl border border-slate-200 p-1 dark:border-slate-800">
        <button onClick={() => switchMode("upload")} className={tabClass(mode === "upload")}>
          Upload
        </button>
        <button onClick={() => switchMode("camera")} className={tabClass(mode === "camera")}>
          Camera
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-[280px_1fr]">
        <div>
          {mode === "upload" ? (
            <>
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
            </>
          ) : (
            <CameraScanner onResult={setResult} />
          )}
        </div>

        <div>
          {error && (
            <div className="rounded-xl border border-danger-500 bg-danger-500/10 p-4 text-sm text-danger-600 dark:text-danger-500">
              {error}
            </div>
          )}

          {result && <ScanResults result={result} added={added} onAdd={addCandidate} />}
        </div>
      </div>
    </>
  );
}
