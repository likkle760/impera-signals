import type { CandleSeries, Instrument } from "../types";
import { pivotPoints } from "./indicators";
import type { Level, SupportResistance } from "./analysis-types";

interface Cluster {
  price: number;
  count: number;
  kind: string;
}

export class SupportResistanceEngine {
  analyze(
    symbol: string,
    instrument: Instrument,
    series: CandleSeries[]
  ): SupportResistance {
    // Use 1h/4h/1d for weekly/daily levels and 15m/30m for intraday levels
    const daily = series.find((s) => s.timeframe === "1d");
    const fourH = series.find((s) => s.timeframe === "4h");
    const oneH = series.find((s) => s.timeframe === "1h");
    const thirty = series.find((s) => s.timeframe === "30m");
    const fifteen = series.find((s) => s.timeframe === "15m");

    const swingSrc = fourH?.candles.length
      ? fourH
      : oneH?.candles.length
      ? oneH
      : fifteen;

    const levels: Level[] = [];
    if (swingSrc) {
      const { swingHighs, swingLows } = pivotPoints(swingSrc.candles, 2);
      const highClusters = clusterAndMerge(swingHighs, instrument, "clusters");
      const lowClusters = clusterAndMerge(swingLows, instrument, "clusters");
      for (const c of lowClusters) levels.push({ price: c.price, kind: "Support", strength: c.count });
      for (const c of highClusters) levels.push({ price: c.price, kind: "Resistance", strength: c.count });
    }

    const supports = levels.filter((l) => l.kind === "Support").sort((a, b) => b.price - a.price);
    const resistances = levels.filter((l) => l.kind === "Resistance").sort((a, b) => a.price - b.price);

    const sessionHighLow = thirty?.candles.length
      ? hiLo(thirty.candles)
      : fifteen?.candles.length
      ? hiLo(fifteen.candles)
      : null;

    const dayHighLow = daily?.candles.length
      ? hiLo(daily.candles.slice(-2))
      : null;

    const weeklyHighLow = daily?.candles.length
      ? hiLo(daily.candles.slice(-7))
      : null;

    const dailyOpen = daily?.candles.length ? daily.candles[daily.candles.length - 1].open : null;
    const weeklyOpen = daily?.candles.length && daily.candles.length >= 5
      ? daily.candles[daily.candles.length - 5].open
      : null;

    const ranges: { lower: number; upper: number; strength: number }[] = [];
    return {
      supports,
      resistances,
      ranges,
      sessionHighLow,
      dayHighLow,
      weeklyHighLow,
      dailyOpen,
      weeklyOpen
    };
  }
}

function hiLo(candles: CandleSeries["candles"]) {
  let high = -Infinity;
  let low = Infinity;
  for (const c of candles) {
    high = Math.max(high, c.high);
    low = Math.min(low, c.low);
  }
  return { high, low };
}

function clusterAndMerge(
  prices: number[],
  instrument: Instrument,
  _kind: string
): Cluster[] {
  const sorted = [...prices].sort((a, b) => a - b);
  const clusters: Cluster[] = [];
  const threshold = Math.max(instrument.pipSize * 3, 0.0001);
  for (const p of sorted) {
    let placed = false;
    for (const c of clusters) {
      if (Math.abs(c.price - p) <= threshold) {
        c.price = (c.price * c.count + p) / (c.count + 1);
        c.count += 1;
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push({ price: p, count: 1, kind: "S/R" });
  }
  return clusters.filter((c) => c.count >= 2);
}
