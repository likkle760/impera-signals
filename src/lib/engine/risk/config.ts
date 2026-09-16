import { DEFAULT_SETTINGS, loadSettings } from "../../settings";

/**
 * Account / risk-limit configuration for the portfolio risk engine.
 *
 * Everything is configurable through environment variables (NEXT_PUBLIC_* on
 * Render) and falls back to the user's settings. Defaults are conservative and
 * appropriate for a funded-account evaluation (risk is capped per trade, per
 * day, per correlation group and per drawdown).
 *
 * NOT a guarantee of profits or passing an eval — these are discipline limits.
 */

export interface RiskLimitsConfig {
  /** Account equity used for sizing. */
  accountEquity: number;
  /** Max % risked per trade (entry→stop monetary loss / equity). */
  maxRiskPerTradePct: number;
  /** Max % of equity committed as risk in a rolling 24h window. */
  maxDailyRiskPct: number;
  /** Max % realized daily loss before halting new trades. */
  maxDailyLossPct: number;
  /** Max simultaneously-open recommended positions. */
  maxOpenTrades: number;
  /** Max combined open risk (% of equity) across all positions. */
  maxTotalOpenRiskPct: number;
  /** Max risk % concentrated on one currency/macro exposure. */
  maxCorrelatedRiskPct: number;
  /** Max drawdown % from equity peak before halting new trades. */
  maxDrawdownPct: number;
  /** Minimum reward:risk for an approved trade. */
  minRiskReward: number;
  /** Minimum confidence for an approved trade. */
  minSignalConfidence: number;
  /** Consecutive losses that trigger a cooldown. */
  maxConsecutiveLosses: number;
  /** Cooldown (minutes) after a stop-out before re-entering the same symbol. */
  cooldownMinutes: number;
  /** Market data older than this (ms) is stale → no new trades. */
  staleMs: number;
  /** Max spread as a % of the stop-loss distance. */
  maxSpreadToStopPct: number;
  /** Abnormally high volatility score → no new trades. */
  maxVolatilityScore: number;
}

export const DEFAULT_RISK_LIMITS: RiskLimitsConfig = {
  accountEquity: 10_000,
  maxRiskPerTradePct: 0.5,
  maxDailyRiskPct: 2,
  maxDailyLossPct: 5,
  maxOpenTrades: 4,
  maxTotalOpenRiskPct: 2,
  maxCorrelatedRiskPct: 1.5,
  maxDrawdownPct: 10,
  minRiskReward: 1.1,
  minSignalConfidence: 70,
  maxConsecutiveLosses: 3,
  cooldownMinutes: 60,
  staleMs: 45_000,
  maxSpreadToStopPct: 0.25,
  maxVolatilityScore: 70
};

function num(v: string | undefined, fb: number): number {
  if (v == null || v.trim() === "") return fb;
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? n : fb;
}

/**
 * Resolve the active limits: env override → user settings → defaults.
 * Reads NEXT_PUBLIC_<NAME> (client-bundled) and falls back to the plain name
 * (useful in server/CLI contexts). Settings fields reused: propAccountSize,
 * propRiskPct, propDailyLossPct, propMaxLossPct, minRiskReward, minConfidence.
 */
export function resolveRiskLimits(): RiskLimitsConfig {
  const settings = typeof window === "undefined" ? DEFAULT_SETTINGS : loadSettings();
  const env = (k: string) => process.env["NEXT_PUBLIC_" + k] ?? process.env[k];
  return {
    accountEquity: num(env("ACCOUNT_EQUITY"), settings.propAccountSize),
    maxRiskPerTradePct: num(env("MAX_RISK_PER_TRADE"), settings.propRiskPct),
    maxDailyRiskPct: num(env("MAX_DAILY_RISK"), 2),
    maxDailyLossPct: num(env("MAX_DAILY_LOSS"), settings.propDailyLossPct),
    maxOpenTrades: num(env("MAX_OPEN_TRADES"), 4),
    maxTotalOpenRiskPct: num(env("MAX_TOTAL_OPEN_RISK"), 2),
    maxCorrelatedRiskPct: num(env("MAX_CORRELATED_RISK"), 1.5),
    maxDrawdownPct: num(env("MAX_DRAWDOWN"), settings.propMaxLossPct),
    minRiskReward: num(env("MIN_RISK_REWARD"), settings.minRiskReward),
    minSignalConfidence: num(env("MIN_SIGNAL_CONFIDENCE"), settings.minConfidence),
    maxConsecutiveLosses: num(env("MAX_CONSECUTIVE_LOSSES"), 3),
    cooldownMinutes: num(env("COOLDOWN_MINUTES"), 60),
    staleMs: num(env("STALE_DATA_MS"), 45_000),
    maxSpreadToStopPct: num(env("MAX_SPREAD_TO_STOP"), 0.25),
    maxVolatilityScore: num(env("MAX_VOLATILITY_SCORE"), 70)
  };
}