import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../lib/api";
import { useMe, useUpdateProfile } from "../lib/queries";
import { useAuth } from "../context/AuthContext";
import { useCurrency, CURRENCIES } from "../context/CurrencyContext";
import { ErrorState } from "../components/States";
import { PageSkeleton } from "../components/Skeleton";
import { useToast } from "../components/Toast";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-800";

/** Profile settings: claim a public showcase handle and toggle visibility. */
export function SettingsPage() {
  const me = useMe();
  const update = useUpdateProfile();
  const toast = useToast();
  const { currency, setCurrency } = useCurrency();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [handle, setHandle] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [commentsEnabled, setCommentsEnabled] = useState(true);

  useEffect(() => {
    if (me.data) {
      setHandle(me.data.handle ?? "");
      setIsPublic(Boolean(me.data.is_public));
      setCommentsEnabled(me.data.comments_enabled ?? true);
    }
  }, [me.data]);

  if (me.isPending) return <PageSkeleton />;
  if (me.isError)
    return <ErrorState message={(me.error as Error).message} onRetry={() => me.refetch()} />;

  const handleValid = handle === "" || /^[a-z0-9_-]{3,30}$/.test(handle);
  const showcaseUrl =
    me.data.handle && me.data.is_public ? `${window.location.origin}/u/${me.data.handle}` : null;

  async function save() {
    try {
      await update.mutateAsync({
        handle: handle || null,
        is_public: isPublic,
        comments_enabled: commentsEnabled,
      });
      toast.success("Profile saved.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save profile.");
    }
  }

  async function copyShare() {
    if (!showcaseUrl) return;
    await navigator.clipboard.writeText(showcaseUrl);
    toast.success("Showcase link copied!");
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Settings</h1>
        <button
          onClick={() => navigate(-1)}
          aria-label="Close settings"
          className="rounded-lg border border-slate-300 p-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          <span aria-hidden>✕</span>
        </button>
      </div>
      <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
        Claim a handle to get a shareable public showcase of your collection. Prices and set
        completion are shown — what you paid and your notes are never public.
      </p>

      <div className="space-y-4 rounded-xl border border-slate-200 p-5 dark:border-slate-800">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Handle</span>
          <div className="flex items-center gap-2">
            <span className="text-slate-400">/u/</span>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value.toLowerCase())}
              placeholder="ash-ketchum"
              className={inputClass}
            />
          </div>
          {!handleValid && (
            <span className="mt-1 block text-xs text-danger-600 dark:text-danger-500">
              3–30 chars: lowercase letters, numbers, hyphen, underscore.
            </span>
          )}
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
          />
          Make my collection showcase public
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={commentsEnabled}
            onChange={(e) => setCommentsEnabled(e.target.checked)}
          />
          Allow comments on my showcase
        </label>

        <button
          onClick={save}
          disabled={update.isPending || !handleValid || (isPublic && !handle)}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {update.isPending ? "Saving…" : "Save"}
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 p-5 dark:border-slate-800">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Display currency</span>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className={inputClass}
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Prices across PokéVault are converted from USD at daily exchange rates (approximate).
        </p>
      </div>

      {showcaseUrl && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-4 text-sm dark:border-slate-800">
          <div>
            <p className="font-medium">Your showcase is live</p>
            <Link to={`/u/${me.data.handle}`} className="text-brand-600 hover:underline">
              {showcaseUrl}
            </Link>
          </div>
          <button
            onClick={copyShare}
            className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Copy link
          </button>
        </div>
      )}

      <div className="mt-8 border-t border-slate-200 pt-6 dark:border-slate-800">
        <button
          onClick={async () => {
            await signOut();
            navigate("/login");
          }}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
