import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  createSeriesMarkers,
  type IChartApi,
  type Time,
} from "lightweight-charts";

export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ChartMarker {
  time: number; // unix seconds
  price: number;
  direction: string; // "BUY" | "SELL"
  quantity: number;
  allocated_usd: number;
}

interface Props {
  ticker: string;
  price: number;
  ma20: number;
  ma50: number;
  candles?: Candle[];
  markers?: ChartMarker[];
  loading?: boolean;
  timeframe?: string;
}

// Synthesize a deterministic 30-bar OHLC series anchored on the snapshot values.
function buildCandles(seed: number, price: number, ma20: number, ma50: number): Candle[] {
  const out: Candle[] = [];
  const path: number[] = [];
  for (let i = 0; i < 30; i++) {
    const t = i / 29;
    const base = t < 0.5 ? ma50 + (ma20 - ma50) * (t / 0.5) : ma20 + (price - ma20) * ((t - 0.5) / 0.5);
    path.push(base);
  }
  let s = seed;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const startTs = Math.floor(Date.now() / 1000) - 30 * 24 * 3600;
  let prevClose = path[0];
  for (let i = 0; i < 30; i++) {
    const target = path[i];
    const noise = (rand() - 0.5) * target * 0.015;
    const close = target + noise;
    const open = i === 0 ? close * (1 - (rand() - 0.5) * 0.01) : prevClose;
    const wick = Math.abs(close - open) + target * 0.005 * rand();
    const high = Math.max(open, close) + wick * rand();
    const low = Math.min(open, close) - wick * rand();
    const volume = Math.round(1_000_000 + rand() * 4_000_000);
    out.push({ time: startTs + i * 24 * 3600, open, high, low, close, volume });
    prevClose = close;
  }
  const last = out[out.length - 1];
  last.close = price;
  last.high = Math.max(last.high, price);
  last.low = Math.min(last.low, price);
  return out;
}

export default function CandleChart({ ticker, price, ma20, ma50, candles, markers, loading, timeframe }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "transparent" },
        textColor: "#a1a1aa",
        fontFamily: "ui-monospace, monospace",
      },
      grid: {
        vertLines: { color: "#27272a" },
        horzLines: { color: "#27272a" },
      },
      rightPriceScale: { borderColor: "#3f3f46" },
      timeScale: { borderColor: "#3f3f46", timeVisible: true },
      width: containerRef.current.clientWidth,
      height: 320,
    });
    chartRef.current = chart;

    const data: Candle[] =
      candles && candles.length > 0
        ? [...candles].sort((a, b) => a.time - b.time)
        : buildCandles(
            ticker.split("").reduce((a, c) => a + c.charCodeAt(0), 0),
            price,
            ma20,
            ma50,
          );

    // Deduplicate by time (lightweight-charts requires strictly ascending unique times)
    const seen = new Set<number>();
    const clean = data.filter((c) => {
      if (seen.has(c.time)) return false;
      seen.add(c.time);
      return true;
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#34d399",
      downColor: "#fb7185",
      borderUpColor: "#34d399",
      borderDownColor: "#fb7185",
      wickUpColor: "#34d399",
      wickDownColor: "#fb7185",
    });
    candleSeries.setData(
      clean.map((c) => ({
        time: c.time as unknown as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );

    const volSeries = chart.addSeries(HistogramSeries, {
      color: "#3f3f46",
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });
    volSeries.setData(
      clean.map((c) => ({
        time: c.time as unknown as Time,
        value: c.volume,
        color: c.close >= c.open ? "rgba(52,211,153,0.5)" : "rgba(251,113,133,0.5)",
      })),
    );

    // Render entry-point markers (BUY/SELL dots)
    const validMarkers = (markers ?? []).filter(
      (m) => Number.isFinite(m.time) && Number.isFinite(m.price),
    );
    if (validMarkers.length > 0) {
      createSeriesMarkers(
        candleSeries,
        validMarkers.map((m) => {
          const isBuy = (m.direction || "").toUpperCase() === "BUY";
          const dollars = Number(m.allocated_usd);
          return {
            time: m.time as unknown as Time,
            position: "belowBar" as const,
            color: isBuy ? "#26a69a" : "#ef5350",
            shape: "circle" as const,
            text: `${isBuy ? "BUY" : "SELL"} $${dollars.toFixed(0)}`,
          };
        }),
      );
    }

    // Hover tooltip for markers
    const tooltipEl = tooltipRef.current;
    const markerByTime = new Map<number, ChartMarker>();
    for (const m of validMarkers) markerByTime.set(m.time, m);

    const onMove = (param: Parameters<Parameters<typeof chart.subscribeCrosshairMove>[0]>[0]) => {
      if (!tooltipEl || !wrapRef.current) return;
      const t = param.time as unknown as number | undefined;
      const m = t != null ? markerByTime.get(t) : undefined;
      if (!m || !param.point) {
        tooltipEl.style.display = "none";
        return;
      }
      const isBuy = (m.direction || "").toUpperCase() === "BUY";
      tooltipEl.innerHTML = `
        <div style="font-weight:600;color:${isBuy ? "#22c55e" : "#fb7185"}">${m.direction}</div>
        <div>Price: $${Number(m.price).toFixed(2)}</div>
        <div>Qty: ${m.quantity}</div>
        <div>Allocated: $${Number(m.allocated_usd).toFixed(2)}</div>
      `;
      tooltipEl.style.display = "block";
      const w = wrapRef.current.clientWidth;
      const left = Math.min(Math.max(param.point.x + 12, 8), w - 160);
      tooltipEl.style.left = `${left}px`;
      tooltipEl.style.top = `${Math.max(param.point.y - 8, 8)}px`;
    };
    chart.subscribeCrosshairMove(onMove);

    requestAnimationFrame(() => {
      if (timeframe === "1d?range=max") {
        chart.timeScale().fitContent();
      } else if (timeframe === "1d?range=1y") {
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        chart.timeScale().setVisibleRange({
          from: oneYearAgo.toISOString().split("T")[0] as unknown as Time,
          to: new Date().toISOString().split("T")[0] as unknown as Time,
        });
      } else {
        chart.timeScale().fitContent();
      }
    });

    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.unsubscribeCrosshairMove(onMove);
      chart.remove();
      chartRef.current = null;
    };
  }, [ticker, price, ma20, ma50, candles, markers, timeframe]);

  return (
    <div ref={wrapRef} className="relative w-full">
      <div ref={containerRef} className="w-full" />
      <div
        ref={tooltipRef}
        className="pointer-events-none absolute z-10 hidden rounded-md border border-zinc-700 bg-zinc-900/95 px-2 py-1.5 text-xs font-mono text-zinc-200 shadow-lg"
        style={{ display: "none" }}
      />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/60 backdrop-blur-sm">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-200" />
        </div>
      )}
    </div>
  );
}
