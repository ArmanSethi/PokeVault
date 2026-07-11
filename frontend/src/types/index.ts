// TypeScript mirrors of the backend Pydantic schemas (app/schemas/*).
// Money fields arrive as JSON strings (Pydantic Decimal); parse with Number() at display.

export interface CardPrice {
  source: string;
  variant: string;
  low: string | null;
  mid: string | null;
  high: string | null;
  market: string | null;
  direct_low: string | null;
  currency: string;
  updated_at: string;
}

export interface Card {
  id: string;
  set_id: string;
  number: string;
  name: string;
  rarity: string | null;
  image_url: string | null;
  prices: CardPrice[];
  market_price: string | null;
  currency: string | null;
}

export type CardSort = "number" | "name" | "rarity" | "price_desc" | "price_asc";

export interface CardSet {
  id: string;
  name: string;
  series: string | null;
  release_date: string | null;
  printed_total: number | null;
  total: number | null;
  ptcgo_code: string | null;
  symbol_url: string | null;
  logo_url: string | null;
}

export interface CollectionEntry {
  id: number;
  card_id: string;
  quantity: number;
  condition: string | null;
  grade: string | null;
  is_foil: boolean;
  acquired_price: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  market_price: string | null; // grade-adjusted unit value
  market_value: string | null;
  grade_multiplier: number; // 1.0 = raw; e.g. 4.0 for PSA 10
}

export interface CollectionEntryCreate {
  card_id: string;
  quantity?: number;
  condition?: string | null;
  grade?: string | null;
  is_foil?: boolean;
  acquired_price?: number | null;
  notes?: string | null;
}

export interface CollectionEntryUpdate {
  quantity?: number;
  condition?: string | null;
  grade?: string | null;
  acquired_price?: number | null;
  notes?: string | null;
}

export interface SetHolding {
  set_id: string;
  set_name: string;
  owned_quantity: number;
  distinct_cards_owned: number;
  set_size: number | null;
  completion_pct: number;
  market_value: string;
}

export interface CollectionSummary {
  total_quantity: number;
  total_distinct_cards: number;
  total_market_value: string;
  total_cost: string;
  currency: string;
  sets: SetHolding[];
}

export interface PriceHistoryPoint {
  date: string;
  market_price: string | null;
}

export interface CardPriceHistory {
  card_id: string;
  source: string;
  variant: string | null;
  currency: string;
  points: PriceHistoryPoint[];
}

export interface PortfolioValuePoint {
  date: string;
  total_value: string;
}

export interface PortfolioValueSeries {
  currency: string;
  points: PortfolioValuePoint[];
}

export interface ScanCandidate {
  card_id: string;
  name: string;
  set_id: string;
  number: string;
  image_url: string | null;
  market_price: string | null;
  currency: string | null;
  confidence: number;
}

export interface ScanResult {
  detected_name: string | null;
  detected_number: string | null;
  candidates: ScanCandidate[];
}

export interface User {
  id: string;
  email: string | null;
  handle?: string | null;
  is_public?: boolean;
  show_value_on_leaderboard?: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  handle: string;
  card_count: number;
  value_usd: string | null; // null when the user hides it
  value_hidden: boolean;
}

// ---- import / export ----

export type ImportRowStatus = "matched" | "ambiguous" | "unmatched";

export interface ImportCandidate {
  card_id: string;
  name: string;
  set_id: string;
  number: string;
  image_url: string | null;
  confidence: number;
}

export interface ImportRow {
  row_index: number;
  name: string | null;
  number: string | null;
  set_name: string | null;
  quantity: number;
  condition: string | null;
  is_foil: boolean;
  acquired_price: string | null;
  status: ImportRowStatus;
  candidates: ImportCandidate[];
  selected_card_id: string | null;
}

export interface ImportPreview {
  rows: ImportRow[];
  matched: number;
  ambiguous: number;
  unmatched: number;
  total: number;
}

export interface ImportConfirmRow {
  card_id: string;
  quantity?: number;
  condition?: string | null;
  is_foil?: boolean;
  acquired_price?: number | null;
  notes?: string | null;
}

export interface ImportConfirmResult {
  added: number;
  skipped: number;
}

// ---- public showcases ----

export interface PublicProfile {
  handle: string;
  level: number;
  total_distinct_cards: number;
  total_quantity: number;
  total_market_value: string;
  currency: string;
  sets_completed: number;
  sets: SetHolding[];
}

export interface PublicEntry {
  card_id: string;
  name: string;
  set_id: string;
  number: string;
  image_url: string | null;
  rarity: string | null;
  is_foil: boolean;
  quantity: number;
  market_price: string | null;
  market_value: string | null;
}

export interface PublicCollection {
  handle: string;
  entries: PublicEntry[];
}

export interface ProfileUpdate {
  handle?: string | null;
  is_public?: boolean | null;
  show_value_on_leaderboard?: boolean | null;
}

// ---- gamification ----

export interface Badge {
  id: string;
  label: string;
  description: string;
  icon: string;
  earned: boolean;
}

export interface Streak {
  current_streak: number;
  longest_streak: number;
  last_active_date: string | null;
}

export interface Achievements {
  level: number;
  xp: number;
  xp_into_level: number;
  xp_for_next: number;
  badges: Badge[];
  streak: Streak;
}

// ---- wishlist + alerts ----

export interface WishlistItem {
  id: number;
  card_id: string;
  target_price: string | null;
  created_at: string;
  name: string;
  set_id: string;
  number: string;
  image_url: string | null;
  market_price: string | null;
  currency: string | null;
}

export interface WishlistItemCreate {
  card_id: string;
  target_price?: number | null;
}

export interface Alert {
  id: number;
  card_id: string;
  kind: "target_hit" | "drop";
  triggered_price: string | null;
  target_price: string | null;
  snapshot_date: string;
  name: string | null;
}
