import { useState, type ReactNode } from "react";
import { ApiError } from "../../lib/api";
import { useMe, useUpdateProfile } from "../../lib/queries";
import { PageSkeleton } from "../Skeleton";
import { ErrorState } from "../States";
import { useToast } from "../Toast";

/**
 * Blocks the authed simulator (open + vault) until the user has claimed a handle — their identity
 * on the leaderboard and public showcase. Reuses the existing handle validation + PATCH /me. It
 * does NOT opt anyone into the leaderboard; that's a separate, explicit choice in Settings.
 */
export function SimulatorHandleGate({ children }: { children: ReactNode }) {
  const me = useMe();
  const update = useUpdateProfile();
  const toast = useToast();
  const [handle, setHandle] = useState("");

  if (me.isPending) return <PageSkeleton />;
  if (me.isError)
    return <ErrorState message={(me.error as Error).message} onRetry={() => me.refetch()} />;
  if (me.data?.handle) return <>{children}</>;

  const valid = /^[a-z0-9_-]{3,30}$/.test(handle);

  async function claim() {
    try {
      await update.mutateAsync({ handle });
      toast.success("Handle set — welcome to the simulator!");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not set that handle.");
    }
  }

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
      <h1 className="text-xl font-bold text-amber-300">Choose your handle</h1>
      <p className="mt-2 text-sm text-slate-300">
        Pick a public handle before you open packs — it's how you appear on the leaderboard and your
        showcase URL (<span className="text-slate-400">/u/your-handle</span>). You can change it
        later in settings.
      </p>
      <div className="mt-5 flex items-center justify-center gap-2">
        <span className="text-slate-400">/u/</span>
        <input
          value={handle}
          onChange={(e) => setHandle(e.target.value.toLowerCase())}
          placeholder="ash-ketchum"
          autoFocus
          className="w-56 rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-500"
        />
      </div>
      {handle !== "" && !valid && (
        <p className="mt-2 text-xs text-rose-300">
          3–30 chars: lowercase letters, numbers, hyphen, underscore.
        </p>
      )}
      <button
        onClick={claim}
        disabled={!valid || update.isPending}
        className="mt-5 rounded-lg bg-amber-400 px-5 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-300 disabled:opacity-50"
      >
        {update.isPending ? "Saving…" : "Enter the simulator"}
      </button>
    </div>
  );
}
