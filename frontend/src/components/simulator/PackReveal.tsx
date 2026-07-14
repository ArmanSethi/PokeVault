import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useCurrency } from "../../context/CurrencyContext";
import { hasPrice } from "../../lib/format";
import { hasTell, rarityColor, rarityLabel, sparkleCount } from "../../lib/rarityColor";
import { playJackpot, playWhoosh } from "../../lib/sfx";
import type { PulledCard } from "../../types";
import { CardBack } from "./CardBack";

function prefersReduced(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** How long the "Undo" affordance lingers after a swipe, and how long the end-of-pack window
 * waits (so the LAST card can still be undone) before the kept set is committed. */
const UNDO_MS = 4000;

// Minimum pointer travel (px) before a press counts as a drag at all. Below this, a press-release
// is a tap → a no-op (never starts/commits a swipe), so clicking the card does nothing.
const TAP_SLOP = 6;

/**
 * Swipe-to-decide reveal. Cards come up one at a time in the server's order (best/hit last), each
 * auto-revealed on entry — earlier cards flip (with the existing restrained rare+ tells: scale-pop,
 * accent glow, sparkle burst, anticipation shimmer + a soft whoosh); the final hit card ZOOMS in
 * over a dimmed section with an original jackpot flourish (~1s). The user then decides each card by
 * swiping (or dragging with a mouse): RIGHT = keep → Vault, LEFT = discard. Directional Keep/Discard
 * affordances fade in with the drag and the card flings off-screen on release; short drags snap back.
 * Visible Keep/Discard buttons and ArrowLeft/ArrowRight keys are the accessible fallback. Every swipe
 * shows a brief Undo (covers the last card too). Kept `card.id`s are accumulated and handed to the
 * parent once, at end of pack, via `onDecided` — the backend keeps a pack only once. Under
 * prefers-reduced-motion there's no zoom, drag-follow, or fling: decisions apply instantly; only
 * sound remains (governed by the mute toggle).
 */
export function PackReveal({
  cards,
  onDecided,
}: {
  cards: PulledCard[];
  onDecided: (keptCards: PulledCard[]) => void;
}) {
  const n = cards.length;
  const reduced = useRef(prefersReduced()).current;
  const { format } = useCurrency();

  // decisions[i] === true means card i was kept. Length = how many cards are resolved, so the
  // current card is always cards[decisions.length]. Undo is just dropping the last entry.
  const [decisions, setDecisions] = useState<boolean[]>([]);
  const decisionsRef = useRef(decisions);
  decisionsRef.current = decisions;
  const progress = decisions.length;
  const finalizing = progress >= n;
  const isLast = progress === n - 1;
  const card = finalizing ? undefined : cards[progress];

  // Reveal visuals for the current card.
  const [faceUp, setFaceUp] = useState(false);
  const [charging, setCharging] = useState(false); // rare+ anticipation beat before a flip lands
  const [zoom, setZoom] = useState(false); // last-card zoom-in entrance

  // Drag / fling.
  const [dx, setDx] = useState(0);
  const [animating, setAnimating] = useState(false); // fling or snap-back transition in flight
  const dragRef = useRef<{ startX: number; moved: boolean } | null>(null);
  const cardWidth = useRef(240);

  const [showUndo, setShowUndo] = useState(false);

  const seenPeak = useRef(-1); // highest index whose entrance already played (fresh vs. undo)
  const timers = useRef<number[]>([]);
  const undoTimer = useRef<number | null>(null);
  const finishTimer = useRef<number | null>(null);
  const finishedRef = useRef(false);

  useEffect(() => {
    const t = timers.current;
    return () => t.forEach((id) => clearTimeout(id));
  }, []);

  // Reveal the current card on arrival. Fresh arrival → animate + sound; returning via undo → show
  // it at rest, silent. useLayoutEffect so the reset paints before the browser (no face flash).
  useLayoutEffect(() => {
    if (finalizing) return;
    const idx = progress;
    const fresh = idx > seenPeak.current;
    const tier = cards[idx].tier;
    setDx(0);
    setAnimating(false);
    if (isLast) {
      setCharging(false);
      setFaceUp(true);
      setZoom(fresh && !reduced);
      if (fresh) playJackpot();
    } else {
      setZoom(false);
      if (fresh && !reduced && hasTell(tier)) {
        setFaceUp(false);
        setCharging(true);
        timers.current.push(
          window.setTimeout(() => {
            setCharging(false);
            setFaceUp(true);
            playWhoosh();
          }, 340),
        );
      } else if (fresh && !reduced) {
        setCharging(false);
        setFaceUp(false); // start on the back so the flip has somewhere to come from
        timers.current.push(
          window.setTimeout(() => {
            setFaceUp(true);
            playWhoosh();
          }, 30),
        );
      } else {
        setCharging(false);
        setFaceUp(true);
        if (fresh) playWhoosh();
      }
    }
    if (fresh) seenPeak.current = idx;
  }, [progress, isLast, finalizing, reduced, cards]);

  const bumpUndo = useCallback(() => {
    setShowUndo(true);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = window.setTimeout(() => setShowUndo(false), UNDO_MS);
  }, []);

  const commit = useCallback(
    (kept: boolean) => {
      setDecisions((prev) => (prev.length >= n ? prev : [...prev, kept]));
      bumpUndo();
    },
    [n, bumpUndo],
  );

  const canDecide = !finalizing && faceUp && !charging && !animating;

  const decide = useCallback(
    (kept: boolean) => {
      if (!canDecide) return;
      if (reduced) {
        commit(kept);
        return;
      }
      const fly = (typeof window !== "undefined" ? window.innerWidth : 800) * 1.15;
      setAnimating(true);
      setDx(kept ? fly : -fly);
      timers.current.push(window.setTimeout(() => commit(kept), 340));
    },
    [canDecide, reduced, commit],
  );

  const undo = useCallback(() => {
    if (finishedRef.current) return;
    setDecisions((prev) => (prev.length ? prev.slice(0, -1) : prev));
    setShowUndo(false);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setAnimating(false);
    setDx(0);
  }, []);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (finishTimer.current) clearTimeout(finishTimer.current);
    const keptCards = decisionsRef.current.reduce<PulledCard[]>(
      (acc, kept, i) => (kept ? [...acc, cards[i]] : acc),
      [],
    );
    onDecided(keptCards);
  }, [cards, onDecided]);

  // End of pack: keep the Undo window open briefly (so the last card is still reversible), then
  // commit. "Continue" commits immediately; an Undo cancels it (finalizing flips back to false).
  useEffect(() => {
    if (!finalizing) return;
    bumpUndo();
    finishTimer.current = window.setTimeout(finish, UNDO_MS);
    return () => {
      if (finishTimer.current) clearTimeout(finishTimer.current);
    };
  }, [finalizing, bumpUndo, finish]);

  // Keyboard fallback: left = discard, right = keep.
  useEffect(() => {
    if (finalizing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        decide(true);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        decide(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finalizing, decide]);

  // Recenter the card. `animate` snaps it back with a transition (a released small drag); a pure
  // tap recenters instantly. Either way `animating` is cleared afterwards so `canDecide` is
  // restored — a gesture can never leave the card stuck (the old bug: a tap set animating=true
  // and never reset it, which disabled the buttons/keys and "froze" the reveal).
  function recenter(animate: boolean) {
    setDx(0);
    if (animate) {
      setAnimating(true);
      timers.current.push(window.setTimeout(() => setAnimating(false), 360));
    } else {
      setAnimating(false);
    }
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!canDecide) return;
    const el = e.currentTarget;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* not capturable — fine, we still track via state */
    }
    cardWidth.current = el.getBoundingClientRect().width || cardWidth.current;
    dragRef.current = { startX: e.clientX, moved: false };
    setAnimating(false);
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    if (Math.abs(dx) > TAP_SLOP) drag.moved = true;
    setDx(dx);
  }
  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
    const dist = e.clientX - drag.startX;
    const threshold = Math.max(80, cardWidth.current * 0.28);
    // Only a real swipe (moved past the tap slop AND past the commit threshold) decides. A tap or
    // a tiny drag is a no-op — snap back, decide nothing.
    if (drag.moved && Math.abs(dist) > threshold) {
      decide(dist > 0);
    } else {
      recenter(drag.moved);
    }
  }
  // A cancelled pointer (touch interrupted, capture lost) must reset without ever deciding —
  // clientX on cancel is unreliable, so never derive a swipe direction from it.
  function onPointerCancel(e: ReactPointerEvent<HTMLDivElement>) {
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    recenter(false);
  }

  const keptCount = decisions.reduce((c, kept) => c + (kept ? 1 : 0), 0);
  const keptValue = decisions.reduce(
    (s, kept, i) => (kept && hasPrice(cards[i].price_at_open) ? s + Number(cards[i].price_at_open) : s),
    0,
  );

  const commitZone = Math.max(80, cardWidth.current * 0.28);
  const keepOpacity = dx > 0 ? Math.min(1, dx / commitZone) : 0;
  const discardOpacity = dx < 0 ? Math.min(1, -dx / commitZone) : 0;
  const flung = animating && Math.abs(dx) > cardWidth.current;
  const cardStyle: CSSProperties = {
    transform: `translateX(${dx.toFixed(1)}px) rotate(${(dx * 0.04).toFixed(2)}deg)`,
    opacity: flung ? 0 : 1,
  };

  const accent = card ? rarityColor(card.tier) : "#fff";
  const tell = !!card && faceUp && hasTell(card.tier);
  const sparkles = tell && !reduced ? sparkleCount(card.tier) : 0;
  const finale = !finalizing && isLast && faceUp;

  return (
    <div className="relative flex flex-col items-center py-4">
      <p className="mb-2 text-sm font-medium text-slate-300">
        {finalizing ? "Pack complete" : `Card ${progress + 1} of ${n}`}
      </p>
      <div className="mb-3 flex gap-1.5">
        {cards.map((c, i) => {
          const done = i < progress;
          const current = i === progress && !finalizing;
          return (
            <span
              key={i}
              className={`h-2.5 w-2.5 rounded-full transition-colors ${current ? "ring-2 ring-white/70 ring-offset-1 ring-offset-transparent" : ""}`}
              style={{ background: done ? rarityColor(c.tier) : "rgba(255,255,255,0.15)" }}
            />
          );
        })}
      </div>

      <p className="mb-1 text-xs font-medium text-slate-400">
        Kept{" "}
        <span key={keptValue} className="sim-tick font-semibold text-amber-300">
          {format(keptValue)}
        </span>{" "}
        · {keptCount} {keptCount === 1 ? "card" : "cards"}
      </p>
      {/* Undo affordance in the progress area (brief window after each swipe / at end of pack). */}
      <div className="mb-4 h-7">
        {showUndo && (progress > 0 || finalizing) && (
          <button
            onClick={undo}
            className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-white/10"
          >
            ↺ Undo{finalizing ? " last" : ""}
          </button>
        )}
      </div>

      {finalizing ? (
        <div className="flex flex-col items-center gap-4 py-6">
          <p className="text-lg font-semibold text-white">That&apos;s your pack!</p>
          <p className="text-sm text-slate-300">
            Keeping <span className="font-semibold text-amber-300">{keptCount}</span> of {n} —{" "}
            {format(keptValue)}
          </p>
          <button
            onClick={finish}
            className="rounded-lg bg-amber-400 px-6 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-300"
          >
            Continue
          </button>
        </div>
      ) : (
        <>
          {finale && !reduced && <div className="sim-finale-dim" aria-hidden />}

          <div className={`relative ${finale ? "z-10" : ""}`}>
            <div
              className={`sim-swipe relative mx-auto block w-52 select-none sm:w-60 ${animating ? "is-animating" : ""}`}
              style={cardStyle}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
              role="group"
              aria-label={
                card ? `${card.card.name}. Swipe right to keep, left to discard.` : undefined
              }
            >
              <span className="sim-verdict sim-verdict-keep" style={{ opacity: keepOpacity }} aria-hidden>
                Keep
              </span>
              <span
                className="sim-verdict sim-verdict-discard"
                style={{ opacity: discardOpacity }}
                aria-hidden
              >
                Discard
              </span>

              {isLast ? (
                // Hit card: no flip — it zooms straight in, face-up.
                <div
                  className={`aspect-[190/266] overflow-hidden rounded-xl bg-slate-900 ${zoom ? "sim-zoom" : ""} ${tell ? "sim-pop" : ""}`}
                  style={tell ? { boxShadow: `0 0 0 3px ${accent}, 0 0 30px -2px ${accent}` } : undefined}
                >
                  {card!.card.image_url ? (
                    <img
                      src={card!.card.image_url}
                      alt={card!.card.name}
                      draggable={false}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-4xl">🃏</div>
                  )}
                </div>
              ) : (
                <div className="sim-flip block w-full">
                  <div
                    className={`sim-flip-inner aspect-[190/266] ${faceUp ? "is-flipped" : ""} ${reduced ? "sim-instant" : ""}`}
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
                      {card!.card.image_url ? (
                        <img
                          src={card!.card.image_url}
                          alt={card!.card.name}
                          draggable={false}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-4xl">
                          🃏
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

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
                {rarityLabel(card!.tier)}
              </div>
            )}
          </div>

          {faceUp && card && (
            <div className={`mt-4 text-center ${finale ? "relative z-10" : ""}`}>
              <p className="font-semibold text-white">{card.card.name}</p>
              <p className="text-sm text-slate-300">
                {hasPrice(card.price_at_open) ? format(card.price_at_open) : "No price yet"}
              </p>
            </div>
          )}

          <div className={`mt-6 flex items-center justify-center gap-4 ${finale ? "relative z-10" : ""}`}>
            <button
              onClick={() => decide(false)}
              disabled={!canDecide}
              aria-label="Discard card"
              className="rounded-lg border border-red-400/60 px-5 py-2 text-sm font-semibold text-red-300 hover:bg-red-400/10 disabled:opacity-40"
            >
              ✕ Discard
            </button>
            <button
              onClick={() => decide(true)}
              disabled={!canDecide}
              aria-label="Keep card"
              className="rounded-lg bg-emerald-500 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-40"
            >
              Keep ✓
            </button>
          </div>
          <p className="mt-3 text-center text-xs text-slate-500">
            Swipe or drag — right keeps, left discards. Or use ← / → keys.
          </p>
        </>
      )}
    </div>
  );
}
