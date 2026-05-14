import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";

const BASE = "https://iron-condor.duckdns.org";
const HEADERS = { "ngrok-skip-browser-warning": "true" };

interface Summary {
  current_balance: number;
  total_pl: number;
  total_pl_pct: number;
  win_rate: number;
  open_positions: number;
  best_trade: number;
  worst_trade: number;
}

interface Trade {
  id: number;
  ticker: string;
  direction: string;
  entry_price: number;
  exit_price: number | null;
  entry_time: string;
  exit_time: string | null;
  allocated_usd: number;
  quantity: number;
  status: string;
  profit_loss: number;
  profit_loss_pct: number;
  score: number;
  approved_via: string;
  notes?: string;
  trader_notes?: string;
}

interface Props {
  livePrices: Record<string, number>;
}

const fmtUsd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
const fmtSigned = (n: number) => `${n >= 0 ? "+" : ""}${fmtUsd(n)}`;
const pnlColor = (n: number) =>
  n > 0 ? "text-emerald-400" : n < 0 ? "text-red-400" : "text-zinc-300";
const isShort = (d: string) => /short|sell/i.test(d);

export default function PaperTrading({ livePrices }: Props) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [closingId, setClosingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const refresh = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([
        fetch(`${BASE}/paper/summary`, { headers: HEADERS }).then((r) => r.json()),
        fetch(`${BASE}/paper/trades`, { headers: HEADERS }).then((r) => r.json()),
      ]);
      setSummary(s);
      setTrades(Array.isArray(t) ? t : []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load paper data");
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  const closePosition = async (id: number) => {
    setClosingId(id);
    try {
      await fetch(`${BASE}/paper/close/${id}`, { method: "POST", headers: HEADERS });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to close position");
    } finally {
      setClosingId(null);
    }
  };

  const { open, closed } = useMemo(() => {
    const list = trades ?? [];
    return {
      open: list.filter((t) => t.status === "open"),
      closed: list
        .filter((t) => t.status !== "open")
        .sort((a, b) => (b.exit_time ?? "").localeCompare(a.exit_time ?? "")),
    };
  }, [trades]);

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Current Balance" value={summary ? fmtUsd(summary.current_balance) : null} />
        <StatCard
          label="Total P&L"
          value={
            summary ? (
              <span className={pnlColor(summary.total_pl)}>
                {fmtSigned(summary.total_pl)}{" "}
                <span className="text-sm opacity-80">({fmtPct(summary.total_pl_pct)})</span>
              </span>
            ) : null
          }
        />
        <StatCard
          label="Win Rate"
          value={summary ? `${(summary.win_rate * (summary.win_rate <= 1 ? 100 : 1)).toFixed(0)}%` : null}
        />
        <StatCard label="Open Positions" value={summary ? String(summary.open_positions) : null} />
      </div>

      {/* Open positions */}
      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardHeader>
          <CardTitle className="text-zinc-100">Open Positions</CardTitle>
        </CardHeader>
        <CardContent>
          {trades === null ? (
            <Skeleton className="h-24 w-full" />
          ) : open.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-400">
              No open positions yet. Approve a signal to get started.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead>Ticker</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead className="text-right">Entry</TableHead>
                  <TableHead className="text-right">Current</TableHead>
                  <TableHead className="text-right">Unrealized P&L</TableHead>
                  <TableHead className="text-right">Allocated</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead>Approved Via</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {open.map((t) => {
                  const current = livePrices[t.ticker] ?? t.entry_price;
                  const sign = isShort(t.direction) ? -1 : 1;
                  const upnl = (current - t.entry_price) * t.quantity * sign;
                  return (
                    <TableRow key={t.id} className="border-zinc-800">
                      <TableCell className="font-medium text-zinc-100">{t.ticker}</TableCell>
                      <TableCell className="uppercase text-xs text-zinc-200">{t.direction}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtUsd(t.entry_price)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtUsd(current)}</TableCell>
                      <TableCell className={`text-right tabular-nums ${pnlColor(upnl)}`}>
                        {fmtSigned(upnl)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmtUsd(t.allocated_usd)}</TableCell>
                      <TableCell className="text-right tabular-nums">{t.score}</TableCell>
                      <TableCell className="text-zinc-400">{t.approved_via}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={closingId === t.id}
                          onClick={() => closePosition(t.id)}
                        >
                          {closingId === t.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "Close"
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Closed trades */}
      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardHeader>
          <CardTitle className="text-zinc-100">Closed Trades</CardTitle>
        </CardHeader>
        <CardContent>
          {trades === null ? (
            <Skeleton className="h-24 w-full" />
          ) : closed.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-400">No closed trades yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="w-8" />
                  <TableHead>Ticker</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead className="text-right">Entry</TableHead>
                  <TableHead className="text-right">Exit</TableHead>
                  <TableHead className="text-right">P&L</TableHead>
                  <TableHead className="text-right">P&L %</TableHead>
                  <TableHead className="text-right">Allocated</TableHead>
                  <TableHead>Opened</TableHead>
                  <TableHead>Closed</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead>Approved Via</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {closed.map((t) => {
                  const isOpen = !!expanded[t.id];
                  const hasNotes = !!(t.notes || t.trader_notes);
                  return (
                    <Fragment key={t.id}>
                      <TableRow key={t.id} className="border-zinc-800">
                        <TableCell>
                          {hasNotes && (
                            <button
                              onClick={() => setExpanded((p) => ({ ...p, [t.id]: !isOpen }))}
                              className="text-zinc-400 hover:text-zinc-100"
                              aria-label="Toggle notes"
                            >
                              {isOpen ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{t.ticker}</TableCell>
                        <TableCell className="uppercase text-xs">{t.direction}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtUsd(t.entry_price)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {t.exit_price != null ? fmtUsd(t.exit_price) : "—"}
                        </TableCell>
                        <TableCell className={`text-right tabular-nums ${pnlColor(t.profit_loss)}`}>
                          {fmtSigned(t.profit_loss)}
                        </TableCell>
                        <TableCell className={`text-right tabular-nums ${pnlColor(t.profit_loss_pct)}`}>
                          {fmtPct(t.profit_loss_pct)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmtUsd(t.allocated_usd)}</TableCell>
                        <TableCell className="text-zinc-400 text-xs">{t.entry_time}</TableCell>
                        <TableCell className="text-zinc-400 text-xs">{t.exit_time ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{t.score}</TableCell>
                        <TableCell className="text-zinc-400">{t.approved_via}</TableCell>
                      </TableRow>
                      {isOpen && hasNotes && (
                        <TableRow key={`${t.id}-notes`} className="border-zinc-800 bg-zinc-950/40">
                          <TableCell />
                          <TableCell colSpan={11} className="space-y-1 py-3">
                            {t.notes && (
                              <p className="text-xs text-zinc-400">
                                <span className="font-semibold text-zinc-300">Notes:</span> {t.notes}
                              </p>
                            )}
                            {t.trader_notes && (
                              <p className="text-xs italic text-zinc-300">
                                <span className="font-semibold not-italic">Trader:</span>{" "}
                                {t.trader_notes}
                              </p>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card className="border-zinc-800 bg-zinc-900/60">
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-zinc-400">{label}</p>
        <div className="mt-2 text-2xl font-semibold text-zinc-100">
          {value === null ? <Skeleton className="h-8 w-24" /> : value}
        </div>
      </CardContent>
    </Card>
  );
}
