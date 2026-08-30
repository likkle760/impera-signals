import type { Candle } from "../../types";
import { atr } from "../indicators";
import type { StrategyConfig } from "./strategy-config";
import type { DisplacementAnalysis, DisplacementCandle } from "./types";

function validLast(arr: number[]): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (isFinite(arr[i])) return arr[i];
  }
  return NaN;
}

/**
 * DisplacementDetector — locates strong impulse candles whose body/range exceed
 * a multiple of ATR. Displacement marks where price "moved with conviction";
 * a series of aligned displacements in the same direction strengthens that
 * direction's bias. This is a pure function of past candles (no lookahead).
 */
export class DisplacementDetector {
  constructor(private config: StrategyConfig) {}

  analyze(candles: Candle[]): DisplacementAnalysis {
    const out: DisplacementAnalysis = {
      bullish: [],
      bearish: [],
      bias: "NEUTRAL",
      latest: null
    };
    if (!candles || candles.length < 25) return out;

    const cfg = this.config.displacement;
    const atrArr = atr(candles, 14);
    const avgAtr = validLast(atrArr) || candles[candles.length - 1].close * this.config.risk.atrFallbackPct;
    if (!isFinite(avgAtr) || avgAtr <= 0) return out;

    const start = Math.max(1, candles.length - 1 - cfg.lookback);
    const list: DisplacementCandle[] = [];

    for (let i = candles.length - 1; i >= start; i--) {
      const c = candles[i];
      const range = c.high - c.low;
      const body = Math.abs(c.close - c.open);
      const rangeAtr = range / avgAtr;
      const bodyAtr = body / avgAtr;
      if (rangeAtr >= cfg.minRangeAtr && bodyAtr >= cfg.minBodyAtr) {
        const dir: "BUY" | "SELL" = c.close >= c.open ? "BUY" : "SELL";
        const d: DisplacementCandle = {
          age: candles.length - 1 - i,
          direction: dir,
          rangeAtr,
          bodyAtr,
          time: c.time,
          close: c.close
        };
        list.push(d);
        if (dir === "BUY") out.bullish.push(d);
        else out.bearish.push(d);
      }
    }

    out.latest = list[0] ?? null;
    out.bullish.sort((a, b) => a.age - b.age);
    out.bearish.sort((a, b) => a.age - b.age);

    // Bias: whichever side has >= minCountDirection recent aligned displacements
    // (and more than the opposing side) drives the lean.
    const last = list.slice(0, cfg.lookback);
    const up = last.filter((d) => d.direction === "BUY").length;
    const dn = last.filter((d) => d.direction === "SELL").length;
    if (up >= cfg.minCountDirection && up > dn) out.bias = "BUY";
    else if (dn >= cfg.minCountDirection && dn > up) out.bias = "SELL";
    else out.bias = "NEUTRAL";

    return out;
  }
}
