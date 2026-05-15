const BASE = "https://iron-condor.duckdns.org";
const BASIC_AUTH = "Basic " + btoa("iron-condor:Xk9#mP2$vL7qN4wR");

export async function explainSignal({
  data,
}: {
  data: {
    ticker: string;
    price: number;
    rsi: number;
    ma20: number;
    ma50: number;
    signal: string;
  };
}): Promise<{ explanation: string; error: string | null }> {
  try {
    const res = await fetch(`${BASE}/insight/${encodeURIComponent(data.ticker)}`, {
      method: "GET",
      headers: {
        "ngrok-skip-browser-warning": "true",
        Authorization: BASIC_AUTH,
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return { explanation: json?.insight ?? "", error: json?.error ?? null };
  } catch (e) {
    return { explanation: "", error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function marketSummary({
  data,
}: {
  data: {
    stocks: { ticker: string; price: number; rsi: number; ma20: number; signal: string }[];
  };
}): Promise<{ summary: string; error: string | null }> {
  try {
    const res = await fetch(`${BASE}/ai/summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return { summary: json?.summary ?? "", error: json?.error ?? null };
  } catch (e) {
    return { summary: "", error: e instanceof Error ? e.message : "Failed" };
  }
}
