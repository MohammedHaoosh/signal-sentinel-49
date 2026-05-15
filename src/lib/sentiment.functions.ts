const BASE = "https://iron-condor.duckdns.org";

export interface SentimentResult {
  url: string;
  label: "bullish" | "bearish" | "neutral";
  score: number;
}

export async function classifyHeadlines({
  data,
}: {
  data: { items: { url: string; title: string; ticker: string }[] };
}): Promise<{ results: SentimentResult[]; error: string | null }> {
  if (data.items.length === 0) return { results: [], error: null };
  try {
    const res = await fetch(`${BASE}/ai/sentiment`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
      body: JSON.stringify({ items: data.items.slice(0, 30) }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return {
      results: Array.isArray(json?.results) ? json.results : [],
      error: json?.error ?? null,
    };
  } catch (e) {
    return { results: [], error: e instanceof Error ? e.message : "Failed" };
  }
}
