import type { AssetClass } from "../../types";

/**
 * ScalpConfig — every tunable for the scalping model, isolated in one place.
 * Parameters are deliberately BROAD ranges (not over-fit magic numbers) and can
 * be tuned per asset class without rewriting the strategy logic.
 */
export interface ScalpConfig {
  scoring: {
    strongScore: number;
    minScore: number;
  };

  sessions: {
    /** empty = all sessions allowed */
    allowed: string[];
  };

  timeframes: {
    context: "15m";
    setup: "5m";
    entry: "1m";
  };

  regime: {
    /** 15m ATR% below this => too quiet */
    atrPctFloor: number;
    /** 15m ATR% above this => unstable execution */
    atrPctCeil: number;
    /** ADX floor on the context timeframe for a real trend */
    adxMin: number;
  };

  trend: {
    emaFast: number;
    emaSlow: number;
  };

  structure: {
    pivotLookback: number;
    swingLookback: number;
    minTouches: number;
    zoneBandAtr: number;
  };

  momentum: {
    /** RSI based on the 5m close; above threshold = bullish momentum */
    rsiFloor: number;
  };

  spread: {
    /** max spread-to-stop-distance ratio; above this => trade uneconomic */
    maxSpreadToStop: number;
  };

  risk: {
    minRewardRisk: number;
    tp1R: number;
    tp2R: number;
    /** stop = max(stopMinAtr, stopBufferAtr) × ATR(1m) */
    stopMinAtr: number;
    stopBufferAtr: number;
    /** default risk per trade (% of equity) for position-sizing math */
    defaultRiskPct: number;
  };

  holding: {
    /** maximum bars (1m) a scalp may stay open */
    maxBars: number;
  };

  news: {
    enabled: boolean;
    blackoutBeforeMs: number;
    blackoutAfterMs: number;
    eventTimes: number[];
  };

  overtrading: {
    /** max trades per session before cooldown */
    maxTradesPerSession: number;
    /** max consecutive losses before forced cooldown */
    maxConsecutiveLosses: number;
    /** daily loss limit in R before stop for the day */
    dailyLossLimitR: number;
    /** cooldown bars after a consecutive-loss breach */
    cooldownBars: number;
    /** max simultaneous positions */
    maxOpenPositions: number;
  };

  assetClass: Partial<Record<AssetClass, DeepPartial<ScalpConfig>>>;
}

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export const DEFAULT_SCALP_CONFIG: ScalpConfig = {
  scoring: { strongScore: 80, minScore: 70 },
  sessions: { allowed: [] },
  timeframes: { context: "15m", setup: "5m", entry: "1m" },
  regime: { atrPctFloor: 0.001, atrPctCeil: 0.015, adxMin: 18 },
  trend: { emaFast: 20, emaSlow: 50 },
  structure: { pivotLookback: 2, swingLookback: 120, minTouches: 2, zoneBandAtr: 0.5 },
  momentum: { rsiFloor: 50 },
  spread: { maxSpreadToStop: 0.2 },
  risk: { minRewardRisk: 1.2, tp1R: 1.2, tp2R: 1.8, stopMinAtr: 1.0, stopBufferAtr: 1.5, defaultRiskPct: 0.25 },
  holding: { maxBars: 30 },
  news: { enabled: true, blackoutBeforeMs: 15 * 60 * 1000, blackoutAfterMs: 5 * 60 * 1000, eventTimes: [] },
  overtrading: {
    maxTradesPerSession: 12,
    maxConsecutiveLosses: 3,
    dailyLossLimitR: 4,
    cooldownBars: 20,
    maxOpenPositions: 1
  },
  assetClass: {
    crypto: {
      regime: { atrPctCeil: 0.03 },
      spread: { maxSpreadToStop: 0.15 }
    }
  }
};

/** Resolve a config for an asset class (deep-merge class overrides). */
export function scalpConfigForAssetClass(
  config: ScalpConfig,
  assetClass: string
): ScalpConfig {
  const override = config.assetClass[(assetClass as AssetClass) ?? "forex"];
  if (!override) return config;
  return deepMerge(config, override) as ScalpConfig;
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