import type { Candle } from "../../types";

/**
 * Displacement engine (§6).
 *
 * Displacement is unusually strong directional movement: large ATR-multiple
 * candles/bodies, consecutive same-direction candles, and breaks of structure.
 * It is the CONFIRMATION component — a sweep is only meaningful if displacement
 * follows (§5). But EXTREME displacement means the move is likely already
 * extended → do NOT chase.
 */
export type DisplacementClass = "WEAK" | "NORMAL" | "STRONG" | "EXTREME";

export interface DisplacementResult {
  /** most relevant classification on the most recent candle(s) */
  classification: DisplacementClass;
  /** weighted score 0..10 for the directional move */
  score: number;
  /** ATR multiple of the recent directional impulse */
  atrMultiple: number;
  /** number of consecutive directional candles */
  streak: number;
  /** direction of the displacement (BUY being up-movement) */
  direction: "BUY" | "SELL";
  /** whether a structure break accompanied the move */
  brokeStructure: boolean;
  /** true when the move is already extended (do not chase) */
  extended: boolean;
  detail: string;
}

export class DisplacementEngine {
  constructor(private opts: { lookback?: number; strongMin?: number; extremeMin?: number } = {}) {
    this.opts = { lookback: 5, strongMin: 1.5, extremeMin: 3.0, ...this.opts };
  }

  detect(candles: Candle[], upto: number, atr: number, structure?: { bos?: boolean; choch?: boolean }): DisplacementResult {
    const lookback = this.opts!.lookback!;
    const strongMin = this.opts!.strongMin!;
    const extremeMin = this.opts!.extremeMin!;
    const start = Math.max(1, upto - lookback);
    let bestAtr = 0;
    let bestDir: "BUY" | "SELL" = "BUY";
    let streak = 0;

    for (let i = start; i <= upto; i++) {
      const c = candles[i];
      const body = Math.abs(c.close - c.open);
      const rng = c.high - c.low;
      const attr = (body + rng) / 2 / Math.max(atr, 1e-12);
      if (attr > bestAtr) {
        bestAtr = attr;
        bestDir = c.close >= c.open ? "BUY" : "SELL";
      }
    }
    // directional streak
    let cur = 0;
    for (let i = upto; i >= Math.max(1, upto - 5); i--) {
      if (candles[i].close >= candles[i - 1].close) {
        cur++;
      } else {
        if (bestDir === "BUY") { streak = cur; break; }
        cur = 0;
        break;
      }
    }
    if (bestDir === "SELL") {
      cur = 0;
      for (let i = upto; i >= Math.max(1, upto - 5); i--) {
        if (candles[i].close <= candles[i - 1].close) cur++;
        else break;
      }
      streak = cur;
    }

    const brokeStructure = !!structure?.bos || !!structure?.choch;
    const extended = bestAtr >= extremeMin;
    let classification: DisplacementClass;
    if (bestAtr >= extremeMin) classification = "EXTREME";
    else if (bestAtr >= strongMin) classification = "STRONG";
    else if (bestAtr >= 0.7) classification = "NORMAL";
    else classification = "WEAK";

    let score = 0;
    if (brokeStructure) score += 3;
    if (classification === "STRONG") score += 4;
    else if (classification === "EXTREME") score += 4; // but extended flags do-not-chase
    if (streak >= 3) score += 2;
    if (extended) score -= 2; // extended move already; chasing risk

    return {
      classification,
      score: Math.max(0, Math.min(10, score)),
      atrMultiple: bestAtr,
      streak,
      direction: bestDir,
      brokeStructure,
      extended,
      detail: `${bestDir === "BUY" ? "Bullish" : "Bearish"} displacement ${bestAtr.toFixed(1)}× ATR, ${classification.toLowerCase()}${extended ? " (extended)" : ""}`
    };
  }
}