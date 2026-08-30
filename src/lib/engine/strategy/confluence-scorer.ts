import type { Direction, Instrument } from "../../types";
import type { InstrumentAnalysis, Signal } from "../analysis-types";
import { clamp } from "../../utils";
import type { StrategyConfig } from "./strategy-config";
import type { DraftSignal } from "./entry-engine";
import { orderBlockBias } from "./order-blocks";

export interface ConfluenceResult {
  score: number;
  reasons: string[];
  bullPoints: number;
  bearPoints: number;
}

/** Indicator-shape helper interface (subset used by helpers below). */
export interface IndicatorLike {
  ema?: Record<string, number>;
  rsi?: number;
  macd?: { macd: number; signal: number; histogram: number } | null;
  atr?: number;
  adx?: number;
  plusDI?: number;
  minusDI?: number;
  vwap?: number | null;
  bollinger?: { upper: number; middle: number; lower: number } | null;
  stochastic?: number | null;
}

function num(v: number | undefined): v is number {
  return typeof v === "number" && isFinite(v);
}

export function emaBull(ind: IndicatorLike | undefined, price: number): boolean {
  const e20 = ind?.ema?.["20"];
  const e50 = ind?.ema?.["50"];
  return num(e20) && num(e50) && price > e20 && e20 > e50;
}
export function emaBear(ind: IndicatorLike | undefined, price: number): boolean {
  const e20 = ind?.ema?.["20"];
  const e50 = ind?.ema?.["50"];
  return num(e20) && num(e50) && price < e20 && e20 < e50;
}
function maBull(ind: IndicatorLike | undefined, price: number): boolean {
  const e50 = ind?.ema?.["50"];
  return num(e50) && price > e50;
}
function maBear(ind: IndicatorLike | undefined, price: number): boolean {
  const e50 = ind?.ema?.["50"];
  return num(e50) && price < e50;
}
function macdPositive(ind: IndicatorLike | undefined): boolean {
  return !!ind?.macd?.histogram && ind.macd.histogram > 0;
}
function macdNegative(ind: IndicatorLike | undefined): boolean {
  return !!ind?.macd?.histogram && ind.macd.histogram < 0;
}

/**
 * ICT/SMC short-term (5m) direction gate. Reads the primary-timeframe snapshot
 * and returns BUY / SELL / NEUTRAL based on EMA, MACD, RSI and ADX alignment.
 * This prevents fading the current candle.
 */
export function shortTermBias(ind: IndicatorLike | undefined, price: number): "BUY" | "SELL" | "NEUTRAL" {
  const e20 = ind?.ema?.["20"];
  const e50 = ind?.ema?.["50"];
  let bull = 0;
  let bear = 0;
  if (num(e20) && num(e50)) {
    if (price > e20 && e20 > e50) bull += 2;
    if (price < e20 && e20 < e50) bear += 2;
  }
  if (num(ind?.macd?.histogram)) {
    if (ind!.macd!.histogram > 0) bull += 1;
    else if (ind!.macd!.histogram < 0) bear += 1;
  }
  if (num(ind?.rsi)) {
    if (ind!.rsi! > 55) bull += 1;
    else if (ind!.rsi! < 45) bear += 1;
  }
  if (num(ind?.plusDI) && num(ind?.minusDI)) {
    if (ind!.plusDI! > ind!.minusDI!) bull += 1;
    else if (ind!.minusDI! > ind!.plusDI!) bear += 1;
  }
  if (bear > bull && bear >= 2) return "SELL";
  if (bull > bear && bull >= 2) return "BUY";
  return "NEUTRAL";
}

/**
 * ConfluenceScorer — the single place that turns analysis into a
 * confluence-weighted direction + confidence and an absolute score.
 */
export class ConfluenceScorer {
  private W;
  private sc;

  constructor(private config: StrategyConfig) {
    this.W = config.confluenceWeights;
    this.sc = config.scoring;
  }

  /** Direction + confluence/reasons for a given analysis (market-style gate). */
  assess(analysis: InstrumentAnalysis): ConfluenceResult {
    const trend = analysis.trend;
    const ind5 = analysis.indicators["5m"] ?? analysis.indicators["15m"];
    const indM = analysis.indicators["15m"] ?? analysis.indicators["30m"];
    const indH = analysis.indicators["1h"] ?? analysis.indicators["4h"];
    const price = analysis.price;

    const htfBull = trend.higherTimeframe.includes("BULLISH");
    const htfBear = trend.higherTimeframe.includes("BEARISH");

    const bulk = emaBull(ind5, price);
    const bearish = emaBear(ind5, price);
    const momentumUp = ind5?.macd ? macdPositive(ind5) : maBull(indM, price);
    const momentumDown = ind5?.macd ? macdNegative(ind5) : maBear(indM, price);

    const reasons: string[] = [];
    let confluence = 0;

    if (htfBull) { confluence += this.W.higherTimeframe; reasons.push("Higher timeframe bullish"); }
    if (htfBear) { confluence += this.W.higherTimeframe; reasons.push("Higher timeframe bearish"); }
    if (bulk && htfBull) { confluence += this.W.lowerTimeframeAgrees; reasons.push("Lower timeframe agrees"); }
    if (bearish && htfBear) { confluence += this.W.lowerTimeframeAgrees; reasons.push("Lower timeframe agrees"); }
    if (analysis.structure.bos) { confluence += this.W.breakOfStructure; reasons.push("Break of structure"); }
    if (momentumUp) { confluence += this.W.momentum; reasons.push("Momentum positive"); }
    if (momentumDown) { confluence += this.W.momentum; reasons.push("Momentum negative"); }

    // Direction via weighted points
    let bullPoints = 0;
    let bearPoints = 0;
    if (htfBull) bullPoints += this.W.higherTimeframe;
    if (htfBear) bearPoints += this.W.higherTimeframe;
    if (bulk) bullPoints += this.W.lowerTimeframeAgrees;
    if (bearish) bearPoints += this.W.lowerTimeframeAgrees;
    if (isFinite(ind5?.adx ?? NaN) && (ind5?.plusDI ?? 0) > (ind5?.minusDI ?? 0)) bullPoints += 1;
    if (isFinite(ind5?.adx ?? NaN) && (ind5?.minusDI ?? 0) > (ind5?.plusDI ?? 0)) bearPoints += 1;
    if (momentumUp) bullPoints += 1;
    if (momentumDown) bearPoints += 1;
    if (analysis.structure.structureType === "HIGHER HIGHS") bullPoints += 1;
    if (analysis.structure.structureType === "LOWER LOWS") bearPoints += 1;

    // ICT/SMC order-block confluence: entry at a demand/supply zone or a broken block.
    if (analysis.orderBlocks) {
      const obBias = orderBlockBias(analysis.orderBlocks, price);
      if (obBias === "BUY") {
        confluence += this.W.liquidityOb;
        bullPoints += this.W.liquidityOb;
        reasons.push("At demand (order block)");
      } else if (obBias === "SELL") {
        confluence += this.W.liquidityOb;
        bearPoints += this.W.liquidityOb;
        reasons.push("At supply (order block)");
      }
      const recentDisp = analysis.displacement?.bias;
      if (recentDisp === "BUY" && obBias !== "SELL") { bullPoints += this.W.displacement; }
      if (recentDisp === "SELL" && obBias !== "BUY") { bearPoints += this.W.displacement; }
    }

    const nearTerm = shortTermBias(ind5, price);
    if (nearTerm === "SELL") bearPoints += 3;
    if (nearTerm === "BUY") bullPoints += 3;

    return { score: confluence, reasons, bullPoints, bearPoints };
  }

  /** 0-100 absolute confidence score for a specific draft. */
  score(
    instrument: Instrument,
    analysis: InstrumentAnalysis,
    draft: DraftSignal
  ): number {
    let s = 0;
    const trend = analysis.trend;
    const ind = analysis.indicators["5m"] ?? analysis.indicators["15m"];
    const indH = analysis.indicators["1h"] ?? analysis.indicators["4h"];

    s += Math.min(25, trend.strength * 0.25);
    s += Math.min(15, trend.momentum * 0.15);
    if (draft.direction === "BUY" && trend.directionalBias === "BUY") s += 10;
    if (draft.direction === "SELL" && trend.directionalBias === "SELL") s += 10;
    if (ind && emaBull(ind, analysis.price) && draft.direction === "BUY") s += 8;
    if (ind && emaBear(ind, analysis.price) && draft.direction === "SELL") s += 8;
    if (ind && num(ind.rsi) && draft.direction === "BUY" && ind.rsi > 50 && ind.rsi < 70) s += 5;
    if (ind && num(ind.rsi) && draft.direction === "SELL" && ind.rsi < 50 && ind.rsi > 30) s += 5;
    if (indH && indH.macd && draft.direction === "BUY" && indH.macd.histogram > 0) s += 5;
    if (indH && indH.macd && draft.direction === "SELL" && indH.macd.histogram < 0) s += 5;
    if (analysis.supportResistance.supports.length && draft.direction === "BUY") s += 4;
    if (analysis.supportResistance.resistances.length && draft.direction === "SELL") s += 4;

    s += Math.min(10, draft.confluence * 2);

    return Math.round(clamp(s, 0, 100));
  }

  /** minutes for a given direction at the current analysis. */
  private lilys(): void {}
}
