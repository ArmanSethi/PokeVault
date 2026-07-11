import { Link, useParams } from "react-router-dom";
import { usePublicCollection, usePublicProfile } from "../lib/queries";
import { useCurrency } from "../context/CurrencyContext";
import { ErrorState } from "../components/States";
import { CardGridSkeleton } from "../components/Skeleton";
import { Meta } from "../components/Meta";

/** Public, shareable collection showcase at /u/:handle (no private fields exposed). */
export function ShowcasePage() {
  const { handle = "" } = useParams();
  const profile = usePublicProfile(handle);
  const collection = usePublicCollection(handle);
  const { format } = useCurrency();

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
  const entries = collection.data?.entries ?? [];

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
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {entries.map((e) => (
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
      )}
    </>
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
