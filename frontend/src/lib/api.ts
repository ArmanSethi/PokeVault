import { supabase } from "./supabase";
import type {
  Card,
  CardPriceHistory,
  CardSet,
  CardSort,
  CollectionEntry,
  CollectionEntryCreate,
  CollectionEntryUpdate,
  CollectionSummary,
  ImportConfirmResult,
  ImportConfirmRow,
  ImportPreview,
  PortfolioValueSeries,
  ProfileUpdate,
  PublicCollection,
  PublicProfile,
  ScanResult,
  User,
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
};
