const BASE = "https://iron-condor.duckdns.org";

export interface NewsArticle {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  ticker: string;
  description?: string;
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
    const json = await res.json();
    return {
      articles: Array.isArray(json?.articles) ? json.articles : Array.isArray(json) ? json : [],
      error: json?.error ?? null,
      failed: Array.isArray(json?.failed) ? json.failed : [],
    };
  } catch (e) {
    return {
      articles: [],
      error: e instanceof Error ? e.message : "Failed to load news",
      failed: [],
    };
  }
}
