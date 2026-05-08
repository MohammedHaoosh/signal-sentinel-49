import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const API_URL = "http://209.38.43.35:5000/signals";

interface Stock {
  ticker: string;
  price: number;
  rsi: number;
  ma20: number;
  ma50: number;
  signal: string;
  high?: number;
  low?: number;
}

interface SendPayload {
  ticker: string;
  price: number;
  rsi: number;
  ma20: number;
  ma50: number;
  signal: "BUY" | "SELL";
}

interface Props {
  onSendToApprovals?: (s: SendPayload) => void;
}

type CondKey =
  | "rsiOversold"
  | "rsiOverbought"
  | "aboveMA20"
  | "belowMA20"
  | "aboveMA50"
  | "belowMA50"
  | "goldenCross"
  | "deathCross"
  | "highVol"
  | "near52High"
  | "near52Low";

const CONDITIONS: { key: CondKey; label: string; tone: "buy" | "sell" | "info" }[] = [
  { key: "rsiOversold", label: "RSI Oversold (<30)", tone: "buy" },
  { key: "rsiOverbought", label: "RSI Overbought (>70)", tone: "sell" },
  { key: "aboveMA20", label: "Price > MA20", tone: "buy" },
  { key: "belowMA20", label: "Price < MA20", tone: "sell" },
  { key: "aboveMA50", label: "Price > MA50", tone: "buy" },
  { key: "belowMA50", label: "Price < MA50", tone: "sell" },
  { key: "goldenCross", label: "Golden Cross (MA20>MA50)", tone: "buy" },
  { key: "deathCross", label: "Death Cross (MA20<MA50)", tone: "sell" },
  { key: "highVol", label: "High Volatility (>2%)", tone: "info" },
  { key: "near52High", label: "Near 52w High", tone: "sell" },
  { key: "near52Low", label: "Near 52w Low", tone: "buy" },
];

const toneCls = (t: "buy" | "sell" | "info") =>
  t === "buy"
    ? "bg-emerald-500/20 text-emerald-200 border-emerald-400/50"
    : t === "sell"
    ? "bg-red-500/20 text-red-200 border-red-400/50"
    : "bg-amber-500/20 text-amber-200 border-amber-400/50";

interface ScanResult {
  ticker: string;
  price: number;
  rsi: number;
  ma20: number;
  ma50: number;
  matched: CondKey[];
  score: number;
  bias: "BUY" | "SELL" | "NEUTRAL";
  summary: string;
}

interface HistEntry {
  time: number;
  count: number;
  top?: { ticker: string; score: number; bias: string };
}

function evaluate(s: Stock, enabled: Record<CondKey, boolean>): ScanResult | null {
  // Approximate 52w high/low from API or fallback
  const hi = s.high ?? s.price * 1.15;
  const lo = s.low ?? s.price * 0.85;
  const volPct = Math.abs(s.price - s.ma20) / s.ma20 * 100;

  const all: Record<CondKey, boolean> = {
    rsiOversold: s.rsi < 30,
    rsiOverbought: s.rsi > 70,
    aboveMA20: s.price > s.ma20,
    belowMA20: s.price < s.ma20,
    aboveMA50: s.price > s.ma50,
    belowMA50: s.price < s.ma50,
    goldenCross: s.ma20 > s.ma50 && Math.abs(s.ma20 - s.ma50) / s.ma50 < 0.02,
    deathCross: s.ma20 < s.ma50 && Math.abs(s.ma20 - s.ma50) / s.ma50 < 0.02,
    highVol: volPct > 2,
    near52High: (hi - s.price) / hi < 0.05,
    near52Low: (s.price - lo) / lo < 0.05,
  };

  const matched = (Object.keys(all) as CondKey[]).filter((k) => enabled[k] && all[k]);
  if (matched.length === 0) return null;

  // Score 1-10 scaled by how many matched out of enabled
  const enabledCount = Object.values(enabled).filter(Boolean).length || 1;
  const score = Math.max(1, Math.min(10, Math.round((matched.length / enabledCount) * 10)));

  const buyHits = matched.filter((m) =>
    ["rsiOversold", "aboveMA20", "aboveMA50", "goldenCross", "near52Low"].includes(m)
  ).length;
  const sellHits = matched.filter((m) =>
    ["rsiOverbought", "belowMA20", "belowMA50", "deathCross", "near52High"].includes(m)
  ).length;
  const bias: "BUY" | "SELL" | "NEUTRAL" =
    buyHits > sellHits ? "BUY" : sellHits > buyHits ? "SELL" : "NEUTRAL";

  const parts: string[] = [];
  if (all.rsiOversold && enabled.rsiOversold) parts.push(`oversold with RSI at ${s.rsi.toFixed(1)}`);
  if (all.rsiOverbought && enabled.rsiOverbought) parts.push(`overbought with RSI at ${s.rsi.toFixed(1)}`);
  if (all.belowMA20 && all.belowMA50 && enabled.belowMA20 && enabled.belowMA50)
    parts.push("trading below both moving averages");
  else if (all.aboveMA20 && all.aboveMA50 && enabled.aboveMA20 && enabled.aboveMA50)
    parts.push("trading above both moving averages");
  if (all.goldenCross && enabled.goldenCross) parts.push("showing a golden cross");
  if (all.deathCross && enabled.deathCross) parts.push("showing a death cross");
  if (all.highVol && enabled.highVol) parts.push(`elevated volatility (${volPct.toFixed(1)}%)`);
  if (all.near52High && enabled.near52High) parts.push("near its 52-week high");
  if (all.near52Low && enabled.near52Low) parts.push("near its 52-week low");

  const verdict =
    bias === "BUY"
      ? "strong buy candidate"
      : bias === "SELL"
      ? "strong sell candidate"
      : "watch closely";
  const summary = `${s.ticker} is ${parts.join(", ") || "matching filters"} — ${verdict}.`;

  return { ticker: s.ticker, price: s.price, rsi: s.rsi, ma20: s.ma20, ma50: s.ma50, matched, score, bias, summary };
}

function strengthColor(score: number) {
  if (score >= 7) return "bg-emerald-500";
  if (score >= 4) return "bg-amber-500";
  return "bg-red-500";
}

export default function Scanner({ onSendToApprovals }: Props) {
  const [enabled, setEnabled] = useState<Record<CondKey, boolean>>(() =>
    CONDITIONS.reduce((acc, c) => ({ ...acc, [c.key]: true }), {} as Record<CondKey, boolean>)
  );
  const [results, setResults] = useState<ScanResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoScan, setAutoScan] = useState(false);
  const [history, setHistory] = useState<HistEntry[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runScan = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(API_URL, { headers: { "ngrok-skip-browser-warning": "true" } });
      const data = await res.json();
      const arr: Stock[] = Array.isArray(data) ? data : data.signals ?? [];
      const evaluated = arr
        .map((s) => evaluate(s, enabled))
        .filter((r): r is ScanResult => r !== null)
        .sort((a, b) => b.score - a.score);
      setResults(evaluated);
      setHistory((prev) =>
        [
          {
            time: Date.now(),
            count: evaluated.length,
            top: evaluated[0]
              ? { ticker: evaluated[0].ticker, score: evaluated[0].score, bias: evaluated[0].bias }
              : undefined,
          },
          ...prev,
        ].slice(0, 20)
      );
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    runScan();
  }, [runScan]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (autoScan) {
      intervalRef.current = setInterval(runScan, 60000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoScan, runScan]);

  const enabledCount = useMemo(() => Object.values(enabled).filter(Boolean).length, [enabled]);

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card className="p-6 bg-card/60 backdrop-blur border-border/50">
        <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-semibold">Multi-Condition Scanner</h2>
            <p className="text-sm text-muted-foreground">
              {enabledCount} condition{enabledCount === 1 ? "" : "s"} active
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch checked={autoScan} onCheckedChange={setAutoScan} id="auto" />
              <Label htmlFor="auto" className="text-sm">Auto-scan 60s</Label>
            </div>
            <Button
              onClick={runScan}
              disabled={loading}
              className={`bg-emerald-600 hover:bg-emerald-500 text-white ${
                autoScan ? "animate-pulse shadow-[0_0_20px_rgba(16,185,129,0.5)]" : ""
              }`}
            >
              {loading ? "Scanning…" : "Scan Now"}
            </Button>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {CONDITIONS.map((c) => (
            <label
              key={c.key}
              className="flex items-center gap-2 p-2 rounded-md bg-muted/30 border border-border/50 cursor-pointer hover:bg-muted/50 transition-colors"
            >
              <Switch
                checked={enabled[c.key]}
                onCheckedChange={(v) => setEnabled((prev) => ({ ...prev, [c.key]: v }))}
              />
              <span className="text-sm">{c.label}</span>
            </label>
          ))}
        </div>
      </Card>

      {/* Results */}
      <div>
        <h3 className="text-lg font-semibold mb-3">
          Scan Results {results.length > 0 && <span className="text-muted-foreground text-sm">({results.length})</span>}
        </h3>
        {results.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground bg-card/60">
            No stocks match your current filters — try adjusting the conditions above.
          </Card>
        ) : (
          <div className="space-y-3">
            {results.map((r) => (
              <Card
                key={r.ticker}
                className="p-4 bg-card/60 backdrop-blur border-border/50 animate-in fade-in slide-in-from-bottom-1"
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xl font-bold">{r.ticker}</span>
                      <span className="text-lg font-mono">${r.price.toFixed(2)}</span>
                      <Badge
                        variant="outline"
                        className={
                          r.bias === "BUY"
                            ? "border-emerald-400/50 text-emerald-300 bg-emerald-500/10"
                            : r.bias === "SELL"
                            ? "border-red-400/50 text-red-300 bg-red-500/10"
                            : "border-border text-muted-foreground"
                        }
                      >
                        {r.bias}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">{r.summary}</p>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {r.matched.map((m) => {
                        const cond = CONDITIONS.find((c) => c.key === m)!;
                        return (
                          <Badge key={m} variant="outline" className={`text-xs border ${toneCls(cond.tone)}`}>
                            {cond.label}
                          </Badge>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-16">Strength</span>
                      <div className="flex-1 h-2 rounded-full bg-muted/40 overflow-hidden max-w-xs">
                        <div
                          className={`h-full transition-all ${strengthColor(r.score)}`}
                          style={{ width: `${r.score * 10}%` }}
                        />
                      </div>
                      <span className="text-sm font-mono font-semibold">{r.score}/10</span>
                    </div>
                  </div>
                  {onSendToApprovals && r.bias !== "NEUTRAL" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        onSendToApprovals({
                          ticker: r.ticker,
                          price: r.price,
                          rsi: r.rsi,
                          ma20: r.ma20,
                          ma50: r.ma50,
                          signal: r.bias as "BUY" | "SELL",
                        })
                      }
                    >
                      Send to Approvals
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* History */}
      <Card className="p-6 bg-card/60 backdrop-blur border-border/50">
        <h3 className="text-lg font-semibold mb-3">Scan History</h3>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No scans yet.</p>
        ) : (
          <div className="space-y-1.5 text-sm font-mono max-h-72 overflow-y-auto">
            {history.map((h, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-1.5 px-2 rounded border-b border-border/30 last:border-0"
              >
                <span className="text-muted-foreground">
                  {new Date(h.time).toLocaleTimeString()}
                </span>
                <span>
                  {h.count} match{h.count === 1 ? "" : "es"}
                  {h.top && (
                    <span className="ml-2 text-muted-foreground">
                      · top: {h.top.ticker} ({h.top.bias} {h.top.score}/10)
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
