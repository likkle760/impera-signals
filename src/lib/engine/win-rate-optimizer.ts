import type { InstrumentAnalysis, Signal } from "./analysis-types";
import type { ConfidenceBreakdown } from "./confidence";
import type { WinRateInfo } from "./signal-intelligence";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WIN-RATE OPTIMIZER (§15.5)
 *
 * A conservative selectivity layer that raises the trade bar so the *historical*
 * hit-rate of emitted signals trends toward the ~90% target across scalps,
 * buy/sell limits and swings. It works by only admitting "textbook" trades:
 *
 *   - A+ bar        : multi-confirmation confidence >= 90 (PREMIUM SETUP)
 *   - Full alignment: 4H + 1H + execution TF all agree with the trade direction
 *   - Proof         : a real BOS/CHoCH (never chop), confirmed MACD momentum
 *   - Context       : liquidity context (sweep or resting pocket) on entry side
 *   - Economics     : reward:risk stays above the mode floor (>= 1.5 even for
 *                     scalps), so a high hit-rate never means "small wins,
 *                     occasional huge loss"
 *   - Track record  : a symbol whose backtested win-rate misses the target bar
 *                     (and has >= 20 closed trades sampled) is skipped
 *
 * Honest framing: this is a SELECTIVITY target. A ~90% historical hit-rate on
 * A+ signals is the design goal and is measured continuously in backtests; it
 * is NOT a guarantee of future wins, and win-rate alone is never a profit
 * claim. The RR floor keeps expectancy (profit factor) in view — that's what
 * makes the 90% hit-rate worth having.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Target historical hit-rate for emitted signals (0.9 = 90%). */
export const WIN_RATE_TARGET = 0.9;

/** Minimum closed-trade sample before a symbol's track record is enforced. */
export const MIN_WIN_RATE_SAMPLE = 20;

/** A+ admission bar (PREMIUM SETUP). */
export const OPTIMIZER_CONFIDENCE_BAR = 90;

/** Minimum reward:risk enforced for optimizer signals (also a scalp-friendly
 *  floor — scalps keep tight risk but must still offer >= 1.5R at TP1). */
export const OPTIMIZER_MIN_RR = 1.5;

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
 */
export function applyWinRateOptimizer(
  signal: Signal,
  analysis: InstrumentAnalysis,
  conf: ConfidenceBreakdown,
  rr: number,
  winRate: WinRateInfo | null
): WinRateOptimizerResult {
  const reasons: string[] = [];

  if (conf.total < OPTIMIZER_CONFIDENCE_BAR) {
    reasons.push(`Confidence ${conf.total} < ${OPTIMIZER_CONFIDENCE_BAR} (A+ bar)`);
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

  if (winRate && winRate.trades >= MIN_WIN_RATE_SAMPLE && winRate.winRate < WIN_RATE_TARGET) {
    reasons.push(
      `${winRate.symbol} historical hit-rate ${(winRate.winRate * 100).toFixed(0)}% < ${WIN_RATE_TARGET * 100}% target (${winRate.trades} bt)`
    );
  }

  return { pass: reasons.length === 0, reasons, target: WIN_RATE_TARGET };
}