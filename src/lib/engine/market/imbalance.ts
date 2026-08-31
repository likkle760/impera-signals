import type { Candle } from "../../types";

/**
 * Imbalance / Fair Value Gap engine (§7).
 *
 * A three-candle FVG is a body gap left by candle 3 relative to candle 1:
 *   Bullish: low(c3) > high(c1)  → discount zone below price
 *   Bearish: high(c3) < low(c1)  → premium zone above price
 *
 * We additionally track fill % (how much of the gap has been retraced), whether
 * it was created during strong displacement / alongside BOS/MSS, HTF alignment,
 * and distance from price. Higher quality = created on displacement + break of
 * structure + aligned with HTF + still unfilled.
 */
export type FvgType = "bullish" | "bearish";

export interface FVGPool {
  upper: number;
  lower: number;
  type: FvgType;
  /** ATR width */
  sizeAtr: number;
  /** creation candle index in the supplied array */
  createdAt: number;
  /** fraction 0..1 of the gap already filled by a retracement */
  fillPct: number;
  filled: boolean;
  /** created during strong displacement or alongside BOS/MSS */
  strongCreation: boolean;
  /** aligned with the higher-timeframe directional bias */
  htfAligned: boolean;
  distanceAtr: number;
  /** 0..10 quality score */
  qualityScore: number;
  note: string;
}

export interface FvgInput {
  candles: Candle[];
  upto: number;
  atr: number;
  /** HTF bias e.g. "BULLISH" | "BEARISH" | "NEUTRAL" */
  htfBias?: string;
  /** structure shift signal */
  structure?: { bos?: boolean; choch?: boolean; bias?: string };
  /** displacement classification signal to weight strong-creation */
  displacement?: { classification: string };
}

export class ImbalanceEngine {
  detect(input: FvgInput): { gaps: FVGPool[]; best: FVGPool | null } {
    const { candles, upto, atr, htfBias, structure, displacement } = input;
    const gaps: FVGPool[] = [];
    const price = candles[upto].close;
    const strongDisp = displacement?.classification === "STRONG" || displacement?.classification === "EXTREME";
    const broke = !!structure?.bos || !!structure?.choch;

    // scan for 3-candle gaps within the recent window
    const start = Math.max(2, upto - 40);
    let i = start;
    while (i + 2 <= upto) {
      const c1 = candles[i - 2];
      const c2 = candles[i - 1];
      const c3 = candles[i];
      let upper: number;
      let lower: number;
      let type: FvgType;
      // bullish gap requires c3 low > c1 high (typical: c1 down, c3 strong up)
      if (c3.low > c1.high) {
        lower = c1.high;
        upper = c3.low;
        type = "bullish";
      } else if (c3.high < c1.low) {
        lower = c3.high;
        upper = c1.low;
        type = "bearish";
      } else {
        i++;
        continue;
      }
      if (upper - lower < atr * 0.3) { i++; continue; } // not a meaningful gap

      // fill % = how far price has traded back into the gap since creation
      let fillPct = 0;
      for (let j = Math.max(start, 0); j <= upto; j++) {
        const c = candles[j];
        const span = upper - lower;
        if (span <= 0) continue;
        let overlap = 0;
        if (c.high > lower && c.low < upper) {
          overlap = Math.min(c.high, upper) - Math.max(c.low, lower);
        }
        fillPct = Math.max(fillPct, Math.min(1, overlap / span));
        if (c.high >= upper && type === "bullish") { fillPct = 1; break; }
        if (c.low <= lower && type === "bearish") { fillPct = 1; break; }
      }

      const aligned = type === "bullish" ? htfBias === "BULLISH" : htfBias === "BEARISH";
      const distanceAtr = Math.abs((type === "bullish" ? price - lower : upper - price)) / Math.max(atr, 1e-12);
      const sizeAtr = (upper - lower) / Math.max(atr, 1e-12);
      const filled = fillPct >= 0.85;

      let q = 0;
      if (strongDisp && broke) q += 4;      // created on displacement + BOS/MSS
      else if (strongDisp) q += 3;
      if (aligned) q += 2;
      if (!filled) q += 2;                   // unfilled edge intact
      if (sizeAtr >= 0.8 && sizeAtr <= 2.5) q += 1; // meaningful but not absurdly wide
      if (distanceAtr >= 0.3 && distanceAtr <= 4) q += 1; // within a tradeable retrace

      gaps.push({
        upper, lower, type, sizeAtr,
        createdAt: i,
        fillPct, filled,
        strongCreation: strongDisp && broke,
        htfAligned: aligned,
        distanceAtr,
        qualityScore: Math.max(0, Math.min(10, q)),
        note: `${type === "bullish" ? "Bullish" : "Bearish"} FVG ${sizeAtr.toFixed(1)}× ATR, ${Math.round(fillPct * 100)}% filled${aligned ? ", HTF-aligned" : ""}`
      });
      i += 2; // gaps don't overlap-scan for distinct zones
    }

    gaps.sort((a, b) => b.qualityScore - a.qualityScore);
    return { gaps, best: gaps[0] ?? null };
  }
}