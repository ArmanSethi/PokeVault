import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Spinner } from "../components/States";

/**
 * Password-reset callback. The email link lands here with a recovery token in the URL hash;
 * supabase-js (detectSessionInUrl) turns it into a session before AuthContext finishes loading.
 * With that session we let the user set a new password; without one the link is invalid/expired.
 */
export function ResetPasswordPage() {
  const { session, loading, updatePassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setBusy(true);
    try {
      await updatePassword(password);
      setDone(true);
      setTimeout(() => navigate("/", { replace: true }), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-center text-3xl font-bold text-brand-600">🃏 PokéVault</h1>
        <p className="mb-6 text-center text-sm text-slate-500 dark:text-slate-400">
          Choose a new password.
        </p>
        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          {loading ? (
            <Spinner label="Verifying your reset link…" />
          ) : !session ? (
            <div className="space-y-3 text-sm">
              <p className="text-slate-600 dark:text-slate-300">
                This reset link is invalid or has expired.
              </p>
              <Link to="/forgot-password" className="text-brand-600 hover:underline">
                Request a new reset link
              </Link>
            </div>
          ) : done ? (
            <p className="text-sm text-green-600 dark:text-green-400">
              Password updated — signing you in…
            </p>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">New password</span>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
                />
                <span className="mt-1 block text-xs text-slate-400">At least 6 characters.</span>
              </label>
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-brand-600 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {busy ? "Updating…" : "Update password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
