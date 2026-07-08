import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { money, shortDate } from "../lib/format";

interface Point {
  date: string;
  value: number | null;
}

/**
 * Market-price / portfolio-value area chart. PokéVault self-snapshots prices daily, so early
 * on there may be only a point or two — we show a "history still building" note then.
 */
export function PriceChart({
  data,
  currency = "USD",
  label = "Value",
}: {
  data: Point[];
  currency?: string;
  label?: string;
}) {
  const points = data.filter((p) => p.value !== null);

  if (points.length < 2) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        📈 History is still building — PokéVault snapshots prices once a day, so this chart fills in
        over time.
        {points.length === 1 && ` Today: ${money(points[0].value, currency)}.`}
      </div>
    );
  }

  return (
    <div className="h-64 w-full rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
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
            tickFormatter={(v) => money(v, currency)}
            width={72}
            fontSize={12}
            stroke="currentColor"
            className="text-slate-400"
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            formatter={(v) => [money(Number(v), currency), label]}
            labelFormatter={(l) => shortDate(String(l))}
            contentStyle={{ borderRadius: 12, border: "1px solid #cbd5e1", fontSize: 13 }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#2563eb"
            strokeWidth={2}
            fill="url(#pv-fill)"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
