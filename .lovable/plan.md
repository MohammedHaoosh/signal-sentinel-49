## Problem

The Paper Trading tab fetches `/paper/summary` and `/paper/trades` on mount and on its own internal 60s timer. The global "Refresh now" button next to the Live indicator (and the global 60s signals poll) only re-fetches signals — it does not tell `PaperTrading` to re-fetch. That's why new positions only appear after a tab switch (which remounts the component).

## Fix

Tie `PaperTrading`'s refresh to the same trigger that drives the rest of the dashboard, so manual refresh and the 60s signals poll both refresh paper data too.

### `src/routes/index.tsx`
- Pass the existing `lastUpdate` value (already bumped after every signals fetch, including `manualRefresh`) into `PaperTrading` as a `refreshSignal` prop.
  ```tsx
  <PaperTrading
    livePrices={...}
    refreshSignal={lastUpdate?.getTime() ?? 0}
  />
  ```
- No other changes — `manualRefresh` already updates `lastUpdate`, so clicking the refresh button will now fan out to Paper Trading automatically.

### `src/components/PaperTrading.tsx`
- Add `refreshSignal?: number` to `Props`.
- Add a `useEffect` that calls `refresh()` whenever `refreshSignal` changes (skip the very first run since the mount effect already fetches, or just let it double-fetch once — harmless).
- Keep the existing mount fetch + 60s `setInterval` as a safety net in case the parent ever stops polling.

### Result
- Clicking the global Refresh button → signals refresh → `lastUpdate` changes → Paper Trading refetches → new open positions appear immediately.
- The 60s global poll also refreshes Paper Trading on the same cadence (instead of drifting on its own independent timer).
- Tab-switch behavior is unchanged.

### Non-goals
- No backend changes, no new endpoints, no realtime/Supabase wiring (the data source is the external `iron-condor.duckdns.org` API, not Lovable Cloud).
- No styling changes.
