import type { Direction } from "../../types";
import type { SwingRegime } from "../swing/types";

/** Final scalping verdict. NO TRADE is the default — selectivity is a feature. */
export type ScalpVerdict =
  | "STRONG BUY"
  | "BUY"
  | "NO TRADE"
  | "SELL"
  | "STRONG SELL";

export interface ScalpContext {
  /** 15m trend bias */
  trend: "BULLISH" | "BEARISH" | "NEUTRAL";
  /** 5m structure bias */
  structure: "BULLISH" | "BEARISH" | "NEUTRAL";
  /** 1m entry confirmation bias */
  entry: "BULLISH" | "BEARISH" | "NEUTRAL";
  regime: SwingRegime;
  atr1m: number;
  atr5m: number;
  spreadPct: number;
}

export interface ScalpSignal {
  symbol: string;
  assetClass: string;
  timestamp: number;
  direction: Direction;
  verdict: ScalpVerdict;
  /** context timeframes used */
  timeframes: ["15m", "5m", "1m"];
  entryZone: [number, number];
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  riskReward1: number;
  riskReward2: number;
  score: number;
  grade: string;
  trend: string;
  structure: string;
  regime: SwingRegime;
  session: string;
  /** expected holding window */
  holdingWindow: string;
  reasons: string[];
  invalidation: string;
  blockedByNews: boolean;
  noTradeReason: string | null;
  /** dedup: stable identity of the setup (symbol+timeframe+key level) */
  setupId: string | null;
  /** whether the spread filter blocked it (for diagnostics) */
  spreadBlocked: boolean;
  /** whether volatility blocked it (for diagnostics) */
  volBlocked: boolean;
  /** per-factor breakdown */
  factors: { label: string; score: number; detail: string }[];
}

export interface ScalpValidationStatus {
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

export interface ScalpBacktestTrade {
  index: number;
  timestamp: number;
  symbol: string;
  direction: Direction;
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  r: number;
  pnl: number;
  outcome: "WIN" | "LOSS" | "OPEN" | "TIME_STOP";
  barsHeld: number;
  session: string;
}

export interface ScalpBacktestMetrics {
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
  bySession: Record<string, { trades: number; wins: number; losses: number; pnl: number }>;
  byRegime: Record<string, { trades: number; wins: number; losses: number; pnl: number }>;
}

export interface ScalpBacktestReport {
  symbol: string;
  startTime: number;
  endTime: number;
  candlesTested: number;
  trades: ScalpBacktestTrade[];
  metrics: ScalpBacktestMetrics;
  costModel: { spreadPerSide: number; slippagePerSide: number; commissionPct: number; scenario: "optimistic" | "realistic" | "stress" };
  noLookahead: boolean;
  runAt: number;
}