import type { CandleSeries, MarketRegime, Timeframe } from "../types";
import type { IndicatorSnapshot, MarketStructureAnalysis, TrendAnalysis } from "./analysis-types";

function regimeForScore(score: number): MarketRegime {
  if (score >= 75) return "STRONG BULLISH";
  if (score >= 55) return "BULLISH";
  if (score >= 45) return "SLIGHTLY BULLISH";
  if (score > -45) return "NEUTRAL";
  if (score > -55) return "SLIGHTLY BEARISH";
  if (score > -75) return "BEARISH";
  return "STRONG BEARISH";
}

export class TrendEngine {
  private periods: Record<Timeframe, number>;

  constructor(periods: Partial<Record<Timeframe, number>> = {}) {
    this.periods = {
      "1m": 60,
      "3m": 80,
      "5m": 100,
      "15m": 120,
      "30m": 150,
      "1h": 150,
      "4h": 90,
      "1d": 30,
      ...periods
    };
  }

  analyzeTrend(
    series: CandleSeries[],
    indicators: Record<Timeframe, IndicatorSnapshot>,
    structure: MarketStructureAnalysis
  ): TrendAnalysis {
    const scoreMap: Partial<Record<Timeframe, number>> = {};
    for (const s of series) {
      scoreMap[s.timeframe] = this.scoreTimeframe(s, indicators[s.timeframe]);
    }

    const htf = scoreMap["4h"] ?? scoreMap["1h"] ?? 0;
    const medium = scoreMap["15m"] ?? scoreMap["30m"] ?? 0;
    const short = scoreMap["5m"] ?? scoreMap["3m"] ?? 0;

    const strength = Math.round(mapRange(htf, -100, 100, 0, 100));
    const momentumVal = Math.round(
      (Math.abs(medium) * 0.5 + Math.abs(short) * 0.5)
    );

    const structureStr = structure.structureType;
    let directionalBias: TrendAnalysis["directionalBias"] = "NEUTRAL";
    if (medium >= 30 && short >= 10) directionalBias = "BUY";
    else if (medium <= -30 && short <= -10) directionalBias = "SELL";

    const overallScore =
      htf * 0.4 + medium * 0.35 + short * 0.25;

    const regime = regimeForScore(overallScore);

    return {
      regime,
      strength: Math.min(100, strength),
      momentum: clamp(momentumVal, 0, 100),
      structure: structureStr,
      volatilityScore: 0,
      directionalBias,
      shortTerm: regimeForScore(short),
      mediumTerm: regimeForScore(medium),
      higherTimeframe: regimeForScore(htf)
    };
  }

  private scoreTimeframe(
    series: CandleSeries,
    ind: IndicatorSnapshot
  ): number {
    let score = 0;
    const candles = series.candles;
    if (candles.length < 50) return 0;

    const closes = candles.map((c) => c.close);
    const last = closes.length - 1;
    const price = closes[last];

    // EMA alignment (weight 30)
    const ema9 = ind.ema["9"];
    const ema20 = ind.ema["20"];
    const ema50 = ind.ema["50"];
    const ema100 = ind.ema["100"];
    const ema200 = ind.ema["200"];
    if (isFinite(ema9) && isFinite(ema20) && isFinite(ema50)) {
      const bull = price > ema9 && ema9 > ema20 && ema20 > ema50;
      const bear = price < ema9 && ema9 < ema20 && ema20 < ema50;
      if (bull) score += 30;
      else if (bear) score -= 30;
      else if (price > ema50) score += 10;
      else score -= 10;
    }

    // Price vs EMA200 (weight 10)
    if (isFinite(ema200)) {
      score += price > ema200 ? 10 : -10;
    }

    // RSI (weight 15)
    const r = ind.rsi;
    if (isFinite(r)) {
      if (r >= 50 && r < 70) score += 12;
      else if (r >= 70) score += 5;
      else if (r <= 50 && r > 30) score -= 12;
      else if (r <= 30) score -= 5;
    }

    // MACD (weight 15)
    const m = ind.macd;
    if (m) {
      if (m.macd > m.signal && m.histogram > 0) score += 15;
      else if (m.macd < m.signal && m.histogram < 0) score -= 15;
    }

    // ADX trend strength contribution (direction if +DI > -DI)
    if (isFinite(ind.adx) && ind.adx > 20) {
      if (ind.plusDI > ind.minusDI) score += 12;
      else score -= 12;
    }

    // MACD histogram momentum
    if (m && m.histogram > 0) score += 8;
    if (m && m.histogram < 0) score -= 8;

    // momentum via rate of change
    const roc = ((price - closes[Math.max(0, last - 10)]) / closes[Math.max(0, last - 10)]) * 1000;
    score += clamp(roc * 25, -20, 20);

    return clamp(score, -100, 100);
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function mapRange(v: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  return ((v - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
}
