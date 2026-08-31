import type { Candle } from "../../types";
import type { SwingPoint, SwingStructureBias } from "./types";

export interface SwingStructureResult {
  bias: SwingStructureBias;
  /** confirmed swing points (fractal, right-bar confirmed) */
  points: SwingPoint[];
  /** the sequence of swing highs (prices, oldest to newest) */
  highs: number[];
  /** the sequence of swing lows (prices, oldest to newest) */
  lows: number[];
  /** whether the most recent swing high sequence is ascending (HH) */
  higherHighs: boolean;
  higherLows: boolean;
  lowerHighs: boolean;
  lowerLows: boolean;
  /** price broke the most recent relevant swing — BOS in trade direction */
  bos: boolean;
  /** change of character: trend flipped vs prior swing sequence */
  choch: boolean;
}

/**
 * Objective swing-point detection. A swing high is a bar whose high is strictly
 * greater than the `lookback` bars on each side; a swing low is symmetric. The
 * detector only ever uses bars at indices <= current, so points are confirmed by
 * RIGHT bars that are already closed — no look-ahead bias.
 */
export class SwingStructure {
  constructor(private lookback: number) {}

  /** Detect structure using ONLY candles[0..upto] (upto is the last closed bar). */
  detect(candles: Candle[], upto: number): SwingStructureResult {
    const points: SwingPoint[] = [];
    const lb = Math.max(1, this.lookback);

    // Swing highs: bar i is a high if hi[i] > all hi in [i-lb, i+lb]
    for (let i = lb; i <= upto - lb; i++) {
      const c = candles[i];
      let isHigh = true;
      let isLow = true;
      for (let j = i - lb; j <= i + lb; j++) {
        if (j === i) continue;
        if (candles[j].high >= c.high) isHigh = false;
        if (candles[j].low <= c.low) isLow = false;
        if (!isHigh && !isLow) break;
      }
      if (isHigh) points.push({ index: i, price: c.high, high: true });
      if (isLow) points.push({ index: i, price: c.low, high: false });
    }
    points.sort((a, b) => a.index - b.index);

    const highs = points.filter((p) => p.high).map((p) => p.price);
    const lows = points.filter((p) => !p.high).map((p) => p.price);
    const lastPrice = candles[upto].close;

    // Sequence analysis across the most recent confirmed swings.
    const recentHighs = highs.slice(-4);
    const recentLows = lows.slice(-4);
    const higherHighs = strictlyIncreasing(recentHighs);
    const higherLows = strictlyIncreasing(recentLows);
    const lowerHighs = strictlyDecreasing(recentHighs);
    const lowerLows = strictlyDecreasing(recentLows);

    // Structural bias: bullish requires ascending highs AND ascending lows.
    let bias: SwingStructureBias = "NEUTRAL";
    if (higherHighs && higherLows) bias = "BULLISH";
    else if (lowerHighs && lowerLows) bias = "BEARISH";

    // Break of structure: price closed beyond the most recent swing extreme.
    const lastHigh = recentHighs[recentHighs.length - 1];
    const lastLow = recentLows[recentLows.length - 1];
    const bos = (lastHigh !== undefined && lastPrice > lastHigh) ||
      (lastLow !== undefined && lastPrice < lastLow);

    // Change of character: recent bias contradicts the prior swing trend.
    let choch = false;
    const h2 = highs.slice(-6);
    const l2 = lows.slice(-6);
    const prevUp = h2.length >= 3 && h2[h2.length - 1] > h2[h2.length - 3] && l2[l2.length - 1] > l2[l2.length - 3];
    const prevDown = h2.length >= 3 && h2[h2.length - 1] < h2[h2.length - 3] && l2[l2.length - 1] < l2[l2.length - 3];
    if (prevUp && (lowerHighs || lowerLows)) choch = true;
    if (prevDown && (higherHighs || higherLows)) choch = true;

    return {
      bias,
      points,
      highs,
      lows,
      higherHighs,
      higherLows,
      lowerHighs,
      lowerLows,
      bos,
      choch
    };
  }
}

function strictlyIncreasing(arr: number[]): boolean {
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] <= arr[i - 1]) return false;
  }
  return arr.length >= 2;
}
function strictlyDecreasing(arr: number[]): boolean {
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] >= arr[i - 1]) return false;
  }
  return arr.length >= 2;
}
