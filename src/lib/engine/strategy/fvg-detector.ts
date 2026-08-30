import type { Candle, CandleSeries, Timeframe } from "../../types";
import type { FairValueGap } from "../analysis-types";
import type { StrategyConfig } from "./strategy-config";
import { computeGaps } from "./ifvg-detector";

/**
 * FVGDetector — locates Fair Value Gaps (3-candle imbalances) on the primary
 * timeframe. Bullish FVGs sit below price (discount for a buy), bearish FVGs
 * above (premium for a sell). Pure function of past candles, no lookahead.
 */
export class FVGDetector {
  constructor(private config: StrategyConfig) {}

  analyze(
    series: CandleSeries[],
    primary: Timeframe,
    currentPrice?: number
  ): FairValueGap[] {
    const cfg = this.config.fvg;
    let candles = series.find((s) => s.timeframe === primary);
    if (!candles || candles.candles.length < 5) {
      const fallback = [primary, "15m", "30m", "5m", "1h"];
      for (const tf of fallback) {
        const f = series.find((s) => s.timeframe === tf);
        if (f && f.candles.length >= 5) { candles = f; break; }
      }
    }
    if (!candles || candles.candles.length < 5) return [];

    const data = candles.candles;
    const price = currentPrice ?? data[data.length - 1].close;
    const gaps = computeGaps(data, price, (idx, len) => len - 1 - idx)
      .filter((g) => g.sizeAtr >= cfg.minSizeAtr && g.age <= cfg.maxAge);

    return gaps.slice(0, cfg.maxGaps).map((g) => ({
      upper: g.high,
      lower: g.low,
      type: g.type,
      age: g.age,
      filled: g.filled,
      sizeAtr: g.sizeAtr
    }));
  }
}
