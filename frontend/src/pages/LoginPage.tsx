import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { errorMessage } from "../lib/errors";
import { isSupabaseConfigured } from "../lib/supabase";

export function LoginPage() {
  const { session, signIn, signUp, signInWithMagicLink } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to={from} replace />;

  async function magicLink() {
    setError(null);
    setNotice(null);
    if (!email) {
      setError("Enter your email first.");
      return;
    }
    setBusy(true);
    try {
      await signInWithMagicLink(email);
      setNotice("Check your inbox for a one-time sign-in link.");
    } catch (err) {
      setError(errorMessage(err, "Could not send the sign-in link."));
    } finally {
      setBusy(false);
    }
  }

  // Same message whether the email is new or already registered — never confirm existence.
  const SIGNUP_NOTICE =
    "If this email isn't already registered, we've sent a confirmation link. Check your inbox — or sign in if you already have an account.";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    // Password rule lives on sign-up only (where the password is created); sign-in accepts
    // any input and just attempts login.
    if (mode === "signup" && password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signin") {
        await signIn(email, password);
        navigate(from, { replace: true });
      } else {
        const { needsConfirmation, alreadyExists } = await signUp(email, password);
        if (needsConfirmation || alreadyExists) {
          setNotice(SIGNUP_NOTICE);
          setMode("signin");
        } else {
          navigate(from, { replace: true });
        }
      }
    } catch (err) {
      const msg = errorMessage(err, "");
      if (mode === "signin") {
        // Generic on purpose — never reveal which field was wrong (account enumeration).
        setError("Invalid email or password.");
      } else {
        // Never confirm an email is already registered — show the same neutral notice.
        if (/already|registered|exists/i.test(msg)) {
          setNotice(SIGNUP_NOTICE);
          setMode("signin");
        } else {
          setError(msg || "Could not create account.");
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-center text-3xl font-bold text-brand-600">🃏 PokéVault</h1>
        <p className="mb-6 text-center text-sm text-slate-500 dark:text-slate-400">
          Track your Pokémon card collection — free.
        </p>

        {!isSupabaseConfigured && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            Supabase isn't configured. Set <code>VITE_SUPABASE_URL</code> and{" "}
            <code>VITE_SUPABASE_ANON_KEY</code> in <code>frontend/.env</code>, then restart the dev
            server.
          </div>
        )}

        <form
          onSubmit={submit}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex-1 rounded-md py-1.5 text-sm font-medium ${
                  mode === m ? "bg-white shadow dark:bg-slate-700" : "text-slate-500"
                }`}
              >
                {m === "signin" ? "Sign in" : "Sign up"}
              </button>
            ))}
          </div>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Password</span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
            />
            {mode === "signup" && (
              <span className="mt-1 block text-xs text-slate-400">At least 6 characters.</span>
            )}
          </label>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          {notice && <p className="text-sm text-green-600 dark:text-green-400">{notice}</p>}

          <button
            type="submit"
            disabled={busy || !isSupabaseConfigured}
            className="w-full rounded-lg bg-brand-600 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>

          {mode === "signin" && (
            <div className="space-y-2 border-t border-slate-100 pt-3 text-center text-sm dark:border-slate-800">
              <button
                type="button"
                onClick={magicLink}
                disabled={busy || !isSupabaseConfigured}
                className="w-full rounded-lg border border-slate-300 py-2 font-medium hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Email me a sign-in link
              </button>
              <Link
                to="/forgot-password"
                className="inline-block text-slate-500 hover:text-brand-600 hover:underline dark:text-slate-400"
              >
                Forgot password?
              </Link>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
