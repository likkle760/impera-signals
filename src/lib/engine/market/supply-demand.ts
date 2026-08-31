import type { Candle } from "../../types";

/**
 * Supply / Demand + Order Block engine (§8, §9).
 *
 * §9 is explicit: "Do not label every last opposite candle an order block."
 * A valid order block requires:
 *   Bullish OB: a bearish base candle + strong bullish displacement + a
 *               structure break, and it must remain relevant (not fully consumed
 *               by displacement, still near active price action).
 *   Bearish OB: the mirror image.
 *
 * Each zone carries a QUALITY SCORE, AGE, number of tests, distance, HTF
 * alignment, and reaction strength — so the engine is selective, not exhaustive.
 */
export type ZoneType = "demand" | "supply";

export interface SupplyDemandZone {
  type: ZoneType;
  top: number;
  bottom: number;
  mid: number;
  /** 1..10 quality */
  qualityScore: number;
  /** number of bases merged here */
  age: number;
  /** how many times price reacted to the zone */
  tests: number;
  /** ATR distance from current price */
  distanceAtr: number;
  /** aligned with HTF bias */
  htfAligned: boolean;
  kind: "DEMAND" | "SUPPLY";
}

export interface OrderBlockZone extends SupplyDemandZone {
  baseIndex: number;
  /** the candle that displaced away from the base */
  displacementIndex: number;
  breakDirection: "BULLISH" | "BEARISH";
  reactionStrength: number; // 0..10
}

export interface ZoneInput {
  candles: Candle[];
  upto: number;
  atr: number;
  htfBias?: string;
  structure?: { bos?: boolean; choch?: boolean; bias?: string };
  displacement?: { classification: string };
}

export class SupplyDemandEngine {
  /** Find evidence-based order blocks (demand/supply) within the window. */
  detectOrderBlocks(input: ZoneInput): { zones: OrderBlockZone[] } {
    const { candles, upto, atr } = input;
    const start = Math.max(1, upto - 60);
    const price = candles[upto].close;
    const strongDisp = input.displacement?.classification === "STRONG" || input.displacement?.classification === "EXTREME";
    const zones: OrderBlockZone[] = [];

    for (let i = start; i <= upto - 1; i++) {
      const c = candles[i];
      const displace = candles[i + 1];
      const body = Math.abs(displace.close - displace.open);
      const attr = body / Math.max(atr, 1e-12);

      // Demand: bearish base candle followed by strong bullish displacement.
      if (c.close < c.open && displace.close > displace.open && attr >= 1.2) {
        const base: [number, number] = [Math.min(c.open, c.close), Math.max(c.open, c.close)];
        const breakout = displace.high > base[1];
        if (!breakout) continue;
        const broken = !!input.structure?.bos;
        zones.push(this.makeOB(input, i, i + 1, "demand", "DEMAND", base[0], base[1], price, atr, broken || strongDisp, strongDisp));
      }
      // Supply: bullish base candle followed by strong bearish displacement.
      else if (c.close > c.open && displace.close < displace.open && attr >= 1.2) {
        const base: [number, number] = [Math.min(c.open, c.close), Math.max(c.open, c.close)];
        const breakdown = displace.low < base[0];
        if (!breakdown) continue;
        const broken = !!input.structure?.bos;
        zones.push(this.makeOB(input, i, i + 1, "supply", "SUPPLY", base[0], base[1], price, atr, broken || strongDisp, strongDisp));
      }
    }

    zones.sort((a, b) => b.qualityScore - a.qualityScore);
    return { zones };
  }

  private makeOB(
    input: ZoneInput,
    baseIndex: number,
    dispIndex: number,
    kind: ZoneType,
    kindLabel: "DEMAND" | "SUPPLY",
    bottom: number,
    top: number,
    price: number,
    atr: number,
    brokeStructure: boolean,
    strongDisp: boolean
  ): OrderBlockZone {
    const { candles, upto, htfBias } = input;
    // distance & number of tests
    let tests = 0;
    let reaction = 0;
    for (let j = dispIndex + 1; j <= upto; j++) {
      const c = candles[j];
      const touched = kind === "demand" ? c.low <= top : c.high >= bottom;
      if (touched) {
        tests++;
        reaction += Math.min(3, Math.abs(c.close - (kind === "demand" ? bottom : top)) / Math.max(atr, 1e-12));
      }
    }
    const aligned = kind === "demand" ? htfBias === "BULLISH" : htfBias === "BEARISH";
    const distanceAtr = kind === "demand"
      ? Math.max(0, price - top) / Math.max(atr, 1e-12)
      : Math.max(0, bottom - price) / Math.max(atr, 1e-12);

    let q = 0;
    if (strongDisp && brokeStructure) q += 4;
    else if (strongDisp) q += 3;
    if (aligned) q += 2;
    if (tests >= 2) q += 2;
    else if (tests === 1) q += 1;
    if (distanceAtr <= 5) q += 1; // relevant to current price
    if (reaction >= 2) q += 1;

    return {
      type: kind,
      kind: kindLabel,
      top, bottom, mid: (top + bottom) / 2,
      qualityScore: Math.max(0, Math.min(10, q)),
      age: upto - baseIndex,
      tests,
      distanceAtr,
      htfAligned: aligned,
      baseIndex,
      displacementIndex: dispIndex,
      breakDirection: kind === "demand" ? "BULLISH" : "BEARISH",
      reactionStrength: Math.min(10, Math.round(reaction * 2))
    };
  }
}