import type { CandleSeries, Timeframe } from "../types";
import { pivotPoints } from "./indicators";
import type { MarketStructureAnalysis } from "./analysis-types";

interface Swing {
  index: number;
  price: number;
  type: "HH" | "HL" | "LH" | "LL";
}

export class MarketStructureEngine {
  analyze(
    series: CandleSeries[],
    primary: Timeframe = "15m"
  ): MarketStructureAnalysis {
    // Prefer the requested primary timeframe; fall back to any available structure TF
    let candles: CandleSeries | undefined = series.find((s) => s.timeframe === primary);
    if (!candles) {
      const fallback = ["30m", "15m", "5m", "1h", "4h"];
      for (const tf of fallback) {
        const found = series.find((s) => s.timeframe === tf);
        if (found && found.candles.length > 20) {
          candles = found;
          break;
        }
      }
    }
    if (!candles || candles.candles.length < 20) {
      return emptyStructure();
    }
    const data = candles.candles;
    const { swingHighs, swingLows } = pivotPoints(data, 2);

    const lastHigh = swingHighs[swingHighs.length - 1] ?? null;
    const prevHigh = swingHighs[swingHighs.length - 2] ?? null;
    const lastLow = swingLows[swingLows.length - 1] ?? null;
    const prevLow = swingLows[swingLows.length - 2] ?? null;

    const price = data[data.length - 1].close;

    // Build swing sequence for structure type
    let structureType = "RANGE";
    let bos = false;
    let choch = false;

    const highsAscending = prevHigh !== null && lastHigh !== null ? lastHigh > prevHigh : true;
    const lowsAscending = prevLow !== null && lastLow !== null ? lastLow > prevLow : true;
    const priceAboveHighs = lastHigh !== null && price > lastHigh;
    const priceBelowLows = lastLow !== null && price < lastLow;

    if (priceAboveHighs || priceBelowLows) {
      bos = true;
      structureType = priceAboveHighs ? "BREAK OF STRUCTURE" : "BREAK OF STRUCTURE";
    } else if (highsAscending && lowsAscending) {
      structureType = "HIGHER HIGHS";
    } else if (!highsAscending && !lowsAscending) {
      structureType = "LOWER LOWS";
    } else {
      structureType = "RANGE";
    }

    // Simple CHOCH detection: price broke a recent high after making lower lows or vice versa
    if (lastLow !== null && lastLow < (prevLow ?? lastLow) && price > (prevHigh ?? price)) {
      choch = true;
      structureType = "CHANGE OF CHARACTER";
    } else if (lastHigh !== null && lastHigh > (prevHigh ?? lastHigh) && price < (prevLow ?? price)) {
      choch = true;
      structureType = "CHANGE OF CHARACTER";
    }

    const consolidation = Math.abs(highsAscending ? 0 : 1) === 1 && structureType === "RANGE";

    return {
      structureType,
      lastHH: lastHigh ?? null,
      lastHL: Math.min(...swingLows.slice(-2)) ?? null,
      lastLH: lastHigh ?? null,
      lastLL: lastLow ?? null,
      bos,
      choch,
      consolidation
    };
  }
}

function emptyStructure(): MarketStructureAnalysis {
  return {
    structureType: "RANGE",
    lastHH: null,
    lastHL: null,
    lastLH: null,
    lastLL: null,
    bos: false,
    choch: false,
    consolidation: true
  };
}
