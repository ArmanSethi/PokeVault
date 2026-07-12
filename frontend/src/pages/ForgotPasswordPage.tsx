import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { isSupabaseConfigured } from "../lib/supabase";

/** Request a password-reset email. Neutral copy — never confirms whether the email exists. */
export function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await resetPassword(email);
      // Same message regardless of whether the account exists (anti-enumeration).
      setNotice(
        "If an account exists for that email, we've sent a password-reset link. Check your inbox (and spam).",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset email.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-center text-3xl font-bold text-brand-600">🃏 PokéVault</h1>
        <p className="mb-6 text-center text-sm text-slate-500 dark:text-slate-400">
          Reset your password.
        </p>
        <form
          onSubmit={submit}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
        >
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

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          {notice && <p className="text-sm text-green-600 dark:text-green-400">{notice}</p>}

          <button
            type="submit"
            disabled={busy || !isSupabaseConfigured}
            className="w-full rounded-lg bg-brand-600 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send reset link"}
          </button>
          <p className="text-center text-sm text-slate-500 dark:text-slate-400">
            <Link to="/login" className="text-brand-600 hover:underline">
              Back to sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
