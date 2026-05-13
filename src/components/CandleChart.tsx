import { useEffect, useRef } from "react";
import { createChart, CandlestickSeries, HistogramSeries, type IChartApi } from "lightweight-charts";

export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Props {
  ticker: string;
  price: number;
  ma20: number;
  ma50: number;
  candles?: Candle[];
  loading?: boolean;
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

export default function CandleChart({ ticker, price, ma20, ma50, candles, loading }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
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
        time: c.time as unknown as import("lightweight-charts").Time,
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
        time: c.time as unknown as import("lightweight-charts").Time,
        value: c.volume,
        color: c.close >= c.open ? "rgba(52,211,153,0.5)" : "rgba(251,113,133,0.5)",
      })),
    );

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [ticker, price, ma20, ma50, candles]);

  return (
    <div className="relative w-full">
      <div ref={containerRef} className="w-full" />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/60 backdrop-blur-sm">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-200" />
        </div>
      )}
    </div>
  );
}
