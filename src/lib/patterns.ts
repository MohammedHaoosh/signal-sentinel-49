export interface PatternStock {
  ticker: string;
  price: number;
  rsi: number;
  ma20: number;
  ma50: number;
  signal: "BUY" | "SELL" | "NEUTRAL";
}

export interface DetectedPattern {
  label: string;
  tone: "bull" | "bear" | "neutral";
  description: string;
}

export function detectPatterns(s: PatternStock): DetectedPattern[] {
  const out: DetectedPattern[] = [];
  const aboveMa20 = s.price > s.ma20;
  const aboveMa50 = s.price > s.ma50;
  const ma20AboveMa50 = s.ma20 > s.ma50;

  if (ma20AboveMa50 && Math.abs(s.ma20 - s.ma50) / s.ma50 < 0.005) {
    out.push({
      label: "Golden Cross",
      tone: "bull",
      description: "MA20 just crossed above MA50 — classic bullish setup.",
    });
  }
  if (!ma20AboveMa50 && Math.abs(s.ma20 - s.ma50) / s.ma50 < 0.005) {
    out.push({
      label: "Death Cross",
      tone: "bear",
      description: "MA20 crossing below MA50 — classic bearish setup.",
    });
  }
  if (s.rsi < 30 && aboveMa20) {
    out.push({
      label: "Oversold Bounce",
      tone: "bull",
      description: "RSI oversold while price holds above MA20 — possible reversal.",
    });
  }
  if (s.rsi > 70 && !aboveMa20) {
    out.push({
      label: "Overbought Reject",
      tone: "bear",
      description: "Overbought RSI while price slips under MA20 — exhaustion risk.",
    });
  }
  if (aboveMa20 && aboveMa50 && ma20AboveMa50 && s.rsi > 50 && s.rsi < 70) {
    out.push({
      label: "Trend Continuation",
      tone: "bull",
      description: "Price > MA20 > MA50 with healthy RSI — uptrend intact.",
    });
  }
  if (!aboveMa20 && !aboveMa50 && !ma20AboveMa50 && s.rsi < 50 && s.rsi > 30) {
    out.push({
      label: "Downtrend",
      tone: "bear",
      description: "Price < MA20 < MA50 — bears in control.",
    });
  }
  if (aboveMa50 && (s.price - s.ma50) / s.ma50 > 0.03) {
    out.push({
      label: "Breakout",
      tone: "bull",
      description: "Price extending more than 3% above MA50.",
    });
  }
  return out;
}
