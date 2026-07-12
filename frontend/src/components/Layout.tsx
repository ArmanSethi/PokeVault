import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useMe, useUnreadCount } from "../lib/queries";
import { AmbientBackground } from "./AmbientBackground";

const NAV = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/catalog", label: "Catalog" },
  { to: "/collection", label: "Collection" },
  { to: "/wishlist", label: "Wishlist" },
  { to: "/deck", label: "Deck" },
  // One entry into the simulator; its own shell exposes Open / Vault / Leaderboard.
  { to: "/simulator", label: "Simulator" },
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

function PaperPlaneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Messages entry with an unread badge. Only mounted for signed-in users (so logged-out pages
 * make no /unread_count call), and the badge is refreshed on every navigation. */
function MessagesNavLink() {
  const { data, refetch } = useUnreadCount();
  const { pathname } = useLocation();
  useEffect(() => {
    refetch();
  }, [pathname, refetch]);
  const count = data?.unread ?? 0;
  return (
    <NavLink
      to="/messages"
      aria-label={count ? `Messages, ${count} unread` : "Messages"}
      className="relative rounded-lg border border-slate-300 p-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
    >
      <PaperPlaneIcon />
      {count > 0 && (
        <span className="absolute -right-1 -top-1 min-w-[1rem] rounded-full bg-brand-600 px-1 text-center text-[10px] font-bold leading-4 text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </NavLink>
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
    <>
      <AmbientBackground />
      <div className="relative z-10 min-h-screen">
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
                  {/* Order: handle → dark/light → messages → settings */}
                  <HeaderIdentity />
                  {themeToggle}
                  <MessagesNavLink />
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
    </>
  );
}
