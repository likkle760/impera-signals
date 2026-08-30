import type { Direction, RiskLevel, SignalStatus, Timeframe } from "../../types";

/** A displacement (impulse) candle — a strong directional body / range. */
export interface DisplacementCandle {
  /** index offset from the most recent close, 0 = latest */
  age: number;
  direction: Direction;
  rangeAtr: number;
  bodyAtr: number;
  time: number;
  close: number;
}

export interface DisplacementAnalysis {
  /** displacements classified as up (bullish impulse) */
  bullish: DisplacementCandle[];
  /** displacements classified as down (bearish impulse) */
  bearish: DisplacementCandle[];
  /** summary: which way recent displacement leans */
  bias: Direction | "NEUTRAL";
  /** latest displacement candle, if any */
  latest: DisplacementCandle | null;
}

/** An inverse Fair Value Gap — imbalance on a HIGHer timeframe that price
 *  is likely to rotate back into before continuing. */
export interface InverseFVG {
  upper: number;
  lower: number;
  type: "bullish" | "bearish";
  age: number;
  filled: boolean;
  sizeAtr: number;
  timeframe: Timeframe;
}

/** A single logged signal/order event. */
export interface TradeLogEntry {
  id: string;
  ts: number;
  kind: "SIGNAL" | "ORDER" | "TRADE" | "BACKTEST" | "REPORT";
  symbol: string;
  type: string;
  direction: Direction | null;
  entry: number | null;
  stopLoss: number | null;
  takeProfits: number[] | null;
  riskLevel: RiskLevel | null;
  score: number | null;
  status: SignalStatus | null;
  outcome: "WIN" | "LOSS" | "BREAKEVEN" | "OPEN" | null;
  pnl: number | null;
  reason: string;
  meta?: Record<string, unknown>;
}

export interface BacktestTrade {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  direction: Direction;
  entry: number;
  stopLoss: number;
  takeProfits: number[];
  risk: number;
  /** tick index within the tested window */
  openIndex: number;
  closeIndex: number | null;
  exit: number | null;
  outcome: "WIN" | "LOSS" | "OPEN" | null;
  pnl: number;
  r: number;
  reason: string;
}

export interface BacktestReport {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  startTime: number;
  endTime: number;
  candlesTested: number;
  trades: BacktestTrade[];
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number;
  avgR: number;
  maxDrawdown: number;
  /** explicit statement: no-lookahead guarantee (computed on closed bars only) */
  noLookahead: boolean;
  createdAt: number;
}

export interface SignalReport {
  id: string;
  symbol: string;
  generatedAt: number;
  setups: number;
  activeSignals: number;
  waitingLimits: number;
  averageScore: number;
  buyCount: number;
  sellCount: number;
  topReasons: { reason: string; count: number }[];
}

export interface StrategyState {
  configId: string;
  updatedAt: number;
}
