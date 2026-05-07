import { useEffect, useRef, useState } from "react";

interface Props {
  totalPnl: number;
  pendingCount: number;
  confirmedCount: number;
  onOpenCoach?: () => void;
}

export default function Otto({ totalPnl, pendingCount, confirmedCount, onOpenCoach }: Props) {
  const mood: "happy" | "neutral" | "sad" =
    totalPnl > 1 ? "happy" : totalPnl < -1 ? "sad" : "neutral";

  const message =
    mood === "happy"
      ? `Looking sharp — portfolio +${totalPnl.toFixed(2)}%. Keep your stops tight.`
      : mood === "sad"
        ? `Rough patch (${totalPnl.toFixed(2)}%). Maybe wait for cleaner setups.`
        : pendingCount > 0
          ? `${pendingCount} signal${pendingCount > 1 ? "s" : ""} waiting for review.`
          : `${confirmedCount} confirmed trade${confirmedCount === 1 ? "" : "s"} in flight. All quiet.`;

  const [open, setOpen] = useState(false);
  const [bubble, setBubble] = useState<string | null>(null);

  // brief popup whenever pending count increases; clear when it drops
  const lastPendingRef = useRef(pendingCount);
  const bubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const prev = lastPendingRef.current;
    lastPendingRef.current = pendingCount;
    if (pendingCount > prev) {
      const diff = pendingCount - prev;
      setBubble(`New signal! ${diff} fresh setup${diff > 1 ? "s" : ""}.`);
      if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
      bubbleTimerRef.current = setTimeout(() => setBubble(null), 4000);
    } else if (pendingCount < prev) {
      // user approved/rejected — drop the stale bubble immediately
      if (bubbleTimerRef.current) {
        clearTimeout(bubbleTimerRef.current);
        bubbleTimerRef.current = null;
      }
      setBubble(null);
    }
  }, [pendingCount]);
  useEffect(() => () => {
    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
  }, []);

  const eyeY = mood === "sad" ? 30 : mood === "happy" ? 26 : 28;
  const mouthPath =
    mood === "happy"
      ? "M 22 42 Q 32 50 42 42"
      : mood === "sad"
        ? "M 22 46 Q 32 38 42 46"
        : "M 22 44 L 42 44";
  const moodColor = mood === "happy" ? "#34d399" : mood === "sad" ? "#fb7185" : "#a1a1aa";

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {(open || bubble) && (
        <div className="mb-2 max-w-xs animate-in fade-in slide-in-from-bottom-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 shadow-xl">
          <div className="mb-1 font-semibold text-zinc-100">Otto</div>
          {bubble ?? message}
        </div>
      )}
      <button
        onClick={() => onOpenCoach?.()}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="group relative grid h-14 w-14 place-items-center rounded-full border-2 bg-zinc-900 shadow-xl transition hover:scale-105"
        style={{ borderColor: moodColor }}
        aria-label="Open Otto the trading coach"
      >
        <svg viewBox="0 0 64 64" className="h-10 w-10">
          <circle cx="32" cy="32" r="26" fill="#18181b" stroke={moodColor} strokeWidth="2" />
          <circle cx="24" cy={eyeY} r="2.5" fill={moodColor} />
          <circle cx="40" cy={eyeY} r="2.5" fill={moodColor} />
          <path d={mouthPath} stroke={moodColor} strokeWidth="2" fill="none" strokeLinecap="round" />
          <line x1="32" y1="6" x2="32" y2="12" stroke={moodColor} strokeWidth="2" />
          <circle cx="32" cy="5" r="2" fill={moodColor} />
        </svg>
        <span
          className="absolute -bottom-1 -right-1 h-3 w-3 animate-pulse rounded-full"
          style={{ background: moodColor }}
        />
      </button>
    </div>
  );
}
