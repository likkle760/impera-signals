import type { CandleSeries } from "../types";
import { pivotPoints } from "./indicators";
import type { LiquidityAnalysis, Level } from "./analysis-types";

export class LiquidityEngine {
  analyze(series: CandleSeries[]): LiquidityAnalysis {
    const src = series.find((s) => s.timeframe === "30m")
      ?? series.find((s) => s.timeframe === "15m")
      ?? series.find((s) => s.timeframe === "1h")
      ?? series[0];
    if (!src || src.candles.length < 20) {
      return { areas: [], equalHighs: [], equalLows: [], sweeps: [] };
    }
    const candles = src.candles;

    // Equal highs/lows: cluster swing points into tight groups
    const { swingHighs, swingLows } = pivotPoints(candles, 2);
    const equalHighs = clusterPrices(swingHighs, 0.0004);
    const equalLows = clusterPrices(swingLows, 0.0004);

    // Liquidity sweeps: a move beyond a recent swing then close back inside
    const current = candles[candles.length - 1];
    const sweeps: LiquidityAnalysis["sweeps"] = [];
    const recentHigh = swingHighs[swingHighs.length - 1] ?? null;
    const recentLow = swingLows[swingLows.length - 1] ?? null;
    const lookback = candles.slice(-10);
    for (let i = lookback.length - 1; i >= 1; i--) {
      const c = lookback[i];
      if (recentHigh !== null && c.high > recentHigh && c.close < recentHigh) {
        sweeps.push({ price: c.high, type: "HIGH", time: c.time });
      }
      if (recentLow !== null && c.low < recentLow && c.close > recentLow) {
        sweeps.push({ price: c.low, type: "LOW", time: c.time });
      }
    }

    const areas: Level[] = [
      ...equalHighs.map((p) => ({ price: p, kind: "Potential Liquidity (Equal Highs)", strength: 2 })),
      ...equalLows.map((p) => ({ price: p, kind: "Potential Liquidity (Equal Lows)", strength: 2 })),
      ...sweeps.map((s) => ({
        price: s.price,
        kind: s.type === "HIGH" ? "Potential Liquidity (Swept High)" : "Potential Liquidity (Swept Low)",
        strength: 3
      }))
    ];

    return { areas, equalHighs, equalLows, sweeps };
  }
}

function clusterPrices(prices: number[], tolerance: number): number[] {
  const sorted = [...prices].sort((a, b) => a - b);
  const out: number[] = [];
  let group: number[] = [];
  for (const p of sorted) {
    if (group.length === 0 || Math.abs(group[group.length - 1] - p) <= tolerance) {
      group.push(p);
    } else {
      if (group.length >= 2) out.push(meanArr(group));
      group = [p];
    }
  }
  if (group.length >= 2) out.push(meanArr(group));
  return out;
}

function meanArr(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
