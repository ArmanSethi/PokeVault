import type { ScanCandidate, ScanResult } from "../types";
import { pct } from "../lib/format";
import { useCurrency } from "../context/CurrencyContext";

interface Props {
  result: ScanResult;
  added: Record<string, boolean>;
  onAdd: (cardId: string, name: string) => void;
}

function ConfidenceBar({ value, width = "w-24" }: { value: number; width?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`h-1.5 ${width} overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700`}>
        <div className="h-full bg-brand-500" style={{ width: pct(value) }} />
      </div>
      <span className="text-xs text-slate-400">{pct(value)} match</span>
    </div>
  );
}

function CardImage({ c, className }: { c: ScanCandidate; className: string }) {
  return c.image_url ? (
    <img
      src={c.image_url}
      alt={c.name}
      loading="lazy"
      className={`${className} rounded object-contain`}
    />
  ) : (
    <div
      className={`${className} flex items-center justify-center rounded bg-slate-100 dark:bg-slate-800`}
    >
      🃏
    </div>
  );
}

export function ScanResults({ result, added, onAdd }: Props) {
  const { format } = useCurrency();
  const [hero, ...rest] = result.candidates;

  return (
    <>
      <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
        Detected: <strong>{result.detected_name ?? "—"}</strong>
        {result.detected_number ? ` · #${result.detected_number}` : ""}
      </p>

      {!hero ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
          No confident matches. Try a sharper, straight-on photo with the name and number clearly
          visible.
        </div>
      ) : (
        <>
          {/* Hero — the most similar card */}
          <div className="mb-4 flex items-center gap-4 rounded-xl border border-brand-500/40 bg-white p-4 shadow-sm dark:bg-slate-900">
            <CardImage c={hero} className="h-32 w-24" />
            <div className="flex-1">
              <p className="text-xs font-medium uppercase tracking-wide text-brand-600 dark:text-brand-400">
                Most similar card
              </p>
              <p className="text-lg font-semibold">{hero.name}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {hero.set_id} · #{hero.number} · {format(hero.market_price)}
              </p>
              <div className="mt-2 flex items-center gap-3">
                <span className="text-2xl font-bold text-brand-600 dark:text-brand-400">
                  {pct(hero.confidence)}
                </span>
                <span className="text-xs text-slate-400">match</span>
              </div>
            </div>
            <button
              onClick={() => onAdd(hero.card_id, hero.name)}
              disabled={added[hero.card_id]}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {added[hero.card_id] ? "Added ✓" : "Add"}
            </button>
          </div>

          {/* Remaining candidates */}
          {rest.length > 0 && (
            <>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                Other matches
              </p>
              <ul className="space-y-3">
                {rest.map((c) => (
                  <li
                    key={c.card_id}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <CardImage c={c} className="h-20 w-14" />
                    <div className="flex-1">
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {c.set_id} · #{c.number} · {format(c.market_price)}
                      </p>
                      <div className="mt-1">
                        <ConfidenceBar value={c.confidence} />
                      </div>
                    </div>
                    <button
                      onClick={() => onAdd(c.card_id, c.name)}
                      disabled={added[c.card_id]}
                      className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
                    >
                      {added[c.card_id] ? "Added ✓" : "Add"}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </>
  );
}
