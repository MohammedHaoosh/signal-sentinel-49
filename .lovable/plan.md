## Plan: Auto-refresh main candlestick chart

Refactor the chart fetch in `src/routes/index.tsx` so candles refresh on the same 60s cadence as signals and stay in sync with signal updates.

### Changes (single file: `src/routes/index.tsx`)

1. **Extract chart fetch into a `useCallback`** named `fetchChartCandles`, depending on `featuredTicker` and `timeframe`. Same logic as the current effect (map `15m`/`1h`/`1d`, fetch from `/chart/{ticker}/{tf}`, parse OHLCV, update `chartCandles`).
   - Only show the loading spinner on the *initial* load for a given ticker/timeframe — background refreshes should update silently so the chart doesn't flash every minute. Track this with a ref or by skipping `setChartLoading(true)` when candles already exist.

2. **Replace the existing fetch effect** with one that:
   - Calls `fetchChartCandles()` immediately when `featuredTicker`/`timeframe` change.
   - Sets up a `setInterval(fetchChartCandles, 60_000)` and clears it on cleanup.

3. **Sync with signals refresh**: after `fetchSignals()` succeeds (inside the existing `fetchSignals` callback's success path, or via a separate effect that watches a "signals updated at" timestamp), also trigger `fetchChartCandles()`. Cleanest approach: add a `signalsTick` counter state that increments at the end of each successful `fetchSignals`, and include it in the chart effect's deps so the chart refetches whenever signals refresh.

### Result
- Chart auto-refreshes every 60s.
- Chart also refetches whenever signals refetch (kept in sync).
- No spinner flash on background refreshes — only the initial load shows the overlay.
- No changes to `CandleChart.tsx`, backtest, or other components.