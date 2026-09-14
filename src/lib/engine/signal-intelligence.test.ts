import { describe, expect, it } from "vitest";
import type { Candle } from "../types";
import { estimateWinRate } from "./signal-intelligence";

function risingSeries(n: number): Candle[] {
  const out: Candle[] = [];
  const base = 100;
  const step = 0.5;
  for (let i = 0; i < n; i++) {
    const open = base + i * step;
    const close = open + step;
    out.push({
      time: 1_700_000_000 + i * 300,
      open,
      high: close + step,
      low: open - step,
      close,
      volume: 100
    });
  }
  return out;
}

describe("estimateWinRate caching", () => {
  it("reuses the exact same result for an unchanged candle window", () => {
    const candles = risingSeries(120);
    const first = estimateWinRate("XAUUSD", candles);
    const second = estimateWinRate("XAUUSD", candles);

    // Same reference → the ~600-bar backtest did not rerun.
    expect(first).toBe(second);

    if (first) {
      expect(first.winRate).toBeGreaterThanOrEqual(0);
      expect(first.winRate).toBeLessThanOrEqual(1);
      expect(first.trades).toBeGreaterThan(0);
      expect(first.symbol).toBe("XAUUSD");
    }
  });

  it("recomputes when the candle window changes", () => {
    const short = risingSeries(120);
    const a = estimateWinRate("BTCUSD", short);
    const b = estimateWinRate("BTCUSD", short.slice(1)); // different window
    // Different key → different (or null) result objects are fine, but they must
    // be independently resolved — identity equality only holds for identical keys.
    if (a && b) expect(a).not.toBe(b);
  });
});