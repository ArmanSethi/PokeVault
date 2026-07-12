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
const KEY = "pv-hide-portfolio";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
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

export function useHideValue(): { hidden: boolean; toggle: () => void } {
  const hidden = useSyncExternalStore(
    subscribe,
    read,
    () => false, // server snapshot (client-only SPA; keeps the hook SSR-safe)
  );
  function toggle() {
    try {
      localStorage.setItem(KEY, read() ? "0" : "1");
    } catch {
      /* private mode / storage disabled — toggle is best-effort */
    }
    listeners.forEach((l) => l());
  }
  return { hidden, toggle };
}
