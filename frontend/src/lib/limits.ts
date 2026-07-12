/** Numeric input limits — mirror of backend `app/core/limits.py`. The backend is the source
 *  of truth (rejects/clamps out-of-range); these drive inline UX (input max + clamping). */
export const LIMITS = {
  cardQty: { min: 1, max: 99 }, // card copies: collection stacks + deck cards
  deckTarget: { min: 1, max: 100 }, // dream-deck target size
  money: { min: 0, max: 1_000_000 }, // acquired price, wishlist target — decimals allowed
} as const;

/** Clamp an integer field (quantity / target size) into [min, max]. NaN → min. */
export function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Clamp a money value into [0, max], preserving decimals. NaN → min. */
export function clampMoney(n: number): number {
  if (!Number.isFinite(n)) return LIMITS.money.min;
  return Math.min(LIMITS.money.max, Math.max(LIMITS.money.min, n));
}

/** True when a money text entry is a real number above the cap (for an inline warning). */
export function moneyOverCap(raw: string): boolean {
  return raw !== "" && Number.isFinite(Number(raw)) && Number(raw) > LIMITS.money.max;
}
