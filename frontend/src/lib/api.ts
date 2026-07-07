/**
 * Minimal typed fetch client for the PokéVault backend.
 *
 * Reads the API base URL from VITE_API_URL and wraps fetch with JSON handling.
 * Expand with resource-specific helpers (cards, collection) as endpoints land.
 */

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api/v1";

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    // Spread init first so the merged headers below win instead of being clobbered.
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });

  if (!res.ok) {
    throw new Error(`API ${res.status}: ${res.statusText}`);
  }

  return (await res.json()) as T;
}

export function getHealth(): Promise<{ status: string }> {
  return apiFetch<{ status: string }>("/health");
}
