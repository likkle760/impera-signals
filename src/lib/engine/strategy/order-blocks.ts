import type { Candle, Direction } from "../../types";
import { atr } from "../indicators";
import type { StrategyConfig } from "./strategy-config";

/** An order block (demand/supply) or its failed cousin, a breaker block. */
export interface OrderBlock {
  /** index offset from the most recent close, 0 = latest */
  age: number;
  /** "bullish" = demand zone (buy), "bearish" = supply zone (sell) */
  type: "bullish" | "bearish";
  /** zone boundaries (upper = resistance of zone, lower = support of zone) */
  high: number;
  low: number;
  /** price is currently inside / interacting with the zone */
  active: boolean;
  /** whether this block has been invalidated (broke the opposite way and flipped) */
  breaker: boolean;
  /** width of the zone in ATR (volume/intensity proxy) */
  sizeAtr: number;
  /** how far the block leg displaced (R multiple of the risk) */
  displacementR: number;
}

export interface OrderBlockAnalysis {
  /** demand zones (bullish OBs), most recent first */
  bullish: OrderBlock[];
  /** supply zones (bearish OBs), most recent first */
  bearish: OrderBlock[];
  /** all detected blocks for display/confluence */
  all: OrderBlock[];
}

function validLast(arr: number[]): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (isFinite(arr[i])) return arr[i];
  }
  return NaN;
}

/**
 * OrderBlockDetector — locates ICT/SMC order blocks (the last opposing candle
 * before a displacement leg away) and their failed flip, breaker blocks.
 * A pure function of past candles (no lookahead). Zones are used both as
 * premium/discount confluence and to avoid buying into supply / selling into
 * demand.
 */
export class OrderBlockDetector {
  constructor(private config: StrategyConfig) {}

  analyze(candles: Candle[]): OrderBlockAnalysis {
    const out: OrderBlockAnalysis = { bullish: [], bearish: [], all: [] };
    if (!candles || candles.length < 30) return out;

    const avgAtr = validLast(atr(candles, 14)) || candles[candles.length - 1].close * this.config.risk.atrFallbackPct;
    if (!isFinite(avgAtr) || avgAtr <= 0) return out;

    const lookback = Math.min(candles.length - 1, this.config.fvg.maxAge || 30);
    const found: OrderBlock[] = [];

    for (let i = candles.length - 3; i >= (lookback > 0 ? lookback : 1); i--) {
      const ob = candles[i];
      const p1 = candles[i - 1];
      const n1 = candles[i + 1];
      const n2 = candles[i + 2];
      if (!p1 || !n1 || !n2) continue;

      const obBearish = ob.close < ob.open;
      const obBullish = ob.close > ob.open;
      const body = Math.abs(ob.close - ob.open);
      const range = ob.high - ob.low;
      const sizeAtr = (range || body) / avgAtr;

      // Impulse leg of the NEXT candles away from the block (displacement).
      const upMove = (n2.close - ob.close) / avgAtr;
      const dnMove = (ob.close - n2.close) / avgAtr;

      // Bullish OB: prior down candle (supply absorbed) followed by strong up leg.
      if (obBearish && upMove >= this.config.displacement.minRangeAtr) {
        found.push(obBuild(ob, "bullish", sizeAtr, upMove, candles.length - 1 - i));
      }
      // Bearish OB: prior up candle (demand absorbed) followed by strong down leg.
      if (obBullish && dnMove >= this.config.displacement.minRangeAtr) {
        found.push(obBuild(ob, "bearish", sizeAtr, dnMove, candles.length - 1 - i));
      }
    }

    // De-duplicate overlapping zones, keep the freshest.
    const unique = dedupe(found);
    const price = candles[candles.length - 1].close;

    for (const ob of unique) {
      const inside = price <= ob.high && price >= ob.low;
      ob.active = inside || price <= ob.high * 1.004 && price >= ob.low * 0.996;
      // Breaker: price closed through the block's far side (broke it down/up hard).
      ob.breaker =
        (ob.type === "bullish" && price < ob.low) ||
        (ob.type === "bearish" && price > ob.high);
      if (ob.type === "bullish") out.bullish.push(ob);
      else out.bearish.push(ob);
      out.all.push(ob);
    }

    out.all.sort((a, b) => a.age - b.age);
    out.bullish.sort((a, b) => a.age - b.age);
    out.bearish.sort((a, b) => a.age - b.age);
    return out;
  }
}

function obBuild(
  c: Candle,
  type: "bullish" | "bearish",
  sizeAtr: number,
  dispR: number,
  age: number
): OrderBlock {
  return { age, type, high: c.high, low: c.low, active: false, breaker: false, sizeAtr, displacementR: dispR };
}

/** Keep the freshest overlapping blocks and drop tiny/duplicate ones. */
function dedupe(blocks: OrderBlock[]): OrderBlock[] {
  const out: OrderBlock[] = [];
  for (const b of blocks) {
    const overlap = out.some((o) => o.type === b.type && zOverlap(o, b));
    if (!overlap) out.push(b);
  }
  return out;
}

function zOverlap(a: OrderBlock, b: OrderBlock): boolean {
  const lo = Math.min(a.high, b.high);
  const hi = Math.max(a.low, b.low);
  return lo > hi;
}

/** Direction of the freshest non-breaker block intersecting the price. */
export function orderBlockBias(ob: OrderBlockAnalysis, price: number): Direction | "NEUTRAL" {
  const active = ob.all.find((b) => !b.breaker && price <= b.high && price >= b.low);
  if (!active) return "NEUTRAL";
  return active.type === "bullish" ? "BUY" : "SELL";
}

export { atr };
