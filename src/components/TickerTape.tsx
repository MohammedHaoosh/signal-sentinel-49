import { TrendingDown, TrendingUp } from "lucide-react";

interface Stock {
  ticker: string;
  price: number;
  ma20: number;
}

export default function TickerTape({ stocks }: { stocks: Stock[] }) {
  if (stocks.length === 0) return null;
  const items = [...stocks, ...stocks]; // duplicate for seamless scroll
  return (
    <div className="relative overflow-hidden border-y border-zinc-800 bg-zinc-950/80 py-2">
      <div className="flex animate-[ticker_60s_linear_infinite] gap-8 whitespace-nowrap hover:[animation-play-state:paused]">
        {items.map((s, i) => {
          const pct = ((s.price - s.ma20) / s.ma20) * 100;
          const up = pct >= 0;
          return (
            <span
              key={`${s.ticker}-${i}`}
              className="inline-flex items-center gap-2 font-mono text-sm"
            >
              <span className="font-semibold text-zinc-100">{s.ticker}</span>
              <span className="text-zinc-300">${s.price.toFixed(2)}</span>
              <span
                className={`inline-flex items-center gap-0.5 ${up ? "text-emerald-400" : "text-rose-400"}`}
              >
                {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {up ? "+" : ""}
                {pct.toFixed(2)}%
              </span>
              <span className="text-zinc-700">·</span>
            </span>
          );
        })}
      </div>
      <style>{`
        @keyframes ticker {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
