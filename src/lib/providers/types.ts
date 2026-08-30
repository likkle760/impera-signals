import type { Candle, CandleSeries, Instrument, MarketStatus, Quote, Timeframe } from "../types";

export interface MarketDataEventListener {
  onQuote?: (quote: Quote) => void;
  onCandle?: (symbol: string, timeframe: Timeframe, candle: Candle) => void;
  onStatus?: (status: MarketStatus) => void;
  onError?: (error: Error) => void;
}

export interface MarketDataProvider {
  readonly id: string;
  readonly label: string;
  readonly isLive: boolean;

  getSymbols(): Instrument[];
  getQuote(symbol: string): Quote | undefined;
  getHistoricalCandles(
    symbol: string,
    timeframe: Timeframe,
    limit: number
  ): Promise<Candle[]>;
  getCandleSeries(symbol: string): CandleSeries[];
  getMarketStatus(): MarketStatus;

  subscribe(listener: MarketDataEventListener): () => void;
  start(): Promise<void>;
  stop(): void;
}

export class ProviderError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "ProviderError";
  }
}

export function getProviderTimeoutSec(gapMs: number): number {
  return Math.max(10, Math.round(gapMs * 3));
}
