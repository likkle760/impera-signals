import { atr, pivotPoints } from "./indicators";
import type { Candle, CandleSeries, Timeframe } from "../types";
import type { FairValueGap, FibonacciLevels } from "./analysis-types";

/**
 * ICT / SMC analysis: Fair Value Gaps (imbalance) and Fibonacci retracement
 * levels used to locate discounted (buy) and premium (sell) zones.
 */
export class IctAnalysisEngine {
  analyzeFairValueGaps(
    series: CandleSeries[],
    primary: Timeframe = "15m",
    maxGaps = 4
  ): FairValueGap[] {
    let candles = series.find((s) => s.timeframe === primary);
    if (!candles || candles.candles.length < 5) {
      const fallback = ["15m", "30m", "5m", "1h"];
      for (const tf of fallback) {
        const f = series.find((s) => s.timeframe === tf);
        if (f && f.candles.length >= 5) { candles = f; break; }
      }
    }
    if (!candles || candles.candles.length < 5) return [];

    const data = candles.candles;
    const atrArr = atr(data, 14);
    const avgAtr = validLast(atrArr) || (data[data.length - 1].close * 0.002);
    const price = data[data.length - 1].close;
    const gaps: FairValueGap[] = [];

    for (let i = 2; i < data.length; i++) {
      const first = data[i - 2];
      const third = data[i];
      const body1 = { high: first.high, low: first.low };
      const body3 = { high: third.high, low: third.low };

      // Bullish FVG: candle3's low is above candle1's high (gap bullish)
      if (body3.low > body1.high) {
        gaps.push({
          upper: body3.low,
          lower: body1.high,
          type: "bullish",
          age: data.length - 1 - i,
          filled: price <= body1.high,
          sizeAtr: (body3.low - body1.high) / (avgAtr || 1)
        });
      }
      // Bearish FVG: candle3's high is below candle1's low
      if (body3.high < body1.low) {
        gaps.push({
          upper: body1.low,
          lower: body3.high,
          type: "bearish",
          age: data.length - 1 - i,
          filled: price >= body1.low,
          sizeAtr: (body1.low - body3.high) / (avgAtr || 1)
        });
      }
    }

    return gaps.slice(0, maxGaps);
  }

  analyzeFib(
    series: CandleSeries[],
    primary: Timeframe = "30m"
  ): FibonacciLevels {
    let candles = series.find((s) => s.timeframe === primary);
    if (!candles || candles.candles.length < 20) {
      const fallback = ["30m", "15m", "1h", "4h"];
      for (const tf of fallback) {
        const f = series.find((s) => s.timeframe === tf);
        if (f && f.candles.length >= 20) { candles = f; break; }
      }
    }
    if (!candles || candles.candles.length < 20) return emptyFib();

    const data = candles.candles;
    const price = data[data.length - 1].close;
    const { swingHighs, swingLows } = pivotPoints(data, 3);

    const lastHigh = swingHighs[swingHighs.length - 1];
    const lastLow = swingLows[swingLows.length - 1];
    const highIdx = data.findIndex((c) => c.high === lastHigh);
    const lowIdx = data.findIndex((c) => c.low === lastLow);

    // Prefer the most recent completed swing leg: use the swing that came later.
    const useHighLast = highIdx > lowIdx;
    const swingHigh = useHighLast ? lastHigh : lastHigh;
    const swingLow = useHighLast ? lastLow : lastLow;

    if (
      !isFinite(swingHigh) || !isFinite(swingLow) ||
      swingHigh === swingLow ||
      Math.max(highIdx, lowIdx) <= 0
    ) return emptyFib();

    const range = swingHigh - swingLow;
    const retracements: Record<string, number> = {
      "0.236": swingHigh - range * 0.236,
      "0.382": swingHigh - range * 0.382,
      "0.5": swingHigh - range * 0.5,
      "0.618": swingHigh - range * 0.618,
      "0.705": swingHigh - range * 0.705,
      "0.786": swingHigh - range * 0.786
    };

    // Price is nearest to which retracement? depth 1 = deepest discount.
    let retracementDepth: number | null = null;
    let bestDist = Infinity;
    for (const [key, level] of Object.entries(retracements)) {
      const d = Math.abs(level - price);
      if (d < bestDist) {
        bestDist = d;
        retracementDepth = parseFloat(key) >= 0.618 ? 1 : parseFloat(key) >= 0.5 ? 2 : 3;
      }
    }

    return { swingHigh, swingLow, levels: retracements, retracementDepth };
  }
}

function validLast(arr: number[]): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (isFinite(arr[i])) return arr[i];
  }
  return NaN;
}

function emptyFib(): FibonacciLevels {
  return { swingHigh: null, swingLow: null, levels: {}, retracementDepth: null };
}
