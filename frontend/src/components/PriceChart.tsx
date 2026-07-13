import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { shortDate } from "../lib/format";
import { useCurrency } from "../context/CurrencyContext";

interface Point {
  date: string;
  value: number | null;
}

// At/above this many points the chart stands on its own; below it we add a "filling in" note.
const FULL_HISTORY = 7;

/**
 * Market-price / portfolio-value area chart. PokéVault self-snapshots prices daily, so early
 * on there may be only a point or two — we show a "history still building" note then.
 */
export function PriceChart({
  data,
  label = "Value",
  className = "",
}: {
  data: Point[];
  label?: string;
  // Extra classes for the panel wrapper, so a caller can match its surrounding card style
  // (e.g. the dashboard passes `shadow-sm`). Other callers keep the plain bordered panel.
  className?: string;
}) {
  const { format } = useCurrency();
  const points = data.filter((p) => p.value !== null);

  // 0 points: nothing recorded yet — show a short friendly note. format() returns "—" for
  // null/NaN, so we never render a bare "$…" here.
  if (points.length === 0) {
    return (
      <div
        className={`rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 ${className}`}
      >
        📈 Price history shows up here for the cards in your collection and wishlist — give it a few
        days to build.
      </div>
    );
  }

  // 1 point: not enough for a line — draw a single visible marker (dot) so today's value is
  // shown without crashing. 2+ points: the area line.
  const single = points.length === 1;

  return (
    <>
      <div
        className={`h-64 w-full rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 ${className}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
            <defs>
              <linearGradient id="pv-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="currentColor"
              className="text-slate-200 dark:text-slate-800"
            />
            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              fontSize={12}
              stroke="currentColor"
              className="text-slate-400"
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => format(v)}
              width={72}
              fontSize={12}
              stroke="currentColor"
              className="text-slate-400"
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              formatter={(v) => [format(Number(v)), label]}
              labelFormatter={(l) => shortDate(String(l))}
              contentStyle={{ borderRadius: 12, border: "1px solid #cbd5e1", fontSize: 13 }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#2563eb"
              strokeWidth={2}
              fill="url(#pv-fill)"
              dot={single ? { r: 4, fill: "#2563eb" } : false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {points.length < FULL_HISTORY && (
        <p className="mt-2 text-center text-xs text-slate-400 dark:text-slate-500">
          {single
            ? `Today: ${format(points[0].value)} — daily history builds from here.`
            : "Still filling in — more detail over the next few days."}
        </p>
      )}
    </>
  );
}
