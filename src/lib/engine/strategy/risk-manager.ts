import type { Instrument } from "../../types";
import type { InstrumentAnalysis, Signal } from "../analysis-types";
import { RiskEngine, RiskResult } from "../risk";
import type { StrategyConfig } from "./strategy-config";

/** Result of a risk check combining the score with the allow/deny decision. */
export interface RiskDecision extends RiskResult {
  allowed: boolean;
  maxLevel: string;
}

/**
 * RiskManager — centralizes the per-trade risk policy. It wraps the low-level
 * RiskEngine scoring and applies the strategy's max-risk-level filter plus a
 * session-liquidity penalty, so "is this trade acceptable to take?" is decided
 * in exactly one place.
 */
export class RiskManager {
  private engine = new RiskEngine();
  private order = ["VERY LOW", "LOW", "MEDIUM", "HIGH", "VERY HIGH"] as const;

  constructor(private config: StrategyConfig) {}

  /** Stub Signal-like for risk evaluation before a full signal is built. */
  asPreliminary(
    analysis: InstrumentAnalysis,
    direction: "BUY" | "SELL",
    entry: number,
    stopLoss: number,
    takeProfits: [number, number, number]
  ): Pick<Signal, "entry" | "stopLoss" | "takeProfits" | "direction"> {
    return { entry, stopLoss, takeProfits, direction };
  }

  evaluate(
    instrument: Instrument,
    analysis: InstrumentAnalysis,
    signal: Pick<Signal, "entry" | "stopLoss" | "takeProfits" | "direction"> | null,
    sessionLiquidity = 0
  ): RiskDecision {
    const res = this.engine.evaluate(instrument, analysis, signal, 0, sessionLiquidity);
    const allowed = this.allowed(res.riskLevel);
    return { ...res, allowed, maxLevel: this.config.risk.maxRiskLevel };
  }

  allowed(level: string): boolean {
    const max = this.config.risk.maxRiskLevel;
    return this.order.indexOf(level as any) <= this.order.indexOf(max as any);
  }

  /** Session liquidity penalty for a given session (from config). */
  sessionPenalty(session: string): number {
    return this.config.session.liquidity[session] ?? 0.5;
  }

  satisfiesMinRR(rr: number): boolean {
    return rr >= this.config.risk.minRiskReward;
  }
}
