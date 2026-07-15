import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "./api";
import type {
  CardSort,
  CollectionEntry,
  CollectionEntryCreate,
  CollectionEntryUpdate,
  CollectionSummary,
  SealedItemCreate,
  SealedItemUpdate,
  DeckCardCreate,
  DeckCreate,
  DeckUpdate,
  ImportConfirmRow,
  LeaderboardMode,
  LeaderboardWindow,
  ProfileUpdate,
  WishlistItemCreate,
} from "../types";

interface CardsParams {
  set_id?: string;
  q?: string;
  rarity?: string;
  sort?: CardSort;
  limit?: number;
  offset?: number;
}

/** Stable query keys so mutations can invalidate precisely. */
export const qk = {
  sets: ["sets"] as const,
  rarities: ["rarities"] as const,
  cards: (p: CardsParams) => ["cards", p] as const,
  card: (id: string) => ["card", id] as const,
  cardHistory: (id: string) => ["cardHistory", id] as const,
  collection: ["collection"] as const,
  sealed: ["sealed"] as const,
  summary: ["summary"] as const,
  portfolioHistory: ["portfolioHistory"] as const,
  me: ["me"] as const,
  wishlist: ["wishlist"] as const,
  alerts: ["alerts"] as const,
  publicProfile: (handle: string) => ["publicProfile", handle] as const,
  publicCollection: (handle: string) => ["publicCollection", handle] as const,
};

// ---- catalog (long-lived cache) ----

const SETS_PAGE = 250; // backend /sets caps limit at 500; page well under it and never truncate

export function useSets() {
  return useQuery({
    queryKey: qk.sets,
    queryFn: async () => {
      const all: Awaited<ReturnType<typeof api.listSets>> = [];
      for (let offset = 0; ; offset += SETS_PAGE) {
        const page = await api.listSets({ limit: SETS_PAGE, offset });
        all.push(...page);
        if (page.length < SETS_PAGE) break;
      }
      return all;
    },
  });
}

export function useSet(id: string) {
  return useQuery({
    queryKey: ["set", id],
    queryFn: () => api.getSet(id),
    enabled: Boolean(id),
    staleTime: 5 * 60 * 1000,
  });
}

export function useRarities() {
  return useQuery({
    queryKey: qk.rarities,
    queryFn: () => api.listRarities(),
    staleTime: Infinity,
  });
}

export function useCards(params: CardsParams) {
  return useQuery({
    queryKey: qk.cards(params),
    queryFn: () => api.listCards(params),
    placeholderData: keepPreviousData, // keep old rows visible while filters change
  });
}

// Backend caps `limit` at 250 per request; some sets exceed that (e.g. swshp has 304 cards),
// so fetch a whole set by paging through with the max allowed page size.
const SET_PAGE = 250;

/** Load *all* cards in a set (paged within the server's per-request cap). */
export function useAllSetCards(setId: string) {
  return useQuery({
    queryKey: ["allSetCards", setId],
    enabled: Boolean(setId),
    staleTime: 5 * 60 * 1000, // catalog is effectively static
    queryFn: async () => {
      const all: Awaited<ReturnType<typeof api.listCards>> = [];
      for (let offset = 0; ; offset += SET_PAGE) {
        const page = await api.listCards({
          set_id: setId,
          sort: "number",
          limit: SET_PAGE,
          offset,
        });
        all.push(...page);
        if (page.length < SET_PAGE) break; // last (short) page reached
      }
      return all;
    },
  });
}

const CATALOG_PAGE = 24;

/** Paginated catalog browse with "load more" (offset-based). */
export function useInfiniteCards(filters: Omit<CardsParams, "limit" | "offset">) {
  return useInfiniteQuery({
    queryKey: ["cards-infinite", filters],
    queryFn: ({ pageParam }) =>
      api.listCards({ ...filters, limit: CATALOG_PAGE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === CATALOG_PAGE ? allPages.length * CATALOG_PAGE : undefined,
    placeholderData: keepPreviousData,
  });
}

export function useCard(id: string) {
  return useQuery({ queryKey: qk.card(id), queryFn: () => api.getCard(id), enabled: Boolean(id) });
}

/** Manual "refresh price" for one card (rate-limited server-side). Updates the card cache and
 * invalidates its price-history series on success. */
export function useRefreshCard(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.refreshCardPrices(id),
    onSuccess: (card) => {
      qc.setQueryData(qk.card(id), card);
      qc.invalidateQueries({ queryKey: qk.cardHistory(id) });
    },
  });
}

export function useCardHistory(id: string) {
  return useQuery({
    queryKey: qk.cardHistory(id),
    queryFn: () => api.cardHistory(id),
    enabled: Boolean(id),
  });
}

/** Resolve card names for a set of ids, reusing the shared card cache (no N+1 refetch). */
export function useCardNames(ids: string[]): Record<string, string> {
  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: qk.card(id),
      queryFn: () => api.getCard(id),
      staleTime: 5 * 60 * 1000,
    })),
  });
  const names: Record<string, string> = {};
  results.forEach((r, i) => {
    if (r.data) names[ids[i]] = r.data.name;
  });
  return names;
}

/** Resolve card image URLs for a set of ids, reusing the same cached getCard queries as
 * useCardNames (no extra requests). Used by the collection grid view. */
export function useCardImages(ids: string[]): Record<string, string | null> {
  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: qk.card(id),
      queryFn: () => api.getCard(id),
      staleTime: 5 * 60 * 1000,
    })),
  });
  const images: Record<string, string | null> = {};
  results.forEach((r, i) => {
    if (r.data) images[ids[i]] = r.data.image_url ?? null;
  });
  return images;
}

// ---- collection (fresh, auth) ----

export function useCollection() {
  return useQuery({ queryKey: qk.collection, queryFn: () => api.listCollection(), staleTime: 0 });
}

export function useSummary() {
  return useQuery({ queryKey: qk.summary, queryFn: () => api.summary(), staleTime: 0 });
}

// ---- sealed products ----

export function useSealedItems() {
  return useQuery({ queryKey: qk.sealed, queryFn: () => api.listSealed(), staleTime: 0 });
}

function invalidateSealed(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: qk.sealed });
}

export function useAddSealed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SealedItemCreate) => api.addSealed(data),
    onSuccess: () => invalidateSealed(qc),
  });
}

export function useUpdateSealed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: SealedItemUpdate }) =>
      api.updateSealed(id, data),
    onSuccess: () => invalidateSealed(qc),
  });
}

export function useDeleteSealed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteSealed(id),
    onSuccess: () => invalidateSealed(qc),
  });
}

export function usePortfolioHistory() {
  return useQuery({ queryKey: qk.portfolioHistory, queryFn: () => api.portfolioHistory() });
}

function invalidateCollection(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: qk.collection });
  qc.invalidateQueries({ queryKey: qk.summary });
  qc.invalidateQueries({ queryKey: qk.portfolioHistory });
}

export function useAddEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CollectionEntryCreate) => api.addEntry(data),
    onSuccess: () => invalidateCollection(qc),
  });
}

export function useUpdateEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: CollectionEntryUpdate }) =>
      api.updateEntry(id, data),
    // Optimistic: reflect qty/field edits instantly, roll back on error.
    onMutate: async ({ id, data }) => {
      await qc.cancelQueries({ queryKey: qk.collection });
      const prev = qc.getQueryData<CollectionEntry[]>(qk.collection);
      if (prev) {
        qc.setQueryData<CollectionEntry[]>(
          qk.collection,
          // Transient optimistic merge; the server response reconciles on settle.
          prev.map((e) => (e.id === id ? { ...e, ...data } : e)),
        );
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.collection, ctx.prev);
    },
    onSettled: () => invalidateCollection(qc),
  });
}

// ---- profile + public showcases ----

export function useMe() {
  return useQuery({ queryKey: qk.me, queryFn: () => api.me() });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ProfileUpdate) => api.updateProfile(data),
    onSuccess: (user) => {
      qc.invalidateQueries({ queryKey: qk.me });
      // Reflect the new Total spent IMMEDIATELY: the tile reads summary.total_cost, and the
      // /collection/summary refetch over the pooler can lag a second (which looked like "not
      // updating"). Patch the cached value from the PATCH's returned user, then reconcile.
      qc.setQueryData<CollectionSummary>(qk.summary, (old) =>
        old ? { ...old, total_cost: user.total_spent_override ?? null } : old,
      );
      qc.invalidateQueries({ queryKey: qk.summary });
    },
  });
}

export function usePublicProfile(handle: string) {
  return useQuery({
    queryKey: qk.publicProfile(handle),
    queryFn: () => api.publicProfile(handle),
    enabled: Boolean(handle),
    retry: false,
  });
}

export function usePublicCollection(handle: string) {
  return useQuery({
    queryKey: qk.publicCollection(handle),
    queryFn: () => api.publicCollection(handle),
    enabled: Boolean(handle),
    retry: false,
  });
}

// ---- wishlist + alerts ----

export function useWishlist() {
  return useQuery({ queryKey: qk.wishlist, queryFn: () => api.listWishlist(), staleTime: 0 });
}

export function useAlerts() {
  return useQuery({ queryKey: qk.alerts, queryFn: () => api.listAlerts() });
}

export function useAddWishlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: WishlistItemCreate) => api.addWishlist(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.wishlist }),
  });
}

export function useDeleteWishlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteWishlist(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.wishlist }),
  });
}

// ---- decks (dream-deck builder) ----

export function useDecks() {
  return useQuery({ queryKey: ["decks"], queryFn: () => api.listDecks(), staleTime: 0 });
}

function invalidateDecks(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["decks"] });
}

export function useCreateDeck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: DeckCreate) => api.createDeck(data),
    onSuccess: () => invalidateDecks(qc),
  });
}

export function useUpdateDeck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: DeckUpdate }) => api.updateDeck(id, data),
    onSuccess: () => invalidateDecks(qc),
  });
}

export function useDeleteDeck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteDeck(id),
    onSuccess: () => invalidateDecks(qc),
  });
}

export function useAddDeckCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ deckId, data }: { deckId: number; data: DeckCardCreate }) =>
      api.addDeckCard(deckId, data),
    onSuccess: () => invalidateDecks(qc),
  });
}

export function useUpdateDeckCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      deckId,
      cardId,
      quantity,
    }: {
      deckId: number;
      cardId: string;
      quantity: number;
    }) => api.updateDeckCard(deckId, cardId, quantity),
    onSuccess: () => invalidateDecks(qc),
  });
}

export function useRemoveDeckCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ deckId, cardId }: { deckId: number; cardId: string }) =>
      api.removeDeckCard(deckId, cardId),
    onSuccess: () => invalidateDecks(qc),
  });
}

// ---- showcase comments ----

export function useComments(handle: string) {
  return useQuery({
    queryKey: ["comments", handle],
    queryFn: () => api.listComments(handle),
    enabled: Boolean(handle),
    staleTime: 0,
  });
}

export function useAddComment(handle: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => api.addComment(handle, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comments", handle] }),
  });
}

export function useDeleteComment(handle: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteComment(handle, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comments", handle] }),
  });
}

// ---- pack simulator ----

export function useOpenPack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (setId: string) => api.openPack(setId),
    // Opening consumes quota — refresh the standalone quota query.
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sim-quota"] }),
  });
}

export function useQuota() {
  return useQuery({
    queryKey: ["sim-quota"],
    queryFn: () => api.simulatorQuota(),
    staleTime: 0,
  });
}

// ---- virtual vault + leaderboard ----

export function useKeepFromOpen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ openId, keptCardIds }: { openId: string; keptCardIds: string[] }) =>
      api.keepFromOpen(openId, keptCardIds),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pulls"] }),
  });
}

export function usePulls() {
  return useQuery({ queryKey: ["pulls"], queryFn: () => api.listPulls(), staleTime: 0 });
}

export function usePullLeaderboard(mode: LeaderboardMode, window: LeaderboardWindow) {
  return useQuery({
    queryKey: ["pull-leaderboard", mode, window],
    queryFn: () => api.pullLeaderboard(mode, window),
    staleTime: 30 * 1000,
  });
}

export function useImportPreview() {
  return useMutation({ mutationFn: (file: File) => api.importPreview(file) });
}

export function useConfirmImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rows: ImportConfirmRow[]) => api.importConfirm(rows),
    onSuccess: () => invalidateCollection(qc),
  });
}

// ---- friends + direct messaging (manual refresh; no polling/websockets) ----

export function useFriends() {
  return useQuery({ queryKey: ["friends"], queryFn: () => api.listFriends(), staleTime: 30_000 });
}

export function useFriendRequests() {
  return useQuery({
    queryKey: ["friend-requests"],
    queryFn: () => api.listFriendRequests(),
    staleTime: 0,
  });
}

export function useFriendState(handle: string, enabled = true) {
  return useQuery({
    queryKey: ["friend-state", handle],
    queryFn: () => api.friendState(handle),
    enabled: enabled && Boolean(handle),
    staleTime: 0,
    retry: false,
  });
}

export function useConversations() {
  return useQuery({
    queryKey: ["conversations"],
    queryFn: () => api.listConversations(),
    staleTime: 0,
  });
}

export function useConversation(id: number | null) {
  return useQuery({
    queryKey: ["conversation", id],
    queryFn: () => api.getConversation(id as number),
    enabled: id != null,
    staleTime: 0,
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: ["unread-count"],
    queryFn: () => api.unreadCount(),
    staleTime: 0,
  });
}

function invalidateSocial(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["friends"] });
  qc.invalidateQueries({ queryKey: ["friend-requests"] });
  qc.invalidateQueries({ queryKey: ["friend-state"] });
  qc.invalidateQueries({ queryKey: ["conversations"] });
  qc.invalidateQueries({ queryKey: ["unread-count"] });
}

export function useRequestFriend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (handle: string) => api.requestFriend(handle),
    onSuccess: () => invalidateSocial(qc),
  });
}

export function useAcceptRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.acceptFriendRequest(id),
    onSuccess: () => invalidateSocial(qc),
  });
}

export function useDeclineRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.declineFriendRequest(id),
    onSuccess: () => invalidateSocial(qc),
  });
}

export function useUnfriend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.unfriend(userId),
    onSuccess: () => invalidateSocial(qc),
  });
}

export function useBlockUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.blockUser(userId),
    onSuccess: () => invalidateSocial(qc),
  });
}

export function useUnblockUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.unblockUser(userId),
    onSuccess: () => invalidateSocial(qc),
  });
}

export function useStartConversation() {
  return useMutation({
    mutationFn: (friendUserId: string) => api.startConversation(friendUserId),
  });
}

export function useSendMessage(conversationId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => api.sendMessage(conversationId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversation", conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["unread-count"] });
    },
  });
}

export function useDeleteEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteEntry(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: qk.collection });
      const prev = qc.getQueryData<CollectionEntry[]>(qk.collection);
      if (prev)
        qc.setQueryData<CollectionEntry[]>(
          qk.collection,
          prev.filter((e) => e.id !== id),
        );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.collection, ctx.prev);
    },
    onSettled: () => invalidateCollection(qc),
  });
}
