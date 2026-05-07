# Plan: Intelligence, Visualization & Polish Upgrades

A focused build adding three feature bundles to the dashboard. All powered by Lovable Cloud + Lovable AI (no extra API keys needed from you).

---

## 🧠 1. Intelligence & Automation

### a) AI Trade Coach (new "Coach" tab)
A chat panel where you can ask the bot questions about your trades and the current market. It already knows:
- Your confirmed trades, win/loss outcomes, rejected counts
- Current signals, RSI, MA20/MA50 for all 8 stocks
- Recent signal history

Example prompts it can answer:
- "Why did NVDA trigger a SELL?"
- "What's my worst-performing ticker this week?"
- "Should I trust the current AAPL signal?"

It will also generate a **weekly insight card** ("This week you confirmed 8 BUYs with a 62% win rate — your best edge was on TSLA mornings.") shown on the Signals tab.

### b) Sentiment Score on news
Run each news headline through Lovable AI to tag it as Bullish / Bearish / Neutral with a 0–100 score. Display as colored chips on news cards and aggregate per-ticker into a sentiment bar on the stock cards.

### c) Pattern Recognition badges
Detect simple chart patterns from price + MA20/MA50 values (Golden Cross, Death Cross, Oversold Bounce setup, Breakout, Trend Continuation) and surface them as small badges on signal cards.

---

## 📊 2. Visualization Upgrades

### a) Candlestick chart in the stock detail dialog
Replace the simple line series with proper OHLC candles using `lightweight-charts` (TradingView's free open-source library — gorgeous, fast, dark-theme native). Include volume bars below.

Since the API only returns current snapshots, we'll synthesize a 30-bar OHLC series anchored on `price`, `ma20`, `ma50` with realistic intra-bar variance — same approach you're already using for line charts, just upgraded to candles.

### b) Multi-stock compare overlay
A new "Compare" view on the Market Overview tab. Click ticker chips to add them to a shared chart that normalizes everything to 100 at the start, so you can see relative performance side-by-side.

### c) Live ticker marquee
A Bloomberg-style scrolling tape across the top of the dashboard showing all 8 stocks with price + % change + tiny up/down arrow. Auto-scrolls left, pauses on hover.

---

## 🎨 3. Polish & Personality

### a) Theme switcher
Three themes selectable from a header dropdown:
- **Midnight** (current dark zinc — default)
- **Bloomberg** (amber on near-black, mono fonts everywhere)
- **Mint** (Robinhood-inspired light green/cream)

Stored in localStorage, applied via CSS variables in `src/styles.css`.

### b) Sound design
Subtle audio cues using the Web Audio API (no asset files needed — synthesized tones):
- Soft chime when a new BUY signal appears
- Lower tone for SELL
- "ka-ching" for confirmed wins, soft thud for losses
- Master toggle in header (🔔 / 🔕)

### c) Bot mascot — meet "Otto"
A small animated avatar in the corner who:
- Has a name, face (SVG), and 3 mood states (confident / neutral / worried) based on overall portfolio P/L
- "Speaks" via tooltip when hovered: "I'm 73% confident on the current NVDA setup."
- Pops up briefly with a quick comment when major events fire (signal triggered, trade confirmed, big win/loss)

### d) Confetti on wins
When a confirmed trade closes profitable, a brief subtle confetti burst from the trade card.

---

## Technical Section

**New deps**:
- `lightweight-charts` — candlestick/OHLC charts
- `canvas-confetti` — win celebrations

**New tab**: `Coach` added to `src/routes/index.tsx` Tabs.

**New components**:
- `src/components/Coach.tsx` — AI chat panel using streaming Lovable AI gateway
- `src/components/CandleChart.tsx` — wraps `lightweight-charts`, used in the stock detail dialog
- `src/components/CompareChart.tsx` — multi-stock normalized overlay (recharts)
- `src/components/TickerTape.tsx` — scrolling marquee
- `src/components/Otto.tsx` — bot mascot with mood state
- `src/components/ThemeSwitcher.tsx` — header dropdown
- `src/lib/sounds.ts` — Web Audio synthesized sound effects
- `src/lib/patterns.ts` — pure-function pattern detection from Stock data
- `src/lib/sentiment.functions.ts` — Lovable AI server fn that tags news headlines
- `src/lib/coach.functions.ts` — Lovable AI server fn for the chat (streaming)

**Backend**: Lovable Cloud must be enabled for the Lovable AI Gateway (`LOVABLE_API_KEY`). Will enable as part of build if not already on. Uses `google/gemini-3-flash-preview` (default) for chat and sentiment — fast and inexpensive.

**Themes**: New CSS variable blocks in `src/styles.css` keyed by `[data-theme="bloomberg"]` and `[data-theme="mint"]`. ThemeSwitcher writes to `document.documentElement.dataset.theme` and persists to localStorage.

**Otto state**: derived from existing `portfolio` totalPnl + signal counts already in `Dashboard`. No new state stores.

**Sentiment caching**: in-memory map keyed by article URL so we don't re-classify on every tab switch. Cleared with the news refresh interval.

---

## Out of scope (for this round)
- Notifications/Discord/Telegram (separate bundle — happy to do next)
- Auto-strategy discovery / genetic algorithms (research-heavy, deserves its own plan)
- Voice alerts (skipped — usually annoying in practice; sound effects cover the same need more elegantly)

Approve and I'll build it end to end.
