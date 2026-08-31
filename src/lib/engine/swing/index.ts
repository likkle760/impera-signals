import type { SwingValidationStatus } from "./types";

export { SwingSignalEngine } from "./signal";
export { SwingBacktestEngine } from "./backtest";
export { SwingStructure } from "./structure";
export { SwingSupportResistance } from "./support-resistance";
export {
  DEFAULT_SWING_CONFIG,
  configForAssetClass,
  type SwingConfig
} from "./config";
export type {
  SwingSignal,
  SwingTrendBias,
  SwingStructureBias,
  SwingRegime,
  SwingVerdict,
  SwingZone,
  SwingFactor,
  SwingValidationStatus,
  SwingBacktestReport,
  SwingBacktestMetrics,
  SwingBacktestTrade
} from "./types";

/**
 * Honest live-enablement gate. The swing strategy counts as VALIDATED only after
 * a real out-of-sample backtest across multiple markets, cost-adjusted, passes
 * robustness thresholds. Until then this flag is explicitly false and live
 * signals must be labelled NOT VALIDATED FOR LIVE USE.
 */
export const SWING_VALIDATION: SwingValidationStatus = {
  validated: false,
  status: "NOT VALIDATED FOR LIVE USE",
  criteria: [
    "Cost-adjusted profit factor >= 1.1 across a combined multi-symbol out-of-sample window",
    "Positive expectancy (R) after spread + slippage + commission",
    "Max drawdown (R) below an acceptable bound",
    "Performance stable across bull / bear / ranging / low-and-high-volatility regimes",
    "Parameter sensitivity: broad-range params do not flip to failure on minor perturbation"
  ],
  lastBacktest: {
    symbol: null,
    trades: 0,
    profitFactor: null,
    runAt: null
  }
};
