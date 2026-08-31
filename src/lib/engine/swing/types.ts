import type { Direction } from "../../types";

/** Directional trend classification on the higher timeframe (daily). */
export type SwingTrendBias = "BULLISH" | "BEARISH" | "NEUTRAL";

/** Structural classification on the confirmation timeframe (4H). */
export type SwingStructureBias = "BULLISH" | "BEARISH" | "NEUTRAL";

/** Market regime classifier — avoids using the same logic in every regime. */
export type SwingRegime =
  | "TRENDING"
  | "RANGING"
  | "HIGH_VOLATILITY"
  | "LOW_VOLATILITY";

/** Final signal verdict. NO TRADE is a valid and important output. */
export type SwingVerdict =
  | "STRONG BUY"
  | "BUY"
  | "NO TRADE"
  | "SELL"
  | "STRONG SELL";

/** A single confirmation-timeframe structure point (swing high/low). */
export interface SwingPoint {
  index: number;
  price: number;
  high: boolean;
}

/** Support/resistance zone expressed as a range, not an exact price. */
export interface SwingZone {
  lower: number;
  upper: number;
  kind: "SUPPORT" | "RESISTANCE";
  strength: number;
  touches: number;
}

/** Row-level reason for the signal score / verdict. */
export interface SwingFactor {
  label: string;
  score: number;
  detail: string;
}

/** Full scored swing signal. */
export interface SwingSignal {
  symbol: string;
  assetClass: string;
  timestamp: number;
  direction: Direction;
  verdict: SwingVerdict;
  /** suggested entry zone [lower, upper] */
  entryZone: [number, number];
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  /** cost-adjusted R multiple at TP1 */
  riskReward1: number;
  /** cost-adjusted R multiple at TP2 */
  riskReward2: number;
  /** 0-100 setup score */
  score: number;
  /** human category (A+/A/B) derived from score */
  grade: string;
  /** higher-timeframe trend read */
  trend: SwingTrendBias;
  /** confirmation-timeframe structure read */
  structure: SwingStructureBias;
  /** support/resistance validity */
  srValid: boolean;
  /** momentum confirmation validity */
  momentumValid: boolean;
  /** volatility filter validity */
  volatilityValid: boolean;
  /** market regime */
  regime: SwingRegime;
  /** expected holding period, e.g. "3-10 days" */
  holdingPeriod: string;
  /** human-readable reasons (what made it a valid/invalid setup) */
  reasons: string[];
  /** what would invalidate the trade */
  invalidation: string;
  /** whether an event/news filter blocked the trade */
  blockedByNews: boolean;
  /** reason for NO TRADE (present only when verdict === NO TRADE) */
  noTradeReason: string | null;
  /** per-factor scoring breakdown */
  factors: SwingFactor[];
}

/** Live-enablement gate. Honest status until validation criteria pass. */
export interface SwingValidationStatus {
  validated: boolean;
  status: string;
  criteria: string[];
  lastBacktest: {
    symbol: string | null;
    trades: number;
    profitFactor: number | null;
    runAt: number | null;
  };
}

export interface SwingBacktestTrade {
  index: number;
  timestamp: number;
  symbol: string;
  direction: Direction;
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  /** realized R multiple (cost-adjusted) */
  r: number;
  pnl: number;
  outcome: "WIN" | "LOSS" | "OPEN" | "TIME_STOP";
  barsHeld: number;
}

export interface SwingBacktestMetrics {
  totalTrades: number;
  wins: number;
  losses: number;
  open: number;
  timeStops: number;
  winRate: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number;
  expectancyR: number;
  avgWinR: number;
  avgLossR: number;
  maxDrawdownR: number;
  maxLosingStreak: number;
  longestWinStreak: number;
  avgBarsHeld: number;
  longTrades: number;
  shortTrades: number;
  longPnl: number;
  shortPnl: number;
}

export interface SwingBacktestReport {
  symbol: string;
  startTime: number;
  endTime: number;
  candlesTested: number;
  trades: SwingBacktestTrade[];
  metrics: SwingBacktestMetrics;
  /** explicit declaration of the cost model applied */
  costModel: { spreadTicks: number; slippageTicks: number; commissionPct: number };
  noLookahead: boolean;
  runAt: number;
}
