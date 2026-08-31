import type { AssetClass } from "../../types";

/**
 * SwingConfig — every tunable for the swing model lives here so numbers change
 * in ONE place and the engine reads from this object. Parameters are deliberately
 * BROAD ranges (not exact magic numbers) to avoid overfitting, and can be tuned
 * per asset class without rewriting the strategy logic.
 */
export interface SwingConfig {
  /** confircrease rsi threshold band (bullish quote of RSI) */
  confidenceThresholds: {
    /** score >= strongScore => STRONG BUY/SELL */
    strongScore: number;
    /** score < noTradeScore => NO TRADE */
    noTradeScore: number;
  };

  trend: {
    /** periods for the higher-timeframe (daily) trend EMAs */
    emaFast: number;
    emaSlow: number;
    emaTrend: number;
    /** ADX at/above this => a real trend (not chop) on the HTF */
    adxMin: number;
  };

  structure: {
    /** how many bars left+right confirm a swing point (fractal) */
    pivotLookback: number;
    /** bars to look back for swing points when building zones */
    swingLookback: number;
    /** minimum touches for a support/resistance level to be "meaningful" */
    minTouches: number;
    /** a level is a zone of ± this many ATRs */
    zoneBandAtr: number;
  };

  momentum: {
    /** RSI above this on a pullback counts as bullish momentum */
    rsiRecovery: number;
  };

  volatility: {
    /** ATR% of price below this => too quiet (poor follow-through) */
    atrPctFloor: number;
    /** ATR% of price above this => stops impractical */
    atrPctCeil: number;
  };

  risk: {
    /** minimum reward:risk to accept (eventual TP1) */
    minRewardRisk: number;
    /** cost-adjusted stop buffer in ATR */
    stopBufferAtr: number;
    /** TP1 in stop distances; TP2 in stop distances */
    tp1R: number;
    tp2R: number;
    /** fraction of equity risked per trade (for position sizing math) */
    defaultRiskPct: number;
    /** max ATR multiple for the stop distance (volatility clamp) */
    stopMaxAtr: number;
    /** min ATR multiple for stop distance */
    stopMinAtr: number;
  };

  /** time-stop: hold for at most this many confirmation-timeframe bars (4H) */
  maxHoldingBars: number;

  news: {
    /** whether the news/event filter is active */
    enabled: boolean;
    /** blackout window (ms) before a major event — no NEW swing entries */
    blackoutBeforeMs: number;
    /** sample timestamps of "major events" (central banks, NFP, CPI...) */
    eventTimes: number[];
  };

  /** per-asset-class tuning overrides; falls back to defaults for asset classes */
  assetClass: Partial<Record<AssetClass, DeepPartial<SwingConfig>>>;
}

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export const DEFAULT_SWING_CONFIG: SwingConfig = {
  confidenceThresholds: {
    strongScore: 80,
    noTradeScore: 70
  },
  trend: {
    emaFast: 50,
    emaSlow: 200,
    emaTrend: 200,
    adxMin: 20
  },
  structure: {
    pivotLookback: 2,
    swingLookback: 60,
    minTouches: 2,
    zoneBandAtr: 0.5
  },
  momentum: {
    rsiRecovery: 50
  },
  volatility: {
    atrPctFloor: 0.004,
    atrPctCeil: 0.14
  },
  risk: {
    minRewardRisk: 2,
    stopBufferAtr: 1.5,
    tp1R: 2,
    tp2R: 3,
    defaultRiskPct: 0.5,
    stopMaxAtr: 6,
    stopMinAtr: 1.0
  },
  maxHoldingBars: 90,
  news: {
    enabled: true,
    blackoutBeforeMs: 4 * 60 * 60 * 1000,
    eventTimes: []
  },
  assetClass: {
    crypto: {
      volatility: { atrPctFloor: 0.01, atrPctCeil: 0.3 },
      risk: { stopBufferAtr: 2.0, stopMaxAtr: 8 }
    }
  }
};

/** Resolve a config for a given asset class (merge class overrides). */
export function configForAssetClass(
  config: SwingConfig,
  assetClass: string
): SwingConfig {
  const override = config.assetClass[(assetClass as AssetClass) ?? "forex"];
  if (!override) return config;
  return deepMerge(config, override) as SwingConfig;
}

function deepMerge<T extends Record<string, any>>(base: T, override: DeepPartial<T>): T {
  const out: Record<string, any> = { ...base };
  for (const key of Object.keys(override)) {
    const baseVal = (base as any)[key];
    const ovVal = (override as any)[key];
    if (
      baseVal && ovVal &&
      typeof baseVal === "object" && !Array.isArray(baseVal) &&
      typeof ovVal === "object" && !Array.isArray(ovVal)
    ) {
      out[key] = deepMerge(baseVal, ovVal);
    } else if (ovVal !== undefined) {
      out[key] = ovVal;
    }
  }
  return out as T;
}
