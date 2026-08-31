export type AssetClass = "forex" | "metals" | "indices" | "futures" | "crypto" | "commodities";

export type Timeframe =
  | "1m"
  | "3m"
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "4h"
  | "1d";

export type MarketRegime =
  | "STRONG BULLISH"
  | "BULLISH"
  | "SLIGHTLY BULLISH"
  | "NEUTRAL"
  | "SLIGHTLY BEARISH"
  | "BEARISH"
  | "STRONG BEARISH";

export type StructureType =
  | "HIGHER HIGHS"
  | "LOWER LOWS"
  | "RANGE"
  | "BREAK OF STRUCTURE"
  | "CHANGE OF CHARACTER"
  | "PULLBACK"
  | "BREAKOUT"
  | "RETEST";

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

export type Direction = "BUY" | "SELL";

export type RiskLevel = "VERY LOW" | "LOW" | "MEDIUM" | "HIGH" | "VERY HIGH";

export type Session =
  | "ASIA"
  | "LONDON"
  | "NEW YORK"
  | "LONDON/NEW YORK OVERLAP"
  | "OFF HOURS";

export type SignalStatus =
  | "DETECTED"
  | "WAITING"
  | "APPROACHING"
  | "TRIGGERED"
  | "ACTIVE"
  | "TP1 HIT"
  | "TP2 HIT"
  | "TP3 HIT"
  | "SL HIT"
  | "INVALIDATED"
  | "EXPIRED"
  | "CANCELLED";

export type NoTradeReason =
  | "CONFLICTING TIMEFRAMES"
  | "EXCESSIVE VOLATILITY"
  | "POOR RISK/REWARD"
  | "WEAK STRUCTURE"
  | "LARGE SPREAD"
  | "LOW LIQUIDITY"
  | "CHOPPY MARKET"
  | "UPCOMING MAJOR EVENT"
  | "SETUP NOT CONFIRMED"
  | "COUNTER-TREND";

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Quote {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  spread: number;
  timestamp: number;
}

export interface Instrument {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  baseDecimals: number;
  pipSize: number;
  enabled: boolean;
  providerSymbol?: string;
}

export interface CandleSeries {
  timeframe: Timeframe;
  candles: Candle[];
}

export interface MarketStatus {
  open: boolean;
  label: string;
  timestamp: number;
}
