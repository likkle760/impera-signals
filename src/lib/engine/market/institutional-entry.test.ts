import { describe, it, expect } from "vitest";
import type { Candle } from "../../types";
import { InstitutionalEntryEngine } from "./institutional-entry";

function candle(t: number, o: number, h: number, l: number, c: number): Candle {
  return { time: t, open: o, high: h, low: l, close: c, volume: 1000 };
}

/**
 * Build a bullish setup: price ranges with EQUAL LOWS around ~97.6 (a SELL-SIDE
 * liquidity pool), then SWEEPS through them (stop hunt) to ~97.0, rejects,
 * displaces strongly up leaving a bullish FVG and creating a demand block, then
 * pulls back toward that block.
 */
function bullishSetup(): { candles: Candle[]; demandTop: number; demandBottom: number } {
  const candles: Candle[] = [];
  // range with REPEATED swing lows at ~97.6 (a SELL-SIDE liquidity pool)
  for (let i = 0; i < 12; i++) {
    if (i % 2 === 0) {
      candles.push(candle(i, 99.1, 99.5, 97.6, 99.2)); // swing LOW at 97.6
    } else {
      candles.push(candle(i, 99.2, 99.55, 99.0, 99.15)); // higher low (bounces up)
    }
  }
  // sweep of the sell-side pool at 97.6 (stop hunt) down to 97.0, then reject
  candles.push(candle(12, 97.9, 98.0, 97.0, 97.85));
  // displacement up: big bullish candle leaving a bullish FVG over the pool
  candles.push(candle(13, 97.85, 99.3, 97.7, 99.1));
  candles.push(candle(14, 99.1, 100.0, 99.0, 99.8));
  // pullback toward the demand block (bottom of the up move ~97.8)
  candles.push(candle(15, 99.8, 99.9, 98.5, 98.7));
  candles.push(candle(16, 98.7, 98.9, 98.3, 98.5)); // current, pulling back to demand
  const demandBottom = 97.85;
  const demandTop = 97.9;
  return { candles, demandTop, demandBottom };
}

describe("InstitutionalEntryEngine (forex + gold)", () => {
  it("produces a valid LONG entry at a demand block in a bullish trend", () => {
    const { candles, demandBottom } = bullishSetup();
    const eng = new InstitutionalEntryEngine();
    const entry = eng.find("LONG", {
      candles,
      htfBias: "BUY",
      structure: { bos: true, choch: true, bias: "BULLISH" },
      price: candles[candles.length - 1].close,
      atr: 0.4,
      symbol: "EURUSD"
    });
    expect(entry).not.toBeNull();
    if (entry) {
      expect(entry.side).toBe("LONG");
      expect(entry.entry).toBeGreaterThanOrEqual(demandBottom);
      expect(entry.stopLoss).toBeLessThan(entry.entry); // stop below entry
      expect(entry.takeProfit).toBeGreaterThan(entry.entry);
      expect(entry.reasons.some((r) => r.toLowerCase().includes("stop-hunt"))).toBe(true);
    }
  });

  it("rejects a LONG that is already extended away from the block (chasing)", () => {
    const { candles } = bullishSetup();
    const eng = new InstitutionalEntryEngine();
    // price already ran ~4 ATR past the demand block — that's chasing, never allowed
    const entry = eng.find("LONG", {
      candles,
      htfBias: "BUY",
      structure: { bos: true, choch: true, bias: "BULLISH" },
      price: 99.4,
      atr: 0.4,
      symbol: "GBPUSD"
    });
    expect(entry).toBeNull();
  });

  it("rejects a LONG when the HTF trend is bearish (never fade trend)", () => {
    const { candles } = bullishSetup();
    const eng = new InstitutionalEntryEngine();
    const entry = eng.find("LONG", {
      candles,
      htfBias: "SELL", // bearish HTF
      structure: { bos: false, choch: false, bias: "BEARISH" },
      price: candles[candles.length - 1].close,
      atr: 0.4,
      symbol: "XAUUSD"
    });
    expect(entry).toBeNull();
  });

  it("mirrors SHORT for a bearish supply block + buy-side sweep", () => {
    // run up with REPEATED swing highs ~102.2 (BUY-SIDE pool), sweep through them
    // to 102.9 (stop hunt), reject, displace down leaving bearish FVG
    const candles: Candle[] = [];
    for (let i = 0; i < 12; i++) {
      if (i % 2 === 0) {
        candles.push(candle(i, 101.1, 102.2, 100.8, 101.2)); // swing HIGH at 102.2
      } else {
        candles.push(candle(i, 101.15, 101.5, 101.0, 101.2)); // lower high (dips)
      }
    }
    candles.push(candle(12, 101.9, 102.9, 101.8, 102.2)); // sweep buy-side to 102.9, reject
    candles.push(candle(13, 102.2, 102.4, 100.9, 101.1)); // displacement down
    candles.push(candle(14, 101.1, 101.3, 100.3, 100.5));
    candles.push(candle(15, 100.5, 101.7, 100.4, 101.6)); // pullback up toward supply
    candles.push(candle(16, 101.6, 101.8, 101.2, 101.4));

    const eng = new InstitutionalEntryEngine();
    const entry = eng.find("SHORT", {
      candles,
      htfBias: "SELL",
      structure: { bos: true, choch: true, bias: "BEARISH" },
      price: candles[candles.length - 1].close,
      atr: 0.4,
      symbol: "XAUUSD"
    });
    expect(entry).not.toBeNull();
    if (entry) {
      expect(entry.side).toBe("SHORT");
      expect(entry.stopLoss).toBeGreaterThan(entry.entry);
      expect(entry.takeProfit).toBeLessThan(entry.entry);
    }
  });
});
