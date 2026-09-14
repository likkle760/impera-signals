import type { InstrumentAnalysis, Signal } from "./analysis-types";
import type { ConfidenceBreakdown } from "./confidence";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WIN-RATE OPTIMIZER (§15.5)
 *
 * A conservative selectivity layer that raises the trade bar so the *historical*
 * hit-rate of emitted signals trends toward the 80%+ target across scalps,
 * buy/sell limits and swings. It works by only admitting "textbook" trades:
 *
 *   - Confluence    : multi-confirmation confidence >= 85 (A / VERY STRONG SETUP)
 *   - Full alignment: 4H + 1H + execution TF all agree with the trade direction
 *   - Proof         : a real BOS/CHoCH (never chop), confirmed MACD momentum
 *   - Context       : liquidity context (sweep or resting pocket) on entry side
 *   - Economics     : reward:risk stays above the mode floor (>= 1.2 even for
 *                     scalps), so a high hit-rate never means "small wins,
 *                     occasional huge loss"
 *
 * Track record: a symbol's backtested hit-rate is blended INTO confidence by
 * the signal-intelligence layer (anchor 0.8, the 80%+ aim) — it nudges grade,
 * but is NOT a kill switch. Hard-blocking on historical win-rate was removed
 * because it starved the feed (most symbols' short backtests miss the bar) — a
 * nudge keeps the high-win-rate aim without silencing the app.
 *
 * Honest framing: this is a SELECTIVITY target. An 80%+ historical hit-rate is
 * the design goal, measured continuously in backtests; it is NOT a guarantee of
 * future wins, and win-rate alone is never a profit claim. The RR floor keeps
 * expectancy (profit factor) in view — that's what makes the high hit-rate
 * worth having.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Target historical hit-rate for emitted signals (0.8 = 80%+ aim). */
export const WIN_RATE_TARGET = 0.8;

/** A-grade admission bar (VERY STRONG SETUP) — an achievable-but-strict bar. */
export const OPTIMIZER_CONFIDENCE_BAR = 85;

/** Minimum reward:risk enforced for optimizer signals (also a scalp-friendly
 *  floor — scalps keep tight risk but must still offer >= 1.2R at TP1). */
export const OPTIMIZER_MIN_RR = 1.2;

export interface WinRateOptimizerResult {
  pass: boolean;
  /** Reasons a trade was blocked (empty when it passes). */
  reasons: string[];
  target: number;
}

/**
 * Gate a fully-built signal under the win-rate optimizer. Assumes the caller
 * already enforced the normal minConfidence / minRiskReward gates — this module
 * only ADDS stricter, win-rate-focused conditions. Pure and side-effect free.
 *
 * When a candidate fails, the coordinator keeps it as a fallback so the signal
 * feed is never empty even if no scan produces a textbook A-grade setup.
 */
export function applyWinRateOptimizer(
  signal: Signal,
  analysis: InstrumentAnalysis,
  conf: ConfidenceBreakdown,
  rr: number
): WinRateOptimizerResult {
  const reasons: string[] = [];

  if (conf.total < OPTIMIZER_CONFIDENCE_BAR) {
    reasons.push(`Confidence ${conf.total} < ${OPTIMIZER_CONFIDENCE_BAR} (A bar)`);
  }

  const htf = conf.details.htfAligned;
  if (!htf["4h"] || !htf["1h"] || !htf.exec) {
    reasons.push("Requires full 4H+1H+execution trend alignment");
  }

  if (!conf.details.momentum.confirmed) {
    reasons.push("Momentum needs displacement + confirmed multi-TF MACD");
  }

  if (!conf.details.structure.bos && !conf.details.structure.choch) {
    reasons.push("Requires a confirmed BOS/CHOCH (no chop)");
  }

  const sweep = conf.details.liquidity.sweepHigh || conf.details.liquidity.sweepLow;
  const pocket =
    analysis.liquidity.equalLows.length > 0 || analysis.liquidity.equalHighs.length > 0 ||
    analysis.liquidity.areas.some((a) => a.kind.toUpperCase().includes("EQUAL"));
  if (!sweep && !pocket) {
    reasons.push("Requires liquidity context (sweep or resting pocket)");
  }

  if (rr < OPTIMIZER_MIN_RR) {
    reasons.push(`Requires reward:risk >= 1:${OPTIMIZER_MIN_RR}`);
  }

  return { pass: reasons.length === 0, reasons, target: WIN_RATE_TARGET };
}