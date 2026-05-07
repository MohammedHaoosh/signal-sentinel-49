## Fix Otto's stale "New signal!" bubble

**Problem:** Otto's popup keeps saying "7 fresh setups" even after you approve trades. Two bugs in `src/components/Otto.tsx`:

1. The 4-second auto-dismiss `setTimeout` lives inside a `useEffect` whose cleanup runs on every re-render. Because parent state (prices, P/L, etc.) updates frequently, the timeout gets cleared and never fires — so the bubble sticks.
2. The bubble isn't cleared when `pendingCount` *decreases* (which is what happens when you approve or reject a signal).

**Fix:** Rewrite the bubble effect to:
- Track the previous pending count with a `useRef` (not state, so it doesn't re-trigger the effect).
- Store the dismiss timer in a ref and only clear it when a new bubble replaces it.
- When `pendingCount` drops (trade approved/rejected), immediately clear the bubble.

**File:** `src/components/Otto.tsx` only — a small targeted edit, no API or prop changes.
