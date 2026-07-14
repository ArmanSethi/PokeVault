import { supabase } from "./supabase";
import type {
  Alert,
  Card,
  CardPriceHistory,
  CardSet,
  CardSort,
  CollectionEntry,
  CollectionEntryCreate,
  CollectionEntryUpdate,
  CollectionSummary,
  Comment,
  CommentList,
  Deck,
  DeckCardCreate,
  DeckCreate,
  DeckUpdate,
  ImportConfirmResult,
  ImportConfirmRow,
  ImportPreview,
  KeepResult,
  LeaderboardMode,
  LeaderboardWindow,
  PackPull,
  PackResult,
  PortfolioValueSeries,
  Quota,
  PullLeaderboardEntry,
  ProfileUpdate,
  PublicCollection,
  PublicProfile,
  ScanResult,
  User,
  WishlistItem,
  WishlistItemCreate,
  FriendUser,
  FriendRequest,
  FriendState,
  ConversationSummary,
  ConversationDetail,
  DirectMessage,
} from "../types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api/v1";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  { auth = false }: { auth?: boolean } = {},
): Promise<T> {
  const isJsonBody = Boolean(init.body) && !(init.body instanceof FormData);
  const headers: Record<string, string> = {
    ...(isJsonBody ? { "Content-Type": "application/json" } : {}),
    ...(init.headers as Record<string, string> | undefined),
    ...(auth ? await authHeader() : {}),
  };

  let resp: Response;
  try {
    resp = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "Network error — is the backend running?");
  }

  if (!resp.ok) {
    let detail = `${resp.status} ${resp.statusText}`;
    try {
      const body = await resp.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(resp.status, detail);
  }

  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const api = {
  health: () => request<{ status: string }>("/health"),

  // ---- catalog (public) ----
  listSets: (params: { q?: string; limit?: number; offset?: number } = {}) =>
    request<CardSet[]>(`/sets${qs(params)}`),
  getSet: (id: string) => request<CardSet>(`/sets/${encodeURIComponent(id)}`),
  listCards: (
    params: {
      set_id?: string;
      q?: string;
      rarity?: string;
      sort?: CardSort;
      limit?: number;
      offset?: number;
    } = {},
  ) => request<Card[]>(`/cards${qs(params)}`),
  listRarities: () => request<string[]>("/cards/rarities"),
  getCard: (id: string) => request<Card>(`/cards/${encodeURIComponent(id)}`),
  refreshCardPrices: (id: string) =>
    request<Card>(`/cards/${encodeURIComponent(id)}/refresh`, { method: "POST" }, { auth: true }),
  cardHistory: (id: string, params: { variant?: string; days?: number } = {}) =>
    request<CardPriceHistory>(`/cards/${encodeURIComponent(id)}/history${qs(params)}`),

  // ---- auth / profile ----
  me: () => request<User>("/me", {}, { auth: true }),
  updateProfile: (data: ProfileUpdate) =>
    request<User>("/me", { method: "PATCH", body: JSON.stringify(data) }, { auth: true }),

  // ---- public showcases (no auth) ----
  publicProfile: (handle: string) =>
    request<PublicProfile>(`/public/u/${encodeURIComponent(handle)}`),
  publicCollection: (handle: string) =>
    request<PublicCollection>(`/public/u/${encodeURIComponent(handle)}/collection`),

  // ---- showcase comments ----
  listComments: (handle: string) =>
    request<CommentList>(`/public/u/${encodeURIComponent(handle)}/comments`, {}, { auth: true }),
  addComment: (handle: string, body: string) =>
    request<Comment>(
      `/public/u/${encodeURIComponent(handle)}/comments`,
      { method: "POST", body: JSON.stringify({ body }) },
      { auth: true },
    ),
  deleteComment: (handle: string, id: number) =>
    request<void>(
      `/public/u/${encodeURIComponent(handle)}/comments/${id}`,
      { method: "DELETE" },
      { auth: true },
    ),

  // ---- collection (auth) ----
  listCollection: () => request<CollectionEntry[]>("/collection", {}, { auth: true }),
  addEntry: (data: CollectionEntryCreate) =>
    request<CollectionEntry>(
      "/collection",
      { method: "POST", body: JSON.stringify(data) },
      { auth: true },
    ),
  updateEntry: (id: number, data: CollectionEntryUpdate) =>
    request<CollectionEntry>(
      `/collection/${id}`,
      { method: "PATCH", body: JSON.stringify(data) },
      { auth: true },
    ),
  deleteEntry: (id: number) =>
    request<void>(`/collection/${id}`, { method: "DELETE" }, { auth: true }),
  summary: () => request<CollectionSummary>("/collection/summary", {}, { auth: true }),
  portfolioHistory: (params: { days?: number } = {}) =>
    request<PortfolioValueSeries>(`/collection/history${qs(params)}`, {}, { auth: true }),

  // ---- wishlist + alerts (auth) ----
  listWishlist: () => request<WishlistItem[]>("/wishlist", {}, { auth: true }),
  addWishlist: (data: WishlistItemCreate) =>
    request<WishlistItem>(
      "/wishlist",
      { method: "POST", body: JSON.stringify(data) },
      { auth: true },
    ),
  deleteWishlist: (id: number) =>
    request<void>(`/wishlist/${id}`, { method: "DELETE" }, { auth: true }),
  listAlerts: () => request<Alert[]>("/wishlist/alerts", {}, { auth: true }),

  // ---- pack simulator (auth) ----
  openPack: (setId: string) =>
    request<PackResult>(
      "/simulator/open",
      { method: "POST", body: JSON.stringify({ set_id: setId }) },
      { auth: true },
    ),
  // Server-authoritative keep: name the open + the subset of its rolled cards to keep.
  keepFromOpen: (openId: string, keptCardIds: string[]) =>
    request<KeepResult>(
      "/simulator/keep",
      { method: "POST", body: JSON.stringify({ open_id: openId, kept_card_ids: keptCardIds }) },
      { auth: true },
    ),
  simulatorQuota: () => request<Quota>("/simulator/quota", {}, { auth: true }),

  // ---- virtual vault + leaderboard ----
  listPulls: () => request<PackPull[]>("/simulator/vault", {}, { auth: true }),
  pullLeaderboard: (mode: LeaderboardMode, window: LeaderboardWindow) =>
    request<PullLeaderboardEntry[]>(`/simulator/leaderboard${qs({ mode, window })}`),

  // ---- decks (auth) ----
  listDecks: () => request<Deck[]>("/decks", {}, { auth: true }),
  createDeck: (data: DeckCreate) =>
    request<Deck>("/decks", { method: "POST", body: JSON.stringify(data) }, { auth: true }),
  updateDeck: (id: number, data: DeckUpdate) =>
    request<Deck>(`/decks/${id}`, { method: "PATCH", body: JSON.stringify(data) }, { auth: true }),
  deleteDeck: (id: number) => request<void>(`/decks/${id}`, { method: "DELETE" }, { auth: true }),
  addDeckCard: (deckId: number, data: DeckCardCreate) =>
    request<Deck>(
      `/decks/${deckId}/cards`,
      { method: "POST", body: JSON.stringify(data) },
      { auth: true },
    ),
  updateDeckCard: (deckId: number, cardId: string, quantity: number) =>
    request<Deck>(
      `/decks/${deckId}/cards/${encodeURIComponent(cardId)}`,
      { method: "PATCH", body: JSON.stringify({ quantity }) },
      { auth: true },
    ),
  removeDeckCard: (deckId: number, cardId: string) =>
    request<Deck>(
      `/decks/${deckId}/cards/${encodeURIComponent(cardId)}`,
      { method: "DELETE" },
      { auth: true },
    ),

  // ---- scan ----
  scan: (file: File, limit = 5) => {
    const form = new FormData();
    form.append("file", file);
    return request<ScanResult>(
      `/scan${qs({ limit })}`,
      { method: "POST", body: form },
      { auth: true },
    );
  },

  // ---- import / export ----
  importPreview: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<ImportPreview>(
      "/collection/import",
      { method: "POST", body: form },
      { auth: true },
    );
  },
  importConfirm: (rows: ImportConfirmRow[]) =>
    request<ImportConfirmResult>(
      "/collection/import/confirm",
      { method: "POST", body: JSON.stringify({ rows }) },
      { auth: true },
    ),
  exportCollection: async (): Promise<Blob> => {
    const resp = await fetch(`${API_URL}/collection/export`, { headers: await authHeader() });
    if (!resp.ok) throw new ApiError(resp.status, `Export failed (${resp.status})`);
    return resp.blob();
  },

  // ---- friends + blocks (auth) ----
  requestFriend: (handle: string) =>
    request<{ ok: boolean }>(
      "/friends/request",
      { method: "POST", body: JSON.stringify({ handle }) },
      { auth: true },
    ),
  acceptFriendRequest: (id: number) =>
    request<void>(`/friends/requests/${id}/accept`, { method: "POST" }, { auth: true }),
  declineFriendRequest: (id: number) =>
    request<void>(`/friends/requests/${id}/decline`, { method: "POST" }, { auth: true }),
  listFriends: () => request<FriendUser[]>("/friends", {}, { auth: true }),
  listFriendRequests: () => request<FriendRequest[]>("/friends/requests", {}, { auth: true }),
  friendState: (handle: string) =>
    request<{ state: FriendState; user_id: string | null }>(
      `/friends/state/${encodeURIComponent(handle)}`,
      {},
      { auth: true },
    ),
  unfriend: (userId: string) =>
    request<void>(`/friends/${userId}`, { method: "DELETE" }, { auth: true }),
  blockUser: (userId: string) =>
    request<void>(`/friends/${userId}/block`, { method: "POST" }, { auth: true }),
  unblockUser: (userId: string) =>
    request<void>(`/friends/${userId}/block`, { method: "DELETE" }, { auth: true }),

  // ---- direct messages (auth); manual-refresh only ----
  startConversation: (friendUserId: string) =>
    request<{ conversation_id: number }>(
      "/messages/start",
      { method: "POST", body: JSON.stringify({ friend_user_id: friendUserId }) },
      { auth: true },
    ),
  listConversations: () =>
    request<ConversationSummary[]>("/messages/conversations", {}, { auth: true }),
  getConversation: (id: number) =>
    request<ConversationDetail>(`/messages/conversations/${id}`, {}, { auth: true }),
  sendMessage: (id: number, body: string) =>
    request<DirectMessage>(
      `/messages/conversations/${id}`,
      { method: "POST", body: JSON.stringify({ body }) },
      { auth: true },
    ),
  unreadCount: () => request<{ unread: number }>("/messages/unread_count", {}, { auth: true }),
};
