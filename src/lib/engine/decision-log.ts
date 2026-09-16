import type { Signal } from "./analysis-types";
import type { RiskDecision } from "./risk/portfolio-risk";

/**
 * STRUCTURED DECISION LOG (§ Observability)
 *
 * Logs every signal evaluation decision to the browser console so the system
 * is auditable end-to-end. Never logs secrets (tokens, keys, passwords).
 *
 * Enable by running:
 *   localStorage.setItem("impera.signal-log.v1", "1")
 * Disable:
 *   localStorage.removeItem("impera.signal-log.v1")
 */

function enabled(): boolean {
  if (typeof window === "undefined") return true; // server-side: log on
  try { return localStorage.getItem("impera.signal-log.v1") === "1"; }
  catch { return false; }
}

export interface DecisionLogInput {
  symbol: string;
  direction: string;
  type: string;
  confidence: number;
  riskReward: number;
  entry: number;
  stopLoss: number;
  tp1: number;
  simulated?: boolean;
  risk?: RiskDecision | null;
  riskLevel?: string;
  simulatedObserve?: boolean;
}

export function logSignalDecision(input: DecisionLogInput): void {
  if (!enabled()) return;

  const simTag = input.simulated ? " [SIM]" : "";
  const riskBlock = input.risk
    ? ` | risk ${input.risk.riskPercent}% ${input.risk.positionSize?.label ?? "—"} | daily-rem ${input.risk.maxDailyRiskRemainingPct.toFixed(1)}%`
    : "";
  const line = [
    `[SIGNAL] ${input.symbol}${simTag} ${input.direction} ${input.type}`,
    `confidence=${input.confidence}% RR=${input.riskReward.toFixed(2)} entry=${input.entry.toFixed(2)} SL=${input.stopLoss.toFixed(2)} TP1=${input.tp1.toFixed(2)}`,
    `decision=${input.risk?.decision ?? "—"}${riskBlock}`
  ].join("  ");

  console.log(line);

  if (input.risk?.problems && input.risk.problems.length > 0) {
    for (const p of input.risk.problems) console.log(`  → REJECTED: ${p}`);
  }
  if (input.risk?.notes && input.risk.notes.length > 0) {
    for (const n of input.risk.notes) console.log(`  → note: ${n}`);
  }
}

export function logSignalRejected(
  input: DecisionLogInput,
  reasons: string[]
): void {
  if (!enabled()) return;
  console.log(`[SIGNAL REJECTED] ${input.symbol} ${input.direction} ${input.type} — reasons: ${reasons.join("; ")}`);
}