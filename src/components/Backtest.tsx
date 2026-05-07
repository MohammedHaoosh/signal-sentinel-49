import { useMemo, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const API_URL = "https://unblessed-powwow-player.ngrok-free.dev/signals";
const TRACKED = ["AAPL", "MSFT", "AMZN", "TSLA", "NVDA", "SPY", "AMD", "PLTR"];
const HISTORY_DAYS = 90;

interface Snapshot {
  ticker: string;
  price: number;
  rsi: number;
  ma20: number;
  ma50: number;
}

interface Bar {
  day: number;
  date: string;
  price: number;
  rsi: number;
}

interface Trade {
  date: string;
  day: number;
  ticker: string;
  action: "BUY" | "SELL";
  price: number;
  rsi: number;
  shares: number;
  value: number;
  pnl: number | null;
  portfolio: number;
}

interface Result {
  trades: Trade[];
  equity: { day: number; date: string; strategy: number; buyHold: number }[];
  totalReturn: number;
  totalReturnPct: number;
  winRate: number;
  totalTrades: number;
  maxDrawdown: number;
  buyHoldReturnPct: number;
}

// Deterministic pseudo-random per ticker
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function buildHistory(snap: Snapshot, days: number): Bar[] {
  const rand = seeded(
    snap.ticker.split("").reduce((a, c) => a + c.charCodeAt(0), 0) * 31,
  );
  const vol = Math.max(snap.price * 0.015, 0.5);
  // Walk backwards from current price, then reverse
  const prices: number[] = [snap.price];
  for (let i = 1; i < days; i++) {
    const drift = (rand() - 0.5) * 2 * vol;
    const trend = (snap.price - snap.ma50) / days;
    prices.push(prices[i - 1] - drift - trend);
  }
  prices.reverse();

  // Simple RSI(14) calc
  const period = 14;
  const bars: Bar[] = [];
  const today = new Date();
  for (let i = 0; i < prices.length; i++) {
    let rsi = 50;
    if (i >= period) {
      let gains = 0;
      let losses = 0;
      for (let j = i - period + 1; j <= i; j++) {
        const diff = prices[j] - prices[j - 1];
        if (diff >= 0) gains += diff;
        else losses -= diff;
      }
      const avgG = gains / period;
      const avgL = losses / period;
      rsi = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
    }
    const d = new Date(today);
    d.setDate(d.getDate() - (prices.length - 1 - i));
    bars.push({
      day: i,
      date: d.toISOString().slice(5, 10),
      price: +prices[i].toFixed(2),
      rsi: +rsi.toFixed(2),
    });
  }
  // Anchor last bar's RSI to live value
  bars[bars.length - 1].rsi = snap.rsi;
  return bars;
}

function runBacktest(
  bars: Bar[],
  ticker: string,
  buyTh: number,
  sellTh: number,
  capital: number,
  maxPerDay: number,
): Result {
  let cash = capital;
  let shares = 0;
  let lastBuyPrice = 0;
  const trades: Trade[] = [];
  const equity: Result["equity"] = [];
  const buyHoldShares = capital / bars[0].price;

  for (const bar of bars) {
    let dayTrades = 0;
    if (bar.rsi < buyTh && cash > bar.price && dayTrades < maxPerDay) {
      const buyShares = Math.floor(cash / bar.price);
      if (buyShares > 0) {
        const value = buyShares * bar.price;
        cash -= value;
        shares += buyShares;
        lastBuyPrice = bar.price;
        dayTrades++;
        trades.push({
          date: bar.date,
          day: bar.day,
          ticker,
          action: "BUY",
          price: bar.price,
          rsi: bar.rsi,
          shares: buyShares,
          value,
          pnl: null,
          portfolio: cash + shares * bar.price,
        });
      }
    } else if (bar.rsi > sellTh && shares > 0 && dayTrades < maxPerDay) {
      const value = shares * bar.price;
      const pnl = (bar.price - lastBuyPrice) * shares;
      cash += value;
      const soldShares = shares;
      shares = 0;
      dayTrades++;
      trades.push({
        date: bar.date,
        day: bar.day,
        ticker,
        action: "SELL",
        price: bar.price,
        rsi: bar.rsi,
        shares: soldShares,
        value,
        pnl,
        portfolio: cash,
      });
    }
    equity.push({
      day: bar.day,
      date: bar.date,
      strategy: +(cash + shares * bar.price).toFixed(2),
      buyHold: +(buyHoldShares * bar.price).toFixed(2),
    });
  }

  const finalEquity = cash + shares * bars[bars.length - 1].price;
  const totalReturn = finalEquity - capital;
  const totalReturnPct = (totalReturn / capital) * 100;
  const sells = trades.filter((t) => t.action === "SELL");
  const wins = sells.filter((t) => (t.pnl ?? 0) > 0).length;
  const winRate = sells.length ? (wins / sells.length) * 100 : 0;

  let peak = capital;
  let maxDD = 0;
  for (const e of equity) {
    if (e.strategy > peak) peak = e.strategy;
    const dd = ((peak - e.strategy) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }

  const buyHoldFinal = buyHoldShares * bars[bars.length - 1].price;
  const buyHoldReturnPct = ((buyHoldFinal - capital) / capital) * 100;

  return {
    trades,
    equity,
    totalReturn,
    totalReturnPct,
    winRate,
    totalTrades: trades.length,
    maxDrawdown: maxDD,
    buyHoldReturnPct,
  };
}

export default function Backtest() {
  const [ticker, setTicker] = useState("AAPL");
  const [buyTh, setBuyTh] = useState(30);
  const [sellTh, setSellTh] = useState(70);
  const [capital, setCapital] = useState(1000);
  const [maxPerDay, setMaxPerDay] = useState(1);
  const [compare, setCompare] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(API_URL, {
        headers: { "ngrok-skip-browser-warning": "1" },
      });
      const data: Snapshot[] = await res.json();
      const snap = data.find((s) => s.ticker === ticker);
      if (!snap) throw new Error("Ticker not found");
      const bars = buildHistory(snap, HISTORY_DAYS);
      // small UX delay so spinner is visible
      await new Promise((r) => setTimeout(r, 400));
      setResult(runBacktest(bars, ticker, buyTh, sellTh, capital, maxPerDay));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Backtest failed");
    } finally {
      setLoading(false);
    }
  };

  const positive = (result?.totalReturn ?? 0) >= 0;

  const chartData = useMemo(
    () =>
      result?.equity.map((e) => ({
        ...e,
        ...(compare ? {} : { buyHold: undefined }),
      })) ?? [],
    [result, compare],
  );

  return (
    <div className="space-y-6">
      {/* Config */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">
          Strategy Configuration
        </h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label className="text-zinc-300">Stock</Label>
            <select
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              className="h-9 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100"
            >
              {TRACKED.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label className="flex justify-between text-zinc-300">
              <span>RSI Buy threshold</span>
              <span className="text-emerald-400">{buyTh}</span>
            </Label>
            <Slider
              min={10}
              max={50}
              step={1}
              value={[buyTh]}
              onValueChange={(v) => setBuyTh(v[0])}
            />
          </div>

          <div className="space-y-2">
            <Label className="flex justify-between text-zinc-300">
              <span>RSI Sell threshold</span>
              <span className="text-rose-400">{sellTh}</span>
            </Label>
            <Slider
              min={50}
              max={90}
              step={1}
              value={[sellTh]}
              onValueChange={(v) => setSellTh(v[0])}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-zinc-300">Starting capital ($)</Label>
            <Input
              type="number"
              value={capital}
              min={100}
              onChange={(e) => setCapital(Number(e.target.value) || 0)}
              className="bg-zinc-950 text-zinc-100"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-zinc-300">Max trades / day</Label>
            <select
              value={maxPerDay}
              onChange={(e) => setMaxPerDay(Number(e.target.value))}
              className="h-9 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100"
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </div>

          <div className="flex items-end gap-3">
            <div className="flex flex-1 items-center gap-3 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2">
              <Switch checked={compare} onCheckedChange={setCompare} />
              <span className="text-sm text-zinc-300">Compare vs Buy & Hold</span>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <Button
            onClick={run}
            disabled={loading}
            className="bg-emerald-600 text-white hover:bg-emerald-500"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Running…
              </span>
            ) : (
              "Run Backtest"
            )}
          </Button>
          {err && <span className="text-sm text-rose-400">{err}</span>}
        </div>
      </div>

      {result && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <SummaryCard
              label="Total Return"
              value={`${positive ? "+" : ""}$${result.totalReturn.toFixed(2)}`}
              sub={`${positive ? "+" : ""}${result.totalReturnPct.toFixed(2)}%`}
              positive={positive}
            />
            <SummaryCard
              label="Win Rate"
              value={`${result.winRate.toFixed(1)}%`}
              sub={`${result.trades.filter((t) => t.action === "SELL").length} closed`}
            />
            <SummaryCard
              label="Total Trades"
              value={`${result.totalTrades}`}
              sub={`max ${maxPerDay}/day`}
            />
            <SummaryCard
              label="Max Drawdown"
              value={`-${result.maxDrawdown.toFixed(2)}%`}
              negative
            />
          </div>

          {/* Equity curve */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-200">
                Equity Curve
              </h3>
              {compare && (
                <span className="text-xs text-zinc-400">
                  Buy & Hold: {result.buyHoldReturnPct >= 0 ? "+" : ""}
                  {result.buyHoldReturnPct.toFixed(2)}%
                </span>
              )}
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <defs>
                    <linearGradient id="strat" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" />
                      <stop offset="100%" stopColor="#ef4444" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                  <XAxis dataKey="date" stroke="#71717a" fontSize={11} />
                  <YAxis
                    stroke="#71717a"
                    fontSize={11}
                    domain={["auto", "auto"]}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#09090b",
                      border: "1px solid #27272a",
                      borderRadius: 8,
                      color: "#e4e4e7",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="strategy"
                    name="Strategy"
                    stroke={positive ? "#10b981" : "#ef4444"}
                    strokeWidth={2}
                    dot={false}
                  />
                  {compare && (
                    <Line
                      type="monotone"
                      dataKey="buyHold"
                      name="Buy & Hold"
                      stroke="#71717a"
                      strokeDasharray="4 4"
                      strokeWidth={2}
                      dot={false}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Trades log */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <h3 className="mb-4 text-sm font-semibold text-zinc-200">
              Trades Log
            </h3>
            {result.trades.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No trades triggered with these thresholds.
              </p>
            ) : (
              <div className="max-h-96 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-800">
                      <TableHead>Date</TableHead>
                      <TableHead>Ticker</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">RSI</TableHead>
                      <TableHead className="text-right">Shares</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead className="text-right">P/L</TableHead>
                      <TableHead className="text-right">Portfolio</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.trades.map((t, i) => (
                      <TableRow key={i} className="border-zinc-800">
                        <TableCell className="text-zinc-400">{t.date}</TableCell>
                        <TableCell className="font-medium text-zinc-200">
                          {t.ticker}
                        </TableCell>
                        <TableCell>
                          <span
                            className={
                              t.action === "BUY"
                                ? "rounded bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-400"
                                : "rounded bg-rose-500/15 px-2 py-0.5 text-xs text-rose-400"
                            }
                          >
                            {t.action}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-zinc-300">
                          ${t.price.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-zinc-400">
                          {t.rsi.toFixed(1)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-zinc-300">
                          {t.shares}
                        </TableCell>
                        <TableCell className="text-right font-mono text-zinc-300">
                          ${t.value.toFixed(2)}
                        </TableCell>
                        <TableCell
                          className={`text-right font-mono ${
                            t.pnl == null
                              ? "text-zinc-600"
                              : t.pnl >= 0
                                ? "text-emerald-400"
                                : "text-rose-400"
                          }`}
                        >
                          {t.pnl == null
                            ? "—"
                            : `${t.pnl >= 0 ? "+" : ""}$${t.pnl.toFixed(2)}`}
                        </TableCell>
                        <TableCell className="text-right font-mono text-zinc-200">
                          ${t.portfolio.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </>
      )}

      {!result && !loading && (
        <p className="text-sm text-zinc-500">
          Configure your strategy and run a backtest. History is reconstructed
          from the live signal feed using a {HISTORY_DAYS}-day synthetic series
          seeded by current price, MA, and RSI.
        </p>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  positive,
  negative,
}: {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
  negative?: boolean;
}) {
  const tone = positive
    ? "text-emerald-400"
    : negative
      ? "text-rose-400"
      : "text-zinc-100";
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className={`mt-2 text-2xl font-semibold ${tone}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}
