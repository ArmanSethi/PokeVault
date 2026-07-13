import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { useCurrency } from "../../context/CurrencyContext";
import { hasPrice } from "../../lib/format";
import { hasTell, rarityColor, rarityLabel, sparkleCount } from "../../lib/rarityColor";
import { playChime, playWhoosh } from "../../lib/sfx";
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
 *
 * Extra "juice" (all additive, transform/opacity only): the face-down card gets a slow idle bob and
 * a cursor-parallax tilt; the flip eases with a spring overshoot + a soft whoosh; a rare+ card holds
 * a brief shimmer of anticipation before it resolves; the hit finale adds a shockwave ring, a short
 * screen-shake and a crescendo chime; and a running "pack value" ticks up as you reveal. Under
 * prefers-reduced-motion every animation is disabled and flips are instant — only sound (governed by
 * the mute toggle) remains.
 */
export function PackReveal({ cards, onComplete }: { cards: PulledCard[]; onComplete: () => void }) {
  const n = cards.length;
  const [step, setStep] = useState(0);
  const [faceUp, setFaceUp] = useState(false);
  const [auto, setAuto] = useState(false);
  const [charging, setCharging] = useState(false); // rare+ anticipation beat before the flip lands
  const [shake, setShake] = useState(false); // brief finale screen-shake
  const reduced = useRef(prefersReduced()).current;
  const tiltRef = useRef<HTMLButtonElement>(null);
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
    else playWhoosh();
  }

  // Parallax tilt toward the pointer — only while the back is face-down (its "holdable" feel).
  function tilt(e: PointerEvent<HTMLButtonElement>) {
    if (faceUp || auto || charging || reduced) return;
    const el = tiltRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--sim-tx", `${(px * 20).toFixed(2)}deg`);
    el.style.setProperty("--sim-ty", `${(-py * 20).toFixed(2)}deg`);
  }
  function untilt() {
    const el = tiltRef.current;
    if (!el) return;
    el.style.setProperty("--sim-tx", "0deg");
    el.style.setProperty("--sim-ty", "0deg");
  }

  function tap() {
    if (auto || charging) return;
    if (!faceUp) {
      untilt(); // settle the tilt as the card commits to the flip
      // Rare+: a split-second shimmer of tension before the face lands, so good pulls feel earned.
      if (hasTell(card.tier) && !reduced) {
        setCharging(true);
        timers.current.push(
          window.setTimeout(() => {
            setCharging(false);
            setFaceUp(true);
            sound(step);
          }, 340),
        );
      } else {
        setFaceUp(true);
        sound(step);
      }
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
  const idleBob = !faceUp && !auto && !charging && !reduced;

  // Running "pack value so far": sum of open-time prices for cards already revealed. Builds toward
  // the finale. Uses the existing frozen price_at_open — no new data.
  const revealedTotal = cards.reduce((sum, c, i) => {
    const shown = i < step || (i === step && faceUp);
    return shown && hasPrice(c.price_at_open) ? sum + Number(c.price_at_open) : sum;
  }, 0);

  // Kick a short screen-shake when the hit finale lands.
  useEffect(() => {
    if (!finale || reduced) return;
    setShake(true);
    const id = window.setTimeout(() => setShake(false), 460);
    return () => clearTimeout(id);
  }, [finale, reduced]);

  return (
    <div className="relative flex flex-col items-center py-4">
      <p className="mb-2 text-sm font-medium text-slate-300">
        Card {step + 1} of {n}
      </p>
      <div className="mb-3 flex gap-1.5">
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

      {/* Momentum: running pack value, popping on each tick up (key remounts → replays the pop). */}
      <p className="mb-6 text-xs font-medium text-slate-400">
        Pack value{" "}
        <span key={revealedTotal} className="sim-tick font-semibold text-amber-300">
          {format(revealedTotal)}
        </span>
      </p>

      {finale && !reduced && <div className="sim-finale-dim" aria-hidden />}

      <div className={`relative ${finale ? "z-10" : ""} ${shake ? "sim-shake" : ""}`}>
        <div className={`sim-flip mx-auto block w-52 sm:w-60 ${finale ? "sim-lift" : ""} ${idleBob ? "sim-bob" : ""}`}>
          <button
            ref={tiltRef}
            onClick={tap}
            onPointerMove={tilt}
            onPointerLeave={untilt}
            disabled={auto}
            aria-label={faceUp ? (isLast ? "Finish reveal" : "Next card") : "Flip card"}
            className="sim-tilt block w-full"
          >
            <div
              className={`sim-flip-inner aspect-[190/266] ${faceUp ? "is-flipped" : ""} ${
                reduced ? "sim-instant" : ""
              }`}
            >
              <div className="sim-face sim-face-front">
                <CardBack className="h-full w-full" />
                {charging && <span className="sim-charge" aria-hidden />}
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
        </div>

        {finale && !reduced && (
          <span className="sim-shockwave" style={{ color: accent }} aria-hidden />
        )}

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
