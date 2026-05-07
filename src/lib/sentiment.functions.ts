import { createServerFn } from "@tanstack/react-start";

export interface SentimentResult {
  url: string;
  label: "bullish" | "bearish" | "neutral";
  score: number; // 0-100
}

export const classifyHeadlines = createServerFn({ method: "POST" })
  .inputValidator((data: { items: { url: string; title: string; ticker: string }[] }) => data)
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { results: [] as SentimentResult[], error: "LOVABLE_API_KEY not configured" };
    }
    if (data.items.length === 0) return { results: [], error: null };

    const list = data.items
      .slice(0, 30)
      .map((it, i) => `${i + 1}. [${it.ticker}] ${it.title}`)
      .join("\n");

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
                "You are a financial news sentiment classifier. For each numbered headline, decide if it is bullish, bearish, or neutral for the named ticker. Score 0-100 (50 = neutral, >50 bullish strength, <50 bearish strength).",
            },
            { role: "user", content: list },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "report_sentiment",
                description: "Return sentiment for each headline by index.",
                parameters: {
                  type: "object",
                  properties: {
                    items: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          index: { type: "number" },
                          label: { type: "string", enum: ["bullish", "bearish", "neutral"] },
                          score: { type: "number" },
                        },
                        required: ["index", "label", "score"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["items"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "report_sentiment" } },
        }),
      });
      if (!res.ok) return { results: [], error: `AI error ${res.status}` };
      const json = await res.json();
      const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!args) return { results: [], error: "No tool call returned" };
      const parsed = JSON.parse(args) as {
        items: { index: number; label: SentimentResult["label"]; score: number }[];
      };
      const results: SentimentResult[] = parsed.items
        .map((p) => {
          const it = data.items[p.index - 1];
          if (!it) return null;
          return { url: it.url, label: p.label, score: p.score };
        })
        .filter((x): x is SentimentResult => !!x);
      return { results, error: null };
    } catch (e) {
      return { results: [], error: e instanceof Error ? e.message : "Failed" };
    }
  });
