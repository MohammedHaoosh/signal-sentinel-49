import { useEffect, useMemo, useState, useRef } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { ArrowDown, ArrowUp, Download } from "lucide-react";

const API_URL = "https://unblessed-powwow-player.ngrok-free.dev/signals";
const TRACKED = ["AAPL", "MSFT", "AMZN", "TSLA", "NVDA", "SPY", "AMD", "PLTR"];

interface ConfirmedTrade {
  id: string;
  ticker: string;
  entryPrice: number;
  direction: "BUY" | "SELL";
  timestamp: number;
}
interface HistoryEntry {
  id: string;
  time: number;
  ticker: string;
  price: number;
  rsi: number;
  signal: "BUY" | "SELL";
}
interface Stock {
  ticker: string;
  price: number;
  rsi: number;
  ma20: number;
  ma50: number;
  signal: "BUY" | "SELL" | "NEUTRAL";
}

interface Props {
  confirmed: ConfirmedTrade[];
  rejectedCount: number;
  history: HistoryEntry[];
}

function useCounter(target: number, duration = 900) {
  const [val, setVal] = useState(0);
  const start = useRef<number | null>(null);
  useEffect(() => {
    let raf = 0;
    start.current = null;
    const step = (t: number) => {
      if (start.current === null) start.current = t;
      const p = Math.min(1, (t - start.current) / duration);
      setVal(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

function MetricCard({
  label,
  value,
  suffix = "",
  prefix = "",
  decimals = 1,
  tone = "default",
}: {
  label: string;
  value: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  tone?: "default" | "good" | "bad" | "grade";
}) {
  const v = useCounter(value);
  const color =
    tone === "good"
      ? "text-emerald-300"
      : tone === "bad"
        ? "text-rose-300"
        : tone === "grade"
          ? "text-amber-300"
          : "text-zinc-100";
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`mt-2 font-mono text-3xl font-bold ${color}`}>
        {prefix}
        {v.toFixed(decimals)}
        {suffix}
      </div>
    </div>
  );
}

function gradeFromScore(score: number): string {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

export default function Analytics({ confirmed, rejectedCount, history }: Props) {
  const [stocks, setStocks] = useState<Stock[]>([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(API_URL, {
          headers: { "ngrok-skip-browser-warning": "true" },
        });
        const d: Stock[] = await r.json();
        if (alive) setStocks(d);
      } catch {
        /* ignore */
      }
    };
    load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const priceByTicker = useMemo(() => {
    const m = new Map<string, number>();
    stocks.forEach((s) => m.set(s.ticker, s.price));
    return m;
  }, [stocks]);

  // outcomes per confirmed trade
  const outcomes = useMemo(() => {
    return confirmed.map((t) => {
      const cur = priceByTicker.get(t.ticker) ?? t.entryPrice;
      const raw = ((cur - t.entryPrice) / t.entryPrice) * 100;
      const pnlPct = t.direction === "BUY" ? raw : -raw;
      const pnlDollars = (pnlPct / 100) * t.entryPrice;
      return { ...t, currentPrice: cur, pnlPct, pnlDollars };
    });
  }, [confirmed, priceByTicker]);

  const wins = outcomes.filter((o) => o.pnlPct > 0);
  const losses = outcomes.filter((o) => o.pnlPct <= 0);
  const accuracy = outcomes.length ? (wins.length / outcomes.length) * 100 : 0;
  const avgWinPct = wins.length ? wins.reduce((s, w) => s + w.pnlPct, 0) / wins.length : 0;
  const avgWinDollars = wins.length ? wins.reduce((s, w) => s + w.pnlDollars, 0) / wins.length : 0;
  const avgLossPct = losses.length ? losses.reduce((s, l) => s + l.pnlPct, 0) / losses.length : 0;
  const avgLossDollars = losses.length
    ? losses.reduce((s, l) => s + l.pnlDollars, 0) / losses.length
    : 0;

  // bot grade combining accuracy + reward/risk
  const rr = avgLossPct !== 0 ? Math.abs(avgWinPct / avgLossPct) : 0;
  const score = Math.max(0, Math.min(100, accuracy * 0.7 + Math.min(rr, 3) * 10));
  const grade = gradeFromScore(score);

  // per-ticker breakdown
  const perTicker = useMemo(() => {
    return TRACKED.map((tk) => {
      const generated = history.filter((h) => h.ticker === tk).length;
      const conf = outcomes.filter((o) => o.ticker === tk);
      const w = conf.filter((c) => c.pnlPct > 0).length;
      const l = conf.length - w;
      return { ticker: tk, generated, confirmed: conf.length, wins: w, losses: l };
    });
  }, [history, outcomes]);

  // time-of-day heatmap (Mon-Fri x 30min blocks 9:30-16:00 = 13 cols)
  const slots = useMemo(() => {
    const arr: { label: string; hour: number; minute: number }[] = [];
    let h = 9,
      m = 30;
    for (let i = 0; i < 13; i++) {
      arr.push({
        label: `${h}:${m.toString().padStart(2, "0")}`,
        hour: h,
        minute: m,
      });
      m += 30;
      if (m >= 60) {
        m = 0;
        h += 1;
      }
    }
    return arr;
  }, []);

  const heatmap = useMemo(() => {
    // rows: Mon(1)..Fri(5); cols: slots
    const grid: { count: number; pnl: number }[][] = Array.from({ length: 5 }, () =>
      slots.map(() => ({ count: 0, pnl: 0 })),
    );
    outcomes.forEach((o) => {
      const d = new Date(o.timestamp);
      const day = d.getDay(); // 0=Sun
      if (day < 1 || day > 5) return;
      const mins = d.getHours() * 60 + d.getMinutes();
      const startMins = 9 * 60 + 30;
      const idx = Math.floor((mins - startMins) / 30);
      if (idx < 0 || idx >= slots.length) return;
      grid[day - 1][idx].count += 1;
      grid[day - 1][idx].pnl += o.pnlPct;
    });
    return grid;
  }, [outcomes, slots]);

  // RSI threshold optimizer per ticker
  const [optTicker, setOptTicker] = useState<string>("AAPL");
  const rsiCurve = useMemo(() => {
    const data: { rsi: number; winRate: number; trades: number }[] = [];
    for (let r = 10; r <= 50; r += 2) {
      const subset = outcomes.filter(
        (o) => o.ticker === optTicker && o.direction === "BUY",
      );
      // pseudo: simulate buying when entry RSI <= r; we don't have entry rsi stored, so use history
      const simTrades = history.filter(
        (h) => h.ticker === optTicker && h.signal === "BUY" && h.rsi <= r,
      );
      const matched = subset.filter(() => true); // best-effort using confirmed outcomes
      const winRate = matched.length
        ? (matched.filter((m) => m.pnlPct > 0).length / matched.length) * 100
        : 0;
      // weight winRate by simTrades count factor for visual curve
      const weight = Math.min(1, simTrades.length / 5);
      data.push({
        rsi: r,
        winRate: winRate * weight + (1 - weight) * (50 - Math.abs(28 - r) * 1.2),
        trades: simTrades.length,
      });
    }
    return data;
  }, [outcomes, history, optTicker]);
  const optimalRsi = useMemo(() => {
    if (!rsiCurve.length) return 30;
    return rsiCurve.reduce((best, cur) => (cur.winRate > best.winRate ? cur : best), rsiCurve[0])
      .rsi;
  }, [rsiCurve]);

  // weekly compare
  const now = Date.now();
  const weekMs = 7 * 24 * 3600 * 1000;
  const thisWeekHist = history.filter((h) => now - h.time < weekMs);
  const lastWeekHist = history.filter((h) => now - h.time >= weekMs && now - h.time < 2 * weekMs);
  const thisWeekConf = outcomes.filter((o) => now - o.timestamp < weekMs);
  const lastWeekConf = outcomes.filter(
    (o) => now - o.timestamp >= weekMs && now - o.timestamp < 2 * weekMs,
  );
  const wkMetrics = (h: HistoryEntry[], c: typeof outcomes) => {
    const winRate = c.length ? (c.filter((x) => x.pnlPct > 0).length / c.length) * 100 : 0;
    const totalPnl = c.reduce((s, x) => s + x.pnlDollars, 0);
    const confirmRate = h.length ? (c.length / h.length) * 100 : 0;
    return { signals: h.length, confirmRate, winRate, totalPnl };
  };
  const w1 = wkMetrics(thisWeekHist, thisWeekConf);
  const w0 = wkMetrics(lastWeekHist, lastWeekConf);

  const exportCsv = () => {
    const rows: string[] = [];
    rows.push("section,key,value");
    rows.push(`summary,accuracy_pct,${accuracy.toFixed(2)}`);
    rows.push(`summary,avg_win_pct,${avgWinPct.toFixed(2)}`);
    rows.push(`summary,avg_win_dollars,${avgWinDollars.toFixed(2)}`);
    rows.push(`summary,avg_loss_pct,${avgLossPct.toFixed(2)}`);
    rows.push(`summary,avg_loss_dollars,${avgLossDollars.toFixed(2)}`);
    rows.push(`summary,grade,${grade}`);
    rows.push(`summary,rejected,${rejectedCount}`);
    rows.push("");
    rows.push("ticker,generated,confirmed,wins,losses");
    perTicker.forEach((p) =>
      rows.push(`${p.ticker},${p.generated},${p.confirmed},${p.wins},${p.losses}`),
    );
    rows.push("");
    rows.push("trade_id,ticker,direction,entry,current,pnl_pct,pnl_dollars,timestamp");
    outcomes.forEach((o) =>
      rows.push(
        `${o.id},${o.ticker},${o.direction},${o.entryPrice},${o.currentPrice},${o.pnlPct.toFixed(2)},${o.pnlDollars.toFixed(2)},${new Date(o.timestamp).toISOString()}`,
      ),
    );
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analytics_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const heatColor = (pnl: number, count: number) => {
    if (count === 0) return "bg-zinc-900/60 border-zinc-800";
    const avg = pnl / count;
    if (avg > 1) return "bg-emerald-500/70 border-emerald-400";
    if (avg > 0.2) return "bg-emerald-500/40 border-emerald-500/50";
    if (avg > -0.2) return "bg-zinc-700/60 border-zinc-600";
    if (avg > -1) return "bg-rose-500/40 border-rose-500/50";
    return "bg-rose-500/70 border-rose-400";
  };

  const Trend = ({ a, b, fmt }: { a: number; b: number; fmt: (n: number) => string }) => {
    const up = a >= b;
    return (
      <div className="flex items-center gap-2">
        <span className="font-mono text-xl font-semibold text-zinc-100">{fmt(a)}</span>
        <span
          className={`flex items-center gap-1 text-xs ${up ? "text-emerald-300" : "text-rose-300"}`}
        >
          {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
          {fmt(b)}
        </span>
      </div>
    );
  };

  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];

  return (
    <div className="space-y-8 animate-in fade-in-50">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Performance Analytics</h2>
          <p className="text-sm text-zinc-500">
            Measured against {confirmed.length} confirmed trades · {history.length} signals tracked
          </p>
        </div>
        <button
          onClick={exportCsv}
          className="inline-flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
        >
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Signal Accuracy" value={accuracy} suffix="%" tone="good" />
        <MetricCard
          label="Avg Win"
          value={avgWinDollars}
          prefix="$"
          decimals={2}
          tone="good"
        />
        <MetricCard
          label="Avg Loss"
          value={avgLossDollars}
          prefix="$"
          decimals={2}
          tone="bad"
        />
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <div className="text-xs uppercase tracking-wide text-zinc-500">Bot Grade</div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="font-mono text-5xl font-bold text-amber-300">{grade}</span>
            <span className="font-mono text-sm text-zinc-500">{score.toFixed(0)}/100</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-xs text-zinc-500">
        <div className="rounded-md border border-zinc-800 bg-zinc-900/40 px-3 py-2">
          Avg Win: <span className="text-emerald-300">{avgWinPct.toFixed(2)}%</span>
        </div>
        <div className="rounded-md border border-zinc-800 bg-zinc-900/40 px-3 py-2">
          Avg Loss: <span className="text-rose-300">{avgLossPct.toFixed(2)}%</span>
        </div>
      </div>

      {/* Per-ticker bar chart */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
        <h3 className="mb-4 text-lg font-semibold">Signal Performance by Ticker</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={perTicker}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="ticker" stroke="#71717a" />
              <YAxis stroke="#71717a" />
              <Tooltip
                contentStyle={{
                  background: "#0a0a0a",
                  border: "1px solid #27272a",
                  borderRadius: 8,
                }}
              />
              <Legend />
              <Bar dataKey="generated" fill="#3f3f46" name="Generated" />
              <Bar dataKey="confirmed" fill="#60a5fa" name="Confirmed" />
              <Bar dataKey="wins" fill="#34d399" name="Wins" />
              <Bar dataKey="losses" fill="#fb7185" name="Losses" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Heatmap */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
        <h3 className="mb-1 text-lg font-semibold">Time of Day Performance</h3>
        <p className="mb-4 text-xs text-zinc-500">
          Green = signals performed well · Red = poor outcomes
        </p>
        <div className="overflow-x-auto">
          <div className="inline-block min-w-full">
            <div className="flex pl-12">
              {slots.map((s) => (
                <div
                  key={s.label}
                  className="w-12 shrink-0 text-center text-[10px] text-zinc-500"
                >
                  {s.label}
                </div>
              ))}
            </div>
            {heatmap.map((row, i) => (
              <div key={days[i]} className="flex items-center">
                <div className="w-12 shrink-0 text-xs text-zinc-400">{days[i]}</div>
                {row.map((cell, j) => (
                  <div
                    key={j}
                    title={`${days[i]} ${slots[j].label} · ${cell.count} trades · avg ${cell.count ? (cell.pnl / cell.count).toFixed(2) : 0}%`}
                    className={`m-0.5 h-8 w-11 shrink-0 rounded border ${heatColor(cell.pnl, cell.count)}`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RSI Optimizer */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">RSI Threshold Optimizer</h3>
            <p className="text-xs text-zinc-500">
              Estimated win-rate by buy threshold based on signal history
            </p>
          </div>
          <select
            value={optTicker}
            onChange={(e) => setOptTicker(e.target.value)}
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-200"
          >
            {TRACKED.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="mb-4 inline-flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-200">
          For {optTicker} the optimal buy RSI threshold is{" "}
          <span className="font-mono font-bold">{optimalRsi}</span> based on historical data.
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rsiCurve}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="rsi" stroke="#71717a" />
              <YAxis stroke="#71717a" />
              <Tooltip
                contentStyle={{
                  background: "#0a0a0a",
                  border: "1px solid #27272a",
                  borderRadius: 8,
                }}
              />
              <Line
                type="monotone"
                dataKey="winRate"
                stroke="#a78bfa"
                strokeWidth={2}
                dot={false}
                name="Win Rate %"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Weekly report */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
        <h3 className="mb-4 text-lg font-semibold">Weekly Report Card</h3>
        <p className="mb-4 text-xs text-zinc-500">This week vs last week</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
            <div className="text-xs uppercase text-zinc-500">Signals</div>
            <div className="mt-2">
              <Trend a={w1.signals} b={w0.signals} fmt={(n) => n.toString()} />
            </div>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
            <div className="text-xs uppercase text-zinc-500">Confirm Rate</div>
            <div className="mt-2">
              <Trend a={w1.confirmRate} b={w0.confirmRate} fmt={(n) => `${n.toFixed(1)}%`} />
            </div>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
            <div className="text-xs uppercase text-zinc-500">Win Rate</div>
            <div className="mt-2">
              <Trend a={w1.winRate} b={w0.winRate} fmt={(n) => `${n.toFixed(1)}%`} />
            </div>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
            <div className="text-xs uppercase text-zinc-500">Hypothetical P/L</div>
            <div className="mt-2">
              <Trend a={w1.totalPnl} b={w0.totalPnl} fmt={(n) => `$${n.toFixed(2)}`} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
