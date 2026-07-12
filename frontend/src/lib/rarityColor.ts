/**
 * Rarity → reveal accent color (dots, scale-pop, sparkles, finale label).
 *
 * Colors are the master-spec palette. We bucket the many pokemontcg.io rarity strings into six
 * tiers, mirroring the backend's `_TIER_RARITIES` groupings (backend/app/services/simulator.py)
 * so the tells line up with how the server rolled the hit. Illustration rares reuse the Ultra
 * Rare gold — the spec's six colors have no distinct illustration entry.
 */

export const RARITY_COLORS = {
  common: "#888780",
  uncommon: "#639922",
  rare: "#378ADD",
  holo: "#7F77DD",
  ultra: "#EF9F27",
  secret: "#D85A30",
} as const;

export type RarityTier = keyof typeof RARITY_COLORS;

const HOLO = new Set([
  "Rare Holo",
  "Rare Shining",
  "Rare Holo Star",
  "Rare Prime",
  "Rare BREAK",
  "LEGEND",
  "Classic Collection",
  "Black White Rare",
]);
const ULTRA = new Set([
  "Rare Ultra",
  "Ultra Rare",
  "Rare Holo EX",
  "Rare Holo GX",
  "Rare Holo V",
  "Rare Holo VMAX",
  "Rare Holo VSTAR",
  "Double Rare",
  "Rare Holo LV.X",
  "ACE SPEC Rare",
  "Rare ACE",
  "Rare Prism Star",
  "Amazing Rare",
  "Radiant Rare",
]);
const ILLUSTRATION = new Set([
  "Illustration Rare",
  "Special Illustration Rare",
  "Trainer Gallery Rare Holo",
]);
const SECRET = new Set([
  "Rare Secret",
  "Rare Rainbow",
  "Hyper Rare",
  "Mega Hyper Rare",
  "Rare Shiny",
  "Shiny Rare",
  "Rare Shiny GX",
  "Shiny Ultra Rare",
]);

const RANK: Record<RarityTier, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  holo: 3,
  ultra: 4,
  secret: 5,
};

export function rarityTier(rarity: string | null | undefined): RarityTier {
  if (!rarity) return "rare"; // unknown/promo landing in the hit slot → a modest rare tell
  const r = rarity.trim();
  if (r === "Common") return "common";
  if (r === "Uncommon") return "uncommon";
  if (r === "Rare") return "rare";
  if (HOLO.has(r)) return "holo";
  if (ULTRA.has(r) || ILLUSTRATION.has(r)) return "ultra";
  if (SECRET.has(r)) return "secret";
  return "rare";
}

export function rarityColor(rarity: string | null | undefined): string {
  return RARITY_COLORS[rarityTier(rarity)];
}

/** Rare-or-better gets a tell (pop + sparkles); commons/uncommons stay plain. */
export function hasTell(rarity: string | null | undefined): boolean {
  return RANK[rarityTier(rarity)] >= RANK.rare;
}

/** Sparkle particle count, scaled by rarity. 0 for common/uncommon (no burst). */
export function sparkleCount(rarity: string | null | undefined): number {
  const counts: Record<RarityTier, number> = {
    common: 0,
    uncommon: 0,
    rare: 6,
    holo: 10,
    ultra: 16,
    secret: 22,
  };
  return counts[rarityTier(rarity)];
}

/** Short label for the finale flash, e.g. "Ultra Rare pull!". */
export function rarityLabel(rarity: string | null | undefined): string {
  return rarity && rarity.trim() ? `${rarity} pull!` : "Rare pull!";
}
