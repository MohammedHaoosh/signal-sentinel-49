import { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

interface Stock {
  ticker: string;
  price: number;
  ma20: number;
  ma50: number;
}

const TRACKED = ["AAPL", "MSFT", "AMZN", "TSLA", "NVDA", "SPY", "AMD", "PLTR"];
const COLORS = ["#60a5fa", "#34d399", "#fb7185", "#fbbf24", "#a78bfa", "#22d3ee", "#f472b6", "#fb923c"];

export default function CompareChart({ stocks }: { stocks: Stock[] }) {
  const [selected, setSelected] = useState<string[]>(["AAPL", "NVDA", "TSLA"]);

  const data = useMemo(() => {
    // Normalize each stock's path (ma50 -> ma20 -> price) to start at 100
    const points = ["D-30", "D-20", "D-10", "Today"];
    return points.map((day, i) => {
      const row: Record<string, number | string> = { day };
      selected.forEach((tk) => {
        const s = stocks.find((x) => x.ticker === tk);
        if (!s) return;
        const seq = [s.ma50, (s.ma50 + s.ma20) / 2, s.ma20, s.price];
        row[tk] = (seq[i] / seq[0]) * 100;
      });
      return row;
    });
  }, [selected, stocks]);

  const toggle = (t: string) => {
    setSelected((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Compare Performance</h3>
          <p className="text-xs text-zinc-500">All stocks normalized to 100 at start</p>
        </div>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {TRACKED.map((t, i) => {
          const active = selected.includes(t);
          return (
            <button
              key={t}
              onClick={() => toggle(t)}
              className={`rounded-md border px-2.5 py-1 text-xs font-mono transition ${
                active
                  ? "border-zinc-600 bg-zinc-800 text-zinc-100"
                  : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:text-zinc-300"
              }`}
              style={active ? { borderColor: COLORS[i] } : undefined}
            >
              {t}
            </button>
          );
        })}
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="day" stroke="#71717a" />
            <YAxis stroke="#71717a" domain={["auto", "auto"]} />
            <Tooltip
              contentStyle={{
                background: "#0a0a0a",
                border: "1px solid #27272a",
                borderRadius: 8,
              }}
            />
            <Legend />
            {selected.map((t) => {
              const idx = TRACKED.indexOf(t);
              return (
                <Line
                  key={t}
                  type="monotone"
                  dataKey={t}
                  stroke={COLORS[idx % COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
