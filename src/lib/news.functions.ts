import { createServerFn } from "@tanstack/react-start";

export interface NewsArticle {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  ticker: string;
  description?: string;
}

const TICKERS = ["AAPL", "MSFT", "AMZN", "TSLA", "NVDA", "SPY", "AMD", "PLTR"];
const MARKET_FEED = "^GSPC,^DJI,^IXIC";

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .trim();
}

function extractTag(item: string, tag: string): string {
  const m = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? decodeEntities(m[1]) : "";
}

function parseRss(xml: string, ticker: string): NewsArticle[] {
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  return items
    .map((item) => {
      const title = extractTag(item, "title");
      const link = extractTag(item, "link");
      const pubDate = extractTag(item, "pubDate");
      const description = extractTag(item, "description").replace(/<[^>]+>/g, "");
      let source = "Yahoo Finance";
      try {
        source = new URL(link).hostname.replace(/^www\./, "") || "Yahoo Finance";
      } catch {
        /* ignore */
      }
      return {
        title,
        url: link,
        publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        description,
        source,
        ticker,
      };
    })
    .filter((a) => a.title && a.url);
}

async function fetchFeed(symbol: string, ticker: string): Promise<NewsArticle[]> {
  const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  return parseRss(xml, ticker);
}

export const fetchNews = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ articles: NewsArticle[]; error: string | null; failed: string[] }> => {
    const failed: string[] = [];
    const all = await Promise.all(
      [...TICKERS.map((t) => [t, t] as const), [MARKET_FEED, "MARKET"] as const].map(
        async ([sym, ticker]) => {
          try {
            return await fetchFeed(sym, ticker);
          } catch {
            failed.push(ticker);
            return [] as NewsArticle[];
          }
        },
      ),
    );
    const flat = all.flat();
    const seen = new Set<string>();
    const unique = flat.filter((a) => {
      if (seen.has(a.url)) return false;
      seen.add(a.url);
      return true;
    });
    unique.sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    );
    return {
      articles: unique,
      error: failed.length ? `Failed to load: ${failed.join(", ")}` : null,
      failed,
    };
  },
);
