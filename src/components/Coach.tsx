import { useState, useRef, useEffect } from "react";
import { useServerFn } from "@/lib/server-fn-shim";
import { askCoach } from "@/lib/coach.functions";
import { Send, Sparkles } from "lucide-react";

interface Stock {
  ticker: string;
  price: number;
  rsi: number;
  ma20: number;
  ma50: number;
  signal: "BUY" | "SELL" | "NEUTRAL";
}
interface ConfirmedTrade {
  id: string;
  ticker: string;
  entryPrice: number;
  direction: "BUY" | "SELL";
  timestamp: number;
}

interface Props {
  stocks: Stock[];
  confirmed: ConfirmedTrade[];
  rejectedCount: number;
  pendingCount: number;
  portfolioPnl: number;
}

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "What's my best-performing ticker?",
  "Should I trust the current NVDA signal?",
  "What patterns are you seeing today?",
  "How am I doing this week?",
];

export default function Coach({
  stocks,
  confirmed,
  rejectedCount,
  pendingCount,
  portfolioPnl,
}: Props) {
  const askFn = useServerFn(askCoach);
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Hey, I'm **Otto** 🤖 — I can analyze your trades, current signals, RSI patterns, and recent activity. Ask me anything.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const buildContext = () => {
    const stockLines = stocks
      .map(
        (s) =>
          `${s.ticker}: $${s.price.toFixed(2)} · RSI ${s.rsi.toFixed(1)} · MA20 ${s.ma20.toFixed(2)} · MA50 ${s.ma50.toFixed(2)} · signal ${s.signal}`,
      )
      .join("\n");
    const tradeLines = confirmed
      .slice(-15)
      .map((t) => {
        const cur = stocks.find((s) => s.ticker === t.ticker)?.price ?? t.entryPrice;
        const pnl = ((cur - t.entryPrice) / t.entryPrice) * 100 * (t.direction === "BUY" ? 1 : -1);
        return `${t.ticker} ${t.direction} @ $${t.entryPrice.toFixed(2)} → ${pnl.toFixed(2)}%`;
      })
      .join("\n");
    return `Live stocks:\n${stockLines}\n\nRecent confirmed trades (${confirmed.length} total, ${rejectedCount} rejected, ${pendingCount} pending, avg P/L ${portfolioPnl.toFixed(2)}%):\n${tradeLines || "(none yet)"}`;
  };

  const send = async (text: string) => {
    const userMsg: Msg = { role: "user", content: text };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);
    try {
      const res = await askFn({ data: { messages: [...messages, userMsg], context: buildContext() } });
      setMessages((m) => [
        ...m,
        { role: "assistant", content: res.reply ?? `_${res.error ?? "Something went wrong."}_` },
      ]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `_Error: ${e instanceof Error ? e.message : "Failed"}_` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const renderMd = (text: string) => {
    // tiny markdown: **bold**, _italic_, lists, line breaks
    const lines = text.split("\n");
    return lines.map((ln, i) => {
      const html = ln
        .replace(/\*\*(.+?)\*\*/g, '<strong class="text-zinc-100">$1</strong>')
        .replace(/_(.+?)_/g, '<em class="text-zinc-400">$1</em>')
        .replace(/`(.+?)`/g, '<code class="rounded bg-zinc-800 px-1 py-0.5 font-mono text-xs">$1</code>');
      return (
        <div
          key={i}
          className={ln.trim().startsWith("- ") ? "ml-3" : ""}
          dangerouslySetInnerHTML={{ __html: html || "&nbsp;" }}
        />
      );
    });
  };

  return (
    <div className="flex h-[calc(100vh-12rem)] flex-col rounded-xl border border-zinc-800 bg-zinc-900/40">
      <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
        <Sparkles className="h-4 w-4 text-emerald-400" />
        <h3 className="font-semibold">Otto · AI Trade Coach</h3>
        <span className="ml-auto text-xs text-zinc-500">Powered by Lovable AI</span>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                m.role === "user"
                  ? "bg-emerald-500/15 text-emerald-100 ring-1 ring-emerald-500/30"
                  : "bg-zinc-800/80 text-zinc-200 ring-1 ring-zinc-700"
              }`}
            >
              {renderMd(m.content)}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-zinc-800/80 px-4 py-2.5 text-sm text-zinc-400 ring-1 ring-zinc-700">
              <span className="inline-flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" />
              </span>
            </div>
          </div>
        )}
      </div>

      {messages.length <= 1 && (
        <div className="flex flex-wrap gap-2 px-4 pb-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim() && !loading) send(input.trim());
        }}
        className="flex gap-2 border-t border-zinc-800 p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Otto about your trades…"
          className="flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/50 focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/20 px-3 py-2 text-sm text-emerald-300 ring-1 ring-emerald-500/40 hover:bg-emerald-500/30 disabled:opacity-50"
        >
          <Send className="h-4 w-4" /> Send
        </button>
      </form>
    </div>
  );
}
