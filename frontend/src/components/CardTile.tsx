import { Link } from "react-router-dom";
import type { Card } from "../types";
import { money } from "../lib/format";

export function CardTile({ card }: { card: Card }) {
  return (
    <Link
      to={`/cards/${encodeURIComponent(card.id)}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition-all duration-150 hover:-translate-y-1 hover:border-brand-300 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-700"
    >
      <div className="relative flex aspect-[3/4] items-center justify-center bg-slate-100 dark:bg-slate-800">
        {card.image_url ? (
          <img
            src={card.image_url}
            alt={card.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-contain transition-transform duration-150 group-hover:scale-[1.03]"
          />
        ) : (
          <span className="text-4xl opacity-30">🃏</span>
        )}
        {card.rarity && (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">
            {card.rarity}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-0.5 p-3">
        <p className="truncate font-medium" title={card.name}>
          {card.name}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {card.set_id} · #{card.number}
        </p>
        <p className="mt-1 font-semibold text-brand-600 dark:text-brand-400">
          {money(card.market_price, card.currency ?? "USD")}
        </p>
      </div>
    </Link>
  );
}
