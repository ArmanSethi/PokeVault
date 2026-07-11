import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useMe } from "../lib/queries";
import { StreakChip } from "./StreakChip";

const NAV = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/catalog", label: "Catalog" },
  { to: "/collection", label: "Collection" },
  { to: "/wishlist", label: "Wishlist" },
  { to: "/sets", label: "Set completion" },
  { to: "/scan", label: "Scan" },
];

function navClass({ isActive }: { isActive: boolean }): string {
  return `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
    isActive
      ? "bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"
      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
  }`;
}

/** Shows the user's handle (u/ash) when set, else their email. Fetches /me only when
 * rendered (i.e. only for signed-in users), so logged-out public pages make no /me call. */
function HeaderIdentity() {
  const { session } = useAuth();
  const me = useMe();
  const label = me.data?.handle ? `u/${me.data.handle}` : session?.user.email;
  return (
    <span className="hidden max-w-[12rem] truncate text-sm text-slate-500 lg:inline dark:text-slate-400">
      {label}
    </span>
  );
}

export function Layout() {
  const { session } = useAuth();
  const { theme, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  const themeToggle = (
    <button
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="rounded-lg border border-slate-300 p-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
    >
      <span aria-hidden>{theme === "dark" ? "☀️" : "🌙"}</span>
    </button>
  );

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <NavLink to="/" className="flex items-center gap-2 text-lg font-bold text-brand-600">
            <span aria-hidden>🃏</span> PokéVault
          </NavLink>

          {session && (
            <nav className="hidden flex-1 flex-wrap gap-1 md:flex">
              {NAV.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className={navClass}>
                  {item.label}
                </NavLink>
              ))}
            </nav>
          )}

          <div className="ml-auto flex items-center gap-2">
            {session ? (
              <>
                {/* Order: daily streak → handle → dark/light → settings */}
                <StreakChip />
                <HeaderIdentity />
                {themeToggle}
                <NavLink
                  to="/settings"
                  aria-label="Settings"
                  className="hidden rounded-lg border border-slate-300 p-2 text-sm hover:bg-slate-100 sm:inline dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  <span aria-hidden>⚙️</span>
                </NavLink>
                <button
                  onClick={() => setMenuOpen((o) => !o)}
                  aria-label="Toggle menu"
                  aria-expanded={menuOpen}
                  className="rounded-lg border border-slate-300 p-2 md:hidden dark:border-slate-700"
                >
                  <span aria-hidden>{menuOpen ? "✕" : "☰"}</span>
                </button>
              </>
            ) : (
              <>
                {themeToggle}
                <NavLink
                  to="/login"
                  className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
                >
                  Log in
                </NavLink>
              </>
            )}
          </div>
        </div>

        {/* Mobile menu */}
        {session && menuOpen && (
          <nav className="flex flex-col gap-1 border-t border-slate-200 px-4 py-3 md:hidden dark:border-slate-800">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMenuOpen(false)}
                className={navClass}
              >
                {item.label}
              </NavLink>
            ))}
            <NavLink to="/settings" onClick={() => setMenuOpen(false)} className={navClass}>
              Settings
            </NavLink>
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
