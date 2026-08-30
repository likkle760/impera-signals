import type { RiskLevel, Timeframe } from "../../types";

/**
 * StrategyConfig — every threshold and tunable for the trading model, kept
 * isolated from the core detection/execution logic. Tuning here should be the
 * ONLY place a number changes; the engine components read from this object.
 */
export interface StrategyConfig {
  /** Confidence scoring thresholds */
  scoring: {
    minSignalScore: number;
    minLimitScore: number;
    /** market-entries must reach this confluence before they are considered */
    marketConfluenceFloor: number;
    /** resting-limit entries must reach this confluence before they are emitted */
    limitConfluenceFloor: number;
  };

  /** Confluence weights (points per confirming factor) */
  confluenceWeights: {
    higherTimeframe: number;
    lowerTimeframeAgrees: number;
    breakOfStructure: number;
    momentum: number;
    pullbackStructure: number;
    restingAtLevel: number;
    fvgZone: number;
    liquidityOb: number;
    htfDirectional: number;
    fibonacciDiscount: number;
    displacement: number;
    ifvg: number;
  };

  /** Displacement (impulse candle) detection */
  displacement: {
    /** min candle range vs ATR to count as a displacement candle */
    minBodyAtr: number;
    /** min full range vs ATR */
    minRangeAtr: number;
    /** how many recent candles are screened for displacement */
    lookback: number;
    /** how many displacement candles must align with a break direction */
    minCountDirection: number;
  };

  /** Fair Value Gap detection */
  fvg: {
    /** minimum gap size relative to ATR to keep */
    minSizeAtr: number;
    /** maximum age (bars old) to still be tradeable */
    maxAge: number;
    /** how many of the most recent gaps to return */
    maxGaps: number;
  };

  /** Inverse FVG detection (higher-timeframe imbalance) */
  ifvg: {
    /** HTF used for inverse FVG */
    timeframe: Timeframe;
    minSizeAtr: number;
    maxAge: number;
  };

  /** Fibonacci / premium-discount */
  fib: {
    /** whether we trust price near the deep discount/premium zones */
    holdDeepestCea: boolean;
  };

  /** Session gating */
  session: {
    /** sessions where entries are allowed (empty = all) */
    allowed: string[];
    /** session liquidity penalty map */
    liquidity: Record<string, number>;
  };

  /** Limit-order placement (near-market pullback band) */
  limit: {
    /** how wide the near-market band is (as a fraction of price) */
    bandPct: number;
    /** ATR floor multiple for the band */
    bandAtrFloor: number;
    /** price% floor for the /band size */
    bandPriceFloor: number;
    /** minimum resting distance (fraction of price) */
    minDistPct: number;
    /** ATR multiple to cap the resting distance */
    maxDistAtr: number;
    /** price% cap for max resting distance */
    maxDistPct: number;
    /** proximity tolerance when testing whether a level is "near" the resting level */
    levelProximityPct: number;
  };

  /** Risk sizing */
  risk: {
    maxRiskLevel: RiskLevel;
    minRiskReward: number;
    /** SM/TP ladder multiples of the stop distance */
    tpLadder: [number, number, number];
    /** fraction of price used as an ATR fallback when ATR is 0 */
    atrFallbackPct: number;
    /** fraction of price floored for the minimum stop distance */
    stopMinPct: number;
    /** ATR multiple for the minimum stop distance */
    stopMinAtr: number;
    /** fraction of price capping the stop distance */
    stopMaxPct: number;
    /** ATR multiple capping the stop distance */
    stopMaxAtr: number;
  };

  /** Timeframes the model operates on */
  timeframes: {
    /** primary (trader) timeframe */
    primary: Timeframe;
    /** higher-timeframe used for bias/confluence */
    higher: Timeframe;
  };

  /** Backtesting */
  backtest: {
    candlesPerRun: number;
    defaultTimeframe: Timeframe;
  };
}

export const DEFAULT_STRATEGY_CONFIG: StrategyConfig = {
  scoring: {
    minSignalScore: 62,
    minLimitScore: 48,
    /** market-entries must reach this confluence before they are considered */
    marketConfluenceFloor: 6,
    /** resting-limit entries must reach this confluence before they are emitted */
    limitConfluenceFloor: 5
  },

  confluenceWeights: {
    higherTimeframe: 3,
    lowerTimeframeAgrees: 2,
    breakOfStructure: 3,
    momentum: 2,
    pullbackStructure: 3,
    restingAtLevel: 2,
    fvgZone: 3,
    liquidityOb: 3,
    htfDirectional: 3,
    fibonacciDiscount: 2,
    displacement: 3,
    ifvg: 3
  },

  displacement: {
    minBodyAtr: 1.0,
    minRangeAtr: 1.4,
    lookback: 12,
    minCountDirection: 2
  },

  fvg: {
    minSizeAtr: 0.3,
    maxAge: 99,
    maxGaps: 4
  },

  ifvg: {
    timeframe: "15m",
    minSizeAtr: 0.5,
    maxAge: 10
  },

  fib: {
    holdDeepestCea: true
  },

  session: {
    allowed: [],
    liquidity: {
      "LONDON/NEW YORK OVERLAP": 0,
      "LONDON": 0.15,
      "NEW YORK": 0.2,
      "ASIA": 0.5,
      "OFF HOURS": 0.7
    }
  },

  limit: {
    bandPct: 0.0025,
    bandAtrFloor: 1.0,
    bandPriceFloor: 0.0008,
    minDistPct: 0.0008,
    maxDistAtr: 3.0,
    maxDistPct: 0.012,
    levelProximityPct: 0.004
  },

  risk: {
    maxRiskLevel: "HIGH",
    minRiskReward: 1.1,
    tpLadder: [1.0, 1.6, 2.2],
    atrFallbackPct: 0.002,
    stopMinPct: 0.0006,
    stopMinAtr: 0.5,
    stopMaxPct: 0.004,
    stopMaxAtr: 1.2
  },

  timeframes: {
    primary: "5m",
    higher: "1h"
  },

  backtest: {
    candlesPerRun: 400,
    defaultTimeframe: "5m"
  }
};
