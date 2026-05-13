import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import confetti from "canvas-confetti";
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
import Scanner from "@/components/Scanner";
import Analytics from "@/components/Analytics";
import Coach from "@/components/Coach";
import CandleChart from "@/components/CandleChart";
import CompareChart from "@/components/CompareChart";
import TickerTape from "@/components/TickerTape";
import Otto from "@/components/Otto";
import ThemeSwitcher, { loadTheme } from "@/components/ThemeSwitcher";
import { Textarea } from "@/components/ui/textarea";
import {
  ChevronDown,
  Star,
  StarOff,
  ExternalLink,
  Plus,
  Volume2,
  VolumeX,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { fetchNews, type NewsArticle } from "@/lib/news.functions";
import { classifyHeadlines, type SentimentResult } from "@/lib/sentiment.functions";
import { weeklyInsight } from "@/lib/coach.functions";
import { explainSignal, marketSummary } from "@/lib/ai.functions";
import { detectPatterns } from "@/lib/patterns";
import { sounds, setSoundEnabled, loadSoundPref } from "@/lib/sounds";

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
  score?: number;
  reasons?: string[];
  rsi_buy?: number;
  rsi_sell?: number;
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

const API_URL = "https://iron-condor.duckdns.org/signals";
const TRADES_BASE = "https://iron-condor.duckdns.org/trades";
const TRACKED = ["AAPL", "MSFT", "AMZN", "TSLA", "NVDA", "SPY", "AMD", "PLTR", "BTC-USD", "GC=F"];

const DISPLAY_NAMES: Record<string, string> = {
  "BTC-USD": "Bitcoin",
  "GC=F": "Gold",
};
const displayName = (t: string) => DISPLAY_NAMES[t] ?? t;
const assetCardClass = (t: string) => {
  if (t === "GC=F") return "border-amber-400/50 bg-gradient-to-br from-amber-500/5 to-zinc-900/60 hover:border-amber-400/70";
  if (t === "BTC-USD") return "border-orange-500/50 bg-gradient-to-br from-orange-500/5 to-zinc-900/60 hover:border-orange-500/70";
  return "border-zinc-800 bg-zinc-900/60 hover:border-zinc-700 hover:bg-zinc-900";
};
const HOT_KEYWORDS = [
  "crash",
  "surge",
  "rally",
  "drop",
  "earnings",
  "fed",
  "inflation",
];

function rsiColor(rsi: number, buy = 30, sell = 70) {
  if (rsi < buy) return "text-emerald-400";
  if (rsi > sell) return "text-rose-400";
  return "text-zinc-400";
}
function rsiDot(rsi: number, buy = 30, sell = 70) {
  if (rsi < buy) return "bg-emerald-400";
  if (rsi > sell) return "bg-rose-400";
  return "bg-zinc-500";
}
function signalStyles(signal: Signal | "BUY" | "SELL" | "STRONG BUY" | "STRONG SELL") {
  switch (signal) {
    case "STRONG BUY":
    case "BUY":
      return "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30";
    case "STRONG SELL":
    case "SELL":
      return "bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/30";
    default:
      return "bg-zinc-500/15 text-zinc-400 ring-1 ring-zinc-500/30";
  }
}

function signalLabel(
  signal: Signal | "BUY" | "SELL",
  score?: number,
): Signal | "STRONG BUY" | "STRONG SELL" {
  if (typeof score === "number") {
    if (signal === "BUY" && score >= 5) return "STRONG BUY";
    if (signal === "SELL" && score <= -5) return "STRONG SELL";
  }
  return signal;
}

function scoreBadgeClass(score: number) {
  if (score >= 5) return "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40";
  if (score >= 2) return "bg-emerald-500/10 text-emerald-400/90 ring-1 ring-emerald-500/20";
  if (score >= -1) return "bg-zinc-500/15 text-zinc-300 ring-1 ring-zinc-500/30";
  if (score >= -4) return "bg-rose-500/10 text-rose-400/90 ring-1 ring-rose-500/20";
  return "bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/40";
}

// Lightweight inline sparkline derived from a deterministic seed per ticker.
function Sparkline({ ticker, signal }: { ticker: string; signal: Signal }) {
  const points = useMemo(() => {
    let s = 0;
    for (let i = 0; i < ticker.length; i++) s = (s * 31 + ticker.charCodeAt(i)) >>> 0;
    const rand = () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
    const N = 40;
    const arr: number[] = [];
    let v = 50;
    const drift = signal === "BUY" ? 0.6 : signal === "SELL" ? -0.6 : 0;
    for (let i = 0; i < N; i++) {
      v += (rand() - 0.5) * 6 + drift;
      arr.push(v);
    }
    return arr;
  }, [ticker, signal]);
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const W = 240;
  const H = 60;
  const step = W / (points.length - 1);
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(H - ((p - min) / range) * H).toFixed(1)}`)
    .join(" ");
  const last = points[points.length - 1];
  const lastY = H - ((last - min) / range) * H;
  const stroke =
    signal === "SELL" ? "#fb7185" : signal === "NEUTRAL" ? "#a1a1aa" : "#34d399";
  const fillId = `spark-${ticker.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-14 w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.25" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L${W},${H} L0,${H} Z`} fill={`url(#${fillId})`} />
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.5" />
      <circle cx={W} cy={lastY} r="2.5" fill={stroke} />
    </svg>
  );
}

// Synthesized recent live ticks derived from the current snapshot.
function LiveTicks({ stocks }: { stocks: Stock[] }) {
  const ticks = useMemo(() => {
    if (stocks.length === 0) return [] as { time: string; ticker: string; price: number; delta: number }[];
    const out: { time: string; ticker: string; price: number; delta: number }[] = [];
    let s = stocks.reduce((a, x) => a + x.ticker.length, 0) + 1;
    const rand = () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const st = stocks[Math.floor(rand() * stocks.length)];
      const t = new Date(now.getTime() - i * (2000 + rand() * 4000));
      const delta = (rand() - 0.5) * 10;
      out.push({
        time: t.toLocaleTimeString([], { hour12: false }),
        ticker: st.ticker,
        price: st.price + (rand() - 0.5) * st.price * 0.001,
        delta,
      });
    }
    return out;
  }, [stocks]);
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Live Ticks</span>
        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
      </div>
      <ul className="space-y-2 font-mono text-xs">
        {ticks.map((t, i) => {
          const up = t.delta >= 0;
          return (
            <li key={i} className="flex items-center justify-between gap-2">
              <span className="text-zinc-600">{t.time}</span>
              <span className="font-semibold text-zinc-300">{t.ticker}</span>
              <span className="text-zinc-400">${t.price.toFixed(2)}</span>
              <span className={up ? "text-emerald-400" : "text-rose-400"}>
                {up ? "▲" : "▼"} {Math.abs(t.delta).toFixed(1)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
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
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [backendHealthy, setBackendHealthy] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [selected, setSelected] = useState<Stock | null>(null);
  const [expandedReasons, setExpandedReasons] = useState<Record<string, boolean>>({});
  const confirmedKeysRef = useRef<Set<string>>(new Set());
  const [bulkDisabled, setBulkDisabled] = useState(false);
  const tradeKey = (t: { ticker: string; signal: string; price: number }) =>
    `${t.ticker}|${t.signal}|${t.price}`;

  // Sound + theme + AI features
  const [soundOn, setSoundOn] = useState(true);
  const [activeTab, setActiveTab] = useState("signals");
  const [featuredTicker, setFeaturedTicker] = useState<string>("AAPL");
  const [timeframe, setTimeframe] = useState<"15m" | "1h" | "1d">("15m");
  const [chartCandles, setChartCandles] = useState<import("@/components/CandleChart").Candle[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [insight, setInsight] = useState<string | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [sentiment, setSentiment] = useState<Map<string, SentimentResult>>(new Map());
  const prevSignalsRef = useRef<Map<string, string>>(new Map());
  const weeklyInsightFn = useServerFn(weeklyInsight);
  const classifyFn = useServerFn(classifyHeadlines);
  const explainSignalFn = useServerFn(explainSignal);
  const marketSummaryFn = useServerFn(marketSummary);

  // Ask AI modal
  const [askStock, setAskStock] = useState<Stock | null>(null);
  const [askText, setAskText] = useState<string>("");
  const [askLoading, setAskLoading] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

  // Daily market summary banner
  const [marketBrief, setMarketBrief] = useState<string | null>(null);
  const [marketBriefLoading, setMarketBriefLoading] = useState(false);

  useEffect(() => {
    loadTheme();
    setSoundOn(loadSoundPref());
  }, []);

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
      const raw: any[] = await res.json();
      const data: Stock[] = (Array.isArray(raw) ? raw : []).filter(
        (s) =>
          s &&
          typeof s.ticker === "string" &&
          typeof s.price === "number" &&
          typeof s.rsi === "number" &&
          typeof s.ma20 === "number" &&
          typeof s.ma50 === "number" &&
          typeof s.signal === "string",
      );
      const skipped = (Array.isArray(raw) ? raw.length : 0) - data.length;
      setStocks(data);
      setError(skipped > 0 && data.length === 0 ? "Backend returned no usable signals" : null);
      const now = new Date();
      setLastUpdate(now);

      const actionable = data.filter(
        (s) => s.signal === "BUY" || s.signal === "SELL",
      );

      // Sound on new signals (only after first load)
      const prev = prevSignalsRef.current;
      if (prev.size > 0) {
        actionable.forEach((s) => {
          if (prev.get(s.ticker) !== s.signal) {
            if (s.signal === "BUY") sounds.buy();
            else if (s.signal === "SELL") sounds.sell();
          }
        });
      }
      const next = new Map<string, string>();
      data.forEach((s) => next.set(s.ticker, s.signal));
      prevSignalsRef.current = next;

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

  // Fetch OHLCV candles for the featured chart whenever ticker or timeframe changes.
  useEffect(() => {
    if (!featuredTicker) return;
    const tfPath = timeframe === "1h" ? "1h" : timeframe === "1d" ? "1d" : "15m";
    let cancelled = false;
    setChartLoading(true);
    fetch(`https://iron-condor.duckdns.org/chart/${encodeURIComponent(featuredTicker)}/${tfPath}`, {
      headers: { "ngrok-skip-browser-warning": "true" },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((raw: Array<{ datetime: string; open: number; high: number; low: number; close: number; volume: number }>) => {
        if (cancelled) return;
        const candles = (Array.isArray(raw) ? raw : [])
          .map((r) => ({
            time: Math.floor(new Date(r.datetime).getTime() / 1000),
            open: Number(r.open),
            high: Number(r.high),
            low: Number(r.low),
            close: Number(r.close),
            volume: Number(r.volume) || 0,
          }))
          .filter((c) => Number.isFinite(c.time) && Number.isFinite(c.close));
        setChartCandles(candles);
      })
      .catch(() => {
        if (!cancelled) setChartCandles([]);
      })
      .finally(() => {
        if (!cancelled) setChartLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [featuredTicker, timeframe]);

  const manualRefresh = useCallback(async () => {
    setManualRefreshing(true);
    try {
      await fetchSignals();
    } finally {
      setManualRefreshing(false);
    }
  }, [fetchSignals]);

  // Health check ping every 5 minutes
  useEffect(() => {
    const ping = async () => {
      try {
        const res = await fetch("https://iron-condor.duckdns.org/health", {
          headers: { "ngrok-skip-browser-warning": "true" },
        });
        setBackendHealthy(res.ok);
      } catch {
        setBackendHealthy(false);
      }
    };
    ping();
    const id = setInterval(ping, 5 * 60_000);
    return () => clearInterval(id);
  }, []);

  // 1s tick for countdowns
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

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

  const [saveWarning, setSaveWarning] = useState<string | null>(null);
  const flashWarning = (msg: string) => {
    setSaveWarning(msg);
    setTimeout(() => setSaveWarning((cur) => (cur === msg ? null : cur)), 4000);
  };

  const postTradeDecision = async (
    trade: PendingTrade,
    decision: "confirm" | "reject",
  ) => {
    if (decision === "confirm") {
      const key = tradeKey(trade);
      if (confirmedKeysRef.current.has(key)) return;
      confirmedKeysRef.current.add(key);
    }
    try {
      const res = await fetch(`${TRADES_BASE}/${decision}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({
          ticker: trade.ticker,
          price: trade.price,
          signal: trade.signal,
          rsi: trade.rsi,
          ma20: trade.ma20,
          ma50: trade.ma50,
          timestamp: Date.now(),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      flashWarning("Decision saved locally only — backend sync failed.");
    }
  };

  const decide = (id: string, status: "confirmed" | "rejected") => {
    setPending((prev) => {
      const trade = prev.find((p) => p.id === id);
      if (trade) {
        void postTradeDecision(trade, status === "confirmed" ? "confirm" : "reject");
      }
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
        sounds.win();
        try {
          confetti({
            particleCount: 60,
            spread: 65,
            origin: { y: 0.7 },
            colors: ["#34d399", "#60a5fa", "#fbbf24"],
            disableForReducedMotion: true,
          });
        } catch {
          /* ignore */
        }
      }
      if (status === "rejected") {
        setRejectedCount((n) => n + 1);
        sounds.loss();
      }
      return prev.filter((p) => p.id !== id);
    });
  };

  // Load persisted confirmed trade history once on mount
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const res = await fetch(TRADES_BASE, {
          headers: { "ngrok-skip-browser-warning": "true" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const arr: any[] = Array.isArray(data) ? data : data.trades ?? [];
        if (cancel) return;
        const restored: ConfirmedTrade[] = arr
          .filter((t) => (t.signal ?? t.direction) === "BUY" || (t.signal ?? t.direction) === "SELL")
          .map((t, i) => ({
            id: t.id ?? `hist-${i}-${t.timestamp ?? Date.now()}`,
            ticker: t.ticker,
            entryPrice: Number(t.price ?? t.entryPrice ?? 0),
            direction: (t.signal ?? t.direction) as "BUY" | "SELL",
            timestamp: typeof t.timestamp === "number"
              ? (t.timestamp > 1e12 ? t.timestamp : t.timestamp * 1000)
              : Date.now(),
          }));
        // Dedupe by ticker+direction, keep the most recent
        const byKey = new Map<string, ConfirmedTrade>();
        for (const t of restored) {
          const k = `${t.ticker}|${t.direction}`;
          const ex = byKey.get(k);
          if (!ex || t.timestamp > ex.timestamp) byKey.set(k, t);
        }
        const deduped = Array.from(byKey.values());
        // Seed dedupe set so future confirms for same ticker+signal+price are skipped
        for (const t of deduped) {
          confirmedKeysRef.current.add(`${t.ticker}|${t.direction}|${t.entryPrice}`);
        }
        if (deduped.length > 0) setConfirmed((cur) => (cur.length === 0 ? deduped : cur));
      } catch {
        flashWarning("Couldn't load trade history from server.");
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);
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

  // Sentiment classification on news (debounced cache)
  useEffect(() => {
    if (news.length === 0) return;
    const need = news.filter((n) => !sentiment.has(n.url)).slice(0, 20);
    if (need.length === 0) return;
    let cancel = false;
    classifyFn({
      data: { items: need.map((n) => ({ url: n.url, title: n.title, ticker: n.ticker })) },
    })
      .then((res) => {
        if (cancel || !res.results) return;
        setSentiment((prev) => {
          const m = new Map(prev);
          res.results.forEach((r) => m.set(r.url, r));
          return m;
        });
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, [news, sentiment, classifyFn]);

  // Weekly insight (load when confirmed trades change, throttled)
  const lastInsightAt = useRef(0);
  useEffect(() => {
    const now = Date.now();
    if (now - lastInsightAt.current < 60_000) return;
    if (stocks.length === 0) return;
    lastInsightAt.current = now;
    setInsightLoading(true);
    const ctx = `Confirmed trades: ${confirmed.length}, rejected: ${rejectedCount}, avg P/L: ${totalPnl.toFixed(2)}%. Last 5 signals: ${history.slice(0, 5).map((h) => `${h.ticker} ${h.signal} RSI ${h.rsi.toFixed(0)}`).join("; ")}.`;
    weeklyInsightFn({ data: { context: ctx } })
      .then((res) => setInsight(res.insight))
      .catch(() => {})
      .finally(() => setInsightLoading(false));
  }, [confirmed.length, rejectedCount, stocks.length, weeklyInsightFn, history, totalPnl]);

  // Daily market summary (refresh every 30 min)
  const loadMarketBrief = useCallback(() => {
    if (stocks.length === 0) return;
    setMarketBriefLoading(true);
    marketSummaryFn({
      data: {
        stocks: stocks.map((s) => ({
          ticker: s.ticker,
          price: s.price,
          rsi: s.rsi,
          ma20: s.ma20,
          signal: s.signal,
        })),
      },
    })
      .then((res) => {
        if (res.summary) setMarketBrief(res.summary);
      })
      .catch(() => {})
      .finally(() => setMarketBriefLoading(false));
  }, [stocks, marketSummaryFn]);

  const lastBriefAt = useRef(0);
  useEffect(() => {
    if (stocks.length === 0) return;
    const now = Date.now();
    if (marketBrief && now - lastBriefAt.current < 30 * 60_000) return;
    lastBriefAt.current = now;
    loadMarketBrief();
    const id = setInterval(() => {
      lastBriefAt.current = Date.now();
      loadMarketBrief();
    }, 30 * 60_000);
    return () => clearInterval(id);
  }, [stocks.length, loadMarketBrief, marketBrief]);

  const askAI = useCallback(
    (s: Stock) => {
      setAskStock(s);
      setAskText("");
      setAskError(null);
      setAskLoading(true);
      explainSignalFn({
        data: {
          ticker: s.ticker,
          price: s.price,
          rsi: s.rsi,
          ma20: s.ma20,
          ma50: s.ma50,
          signal: s.signal,
        },
      })
        .then((res) => {
          if (res.error) setAskError(res.error);
          else setAskText(res.explanation);
        })
        .catch((e) => setAskError(e instanceof Error ? e.message : "Failed"))
        .finally(() => setAskLoading(false));
    },
    [explainSignalFn],
  );

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
    if (next) sounds.click();
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <TickerTape stocks={stocks} />
      <div className="mx-auto max-w-7xl px-6 py-8">
        {saveWarning && (
          <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
            ⚠ {saveWarning}
          </div>
        )}
        {!backendHealthy && (
          <div className="mb-4 rounded-lg border border-amber-500/50 bg-amber-500/15 px-4 py-3 text-sm font-medium text-amber-200">
            ⚠ Backend offline — signals may be stale. Last known data shown.
          </div>
        )}
        <header className="mb-4 flex items-center justify-end gap-3 text-xs text-zinc-500">
          {(() => {
            const lastMs = lastUpdate ? now - lastUpdate.getTime() : 0;
            const lastSec = Math.max(0, Math.floor(lastMs / 1000));
            const nextSec = lastUpdate ? Math.max(0, 60 - lastSec) : 60;
            const tooltip = lastUpdate
              ? `Last fetch: ${lastSec}s ago · Next refresh in: ${nextSec}s`
              : "Waiting for first fetch…";
            return (
              <span className="flex items-center gap-2" title={tooltip}>
                <span
                  className={`h-2 w-2 rounded-full ${
                    error ? "bg-rose-400" : "bg-emerald-400 animate-pulse"
                  }`}
                />
                {error ? "Disconnected" : "Live"}
              </span>
            );
          })()}
          <button
            onClick={manualRefresh}
            disabled={manualRefreshing}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-60"
            aria-label="Refresh now"
            title="Refresh now"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${manualRefreshing ? "animate-spin" : ""}`} />
          </button>
          {lastUpdate && <span>Updated {lastUpdate.toLocaleTimeString()}</span>}
          <button
            onClick={toggleSound}
            className="rounded-md border border-zinc-700 bg-zinc-900 p-1.5 text-zinc-300 hover:bg-zinc-800"
            aria-label="Toggle sound"
            title={soundOn ? "Sound on" : "Sound off"}
          >
            {soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          </button>
          <ThemeSwitcher />
        </header>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
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
              <TabsTrigger value="risk">Risk</TabsTrigger>
              <TabsTrigger value="scanner">Scanner</TabsTrigger>
              <TabsTrigger value="analytics">Analytics</TabsTrigger>
              <TabsTrigger value="coach">
                <Sparkles className="mr-1 h-3 w-3" />
                Coach
              </TabsTrigger>
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

            {(marketBrief || marketBriefLoading) && (
              <div className="mb-6 flex items-start gap-3 rounded-xl border border-sky-500/30 bg-gradient-to-r from-sky-500/10 to-zinc-900/40 p-4">
                <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-sky-400" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-sky-400">
                      AI Daily Market Brief
                    </div>
                    <button
                      onClick={loadMarketBrief}
                      disabled={marketBriefLoading}
                      className="text-[10px] uppercase tracking-wide text-zinc-500 hover:text-zinc-300 disabled:opacity-50"
                    >
                      {marketBriefLoading ? "Refreshing" : "Refresh"}
                    </button>
                  </div>
                  <div className="mt-1 text-sm text-zinc-200">
                    {marketBrief ?? "Analyzing today's market"}
                  </div>
                </div>
              </div>
            )}

            {stocks.length > 0 && (() => {
              const fs = stocks.find((x) => x.ticker === featuredTicker) ?? stocks[0];
              const pct = fs.ma20 ? ((fs.price - fs.ma20) / fs.ma20) * 100 : 0;
              const pctUp = pct >= 0;
              return (
                <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_280px]">
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
                    <div className="mb-4 flex flex-wrap items-center gap-3">
                      <select
                        value={fs.ticker}
                        onChange={(e) => setFeaturedTicker(e.target.value)}
                        className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                      >
                        {stocks.map((x) => (
                          <option key={x.ticker} value={x.ticker}>
                            {x.ticker} - {displayName(x.ticker)}
                          </option>
                        ))}
                      </select>
                      <span className="text-2xl font-mono font-semibold tracking-tight">
                        ${fs.price.toFixed(2)}
                      </span>
                      <span
                        className={`rounded-md px-2 py-1 text-xs font-mono font-semibold ${
                          pctUp
                            ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
                            : "bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30"
                        }`}
                      >
                        {pctUp ? "+" : ""}
                        {pct.toFixed(2)}%
                      </span>
                      <span
                        className={`rounded-md px-2.5 py-1 text-xs font-semibold tracking-wide ${signalStyles(
                          signalLabel(fs.signal, fs.score),
                        )}`}
                      >
                        {signalLabel(fs.signal, fs.score)}
                      </span>
                      <div className="ml-auto inline-flex overflow-hidden rounded-md border border-zinc-700 text-xs">
                        {([
                          { tf: "15m", label: "15m" },
                          { tf: "1h", label: "Daily (1Y)" },
                          { tf: "1d", label: "Daily (Max)" },
                        ] as const).map(({ tf, label }) => (
                          <button
                            key={tf}
                            onClick={() => setTimeframe(tf)}
                            className={`px-3 py-1.5 ${
                              timeframe === tf
                                ? "bg-zinc-100 text-zinc-900"
                                : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <CandleChart
                      ticker={fs.ticker}
                      price={fs.price}
                      ma20={fs.ma20}
                      ma50={fs.ma50}
                      candles={chartCandles}
                      loading={chartLoading}
                    />
                  </div>
                  <LiveTicks stocks={stocks} />
                </div>
              );
            })()}

            {loading ? (
              <div className="text-zinc-500">Loading signals…</div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {stocks.map((s) => (
                  <div
                    key={s.ticker}
                    className={`group relative rounded-xl border p-5 transition ${assetCardClass(s.ticker)}`}
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
                            {displayName(s.ticker)}
                          </h2>
                          <p className="mt-1 text-2xl font-mono font-medium">
                            ${s.price.toFixed(2)}
                          </p>
                          {(error || !backendHealthy) && (
                            <p className="mt-0.5 text-[10px] text-amber-400/80">
                              Showing cached data
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`rounded-md px-2.5 py-1 text-xs font-semibold tracking-wide ${signalStyles(
                              signalLabel(s.signal, s.score),
                            )}`}
                          >
                            {signalLabel(s.signal, s.score)}
                          </span>
                          {typeof s.score === "number" && (
                            <span
                              className={`rounded-md px-1.5 py-1 text-xs font-mono font-semibold ${scoreBadgeClass(s.score)}`}
                              title="Signal strength"
                            >
                              {s.score > 0 ? `+${s.score}` : s.score}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="mt-3">
                        <Sparkline ticker={s.ticker} signal={s.signal} />
                      </div>
                      <div className="mt-4 space-y-2.5 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-500">RSI</span>
                          <span className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${rsiDot(s.rsi, s.rsi_buy, s.rsi_sell)}`} />
                            <span className={`font-mono font-medium ${rsiColor(s.rsi, s.rsi_buy, s.rsi_sell)}`}>
                              {s.rsi.toFixed(1)}
                            </span>
                          </span>
                        </div>
                        {(typeof s.rsi_buy === "number" || typeof s.rsi_sell === "number") && (
                          <div className="-mt-1.5 text-right text-[11px] text-zinc-500">
                            Buy threshold: {typeof s.rsi_buy === "number" ? s.rsi_buy.toFixed(0) : "—"} · Sell threshold: {typeof s.rsi_sell === "number" ? s.rsi_sell.toFixed(0) : "—"}
                          </div>
                        )}
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
                    {s.reasons && s.reasons.length > 0 && (
                      <div className="mt-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedReasons((prev) => ({ ...prev, [s.ticker]: !prev[s.ticker] }));
                          }}
                          className="flex w-full items-center justify-between rounded-md px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
                        >
                          <span>Reasons ({s.reasons.length})</span>
                          <ChevronDown
                            className={`h-3.5 w-3.5 transition-transform ${
                              expandedReasons[s.ticker] ? "" : "-rotate-90"
                            }`}
                          />
                        </button>
                        {expandedReasons[s.ticker] && (
                          <ul className="mt-1.5 space-y-1 px-2 text-xs text-zinc-500">
                            {s.reasons.map((r, i) => (
                              <li key={i} className="flex gap-1.5">
                                <span className="text-zinc-600">•</span>
                                <span>{r}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        askAI(s);
                      }}
                      className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-300 transition hover:bg-sky-500/20"
                    >
                      <Sparkles className="h-3 w-3" />
                      Ask AI
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
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-5 py-3">
                      <span className="text-xs text-amber-400/90">
                        ⚠ Always verify before confirming — bot signals are not financial advice
                      </span>
                      <div className="flex gap-2">
                        <button
                          disabled={bulkDisabled}
                          onClick={() => {
                            if (bulkDisabled) return;
                            setBulkDisabled(true);
                            visiblePending.forEach((p) => decide(p.id, "confirmed"));
                            setTimeout(() => setBulkDisabled(false), 3000);
                          }}
                          className="rounded-md bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-400 ring-1 ring-emerald-500/30 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Confirm All
                        </button>
                        <button
                          disabled={bulkDisabled}
                          onClick={() => {
                            if (bulkDisabled) return;
                            setBulkDisabled(true);
                            visiblePending.forEach((p) => decide(p.id, "rejected"));
                            setTimeout(() => setBulkDisabled(false), 3000);
                          }}
                          className="rounded-md bg-rose-500/15 px-3 py-1 text-xs font-medium text-rose-400 ring-1 ring-rose-500/30 transition hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Reject All
                        </button>
                      </div>
                    </div>
                    <ul className="divide-y divide-zinc-800">
                      {visiblePending.map((p) => {
                        const mins = Math.max(0, Math.floor((Date.now() - p.createdAt) / 60000));
                        const ago = mins < 1 ? "just now" : `${mins} minute${mins === 1 ? "" : "s"} ago`;
                        const t2 = p.signal === "BUY" ? p.price * 1.02 : p.price * 0.98;
                        const t4 = p.signal === "BUY" ? p.price * 1.04 : p.price * 0.96;
                        const targetCls =
                          p.signal === "BUY"
                            ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
                            : "bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30";
                        const targetLabel = p.signal === "BUY" ? "+" : "-";
                        return (
                          <li key={p.id} className="px-5 py-4">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                              <div className="flex items-start gap-4">
                                <div className="flex flex-col items-start gap-1">
                                  <span
                                    className={`rounded-md px-2.5 py-1 text-xs font-semibold ${signalStyles(
                                      signalLabel(p.signal, p.score),
                                    )}`}
                                  >
                                    {signalLabel(p.signal, p.score)}
                                  </span>
                                  {typeof p.score === "number" && (
                                    <span
                                      className={`rounded-md px-1.5 py-0.5 text-[11px] font-mono font-semibold ${scoreBadgeClass(p.score)}`}
                                    >
                                      {p.score > 0 ? `+${p.score}` : p.score}
                                    </span>
                                  )}
                                </div>
                                <div>
                                  <div className="font-semibold">{displayName(p.ticker)}</div>
                                  <div className="text-xs text-zinc-500 font-mono">
                                    ${p.price.toFixed(2)} · RSI {p.rsi.toFixed(1)}
                                  </div>
                                  <div className="mt-0.5 text-[11px] text-zinc-500">{ago}</div>
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-mono ${targetCls}`}>
                                      {targetLabel}2% target · ${t2.toFixed(2)}
                                    </span>
                                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-mono ${targetCls}`}>
                                      {targetLabel}4% target · ${t4.toFixed(2)}
                                    </span>
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
                            </div>
                            {p.reasons && p.reasons.length > 0 && (
                              <ul className="mt-3 space-y-1 pl-1 text-xs text-zinc-400">
                                {p.reasons.map((r, i) => (
                                  <li key={i} className="flex gap-1.5">
                                    <span className="text-zinc-600">•</span>
                                    <span>{r}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </>
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
              {[...TRACKED, "MARKET"].map((t) => (
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
                const sent = sentiment.get(a.url);
                const sentStyles = sent
                  ? sent.label === "bullish"
                    ? "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30"
                    : sent.label === "bearish"
                      ? "bg-rose-500/15 text-rose-400 ring-rose-500/30"
                      : "bg-zinc-700/40 text-zinc-300 ring-zinc-600/40"
                  : "";
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
                      {sent && (
                        <span
                          className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${sentStyles}`}
                          title={`AI sentiment confidence ${Math.round(sent.label === "bearish" ? 100 - sent.score : sent.score)}%`}
                        >
                          {sent.label} · {Math.round(sent.label === "bearish" ? 100 - sent.score : sent.score)}%
                        </span>
                      )}
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
            <div className="mt-6">
              <CompareChart stocks={stocks} />
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

          <TabsContent
            value="risk"
            className="data-[state=active]:animate-in data-[state=active]:fade-in-50 data-[state=active]:slide-in-from-bottom-1"
          >
            <Risk />
          </TabsContent>

          <TabsContent
            value="scanner"
            className="data-[state=active]:animate-in data-[state=active]:fade-in-50 data-[state=active]:slide-in-from-bottom-1"
          >
            <Scanner
              onSendToApprovals={(s) => {
                setPending((prev) => [
                  ...prev,
                  {
                    ticker: s.ticker,
                    price: s.price,
                    rsi: s.rsi,
                    ma20: s.ma20,
                    ma50: s.ma50,
                    signal: s.signal,
                    id: `${s.ticker}-${s.signal}-${Date.now()}-${Math.random()}`,
                    status: "pending",
                    createdAt: Date.now(),
                  },
                ]);
              }}
            />
          </TabsContent>

          <TabsContent
            value="analytics"
            className="data-[state=active]:animate-in data-[state=active]:fade-in-50 data-[state=active]:slide-in-from-bottom-1"
          >
            <Analytics
              confirmed={confirmed}
              rejectedCount={rejectedCount}
              history={history}
            />
          </TabsContent>

          <TabsContent
            value="coach"
            className="data-[state=active]:animate-in data-[state=active]:fade-in-50 data-[state=active]:slide-in-from-bottom-1"
          >
            <Coach
              stocks={stocks}
              confirmed={confirmed}
              rejectedCount={rejectedCount}
              pendingCount={visiblePending.length}
              portfolioPnl={totalPnl}
            />
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={!!askStock} onOpenChange={(o) => !o && setAskStock(null)}>
        <DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-lg">
          {askStock && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-sky-400" />
                  AI Signal Explainer · {askStock.ticker}
                </DialogTitle>
                <p className="text-xs text-zinc-500 font-mono">
                  ${askStock.price.toFixed(2)} · RSI {askStock.rsi.toFixed(1)} · {askStock.signal}
                </p>
              </DialogHeader>
              <div className="mt-2 min-h-[120px] text-sm leading-relaxed text-zinc-200">
                {askLoading && <div className="text-zinc-500">Otto is thinking…</div>}
                {askError && (
                  <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-300">
                    {askError}
                  </div>
                )}
                {!askLoading && !askError && askText && (
                  <div className="whitespace-pre-wrap">{askText}</div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

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
              <div className="w-full">
                <CandleChart
                  ticker={selected.ticker}
                  price={selected.price}
                  ma20={selected.ma20}
                  ma50={selected.ma50}
                />
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
      <Otto
        totalPnl={totalPnl}
        pendingCount={visiblePending.length}
        confirmedCount={confirmed.length}
        onOpenCoach={() => setActiveTab("coach")}
      />
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
