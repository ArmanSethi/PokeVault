import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  useAddComment,
  useComments,
  useDeleteComment,
  useFriendState,
  usePublicCollection,
  usePublicProfile,
  useRequestFriend,
  useStartConversation,
} from "../lib/queries";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { CollectionFilters, type SortKey } from "../components/CollectionFilters";
import { ErrorState } from "../components/States";
import { CardGridSkeleton } from "../components/Skeleton";
import { Meta } from "../components/Meta";
import { useToast } from "../components/Toast";

/** Add-friend control on a profile; its label reflects the real friendship/block state. Only
 * shown to a signed-in viewer on someone else's profile. Never allows adding across a block. */
function AddFriendButton({ handle }: { handle: string }) {
  const { session } = useAuth();
  const stateQ = useFriendState(handle, Boolean(session));
  const request = useRequestFriend();
  const startConv = useStartConversation();
  const navigate = useNavigate();
  const toast = useToast();

  if (!session) return null;
  const data = stateQ.data;
  if (!data || data.state === "self") return null;

  const base = "ml-auto shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium";
  const primary = `${base} bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50`;
  const muted = `${base} border border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400`;

  if (data.state === "none")
    return (
      <button
        onClick={() =>
          request.mutate(handle, {
            onSuccess: () => toast.success("Friend request sent."),
            onError: (e) => toast.error(e instanceof Error ? e.message : "Could not send request."),
          })
        }
        disabled={request.isPending}
        className={primary}
      >
        Add friend
      </button>
    );
  if (data.state === "pending_out") return <span className={muted}>Request sent</span>;
  if (data.state === "pending_in")
    return (
      <button onClick={() => navigate("/messages")} className={primary}>
        Respond to request
      </button>
    );
  if (data.state === "friends")
    return (
      <button
        onClick={() => {
          if (!data.user_id) return;
          startConv.mutate(data.user_id, {
            onSuccess: () => navigate("/messages"),
            onError: () => toast.error("Could not open the chat."),
          });
        }}
        disabled={startConv.isPending}
        className={primary}
      >
        Message
      </button>
    );
  return <span className={muted}>Unavailable</span>; // blocked (either direction)
}

/** Public, shareable collection showcase at /u/:handle. Read-only: it renders ONLY the owner's
 * public collection (usePublicCollection) with no write/edit/export actions. Sort + filters are
 * display-only client-side operations over the already-fetched public data. */
export function ShowcasePage() {
  const { handle = "" } = useParams();
  const profile = usePublicProfile(handle);
  const collection = usePublicCollection(handle);
  const { format } = useCurrency();

  // Display-only controls (client-side; never fetch or mutate).
  const [sort, setSort] = useState<SortKey>("value");
  const [setId, setSetId] = useState("");
  const [foilOnly, setFoilOnly] = useState(false);

  const allEntries = useMemo(() => collection.data?.entries ?? [], [collection.data]);
  const sets = useMemo(() => [...new Set(allEntries.map((e) => e.set_id))].sort(), [allEntries]);
  const displayed = useMemo(() => {
    let r = allEntries;
    if (setId) r = r.filter((e) => e.set_id === setId);
    if (foilOnly) r = r.filter((e) => e.is_foil);
    const val = (e: (typeof allEntries)[number]) => Number(e.market_value ?? 0);
    return [...r].sort((a, b) => {
      if (sort === "value") return val(b) - val(a);
      if (sort === "quantity") return b.quantity - a.quantity;
      return a.name.localeCompare(b.name);
    });
  }, [allEntries, setId, foilOnly, sort]);

  if (profile.isPending) return <CardGridSkeleton />;
  if (profile.isError)
    return (
      <div className="py-16 text-center">
        <Meta title="Showcase not found | PokéVault" />
        <p className="text-lg font-medium">This showcase isn’t available.</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          It may be private or the handle may not exist.
        </p>
        <Link to="/" className="mt-4 inline-block text-brand-600 hover:underline">
          Go to PokéVault →
        </Link>
      </div>
    );

  const p = profile.data;

  return (
    <>
      <Meta
        title={`@${p.handle}’s Pokémon collection | PokéVault`}
        description={`${p.total_distinct_cards} unique cards · ${p.sets_completed} sets completed · ${format(
          p.total_market_value,
        )} tracked. See the full collection on PokéVault.`}
      />

      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">@{p.handle}</h1>
          <AddFriendButton handle={p.handle} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Unique cards" value={String(p.total_distinct_cards)} />
          <Stat label="Total copies" value={String(p.total_quantity)} />
          <Stat label="Sets completed" value={String(p.sets_completed)} />
          <Stat label="Collection value" value={format(p.total_market_value)} />
        </div>
      </div>

      {collection.isPending ? (
        <CardGridSkeleton />
      ) : collection.isError ? (
        <ErrorState
          message={(collection.error as Error).message}
          onRetry={() => collection.refetch()}
        />
      ) : (
        <>
          <div className="mb-4">
            <CollectionFilters
              sort={sort}
              onSort={setSort}
              setId={setId}
              onSet={setSetId}
              foilOnly={foilOnly}
              onFoil={setFoilOnly}
              sets={sets}
            />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {displayed.map((e) => (
              <Link
                key={e.card_id}
                to={`/cards/${encodeURIComponent(e.card_id)}`}
                className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition-all hover:-translate-y-1 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="relative flex aspect-[3/4] items-center justify-center bg-slate-100 dark:bg-slate-800">
                  {e.image_url ? (
                    <img
                      src={e.image_url}
                      alt={e.name}
                      loading="lazy"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="text-4xl opacity-30">🃏</span>
                  )}
                  {e.quantity > 1 && (
                    <span className="absolute right-1.5 top-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white">
                      ×{e.quantity}
                    </span>
                  )}
                  {e.is_foil && (
                    <span className="absolute left-1.5 top-1.5 text-xs text-accent-400">✦</span>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-0.5 p-3">
                  <p className="truncate text-sm font-medium" title={e.name}>
                    {e.name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {e.set_id} · #{e.number}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-brand-600 dark:text-brand-400">
                    {format(e.market_value)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      <CommentsSection handle={handle} />
    </>
  );
}

const MAX_COMMENT = 500;

/** Comments on a public showcase. Bodies render as plain text (React-escaped) — never HTML. */
function CommentsSection({ handle }: { handle: string }) {
  const { session } = useAuth();
  const comments = useComments(handle);
  const add = useAddComment(handle);
  const del = useDeleteComment(handle);
  const toast = useToast();
  const [body, setBody] = useState("");

  if (comments.isError) return null; // profile not public / not found — stay silent

  const data = comments.data;
  const loggedIn = Boolean(session);

  async function post() {
    const text = body.trim();
    if (!text) return;
    try {
      await add.mutateAsync(text);
      setBody("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not post comment.";
      toast.error(msg);
    }
  }

  return (
    <section className="mt-10">
      <h2 className="mb-3 text-lg font-semibold">Comments</h2>

      {data && !data.comments_enabled ? (
        <p className="rounded-xl border border-slate-200 p-4 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
          Comments are turned off for this showcase.
        </p>
      ) : (
        <>
          {loggedIn ? (
            <div className="mb-4">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value.slice(0, MAX_COMMENT))}
                maxLength={MAX_COMMENT}
                rows={2}
                placeholder="Leave a comment…"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
              <div className="mt-1 flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  {body.length}/{MAX_COMMENT}
                </span>
                <button
                  onClick={post}
                  disabled={add.isPending || !body.trim()}
                  className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {add.isPending ? "Posting…" : "Post comment"}
                </button>
              </div>
            </div>
          ) : (
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
              <Link to="/login" className="text-brand-600 hover:underline">
                Sign in
              </Link>{" "}
              to leave a comment.
            </p>
          )}

          {comments.isPending ? (
            <p className="text-sm text-slate-400">Loading comments…</p>
          ) : !data || data.comments.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No comments yet.</p>
          ) : (
            <ul className="space-y-3">
              {data.comments.map((c) => (
                <li
                  key={c.id}
                  className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"
                >
                  <div className="mb-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      @{c.author_handle ?? "a collector"}
                    </span>
                    <span>· {new Date(c.created_at).toLocaleString()}</span>
                  </div>
                  {/* Plain text — React escapes it; comment markup can never execute. */}
                  <p className="whitespace-pre-wrap break-words text-sm">{c.body}</p>
                  {loggedIn && c.can_delete && (
                    <div className="mt-2 flex gap-3 text-xs">
                      <button
                        onClick={() => del.mutate(c.id)}
                        className="text-danger-600 hover:underline dark:text-danger-500"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xl font-bold text-brand-600 dark:text-brand-400">{value}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}
