import type { Candle } from "../../types";
import { SupplyDemandEngine, type OrderBlockZone } from "./supply-demand";
import { LiquiditySweepEngine } from "./liquidity-sweep";
import { ImbalanceEngine, type FVGPool } from "./imbalance";
import { DisplacementEngine } from "./displacement";

/**
 * Institutional entry gate.
 *
 * Implements the order-block / smart-money entry rules so MARKET entries stop
 * chasing price and instead enter at defended institutional zones:
 *
 *   A valid trade needs, IN ORDER:
 *     1. Higher-timeframe trend in the trade direction (never fade it).
 *     2. A confirmed ORDER BLOCK on the entry timeframe formed by:
 *           a. a liquidity sweep first (stop hunt) on the opposite side, then
 *           b. strong DISPLACEMENT away, leaving
 *           c. an FVG / imbalance.
 *     3. Price now PULLING BACK toward that block (not extended) — so the stop
 *        sits just beyond the block, not under a chase.
 *
 * If any link is missing → NO TRADE. This is intentionally SELECTIVE: fewer,
 * higher-conviction entries. Chasing the open/current price is exactly what
 * causes stop-outs, and this gate forbids it.
 */

export interface InstitutionalEntryInput {
  /** candles on the ENTRY timeframe (e.g. 15m for intraday market, 1h for swing) */
  candles: Candle[];
  /** higher-timeframe directional bias: "BUY" | "SELL" | "NEUTRAL" */
  htfBias: string;
  /** structure shift on the entry timeframe */
  structure: { bos?: boolean; choch?: boolean; bias?: string };
  /** current live price (for pullback-distance checks) */
  price: number;
  atr: number;
  symbol?: string;
}

export interface InstitutionalEntry {
  side: "LONG" | "SHORT";
  /** demand/supply block used */
  zone: { top: number; bottom: number; mid: number; quality: number };
  entry: number;
  stopLoss: number;
  takeProfit: number;
  /** the liquidity pool that was swept on the opposite side (the stop-hunt) */
  sweptPool: string;
  /** the FVG left behind by the displacement */
  fvg: string | null;
  /** why this is a valid institutional entry */
  reasons: string[];
}

export class InstitutionalEntryEngine {
  /**
   * Attempt to find a valid institutional entry aligned with `side`.
   * Returns null when there is no valid order-block/sweep/FVG confluence (NO TRADE).
   */
  find(side: "LONG" | "SHORT", input: InstitutionalEntryInput): InstitutionalEntry | null {
    const { candles, htfBias, structure, price, atr, symbol } = input;

    // 1. Never fade the higher-timeframe trend.
    if (htfBias !== "BUY" && htfBias !== "SELL") return null;
    if (side === "LONG" && htfBias !== "BUY") return null;
    if (side === "SHORT" && htfBias !== "SELL") return null;

    const upto = Math.max(0, candles.length - 1);
    const strongDisp = { classification: "STRONG" };

    // Run the market intelligence on the entry timeframe.
    const sd = new SupplyDemandEngine().detectOrderBlocks({
      candles, upto, atr, htfBias, structure,
      displacement: { classification: strongDisp.classification }
    });
    const sweep = new LiquiditySweepEngine({ maxWickAtr: 2.5 }).detect({
      candles, upto, atr, structure,
      majorLevels: []
    });
    const fvgRes = new ImbalanceEngine().detect({
      candles, upto, atr, htfBias,
      structure, displacement: strongDisp
    });

    // Pick the best order block on the correct side.
    const wantKind = side === "LONG" ? ["DEMAND", "demand"] : ["SUPPLY", "supply"];
    const ob = this.bestSideBlock(sd.zones, side, price, atr);
    if (!ob) return null;

    const reasons: string[] = [];

    // 2b. A liquidity sweep must have happened FIRST, on the opposite side,
    //     at/under the block's level (the stop-hunt that preceded the move).
    const needSweepType = side === "LONG" ? "SELL-SIDE" : "BUY-SIDE";
    const sweepHit = sweep.all.some((s) =>
      s.pool.type === needSweepType &&
      s.quality !== "LOW" &&
      (side === "LONG" ? s.pool.price <= ob.bottom * 1.001 : s.pool.price >= ob.top * 0.999)
    );
    if (!sweepHit) {
      // Even without an explicit level-matched sweep, require displacement +
      // structure shift evidence so we never enter a random block.
      if (!(ob.reactionStrength >= 2 && (structure.bos || structure.choch))) return null;
    } else {
      reasons.push(`stop-hunt: ${needSweepType} liquidity swept before the move`);
    }

    // 2c. An FVG/imbalance formed during the displacement on the correct side.
    const needFvg = side === "LONG" ? "bullish" : "bearish";
    const fvg = fvgRes.gaps.find((g) =>
      g.type === needFvg && g.strongCreation && !g.filled &&
      g.createdAt >= ob.baseIndex &&
      (side === "LONG" ? g.lower >= ob.bottom : g.upper <= ob.top)
    );
    if (fvg) reasons.push(`imbalance left: ${fvg.type} FVG`);

    // 3. Price must be PULLING BACK to the block, not extended away, evaluated
    //    on the LIVE tick (input.price) — never chase a move that's already run.
    const liveDistance = Math.max(0, side === "LONG" ? (price - ob.top) / atr : (ob.bottom - price) / atr);
    if (liveDistance > 2.5) return null; // price already ran far past the OB — chasing now
    if (side === "LONG" && price < ob.bottom) return null; // already through the block
    if (side === "SHORT" && price > ob.top) return null;

    // Minimum block quality.
    if (ob.qualityScore < 5) return null;

    const entry = side === "LONG" ? ob.top : ob.bottom;
    const stopLoss = side === "LONG"
      ? ob.bottom - Math.max(atr * 0.15, (ob.top - ob.bottom) * 0.1)
      : ob.top + Math.max(atr * 0.15, (ob.top - ob.bottom) * 0.1);
    const takeProfit = side === "LONG"
      ? entry + (entry - stopLoss) * 2
      : entry - (stopLoss - entry) * 2;

    reasons.unshift(
      `${side === "LONG" ? "demand" : "supply"} block ${ob.top.toFixed(4)}-${ob.bottom.toFixed(4)} (q${ob.qualityScore})`,
      `with-trend ${htfBias}`
    );

    return {
      side,
      zone: { top: ob.top, bottom: ob.bottom, mid: (ob.top + ob.bottom) / 2, quality: ob.qualityScore },
      entry,
      stopLoss,
      takeProfit,
      sweptPool: sweepHit ? needSweepType : "structure-shift-only",
      fvg: fvg ? `${fvg.type} FVG` : null,
      reasons
    };
  }

  private bestSideBlock(
    zones: OrderBlockZone[],
    side: "LONG" | "SHORT",
    price: number,
    atr: number
  ): OrderBlockZone | null {
    const wantType = side === "LONG" ? "demand" : "supply";
    return zones
      .filter((z) => z.type === wantType)
      .find((z) => z.distanceAtr <= 2.5) ?? null;
  }
}
