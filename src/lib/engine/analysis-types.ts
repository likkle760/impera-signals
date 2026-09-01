import type {
  CandleSeries,
  Direction,
  MarketRegime,
  NoTradeReason,
  RiskLevel,
  SignalStatus,
  Timeframe
} from "../types";
import type { DisplacementAnalysis, InverseFVG } from "./strategy/types";
import type { OrderBlockAnalysis } from "./strategy/order-blocks";

export interface TrendAnalysis {
  regime: MarketRegime;
  strength: number;
  momentum: number;
  structure: string;
  volatilityScore: number;
  directionalBias: Direction | "NEUTRAL";
  shortTerm: MarketRegime;
  mediumTerm: MarketRegime;
  higherTimeframe: MarketRegime;
}

export interface Level {
  price: number;
  kind: string;
  strength: number;
}

export interface SupportResistance {
  supports: Level[];
  resistances: Level[];
  ranges: { lower: number; upper: number; strength: number }[];
  sessionHighLow: { high: number; low: number } | null;
  dayHighLow: { high: number; low: number } | null;
  weeklyHighLow: { high: number; low: number } | null;
  dailyOpen: number | null;
  weeklyOpen: number | null;
}

export interface LiquidityAnalysis {
  areas: Level[];
  equalHighs: number[];
  equalLows: number[];
  sweeps: { price: number; type: "HIGH" | "LOW"; time: number }[];
}

export interface IndicatorSnapshot {
  ema: Record<string, number>;
  rsi: number;
  macd: { macd: number; signal: number; histogram: number } | null;
  atr: number;
  adx: number;
  plusDI: number;
  minusDI: number;
  vwap: number | null;
  bollinger: { upper: number; middle: number; lower: number } | null;
  stochastic: number | null;
}

export interface MarketStructureAnalysis {
  structureType: string;
  lastHH: number | null;
  lastHL: number | null;
  lastLH: number | null;
  lastLL: number | null;
  bos: boolean;
  choch: boolean;
  consolidation: boolean;
}

/** A Fair Value Gap (imbalance) — a candle body leaving a gap it did not fill. */
export interface FairValueGap {
  /** upper boundary of the gap */
  upper: number;
  /** lower boundary of the gap */
  lower: number;
  /** "bullish" = discount zone below price (created by an up-move), "bearish" = premium zone above */
  type: "bullish" | "bearish";
  /** 0 = most recent */
  age: number;
  /** whether price has already filled the gap */
  filled: boolean;
  /** how many ATR wide the gap is */
  sizeAtr: number;
}

export interface FibonacciLevels {
  /** the swing leg the retracement was measured from */
  swingHigh: number | null;
  swingLow: number | null;
  /** key retracement levels of that swing */
  levels: Record<string, number>;
  /** 1 = price is at/above the 0.618 retracement (deep discount for a buy), 2 = 0.5, 3 = 0.382 */
  retracementDepth: number | null;
}

export interface InstrumentAnalysis {
  symbol: string;
  name: string;
  assetClass: string;
  timestamp: number;
  price: number;
  spread: number;
  atr: number;
  trend: TrendAnalysis;
  structure: MarketStructureAnalysis;
  supportResistance: SupportResistance;
  liquidity: LiquidityAnalysis;
  fvg: FairValueGap[];
  fib: FibonacciLevels;
  displacement: DisplacementAnalysis;
  ifvg: InverseFVG[];
  /** ICT/SMC order blocks + breaker blocks (demand/supply zones). Newer first. */
  orderBlocks?: OrderBlockAnalysis;
  indicators: Record<Timeframe, IndicatorSnapshot>;
  session: string;
  series: CandleSeries[];
  /** True when this instrument's data comes from a simulated/demo source, not live. */
  simulated?: boolean;
}

export interface Signal {
  id: string;
  symbol: string;
  name: string;
  assetClass: string;
  type: SignalType;
  direction: Direction;
  entry: number;
  entryZone: [number, number];
  stopLoss: number;
  takeProfits: [number, number, number];
  riskReward: number;
  confidence: number;
  riskLevel: RiskLevel;
  riskScore: number;
  timeframes: Timeframe[];
  trendLabel: MarketRegime;
  setupName: string;
  reason: string;
  status: SignalStatus;
  createdAt: number;
  updatedAt: number;
  session: string;
  score: number;
  /** Live backtest-derived win-rate estimate (historical probability, not a guarantee). */
  winRate?: number;
  winRateTrades?: number;
  /** Human-readable live verdict (win-rate + pending news) for the trader. */
  newsVerdict?: string;
  /** Honest strategy-validation note (e.g. "NOT VALIDATED FOR LIVE USE"). */
  validationNote?: string;
  /** Market-intelligence narrative (§17/§18): story, liquidity, bias, confirm/invalidate. */
  narrative?: {
    state: string;
    action: string;
    headline: string;
    story: string;
    confirm: string;
    invalidate: string | null;
    noTradeReason?: string | null;
    liquidity?: string | null;
  };
  /** Correlation / DXY note (§14/§15) attached to this signal. */
  correlationNote?: string | null;
  /** Institutional order-block entry details (zone + sweep/FVG evidence). */
  institutionalEntry?: {
    side: string;
    zone: string | null;
    reasons: string[];
  };
}

export type SignalType =
  | "MARKET BUY"
  | "MARKET SELL"
  | "BUY LIMIT"
  | "SELL LIMIT"
  | "SCALP BUY"
  | "SCALP SELL"
  | "DAY TRADE BUY"
  | "DAY TRADE SELL"
  | "SWING BUY"
  | "SWING SELL";

export interface FutureOpportunity {
  id: string;
  symbol: string;
  name: string;
  assetClass: string;
  direction: Direction;
  kind: string;
  watchZone: [number, number];
  stopLoss: number;
  takeProfits: [number, number, number];
  triggerConditions: string[];
  status: FutureStatus;
  confidence: number;
  riskLevel: RiskLevel;
  createdAt: number;
  updatedAt: number;
  reason: string;
}

export type FutureStatus =
  | "WAITING"
  | "APPROACHING"
  | "TRIGGERED"
  | "INVALIDATED"
  | "EXPIRED";

export interface ScannerRow {
  symbol: string;
  name: string;
  assetClass: string;
  price: number;
  trend: MarketRegime;
  trendStrength: number;
  setup: string | null;
  direction: Direction | null;
  signalScore: number | null;
  risk: RiskLevel | null;
  riskScore: number | null;
  rr: number | null;
  timeframes: Timeframe[];
  status: string | null;
  updatedAt: number;
  noTradeReason: NoTradeReason | null;
  /** True when this instrument's data comes from a simulated/demo source, not live. */
  simulated?: boolean;
}

export interface AnalysisSnapshot {
  timestamp: number;
  instruments: Record<string, InstrumentAnalysis>;
  signals: Signal[];
  futureOpportunities: FutureOpportunity[];
  scanner: ScannerRow[];
}
