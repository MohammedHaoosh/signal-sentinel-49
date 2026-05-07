import { createServerFn } from "@tanstack/react-start";

async function callAI(messages: { role: string; content: string }[]): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages,
    }),
  });
  if (!res.ok) {
    if (res.status === 429) throw new Error("Rate limit exceeded — try again shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add funds in Settings → Workspace → Usage.");
    throw new Error(`AI error ${res.status}`);
  }
  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? "";
}

export const explainSignal = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      ticker: string;
      price: number;
      rsi: number;
      ma20: number;
      ma50: number;
      signal: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    try {
      const content = await callAI([
        {
          role: "system",
          content:
            "You are a concise trading analyst. Explain in plain English (3-5 short sentences) what the technical signal means for the given stock and whether it might be worth watching or avoiding right now. Reference the indicators specifically. End with a one-line risk caveat. No financial advice disclaimers beyond that.",
        },
        {
          role: "user",
          content: `Ticker: ${data.ticker}\nPrice: $${data.price.toFixed(2)}\nRSI: ${data.rsi.toFixed(1)}\nMA20: $${data.ma20.toFixed(2)}\nMA50: $${data.ma50.toFixed(2)}\nSignal: ${data.signal}`,
        },
      ]);
      return { explanation: content, error: null as string | null };
    } catch (e) {
      return { explanation: "", error: e instanceof Error ? e.message : "Failed" };
    }
  });

export const marketSummary = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      stocks: { ticker: string; price: number; rsi: number; ma20: number; signal: string }[];
    }) => data,
  )
  .handler(async ({ data }) => {
    try {
      if (data.stocks.length === 0) {
        return { summary: "", error: "No stock data available." };
      }
      const lines = data.stocks
        .map(
          (s) =>
            `${s.ticker}: $${s.price.toFixed(2)} | RSI ${s.rsi.toFixed(1)} | MA20 $${s.ma20.toFixed(2)} | ${s.signal}`,
        )
        .join("\n");
      const content = await callAI([
        {
          role: "system",
          content:
            "You are a market analyst writing a concise daily brief (2-3 sentences, ~60 words). Summarize today's market tone using the provided technical snapshot across the tracked stocks. Mention overall RSI sentiment, notable BUY/SELL signals, and trend direction vs MA20. Read like a brief professional analyst note — no bullet points, no headers.",
        },
        { role: "user", content: lines },
      ]);
      return { summary: content, error: null as string | null };
    } catch (e) {
      return { summary: "", error: e instanceof Error ? e.message : "Failed" };
    }
  });
