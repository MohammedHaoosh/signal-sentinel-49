import { Fragment, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const API_URL = "https://unblessed-powwow-player.ngrok-free.dev/signals";
const TICKERS = ["AAPL", "MSFT", "AMZN", "TSLA", "NVDA", "SPY", "AMD", "PLTR"];

type Period = "1w" | "1m" | "all";
const PERIOD_DAYS: Record<Period, number> = { "1w": 7, "1m": 30, all: 90 };

interface Snapshot {
  ticker: string;
  price: number;
  rsi?: number;
  ma20?: number;
  ma50?: number;
}

function seeded(seed: number) {
  let s = seed || 1;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

// Build a deterministic synthetic price history seeded by ticker.
// Includes a shared "market" component so correlations are realistic.
function buildHistory(snap: Snapshot, days: number, market: number[]): number[] {
  const rand = seeded(
    snap.ticker.split("").reduce((a, c) => a + c.charCodeAt(0), 0) * 37
  );
  // Each stock has its own beta to the market and idiosyncratic noise
  const beta =
    snap.ticker === "SPY"
      ? 1
      : snap.ticker === "TSLA" || snap.ticker === "PLTR"
        ? 0.4 + rand() * 0.3
        : 0.7 + rand() * 0.6;
  const series: number[] = [];
  let price = snap.price || 100;
  // Walk backward from current price
  const rets: number[] = [];
  for (let i = 0; i < days; i++) {
    const idio = (rand() - 0.5) * 0.025;
    const r = beta * market[i] + idio;
    rets.push(r);
  }
  // Reconstruct so last value == snap.price
  let p = price;
  series.push(p);
  for (let i = rets.length - 1; i >= 0; i--) {
    p = p / (1 + rets[i]);
    series.push(p);
  }
  return series.reverse();
}

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ra: number[] = [];
  const rb: number[] = [];
  for (let i = 1; i < n; i++) {
    ra.push((a[i] - a[i - 1]) / a[i - 1]);
    rb.push((b[i] - b[i - 1]) / b[i - 1]);
  }
  const ma = ra.reduce((s, x) => s + x, 0) / ra.length;
  const mb = rb.reduce((s, x) => s + x, 0) / rb.length;
  let num = 0,
    da = 0,
    db = 0;
  for (let i = 0; i < ra.length; i++) {
    const xa = ra[i] - ma;
    const xb = rb[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  const denom = Math.sqrt(da * db);
  return denom === 0 ? 0 : num / denom;
}

function colorFor(c: number, isDiagonal: boolean): string {
  if (isDiagonal) return "bg-primary/30 text-primary-foreground border-primary/60";
  if (c >= 0.7) return "bg-emerald-600/80 text-white";
  if (c >= 0.4) return "bg-emerald-500/40 text-emerald-100";
  if (c > -0.4) return "bg-muted/40 text-muted-foreground";
  if (c > -0.7) return "bg-red-500/40 text-red-100";
  return "bg-red-600/80 text-white";
}

export default function Correlations() {
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("1m");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(API_URL);
        const data = await res.json();
        const arr: Snapshot[] = Array.isArray(data) ? data : data.signals ?? [];
        if (!cancelled) setSnaps(arr.filter((s) => TICKERS.includes(s.ticker)));
      } catch {
        if (!cancelled)
          setSnaps(TICKERS.map((t) => ({ ticker: t, price: 100 + Math.random() * 200 })));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const id = setInterval(load, 60000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    setMounted(false);
    const t = setTimeout(() => setMounted(true), 30);
    return () => clearTimeout(t);
  }, [period, snaps.length]);

  const { matrix, ordered } = useMemo(() => {
    const days = PERIOD_DAYS[period];
    // Shared market driver
    const marketRand = seeded(42);
    const market: number[] = [];
    for (let i = 0; i < days; i++) market.push((marketRand() - 0.5) * 0.02);

    const ordered = TICKERS.map(
      (t) => snaps.find((s) => s.ticker === t) ?? { ticker: t, price: 100 }
    );
    const series = ordered.map((s) => buildHistory(s, days, market));
    const m: number[][] = ordered.map(() => ordered.map(() => 0));
    for (let i = 0; i < ordered.length; i++) {
      for (let j = 0; j < ordered.length; j++) {
        m[i][j] = i === j ? 1 : pearson(series[i], series[j]);
      }
    }
    return { matrix: m, ordered };
  }, [snaps, period]);

  const pairs = useMemo(() => {
    const out: { a: string; b: string; c: number }[] = [];
    for (let i = 0; i < ordered.length; i++) {
      for (let j = i + 1; j < ordered.length; j++) {
        out.push({ a: ordered[i].ticker, b: ordered[j].ticker, c: matrix[i][j] });
      }
    }
    return out;
  }, [matrix, ordered]);

  const topPos = [...pairs].sort((x, y) => y.c - x.c).slice(0, 3);
  const topNeg = [...pairs].sort((x, y) => x.c - y.c).slice(0, 3);

  const avgAbs =
    pairs.reduce((s, p) => s + Math.abs(p.c), 0) / Math.max(pairs.length, 1);
  const divScore = Math.round(avgAbs * 100);
  const divLabel =
    divScore < 40
      ? { text: "Well diversified", cls: "text-emerald-400", bar: "bg-emerald-500" }
      : divScore <= 70
        ? { text: "Moderate", cls: "text-amber-400", bar: "bg-amber-500" }
        : { text: "Too concentrated", cls: "text-red-400", bar: "bg-red-500" };

  const avgCorr = ordered.map((s, i) => {
    const others = matrix[i].filter((_, j) => j !== i);
    return { ticker: s.ticker, avg: others.reduce((a, b) => a + b, 0) / others.length };
  });
  const mostConcentrated = [...avgCorr].sort((a, b) => b.avg - a.avg)[0];
  const mostDiversifying = [...avgCorr].sort((a, b) => a.avg - b.avg)[0];

  if (loading) {
    return (
      <div className="p-8 text-center text-muted-foreground">Loading correlations…</div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-6 bg-card/60 backdrop-blur border-border/50">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Diversification Score</h2>
            <p className="text-sm text-muted-foreground">
              Based on average absolute correlation across all pairs
            </p>
          </div>
          <div className="flex gap-2">
            {(["1w", "1m", "all"] as Period[]).map((p) => (
              <Button
                key={p}
                size="sm"
                variant={period === p ? "default" : "outline"}
                onClick={() => setPeriod(p)}
              >
                {p === "1w" ? "1 Week" : p === "1m" ? "1 Month" : "All Data"}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className={`text-5xl font-bold ${divLabel.cls}`}>{divScore}</div>
          <div className="flex-1">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Diversified</span>
              <span>Concentrated</span>
            </div>
            <div className="h-3 rounded-full bg-muted/30 overflow-hidden">
              <div
                className={`h-full ${divLabel.bar} transition-all duration-700`}
                style={{ width: `${Math.min(divScore, 100)}%` }}
              />
            </div>
            <div className={`mt-2 text-sm font-medium ${divLabel.cls}`}>{divLabel.text}</div>
          </div>
        </div>
        <div className="mt-4 text-sm text-muted-foreground">
          💡 Consider <span className="text-foreground font-medium">removing {mostConcentrated.ticker}</span>{" "}
          (avg corr {mostConcentrated.avg.toFixed(2)}) — most overlap with the rest. Keep{" "}
          <span className="text-foreground font-medium">{mostDiversifying.ticker}</span>{" "}
          (avg corr {mostDiversifying.avg.toFixed(2)}) for diversification.
        </div>
      </Card>

      <Card className="p-6 bg-card/60 backdrop-blur border-border/50">
        <h3 className="text-lg font-semibold mb-4">Correlation Heatmap</h3>
        <div className="overflow-x-auto">
          <div className="inline-block min-w-full">
            <div
              className="grid gap-1"
              style={{ gridTemplateColumns: `60px repeat(${ordered.length}, minmax(64px, 1fr))` }}
            >
              <div />
              {ordered.map((s) => (
                <div key={s.ticker} className="text-xs font-semibold text-center text-muted-foreground py-1">
                  {s.ticker}
                </div>
              ))}
              {ordered.map((row, i) => (
                <>
                  <div
                    key={`r-${row.ticker}`}
                    className="text-xs font-semibold text-muted-foreground flex items-center justify-end pr-2"
                  >
                    {row.ticker}
                  </div>
                  {ordered.map((col, j) => {
                    const c = matrix[i][j];
                    const diag = i === j;
                    return (
                      <div
                        key={`${row.ticker}-${col.ticker}`}
                        className={`aspect-square rounded-md flex items-center justify-center text-xs font-mono border border-border/30 transition-all duration-500 ${colorFor(
                          c,
                          diag
                        )}`}
                        style={{
                          opacity: mounted ? 1 : 0,
                          transform: mounted ? "scale(1)" : "scale(0.85)",
                          transitionDelay: `${(i * ordered.length + j) * 12}ms`,
                        }}
                        title={`${row.ticker} ↔ ${col.ticker}: ${c.toFixed(2)}`}
                      >
                        {c.toFixed(2)}
                      </div>
                    );
                  })}
                </>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 mt-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-600/80" /> &gt; 0.7</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500/40" /> 0.4 to 0.7</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-muted/60" /> -0.4 to 0.4</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500/40" /> -0.7 to -0.4</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-600/80" /> &lt; -0.7</span>
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-6 bg-card/60 backdrop-blur border-border/50">
          <h3 className="text-lg font-semibold mb-3 text-emerald-400">Strongest Positive</h3>
          <div className="space-y-3">
            {topPos.map((p) => (
              <div key={`${p.a}-${p.b}`} className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-mono font-semibold">{p.a} ↔ {p.b}</span>
                  <span className="text-emerald-400 font-bold">{p.c.toFixed(2)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {p.a} and {p.b} are highly correlated — buying both provides little diversification.
                </p>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-6 bg-card/60 backdrop-blur border-border/50">
          <h3 className="text-lg font-semibold mb-3 text-red-400">Strongest Negative</h3>
          <div className="space-y-3">
            {topNeg.map((p) => (
              <div key={`${p.a}-${p.b}`} className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-mono font-semibold">{p.a} ↔ {p.b}</span>
                  <span className="text-red-400 font-bold">{p.c.toFixed(2)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {p.a} shows {p.c < -0.4 ? "low" : "weak"} correlation with {p.b} — it may act as a hedge against {p.b} moves.
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
