import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";

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

function Dashboard() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [pending, setPending] = useState<PendingTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchSignals = useCallback(async () => {
    try {
      const res = await fetch(API_URL, {
        headers: { "ngrok-skip-browser-warning": "true" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Stock[] = await res.json();
      setStocks(data);
      setError(null);
      setLastUpdate(new Date());

      setPending((prev) => {
        const existingKeys = new Set(prev.map((p) => `${p.ticker}-${p.signal}`));
        const newOnes: PendingTrade[] = data
          .filter((s) => s.signal !== "NEUTRAL")
          .filter((s) => !existingKeys.has(`${s.ticker}-${s.signal}`))
          .map((s) => ({
            ...s,
            id: `${s.ticker}-${s.signal}-${Date.now()}`,
            status: "pending" as const,
          }));
        return [...prev, ...newOnes];
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

  const decide = (id: string, status: "confirmed" | "rejected") => {
    setPending((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
  };

  const visiblePending = pending.filter((p) => p.status === "pending");

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
              <article
                key={s.ticker}
                className="group rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 transition hover:border-zinc-700 hover:bg-zinc-900"
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
              </article>
            ))}
            {stocks.length === 0 && (
              <div className="text-zinc-500">No signals available.</div>
            )}
          </div>
        )}

        <section className="mt-12">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-xl font-semibold tracking-tight">
              Trade Approvals
            </h2>
            <span className="text-xs text-zinc-500">
              {visiblePending.length} pending
            </span>
          </div>

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
        </section>
      </div>
    </div>
  );
}
