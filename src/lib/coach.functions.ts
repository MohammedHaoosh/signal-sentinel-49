const BASE = "https://iron-condor.duckdns.org";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export async function askCoach({
  data,
}: {
  data: { messages: ChatMessage[]; context: string };
}): Promise<{ reply: string | null; error: string | null }> {
  try {
    const res = await fetch(`${BASE}/coach/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return { reply: json?.reply ?? null, error: json?.error ?? null };
  } catch (e) {
    return { reply: null, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function weeklyInsight({
  data,
}: {
  data: { context: string };
}): Promise<{ insight: string | null; error: string | null }> {
  try {
    const res = await fetch(`${BASE}/coach/insight`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return { insight: json?.insight ?? null, error: json?.error ?? null };
  } catch (e) {
    return { insight: null, error: e instanceof Error ? e.message : "Failed" };
  }
}
