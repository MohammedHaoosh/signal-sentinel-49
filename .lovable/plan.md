## Paper Trading Tab

Add a new "Paper Trading" tab to the dashboard wired to the `/paper/*` endpoints on `https://iron-condor.duckdns.org`.

### New component: `src/components/PaperTrading.tsx`

Self-contained tab with all data fetching, polling, and rendering.

**State**
- `summary` — `{ current_balance, total_pl, total_pl_pct, win_rate, open_positions, best_trade, worst_trade } | null`
- `trades` — full trade list from `/paper/trades`
- `livePrices` — `Record<ticker, number>` derived from existing `/signals` poll (passed in as a prop from `index.tsx`, which already polls signals every 60s)
- `loading`, `closingId` (per-row close-button spinner), `error`

**Fetching**
- `fetchSummary()` → `GET /paper/summary` with `ngrok-skip-browser-warning: true`
- `fetchTrades()` → `GET /paper/trades` (split client-side into `open` = `status === "open"` and `closed` otherwise)
- `closePosition(id)` → `POST /paper/close/{id}`, then re-run `fetchSummary()` + `fetchTrades()`
- One `useEffect` runs both fetches on mount and on a 60s `setInterval`, cleared on unmount. Background refreshes do not show a spinner — only the initial load does.

**Live prices**
- Lift nothing — `index.tsx` already maintains a `stocks` array from `/signals`. Pass a memoized `Record<ticker, price>` into `<PaperTrading livePrices={...} />`. No extra polling for prices.

### Layout

**Top row — 4 stat cards** (grid `grid-cols-2 md:grid-cols-4 gap-4`)
1. Current Balance — `$10,234.50`
2. Total P&L — green if `>= 0` else red, shows `+$234.50 (+2.35%)`
3. Win Rate — `68%`
4. Open Positions — count

Use the existing shadcn `Card` with the same styling pattern as other dashboard cards. Skeletons while `summary === null`.

**Open Positions table**
Columns: Ticker · Direction · Entry Price · Current Price · Unrealized P&L · Allocated · Score · Approved Via · (Close)
- `currentPrice = livePrices[ticker] ?? entry_price`
- `unrealized = (currentPrice - entry_price) * quantity` (negate for SELL/short direction)
- Green/red coloring via existing tokens (`text-emerald-400` / `text-red-400` — match what's used elsewhere in `index.tsx`)
- Close button: shadcn `Button size="sm" variant="destructive"`, disabled while `closingId === trade.id`
- Empty state: "No open positions yet. Approve a signal to get started."

**Closed Trades table**
Columns: Ticker · Direction · Entry Price · Exit Price · P&L · P&L % · Allocated · Opened · Closed · Score · Approved Via
- P&L green/red
- Each row uses `Collapsible` (already imported in project) — chevron toggles a sub-row showing `notes` (auto-generated, muted) and `trader_notes` (manual, italic) when present
- Empty state: "No closed trades yet."
- Sorted by `exit_time` desc

### Wiring into `src/routes/index.tsx`

1. Add `<TabsTrigger value="paper">Paper Trading</TabsTrigger>` after the existing Signals tab in the `TabsList` (around line 914).
2. Add a matching `<TabsContent value="paper">` block that renders `<PaperTrading livePrices={livePrices} />`.
3. Compute `livePrices` from the existing `stocks`/signals state with `useMemo` and pass it down.

### Styling

- Match existing card/table patterns already used in `index.tsx` (zinc backgrounds, border tokens, etc.). No new design tokens.
- Use shadcn `Card`, `Table`, `Button`, `Collapsible`, `Skeleton` — all already in the project.

### Notes / non-goals

- No new backend, no server functions — direct `fetch` from the client matches how `/signals` and `/chart` are already called.
- No write operations besides the documented close endpoint.
- No changes to existing Signals, Chart, or other tabs.
