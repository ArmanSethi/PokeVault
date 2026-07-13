import { useState } from "react";
import { ApiError } from "../lib/api";
import { useAddWishlist } from "../lib/queries";
import { LIMITS } from "../lib/limits";
import { NumberField } from "./NumberField";
import { useToast } from "./Toast";

/** Add a card to the wishlist with an optional target price. */
export function WishlistButton({ cardId }: { cardId: string }) {
  const add = useAddWishlist();
  const toast = useToast();
  const [target, setTarget] = useState<number | null>(null);

  async function submit() {
    try {
      await add.mutateAsync({
        card_id: cardId,
        target_price: target,
      });
      toast.success("Added to wishlist.");
      setTarget(null);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not add to wishlist.");
    }
  }

  return (
    <div className="mt-3 flex items-end gap-2 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <label className="flex-1 text-sm">
        <span className="mb-1 block">Target price (optional)</span>
        <NumberField
          kind="money"
          value={target}
          onCommit={setTarget}
          min={LIMITS.money.min}
          max={LIMITS.money.max}
          placeholder="Alert me at…"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
        />
      </label>
      <button
        onClick={submit}
        disabled={add.isPending}
        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
      >
        {add.isPending ? "Adding…" : "☆ Wishlist"}
      </button>
    </div>
  );
}
