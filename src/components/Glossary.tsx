import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

type Category =
  | "market-structure"
  | "performance"
  | "economic"
  | "technical"
  | "ticker";

const categoryStyles: Record<Category, string> = {
  "market-structure":
    "border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10",
  performance:
    "border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10",
  economic:
    "border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10",
  technical:
    "border-violet-500/30 bg-violet-500/5 hover:bg-violet-500/10",
  ticker:
    "border-teal-500/30 bg-teal-500/5 hover:bg-teal-500/10",
};

const categoryAccent: Record<Category, string> = {
  "market-structure": "text-blue-300",
  performance: "text-emerald-300",
  economic: "text-amber-300",
  technical: "text-violet-300",
  ticker: "text-teal-300",
};

interface Term {
  abbr: string;
  full: string;
  desc: string;
  category: Category;
}

interface Ticker {
  symbol: string;
  name: string;
  sector: string;
  desc: string;
}

const TERMS: Term[] = [
  // Technical analysis
  { abbr: "RSI", full: "Relative Strength Index", desc: "Momentum oscillator (0–100). Below 30 = oversold, above 70 = overbought.", category: "technical" },
  { abbr: "MA", full: "Moving Average", desc: "Average price over a window, used to smooth out noise.", category: "technical" },
  { abbr: "MA20", full: "20-day Moving Average", desc: "Short-term trend indicator over 20 trading days.", category: "technical" },
  { abbr: "MA50", full: "50-day Moving Average", desc: "Medium-term trend indicator over 50 trading days.", category: "technical" },
  { abbr: "MA200", full: "200-day Moving Average", desc: "Long-term trend baseline used to define bull/bear markets.", category: "technical" },
  { abbr: "MACD", full: "Moving Average Convergence Divergence", desc: "Trend-following momentum indicator from two EMAs.", category: "technical" },
  { abbr: "EMA", full: "Exponential Moving Average", desc: "Moving average weighted toward recent prices.", category: "technical" },
  { abbr: "SMA", full: "Simple Moving Average", desc: "Plain arithmetic average of closing prices.", category: "technical" },
  { abbr: "BB", full: "Bollinger Bands", desc: "Volatility bands around a moving average.", category: "technical" },
  { abbr: "VWAP", full: "Volume Weighted Average Price", desc: "Average price weighted by traded volume.", category: "technical" },
  { abbr: "ATR", full: "Average True Range", desc: "Measures volatility of price movement.", category: "technical" },
  { abbr: "TA", full: "Technical Analysis", desc: "Studying charts and indicators to forecast price.", category: "technical" },
  { abbr: "FA", full: "Fundamental Analysis", desc: "Valuing a stock from financials and business health.", category: "technical" },
  { abbr: "DD", full: "Due Diligence", desc: "Research before making an investment decision.", category: "technical" },
  { abbr: "SL", full: "Stop Loss", desc: "Order that exits a position if price drops to a threshold.", category: "technical" },
  { abbr: "TP", full: "Take Profit", desc: "Order that exits a position once a target gain is hit.", category: "technical" },

  // Performance metrics
  { abbr: "EPS", full: "Earnings Per Share", desc: "Company profit divided by shares outstanding.", category: "performance" },
  { abbr: "PE", full: "Price-to-Earnings Ratio", desc: "Stock price divided by EPS — valuation multiple.", category: "performance" },
  { abbr: "PEG", full: "PE to Growth Ratio", desc: "PE adjusted for earnings growth rate.", category: "performance" },
  { abbr: "EBITDA", full: "Earnings Before Interest, Taxes, Depreciation & Amortization", desc: "Proxy for core operating profitability.", category: "performance" },
  { abbr: "ROI", full: "Return on Investment", desc: "Profit relative to amount invested.", category: "performance" },
  { abbr: "ROE", full: "Return on Equity", desc: "Profit generated per dollar of shareholder equity.", category: "performance" },
  { abbr: "ROA", full: "Return on Assets", desc: "Profit generated per dollar of total assets.", category: "performance" },
  { abbr: "NAV", full: "Net Asset Value", desc: "Value of a fund's assets minus its liabilities.", category: "performance" },
  { abbr: "PnL", full: "Profit and Loss", desc: "Net gain or loss on a position or portfolio.", category: "performance" },
  { abbr: "ATH", full: "All-Time High", desc: "Highest price the asset has ever traded at.", category: "performance" },
  { abbr: "ATL", full: "All-Time Low", desc: "Lowest price the asset has ever traded at.", category: "performance" },
  { abbr: "YTD", full: "Year to Date", desc: "Performance from January 1 through today.", category: "performance" },
  { abbr: "QoQ", full: "Quarter over Quarter", desc: "Change compared with the previous quarter.", category: "performance" },
  { abbr: "YoY", full: "Year over Year", desc: "Change compared with the same period last year.", category: "performance" },
  { abbr: "CAGR", full: "Compound Annual Growth Rate", desc: "Smoothed annual growth rate over multiple years.", category: "performance" },
  { abbr: "DIV", full: "Dividend", desc: "Cash payment a company sends to shareholders.", category: "performance" },

  // Economic indicators
  { abbr: "GDP", full: "Gross Domestic Product", desc: "Total value of goods and services in an economy.", category: "economic" },
  { abbr: "CPI", full: "Consumer Price Index", desc: "Tracks price changes of a consumer goods basket — inflation gauge.", category: "economic" },
  { abbr: "PPI", full: "Producer Price Index", desc: "Inflation measured at the wholesale/producer level.", category: "economic" },
  { abbr: "FOMC", full: "Federal Open Market Committee", desc: "Fed body that sets US interest rate policy.", category: "economic" },
  { abbr: "FED", full: "Federal Reserve", desc: "US central bank — controls monetary policy.", category: "economic" },
  { abbr: "ECB", full: "European Central Bank", desc: "Central bank of the Eurozone.", category: "economic" },
  { abbr: "BOJ", full: "Bank of Japan", desc: "Central bank of Japan.", category: "economic" },
  { abbr: "QE", full: "Quantitative Easing", desc: "Central bank asset buying to inject liquidity.", category: "economic" },
  { abbr: "QT", full: "Quantitative Tightening", desc: "Central bank shrinking its balance sheet.", category: "economic" },
  { abbr: "NFP", full: "Non-Farm Payrolls", desc: "Monthly US jobs report — key market mover.", category: "economic" },

  // Market structure
  { abbr: "SEC", full: "Securities and Exchange Commission", desc: "US regulator overseeing securities markets.", category: "market-structure" },
  { abbr: "NYSE", full: "New York Stock Exchange", desc: "World's largest stock exchange by market cap.", category: "market-structure" },
  { abbr: "NASDAQ", full: "Nasdaq Stock Market", desc: "US exchange known for tech-heavy listings.", category: "market-structure" },
  { abbr: "OTC", full: "Over-the-Counter", desc: "Trades done directly between parties off-exchange.", category: "market-structure" },
  { abbr: "ETF", full: "Exchange-Traded Fund", desc: "Basket of assets traded like a single stock.", category: "market-structure" },
  { abbr: "IPO", full: "Initial Public Offering", desc: "First time a company sells shares to the public.", category: "market-structure" },
  { abbr: "SPAC", full: "Special Purpose Acquisition Company", desc: "Shell company that takes a private firm public.", category: "market-structure" },
  { abbr: "AH", full: "After Hours", desc: "Trading session after the regular market close.", category: "market-structure" },
  { abbr: "PM", full: "Pre-Market", desc: "Trading session before the regular market open.", category: "market-structure" },
  { abbr: "EOD", full: "End of Day", desc: "Refers to the market's daily closing.", category: "market-structure" },
  { abbr: "EOW", full: "End of Week", desc: "Refers to the Friday close of the trading week.", category: "market-structure" },
  { abbr: "ASK", full: "Ask Price", desc: "Lowest price a seller will accept.", category: "market-structure" },
  { abbr: "BID", full: "Bid Price", desc: "Highest price a buyer is willing to pay.", category: "market-structure" },
  { abbr: "VOL", full: "Volume", desc: "Number of shares traded in a period.", category: "market-structure" },
  { abbr: "MCAP", full: "Market Capitalization", desc: "Share price times total shares outstanding.", category: "market-structure" },
  { abbr: "FLOAT", full: "Public Float", desc: "Shares available for public trading.", category: "market-structure" },
  { abbr: "SHORT", full: "Short Selling", desc: "Borrowing shares to sell, hoping to buy back lower.", category: "market-structure" },
  { abbr: "MARGIN", full: "Margin", desc: "Borrowed money used to trade larger positions.", category: "market-structure" },
];

const TICKERS: Ticker[] = [
  { symbol: "AAPL", name: "Apple Inc.", sector: "Technology", desc: "Designs iPhones, Macs, and consumer electronics." },
  { symbol: "MSFT", name: "Microsoft Corp.", sector: "Technology", desc: "Software, cloud (Azure), and productivity tools." },
  { symbol: "AMZN", name: "Amazon.com Inc.", sector: "Consumer / Cloud", desc: "E-commerce platform and AWS cloud services." },
  { symbol: "TSLA", name: "Tesla Inc.", sector: "Automotive / Energy", desc: "Electric vehicles, battery storage, and solar." },
  { symbol: "NVDA", name: "NVIDIA Corp.", sector: "Semiconductors", desc: "GPUs powering gaming and AI workloads." },
  { symbol: "SPY", name: "SPDR S&P 500 ETF", sector: "ETF / Index", desc: "Tracks the S&P 500 — broad US market exposure." },
  { symbol: "AMD", name: "Advanced Micro Devices", sector: "Semiconductors", desc: "CPUs and GPUs competing with Intel and NVIDIA." },
  { symbol: "PLTR", name: "Palantir Technologies", sector: "Software / Data", desc: "Data analytics platforms for governments and enterprises." },
  { symbol: "GOOGL", name: "Alphabet Inc.", sector: "Technology / Ads", desc: "Parent of Google Search, YouTube, and Android." },
  { symbol: "META", name: "Meta Platforms", sector: "Technology / Ads", desc: "Operates Facebook, Instagram, WhatsApp, and Reality Labs." },
  { symbol: "NFLX", name: "Netflix Inc.", sector: "Media / Streaming", desc: "Subscription streaming and original content production." },
  { symbol: "DIS", name: "The Walt Disney Co.", sector: "Media / Entertainment", desc: "Theme parks, studios, ESPN, and Disney+." },
  { symbol: "JPM", name: "JPMorgan Chase", sector: "Financials", desc: "Largest US bank — investment and consumer banking." },
  { symbol: "BAC", name: "Bank of America", sector: "Financials", desc: "Major US retail and commercial bank." },
  { symbol: "GS", name: "Goldman Sachs", sector: "Financials", desc: "Global investment bank and trading firm." },
  { symbol: "WMT", name: "Walmart Inc.", sector: "Retail", desc: "World's largest retailer by revenue." },
  { symbol: "COST", name: "Costco Wholesale", sector: "Retail", desc: "Membership-based warehouse club retailer." },
  { symbol: "V", name: "Visa Inc.", sector: "Financials / Payments", desc: "Global card payments network." },
  { symbol: "MA", name: "Mastercard Inc.", sector: "Financials / Payments", desc: "Global card payments network — Visa's main rival." },
  { symbol: "XOM", name: "Exxon Mobil Corp.", sector: "Energy", desc: "Integrated oil and gas supermajor." },
  { symbol: "CVX", name: "Chevron Corp.", sector: "Energy", desc: "Integrated oil and gas supermajor." },
  { symbol: "PFE", name: "Pfizer Inc.", sector: "Healthcare / Pharma", desc: "Global pharmaceutical company." },
  { symbol: "JNJ", name: "Johnson & Johnson", sector: "Healthcare / Pharma", desc: "Pharma and medical devices conglomerate." },
  { symbol: "BABA", name: "Alibaba Group", sector: "E-commerce (China)", desc: "Chinese e-commerce and cloud giant." },
  { symbol: "TSM", name: "Taiwan Semiconductor", sector: "Semiconductors", desc: "World's largest contract chip manufacturer." },
  { symbol: "UBER", name: "Uber Technologies", sector: "Mobility", desc: "Ride-hailing, delivery, and freight platform." },
  { symbol: "LYFT", name: "Lyft Inc.", sector: "Mobility", desc: "US ride-sharing platform — Uber's main rival." },
  { symbol: "COIN", name: "Coinbase Global", sector: "Crypto / Financials", desc: "Largest US-listed crypto exchange." },
];

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export default function Glossary() {
  const [query, setQuery] = useState("");
  const [letter, setLetter] = useState<string | null>(null);

  const q = query.trim().toLowerCase();

  const filteredTerms = useMemo(
    () =>
      TERMS.filter((t) => {
        if (letter && !t.abbr.toUpperCase().startsWith(letter)) return false;
        if (!q) return true;
        return (
          t.abbr.toLowerCase().includes(q) ||
          t.full.toLowerCase().includes(q) ||
          t.desc.toLowerCase().includes(q)
        );
      }),
    [q, letter],
  );

  const filteredTickers = useMemo(
    () =>
      TICKERS.filter((t) => {
        if (letter && !t.symbol.toUpperCase().startsWith(letter)) return false;
        if (!q) return true;
        return (
          t.symbol.toLowerCase().includes(q) ||
          t.name.toLowerCase().includes(q) ||
          t.desc.toLowerCase().includes(q)
        );
      }),
    [q, letter],
  );

  const activeLetters = useMemo(() => {
    const set = new Set<string>();
    TERMS.forEach((t) => set.add(t.abbr[0].toUpperCase()));
    TICKERS.forEach((t) => set.add(t.symbol[0].toUpperCase()));
    return set;
  }, []);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search terms, tickers, or descriptions…"
            className="h-11 border-zinc-800 bg-zinc-900/60 pl-9 text-zinc-100 placeholder:text-zinc-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <button
            onClick={() => setLetter(null)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              letter === null
                ? "bg-zinc-100 text-zinc-900"
                : "bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800",
            )}
          >
            All
          </button>
          {ALPHABET.map((l) => {
            const active = letter === l;
            const enabled = activeLetters.has(l);
            return (
              <button
                key={l}
                disabled={!enabled}
                onClick={() => setLetter(active ? null : l)}
                className={cn(
                  "h-7 w-7 rounded-md text-xs font-medium transition-colors",
                  active
                    ? "bg-zinc-100 text-zinc-900"
                    : enabled
                      ? "bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800"
                      : "bg-zinc-950 text-zinc-700 opacity-40",
                )}
              >
                {l}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-zinc-100">Financial Terms</h2>
            <span className="text-xs text-zinc-500">{filteredTerms.length} results</span>
          </div>
          {filteredTerms.length === 0 ? (
            <p className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-6 text-sm text-zinc-500">
              No matching terms.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {filteredTerms.map((t) => (
                <div
                  key={t.abbr}
                  className={cn(
                    "rounded-lg border p-4 transition-colors",
                    categoryStyles[t.category],
                  )}
                >
                  <div
                    className={cn(
                      "text-xl font-bold tracking-tight",
                      categoryAccent[t.category],
                    )}
                  >
                    {t.abbr}
                  </div>
                  <div className="text-sm font-medium text-zinc-200">{t.full}</div>
                  <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">{t.desc}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-zinc-100">Stock Tickers</h2>
            <span className="text-xs text-zinc-500">{filteredTickers.length} results</span>
          </div>
          {filteredTickers.length === 0 ? (
            <p className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-6 text-sm text-zinc-500">
              No matching tickers.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {filteredTickers.map((t) => (
                <div
                  key={t.symbol}
                  className={cn(
                    "rounded-lg border p-4 transition-colors",
                    categoryStyles.ticker,
                  )}
                >
                  <div className={cn("text-xl font-bold tracking-tight", categoryAccent.ticker)}>
                    {t.symbol}
                  </div>
                  <div className="text-sm font-medium text-zinc-200">{t.name}</div>
                  <div className="text-[11px] uppercase tracking-wide text-teal-400/70">
                    {t.sector}
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">{t.desc}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
