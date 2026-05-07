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

export const fetchNews = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ articles: NewsArticle[]; error: string | null }> => {
    const apiKey = process.env.NEWSAPI_KEY;
    if (!apiKey) {
      return { articles: [], error: "NEWSAPI_KEY not configured" };
    }
    try {
      const results = await Promise.all(
        TICKERS.map(async (ticker) => {
          const url = `https://newsapi.org/v2/everything?q=${ticker}&language=en&sortBy=publishedAt&pageSize=5&apiKey=${apiKey}`;
          const res = await fetch(url);
          if (!res.ok) return [];
          const data = (await res.json()) as {
            articles?: Array<{
              title: string;
              url: string;
              publishedAt: string;
              description?: string;
              source?: { name?: string };
            }>;
          };
          return (data.articles ?? []).map((a) => ({
            title: a.title,
            source: a.source?.name ?? "Unknown",
            url: a.url,
            publishedAt: a.publishedAt,
            description: a.description,
            ticker,
          }));
        }),
      );
      const flat = results.flat();
      // dedupe by URL
      const seen = new Set<string>();
      const unique = flat.filter((a) => {
        if (seen.has(a.url)) return false;
        seen.add(a.url);
        return true;
      });
      unique.sort(
        (a, b) =>
          new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
      );
      return { articles: unique, error: null };
    } catch (e) {
      return {
        articles: [],
        error: e instanceof Error ? e.message : "Failed to fetch news",
      };
    }
  },
);
