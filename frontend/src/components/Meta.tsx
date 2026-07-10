/**
 * Document metadata for SEO + social unfurls.
 *
 * React 19 hoists <title>/<meta> rendered anywhere in the tree into <head>, so page
 * components can declare their own metadata with no extra library. Rendered on public,
 * indexable pages (cards, sets, showcases).
 */
export function Meta({
  title,
  description,
  image,
}: {
  title: string;
  description?: string;
  image?: string | null;
}) {
  return (
    <>
      <title>{title}</title>
      {description && <meta name="description" content={description} />}
      <meta property="og:title" content={title} />
      {description && <meta property="og:description" content={description} />}
      {image && <meta property="og:image" content={image} />}
      <meta name="twitter:card" content={image ? "summary_large_image" : "summary"} />
    </>
  );
}
