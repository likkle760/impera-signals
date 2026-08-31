import type { Candle } from "../../types";

/**
 * Liquidity sweep engine (§4/5 of the spec).
 *
 * §5 is emphatic: "A wick through a level alone is NOT enough."
 * A valid sweep requires the full sequence:
 *   1. A structural liquidity pool exists (PDH/PDL, PWH/PWL, session hi/lo,
 *      equal highs/lows, repeated swing extremes, obvious breakout level).
 *   2. Price trades THROUGH it (a real wick or close beyond).
 *   3. Price FAILS to hold beyond it and reverses back through.
 *   4. Displacement follows away from the level (confirmation, not optional).
 *
 * Only high-quality sweeps (major HTF level + clean rejection + displacement +
 * structure shift + favorable target) should materially lift a signal score.
 * Low-quality random intraday wicks are ignored.
 */
export type LiquidityType = "BUY-SIDE" | "SELL-SIDE";
export type SweepQuality = "LOW" | "MEDIUM" | "HIGH";

export interface LiquidityPool {
  price: number;
  type: LiquidityType;
  source: string;
  /** 1..10 significance of the pool (major HTF level scores high). */
  significance: number;
  timesTouched: number;
}

export interface LiquiditySweep {
  pool: LiquidityPool;
  /** how far price traded through the level (in ATR) */
  wickThroughAtr: number;
  /** close was back on the risk-free side of the level */
  rejected: boolean;
  /** displacement away from the level right after the rejection */
  displacedAway: boolean;
  /** structure shifted (MSS/CHoCH) after the rejection */
  structureShift: boolean;
  quality: SweepQuality;
  /** 0..10 quality score for weighting into signals */
  qualityScore: number;
  timestamp: number;
  note: string;
}

export interface LiquiditySweepResult {
  /** all identifiable pools for the window (buy-side above / sell-side below) */
  pools: LiquidityPool[];
  /** the most recent confirmed sweep, if any */
  current: LiquiditySweep | null;
  all: LiquiditySweep[];
}

export interface SweepInput {
  candles: Candle[];
  upto: number;
  atr: number;
  /** structure shift signal from the MSE (bos/choch per timeframe) */
  structure: { bos?: boolean; choch?: boolean; bias?: string };
  /** externally supplied major levels (PDH/PDL/PWH/PWL/session hi-lo). */
  majorLevels?: LevelRef[];
}

export interface LevelRef {
  price: number;
  type: LiquidityType;
  source: string;
  significance: number;
}

/**
 * Detects liquidity pools and confirmed high-quality sweeps.
 * Only ever reads candles at indices <= upto (no look-ahead by construction).
 */
export class LiquiditySweepEngine {
  constructor(
    private opts: {
      /** look back window for pool/touch discovery */
      lookback?: number;
      /** min bars price must stay beyond the level for it to count as a real pool */
      minSignificance?: number;
      /** max wick (ATR) for a rejection to still be "clean" before we call it a breakout */
      maxWickAtr?: number;
    } = {}
  ) {
    this.opts = { lookback: 120, minSignificance: 4, maxWickAtr: 2.0, ...this.opts };
  }

  detect(input: SweepInput): LiquiditySweepResult {
    const { candles, upto, atr, structure } = input;
    const lookback = this.opts!.lookback!;
    const start = Math.max(0, upto - lookback);

    // ── 1. Build pools from repeated swing extremes + dramatic isolated levels ──
    const pools = this.findPools(candles, start, upto, atr, input.majorLevels);

    // ── 2. Detect a confirmed sweep on the most recent bars ──
    const recent = candles.slice(Math.max(start, upto - 15), upto + 1);
    const all: LiquiditySweep[] = [];

    for (const pool of pools) {
      // Only examine pools that price actually traded through recently.
      const touchedAt = this.lastTouch(recent, pool);
      if (!touchedAt) continue;
      const sweep = this.evaluateSweep(recent, pool, touchedAt, atr, structure, upto);
      if (sweep) all.push(sweep);
    }

    all.sort((a, b) => b.timestamp - a.timestamp);
    return { pools, current: all[0] ?? null, all };
  }

  private findPools(candles: Candle[], start: number, upto: number, atr: number, major?: LevelRef[]): LiquidityPool[] {
    const pools: LiquidityPool[] = [];
    const seen = new Set<string>();

    const add = (price: number, type: LiquidityType, source: string, sig: number) => {
      const key = `${price.toFixed(6)}|${type}`;
      if (seen.has(key)) return;
      seen.add(key);
      pools.push({ price, type, source, significance: sig, timesTouched: 0 });
    };

    // Major externally supplied levels carry highest significance.
    for (const lv of major ?? []) add(lv.price, lv.type, lv.source, Math.max(lv.significance, 6));

    // Equal highs / equal lows (repeated swing extremes) within the window.
    const highs: number[] = [];
    const lows: number[] = [];
    for (let i = start + 2; i <= upto - 2; i++) {
      const c = candles[i];
      if (c.high > candles[i - 1].high && c.high > candles[i + 1].high && c.high >= candles[i + 2].high) highs.push(c.high);
      if (c.low < candles[i - 1].low && c.low < candles[i + 1].low && c.low <= candles[i + 2].low) lows.push(c.low);
    }
    for (const h of findEqualGroups(highs, atr * 0.5)) add(h, "BUY-SIDE", "Equal Highs / Repeated Swing High", 6);
    for (const l of findEqualGroups(lows, atr * 0.5)) add(l, "SELL-SIDE", "Equal Lows / Repeated Swing Low", 6);

    // Range extremes become liquidity pools.
    let rangeHi = -Infinity;
    let rangeLo = Infinity;
    for (let i = start; i <= upto; i++) {
      rangeHi = Math.max(rangeHi, candles[i].high);
      rangeLo = Math.min(rangeLo, candles[i].low);
    }
    if (isFinite(rangeHi)) add(rangeHi, "BUY-SIDE", "Range High / Breakout Level", 5);
    if (isFinite(rangeLo)) add(rangeLo, "SELL-SIDE", "Range Low / Breakdown Level", 5);

    return pools;
  }

  private lastTouch(recent: Candle[], pool: LiquidityPool): number | null {
    for (let i = recent.length - 1; i >= 1; i--) {
      const c = recent[i];
      if (pool.type === "BUY-SIDE" && c.high >= pool.price) return c.time;
      if (pool.type === "SELL-SIDE" && c.low <= pool.price) return c.time;
    }
    return null;
  }

  private evaluateSweep(
    recent: Candle[],
    pool: LiquidityPool,
    touchedAt: number,
    atr: number,
    structure: { bos?: boolean; choch?: boolean; bias?: string },
    upto: number
  ): LiquiditySweep | null {
    const idx = recent.findIndex((c) => c.time === touchedAt);
    if (idx < 0 || idx + 1 >= recent.length) return null;

    const touch = recent[idx];
    const after = recent[idx + 1];
    const wickThrough = pool.type === "BUY-SIDE"
      ? (touch.high - pool.price) / Math.max(atr, 1e-12)
      : (pool.price - touch.low) / Math.max(atr, 1e-12);
    if (wickThrough < 0.3 || wickThrough > this.opts!.maxWickAtr!) return null; // no real sweep, or it's a genuine breakout, not a sweep

    // Rejection: the NEXT bars confirm price failed to hold the other side.
    const rejected = pool.type === "BUY-SIDE"
      ? after.close < pool.price || touch.close < pool.price
      : after.close > pool.price || touch.close > pool.price;
    if (!rejected) return null; // failed to hold = not a sweep, price kept going → breakout

    // Displacement away (confirmation). For a BUY-SIDE pool, price swept above
    // it and should now move DOWN away from it; for SELL-SIDE, up and away.
    const displacedAway = pool.type === "BUY-SIDE"
      ? (pool.price - after.close) / Math.max(atr, 1e-12) > 1.0
      : (after.close - pool.price) / Math.max(atr, 1e-12) > 1.0;

    // Structure shift confirmation (MSS/CHoCH) on the same window.
    const structureShift = structure.choch === true;

    let qualityScore = 0;
    qualityScore += Math.min(4, pool.significance / 2);            // major vs minor level
    if (displacedAway) qualityScore += 3;                          // §5: displacement is the key confirm
    if (structureShift) qualityScore += 2;                          // MSS/CHoCH
    if (wickThrough >= 0.5 && wickThrough <= 1.5) qualityScore += 1; // clean, not over-extended

    let quality: SweepQuality = "LOW";
    if (qualityScore >= 8) quality = "HIGH";
    else if (qualityScore >= 5) quality = "MEDIUM";

    // A wick-only touch with no rejection/displacement is not a sweep at all.
    if (!displacedAway && qualityScore < 5) return null;

    const note = quality === "HIGH"
      ? `${pool.type} liquidity at ${pool.source} swept cleanly with rejection + displacement`
      : quality === "MEDIUM"
        ? `${pool.type} liquidity swept, partial confirmation`
        : `minor liquidity touch at ${pool.source}, low significance`;

    return {
      pool,
      wickThroughAtr: wickThrough,
      rejected,
      displacedAway,
      structureShift,
      quality,
      qualityScore,
      timestamp: touchedAt,
      note
    };
  }
}

function findEqualGroups(prices: number[], tolerance: number): number[] {
  const sorted = [...prices].sort((a, b) => a - b);
  const out: number[] = [];
  let group: number[] = [];
  for (const p of sorted) {
    if (group.length === 0 || Math.abs(group[group.length - 1] - p) <= tolerance) group.push(p);
    else {
      if (group.length >= 2) out.push(group.reduce((a, b) => a + b, 0) / group.length);
      group = [p];
    }
  }
  if (group.length >= 2) out.push(group.reduce((a, b) => a + b, 0) / group.length);
  return out;
}