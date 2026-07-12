import { useSyncExternalStore } from "react";

/**
 * Local (this-browser) preference for masking the portfolio value on the Dashboard.
 *
 * Persisted in localStorage so it survives reloads and re-login on this device. Backed by
 * useSyncExternalStore + a module-level listener set, so every component that reads it stays
 * in sync when toggled anywhere (all instances hide/show together) — no provider needed.
 *
 * This is a personal display preference only; it is unrelated to any public/showcase
 * visibility. The masked value is never rendered into the DOM (callers substitute the mask
 * string), so the real number isn't sitting in the page text while hidden.
 */
const DEFAULT_KEY = "pv-hide-portfolio";
const listeners = new Set<() => void>();

function read(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Mask shown in place of the amount when hidden — reveals neither the value nor its magnitude. */
export const HIDDEN_MASK = "••••••";

/**
 * Masking preference for one monetary figure on the Dashboard, keyed by ``key`` so independent
 * figures (portfolio value, total spent) toggle separately. Defaults to the portfolio key.
 */
export function useHideValue(key: string = DEFAULT_KEY): { hidden: boolean; toggle: () => void } {
  const hidden = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => false, // server snapshot (client-only SPA; keeps the hook SSR-safe)
  );
  function toggle() {
    try {
      localStorage.setItem(key, read(key) ? "0" : "1");
    } catch {
      /* private mode / storage disabled — toggle is best-effort */
    }
    listeners.forEach((l) => l());
  }
  return { hidden, toggle };
}
