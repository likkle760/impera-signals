import type { SwingConfig, DEFAULT_SWING_CONFIG } from "../swing/config";
import type { ScalpConfig, DEFAULT_SCALP_CONFIG } from "../scalp/config";

/**
 * XAUUSD-specific parameters (§13).
 *
 * Gold must NOT use identical parameters to EURUSD: it has a different ATR,
 * different spread in absolute terms, a tight true range in pips but large in
 * price, and it reacts to USD/rates/news differently. Everything here is
 * NORMALIZED (ATR multiples, R, % of price) rather than pip-based, so forex and
 * metals share the same strategy LOGIC but resolve to different executions.
 *
 * The returned overrides are shallow DEEP-PARTIALs applied on top of the engine
 * defaults via their existing per-asset-class merge (configForAssetClass /
 * scalpConfigForAssetClass), keyed by assetClass — but gold is a single symbol,
 * so we resolve by SYMBOL == "XAUUSD" in the pipeline.
 */

export interface XauOverrides {
  swing: DeepPartial<typeof DEFAULT_SWING_CONFIG>;
  scalp: DeepPartial<typeof DEFAULT_SCALP_CONFIG>;
}

type DeepPartial<T> =
  T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

export const XAUUSD_CONFIG: XauOverrides = {
  swing: {
    // Gold ATR% is small in % terms relative to its price, and it can run far;
    // wider cost-aware stops (ATR multiples) with an elevated R:R target.
    volatility: { atrPctFloor: 0.002, atrPctCeil: 0.06 },
    risk: {
      minRewardRisk: 2.2,
      stopBufferAtr: 2.0,
      stopMinAtr: 1.2,
      stopMaxAtr: 6,
      tp1R: 2.2,
      tp2R: 3.5,
      // gold swing positional sizing from account equity
      defaultRiskPct: 0.5
    },
    confidenceThresholds: { strongScore: 82, noTradeScore: 72 }
  },
  scalp: {
    // Gold can be fast around London/NY; keep ATR% window wide, spread-to-stop
    // filter loose (gold spread is a real fixed cost but price is large).
    regime: { atrPctFloor: 0.001, atrPctCeil: 0.02, adxMin: 16 },
    spread: { maxSpreadToStop: 0.25 },
    risk: { minRewardRisk: 1.3, stopMinAtr: 1.1, stopBufferAtr: 1.7, defaultRiskPct: 0.25 },
    momentum: { rsiFloor: 48 },
    holding: { maxBars: 25 },
    overtrading: { maxTradesPerSession: 10 }
  }
};

/** True if the symbol is the spot-gold instrument. */
export function isGoldSymbol(symbol: string): boolean {
  const upper = symbol.toUpperCase();
  return upper === "XAUUSD" || upper === "GC" || upper === "XAU";
}

/**
 * Apply gold-specific overrides to a swing config (if the symbol is XAUUSD).
 * Falls through to the engine's own asset-class merge otherwise.
 */
export function swingConfigForSymbol(
  config: typeof DEFAULT_SWING_CONFIG,
  symbol: string,
  assetClass: string
): SwingConfig {
  if (isGoldSymbol(symbol)) {
    return { ...config, ...(XAUUSD_CONFIG.swing as object), assetClass: config.assetClass } as SwingConfig;
  }
  return config;
}

/** Apply gold-specific overrides to a scalp config (if the symbol is XAUUSD). */
export function scalpConfigForSymbol(
  config: typeof DEFAULT_SCALP_CONFIG,
  symbol: string,
  assetClass: string
): ScalpConfig {
  if (isGoldSymbol(symbol)) {
    return { ...config, ...(XAUUSD_CONFIG.scalp as object), assetClass: config.assetClass } as ScalpConfig;
  }
  return config;
}