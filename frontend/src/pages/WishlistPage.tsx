import { EmptyState } from "../components/States";

/** Placeholder — fully implemented in Phase 4 (wishlist + price alerts). */
export function WishlistPage() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Wishlist</h1>
      <EmptyState title="Coming soon" hint="Track cards you want and get price-drop alerts." />
    </>
  );
}
