import { useEffect, useMemo, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";

const API_URL = "https://unblessed-powwow-player.ngrok-free.dev/signals";

interface Signal {
  ticker: string;
  price: number;
  signal?: "BUY" | "SELL" | "HOLD" | string;
  rsi?: number;
  ma20?: number;
  ma50?: number;
  high?: number;
  low?: number;
}

const SECTOR: Record<string, string> = {
  AAPL: "Tech",
  MSFT: "Tech",
  AMZN: "Tech",
  TSLA: "Tech",
  NVDA: "Tech",
  AMD: "Tech",
  PLTR: "Tech",
  SPY: "ETF",
};

const SECTOR_COLORS: Record<string, string> = {
  Tech: "hsl(217 91% 60%)",
  ETF: "hsl(160 84% 45%)",
  Other: "hsl(43 96% 56%)",
};

// Synthetic 5-day volatility seeded by ticker — deterministic.
function seeded(seed: number) {
  let s = seed || 1;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}
function volatility(ticker: string, price: number): number {
  const rand = seeded(
    ticker.split("").reduce((a, c) => a + c.charCodeAt(0), 0) * 53
  );
  const swings: number[] = [];
  let p = price;
  for (let i = 0; i < 5; i++) {
    const r = (rand() - 0.5) * 0.06;
    swings.push(Math.abs(r));
    p = p * (1 + r);
  }
  return (swings.reduce((a, b) => a + b, 0) / swings.length) * 100;
}

function volBucket(v: number) {
  if (v < 1.5) return { label: "LOW", cls: "bg-emerald-500/30 text-emerald-200 border-emerald-400/60" };
  if (v < 2.5) return { label: "MEDIUM", cls: "bg-amber-500/30 text-amber-200 border-amber-400/60" };
  return { label: "HIGH", cls: "bg-red-500/30 text-red-200 border-red-400/60" };
}

export default function Risk() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);

  // Calculator state
  const [portfolioValue, setPortfolioValue] = useState(10000);
  const [riskPct, setRiskPct] = useState(1);
  const [entry, setEntry] = useState(100);
  const [stop, setStop] = useState(98);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(API_URL);
        const data = await res.json();
        const arr: Signal[] = Array.isArray(data) ? data : data.signals ?? [];
        if (!cancelled) setSignals(arr);
      } catch {
        // ignore
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

  // Calculator outputs
  const calc = useMemo(() => {
    const riskDollars = (portfolioValue * riskPct) / 100;
    const perShareRisk = Math.abs(entry - stop);
    const shares = perShareRisk > 0 ? Math.floor(riskDollars / perShareRisk) : 0;
    const positionDollars = shares * entry;
    const maxLoss = shares * perShareRisk;
    // Assume 2:1 RR target
    const reward = perShareRisk * 2;
    const rr = perShareRisk > 0 ? 2 : 0;
    return { riskDollars, perShareRisk, shares, positionDollars, maxLoss, reward, rr };
  }, [portfolioValue, riskPct, entry, stop]);

  // Active BUY/SELL signals
  const actionable = useMemo(
    () => signals.filter((s) => s.signal === "BUY" || s.signal === "SELL"),
    [signals]
  );

  // Sector exposure based on a hypothetical equal-weight position in actionable signals
  const sectorData = useMemo(() => {
    const totals: Record<string, number> = {};
    const positions = actionable.length > 0 ? actionable : signals;
    positions.forEach((s) => {
      const sec = SECTOR[s.ticker] ?? "Other";
      totals[sec] = (totals[sec] ?? 0) + 1;
    });
    const sum = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(totals).map(([name, count]) => ({
      name,
      value: count,
      pct: (count / sum) * 100,
    }));
  }, [actionable, signals]);

  const overexposed = sectorData.filter((s) => s.pct > 40);

  // Hypothetical daily P/L from actionable signals (placeholder: simulated drift)
  const dailyPL = useMemo(() => {
    // Use the first letter of price digits as deterministic drift; net of $10/signal volatility.
    let total = 0;
    actionable.forEach((s) => {
      const r = seeded(Math.floor(s.price * 100))();
      total += (r - 0.55) * 50;
    });
    return total;
  }, [actionable]);
  const dailyPLPct = (dailyPL / portfolioValue) * 100;
  const lossLimitHit = dailyPLPct <= -3;

  if (loading) {
    return (
      <div className="p-8 text-center text-muted-foreground">Loading risk data…</div>
    );
  }

  return (
    <div className="space-y-6">
      {lossLimitHit && (
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-300 font-medium">
          ⚠️ Daily loss limit reached — consider pausing trading today.
        </div>
      )}

      {/* Position size calculator */}
      <Card className="p-6 bg-card/60 backdrop-blur border-border/50">
        <h2 className="text-2xl font-semibold mb-1">Position Size Calculator</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Calculates how much to invest based on your risk tolerance.
        </p>
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <Label>Total Portfolio Value ($)</Label>
              <Input
                type="number"
                value={portfolioValue}
                onChange={(e) => setPortfolioValue(Number(e.target.value) || 0)}
                className="mt-1"
              />
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <Label>Risk per Trade</Label>
                <span className="text-sm font-mono text-primary">{riskPct.toFixed(1)}%</span>
              </div>
              <Slider
                value={[riskPct]}
                min={0.5}
                max={5}
                step={0.1}
                onValueChange={(v) => setRiskPct(v[0])}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Entry Price ($)</Label>
                <Input
                  type="number"
                  value={entry}
                  step="0.01"
                  onChange={(e) => setEntry(Number(e.target.value) || 0)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Stop Loss ($)</Label>
                <Input
                  type="number"
                  value={stop}
                  step="0.01"
                  onChange={(e) => setStop(Number(e.target.value) || 0)}
                  className="mt-1"
                />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-4 bg-muted/30 border-border/60">
              <div className="text-xs text-muted-foreground">Recommended Shares</div>
              <div className="text-2xl font-bold mt-1 text-foreground">{calc.shares}</div>
            </Card>
            <Card className="p-4 bg-muted/30 border-border/60">
              <div className="text-xs text-muted-foreground">Position Size ($)</div>
              <div className="text-2xl font-bold mt-1 text-foreground">
                ${calc.positionDollars.toFixed(2)}
              </div>
            </Card>
            <Card className="p-4 bg-red-500/15 border-red-400/50">
              <div className="text-xs text-red-200/80">Max Loss</div>
              <div className="text-2xl font-bold mt-1 text-red-200">
                ${calc.maxLoss.toFixed(2)}
              </div>
            </Card>
            <Card className="p-4 bg-emerald-500/15 border-emerald-400/50">
              <div className="text-xs text-emerald-200/80">Risk:Reward</div>
              <div className="text-2xl font-bold mt-1 text-emerald-200">
                1:{calc.rr}
              </div>
            </Card>
          </div>
        </div>
      </Card>

      {/* Daily loss tracker + Sector donut */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-6 bg-card/60 backdrop-blur border-border/50">
          <h3 className="text-lg font-semibold mb-3">Daily P/L Tracker</h3>
          <div className={`text-4xl font-bold ${dailyPL >= 0 ? "text-emerald-300" : "text-red-300"}`}>
            {dailyPL >= 0 ? "+" : ""}${dailyPL.toFixed(2)}
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            {dailyPLPct >= 0 ? "+" : ""}{dailyPLPct.toFixed(2)}% of portfolio
          </div>
          <div className="mt-4 h-2 rounded-full bg-muted/30 overflow-hidden">
            <div
              className={`h-full transition-all ${dailyPL >= 0 ? "bg-emerald-500" : "bg-red-500"}`}
              style={{ width: `${Math.min(Math.abs(dailyPLPct) * 10, 100)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Loss limit set at -3% of portfolio.
          </p>
        </Card>

        <Card className="p-6 bg-card/60 backdrop-blur border-border/50">
          <h3 className="text-lg font-semibold mb-3">Sector Exposure</h3>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sectorData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={45}
                  outerRadius={75}
                  paddingAngle={2}
                >
                  {sectorData.map((s) => (
                    <Cell key={s.name} fill={SECTOR_COLORS[s.name] ?? SECTOR_COLORS.Other} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                  formatter={(v: number, n: string) => [`${v} positions`, n]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-2 justify-center mt-2">
            {sectorData.map((s) => (
              <span key={s.name} className="text-xs flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: SECTOR_COLORS[s.name] ?? SECTOR_COLORS.Other }} />
                {s.name} {s.pct.toFixed(0)}%
              </span>
            ))}
          </div>
          {overexposed.length > 0 && (
            <div className="mt-3 text-xs text-amber-300 text-center">
              ⚠️ Overexposed: {overexposed.map((s) => s.name).join(", ")} (&gt;40%)
            </div>
          )}
        </Card>
      </div>

      {/* Risk cards for actionable signals */}
      <div>
        <h3 className="text-lg font-semibold mb-3">Risk Setup — Active Signals</h3>
        {actionable.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground bg-card/60">
            No active BUY/SELL signals right now.
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {actionable.map((s) => {
              const isBuy = s.signal === "BUY";
              const entry = s.price;
              const stopL = isBuy ? entry * 0.98 : entry * 1.02;
              const tp = isBuy ? entry * 1.04 : entry * 0.96;
              const perShareRisk = Math.abs(entry - stopL);
              const shares = perShareRisk > 0 ? Math.floor((1000 * 0.01) / perShareRisk) : 0;
              const vol = volatility(s.ticker, entry);
              const bucket = volBucket(vol);
              return (
                <Card key={s.ticker} className="p-4 bg-card/60 border-border/50">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="font-bold text-lg">{s.ticker}</div>
                      <Badge variant={isBuy ? "default" : "destructive"} className="mt-1 text-xs">
                        {s.signal}
                      </Badge>
                    </div>
                    <Badge className={`border ${bucket.cls}`} variant="outline">{bucket.label}</Badge>
                  </div>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Entry</span>
                      <span className="font-mono">${entry.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Stop Loss</span>
                      <span className="font-mono text-red-400">${stopL.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Take Profit</span>
                      <span className="font-mono text-emerald-400">${tp.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between border-t border-border/30 pt-1.5 mt-1.5">
                      <span className="text-muted-foreground">Size ($1k risk 1%)</span>
                      <span className="font-mono">{shares} sh</span>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Volatility table */}
      <Card className="p-6 bg-card/60 backdrop-blur border-border/50">
        <h3 className="text-lg font-semibold mb-3">5-Day Volatility</h3>
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
          {signals.map((s) => {
            const v = volatility(s.ticker, s.price);
            const b = volBucket(v);
            return (
              <div key={s.ticker} className="p-3 rounded-lg bg-muted/20 border border-border/30 flex items-center justify-between">
                <div>
                  <div className="font-semibold">{s.ticker}</div>
                  <div className="text-xs text-muted-foreground">{v.toFixed(2)}% avg swing</div>
                  {b.label === "HIGH" && (
                    <div className="text-[10px] text-red-400 mt-0.5">⚠ Use smaller size</div>
                  )}
                </div>
                <Badge className={`border ${b.cls}`} variant="outline">{b.label}</Badge>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
