import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useCurrency } from "../context/CurrencyContext";
import { hasPrice } from "../lib/format";
import { api } from "../lib/api";
import { useCollection, usePulls, useSets } from "../lib/queries";
import type { Card, CollectionEntry, PackPull } from "../types";

/** A normalized card for the featured rotation — the common shape across catalog / collection /
 * vault sources. */
interface Featured {
  id: string;
  name: string;
  setId: string;
  imageUrl: string | null;
  value: string | null; // USD; formatted via useCurrency
}

const PLAYLIST_SIZE = 5;
const ROTATE_MS = 6500;
const FADE_MS = 400;

function prefersReduced(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const fromCard = (c: Card): Featured => ({
  id: c.id,
  name: c.name,
  setId: c.set_id,
  imageUrl: c.image_url,
  value: c.market_price,
});
const fromPull = (p: PackPull): Featured => ({
  id: p.card_id,
  name: p.name,
  setId: p.set_id,
  imageUrl: p.image_url,
  value: p.current_value,
});

// Random catalog cards without a backend "random" sort: fetch a page at a random offset and pick
// from it. Retry-halving handles an offset past the (unknown) catalog end. One page per card, in
// parallel, for variety across sets.
async function randomPage(): Promise<Card[]> {
  for (let off = Math.floor(Math.random() * 18000); ; off = Math.floor(off / 2)) {
    const page = await api.listCards({ limit: 24, offset: off }).catch(() => [] as Card[]);
    if (page.length) return page;
    if (off === 0) return [];
  }
}

async function randomCatalog(count: number, exclude: Set<string>): Promise<Featured[]> {
  const pages = await Promise.all(Array.from({ length: count }, () => randomPage()));
  const picks: Featured[] = [];
  for (const page of pages) {
    const pick = shuffle(page).find((c) => !exclude.has(c.id));
    if (pick) {
      exclude.add(pick.id);
      picks.push(fromCard(pick));
    }
  }
  return picks;
}

/** Build a fresh playlist of up to 5: 1 from collection (if any) + 1 from vault (if any), topped
 * up to 5 with random catalog cards, then shuffled. Re-rolled each time the playlist loops. */
async function buildPlaylist(
  collection: CollectionEntry[],
  pulls: PackPull[],
): Promise<Featured[]> {
  const items: Featured[] = [];
  const seen = new Set<string>();

  if (collection.length) {
    const entry = collection[Math.floor(Math.random() * collection.length)];
    const card = await api.getCard(entry.card_id).catch(() => null);
    if (card) {
      seen.add(card.id);
      items.push(fromCard(card));
    }
  }
  if (pulls.length) {
    const pull = pulls[Math.floor(Math.random() * pulls.length)];
    if (!seen.has(pull.card_id)) {
      seen.add(pull.card_id);
      items.push(fromPull(pull));
    }
  }

  const catalog = await randomCatalog(PLAYLIST_SIZE - items.length, seen);
  items.push(...catalog);
  return shuffle(items);
}

// Preload an image before swapping so it doesn't flash/pop in. Fires the callback on load, on
// error, or after a short safety timeout — never blocks the rotation.
function preload(url: string | null, cb: () => void): void {
  if (!url) {
    cb();
    return;
  }
  let done = false;
  const finish = () => {
    if (!done) {
      done = true;
      cb();
    }
  };
  const img = new Image();
  img.onload = finish;
  img.onerror = finish;
  img.src = url;
  window.setTimeout(finish, 1500);
}

export function FeaturedCard() {
  const collection = useCollection();
  const pulls = usePulls();
  const sets = useSets();
  const { format } = useCurrency();
  const reduced = useRef(prefersReduced()).current;

  const [items, setItems] = useState<Featured[]>([]);
  const [pos, setPos] = useState(0);
  const [cur, setCur] = useState<Featured | null>(null);
  const [prev, setPrev] = useState<Featured | null>(null); // outgoing layer during a cross-fade
  const [paused, setPaused] = useState(false);

  const inited = useRef(false);
  const building = useRef(false);
  const curRef = useRef<Featured | null>(null);
  curRef.current = cur;

  const setName = useCallback(
    (id: string) => sets.data?.find((s) => s.id === id)?.name ?? id,
    [sets.data],
  );

  // Initial playlist once collection + vault have loaded (they're cached React Query reads).
  useEffect(() => {
    if (inited.current || collection.isPending || pulls.isPending) return;
    inited.current = true;
    building.current = true;
    let alive = true;
    buildPlaylist(collection.data ?? [], pulls.data ?? [])
      .then((list) => {
        if (!alive || !list.length) return;
        setItems(list);
        setPos(0);
        setCur(list[0]);
      })
      .finally(() => {
        building.current = false;
      });
    return () => {
      alive = false;
    };
  }, [collection.isPending, collection.data, pulls.isPending, pulls.data]);

  const reroll = useCallback(() => {
    if (building.current) return;
    building.current = true;
    buildPlaylist(collection.data ?? [], pulls.data ?? [])
      .then((list) => {
        if (!list.length) return;
        setItems(list);
        setPos(0);
        preload(list[0].imageUrl, () => {
          setPrev(curRef.current);
          setCur(list[0]);
        });
      })
      .finally(() => {
        building.current = false;
      });
  }, [collection.data, pulls.data]);

  const advance = useCallback(() => {
    const next = pos + 1;
    if (next < items.length) {
      const item = items[next];
      preload(item.imageUrl, () => {
        setPrev(curRef.current);
        setCur(item);
        setPos(next);
      });
    } else {
      reroll(); // finished a loop → fresh random set so it doesn't repeat forever
    }
  }, [items, pos, reroll]);

  // Auto-advance: re-arms after each swap (cur/pos change). Paused on hover/focus. The timer runs
  // for reduced-motion too — only the cross-fade is dropped (see the layers below).
  useEffect(() => {
    if (paused || !cur || items.length < 2) return;
    const id = window.setTimeout(advance, ROTATE_MS);
    return () => clearTimeout(id);
  }, [paused, cur, pos, items, advance]);

  // Drop the outgoing layer once the cross-fade has finished.
  useEffect(() => {
    if (!prev) return;
    const id = window.setTimeout(() => setPrev(null), FADE_MS + 40);
    return () => clearTimeout(id);
  }, [prev]);

  // h-96: a big box (bottom-right quadrant) that anchors the bottom row's height and gives the
  // (object-contain) card image generous room, with the name/set/value block beneath. Full-width
  // when stacked on mobile.
  const box =
    "group relative flex h-96 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900";
  // Inner content column: centered and capped at roughly the card's own width so the (portrait)
  // card image hugs its container with only a small, even gutter — no big dead space on either
  // side of the wide box. The header dots + name/set/value align to this same column.
  const col = "mx-auto flex h-full w-full max-w-[15rem] flex-col";

  if (!cur) {
    return (
      <div className={box} aria-busy="true">
        <div className={col}>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Featured
          </span>
          <div className="mt-2 flex-1 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
        </div>
      </div>
    );
  }

  const renderImg = (f: Featured, extra: string) => (
    <div className={`absolute inset-0 flex items-center justify-center ${extra}`}>
      {f.imageUrl ? (
        <img src={f.imageUrl} alt={f.name} className="h-full w-full object-contain" />
      ) : (
        <span className="text-5xl opacity-30">🃏</span>
      )}
    </div>
  );

  return (
    <Link
      to={`/cards/${encodeURIComponent(cur.id)}`}
      className={`${box} cursor-pointer transition hover:border-brand-300 hover:shadow-md`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      aria-label={`Featured card: ${cur.name}. Open card details.`}
    >
      <div className={col}>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Featured
          </span>
          {items.length > 1 && (
            <div className="flex gap-1">
              {items.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-1.5 rounded-full transition-colors ${
                    i === pos ? "bg-brand-500" : "bg-slate-300 dark:bg-slate-700"
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Image stage: outgoing layer fades out under the incoming layer fading in (cross-fade). */}
        <div className="relative min-h-0 flex-1">
          {prev && !reduced && renderImg(prev, "feat-out")}
          {renderImg(cur, reduced ? "" : "feat-in")}
        </div>

        <div key={cur.id} className={reduced ? "mt-2" : "mt-2 feat-in"}>
          <p className="truncate text-sm font-medium" title={cur.name}>
            {cur.name}
          </p>
          <p className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate text-slate-500 dark:text-slate-400">
              {setName(cur.setId)}
            </span>
            {hasPrice(cur.value) && (
              <span className="shrink-0 font-semibold text-brand-600 dark:text-brand-400">
                {format(cur.value)}
              </span>
            )}
          </p>
        </div>
      </div>
    </Link>
  );
}
