import { NavLink, Outlet } from "react-router-dom";
import { toggleMuted, useMuted } from "../../lib/sfx";

/**
 * The simulator's own chrome — a darker, arcade-like shell that fully replaces the main app nav
 * while inside /simulator/*. It is always dark (independent of the light/dark theme toggle): a
 * game cabinet, not another app page. Sub-nav routes to Open / Vault / Leaderboard; a "back to
 * collection" link returns to the main app.
 */

const SUB = [
  { to: "/simulator/open", label: "Open" },
  { to: "/simulator/vault", label: "Vault" },
  { to: "/simulator/leaderboard", label: "Leaderboard" },
];

function subClass({ isActive }: { isActive: boolean }): string {
  return `rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
    isActive
      ? "bg-amber-400 text-slate-900 shadow-[0_0_18px_-2px_rgba(251,191,36,0.7)]"
      : "text-slate-300 hover:bg-white/10 hover:text-white"
  }`;
}

export function SimulatorLayout() {
  const muted = useMuted();
  return (
    // `dark` scope: the simulator is always dark, so any `dark:`-styled child (Vault, Leaderboard)
    // renders dark here regardless of the app's light/dark theme toggle.
    <div className="dark sim-shell min-h-screen text-slate-100">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <NavLink
            to="/"
            className="flex items-center gap-1 text-sm font-medium text-slate-400 hover:text-white"
          >
            <span aria-hidden>←</span> Back to collection
          </NavLink>
          <span className="flex items-center gap-2 text-lg font-bold tracking-wide text-amber-300">
            <span aria-hidden>🎴</span> Simulator
          </span>
          <nav className="flex flex-wrap gap-1">
            {SUB.map((item) => (
              <NavLink key={item.to} to={item.to} className={subClass}>
                {item.label}
              </NavLink>
            ))}
          </nav>
          <button
            onClick={toggleMuted}
            aria-label={muted ? "Unmute sound" : "Mute sound"}
            aria-pressed={muted}
            className="ml-auto rounded-lg border border-white/15 p-2 text-sm hover:bg-white/10"
          >
            <span aria-hidden>{muted ? "🔇" : "🔊"}</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
