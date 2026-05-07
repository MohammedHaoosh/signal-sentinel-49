import { createServerFn } from "@tanstack/react-start";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export const askCoach = createServerFn({ method: "POST" })
  .inputValidator((data: { messages: ChatMessage[]; context: string }) => data)
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { reply: null as string | null, error: "LOVABLE_API_KEY not configured" };
    }
    const system = `You are "Otto", an AI trading coach embedded in a stock signals dashboard.
You analyze the user's actual trades and current market state. Be concise, friendly, candid.
Use plain language. When numbers matter, cite them. Never give financial advice — frame as observations and probabilities.
Use markdown sparingly (bold for key numbers, short lists). Keep replies under 180 words unless asked for detail.

Current dashboard context:
${data.context}`;

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [{ role: "system", content: system }, ...data.messages],
        }),
      });
      if (!res.ok) {
        if (res.status === 429) return { reply: null, error: "Rate limit hit — try again in a moment." };
        if (res.status === 402) return { reply: null, error: "AI credits exhausted. Add credits in workspace settings." };
        return { reply: null, error: `AI error ${res.status}` };
      }
      const json = await res.json();
      const reply = json.choices?.[0]?.message?.content ?? null;
      return { reply, error: null };
    } catch (e) {
      return { reply: null, error: e instanceof Error ? e.message : "Failed" };
    }
  });

export const weeklyInsight = createServerFn({ method: "POST" })
  .inputValidator((data: { context: string }) => data)
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { insight: null as string | null, error: "LOVABLE_API_KEY not configured" };
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content:
                "You are Otto, a trading bot. Generate ONE punchy weekly insight (max 2 sentences) about the user's recent activity. Reference specific tickers, win rates, or RSI patterns from the data. Friendly, candid. No advice.",
            },
            { role: "user", content: data.context },
          ],
        }),
      });
      if (!res.ok) return { insight: null, error: `AI error ${res.status}` };
      const json = await res.json();
      return { insight: json.choices?.[0]?.message?.content ?? null, error: null };
    } catch (e) {
      return { insight: null, error: e instanceof Error ? e.message : "Failed" };
    }
  });
