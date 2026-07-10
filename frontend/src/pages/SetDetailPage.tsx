import { useParams } from "react-router-dom";
import { useAllSetCards, useSet } from "../lib/queries";
import { CardTile } from "../components/CardTile";
import { EmptyState, ErrorState } from "../components/States";
import { CardGridSkeleton } from "../components/Skeleton";
import { Meta } from "../components/Meta";

/** Public, indexable set page: set info + its card list. */
export function SetDetailPage() {
  const { id = "" } = useParams();
  const set = useSet(id);
  const cards = useAllSetCards(id);

  if (set.isPending) return <CardGridSkeleton />;
  if (set.isError)
    return <ErrorState message={(set.error as Error).message} onRetry={() => set.refetch()} />;
  const s = set.data;
  const size = s.printed_total ?? s.total ?? null;

  return (
    <>
      <Meta
        title={`${s.name} — card list & prices | PokéVault`}
        description={`Browse all ${size ? `${size} ` : ""}cards in ${s.name}${
          s.series ? ` (${s.series})` : ""
        } with live market prices. Track your set completion free on PokéVault.`}
        image={s.logo_url ?? s.symbol_url}
      />
      <div className="mb-6 flex items-center gap-4">
        {s.logo_url && <img src={s.logo_url} alt="" className="h-14 object-contain" />}
        <div>
          <h1 className="text-2xl font-bold">{s.name}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {s.series ? `${s.series} · ` : ""}
            {size ? `${size} cards` : ""}
            {s.release_date ? ` · released ${s.release_date}` : ""}
          </p>
        </div>
      </div>

      {cards.isPending ? (
        <CardGridSkeleton />
      ) : cards.isError ? (
        <ErrorState message={(cards.error as Error).message} onRetry={() => cards.refetch()} />
      ) : (cards.data ?? []).length === 0 ? (
        <EmptyState title="No cards found" hint="This set has no cards in the catalog yet." />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {(cards.data ?? []).map((c) => (
            <CardTile key={c.id} card={c} />
          ))}
        </div>
      )}
    </>
  );
}
