import type { Candle, CandleSeries, Direction } from "../../types";
import { atr } from "../indicators";
import type { StrategyConfig } from "./strategy-config";
import type { InverseFVG } from "./types";

/** Shared FVG computation so FVGDetector and IFVGDetector stay consistent. */
export interface RawGap {
  high: number;
  low: number;
  type: "bullish" | "bearish";
  age: number;
  filled: boolean;
  sizeAtr: number;
}

/**
 * Computes Fair Value Gaps (3-candle imbalance) over a candle array. Pure
 * function of historical candles — no lookahead.
 */
export function computeGaps(
  candles: Candle[],
  price: number,
  byAge: (i: number, len: number) => number
): RawGap[] {
  const out: RawGap[] = [];
  if (!candles || candles.length < 5) return out;
  const atrArr = atr(candles, 14);
  let avgAtr = NaN;
  for (let i = atrArr.length - 1; i >= 0; i--) {
    if (isFinite(atrArr[i])) { avgAtr = atrArr[i]; break; }
  }
  if (!isFinite(avgAtr)) avgAtr = candles[candles.length - 1].close * 0.002;

  for (let i = 2; i < candles.length; i++) {
    const first = candles[i - 2];
    const third = candles[i];
    if (third.low > first.high) {
      const size = (third.low - first.high) / (avgAtr || 1);
      out.push({
        high: third.low,
        low: first.high,
        type: "bullish",
        age: byAge(i, candles.length),
        filled: price <= first.high,
        sizeAtr: size
      });
    }
    if (third.high < first.low) {
      const size = (first.low - third.high) / (avgAtr || 1);
      out.push({
        high: first.low,
        low: third.high,
        type: "bearish",
        age: byAge(i, candles.length),
        filled: price >= first.low,
        sizeAtr: size
      });
    }
  }
  return out;
}

/**
 * IFVGDetector — finds imbalance on a HIGHer timeframe that price is likely to
 * rotate back toward (premium/discount "draw" zones). These act as strong
 * magnet levels for pullback entries on the primary timeframe.
 */
export class IFVGDetector {
  constructor(private config: StrategyConfig) {}

  analyze(series: CandleSeries[], currentPrice: number): InverseFVG[] {
    const cfg = this.config.ifvg;
    const htf = series.find((s) => s.timeframe === cfg.timeframe);
    if (!htf || htf.candles.length < 10) return [];

    const last = htf.candles;
    const lastIdx = last.length - 1;
    const price = isFinite(currentPrice) ? currentPrice : last[lastIdx].close;
    const gaps = computeGaps(last, price, (idx, len) => len - 1 - idx)
      .filter((g) => g.sizeAtr >= cfg.minSizeAtr && g.age <= cfg.maxAge);

    return gaps.slice(0, 3).map((g) => ({
      upper: g.high,
      lower: g.low,
      type: g.type,
      age: g.age,
      filled: g.filled,
      sizeAtr: g.sizeAtr,
      timeframe: cfg.timeframe
    }));
  }
}

export { Direction };
