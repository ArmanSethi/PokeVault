import { useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState, ErrorState, Spinner } from "../components/States";
import { useToast } from "../components/Toast";
import {
  useAcceptRequest,
  useConversation,
  useConversations,
  useDeclineRequest,
  useBlockUser,
  useFriendRequests,
  useSendMessage,
  useUnfriend,
} from "../lib/queries";

function when(iso: string): string {
  return new Date(iso).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
}

const btn =
  "rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800";

/** Manual-refresh 1:1 messaging. No live updates — the Refresh control is the only way to pull
 * new messages (set that expectation clearly). Messages render as plain text (React-escaped). */
export function MessagesPage() {
  const [tab, setTab] = useState<"chats" | "requests">("chats");
  const [activeId, setActiveId] = useState<number | null>(null);
  const requests = useFriendRequests();
  const incoming = (requests.data ?? []).filter((r) => r.direction === "incoming").length;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-2xl font-bold">Messages</h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Messages don’t update live — use <span className="font-medium">Refresh</span> to pull new
        ones.
      </p>

      <div className="mb-4 flex gap-1">
        {(["chats", "requests"] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              setActiveId(null);
            }}
            aria-pressed={tab === t}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === t
                ? "bg-brand-600 text-white"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            {t === "chats" ? "Chats" : `Requests${incoming ? ` (${incoming})` : ""}`}
          </button>
        ))}
      </div>

      {tab === "requests" ? (
        <Requests />
      ) : activeId == null ? (
        <ChatList onOpen={setActiveId} />
      ) : (
        <Thread id={activeId} onBack={() => setActiveId(null)} />
      )}
    </div>
  );
}

function ChatList({ onOpen }: { onOpen: (id: number) => void }) {
  const conversations = useConversations();
  if (conversations.isPending) return <Spinner />;
  if (conversations.isError)
    return (
      <ErrorState
        message={(conversations.error as Error).message}
        onRetry={() => conversations.refetch()}
      />
    );

  return (
    <>
      <div className="mb-3 flex justify-end">
        <button onClick={() => conversations.refetch()} className={btn}>
          ↻ Refresh
        </button>
      </div>
      {conversations.data.length === 0 ? (
        <EmptyState
          title="No conversations yet"
          hint="Add a friend from their profile, then start a chat once they accept."
        />
      ) : (
        <ul className="space-y-2">
          {conversations.data.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => onOpen(c.id)}
                className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">@{c.other.handle ?? "user"}</p>
                  <p className="truncate text-sm text-slate-500 dark:text-slate-400">
                    {c.last_message
                      ? `${c.last_message.sender_is_me ? "You: " : ""}${c.last_message.body}`
                      : "No messages yet"}
                  </p>
                </div>
                {c.unread_count > 0 && (
                  <span className="shrink-0 rounded-full bg-brand-600 px-2 py-0.5 text-xs font-bold text-white">
                    {c.unread_count}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Thread({ id, onBack }: { id: number; onBack: () => void }) {
  const conversation = useConversation(id);
  const send = useSendMessage(id);
  const unfriend = useUnfriend();
  const block = useBlockUser();
  const toast = useToast();
  const [body, setBody] = useState("");

  const other = conversation.data?.other;

  function submit() {
    const text = body.trim();
    if (!text) return;
    send.mutate(text, {
      onSuccess: () => {
        setBody("");
        conversation.refetch();
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : "Could not send."),
    });
  }

  function doUnfriend() {
    if (!other || !confirm(`Unfriend @${other.handle ?? "user"}?`)) return;
    unfriend.mutate(other.user_id, {
      onSuccess: () => {
        toast.success("Unfriended.");
        onBack();
      },
    });
  }

  function doBlock() {
    if (!other || !confirm(`Block @${other.handle ?? "user"}? This also unfriends them.`)) return;
    block.mutate(other.user_id, {
      onSuccess: () => {
        toast.success("Blocked.");
        onBack();
      },
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800">
      <div className="flex items-center gap-2 border-b border-slate-200 p-3 dark:border-slate-800">
        <button onClick={onBack} aria-label="Back to chats" className={btn}>
          ←
        </button>
        <span className="flex-1 font-semibold">
          {other ? (
            <Link to={`/u/${other.handle}`} className="text-brand-600 hover:underline">
              @{other.handle ?? "user"}
            </Link>
          ) : (
            "…"
          )}
        </span>
        <button onClick={() => conversation.refetch()} className={btn}>
          ↻ Refresh
        </button>
        <button onClick={doUnfriend} className={btn}>
          Unfriend
        </button>
        <button
          onClick={doBlock}
          className="rounded-lg border border-danger-400 px-3 py-1.5 text-sm font-medium text-danger-600 hover:bg-danger-100 dark:border-danger-600 dark:text-danger-400 dark:hover:bg-danger-600/20"
        >
          Block
        </button>
      </div>

      <div className="flex max-h-[55vh] min-h-[240px] flex-col gap-2 overflow-y-auto p-3">
        {conversation.isPending ? (
          <Spinner />
        ) : conversation.isError ? (
          <ErrorState
            message={(conversation.error as Error).message}
            onRetry={() => conversation.refetch()}
          />
        ) : conversation.data.messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No messages yet — say hello.
          </p>
        ) : (
          conversation.data.messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                m.sender_is_me
                  ? "self-end bg-brand-600 text-white"
                  : "self-start bg-slate-100 dark:bg-slate-800"
              }`}
            >
              {/* React escapes the body — HTML/script renders as inert text. */}
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
              <p
                className={`mt-0.5 text-[10px] ${
                  m.sender_is_me ? "text-brand-100" : "text-slate-400"
                }`}
              >
                {when(m.created_at)}
              </p>
            </div>
          ))
        )}
      </div>

      <div className="flex gap-2 border-t border-slate-200 p-3 dark:border-slate-800">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          maxLength={2000}
          placeholder="Message…"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
        />
        <button
          onClick={submit}
          disabled={send.isPending || !body.trim()}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}

function Requests() {
  const requests = useFriendRequests();
  const accept = useAcceptRequest();
  const decline = useDeclineRequest();
  const toast = useToast();

  if (requests.isPending) return <Spinner />;
  if (requests.isError)
    return (
      <ErrorState message={(requests.error as Error).message} onRetry={() => requests.refetch()} />
    );

  const incoming = requests.data.filter((r) => r.direction === "incoming");
  const outgoing = requests.data.filter((r) => r.direction === "outgoing");

  return (
    <>
      <div className="mb-3 flex justify-end">
        <button onClick={() => requests.refetch()} className={btn}>
          ↻ Refresh
        </button>
      </div>
      {requests.data.length === 0 ? (
        <EmptyState title="No pending requests" hint="Add friends from their public profile." />
      ) : (
        <div className="space-y-4">
          {incoming.length > 0 && (
            <ul className="space-y-2">
              {incoming.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
                >
                  <Link
                    to={`/u/${r.user.handle}`}
                    className="flex-1 font-medium text-brand-600 hover:underline"
                  >
                    @{r.user.handle ?? "user"}
                  </Link>
                  <button
                    onClick={() =>
                      accept.mutate(r.id, { onSuccess: () => toast.success("Friend added!") })
                    }
                    className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
                  >
                    Accept
                  </button>
                  <button onClick={() => decline.mutate(r.id)} className={btn}>
                    Decline
                  </button>
                </li>
              ))}
            </ul>
          )}
          {outgoing.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
                Sent
              </h2>
              <ul className="space-y-2">
                {outgoing.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <span className="flex-1">@{r.user.handle ?? "user"}</span>
                    <span className="text-sm text-slate-400">Pending</span>
                    <button onClick={() => decline.mutate(r.id)} className={btn}>
                      Cancel
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </>
  );
}
