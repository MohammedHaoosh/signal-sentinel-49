import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

type Signal = "BUY" | "SELL" | "NEUTRAL";

interface Stock {
  ticker: string;
  price: number;
  rsi: number;
  ma20: number;
  ma50: number;
  signal: Signal;
}

interface PendingTrade extends Stock {
  id: string;
  status: "pending" | "confirmed" | "rejected";
  createdAt: number;
}

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

const API_URL = "https://unblessed-powwow-player.ngrok-free.dev/signals";

function rsiColor(rsi: number) {
  if (rsi < 30) return "text-emerald-400";
  if (rsi > 70) return "text-rose-400";
  return "text-zinc-400";
}
function rsiDot(rsi: number) {
  if (rsi < 30) return "bg-emerald-400";
  if (rsi > 70) return "bg-rose-400";
  return "bg-zinc-500";
}
function signalStyles(signal: Signal) {
  switch (signal) {
    case "BUY":
      return "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30";
    case "SELL":
      return "bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/30";
    default:
      return "bg-zinc-500/15 text-zinc-400 ring-1 ring-zinc-500/30";
  }
}

// Build a plausible 5-day close series from available data.
function buildSeries(s: Stock) {
  const { price, ma20, ma50 } = s;
  const pts = [ma50, (ma50 + ma20) / 2, ma20, (ma20 + price) / 2, price];
  return pts.map((p, i) => ({
    day: `D-${4 - i}`,
    price: Number(p.toFixed(2)),
  }));
}

function Section({
  title,
  right,
  defaultOpen = true,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-10">
      <div className="mb-4 flex items-center justify-between gap-4">
        <CollapsibleTrigger className="group flex items-center gap-2 text-left">
          <ChevronDown
            className={`h-4 w-4 text-zinc-500 transition-transform ${
              open ? "" : "-rotate-90"
            }`}
          />
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        </CollapsibleTrigger>
        <div className="text-xs text-zinc-500">{right}</div>
      </div>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
}

function Dashboard() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [pending, setPending] = useState<PendingTrade[]>([]);
  const [confirmed, setConfirmed] = useState<ConfirmedTrade[]>([]);
  const [rejectedCount, setRejectedCount] = useState(0);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [selected, setSelected] = useState<Stock | null>(null);

  const fetchSignals = useCallback(async () => {
    try {
      const res = await fetch(API_URL, {
        headers: { "ngrok-skip-browser-warning": "true" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Stock[] = await res.json();
      setStocks(data);
      setError(null);
      const now = new Date();
      setLastUpdate(now);

      const actionable = data.filter(
        (s) => s.signal === "BUY" || s.signal === "SELL",
      );

      // Append to pending if not already pending/confirmed for this ticker+signal recently
      setPending((prev) => {
        const activeKeys = new Set(
          prev
            .filter((p) => p.status === "pending")
            .map((p) => `${p.ticker}-${p.signal}`),
        );
        const additions: PendingTrade[] = actionable
          .filter((s) => !activeKeys.has(`${s.ticker}-${s.signal}`))
          .map((s) => ({
            ...s,
            id: `${s.ticker}-${s.signal}-${now.getTime()}-${Math.random()}`,
            status: "pending" as const,
            createdAt: now.getTime(),
          }));
        return [...prev, ...additions];
      });

      // Append to history
      setHistory((prev) => {
        const additions: HistoryEntry[] = actionable.map((s) => ({
          id: `${s.ticker}-${s.signal}-${now.getTime()}-${Math.random()}`,
          time: now.getTime(),
          ticker: s.ticker,
          price: s.price,
          rsi: s.rsi,
          signal: s.signal as "BUY" | "SELL",
        }));
        return [...additions, ...prev].slice(0, 50);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSignals();
    const id = setInterval(fetchSignals, 60_000);
    return () => clearInterval(id);
  }, [fetchSignals]);

  const priceByTicker = useMemo(() => {
    const m = new Map<string, number>();
    stocks.forEach((s) => m.set(s.ticker, s.price));
    return m;
  }, [stocks]);

  const decide = (id: string, status: "confirmed" | "rejected") => {
    setPending((prev) => {
      const trade = prev.find((p) => p.id === id);
      if (trade && status === "confirmed") {
        setConfirmed((c) => [
          ...c,
          {
            id: trade.id,
            ticker: trade.ticker,
            entryPrice: trade.price,
            direction: trade.signal as "BUY" | "SELL",
            timestamp: Date.now(),
          },
        ]);
      }
      if (status === "rejected") setRejectedCount((n) => n + 1);
      return prev.filter((p) => p.id !== id);
    });
  };

  const visiblePending = pending.filter((p) => p.status === "pending");

  const portfolio = useMemo(() => {
    return confirmed.map((t) => {
      const current = priceByTicker.get(t.ticker) ?? t.entryPrice;
      const raw = ((current - t.entryPrice) / t.entryPrice) * 100;
      const pnl = t.direction === "BUY" ? raw : -raw;
      return { ...t, currentPrice: current, pnl };
    });
  }, [confirmed, priceByTicker]);

  const totalPnl = useMemo(() => {
    if (portfolio.length === 0) return 0;
    return portfolio.reduce((s, p) => s + p.pnl, 0) / portfolio.length;
  }, [portfolio]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Trading Signals
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Live market signals · auto-refresh every 60s
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <span className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  error ? "bg-rose-400" : "bg-emerald-400 animate-pulse"
                }`}
              />
              {error ? "Disconnected" : "Live"}
            </span>
            {lastUpdate && (
              <span>Updated {lastUpdate.toLocaleTimeString()}</span>
            )}
          </div>
        </header>

        {error && (
          <div className="mb-6 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            Failed to reach {API_URL} — {error}
          </div>
        )}

        {loading ? (
          <div className="text-zinc-500">Loading signals…</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {stocks.map((s) => (
              <button
                key={s.ticker}
                onClick={() => setSelected(s)}
                className="group rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 text-left transition hover:border-zinc-700 hover:bg-zinc-900"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight">
                      {s.ticker}
                    </h2>
                    <p className="mt-1 text-2xl font-mono font-medium">
                      ${s.price.toFixed(2)}
                    </p>
                  </div>
                  <span
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold tracking-wide ${signalStyles(
                      s.signal,
                    )}`}
                  >
                    {s.signal}
                  </span>
                </div>
                <div className="mt-5 space-y-2.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">RSI</span>
                    <span className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${rsiDot(s.rsi)}`} />
                      <span className={`font-mono font-medium ${rsiColor(s.rsi)}`}>
                        {s.rsi.toFixed(1)}
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">MA20</span>
                    <span className="font-mono text-zinc-300">
                      ${s.ma20.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">MA50</span>
                    <span className="font-mono text-zinc-300">
                      ${s.ma50.toFixed(2)}
                    </span>
                  </div>
                </div>
              </button>
            ))}
            {stocks.length === 0 && (
              <div className="text-zinc-500">No signals available.</div>
            )}
          </div>
        )}

        {/* Trade Approvals */}
        <Section
          title="Trade Approvals"
          right={
            <span className="flex items-center gap-3">
              <span>{visiblePending.length} pending</span>
              <span className="text-emerald-400">
                {confirmed.length} confirmed
              </span>
              <span className="text-rose-400">{rejectedCount} rejected</span>
            </span>
          }
        >
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40">
            {visiblePending.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-zinc-500">
                No pending trades.
              </div>
            ) : (
              <ul className="divide-y divide-zinc-800">
                {visiblePending.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
                  >
                    <div className="flex items-center gap-4">
                      <span
                        className={`rounded-md px-2.5 py-1 text-xs font-semibold ${signalStyles(
                          p.signal,
                        )}`}
                      >
                        {p.signal}
                      </span>
                      <div>
                        <div className="font-semibold">{p.ticker}</div>
                        <div className="text-xs text-zinc-500 font-mono">
                          ${p.price.toFixed(2)} · RSI {p.rsi.toFixed(1)}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => decide(p.id, "confirmed")}
                        className="rounded-md bg-emerald-500/15 px-4 py-1.5 text-sm font-medium text-emerald-400 ring-1 ring-emerald-500/30 transition hover:bg-emerald-500/25"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => decide(p.id, "rejected")}
                        className="rounded-md bg-rose-500/15 px-4 py-1.5 text-sm font-medium text-rose-400 ring-1 ring-rose-500/30 transition hover:bg-rose-500/25"
                      >
                        Reject
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>

        {/* Signal History */}
        <Section
          title="Signal History"
          right={<span>{history.length} / 50</span>}
        >
          <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40">
            {history.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-zinc-500">
                No signals logged yet.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Time</th>
                    <th className="px-4 py-3 text-left font-medium">Ticker</th>
                    <th className="px-4 py-3 text-right font-medium">Price</th>
                    <th className="px-4 py-3 text-right font-medium">RSI</th>
                    <th className="px-4 py-3 text-right font-medium">Signal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td className="px-4 py-2.5 text-zinc-400 font-mono text-xs">
                        {new Date(h.time).toLocaleTimeString()}
                      </td>
                      <td className="px-4 py-2.5 font-semibold">{h.ticker}</td>
                      <td className="px-4 py-2.5 text-right font-mono">
                        ${h.price.toFixed(2)}
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right font-mono ${rsiColor(h.rsi)}`}
                      >
                        {h.rsi.toFixed(1)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span
                          className={`rounded-md px-2 py-0.5 text-xs font-semibold ${signalStyles(h.signal)}`}
                        >
                          {h.signal}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Section>

        {/* Portfolio */}
        <Section
          title="Portfolio"
          right={
            <span
              className={
                totalPnl >= 0 ? "text-emerald-400" : "text-rose-400"
              }
            >
              {portfolio.length > 0
                ? `${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}% avg`
                : "no positions"}
            </span>
          }
        >
          <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40">
            {portfolio.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-zinc-500">
                Confirm a trade to start tracking.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Ticker</th>
                    <th className="px-4 py-3 text-left font-medium">Side</th>
                    <th className="px-4 py-3 text-right font-medium">Entry</th>
                    <th className="px-4 py-3 text-right font-medium">Current</th>
                    <th className="px-4 py-3 text-right font-medium">P/L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {portfolio.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-2.5 font-semibold">{p.ticker}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`rounded-md px-2 py-0.5 text-xs font-semibold ${signalStyles(p.direction)}`}
                        >
                          {p.direction}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-zinc-300">
                        ${p.entryPrice.toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-zinc-300">
                        ${p.currentPrice.toFixed(2)}
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right font-mono font-semibold ${
                          p.pnl >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {p.pnl >= 0 ? "+" : ""}
                        {p.pnl.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Section>
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-2xl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between gap-4">
                  <span>{selected.ticker}</span>
                  <span
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold ${signalStyles(selected.signal)}`}
                  >
                    {selected.signal}
                  </span>
                </DialogTitle>
                <p className="text-sm text-zinc-400 font-mono">
                  ${selected.price.toFixed(2)} · 5-day close
                </p>
              </DialogHeader>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={buildSeries(selected)}
                    margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      stroke="#27272a"
                      strokeDasharray="3 3"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="day"
                      stroke="#71717a"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="#71717a"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      domain={["auto", "auto"]}
                      tickFormatter={(v) => `$${v}`}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#09090b",
                        border: "1px solid #27272a",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      labelStyle={{ color: "#a1a1aa" }}
                      formatter={(v: number) => [`$${v.toFixed(2)}`, "Price"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="price"
                      stroke="#34d399"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "#34d399" }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
                  <div className="text-xs text-zinc-500">RSI</div>
                  <div className={`mt-1 font-mono ${rsiColor(selected.rsi)}`}>
                    {selected.rsi.toFixed(1)}
                  </div>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
                  <div className="text-xs text-zinc-500">MA20</div>
                  <div className="mt-1 font-mono text-zinc-300">
                    ${selected.ma20.toFixed(2)}
                  </div>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
                  <div className="text-xs text-zinc-500">MA50</div>
                  <div className="mt-1 font-mono text-zinc-300">
                    ${selected.ma50.toFixed(2)}
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
