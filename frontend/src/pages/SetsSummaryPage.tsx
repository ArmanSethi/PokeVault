import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useSealedItems, useSummary } from "../lib/queries";
import { EmptyState, ErrorState } from "../components/States";
import { TableSkeleton } from "../components/Skeleton";

/**
 * Set-wise summary: owned cards vs. sealed packs vs. booster boxes, one row per set. Reached ONLY
 * by clicking the dashboard "Total cards" tile (route /dashboard/sets-summary; not in the nav).
 *
 * "Total cards" is the owned card COUNT (units) per set — matching the "Total cards" tile it's
 * launched from (both use the summary's owned quantity). Packs / booster boxes come from the
 * sealed domain (sum of quantity per set for that product type). Set-less sealed product is
 * grouped into a "No set" row (pinned last) so nothing is dropped. ETBs / bundles / other are
 * tracked in Collection → Sealed but aren't columns here.
 */
const NO_SET = "__none__";

interface Row {
  set_id: string; // NO_SET sentinel for set-less sealed product
  set_name: string;
  total_cards: number;
  total_packs: number;
  total_booster_boxes: number;
}

export function SetsSummaryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const summary = useSummary();
  const sealed = useSealedItems();

  const rows = useMemo<Row[]>(() => {
    const map = new Map<string, Row>();
    const ensure = (setId: string, setName: string): Row => {
      let row = map.get(setId);
      if (!row) {
        row = {
          set_id: setId,
          set_name: setName,
          total_cards: 0,
          total_packs: 0,
          total_booster_boxes: 0,
        };
        map.set(setId, row);
      }
      return row;
    };

    // Card counts per set (existing collection data).
    for (const s of summary.data?.sets ?? []) {
      ensure(s.set_id, s.set_name).total_cards += s.owned_quantity;
    }
    // Fold in sealed packs / booster boxes. Sets present only in sealed data still get a row;
    // set-less items collapse into the "No set" bucket.
    for (const item of sealed.data ?? []) {
      const setless = item.set_id == null;
      const row = ensure(
        setless ? NO_SET : item.set_id!,
        setless ? "No set" : (item.set_name ?? item.set_id!),
      );
      if (item.product_type === "pack") row.total_packs += item.quantity;
      else if (item.product_type === "booster_box") row.total_booster_boxes += item.quantity;
    }

    return [...map.values()].sort((a, b) => {
      if (a.set_id === NO_SET) return 1; // "No set" always last
      if (b.set_id === NO_SET) return -1;
      return b.total_cards - a.total_cards || a.set_name.localeCompare(b.set_name);
    });
  }, [summary.data, sealed.data]);

  if (summary.isPending || sealed.isPending) return <TableSkeleton rows={8} />;
  if (summary.isError)
    return (
      <ErrorState message={(summary.error as Error).message} onRetry={() => summary.refetch()} />
    );
  if (sealed.isError)
    return (
      <ErrorState message={(sealed.error as Error).message} onRetry={() => sealed.refetch()} />
    );

  return (
    <>
      <button
        type="button"
        onClick={() => (location.key === "default" ? navigate("/") : navigate(-1))}
        className="text-sm text-brand-600 hover:underline"
      >
        ← Back
      </button>

      <h1 className="mb-1 mt-2 text-2xl font-bold">By set — cards &amp; sealed</h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Owned cards, packs, and booster boxes per set. ETBs, bundles and other sealed product are
        tracked in your Collection → Sealed tab.
      </p>

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing to summarize yet"
          hint="Add cards to your collection or sealed product to see a per-set breakdown."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left dark:bg-slate-800">
              <tr>
                <th className="px-4 py-2">Set</th>
                <th className="px-4 py-2 text-right">Total cards</th>
                <th className="px-4 py-2 text-right">Total packs</th>
                <th className="px-4 py-2 text-right">Total booster boxes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.set_id}
                  className="border-t border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                >
                  <td className="px-4 py-2 font-medium">{r.set_name}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.total_cards}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.total_packs}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.total_booster_boxes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
