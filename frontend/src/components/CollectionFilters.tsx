/** Display-only sort + set + foil controls, shared by the private collection page and the
 * public showcase. Pure controlled inputs — no data access — so it's safe on the public page. */

export type SortKey = "value" | "name" | "quantity";

const selectClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800";

interface Props {
  sort: SortKey;
  onSort: (s: SortKey) => void;
  setId: string;
  onSet: (s: string) => void;
  foilOnly: boolean;
  onFoil: (v: boolean) => void;
  sets: string[];
}

export function CollectionFilters({ sort, onSort, setId, onSet, foilOnly, onFoil, sets }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={sort}
        onChange={(e) => onSort(e.target.value as SortKey)}
        aria-label="Sort"
        className={selectClass}
      >
        <option value="value">Sort: value</option>
        <option value="name">Sort: name</option>
        <option value="quantity">Sort: quantity</option>
      </select>
      <select
        value={setId}
        onChange={(e) => onSet(e.target.value)}
        aria-label="Filter by set"
        className={selectClass}
      >
        <option value="">All sets</option>
        {sets.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={foilOnly} onChange={(e) => onFoil(e.target.checked)} />
        Foil only
      </label>
    </div>
  );
}
