import type { Candle } from "../../types";
import type { SwingPoint, SwingZone } from "./types";

export interface ZoneResult {
  supports: SwingZone[];
  resistances: SwingZone[];
}

/**
 * Builds meaningful support/resistance ZONES (not hundreds of exact levels) from
 * confirmed swing points. A level is meaningful when it is touched more than
 * once (multi-touch) or is a major recent swing extreme. Levels are represented
 * as ranges of ± zoneBandAtr × ATR so entries line up with a zone, not a single
 * price. Only bars <= upto are used (no look-ahead).
 */
export class SwingSupportResistance {
  constructor(
    private minTouches: number,
    private zoneBandAtr: number,
    private lookback: number
  ) {}

  detect(candles: Candle[], upto: number, points: SwingPoint[], atr: number): ZoneResult {
    const start = Math.max(0, upto - this.lookback);
    const band = Math.max(atr * this.zoneBandAtr, 1e-12);
    const hits = new Map<number, { sum: number; count: number; last: number }>();

    // Cluster swing points into levels (round to ATR-bucket so several nearby
    // swing lows/highs merge into one meaningful level).
    for (const p of points) {
      if (p.index < start) continue;
      const bucket = Math.round(p.price / (Math.max(atr, 1e-12) * 1.0)) * Math.max(atr, 1e-12) * 1.0;
      const key = Math.abs(bucket - p.price) < atr ? bucket : p.price;
      const rounded = toKey(key, atr);
      const cur = hits.get(rounded);
      if (cur) {
        cur.sum += p.price;
        cur.count += 1;
        cur.last = Math.max(cur.last, p.index);
      } else {
        hits.set(rounded, { sum: p.price, count: 1, last: p.index });
      }
    }

    const price = candles[upto].close;
    const supports: SwingZone[] = [];
    const resistances: SwingZone[] = [];

    for (const [, v] of hits) {
      const level = v.sum / v.count;
      if (v.count < this.minTouches) continue; // not yet meaningful
      const strength = Math.min(10, v.count * 2 + (levelAway(level, price, atr) <= 2 ? 2 : 0));
      const zone: SwingZone = {
        lower: level - band,
        upper: level + band,
        kind: level < price ? "SUPPORT" : "RESISTANCE",
        strength,
        touches: v.count
      };
      if (level < price) supports.push(zone);
      else if (level > price) resistances.push(zone);
    }

    // Sort: strongest first, then closest to price.
    supports.sort((a, b) => b.strength - a.strength || a.lower - b.lower);
    resistances.sort((a, b) => b.strength - a.strength || a.upper - b.upper);

    return { supports: supports.slice(0, 6), resistances: resistances.slice(0, 6) };
  }
}

function toKey(p: number, atr: number): number {
  // snap each level into coarse ATR buckets so nearby swings merge
  const step = Math.max(atr * 1.0, 1e-12);
  return Math.round(p / step) * step;
}

function levelAway(price: number, level: number, atr: number): number {
  return Math.abs(level - price) / Math.max(atr, 1e-9);
}
