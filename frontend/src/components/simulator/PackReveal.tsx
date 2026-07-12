import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useCurrency } from "../../context/CurrencyContext";
import { hasPrice } from "../../lib/format";
import { hasTell, rarityColor, rarityLabel, sparkleCount } from "../../lib/rarityColor";
import { playChime, playFlip } from "../../lib/sfx";
import type { PulledCard } from "../../types";
import { CardBack } from "./CardBack";

function prefersReduced(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Flip-stack reveal: one face-down card at a time (tap to flip, tap to advance), a "Card X of N"
 * counter, and a progress-dot row that fills with each card's rarity color. "Flip all" auto-reveals
 * the rest, staggered. Restraint by tier: common/uncommon flip plainly; rare+ get a scale-pop +
 * accent + a sparkle burst that scales with rarity; only the final (hit) card gets the dramatic
 * finale (dim over the sim section, a lifted card, a bigger burst, a rarity-label flash, a chime).
 * Under prefers-reduced-motion the flip is instant and the pop/sparkles are skipped.
 */
export function PackReveal({ cards, onComplete }: { cards: PulledCard[]; onComplete: () => void }) {
  const n = cards.length;
  const [step, setStep] = useState(0);
  const [faceUp, setFaceUp] = useState(false);
  const [auto, setAuto] = useState(false);
  const reduced = useRef(prefersReduced()).current;
  const timers = useRef<number[]>([]);
  const { format } = useCurrency();

  useEffect(() => {
    const t = timers.current;
    return () => t.forEach((id) => clearTimeout(id));
  }, []);

  const card = cards[step];
  const isLast = step === n - 1;

  function sound(i: number) {
    if (i === n - 1) playChime();
    else playFlip();
  }

  function tap() {
    if (auto) return;
    if (!faceUp) {
      setFaceUp(true);
      sound(step);
    } else if (step < n - 1) {
      setStep(step + 1);
      setFaceUp(false);
    } else {
      onComplete();
    }
  }

  function flipAll() {
    if (auto) return;
    setAuto(true);
    const stagger = reduced ? 90 : 260;
    const start = faceUp ? step + 1 : step;
    if (start >= n) {
      timers.current.push(window.setTimeout(onComplete, 400));
      return;
    }
    let t = 0;
    for (let i = start; i < n; i++) {
      const idx = i;
      timers.current.push(
        window.setTimeout(() => {
          setStep(idx);
          setFaceUp(true);
          sound(idx);
        }, t),
      );
      t += stagger;
    }
    timers.current.push(window.setTimeout(onComplete, t + (reduced ? 200 : 800)));
  }

  const accent = rarityColor(card.tier);
  const tell = faceUp && hasTell(card.tier);
  const sparkles = tell && !reduced ? sparkleCount(card.tier) : 0;
  const finale = isLast && faceUp;

  return (
    <div className="relative flex flex-col items-center py-4">
      <p className="mb-2 text-sm font-medium text-slate-300">
        Card {step + 1} of {n}
      </p>
      <div className="mb-6 flex gap-1.5">
        {cards.map((c, i) => {
          const shown = i < step || (i === step && faceUp);
          return (
            <span
              key={i}
              className="h-2.5 w-2.5 rounded-full transition-colors"
              style={{ background: shown ? rarityColor(c.tier) : "rgba(255,255,255,0.15)" }}
            />
          );
        })}
      </div>

      {finale && !reduced && <div className="sim-finale-dim" aria-hidden />}

      <div className={`relative ${finale ? "z-10" : ""}`}>
        <button
          onClick={tap}
          disabled={auto}
          aria-label={faceUp ? (isLast ? "Finish reveal" : "Next card") : "Flip card"}
          className={`sim-flip block w-52 sm:w-60 ${finale ? "sim-lift" : ""}`}
        >
          <div
            className={`sim-flip-inner aspect-[190/266] ${faceUp ? "is-flipped" : ""} ${
              reduced ? "sim-instant" : ""
            }`}
          >
            <div className="sim-face sim-face-front">
              <CardBack className="h-full w-full" />
            </div>
            <div
              className={`sim-face sim-face-rear bg-slate-900 ${tell ? "sim-pop" : ""}`}
              style={
                tell ? { boxShadow: `0 0 0 3px ${accent}, 0 0 30px -2px ${accent}` } : undefined
              }
            >
              {card.card.image_url ? (
                <img
                  src={card.card.image_url}
                  alt={card.card.name}
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-4xl">🃏</div>
              )}
            </div>
          </div>
        </button>

        {sparkles > 0 && (
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            {Array.from({ length: sparkles }, (_, i) => {
              const angle = (i / sparkles) * 2 * Math.PI;
              const dist = 130;
              const style: CSSProperties = {
                background: accent,
                animationDelay: `${(i % 5) * 30}ms`,
                ["--dx" as string]: `${(Math.cos(angle) * dist).toFixed(0)}px`,
                ["--dy" as string]: `${(Math.sin(angle) * dist).toFixed(0)}px`,
              };
              return <span key={i} className="sim-sparkle" style={style} />;
            })}
          </div>
        )}

        {finale && (
          <div className="sim-finale-label" style={{ color: accent }} aria-hidden>
            {rarityLabel(card.tier)}
          </div>
        )}
      </div>

      {faceUp && (
        <div className={`mt-4 text-center ${finale ? "relative z-10" : ""}`}>
          <p className="font-semibold text-white">{card.card.name}</p>
          <p className="text-sm text-slate-300">
            {hasPrice(card.price_at_open) ? format(card.price_at_open) : "No price yet"}
          </p>
        </div>
      )}

      <div className={`mt-6 flex gap-3 ${finale ? "relative z-10" : ""}`}>
        <button
          onClick={tap}
          disabled={auto}
          className="rounded-lg bg-amber-400 px-5 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-300 disabled:opacity-50"
        >
          {!faceUp ? "Flip" : isLast ? "See summary" : "Next"}
        </button>
        {!auto && !(isLast && faceUp) && (
          <button
            onClick={flipAll}
            className="rounded-lg border border-white/20 px-5 py-2 text-sm font-medium text-slate-200 hover:bg-white/10"
          >
            Flip all
          </button>
        )}
      </div>
    </div>
  );
}
