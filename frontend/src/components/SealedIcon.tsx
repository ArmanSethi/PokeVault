import type { ReactNode } from "react";
import type { ProductType } from "../types";

/**
 * Original, app-styled line icons for each sealed product type. Deliberately generic (no
 * copyrighted product photography) — a pack pouch, a booster box, an ETB with an emblem, a
 * bundle (stacked items), and an "other" box. They inherit color via `currentColor` and size via
 * `className`, matching the app's inline-SVG convention.
 */
const PATHS: Record<ProductType, ReactNode> = {
  pack: (
    <>
      <rect x="7" y="4" width="10" height="16" rx="1.5" />
      <path d="M7 8h10" />
      <path d="M12 5.25v1.5" />
    </>
  ),
  booster_box: (
    <>
      <rect x="4" y="6" width="16" height="13" rx="1.5" />
      <path d="M4 10.5h16" />
      <path d="M12 6v4.5" />
    </>
  ),
  etb: (
    <>
      <rect x="5" y="5" width="14" height="15" rx="1.5" />
      <path d="M5 9.5h14" />
      <circle cx="12" cy="14.5" r="2.5" />
    </>
  ),
  bundle: (
    <>
      <rect x="4" y="9" width="11" height="11" rx="1" />
      <path d="M8 9V6a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-3" />
    </>
  ),
  other: (
    <>
      <rect x="4" y="6" width="16" height="13" rx="1.5" />
      <circle cx="9.5" cy="12.5" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12.5" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="12.5" r="0.8" fill="currentColor" stroke="none" />
    </>
  ),
};

export function SealedIcon({ type, className }: { type: ProductType; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {PATHS[type]}
    </svg>
  );
}
