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

export interface CardVariant {
  variant: string; // normal | holofoil | reverseHolofoil | 1stEdition | …
  tcgplayer_usd: string | null; // TCGplayer market (USD)
  cardmarket_eur: string | null; // Cardmarket trend (EUR)
  diverges: boolean; // markets disagree beyond threshold → "verify edition"
}

export interface Card {
  id: string;
  set_id: string;
  number: string;
  name: string;
  rarity: string | null;
  image_url: string | null;
  prices: CardPrice[];
  variants: CardVariant[]; // per-printing two-market view (for the detail table)
  market_price: string | null; // canonical USD headline
  currency: string | null; // "USD" when market_price is set
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
  variant: string | null; // the printing owned; determines this copy's value
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
  variant?: string | null;
}

export interface CollectionEntryUpdate {
  quantity?: number;
  condition?: string | null;
  grade?: string | null;
}

export interface SetHolding {
  set_id: string;
  set_name: string;
  owned_quantity: number;
  distinct_cards_owned: number;
  set_size: number | null;
  market_value: string;
}

export interface CollectionSummary {
  total_quantity: number;
  total_distinct_cards: number;
  total_market_value: string;
  // "Total spent" — the user's manual override, or null when unset (tile shows an empty state).
  total_cost: string | null;
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
  message?: string | null;
}

// ---- decks (dream-deck builder) ----

export interface DeckCard {
  card_id: string;
  quantity: number;
  name: string;
  set_id: string;
  number: string;
  image_url: string | null;
  market_price: string | null; // unit price in USD (EUR converted); null if unpriced
  currency: string;
}

export interface Deck {
  id: number;
  name: string;
  target_size: number;
  created_at: string;
  card_count: number; // sum of card quantities
  total_value: string; // USD
  currency: string;
  cards: DeckCard[];
}

export interface DeckCreate {
  name: string;
  target_size: number;
}

export interface DeckUpdate {
  name?: string;
  target_size?: number;
}

export interface DeckCardCreate {
  card_id: string;
  quantity?: number;
}

// ---- pack simulator ----

export interface PulledCard {
  slot_kind: "common" | "uncommon" | "hit";
  tier: string; // the card's rarity label
  price_at_open: string | null; // frozen open-time value (matches what the vault later shows)
  card: Card;
}

export interface PackResult {
  open_id: string; // referenced by the keep step
  set_id: string;
  set_name: string;
  template: string;
  disclaimer: string;
  packs_remaining_today: number;
  cards: PulledCard[];
}

export interface KeepResult {
  kept: number;
  pulls: PackPull[];
}

export interface Quota {
  packs_remaining_today: number;
  daily_limit: number; // effective daily cap for the current user (override, else default)
}

// ---- virtual pull collection + leaderboard ----

export interface PackPull {
  id: number;
  card_id: string;
  name: string;
  set_id: string;
  number: string;
  image_url: string | null;
  rarity: string | null;
  variant: string | null; // the printing pulled; determines its value
  price_at_pull: string | null; // frozen at keep
  current_value: string | null; // live
  currency: string;
  pulled_at: string;
}

export type LeaderboardMode = "best_single" | "total_value";
export type LeaderboardWindow = "all_time" | "monthly" | "daily";

export interface PullLeaderboardEntry {
  rank: number;
  handle: string;
  score: string;
  showcase_public: boolean; // link the handle to /u/{handle} only when true
  pull_count?: number | null;
  card?: { card_id: string; name: string; set_id: string; image_url: string | null } | null;
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
  // Manual "Total spent" the user typed; null/undefined when unset.
  total_spent_override?: string | null;
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
}

export interface ImportConfirmResult {
  added: number;
  skipped: number;
}

// ---- public showcases ----

export interface PublicProfile {
  handle: string;
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
  grade: string | null; // e.g. "PSA 10"; public-safe display badge
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
  // Set a number to override Total spent; send null to clear back to the empty state.
  total_spent_override?: number | null;
}

// ---- showcase comments ----

export interface Comment {
  id: number;
  author_handle: string | null;
  body: string;
  created_at: string;
  can_delete: boolean;
}

export interface CommentList {
  comments: Comment[];
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

// ---- friends + direct messaging ----

export type FriendState = "none" | "pending_out" | "pending_in" | "friends" | "blocked" | "self";

export interface FriendUser {
  user_id: string;
  handle: string | null;
  is_public: boolean;
}

export interface FriendRequest {
  id: number;
  user: FriendUser;
  direction: "incoming" | "outgoing";
  created_at: string;
}

export interface ConversationSummary {
  id: number;
  other: FriendUser;
  last_message: { body: string; created_at: string; sender_is_me: boolean } | null;
  unread_count: number;
}

export interface DirectMessage {
  id: number;
  sender_is_me: boolean;
  body: string;
  created_at: string;
  read_at: string | null;
}

export interface ConversationDetail {
  id: number;
  other: FriendUser;
  messages: DirectMessage[];
}
