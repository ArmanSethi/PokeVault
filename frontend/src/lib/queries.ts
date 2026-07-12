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
  DeckCardCreate,
  DeckCreate,
  DeckUpdate,
  ImportConfirmRow,
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
          // Transient optimistic merge (server response reconciles on settle); cast because
          // the update DTO types acquired_price as number while the entry stores a string.
          prev.map((e) => (e.id === id ? ({ ...e, ...data } as CollectionEntry) : e)),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.me }),
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

export function useLeaderboard() {
  return useQuery({
    queryKey: ["leaderboard"],
    queryFn: () => api.leaderboard(),
    staleTime: 60 * 1000,
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
    mutationFn: ({ deckId, cardId, quantity }: { deckId: number; cardId: string; quantity: number }) =>
      api.updateDeckCard(deckId, cardId, quantity),
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
