import { useLocation } from "react-router-dom";

/**
 * Fixed, decorative Pokémon-themed ambient background rendered behind all content.
 *
 * Always on (no picker/persistence). Each top-level route gets its own type-flavored palette
 * so pages feel varied; everything is abstract (soft type-color glows + faint Poké Ball
 * silhouettes) — no character art or logos. Purely CSS/SVG and `pointer-events: none`, so it
 * never intercepts clicks and stays cheap on data-heavy pages. Motion is disabled under
 * `prefers-reduced-motion` (see index.css). Content sits on solid surfaces above this layer,
 * so contrast is never reduced.
 */
const PALETTES: Record<string, string> = {
  "/": "electric",
  "/catalog": "water",
  "/collection": "grass",
  "/wishlist": "psychic",
  "/deck": "fire",
  "/simulator": "gold",
  "/pulls": "psychic",
  "/leaderboard": "gold",
  "/scan": "steel",
};

function paletteFor(pathname: string): string {
  if (pathname === "/") return "electric";
  const top = "/" + (pathname.split("/")[1] ?? "");
  return PALETTES[top] ?? "water";
}

function Pokeball({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <circle cx="50" cy="50" r="46" stroke="currentColor" strokeWidth="3.5" />
      <line x1="4" y1="50" x2="96" y2="50" stroke="currentColor" strokeWidth="3.5" />
      <circle cx="50" cy="50" r="14" stroke="currentColor" strokeWidth="3.5" />
      <circle cx="50" cy="50" r="5" fill="currentColor" />
    </svg>
  );
}

export function AmbientBackground() {
  const { pathname } = useLocation();
  return (
    <div className="pv-bg" data-palette={paletteFor(pathname)} aria-hidden="true">
      <div className="pv-glow pv-glow-1" />
      <div className="pv-glow pv-glow-2" />
      <div className="pv-glow pv-glow-3" />
      <Pokeball className="pv-ball pv-ball-1" />
      <Pokeball className="pv-ball pv-ball-2" />
    </div>
  );
}
