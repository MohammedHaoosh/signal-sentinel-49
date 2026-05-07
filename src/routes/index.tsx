import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import Glossary from "@/components/Glossary";
import Backtest from "@/components/Backtest";
import Correlations from "@/components/Correlations";
import Risk from "@/components/Risk";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown, Star, StarOff, ExternalLink, Plus } from "lucide-react";
import { fetchNews, type NewsArticle } from "@/lib/news.functions";

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
const TRACKED = ["AAPL", "MSFT", "AMZN", "TSLA", "NVDA", "SPY", "AMD", "PLTR"];
const HOT_KEYWORDS = [
  "crash",
  "surge",
  "rally",
  "drop",
  "earnings",
  "fed",
  "inflation",
];

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
function signalStyles(signal: Signal | "BUY" | "SELL") {
  switch (signal) {
    case "BUY":
      return "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30";
    case "SELL":
      return "bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/30";
    default:
      return "bg-zinc-500/15 text-zinc-400 ring-1 ring-zinc-500/30";
  }
}

function buildSeries(s: Stock) {
  const { price, ma20, ma50 } = s;
  const pts = [ma50, (ma50 + ma20) / 2, ma20, (ma20 + price) / 2, price];
  return pts.map((p, i) => ({
    day: `D-${4 - i}`,
    price: Number(p.toFixed(2)),
  }));
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function findHotTags(text: string): string[] {
  const lower = text.toLowerCase();
  return HOT_KEYWORDS.filter((kw) => lower.includes(kw));
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

  // News
  const fetchNewsFn = useServerFn(fetchNews);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [newsFilter, setNewsFilter] = useState<string>("ALL");

  // Watchlist (persisted)
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const w = localStorage.getItem("watchlist");
      const n = localStorage.getItem("watchlist_notes");
      if (w) setWatchlist(JSON.parse(w));
      if (n) setNotes(JSON.parse(n));
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (hydrated) localStorage.setItem("watchlist", JSON.stringify(watchlist));
  }, [watchlist, hydrated]);
  useEffect(() => {
    if (hydrated)
      localStorage.setItem("watchlist_notes", JSON.stringify(notes));
  }, [notes, hydrated]);

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

  const loadNews = useCallback(async () => {
    setNewsLoading(true);
    try {
      const res = await fetchNewsFn();
      setNews(res.articles);
      setNewsError(res.error);
    } catch (e) {
      setNewsError(e instanceof Error ? e.message : "Failed");
    } finally {
      setNewsLoading(false);
    }
  }, [fetchNewsFn]);

  useEffect(() => {
    loadNews();
    const id = setInterval(loadNews, 5 * 60_000);
    return () => clearInterval(id);
  }, [loadNews]);

  const priceByTicker = useMemo(() => {
    const m = new Map<string, number>();
    stocks.forEach((s) => m.set(s.ticker, s.price));
    return m;
  }, [stocks]);

  const stockByTicker = useMemo(() => {
    const m = new Map<string, Stock>();
    stocks.forEach((s) => m.set(s.ticker, s));
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

  // Market overview metrics
  const avgRsi = useMemo(() => {
    if (stocks.length === 0) return 0;
    return stocks.reduce((s, x) => s + x.rsi, 0) / stocks.length;
  }, [stocks]);
  const marketMood = useMemo(() => {
    if (avgRsi < 35)
      return { label: "Market Oversold", color: "text-emerald-400", ring: "ring-emerald-500/30 bg-emerald-500/10" };
    if (avgRsi > 65)
      return { label: "Market Overbought", color: "text-rose-400", ring: "ring-rose-500/30 bg-rose-500/10" };
    return { label: "Market Neutral", color: "text-zinc-300", ring: "ring-zinc-500/30 bg-zinc-500/10" };
  }, [avgRsi]);
  const trendingUp = stocks.filter((s) => s.price > s.ma20);
  const trendingDown = stocks.filter((s) => s.price <= s.ma20);

  const filteredNews = useMemo(
    () => (newsFilter === "ALL" ? news : news.filter((n) => n.ticker === newsFilter)),
    [news, newsFilter],
  );

  const toggleWatch = (ticker: string) => {
    setWatchlist((w) =>
      w.includes(ticker) ? w.filter((t) => t !== ticker) : [...w, ticker],
    );
  };

  const watchlistStocks = watchlist
    .map((t) => stockByTicker.get(t))
    .filter((s): s is Stock => !!s);

  const availableToAdd = TRACKED.filter((t) => !watchlist.includes(t));

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
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

        <Tabs defaultValue="signals" className="w-full">
          <div className="sticky top-0 z-30 -mx-6 mb-6 border-b border-zinc-800/80 bg-zinc-950/85 px-6 py-3 backdrop-blur">
            <TabsList className="bg-zinc-900/80 ring-1 ring-zinc-800">
              <TabsTrigger value="signals">Signals</TabsTrigger>
              <TabsTrigger value="news">News</TabsTrigger>
              <TabsTrigger value="market">Market Overview</TabsTrigger>
              <TabsTrigger value="watchlist">
                Watchlist
                {watchlist.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-zinc-700 px-1.5 text-[10px]">
                    {watchlist.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="glossary">Glossary</TabsTrigger>
              <TabsTrigger value="backtest">Backtest</TabsTrigger>
              <TabsTrigger value="correlations">Correlations</TabsTrigger>
            </TabsList>
          </div>

          {/* SIGNALS */}
          <TabsContent
            value="signals"
            className="data-[state=active]:animate-in data-[state=active]:fade-in-50 data-[state=active]:slide-in-from-bottom-1"
          >
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
                  <div
                    key={s.ticker}
                    className="group relative rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 transition hover:border-zinc-700 hover:bg-zinc-900"
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleWatch(s.ticker);
                      }}
                      className="absolute right-3 top-3 rounded-md p-1 text-zinc-500 opacity-0 transition hover:text-amber-400 group-hover:opacity-100"
                      aria-label="Toggle watchlist"
                    >
                      {watchlist.includes(s.ticker) ? (
                        <Star className="h-4 w-4 fill-amber-400 text-amber-400 opacity-100" />
                      ) : (
                        <StarOff className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      onClick={() => setSelected(s)}
                      className="block w-full text-left"
                    >
                      <div className="flex items-start justify-between pr-6">
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
                  </div>
                ))}
                {stocks.length === 0 && (
                  <div className="text-zinc-500">No signals available.</div>
                )}
              </div>
            )}

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
          </TabsContent>

          {/* NEWS */}
          <TabsContent
            value="news"
            className="data-[state=active]:animate-in data-[state=active]:fade-in-50 data-[state=active]:slide-in-from-bottom-1"
          >
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <button
                onClick={() => setNewsFilter("ALL")}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  newsFilter === "ALL"
                    ? "bg-zinc-100 text-zinc-900"
                    : "bg-zinc-900 text-zinc-400 ring-1 ring-zinc-800 hover:text-zinc-200"
                }`}
              >
                All
              </button>
              {TRACKED.map((t) => (
                <button
                  key={t}
                  onClick={() => setNewsFilter(t)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    newsFilter === t
                      ? "bg-zinc-100 text-zinc-900"
                      : "bg-zinc-900 text-zinc-400 ring-1 ring-zinc-800 hover:text-zinc-200"
                  }`}
                >
                  {t}
                </button>
              ))}
              <span className="ml-auto text-xs text-zinc-500">
                {newsLoading ? "Refreshing…" : `${filteredNews.length} articles · refresh 5m`}
              </span>
            </div>

            {newsError && (
              <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                {newsError}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredNews.map((a) => {
                const tags = findHotTags(`${a.title} ${a.description ?? ""}`);
                return (
                  <a
                    key={a.url}
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 transition hover:border-zinc-700 hover:bg-zinc-900"
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-zinc-300">
                        {a.ticker}
                      </span>
                      {tags.map((t) => (
                        <span
                          key={t}
                          className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400 ring-1 ring-amber-500/30"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                    <h3 className="font-semibold leading-snug text-zinc-100 group-hover:text-white">
                      {a.title}
                    </h3>
                    {a.description && (
                      <p className="mt-2 line-clamp-2 text-sm text-zinc-400">
                        {a.description}
                      </p>
                    )}
                    <div className="mt-auto flex items-center justify-between pt-4 text-xs text-zinc-500">
                      <span>{a.source}</span>
                      <span className="flex items-center gap-1">
                        {timeAgo(a.publishedAt)}
                        <ExternalLink className="h-3 w-3" />
                      </span>
                    </div>
                  </a>
                );
              })}
              {!newsLoading && filteredNews.length === 0 && (
                <div className="text-zinc-500">No news available.</div>
              )}
            </div>
          </TabsContent>

          {/* MARKET OVERVIEW */}
          <TabsContent
            value="market"
            className="data-[state=active]:animate-in data-[state=active]:fade-in-50 data-[state=active]:slide-in-from-bottom-1"
          >
            <div className={`rounded-2xl p-8 ring-1 ${marketMood.ring}`}>
              <div className="text-xs uppercase tracking-widest text-zinc-500">
                Fear & Greed (avg RSI)
              </div>
              <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className={`text-4xl font-semibold ${marketMood.color}`}>
                    {marketMood.label}
                  </div>
                  <div className="mt-1 text-sm text-zinc-400">
                    Average RSI across {stocks.length} stocks
                  </div>
                </div>
                <div className="font-mono text-5xl font-bold text-zinc-100">
                  {avgRsi.toFixed(1)}
                </div>
              </div>
              <div className="mt-6 h-2 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full bg-gradient-to-r from-emerald-400 via-zinc-500 to-rose-400"
                  style={{ width: `${Math.min(100, Math.max(0, avgRsi))}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between text-[10px] uppercase tracking-wide text-zinc-500">
                <span>Oversold</span>
                <span>Neutral</span>
                <span>Overbought</span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <TrendColumn
                title="Trending Up"
                subtitle="Price above MA20"
                accent="emerald"
                stocks={trendingUp}
              />
              <TrendColumn
                title="Trending Down"
                subtitle="Price at or below MA20"
                accent="rose"
                stocks={trendingDown}
              />
            </div>
          </TabsContent>

          {/* WATCHLIST */}
          <TabsContent
            value="watchlist"
            className="data-[state=active]:animate-in data-[state=active]:fade-in-50 data-[state=active]:slide-in-from-bottom-1"
          >
            <div className="mb-6 flex flex-wrap items-center gap-2">
              <span className="text-sm text-zinc-400">Add ticker:</span>
              {availableToAdd.length === 0 ? (
                <span className="text-xs text-zinc-500">All tracked stocks added.</span>
              ) : (
                availableToAdd.map((t) => (
                  <button
                    key={t}
                    onClick={() => toggleWatch(t)}
                    className="flex items-center gap-1 rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-zinc-300 ring-1 ring-zinc-800 transition hover:bg-zinc-800 hover:text-white"
                  >
                    <Plus className="h-3 w-3" />
                    {t}
                  </button>
                ))
              )}
            </div>

            {watchlistStocks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/40 px-6 py-16 text-center">
                <Star className="mx-auto h-8 w-8 text-zinc-700" />
                <p className="mt-3 text-zinc-400">Your watchlist is empty.</p>
                <p className="mt-1 text-xs text-zinc-500">
                  Add a ticker above or star one from the Signals tab.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                {watchlistStocks.map((s) => (
                  <div
                    key={s.ticker}
                    className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-3">
                          <h3 className="text-2xl font-semibold tracking-tight">
                            {s.ticker}
                          </h3>
                          <span
                            className={`rounded-md px-2.5 py-1 text-xs font-semibold ${signalStyles(s.signal)}`}
                          >
                            {s.signal}
                          </span>
                        </div>
                        <p className="mt-1 text-3xl font-mono font-medium">
                          ${s.price.toFixed(2)}
                        </p>
                      </div>
                      <button
                        onClick={() => toggleWatch(s.ticker)}
                        className="rounded-md p-1.5 text-amber-400 transition hover:bg-zinc-800"
                        aria-label="Remove"
                      >
                        <Star className="h-5 w-5 fill-amber-400" />
                      </button>
                    </div>

                    <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
                      <div className="rounded-lg bg-zinc-950/60 p-3 ring-1 ring-zinc-800">
                        <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                          RSI
                        </div>
                        <div
                          className={`mt-1 font-mono font-medium ${rsiColor(s.rsi)}`}
                        >
                          {s.rsi.toFixed(1)}
                        </div>
                      </div>
                      <div className="rounded-lg bg-zinc-950/60 p-3 ring-1 ring-zinc-800">
                        <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                          MA20
                        </div>
                        <div className="mt-1 font-mono text-zinc-300">
                          ${s.ma20.toFixed(2)}
                        </div>
                      </div>
                      <div className="rounded-lg bg-zinc-950/60 p-3 ring-1 ring-zinc-800">
                        <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                          MA50
                        </div>
                        <div className="mt-1 font-mono text-zinc-300">
                          ${s.ma50.toFixed(2)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-5">
                      <label className="text-[10px] uppercase tracking-wide text-zinc-500">
                        Notes
                      </label>
                      <Textarea
                        value={notes[s.ticker] ?? ""}
                        onChange={(e) =>
                          setNotes((n) => ({ ...n, [s.ticker]: e.target.value }))
                        }
                        placeholder="Your observations…"
                        className="mt-1.5 min-h-24 resize-none border-zinc-800 bg-zinc-950/60 text-sm text-zinc-200 placeholder:text-zinc-600"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent
            value="glossary"
            className="data-[state=active]:animate-in data-[state=active]:fade-in-50 data-[state=active]:slide-in-from-bottom-1"
          >
            <Glossary />
          </TabsContent>

          <TabsContent
            value="backtest"
            className="data-[state=active]:animate-in data-[state=active]:fade-in-50 data-[state=active]:slide-in-from-bottom-1"
          >
            <Backtest />
          </TabsContent>

          <TabsContent
            value="correlations"
            className="data-[state=active]:animate-in data-[state=active]:fade-in-50 data-[state=active]:slide-in-from-bottom-1"
          >
            <Correlations />
          </TabsContent>
        </Tabs>
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

function TrendColumn({
  title,
  subtitle,
  accent,
  stocks,
}: {
  title: string;
  subtitle: string;
  accent: "emerald" | "rose";
  stocks: Stock[];
}) {
  const dot =
    accent === "emerald" ? "bg-emerald-400" : "bg-rose-400";
  const text =
    accent === "emerald" ? "text-emerald-400" : "text-rose-400";
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${dot}`} />
            <h3 className="font-semibold">{title}</h3>
          </div>
          <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>
        </div>
        <span className={`text-sm font-mono ${text}`}>{stocks.length}</span>
      </div>
      {stocks.length === 0 ? (
        <div className="py-6 text-center text-sm text-zinc-500">None</div>
      ) : (
        <ul className="divide-y divide-zinc-800">
          {stocks.map((s) => {
            const diff = ((s.price - s.ma20) / s.ma20) * 100;
            return (
              <li
                key={s.ticker}
                className="flex items-center justify-between py-2.5"
              >
                <div>
                  <div className="font-semibold">{s.ticker}</div>
                  <div className="text-xs text-zinc-500 font-mono">
                    ${s.price.toFixed(2)} · MA20 ${s.ma20.toFixed(2)}
                  </div>
                </div>
                <span className={`font-mono text-sm ${text}`}>
                  {diff >= 0 ? "+" : ""}
                  {diff.toFixed(2)}%
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
