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
  market_price: string | null;
  market_value: string | null;
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
