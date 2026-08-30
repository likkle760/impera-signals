import type { Instrument, RiskLevel } from "../types";
import type { InstrumentAnalysis, Signal } from "./analysis-types";
import { clamp, safeRatio } from "../utils";

export interface RiskResult {
  riskLevel: RiskLevel;
  riskScore: number;
  factors: Record<string, number>;
  detail: string[];
}

export class RiskEngine {
  evaluate(
    instrument: Instrument,
    analysis: InstrumentAnalysis,
    signal: Pick<Signal, "entry" | "stopLoss" | "takeProfits" | "direction"> | null,
    spreadFactor = 0,
    sessionLiquidity = 0,
    nonTerminal = 0
  ): RiskResult {
    let score = 0;
    const factors: Record<string, number> = {};
    const detail: string[] = [];

    // Stop-loss distance vs ATR (weight 25)
    let slDistance = 0;
    if (signal) {
      slDistance = Math.abs(signal.entry - signal.stopLoss);
      const atrVal = analysis.atr;
      if (atrVal > 0) {
        const atrRatio = slDistance / atrVal;
        if (atrRatio < 0.5) { score += 2; factors["SL within ATR"] = 2; detail.push("Stop within half ATR"); }
        else if (atrRatio < 1) { score += 6; factors["SL within ATR"] = 6; }
        else if (atrRatio < 1.5) { score += 12; factors["SL within ATR"] = 12; }
        else if (atrRatio < 2) { score += 18; factors["SL within ATR"] = 18; }
        else { score += 24; factors["SL within ATR"] = 24; detail.push("Wide stop relative to volatility"); }
      }
    }

    // Volatility
    const volScore = analysis.trend.volatilityScore ?? 0;
    score += volScore * 0.1;
    factors["volatility"] = volScore;
    if (volScore > 70) detail.push("Elevated volatility");

    // Spread (weight 15)
    const spread = (analysis.spread / (analysis.price || 1)) * 10000;
    if (spread < 0.6) { score += 1; }
    else if (spread < 1.5) { score += 4; }
    else if (spread < 3) { score += 9; }
    else { score += 14; }
    factors["spread"] = spread;
    score += spreadFactor * 15;

    // Market structure / distance to opposing S/R gap (weight 10)
    const resistances = analysis.supportResistance.resistances.slice(0, 3);
    const supports = analysis.supportResistance.supports.slice(0, 3);
    const nearestRes = resistances.length ? Math.min(...resistances.map((r) => Math.abs(r.price - analysis.price))) : Infinity;
    const nearestSup = supports.length ? Math.min(...supports.map((s) => Math.abs(s.price - analysis.price))) : Infinity;
    const gapToOpposing = signal?.direction === "BUY" ? nearestRes : nearestSup;
    const atrTrade = analysis.atr || 1;
    if (gapToOpposing !== Infinity) {
      const gapRatio = gapToOpposing / Math.max(atrTrade, 1e-9);
      if (gapRatio > 3) { score += 2; }
      else if (gapRatio > 1.5) { score += 6; }
      else { score += 10; detail.push("Nearby opposing level"); }
      factors["gapToLevel"] = gapRatio;
    }

    // Risk/reward (weight 20)
    if (signal) {
      const rr = signal.takeProfits[0] !== undefined
        ? safeRatio(signal.takeProfits[0] - signal.entry, signal.entry - signal.stopLoss)
        : 0;
      if (rr >= 2) { score += 4; }
      else if (rr >= 1.5) { score += 8; }
      else { score += 18; detail.push("Low risk/reward"); }
      factors["rr"] = rr;
    }

    // Trend alignment (weight 10)
    if (signal?.direction === "BUY" && analysis.trend.directionalBias === "BUY") {
      score += 0;
    } else if (signal?.direction === "SELL" && analysis.trend.directionalBias === "SELL") {
      score += 0;
    } else {
      score += 10;
      detail.push("Counter-trend entry");
    }
    factors["trendAlignment"] = signal?.direction === "BUY" && analysis.trend.directionalBias === "BUY" ? 0 : 10;

    // Session liquidity (weight 10)
    score += sessionLiquidity * 10;

    return {
      riskLevel: levelFromScore(score),
      riskScore: Math.round(clamp(score, 0, 100)),
      factors,
      detail
    };
  }
}

export function levelFromScore(score: number): RiskLevel {
  if (score >= 75) return "VERY HIGH";
  if (score >= 55) return "HIGH";
  if (score >= 35) return "MEDIUM";
  if (score >= 20) return "LOW";
  return "VERY LOW";
}
