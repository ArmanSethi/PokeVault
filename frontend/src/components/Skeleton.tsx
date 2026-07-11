function Block({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200 dark:bg-slate-800 ${className}`} />;
}

export function CardGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800"
        >
          <Block className="aspect-[3/4] w-full rounded-none" />
          <div className="space-y-2 p-3">
            <Block className="h-4 w-3/4" />
            <Block className="h-3 w-1/2" />
            <Block className="h-4 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      {Array.from({ length: rows }).map((_, i) => (
        <Block key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

export function StatTilesSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <Block key={i} className="h-20 w-full" />
      ))}
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="grid gap-8 md:grid-cols-2">
      <Block className="aspect-[3/4] w-full max-w-sm" />
      <div className="space-y-3">
        <Block className="h-8 w-2/3" />
        <Block className="h-4 w-1/3" />
        <Block className="h-10 w-1/2" />
        <Block className="h-40 w-full" />
      </div>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-4">
      <Block className="h-8 w-48" />
      <CardGridSkeleton count={6} />
    </div>
  );
}
