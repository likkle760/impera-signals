import type { ScalpValidationStatus } from "./types";

export { ScalpSignalEngine } from "./signal";
export { ScalpGuard } from "./guard";
export { ScalpBacktestEngine } from "./backtest";
export type { CostScenario } from "./backtest";
export {
  DEFAULT_SCALP_CONFIG,
  scalpConfigForAssetClass,
  type ScalpConfig
} from "./config";
export type {
  ScalpVerdict,
  ScalpSignal,
  ScalpContext,
  ScalpBacktestTrade,
  ScalpBacktestMetrics,
  ScalpBacktestReport,
  ScalpValidationStatus
} from "./types";
export type { ScalpAnalysisInput } from "./signal";

/**
 * Honest live-enablement gate for scalping. A scalping strategy is even more
 * sensitive to execution assumptions (spread, slippage, latency) than a swing,
 * so validation requires 1-minute backtests across multiple markets, cost
 * stress scenarios, and explicit transmission delays. Until then the flag is
 * false and live signals must be labelled SCALPING STRATEGY NOT VALIDATED.
 */
export const SCALPING_VALIDATION: ScalpValidationStatus = {
  validated: false,
  status: "SCALPING STRATEGY NOT VALIDATED FOR LIVE USE",
  criteria: [
    "Backtested exclusively on 1-minute bars with spread + slippage + commission modelled per fill",
    "Profit factor >= 1.25 (realistic) and >= 1.1 under the 1.5x-spread / 2x-slippage stress scenario",
    "Positive expectancy (R) after costs in both realistic and stress cost scenarios",
    "Max drawdown (R) within bound and no single-session blow-up",
    "No look-ahead: fills never use the bar being decided, identical in live and backtest",
    "Stable across sessions (London, NY overlap, NY) and regimes"
  ],
  lastBacktest: {
    symbol: null,
    trades: 0,
    profitFactor: null,
    runAt: null
  }
};