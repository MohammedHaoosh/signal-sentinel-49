const BASE = "https://iron-condor.duckdns.org";

export interface NewsArticle {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  ticker: string;
  description?: string;
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export async function fetchNews(): Promise<{
  articles: NewsArticle[];
  error: string | null;
  failed: string[];
}> {
  try {
    const res = await fetch(`${BASE}/news`, {
      headers: { "ngrok-skip-browser-warning": "true" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: Record<string, Array<Record<string, unknown>>> = await res.json();

    const articles: NewsArticle[] = [];
    for (const [ticker, list] of Object.entries(json)) {
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        const url = typeof item.link === "string" ? item.link : "";
        articles.push({
          title: typeof item.title === "string" ? item.title : "",
          source: hostname(url),
          url,
          publishedAt: typeof item.pubDate === "string" ? item.pubDate : "",
          ticker,
          description: typeof item.description === "string" ? item.description : undefined,
        });
      }
    }

    return {
      articles,
      error: null,
      failed: [],
    };
  } catch (e) {
    return {
      articles: [],
      error: e instanceof Error ? e.message : "Failed to load news",
      failed: [],
    };
  }
}
