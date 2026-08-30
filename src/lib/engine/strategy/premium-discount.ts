import type { Candle, CandleSeries, Direction, Timeframe } from "../../types";
import type { FibonacciLevels } from "../analysis-types";
import { pivotPoints } from "../indicators";
import type { StrategyConfig } from "./strategy-config";

export interface PremiumDiscount {
  /** fib retracement levels of the current swing */
  fib: FibonacciLevels;
  /** where price sits relative to the measured swing */
  zone: "DISCOUNT" | "EQUILIBRIUM" | "PREMIUM";
  /** 1 = deep discount (best buy), 3 = deep premium (best sell) */
  depth: number;
  /** whether price is inside a discount zone for a BUY, or premium for a SELL */
  alignedFor(direction: Direction): boolean;
}

function emptyFib(): FibonacciLevels {
  return { swingHigh: null, swingLow: null, levels: {}, retracementDepth: null };
}

/**
 * PremiumDiscountAnalyzer — measures where the latest price sits inside the
 * current swing leg using Fibonacci retracement. Price in the lower half
 * (deep retracement, e.g. 0.618/0.705/0.786) is "discount" (attractive for a
 * buy); the upper half is "premium" (attractive for a sell). Deterministic and
 * purely historical — no lookahead.
 */
export class PremiumDiscountAnalyzer {
  constructor(private config: StrategyConfig) {}

  analyze(series: CandleSeries[], primary: Timeframe, currentPrice?: number): PremiumDiscount {
    let candles = series.find((s) => s.timeframe === primary);
    if (!candles || candles.candles.length < 20) {
      const fallback = [primary, "30m", "15m", "1h", "4h"];
      for (const tf of fallback) {
        const f = series.find((s) => s.timeframe === tf);
        if (f && f.candles.length >= 20) { candles = f; break; }
      }
    }
    if (!candles || candles.candles.length < 20) {
      const base = { fib: emptyFib(), zone: "EQUILIBRIUM" as const, depth: 2 };
      return { ...base, alignedFor: (d: Direction) => false };
    }

    const data = candles.candles;
    const price = currentPrice ?? data[data.length - 1].close;
    const { swingHighs, swingLows } = pivotPoints(data as Candle[], 3);

    const lastHigh = swingHighs[swingHighs.length - 1] ?? null;
    const lastLow = swingLows[swingLows.length - 1] ?? null;
    if (lastHigh == null || lastLow == null || lastHigh === lastLow || !isFinite(lastHigh) || !isFinite(lastLow)) {
      const base = { fib: emptyFib(), zone: "EQUILIBRIUM" as const, depth: 2 };
      return { ...base, alignedFor: (d: Direction) => false };
    }

    const range = lastHigh - lastLow;
    const retracements: Record<string, number> = {
      "0.236": lastHigh - range * 0.236,
      "0.382": lastHigh - range * 0.382,
      "0.5": lastHigh - range * 0.5,
      "0.618": lastHigh - range * 0.618,
      "0.705": lastHigh - range * 0.705,
      "0.786": lastHigh - range * 0.786
    };

    let depth = 2;
    let zone: "DISCOUNT" | "EQUILIBRIUM" | "PREMIUM" = "EQUILIBRIUM";
    const eq = (lastHigh + lastLow) / 2;
    if (price >= eq) {
      zone = "PREMIUM";
      depth = price >= retracements["0.236"] ? 3 : 2;
    } else {
      zone = "DISCOUNT";
      depth = price <= retracements["0.618"] ? 1 : 2;
    }

    const fib: FibonacciLevels = {
      swingHigh: lastHigh,
      swingLow: lastLow,
      levels: retracements,
      retracementDepth: zone === "DISCOUNT" ? depth : depth + 1
    };

    return {
      fib,
      zone,
      depth,
      alignedFor: (d: Direction) => (d === "BUY" ? zone === "DISCOUNT" : zone === "PREMIUM")
    };
  }
}
